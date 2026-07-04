import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SWATCHES } from "./annotation-palette";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/** Value of a `--name: #rrggbb;` declaration in globals.css, lowercased. */
function tokenValue(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1].toLowerCase();
}

describe("swatch @theme tokens mirror lib SWATCHES", () => {
  for (const sw of SWATCHES) {
    it(`--swatch-${sw.id}-fill/stroke match ${sw.id}`, () => {
      expect(tokenValue(`swatch-${sw.id}-fill`)).toBe(sw.fill.toLowerCase());
      expect(tokenValue(`swatch-${sw.id}-stroke`)).toBe(sw.stroke.toLowerCase());
    });
  }
});
