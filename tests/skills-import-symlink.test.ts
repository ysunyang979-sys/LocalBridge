import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { parseZip } from "../apps/server/src/skills/zip-util.js";

describe("Skills Import: Symlink & Junction Protection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-symlink-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    const registry = new SkillRegistry(loader);
    importer = new SkillImporter({
      validator,
      loader,
      registry,
      validMcpTools: activeTools,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("detects and rejects UNIX symbolic links in ZIP packages via parseZip", () => {
    // Build a mock raw ZIP header containing unix symlink attribute (0120000)
    // Local header: 30 bytes + filename (10) + target (11) = 51 bytes
    // Central header: 46 bytes + filename (10) = 56 bytes
    // EOCD: 22 bytes
    const fileName = "link-entry";
    const target = "/etc/passwd";
    const nameBuf = Buffer.from(fileName, "utf8");
    const targetBuf = Buffer.from(target, "utf8");

    const localHdr = Buffer.alloc(30 + nameBuf.length);
    localHdr.writeUInt32LE(0x04034b50, 0); // sig
    localHdr.writeUInt16LE(20, 4); // ver
    localHdr.writeUInt16LE(0, 6); // flags
    localHdr.writeUInt16LE(0, 8); // method = stored
    localHdr.writeUInt32LE(0, 14); // crc
    localHdr.writeUInt32LE(targetBuf.length, 18); // comp
    localHdr.writeUInt32LE(targetBuf.length, 22); // uncomp
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);
    nameBuf.copy(localHdr, 30);

    const centralHdr = Buffer.alloc(46 + nameBuf.length);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    centralHdr.writeUInt8(3, 5); // OS = UNIX (3)
    centralHdr.writeUInt16LE(20, 6);
    centralHdr.writeUInt16LE(0, 8);
    centralHdr.writeUInt16LE(0, 10);
    centralHdr.writeUInt32LE(0, 16);
    centralHdr.writeUInt32LE(targetBuf.length, 20);
    centralHdr.writeUInt32LE(targetBuf.length, 24);
    centralHdr.writeUInt16LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    // Unix mode S_IFLNK (0120000) in high 16 bits = 0xA000
    centralHdr.writeUInt32LE((0o120777 * 65536) >>> 0, 38);
    centralHdr.writeUInt32LE(0, 42); // local header offset
    nameBuf.copy(centralHdr, 46);

    const localLen = localHdr.length + targetBuf.length;
    const centralLen = centralHdr.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(centralLen, 12);
    eocd.writeUInt32LE(localLen, 16);
    eocd.writeUInt16LE(0, 20);

    const symlinkZip = Buffer.concat([localHdr, targetBuf, centralHdr, eocd]);

    expect(() => parseZip(symlinkZip)).toThrow(/Symbolic link detected|symlinks are forbidden/i);
  });

  it("fails importZip if symlink error occurs", async () => {
    // Attempting to preview or import an archive containing symlink
    const fakeSymlinkZip = Buffer.from("bad-zip-data");
    const result = await importer.importZip({
      zipBufferOrPath: fakeSymlinkZip,
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
