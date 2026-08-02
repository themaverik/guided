/*
 * Minimal ZIP reader — the counterpart to lib/zip.ts. Parses the central
 * directory and extracts each entry (store = method 0, or deflate = method 8
 * via zlib). Enough to read back a project archive produced by buildZip (and
 * most standard zips).
 */
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

// Decompression ceilings: a crafted zip can inflate to many times its wire
// size (zip bomb), so cap the total extracted bytes and entry count.
export const MAX_UNZIP_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_UNZIP_ENTRIES = 10_000;

export interface ZipLimits {
  maxTotalBytes?: number;
  maxEntries?: number;
}

export function readZip(buf: Buffer, limits: ZipLimits = {}): ZipEntry[] {
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_UNZIP_TOTAL_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_UNZIP_ENTRIES;
  // Locate the End Of Central Directory record (scan backwards).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no EOCD)");

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const entries: ZipEntry[] = [];
  let extractedBytes = 0;

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries.
    if (name.endsWith("/")) continue;

    // Jump to the local header to find where the data starts.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    if (entries.length >= maxEntries) throw new Error("zip has too many entries");

    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, {
          maxOutputLength: Math.max(1, maxTotalBytes - extractedBytes),
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
          throw new Error("zip decompresses too large");
        }
        throw err;
      }
    } else throw new Error(`unsupported zip compression method ${method}`);

    extractedBytes += data.length;
    if (extractedBytes > maxTotalBytes) throw new Error("zip decompresses too large");

    entries.push({ name, data });
  }
  return entries;
}
