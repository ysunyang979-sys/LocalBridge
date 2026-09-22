import zlib from "node:zlib";

export interface ZipEntry {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
  data: Buffer;
}

/**
 * Safely parses a PKZIP buffer with strict security checks against:
 * - Zip Slip / path traversal (..)
 * - Absolute paths (/ or \)
 * - Drive paths (C:\)
 * - UNC paths (\\server\share)
 * - Symbolic links / reparse points
 */
export function parseZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) {
    throw new Error("Invalid ZIP file: file too small");
  }

  // 1. Locate End of Central Directory Record (EOCD) by scanning backwards from end
  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length, 65535 + 22);
  const searchStart = buffer.length - 22;
  const searchEnd = buffer.length - maxSearch;

  for (let i = searchStart; i >= searchEnd; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP file: End of Central Directory signature not found");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirOffset + centralDirSize > buffer.length) {
    throw new Error("Invalid ZIP file: Central Directory offset out of bounds");
  }

  const entries: ZipEntry[] = [];
  let curr = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (curr + 46 > buffer.length) {
      throw new Error("Invalid ZIP file: truncated central directory header");
    }

    const sig = buffer.readUInt32LE(curr);
    if (sig !== 0x02014b50) {
      throw new Error(`Invalid ZIP file: expected central directory signature at ${curr}`);
    }

    const compressionMethod = buffer.readUInt16LE(curr + 10);
    const compressedSize = buffer.readUInt32LE(curr + 20);
    const uncompressedSize = buffer.readUInt32LE(curr + 24);
    const fileNameLen = buffer.readUInt16LE(curr + 28);
    const extraFieldLen = buffer.readUInt16LE(curr + 30);
    const commentLen = buffer.readUInt16LE(curr + 32);
    const externalAttr = buffer.readUInt32LE(curr + 38);
    const localHeaderOffset = buffer.readUInt32LE(curr + 42);

    const nameStart = curr + 46;
    const nameEnd = nameStart + fileNameLen;
    if (nameEnd > buffer.length) {
      throw new Error("Invalid ZIP file: truncated entry name");
    }

    const rawName = buffer.toString("utf8", nameStart, nameEnd);
    const normalizedName = rawName.replace(/\\/g, "/");

    // Security Check 1: Path Traversal / Zip Slip
    if (
      normalizedName.includes("..") ||
      normalizedName.startsWith("/") ||
      /^[a-zA-Z]:/i.test(normalizedName) ||
      normalizedName.startsWith("//") ||
      rawName.startsWith("\\\\")
    ) {
      throw new Error(`Zip Slip attempt detected: entry '${rawName}' escapes target directory`);
    }

    // Security Check 2: Symlink / Junction / Reparse point check
    // In Unix, high word of externalAttr stores Unix mode. S_IFLNK = 0o120000.
    const unixMode = (externalAttr >>> 16) & 0xffff;
    const isSymlink = (unixMode & 0o170000) === 0o120000;
    if (isSymlink) {
      throw new Error(`Symbolic link detected in ZIP archive: '${rawName}' (symlinks are forbidden)`);
    }

    const isDirectory = normalizedName.endsWith("/") || (externalAttr & 0x10) !== 0;

    // Read file data from local header
    if (localHeaderOffset + 30 > buffer.length) {
      throw new Error(`Invalid ZIP file: local header offset ${localHeaderOffset} out of bounds`);
    }

    const localSig = buffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      throw new Error(`Invalid ZIP file: invalid local header signature at ${localHeaderOffset}`);
    }

    const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) {
      throw new Error(`Invalid ZIP file: entry data out of bounds for '${normalizedName}'`);
    }

    let data: Buffer;
    if (isDirectory || uncompressedSize === 0) {
      data = Buffer.alloc(0);
    } else if (compressionMethod === 0) {
      data = buffer.subarray(dataStart, dataEnd);
    } else if (compressionMethod === 8) {
      const compressedChunk = buffer.subarray(dataStart, dataEnd);
      try {
        data = zlib.inflateRawSync(compressedChunk);
      } catch (err: any) {
        throw new Error(`Decompression failed for '${normalizedName}': ${err.message}`);
      }
    } else {
      throw new Error(`Unsupported compression method ${compressionMethod} for '${normalizedName}'`);
    }

    entries.push({
      name: normalizedName,
      isDirectory,
      isSymlink: false,
      data,
    });

    curr = nameEnd + extraFieldLen + commentLen;
  }

  return entries;
}

/**
 * Creates a standard ZIP buffer from a list of relative entries.
 */
export function createZip(
  entries: Array<{ path: string; data: Buffer | string; isDirectory?: boolean }>
): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const rawPath = entry.path.replace(/\\/g, "/");
    const nameBuf = Buffer.from(rawPath, "utf8");
    const isDir = Boolean(entry.isDirectory || rawPath.endsWith("/"));
    const rawData = isDir
      ? Buffer.alloc(0)
      : Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");

    // Use deflate compression for non-empty files
    let compData: Buffer;
    let method = 0;
    if (!isDir && rawData.length > 0) {
      try {
        compData = zlib.deflateRawSync(rawData);
        method = 8;
      } catch {
        compData = rawData;
        method = 0;
      }
    } else {
      compData = rawData;
    }

    // CRC32 calculation
    const crc = crc32(rawData);

    // Local file header (30 bytes + name)
    const localHdr = Buffer.alloc(30 + nameBuf.length);
    localHdr.writeUInt32LE(0x04034b50, 0); // sig
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0, 6); // flags
    localHdr.writeUInt16LE(method, 8); // method
    localHdr.writeUInt16LE(0, 10); // time
    localHdr.writeUInt16LE(0, 12); // date
    localHdr.writeUInt32LE(crc, 14); // crc32
    localHdr.writeUInt32LE(compData.length, 18); // comp size
    localHdr.writeUInt32LE(rawData.length, 22); // uncomp size
    localHdr.writeUInt16LE(nameBuf.length, 26); // name len
    localHdr.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(localHdr, 30);

    // Central Directory header (46 bytes + name)
    const centralHdr = Buffer.alloc(46 + nameBuf.length);
    centralHdr.writeUInt32LE(0x02014b50, 0); // sig
    centralHdr.writeUInt16LE(20, 4); // version made by
    centralHdr.writeUInt16LE(20, 6); // version needed
    centralHdr.writeUInt16LE(0, 8); // flags
    centralHdr.writeUInt16LE(method, 10); // method
    centralHdr.writeUInt16LE(0, 12); // time
    centralHdr.writeUInt16LE(0, 14); // date
    centralHdr.writeUInt32LE(crc, 16); // crc32
    centralHdr.writeUInt32LE(compData.length, 20); // comp size
    centralHdr.writeUInt32LE(rawData.length, 24); // uncomp size
    centralHdr.writeUInt16LE(nameBuf.length, 28); // name len
    centralHdr.writeUInt16LE(0, 30); // extra len
    centralHdr.writeUInt16LE(0, 32); // comment len
    centralHdr.writeUInt16LE(0, 34); // disk num start
    centralHdr.writeUInt16LE(0, 36); // internal attr
    centralHdr.writeUInt32LE(isDir ? 0x10 : 0x20, 38); // external attr
    centralHdr.writeUInt32LE(currentOffset, 42); // local header offset
    nameBuf.copy(centralHdr, 46);

    localHeaders.push(localHdr, compData);
    centralHeaders.push(centralHdr);
    currentOffset += localHdr.length + compData.length;
  }

  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirOffset = currentOffset;
  const centralDirSize = centralDirBuffer.length;

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // sig
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

// Simple CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
