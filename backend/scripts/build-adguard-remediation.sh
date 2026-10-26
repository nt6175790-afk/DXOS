#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
# Isolated Linux runner only. No service installation or host DNS changes.
set -euo pipefail
project_root="$(pwd)"
source_dir="$project_root/security-artifacts/adguard-remediation/source"
output_dir="$project_root/security-artifacts/adguard-remediation/output"
reports="$output_dir/reports"
mkdir -p "$reports" "$output_dir/tools"
cd "$source_dir"
test "$(git rev-parse HEAD)" = '05ba17b282da1c4393d6a4ba4db0cf519194a362'
test "$(go env GOVERSION)" = 'go1.26.10'
export GOTOOLCHAIN=local GOTELEMETRY=off CGO_ENABLED=0
export GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org
cp go.mod go.mod.original
go mod edit -go=1.26.10
go get github.com/insomniacslk/dhcp@v0.0.0-20260719225207-c76316d4aa82 golang.org/x/crypto@v0.57.0 golang.org/x/net@v0.60.0 golang.org/x/text@v0.42.0
git diff -- go.mod go.sum > "$reports/dependency.patch"
node "$project_root/backend/scripts/review-adguard-remediation.js" delta "$source_dir"
go mod verify
git diff --exit-code -- . ':!go.mod' ':!go.sum'
git diff -- go.mod go.sum > "$reports/dependency.patch"
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
  'https://github.com/AdguardTeam/AdGuardHome/releases/download/v0.107.79/AdGuardHome_frontend.tar.gz' -o "$output_dir/frontend.tar.gz"
