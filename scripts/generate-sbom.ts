import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lockBytes = fs.readFileSync(path.join(root, "pnpm-lock.yaml"));
const cargoLock = fs.readFileSync(path.join(root, "apps/desktop/src-tauri/Cargo.lock"), "utf8");
const node = JSON.parse(fs.readFileSync(path.join(root, "scripts/bundled-node.json"), "utf8"));

type Component = { type: "application" | "library"; name: string; version: string; purl: string; hashes?: Array<{ alg: string; content: string }> };
const components = new Map<string, Component>();
const addNpm = (name: string, version: string, application = false) => {
  if (!name || !version || version.startsWith("link:")) return;
  const encoded = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  const purl = `pkg:npm/${encoded}@${version}`;
  components.set(purl, { type: application ? "application" : "library", name, version, purl });
};
const packageFiles = [
  "package.json",
  "packages/protocol/package.json",
  "packages/shared/package.json",
  "packages/security/package.json",
  "apps/server/package.json",
  "apps/runner/package.json",
  "apps/desktop/package.json",
];
for (const file of packageFiles) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  addNpm(pkg.name, pkg.version, true);
}

const lockText = lockBytes.toString("utf8");
const packagesSection = lockText.split(/^packages:\s*$/m)[1]?.split(/^snapshots:\s*$/m)[0];
if (!packagesSection) throw new Error("pnpm-lock.yaml packages section is missing");
for (const line of packagesSection.split(/\r?\n/)) {
  const rawKey = line.match(/^  ['"]?(.+?)['"]?:\s*$/)?.[1];
  if (!rawKey) continue;
  const key = rawKey.replace(/\(.+\)$/, "");
  const separator = key.lastIndexOf("@");
  if (separator <= 0) continue;
  addNpm(key.slice(0, separator), key.slice(separator + 1));
}

for (const block of cargoLock.split("[[package]]").slice(1)) {
  const name = block.match(/\nname = "([^"]+)"/)?.[1];
  const version = block.match(/\nversion = "([^"]+)"/)?.[1];
  if (!name || !version || name === "localbridge-desktop") continue;
  const purl = `pkg:cargo/${name}@${version}`;
  components.set(purl, { type: "library", name, version, purl });
}

const nodePurl = `pkg:generic/node@${node.version}?arch=${node.arch}&os=${node.platform}`;
components.set(nodePurl, {
  type: "application",
  name: "node",
  version: node.version,
  purl: nodePurl,
  hashes: [{ alg: "SHA-256", content: node.sha256 }],
});

const sbom = {
  $schema: "http://cyclonedx.org/schema/bom-1.5.json",
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    tools: [{ vendor: "LocalBridge", name: "generate-sbom.ts", version: rootPackage.version }],
    component: { type: "application", name: "LocalBridge", version: rootPackage.version },
    properties: [{ name: "localbridge:pnpm-lock-sha256", value: crypto.createHash("sha256").update(lockBytes).digest("hex") }],
  },
  components: Array.from(components.values()).sort((a, b) => a.purl.localeCompare(b.purl)),
};
const output = `${JSON.stringify(sbom, null, 2)}\n`;
const target = path.join(root, "sbom.json");
if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== output) throw new Error("sbom.json drift detected; run pnpm sbom:generate");
  console.log("SBOM is synchronized with lockfiles and bundled Node metadata.");
} else {
  fs.writeFileSync(target, output, "utf8");
  console.log(`Generated ${target} with ${sbom.components.length} components.`);
}
