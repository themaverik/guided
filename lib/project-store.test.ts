import { describe, expect, test } from "vitest";
import {
  deleteProject,
  isValidSlug,
  loadProjectBook,
  projectExists,
  resolveAsset,
} from "./project-store";

describe("isValidSlug", () => {
  test("accepts slugs the store generates", () => {
    expect(isValidSlug("demo")).toBe(true);
    expect(isValidSlug("quickstart")).toBe(true);
    expect(isValidSlug("my-project")).toBe(true);
    expect(isValidSlug("my-project-2")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("0")).toBe(true);
  });

  test("rejects traversal and separator payloads", () => {
    expect(isValidSlug("..")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
    expect(isValidSlug("..%2Fetc")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("a\\b")).toBe(false);
    expect(isValidSlug("a/../b")).toBe(false);
  });

  test("rejects shapes baseSlug never emits", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("My-Project")).toBe(false);
    expect(isValidSlug("with space")).toBe(false);
    expect(isValidSlug(".hidden")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("a".repeat(120))).toBe(false);
  });
});

describe("slug guard on store entry points", () => {
  test("projectExists is false for an invalid slug", async () => {
    await expect(projectExists("../outside")).resolves.toBe(false);
  });

  test("resolveAsset returns null for an invalid slug", async () => {
    await expect(resolveAsset("../outside", "a.png")).resolves.toBeNull();
  });

  test("deleteProject is a no-op for an invalid slug", async () => {
    await expect(
      deleteProject("../surely-nonexistent-dir-xyz"),
    ).resolves.toBeUndefined();
  });

  test("loadProjectBook rejects for an invalid slug", async () => {
    await expect(loadProjectBook("../outside")).rejects.toThrow(/slug/i);
  });
});
