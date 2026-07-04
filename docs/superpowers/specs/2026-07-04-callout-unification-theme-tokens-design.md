# Callout unification + `@theme` swatch tokens (design)

**Date:** 2026-07-04
**Branch:** `feat/callout-unification-theme-tokens` (base `main` `5ce387f`)
**Status:** Approved — one bundled spec.

The OKLCH color-system remainder. Register the 8 annotation swatches as `@theme`
CSS tokens (the single CSS palette source), then repoint every callout onto its
mapped swatch so annotations and callouts draw from one coherent palette.

## Problem

- The 8 OKLCH swatches (DESIGN §2.2) live **only in JS** (`lib/annotation-palette.ts`),
  so CSS has no access to them.
- Callouts use their **own hand-tuned hex** (`--color-{info,note,warning,success,danger}-*`
  in `app/globals.css @theme`), unrelated to the swatch palette. Two independent
  color systems that should be one.

## Decisions (from brainstorming)

1. **Full unification onto the swatch palette** — callouts adopt the swatch colors;
   exact reproduction of today's callout hex is **not** required ("similar is fine").
2. **Map (DESIGN §2.2):** info→**Blue**, note→**Ink**, success→**Green**,
   warning→**Amber**, danger→**Red**.
3. **Uniform 5-role→2-tone recipe** (a swatch has `fill` L≈0.96 + `stroke` L≈0.58):
   | Role | Value |
   |---|---|
   | bg | `swatch.fill` |
   | title | `swatch.stroke` |
   | marker | `swatch.stroke` |
   | border | `swatch.stroke` @ 33% (`color-mix(… 33%, transparent)`) |
   | body | **neutral** `--ink-text` (`#1a2327`) — unchanged, max readability |
4. **Neutral body for all callouts** (chosen over a faint swatch tint). This makes
   info/note bodies unchanged and drops the current dark tint on
   warning/success/danger bodies — a barely-perceptible shift.
