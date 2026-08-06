import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createFsDriver,
  resolveDriverKind,
  type StorageDriver,
} from "./storage";

let root: string;
let drv: StorageDriver;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "guided-storage-"));
  drv = createFsDriver(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("fs storage driver", () => {
  test("write → read → exists round-trip", async () => {
    await drv.write("p1/book.json", Buffer.from("{}"));
    expect((await drv.read("p1/book.json"))?.toString()).toBe("{}");
    expect(await drv.exists("p1/book.json")).toBe(true);
    expect(await drv.exists("p1/missing.json")).toBe(false);
    expect(await drv.read("p1/missing.json")).toBeNull();
  });

  test("listKeys returns nested keys under a prefix", async () => {
    await drv.write("p2/meta.json", Buffer.from("m"));
    await drv.write("p2/assets/ch1/a.png", Buffer.from("img"));
    const keys = (await drv.listKeys("p2/")).sort();
    expect(keys).toEqual(["p2/assets/ch1/a.png", "p2/meta.json"]);
  });

  test("removePrefix deletes the whole subtree", async () => {
    await drv.write("p3/book.json", Buffer.from("{}"));
    await drv.write("p3/assets/ch1/a.png", Buffer.from("img"));
    await drv.removePrefix("p3/");
    expect(await drv.listKeys("p3/")).toEqual([]);
    expect(await drv.exists("p3/book.json")).toBe(false);
  });
});

describe("driver selection", () => {
  test("defaults to fs when nothing is set", () => {
    expect(resolveDriverKind({})).toBe("fs");
  });

  test("GUIDED_STORAGE wins over Netlify detection", () => {
    expect(resolveDriverKind({ GUIDED_STORAGE: "blobs" })).toBe("blobs");
    expect(
      resolveDriverKind({ GUIDED_STORAGE: "fs", NETLIFY: "true" }),
    ).toBe("fs");
  });

  test("a deployed Netlify build falls back to blobs", () => {
    expect(resolveDriverKind({ NETLIFY: "true" })).toBe("blobs");
  });

  test("local `netlify dev` stays on fs despite NETLIFY=true", () => {
    expect(resolveDriverKind({ NETLIFY: "true", NETLIFY_DEV: "true" })).toBe(
      "fs",
    );
    expect(resolveDriverKind({ NETLIFY: "true", NETLIFY_LOCAL: "true" })).toBe(
      "fs",
    );
  });
});
