// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// One-time, compare-and-set publication of existing local credentials to dedicated OpenBao.
// Does not rotate credentials, change database grants, or print secret values.
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const address = require('./openbao-local-context')(__filename);
let stage = 'local-configuration';
async function main() {
  if (!address.startsWith('https:')) throw new Error('TLS required');
  for (const file of ['.env', 'backend/.env']) { const path = resolve(root,file); if (existsSync(path)) process.loadEnvFile(path); }
  const bootstrap = JSON.parse(readFileSync(resolve(root, '.secrets/openbao-bootstrap.json'), 'utf8'));
  const keys = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'AI_API_KEY', 'SSO_CLIENT_SECRET'];
  const native = Object.fromEntries(keys.filter(key => process.env[key]).map(key=>[key,process.env[key]]));
  if (!native.DATABASE_URL || !native.JWT_ACCESS_SECRET) throw new Error();
  const database = new URL(native.DATABASE_URL);
  if (!['localhost','127.0.0.1'].includes(database.hostname)) throw new Error(); database.hostname='host.docker.internal';
  const container = { ...native, DATABASE_URL: database.href, REDIS_URL: 'redis://redis:6379' };
  const call = async (path, method='GET', body) => fetch(address+'/v1/'+path, { method, redirect:'error', signal:AbortSignal.timeout(10000),
    headers:{'X-Vault-Token':bootstrap.root_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}) });
  stage = 'audit-list';
  const audits = await call('sys/audit'); if (!audits.ok) throw new Error('HTTP '+audits.status);
  const auditBody = await audits.json();
  if (!(auditBody.data ?? auditBody)['file/']) {
    // OpenBao >=2.4 deliberately forbids API-created audit devices; use server HCL.
    stage = 'declarative-audit-not-active'; throw new Error();
  }
  for (const [name,data] of [['dxos',native],['dxos-container',container]]) {
    stage = 'secret-compare-or-create-'+name;
    const current = await call('secret/data/'+name);
    if (current.ok) {
      const existing = (await current.json()).data.data;
      if (JSON.stringify(Object.entries(existing).sort()) !== JSON.stringify(Object.entries(data).sort())) throw new Error('Existing secret differs; operator review required');
    } else {
      if (current.status !== 404) throw new Error('HTTP '+current.status);
      const created = await call('secret/data/'+name,'POST',{options:{cas:0},data});
      if (!created.ok) throw new Error('HTTP '+created.status);
    }
  }
  // Container now receives credentials only from OpenBao at startup.
  const envPath = resolve(root,'.security.backend.env');
  stage = 'private-env-update';
  const source = readFileSync(envPath,'utf8').split(/\r?\n/).filter(line=>!keys.some(key=>line.startsWith(key+'=')));
  writeFileSync(envPath,source.join('\n').trimEnd()+'\n');
  console.log('Existing local secrets published with CAS and HMAC audit; container env secrets removed. No credentials rotated or printed.');
}
main().catch(error=>{console.error('OpenBao secret publication blocked at',stage,error.code??(/^HTTP \d+$/.test(error.message)?error.message:error.name));process.exitCode=1;});
