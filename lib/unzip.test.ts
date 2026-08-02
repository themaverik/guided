import { deflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { readZip } from "./unzip";

const LOCAL_SIG = 0x04034b50;
const CEN_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/** Build a minimal single-file zip (method 8 = deflate, 0 = stored). */
function buildZipWith(name: string, content: Buffer, method: 0 | 8): Buffer {
  const comp = method === 8 ? deflateRawSync(content) : content;
  const nameBuf = Buffer.from(name, "utf8");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(LOCAL_SIG, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const localRec = Buffer.concat([local, nameBuf, comp]);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(CEN_SIG, 0);
  cen.writeUInt16LE(method, 10);
  cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(content.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(0, 42); // local header offset
  const cenRec = Buffer.concat([cen, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(cenRec.length, 12);
  eocd.writeUInt32LE(localRec.length, 16); // central directory offset
  return Buffer.concat([localRec, cenRec, eocd]);
}

describe("readZip decompression limits", () => {
  test("reads a normal deflate entry back", () => {
    const content = Buffer.from("hello zip world");
    const entries = readZip(buildZipWith("book.json", content, 8));
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("book.json");
    expect(entries[0].data.equals(content)).toBe(true);
  });

  test("throws instead of inflating past the total-bytes cap", () => {
    // 1 MB of zeros compresses to ~1 KB — a miniature zip bomb.
    const bomb = buildZipWith("a.bin", Buffer.alloc(1024 * 1024), 8);
    expect(() => readZip(bomb, { maxTotalBytes: 64 * 1024 })).toThrow(
      /too large/i,
    );
  });

  test("stored (uncompressed) entries also count toward the cap", () => {
    const content = Buffer.from("hello zip world");
    const zip = buildZipWith("a.bin", content, 0);
    expect(() => readZip(zip, { maxTotalBytes: 4 })).toThrow(/too large/i);
  });

  test("throws when the entry count exceeds the cap", () => {
    const zip = buildZipWith("a.bin", Buffer.from("x"), 0);
    expect(() => readZip(zip, { maxEntries: 0 })).toThrow(/entries/i);
  });
});
