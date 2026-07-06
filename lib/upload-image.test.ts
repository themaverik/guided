import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadImage, isImageFile } from "./upload-image";

afterEach(() => vi.unstubAllGlobals());

const file = new Blob(["x"], { type: "image/png" }) as unknown as File;

describe("isImageFile", () => {
  it("accepts common image extensions, rejects others", () => {
    expect(isImageFile("a.png")).toBe(true);
    expect(isImageFile("a.JPEG")).toBe(true);
    expect(isImageFile("a.webp")).toBe(true);
    expect(isImageFile("a.pdf")).toBe(false);
    expect(isImageFile("noext")).toBe(false);
  });
});

describe("uploadImage", () => {
  it("returns the filename on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ filename: "shot.png" }),
    })));
    const res = await uploadImage("proj", "ch1", file);
    expect(res).toEqual({ filename: "shot.png" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("returns the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "bad type" }),
    })));
    expect(await uploadImage("proj", "ch1", file)).toEqual({ error: "bad type" });
  });
  it("returns a generic error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await uploadImage("proj", "ch1", file)).toEqual({ error: "upload failed" });
  });
  it("returns a generic error when the response is ok but has no filename", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await uploadImage("proj", "ch1", file)).toEqual({ error: "upload failed" });
  });
});
