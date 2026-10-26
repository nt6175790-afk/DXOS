# Third-party notices for DX-OS

DX-OS original code is licensed under Apache-2.0 by its contributors. This does
not relicense any dependency, font, icon, upstream image, or externally authored
document. Preserve the upstream notices when redistributing their components.

## npm packages

- [Inventory and per-package legal texts](licenses/NPM-NOTICES.md)
- [Machine-readable inventory](licenses/npm-inventory.json)
- [Downloaded evidence: URL, version/ref, SHA-256](licenses/upstream-evidence.json)

The lockfiles contain 1,046 package entries across backend and frontend. These
include development tools and optional packages for platforms other than Windows.
An SPDX metadata check is not a substitute for preserving actual copyright and
license texts. Missing evidence is explicitly listed, never treated as approval.

Recollect notices for the platform and dependency tree actually shipped:

```powershell
node backend/scripts/audit-licenses.js --strict
node backend/scripts/collect-license-notices.js --fetch-missing
node backend/scripts/collect-license-notices.js --strict
```

The last command intentionally fails if an installed package has no collected
legal text. Do not bundle node_modules or publish a binary release while that
release's notices/source obligations remain unresolved. A source-only release
must exclude node_modules, private envs, database dumps, and local backups.

## Infrastructure and external tools

| Component | Upstream license / evidence | Distribution boundary |
| --- | --- | --- |
| Keycloak 26.8.1 | [Apache-2.0](licenses/infrastructure/keycloak.txt) | Separate IdP image; bundled dependencies have their own notices |
| Amazon Corretto OpenJDK 21 | [GPL-2.0 with Classpath Exception](https://github.com/corretto/corretto-21/blob/21.0.13.0.10/LICENSE) and [additional notices](https://github.com/corretto/corretto-21/blob/21.0.13.0.10/ADDITIONAL_LICENSE_INFO) | Patched Java runtime for the Keycloak image; vendor legal notices remain bundled in that image |
| Apache APISIX 3.19.0 | [LICENSE](licenses/infrastructure/apisix.txt), [NOTICE](licenses/infrastructure/apisix-notice.txt) | Preserve upstream notices and bundled-component terms |
| OpenBao 2.7.1 | [MPL-2.0](licenses/infrastructure/openbao.txt) | File-level source obligations must be assessed if redistributing modified covered software |
| Valkey 9.1.2 | [BSD-3-Clause](licenses/infrastructure/valkey.txt) | Separate server; preserve upstream notices |
| ClamAV 1.4.4 | [GPL text](licenses/infrastructure/clamav.txt), [matching source](https://github.com/Cisco-Talos/clamav/tree/clamav-1.4.4) | Separate INSTREAM service; binary redistribution requires corresponding-source/bundled-license review |
| Node.js container 22.23.3 / local tooling 22.21.1 | [Container notices](licenses/infrastructure/node.txt), [local tooling notices](licenses/infrastructure/node-local.txt) | Versions were checked separately; recheck actual runtime in the release image |
| Trivy 0.69.3 | [Apache-2.0](licenses/infrastructure/trivy.txt) | Development/security tool; not DX-OS business runtime |
| Coraza/CRS/Caddy WAF | [image source](https://github.com/coreruleset/coraza-crs-docker), [Coraza](https://github.com/corazawaf/coraza), [CRS](https://github.com/coreruleset/coreruleset), [Caddy](https://github.com/caddyserver/caddy) | Multi-component image; its Apache-2.0 OCI label is not an audit of every bundled dependency |
| MySQL 8.0.44 | [Community license information](https://www.mysql.com/about/legal/licensing/opensource-license.html) | Existing external database; not included in DX-OS source. Review terms if bundling the server |
| Alpine / Nginx and image OS packages | [Alpine package information](https://pkgs.alpinelinux.org/packages), [Nginx license](https://nginx.org/LICENSE) | OS/package licenses vary; top-level image labels do not settle binary redistribution |

Collected upstream texts have source URLs and SHA-256 in
[infrastructure/inventory.json](licenses/infrastructure/inventory.json).
Compose references images; it does not include those binaries in a source release.
An archive containing Docker images, runtimes, or node_modules has a different
distribution scope and needs its own complete bill of materials and notices.

## Fonts, icons, and assets

- Inter Variable 4.1: self-hosted unmodified at `frontend/public/fonts/InterVariable.woff2`.
  Preserve [SIL OFL 1.1](licenses/infrastructure/inter.txt) and reserved-name conditions.
  [Source and SHA-256](licenses/font-provenance.json). No Google Fonts request is needed.
- Lucide icons: retain Lucide ISC and inherited Feather MIT notices; the collected
  `lucide-react` LICENSE is linked in the npm inventory.
- DX-OS SVG favicon: original project artwork under Apache-2.0. The default Vite
  favicon has been removed from project assets and replaced with this original SVG.
- Existing screenshots document DX-OS; they may show personal data and are not
  cleared for public redistribution by this license. Externally supplied Word/PDF
  templates, logos, or photos are excluded from the DX-OS license unless their
  rights holders have separately authorized use.

No trademark endorsement, third-party ownership transfer, or rights to credentials
and personal data are granted. This inventory records evidence and remaining
checks; it is not a certification of compliance for arbitrary future bundles.

## Selected OSS stack, 15 October 2026

Sonar/SonarJS is removed from Compose/CI. ESLint, typescript-eslint, Jest, Vitest, npm audit and Trivy provide the selected OSS gate; no Sonar feature parity implied. Old private Sonar volumes remain for recovery.

Windows evidence covers 936/936 installed entries. Twelve lack standalone upstream LICENSE files; unchanged publisher SPDX metadata/source headers and canonical terms are explicitly recorded in licenses/reviewed-declarations.json. No upstream file or copyright holder was invented. Another 110 optional lock entries need evidence on the shipped platform.

ClamAV is built without clamav-libunrar; RAR scanning is unsupported. OpenBao 2.7.1+dxos.1 uses source commit a5db72cef75c24b920ade02065b18dd8eb666bac with the x/net patch in backend/deploy/openbao.Dockerfile. Matching go.mod/go.sum accompany the MPL text in licenses/infrastructure/. Covered sources: https://github.com/openbao/openbao/tree/a5db72cef75c24b920ade02065b18dd8eb666bac . Supply matching sources and build recipe when distributing modified binaries. WAF uses Caddy 2.11.7/Coraza-caddy 2.6.2 and x/net 0.60.0. Image CycloneDX inventories record bundled components.

The OSS selection concerns the project toolchain, not Windows, Docker Desktop or optional hosted AI. Scans are not legal certification.