5. **Markers unify too:** info marker teal→blue; note marker stays teal (Ink stroke
   `#024450` = today's default); warning/success/danger repoint to their swatch stroke.
6. **CSS-only.** No schema/model change, no migration, no change to `Callout.tsx` /
   `normalizeCalloutType`. The `warn`→`warning` alias is kept (still consumed by
   `editor.css`).
7. **Accepted color shift** (the point of unifying): info teal→blue, note slate→teal-ink,
   titles lighter (stroke L≈0.58 vs today's ~L0.45). Verified against a side-by-side
   HTML mockup and approved.

## Piece 3 — register the swatch palette as `@theme` tokens

Add to `app/globals.css @theme`, mirroring `lib/annotation-palette.ts` `SWATCHES`:

```css
/* Annotation swatch palette (DESIGN §2.2). SINGLE CSS SOURCE — mirrors
   lib/annotation-palette.ts SWATCHES; kept in sync by lib/swatch-tokens.test.ts. */
--swatch-ink-fill:    #e6f1f2;  --swatch-ink-stroke:    #024450;
--swatch-red-fill:    #ffe8e4;  --swatch-red-stroke:    #cb4a47;
--swatch-orange-fill: #ffecd8;  --swatch-orange-stroke: #b56410;
--swatch-amber-fill:  #fef3d2;  --swatch-amber-stroke:  #957800;
--swatch-green-fill:  #e0f7e4;  --swatch-green-stroke:  #369150;
--swatch-teal-fill:   #daf7f6;  --swatch-teal-stroke:   #188d8d;
--swatch-blue-fill:   #e2f2ff;  --swatch-blue-stroke:   #217fd0;
--swatch-violet-fill: #f1edff;  --swatch-violet-stroke: #8464cf;
```

Orange / Teal / Violet have no callout consumer — they are registered for
annotations + future use (harmless, completes the palette).

## Piece 2 — repoint the callout tokens

Replace the callout token block in `app/globals.css @theme` with swatch-derived
values (bg/title/marker as raw `var()`, border via `color-mix`):

```css
/* Callout palettes — derived from the swatch tokens (see ADR-007). */
--color-info-bg:      var(--swatch-blue-fill);
--color-info-border:  color-mix(in srgb, var(--swatch-blue-stroke) 33%, transparent);
--color-info-title:   var(--swatch-blue-stroke);
--color-info-marker:  var(--swatch-blue-stroke);

--color-note-bg:      var(--swatch-ink-fill);
--color-note-border:  color-mix(in srgb, var(--swatch-ink-stroke) 33%, transparent);
--color-note-title:   var(--swatch-ink-stroke);
--color-note-marker:  var(--swatch-ink-stroke);

--color-warning-bg:      var(--swatch-amber-fill);
--color-warning-border:  color-mix(in srgb, var(--swatch-amber-stroke) 33%, transparent);
--color-warning-title:   var(--swatch-amber-stroke);
--color-warning-marker:  var(--swatch-amber-stroke);
/* warn = legacy alias for warning (consumed by editor.css) */
--color-warn-bg:      var(--swatch-amber-fill);
--color-warn-border:  color-mix(in srgb, var(--swatch-amber-stroke) 33%, transparent);
--color-warn-title:   var(--swatch-amber-stroke);

--color-success-bg:      var(--swatch-green-fill);
--color-success-border:  color-mix(in srgb, var(--swatch-green-stroke) 33%, transparent);
--color-success-title:   var(--swatch-green-stroke);
--color-success-marker:  var(--swatch-green-stroke);

--color-danger-bg:      var(--swatch-red-fill);
--color-danger-border:  color-mix(in srgb, var(--swatch-red-stroke) 33%, transparent);
--color-danger-title:   var(--swatch-red-stroke);
--color-danger-marker:  var(--swatch-red-stroke);
```

**Removed** (now unreferenced): `--color-warn-body`, `--color-warn-marker`,
`--color-warning-body`, `--color-success-body`, `--color-danger-body`.

### `components/renderer/renderer.css`

- **Remove** the three body-color overrides so every body falls back to the default
  `.callout-body { color: var(--ink-text) }` (neutral):
  - `.callout--warn .callout-body, .callout--warning .callout-body { … }`
  - `.callout--success .callout-body { … }`
  - `.callout--danger .callout-body { … }`
- **Add** marker rules for info + note (warning/success/danger marker rules already
  exist and now reference the repointed tokens):
  ```css
  .callout--info .callout-marker { background: var(--color-info-marker); }
  .callout--note .callout-marker { background: var(--color-note-marker); }
  ```

Nothing else in `renderer.css` changes — bg/border/title rules already reference
`--color-{type}-*`, so the value swap flows through.

### Consequence — `editor.css` warning style

`editor.css:242-244` consumes `--color-warn-{title,bg,border}`; repointing the alias
shifts that editor warning UI to the amber swatch too. Intended (unification), no
direct edit.

## Print safety (color-mix in the PDF path)

The only computed value is the border `color-mix(...)`. Chromium (Playwright
`page.pdf()`) supports `color-mix` (Chrome 111+) and flattens it to a concrete color
at paint. **Verify before relying:** render each callout type at `/print` and confirm
the border shows (throwaway playwright screenshot per the repo's "verify without a
browser" method). **Fallback if the PDF border is wrong/missing:** replace each
`color-mix` border with a precomputed 8-digit-hex token
`--swatch-{id}-border: #rrggbb54` (≈33% alpha) and point `--color-{type}-border` at it.

Also confirm at build that Tailwind v4 accepts `color-mix(...)` and inter-token
`var()` references inside `@theme`. If it errors, move the callout token block out of
`@theme` into a plain `:root {}` (renderer/editor reference them via `var()` either
way, so the move is transparent). Confirm the exact behavior via Context7 (Tailwind v4)
before implementing.

## DRY drift guard — `lib/swatch-tokens.test.ts`

The 8 hex now live in two mirrors: JS (`SWATCHES`, for the palette UI + `fillForStroke`
logic — which needs JS values) and CSS (`@theme`, for callouts). A vitest test reads
`app/globals.css` and asserts each `--swatch-{id}-fill/stroke` equals the JS value, so
they cannot drift:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SWATCHES } from "./annotation-palette";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const tokenValue = (name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1].toLowerCase();

describe("swatch @theme tokens mirror lib SWATCHES", () => {
  for (const sw of SWATCHES) {
    it(`--swatch-${sw.id}-* match ${sw.id}`, () => {
      expect(tokenValue(`swatch-${sw.id}-fill`)).toBe(sw.fill.toLowerCase());
      expect(tokenValue(`swatch-${sw.id}-stroke`)).toBe(sw.stroke.toLowerCase());
    });
  }
});
```

## ADR-007 (new)

`docs/adr/ADR-007-unified-color-tokens.md` (MADR). Records: the 8 swatch pairs are the
single color source, registered as `@theme` tokens and mirrored from
`lib/annotation-palette.ts` (drift-guarded by test); callouts derive via the uniform
recipe + the DESIGN §2.2 map; neutral body; the accepted color shift; `color-mix` used
for borders (verified in print). Confirm the next free ADR number is 007 before writing.

## Out of scope (deferred)

- Making the JS palette **read** from CSS (kept as a guarded mirror — the palette logic
  needs JS hex).
- Any annotation-render change (annotations still apply colors inline from JS).
- New swatches; per-callout swatch remaps beyond the DESIGN map.
- PDF `/C /IC` CMYK inspector readout; shape cycler; ISO-32000 standardization.

## Testing

Unit (vitest, `lib/**`): `lib/swatch-tokens.test.ts` (above) — the drift guard (one
case per swatch). The 233 existing tests stay green.

Verification (build + print, no DOM harness):
- `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` green.
- Build confirms Tailwind accepts the `color-mix` / `var()` `@theme` values.
- `/print` render of a step with all five callout types: bg/title/marker show the
  swatch hue, borders render, bodies are neutral near-black — in preview **and** the
  exported PDF.

## Success criteria

- The 8 swatches exist as `@theme` tokens mirroring `lib/annotation-palette.ts`, guarded
  by a test.
- All five callouts derive their colors from their mapped swatch via the uniform recipe;
  info is blue, note teal-ink, success green, warning amber, danger red; bodies neutral.
- Renders identically in editor preview and exported PDF (borders included).
- CSS-only — no schema bump, no migration, existing books unchanged. ADR-007 added.
  typecheck / lint / suite / build green.