echo "30184c157d4aefe5371b575a43c0ab5a7314aef039a820cc421ea67bab994ce8  $output_dir/frontend.tar.gz" | sha256sum --check --status
while IFS= read -r entry; do
  case "$entry" in ./build/|./build/*|build/|build/*) ;; *) echo 'UNEXPECTED_FRONTEND_ARCHIVE_PATH'; exit 2 ;; esac
  case "/$entry/" in */../*) echo 'UNSAFE_FRONTEND_ARCHIVE_PATH'; exit 2 ;; esac
done < <(tar -tzf "$output_dir/frontend.tar.gz")
tar --no-same-owner --no-same-permissions -xzf "$output_dir/frontend.tar.gz" -C "$source_dir"
test -s build/static/index.html
test -s build/static/login.html
test -s build/static/install.html
test_exit=0
go test -mod=readonly -json -count=1 -timeout=5m ./... > "$output_dir/go-tests.private.jsonl" || test_exit=$?
node - "$output_dir/go-tests.private.jsonl" "$reports/go-tests.json" <<'NODE'
const fs=require('node:fs');
const lines=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const passes=lines.filter(x=>x.Action==='pass'),fails=lines.filter(x=>x.Action==='fail');
const status=passes.length&&!fails.length?'PASS':'FAIL';
fs.writeFileSync(process.argv[3],JSON.stringify({status,tests:passes.filter(x=>x.Test).length,packages:passes.filter(x=>!x.Test).length,failures:fails.map(x=>({package:x.Package,test:x.Test||null})),scope:'go test ./... on patched source; upstream test output not published'},null,2)+'\n');
if(status!=='PASS')throw Error('UPSTREAM_TESTS_INCOMPLETE');
NODE
test "$test_exit" = '0'
epoch="$(git show -s --format=%ct HEAD)"
version_pkg='github.com/AdguardTeam/AdGuardHome/internal/version'
flags="-X ${version_pkg}.version=v0.107.79-dxos.1 -X ${version_pkg}.channel=candidate -X ${version_pkg}.committime=${epoch}"
go build -mod=readonly -trimpath -buildvcs=false -ldflags "$flags" -o "$output_dir/AdGuardHome" .
go build -mod=readonly -trimpath -buildvcs=false -ldflags "$flags" -o "$output_dir/AdGuardHome-second" .
cmp "$output_dir/AdGuardHome" "$output_dir/AdGuardHome-second"
"$output_dir/AdGuardHome" --version | tee "$reports/version.txt"
grep -F 'v0.107.79-dxos.1' "$reports/version.txt"
go list -mod=readonly -deps . > "$reports/production-imports.txt"
go tool nm "$output_dir/AdGuardHome" > /dev/null
go tool govulncheck -mode=binary "$output_dir/AdGuardHome" > "$reports/govulncheck.txt"
go tool govulncheck . > "$reports/govulncheck-source.txt"
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
  'https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_Linux-64bit.tar.gz' -o "$output_dir/trivy.tar.gz"
echo "e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7  $output_dir/trivy.tar.gz" | sha256sum --check --status
tar -xzf "$output_dir/trivy.tar.gz" -C "$output_dir/tools" trivy
printf '{}\n' > "$output_dir/trivy.yaml"
printf '' > "$output_dir/empty.ignore"
scanner="$output_dir/tools/trivy"
trivy_safe() { env -i PATH="$PATH" HOME="$HOME" "$scanner" "$@"; }
common=(rootfs --config "$output_dir/trivy.yaml" --ignorefile "$output_dir/empty.ignore" --cache-dir "$output_dir/trivy-cache" --timeout 10m --skip-version-check --no-progress)
trivy_safe "${common[@]}" --scanners vuln --list-all-pkgs --format json --output "$reports/scan.json" --exit-code 0 "$output_dir/AdGuardHome"
trivy_safe "${common[@]}" --format cyclonedx --output "$reports/sbom.cdx.json" "$output_dir/AdGuardHome"
trivy_safe version --cache-dir "$output_dir/trivy-cache" --format json > "$reports/scanner.json"
node - "$source_dir" "$output_dir" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const output=process.argv[3];
const binarySha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,'AdGuardHome'))).digest('hex');
const provenance={upstream:'05ba17b282da1c4393d6a4ba4db0cf519194a362',version:'v0.107.79-dxos.1',platform:'linux/amd64',go:'go1.26.10',reproducible:true,reproducibilityScope:'Two builds on the same isolated runner; symbol table retained for binary vulnerability analysis',binarySha256,dxosHead:process.env.DXOS_HEAD_SHA,workflowRevision:process.env.GITHUB_SHA,runUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,frontendSha256:'30184c157d4aefe5371b575a43c0ab5a7314aef039a820cc421ea67bab994ce8',signature:'NOT_UPSTREAM_SIGNED'};
fs.writeFileSync(path.join(output,'reports/build.json'),JSON.stringify(provenance,null,2)+'\n');
NODE
node "$project_root/backend/scripts/review-adguard-remediation.js" review "$reports"

# Only after all checks pass, prepare a distribution WITH corresponding source.
# Keep the upstream GPL, vendored dependency notices and stdlib source intact.
go mod vendor
cp "$project_root/backend/scripts/build-adguard-remediation.sh" ./DXOS-BUILD-RECIPE.sh
cp "$project_root/backend/scripts/review-adguard-remediation.js" ./DXOS-REVIEW-RECIPE.js
cp "$project_root/backend/scripts/check-adguard-artifact.js" ./check-adguard-artifact.js
printf '%s\n' 'Modified by DX-OS on 2026-10-21: dependency/toolchain updates only. See dependency.patch. Version v0.107.79-dxos.1; not an official AdGuard release or signature. GPL v3 and third-party notices remain applicable. No production approval is implied.' > DXOS-CHANGES.txt
cp "$reports/dependency.patch" ./dependency.patch
mkdir -p .dxos-go-stdlib
cp -R "$(go env GOROOT)/src" .dxos-go-stdlib/src
cp "$(go env GOROOT)/LICENSE" .dxos-go-stdlib/LICENSE
cat > DXOS-REBUILD.txt <<EOF
Corresponding source for v0.107.79-dxos.1 (Linux amd64).
Upstream commit: 05ba17b282da1c4393d6a4ba4db0cf519194a362.
Use official Go 1.26.10 Linux amd64 SDK SHA-256:
ccfe7ae822d2c2f41f4fe7c956199967a4dac22d0ee0d2b2bfdb440aab3b20c5.
The patched modules, vendor sources, original frontend asset and client sources
are included. Standard library source/LICENSE is in .dxos-go-stdlib.
The original CI build recipe, review recipe and dependency.patch are included.
To rebuild the already patched source in this directory:
  GOTOOLCHAIN=local CGO_ENABLED=0 go test -mod=vendor ./...
  GOTOOLCHAIN=local CGO_ENABLED=0 go build -mod=vendor -trimpath -buildvcs=false -ldflags '$flags' -o AdGuardHome .
Do not install a service or change host DNS to run --version.
This is an unsigned DX-OS candidate, not an official AdGuard release.
License/distribution review and network/tenant/operations gates remain separate.
EOF
mkdir -p "$output_dir/published"
tar --exclude=.git --sort=name --mtime="@$epoch" --owner=0 --group=0 -czf "$output_dir/published/AdGuardHome-v0.107.79-dxos.1-corresponding-source.tar.gz" .
cp "$output_dir/AdGuardHome" LICENSE.txt DXOS-CHANGES.txt "$output_dir/published/"
cp -R "$reports" "$output_dir/published/reports"
cp "$output_dir/frontend.tar.gz" "$output_dir/published/AdGuardHome_frontend-v0.107.79.tar.gz"
cd "$output_dir/published"
sha256sum AdGuardHome LICENSE.txt DXOS-CHANGES.txt *.tar.gz reports/* > SHA256SUMS.txt
echo 'AdGuard dependency remediation: PASS; artifact is a separate unsigned candidate, not a production rollout.'
