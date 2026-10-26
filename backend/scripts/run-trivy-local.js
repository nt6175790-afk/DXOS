// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { spawnSync } = require('node:child_process');
const { mkdirSync, copyFileSync, readFileSync, existsSync, rmSync, lstatSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const root = resolve(__dirname, '../..');
const context = resolve(root, 'outputs/security-scan-context');
const artifacts = resolve(root, 'security-artifacts');
// Rebuild only this disposable, fixed scan directory so removed files cannot linger.
if (context !== resolve(root, 'outputs', 'security-scan-context')) throw new Error('Unexpected scan context');
if (existsSync(context) && lstatSync(context).isSymbolicLink()) throw new Error('Linked scan context refused');
rmSync(context, { recursive: true, force: true });
mkdirSync(context, { recursive: true }); mkdirSync(artifacts, { recursive: true });
const inventory = spawnSync('git', ['--git-dir=.git', '--work-tree=.', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
if (inventory.status !== 0) throw new Error('Git inventory unavailable');
for (const file of inventory.stdout.split('\0').filter(Boolean)) {
  if (!/^(backend\/|frontend\/|database\/|\.github\/|package(?:-lock)?\.json$|\.dockerignore$)/.test(file) ||
      /(^|\/)(node_modules|dist|coverage|\.secrets)(\/|$)/.test(file) || /(^|\/)\.env(?:\.|$)/.test(file) || /\.log$/.test(file)) continue;
  if (!existsSync(join(root,file))) continue;
  mkdirSync(dirname(join(context,file)),{recursive:true}); copyFileSync(join(root,file),join(context,file));
}
const common = ['run','--rm','-v','dxos-security_trivy_cache:/cache','-v',artifacts+':/out'];
const image = 'aquasec/trivy:0.76.0'; let failed = false;
for (const [name,args] of [
  ['filesystem',[...common,'-v',context+':/work:ro','-w','/work',image,'fs','--scanners','vuln,misconfig','--cache-dir','/cache','--timeout','10m','--format','json','--output','/out/trivy-filesystem.json','--severity','HIGH,CRITICAL','--exit-code','1','.']],
  ['backend',[...common,'-v','/var/run/docker.sock:/var/run/docker.sock:ro',image,'image','--cache-dir','/cache','--timeout','10m','--format','json','--output','/out/trivy-backend.json','--severity','HIGH,CRITICAL','--exit-code','1','dxos-security-backend']],
  ['frontend',[...common,'-v','/var/run/docker.sock:/var/run/docker.sock:ro',image,'image','--cache-dir','/cache','--timeout','10m','--format','json','--output','/out/trivy-frontend.json','--severity','HIGH,CRITICAL','--exit-code','1','dxos-security-frontend']],
]) {
  console.log('Trivy scan starting:', name);
  const file = resolve(artifacts,'trivy-'+name+'.json');
  rmSync(file, { force: true });
  const result = spawnSync('docker',args,{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
  if (existsSync(file)) {
    const report=JSON.parse(readFileSync(file,'utf8'));const counts={high:0,critical:0,misconfigurations:0};
    for(const entry of report.Results??[]){for(const issue of entry.Vulnerabilities??[]){if(issue.Severity==='HIGH')counts.high++;if(issue.Severity==='CRITICAL')counts.critical++;}
      counts.misconfigurations+=(entry.Misconfigurations??[]).filter(i=>i.Status==='FAIL').length;}
    console.log(name,JSON.stringify(counts),'exit',result.status);
  } else { console.log(name,'NOT EXECUTED: scanner/image/download failure',result.status); failed=true; }
  if(result.status!==0)failed=true;
}
if(failed)process.exitCode=1;
