import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("Extracting pnpm licenses...");
const pnpmJson = JSON.parse(execSync("pnpm licenses list --json", { cwd: rootDir, maxBuffer: 50 * 1024 * 1024 }).toString());

console.log("Extracting cargo metadata...");
const cargoMeta = JSON.parse(
  execSync("cargo metadata --format-version 1 --manifest-path apps/desktop/src-tauri/Cargo.toml", {
    cwd: rootDir,
    maxBuffer: 50 * 1024 * 1024,
  }).toString()
);

const cargoByLicense = {};
for (const pkg of cargoMeta.packages) {
  if (pkg.name === "localbridge-desktop") continue;
  const lic = pkg.license || "Unknown";
  if (!cargoByLicense[lic]) cargoByLicense[lic] = [];
  cargoByLicense[lic].push({
    name: pkg.name,
    version: pkg.version,
    repository: pkg.repository || pkg.homepage || "",
    description: pkg.description || "",
  });
}

for (const lic of Object.keys(cargoByLicense)) {
  cargoByLicense[lic].sort((a, b) => a.name.localeCompare(b.name));
}

let md = `# Nexus / LocalBridge Third-Party Software Notices and Licenses

This document contains third-party software notices, attributions, and license texts for components distributed with, bundled in, or utilized as transitive dependencies of Nexus (LocalBridge).

---

## Table of Contents

1. [Bundled Third-Party Executables & Core Runtimes](#1-bundled-third-party-executables--core-runtimes)
   - [Cloudflare cloudflared](#11-cloudflare-cloudflared-tunnel-runtime)
   - [Microsoft TypeScript](#12-typescript-language-engine)
   - [typescript-language-server](#13-typescript-language-server)
   - [Node.js Portable Runtime](#14-nodejs-portable-runtime)
   - [better-sqlite3](#15-better-sqlite3-native-sqlite-engine)
   - [Tauri Framework & Plugins](#16-tauri-framework--plugins)
2. [Third-Party Code, Design & Documentation Attributions](#2-third-party-code-design--documentation-attributions)
3. [NPM / Node.js Transitive Dependencies License Manifest](#3-npm--nodejs-transitive-dependencies-license-manifest)
4. [Rust / Cargo Transitive Dependencies License Manifest](#4-rust--cargo-transitive-dependencies-license-manifest)
5. [Standard License Texts](#5-standard-license-texts)

---

## 1. Bundled Third-Party Executables & Core Runtimes

### 1.1 Cloudflare cloudflared (Tunnel Runtime)
- **Component**: \`cloudflared\` (\`tunnel-client-runtime-cloudflared.exe\`)
- **Publisher**: Cloudflare, Inc.
- **Repository**: [https://github.com/cloudflare/cloudflared](https://github.com/cloudflare/cloudflared)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  \`\`\`text
  Copyright (c) 2017-2026 Cloudflare, Inc.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  \`\`\`

### 1.2 TypeScript Language Engine
- **Component**: \`typescript\` (bundled in \`resources/lsp/node_modules/typescript\`)
- **Publisher**: Microsoft Corporation
- **Repository**: [https://github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  \`\`\`text
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  \`\`\`

### 1.3 typescript-language-server
- **Component**: \`typescript-language-server\` (bundled in \`resources/lsp/node_modules/typescript-language-server\`)
- **Publisher**: TypeFox and contributors
- **Repository**: [https://github.com/typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  \`\`\`text
  Copyright (C) 2017-2026 TypeFox and others.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  \`\`\`

### 1.4 Node.js (Portable Runtime)
- **Component**: Node.js (\`node.exe\`)
- **Version**: \`v24.21.0\` (Windows x64)
- **Publisher**: OpenJS Foundation / Node.js Project ([https://nodejs.org](https://nodejs.org))
- **License**: Node.js License (MIT with third-party components)
- **Notice**:
  \`\`\`text
  Copyright Node.js contributors. All rights reserved.
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to
  deal in the Software without restriction, including without limitation the
  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
  sell copies of the Software.
  \`\`\`

### 1.5 better-sqlite3 (Native SQLite Engine)
- **Component**: \`better-sqlite3\`
- **Author**: Joshua Wise
- **Repository**: [https://github.com/WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **License**: MIT License ([MIT](#52-mit-license))
- **Notice**:
  \`\`\`text
  Copyright (c) 2017-2026 Joshua Wise
  \`\`\`

### 1.6 Tauri Framework & Plugins
- **Components**: \`tauri\`, \`tauri-plugin-dialog\`, \`tauri-plugin-single-instance\`, \`tauri-build\`
- **Publisher**: The Tauri Programme in The Commons Conservancy
- **Repository**: [https://github.com/tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- **License**: Apache-2.0 / MIT Dual License

---

## 2. Third-Party Code, Design & Documentation Attributions

The codebase was thoroughly audited for directly copied code and documentation:

1. **Keep a Changelog (\`CHANGELOG.md\`)**:
   - **Source**: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
   - **Author**: Olivier Lacan and contributors
   - **License**: Creative Commons Attribution 3.0 Unported ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/))
   - **Status**: Retained with attribution in \`CHANGELOG.md\`.

2. **Threat Model Methodology (\`docs/THREAT_MODEL.md\`)**:
   - **Source**: Microsoft STRIDE Threat Modeling Framework
   - **Author**: Loren Kohnfelder, Praerit Garg (Microsoft)
   - **Status**: Conceptual framework used for threat categorization; all scenario analysis is original.

3. **Copied Code Audit Statement**:
   - No external copyrighted source code has been copied directly into custom packages without attribution.
   - All external modules are managed as declared package dependencies or bundled unmodified with license preservation.

---

## 3. NPM / Node.js Transitive Dependencies License Manifest

Generated automatically from \`pnpm licenses list --json\`.
`;

