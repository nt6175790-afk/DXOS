// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Tests the existing demo identity through WAF -> APISIX -> backend. Never logs tokens/passwords.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const root = resolve(__dirname,'../..'); const base='http://localhost:8088';
let phase='initial';
async function main() {
  const account=JSON.parse(readFileSync(resolve(root,'.secrets/demo-sso-account.json'),'utf8'));let checks=0;
  phase='startup-readiness'; let ready=false;
  for(let attempt=0;attempt<20;attempt++) {
    try { if((await fetch(base+'/api/v1/health',{signal:AbortSignal.timeout(1500)})).status===200){ready=true;break;} } catch { /* Bounded startup retry, never suppress a failed assertion. */ }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw new Error('Gateway/backend not ready');
  for(const [path,status]of [['/',200],['/api/v1/health',200],['/api/v1/auth/me',401],['/api/v1/auth/sso/logout-url',401],
    ['/?id=1%20OR%201%3D1%20--',403],['/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E',403],['/api/v1/health?file=../../../../etc/passwd',403]]) {
    phase=path; assert.equal((await fetch(base+path)).status,status);checks++;
  }
  const config=await(await fetch(base+'/api/v1/auth/sso/config')).json();assert.equal(config.enabled,true);checks++;
  const post=(path,body)=>fetch(base+'/api/v1/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  // The issuer-only SSRF exception must not exempt code or privilege injection.
  const fixture = { code:'fixture', state:'a'.repeat(43), challenge:'b'.repeat(64) };
  for (const [body,status] of [
    [{...fixture,iss:'https://foreign.example'},401],
    [{...fixture,code:'http://127.0.0.1/private',iss:'http://localhost:8180/realms/dxos'},403],
    [{...fixture,iss:'http://localhost:8180/realms/dxos',roles:['admin']},400],
  ]) { phase='sso-waf-scope'; assert.equal((await post('auth/sso/complete',body)).status,status);checks++; }
  phase='sso-start'; const startResponse=await post('auth/sso/start',{});assert.equal(startResponse.status,200);const start=await startResponse.json();checks++;
  const cookies=new Map();const absorb=r=>{for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}};
  const login=await fetch(start.authorizationUrl,{redirect:'manual'});absorb(login);
  const html=await login.text();const action=/<form\b[^>]*\baction="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g,'&');
  if(!action||new URL(action).origin!=='http://localhost:8180')throw new Error('Unexpected login form');
  const idp=await fetch(action,{method:'POST',redirect:'manual',headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},
    body:new URLSearchParams({username:account.username,password:account.password,credentialId:''})});
  assert.equal(idp.status,302);absorb(idp);const callback=new URL(idp.headers.get('location'));assert.equal(callback.origin,base);checks++;
  const input={code:callback.searchParams.get('code'),state:start.state,challenge:start.challenge,iss:callback.searchParams.get('iss')};
  phase='sso-complete'; const complete=await post('auth/sso/complete',input);assert.equal(complete.status,200);const tokens=await complete.json();checks++;
  const headers={Authorization:'Bearer '+tokens.accessToken};
  const me=await fetch(base+'/api/v1/auth/me',{headers});assert.equal(me.status,200);assert.equal((await me.json()).email,account.email);checks++;
  assert.equal((await fetch(base+'/api/v1/organizations',{headers})).status,200);checks++;
  assert.equal((await fetch(base+'/api/v1/organizations/'+randomUUID()+'/roles',{headers})).status,403);checks++;
  assert.equal((await post('auth/sso/complete',input)).status,401);checks++;
  phase='trusted-logout-url';
  const discovered=await fetch(base+'/api/v1/auth/sso/logout-url?redirect=https://example.test/foreign',{headers});assert.equal(discovered.status,200);
  const logoutUrl=new URL((await discovered.json()).logoutUrl);
  assert.equal(logoutUrl.origin,'http://localhost:8180');assert.equal(logoutUrl.searchParams.get('post_logout_redirect_uri'),base+'/login');
  assert.equal(logoutUrl.searchParams.has('id_token_hint'),false);checks++;
  assert.equal((await fetch(base+'/api/v1/auth/logout',{method:'POST',headers})).status,204);checks++;
  assert.equal((await fetch(base+'/api/v1/auth/me',{headers})).status,401);checks++;
  phase='idp-global-logout';
  const cookieHeader=()=>[...cookies].map(([k,v])=>k+'='+v).join('; ');
  let ended=await fetch(logoutUrl,{headers:{Cookie:cookieHeader()},redirect:'manual'});absorb(ended);
  if(ended.status===200){
    const page=await ended.text();const target=/<form\b[^>]*\baction="([^"]+)"/.exec(page)?.[1]?.replace(/&amp;/g,'&');
    if(!target||new URL(target, logoutUrl).origin!=='http://localhost:8180')throw new Error('Unexpected logout confirmation');
    const fields=new URLSearchParams();
    for(const match of page.matchAll(/<input\b[^>]*>/g)){
      const name=/\bname="([^"]+)"/.exec(match[0])?.[1],value=/\bvalue="([^"]*)"/.exec(match[0])?.[1];
      if(name&&value!==undefined)fields.set(name,value.replace(/&amp;/g,'&'));
    }
    fields.set('confirmLogout','yes');
    ended=await fetch(new URL(target, logoutUrl),{method:'POST',body:fields,headers:{Cookie:cookieHeader(),Origin:'http://localhost:8180'},redirect:'manual'});absorb(ended);
  }
  assert.equal(ended.status,302);assert.equal(new URL(ended.headers.get('location')).href,base+'/login');checks++;
  const silent=new URL(start.authorizationUrl);silent.searchParams.set('prompt','none');
  const result=await fetch(silent,{headers:{Cookie:cookieHeader()},redirect:'manual'});assert.equal(result.status,302);
  assert.equal(new URL(result.headers.get('location')).searchParams.get('error'),'login_required');checks++;
  writeFileSync(resolve(root,'security-artifacts/edge-live.json'),JSON.stringify({status:'PASS',checks,base},null,2));
  console.log('LIVE Coraza/APISIX/SSO/session/tenant isolation:',checks,'checks PASS.');
}
main().catch(error=>{console.error('Live edge verification failed:',phase,error.name,error instanceof assert.AssertionError&&typeof error.actual==='number'?'HTTP '+error.actual:'');process.exitCode=1;});
