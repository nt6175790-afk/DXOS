// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const { expected, validateDelta, validateBuild } = require('./review-adguard-remediation');
function mod() { return 'module github.com/AdguardTeam/AdGuardHome\ngo 1.26.10\nrequire (\n' + Object.entries(expected).map(([p,v])=>`\t${p} ${v}`).join('\n')+'\n)\n'; }
function fixture() {
  const Packages = [{ Name:'github.com/AdguardTeam/AdGuardHome' },{ Name:'stdlib',Version:'v1.26.10' },...Object.entries(expected).filter(([name])=>name!=='golang.org/x/term').map(([Name,Version])=>({Name,Version}))].map(p=>({...p,Identifier:{PURL:'pkg:golang/'+p.Name+'@'+(p.Version||'devel')}}));
  return { scan:{SchemaVersion:2,Results:[{Type:'gobinary',Packages}]},sbom:{bomFormat:'CycloneDX',components:Packages.map(p=>({purl:p.Identifier.PURL}))},imports:'github.com/AdguardTeam/AdGuardHome\nnet/http\n' };
}
test('accepts exactly the approved compatible dependency family',()=>{validateDelta(mod().replace('go 1.26.10','go 1.26.6'),mod());});
test('rejects unrelated module additions and removals',()=>{
  assert.throws(()=>validateDelta(mod(),mod()+'example.test/unapproved v1.0.0\n'),/UNAPPROVED_DEPENDENCY_CHANGE/);
  assert.throws(()=>validateDelta(mod()+'example.test/existing v1.0.0\n',mod()),/UNAPPROVED_DEPENDENCY_CHANGE/);
});
test('rejects unpatched Go and dependency versions in source',()=>{
  assert.throws(()=>validateDelta(mod(),mod().replace('1.26.10','1.26.6')),/UNEXPECTED_GO_DIRECTIVE/);
  assert.throws(()=>validateDelta(mod(),mod().replace('v0.57.0','v0.54.0')),/UNAPPROVED_DEPENDENCY_CHANGE|MISSING_PATCHED_DEPENDENCY/);
});
test('requires patched versions in actual scanned binary, not just source manifest',()=>{
  const {scan,sbom,imports}=fixture(); assert.equal(validateBuild(scan,sbom,imports).status,'PASS');
  scan.Results[0].Packages.find(p=>p.Name==='stdlib').Version='v1.26.6';
  assert.throws(()=>validateBuild(scan,sbom,imports),/UNEXPECTED_BINARY_TOOLCHAIN/);
});
test('keeps UNKNOWN visible and rejects unsafe package imports without suppressions',()=>{
  const {scan,sbom,imports}=fixture();scan.Results[0].Vulnerabilities=[{VulnerabilityID:'GO-2026-5932',Severity:'UNKNOWN',PkgName:'golang.org/x/crypto'}];
  assert.equal(validateBuild(scan,sbom,imports).counts.UNKNOWN,1);
  assert.throws(()=>validateBuild(scan,sbom,imports+'golang.org/x/crypto/openpgp/packet\n'),/UNSAFE_OPENPGP_IS_LINKED/);
});
test('HIGH still fails rebuilt candidate gate',()=>{
  const {scan,sbom,imports}=fixture();scan.Results[0].Vulnerabilities=[{VulnerabilityID:'TEST-HIGH',Severity:'HIGH',PkgName:'stdlib'}];
  assert.equal(validateBuild(scan,sbom,imports).status,'FAIL');
});