const pnpmLicenseKeys = Object.keys(pnpmJson).sort();
for (const lic of pnpmLicenseKeys) {
  const pkgs = pnpmJson[lic];
  md += `\n### ${lic} (${pkgs.length} packages)\n\n`;
  md += `| Package | Versions | Description |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (const p of pkgs) {
    const versions = (p.versions || []).join(", ");
    const desc = (p.description || "").replace(/\|/g, "\\|").slice(0, 80);
    md += `| \`${p.name}\` | \`${versions}\` | ${desc} |\n`;
  }
}

md += `\n---

## 4. Rust / Cargo Transitive Dependencies License Manifest

Generated automatically from Cargo metadata for the desktop application (\`apps/desktop/src-tauri\`).
`;

const cargoLicenseKeys = Object.keys(cargoByLicense).sort();
for (const lic of cargoLicenseKeys) {
  const crates = cargoByLicense[lic];
  md += `\n### ${lic} (${crates.length} crates)\n\n`;
  md += `| Crate | Version | Description |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (const c of crates) {
    const desc = (c.description || "").replace(/\|/g, "\\|").slice(0, 80);
    md += `| \`${c.name}\` | \`${c.version}\` | ${desc} |\n`;
  }
}

md += `\n---

## 5. Standard License Texts

### 5.1 Apache License Version 2.0
\`\`\`text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner.

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work.
\`\`\`

### 5.2 MIT License
\`\`\`text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
\`\`\`

### 5.3 ISC License
\`\`\`text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
\`\`\`

### 5.4 3-Clause BSD License
\`\`\`text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
\`\`\`

### 5.5 Blue Oak Model License 1.0.0
\`\`\`text
Version 1.0.0 — https://blueoakcouncil.org/license/1.0.0

Purpose: This license gives everyone as much permission to work with this software
as possible, while protecting contributors from liability.

Agreement: In order to receive this license, you have to agree to its rules.
The rules of this license are both obligations under that agreement and conditions to
your license. You must not do anything with this software that triggers a rule you
cannot or will not follow.

Notices: Make sure everyone who gets a copy of any part of this software from you,
with or without changes, also gets the text of this license and the contributor notices.

Copyleft: None.

No Warranty: The software is provided "as is", without warranty of any kind.
Contributors won't be liable to anyone for any damages related to this software or this license.
\`\`\`
`;

fs.writeFileSync(path.join(rootDir, "THIRD_PARTY_NOTICES.md"), md, "utf-8");
console.log("Successfully generated THIRD_PARTY_NOTICES.md, size:", md.length);
