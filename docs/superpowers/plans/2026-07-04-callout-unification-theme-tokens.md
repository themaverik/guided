# Callout Unification + `@theme` Swatch Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the 8 annotation swatches as `@theme` CSS tokens and repoint every callout onto its mapped swatch, so annotations and callouts draw from one coherent OKLCH palette.

**Architecture:** CSS-only. `app/globals.css @theme` gains 8 `--swatch-{id}-fill/stroke` pairs (the single CSS palette source, mirrored from `lib/annotation-palette.ts`); the five callout token groups are rewritten to derive from those swatches via a uniform recipe. `components/renderer/renderer.css` drops its per-type body overrides (bodies go neutral) and gains info/note marker rules. A vitest test guards the JS↔CSS mirror against drift. No schema/model change, no migration, no change to `Callout.tsx` / `normalizeCalloutType`.

**Tech Stack:** Next.js 15, Tailwind v4 (CSS-first `@theme`), CSS `color-mix`, vitest, Playwright (print/PDF verification).

## Global Constraints

- **Map (DESIGN §2.2):** info→**Blue**, note→**Ink**, success→**Green**, warning→**Amber**, danger→**Red**.
- **Uniform recipe (every callout):** bg = `swatch.fill`; title = `swatch.stroke`; marker = `swatch.stroke`; border = `color-mix(in srgb, swatch.stroke 33%, transparent)`; body = neutral `--ink-text` (`#1a2327`).
- **The 8 swatch hex (must match `lib/annotation-palette.ts` exactly):** ink `#e6f1f2`/`#024450`, red `#ffe8e4`/`#cb4a47`, orange `#ffecd8`/`#b56410`, amber `#fef3d2`/`#957800`, green `#e0f7e4`/`#369150`, teal `#daf7f6`/`#188d8d`, blue `#e2f2ff`/`#217fd0`, violet `#f1edff`/`#8464cf` (fill/stroke).
- **CSS-only:** no schema bump, no migration; `Callout.tsx` and `normalizeCalloutType` untouched; keep the `warn`→`warning` alias (consumed by `editor.css:242-244`).
- **Print accuracy:** the renderer must stay pixel-accurate; `color-mix` (borders) MUST be verified in the Playwright→Chromium PDF path, with the precomputed-hex fallback if it fails.
- **Before relying on `color-mix` inside `@theme`:** resolve Tailwind v4 behavior via Context7; if `@theme` rejects `color-mix`/inter-token `var()`, move the callout token block into a plain `:root {}` (transparent to `var()` consumers).
- **Gates (every task):** `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` all green. Pre-existing lint warning at `lib/use-auto-fit.ts:195` is untouched — ignore it.

---

### Task 1: Register the swatch `@theme` tokens + drift-guard test

**Files:**
- Create: `lib/swatch-tokens.test.ts`
- Modify: `app/globals.css` (add the swatch block inside `@theme`, immediately before the `/* Callout palettes */` comment at line 27)

**Interfaces:**
- Consumes: `SWATCHES` from `lib/annotation-palette.ts` — `readonly { id: string; label: string; fill: string; stroke: string }[]`.
- Produces: 8 CSS custom properties `--swatch-{id}-fill` and `--swatch-{id}-stroke` (id ∈ ink/red/orange/amber/green/teal/blue/violet) available to all CSS via `var()`. Task 2 consumes these.

- [ ] **Step 1: Write the failing test**

Create `lib/swatch-tokens.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run lib/swatch-tokens.test.ts`
Expected: FAIL — `tokenValue(...)` returns `undefined` (tokens not defined yet), so `expect(undefined).toBe("#e6f1f2")` fails for all 8 swatches.

- [ ] **Step 3: Add the swatch tokens to `@theme`**

In `app/globals.css`, insert this block inside the `@theme { … }` block, immediately **before** the `/* Callout palettes */` comment (currently line 27):

```css
  /* Annotation swatch palette (DESIGN §2.2). SINGLE CSS SOURCE — mirrors
     lib/annotation-palette.ts SWATCHES; kept in sync by lib/swatch-tokens.test.ts. */
  --swatch-ink-fill: #e6f1f2;
  --swatch-ink-stroke: #024450;
  --swatch-red-fill: #ffe8e4;
  --swatch-red-stroke: #cb4a47;
  --swatch-orange-fill: #ffecd8;
  --swatch-orange-stroke: #b56410;
  --swatch-amber-fill: #fef3d2;
  --swatch-amber-stroke: #957800;
  --swatch-green-fill: #e0f7e4;
  --swatch-green-stroke: #369150;
  --swatch-teal-fill: #daf7f6;
  --swatch-teal-stroke: #188d8d;
  --swatch-blue-fill: #e2f2ff;
  --swatch-blue-stroke: #217fd0;
  --swatch-violet-fill: #f1edff;
  --swatch-violet-stroke: #8464cf;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run lib/swatch-tokens.test.ts`
Expected: PASS — all 8 swatch cases green.

- [ ] **Step 5: Run the gates**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all green (plain-hex `@theme` tokens compile trivially; callouts still use their old values and are unchanged at this point). Ignore the pre-existing `lib/use-auto-fit.ts:195` warning.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css lib/swatch-tokens.test.ts
git commit -m "feat: register 8 swatch @theme tokens + drift-guard test"
```

---

### Task 2: Repoint callouts onto the swatches (globals.css + renderer.css)

**Files:**
- Modify: `app/globals.css` (replace the `/* Callout palettes */` token block, lines 27-54)
- Modify: `components/renderer/renderer.css` (remove 3 body overrides; add info/note marker rules)

**Interfaces:**
- Consumes: `--swatch-{id}-fill/stroke` from Task 1.
- Produces: `--color-{info,note,warning,success,danger}-{bg,border,title,marker}` (+ `--color-warn-{bg,border,title}` alias) all derived from swatches. No new consumers beyond the existing `renderer.css` / `editor.css` `var()` references.

- [ ] **Step 1: Confirm Tailwind v4 `@theme` accepts `color-mix` / inter-token `var()`**

Resolve via Context7 (Tailwind v4 `@theme`): confirm a custom property whose value is `color-mix(...)` or `var(--other-theme-token)` is emitted as-is (these tokens generate no utilities — they are referenced only via `var()`). If Tailwind rejects them inside `@theme`, use the fallback in Step 5. Note the finding in the task report.

- [ ] **Step 2: Replace the callout token block in `app/globals.css`**

Replace the entire current block (from `/* Callout palettes */` through `--color-danger-marker: #c0392b;`, lines 27-54) with:

```css
  /* Callout palettes — derived from the swatch tokens (see ADR-007).
     Recipe: bg=fill, title=stroke, marker=stroke, border=stroke@33%; body is
     the neutral --ink-text (renderer default). Map: info→Blue, note→Ink,
     success→Green, warning→Amber, danger→Red. */
  --color-info-bg: var(--swatch-blue-fill);
  --color-info-border: color-mix(in srgb, var(--swatch-blue-stroke) 33%, transparent);
  --color-info-title: var(--swatch-blue-stroke);
  --color-info-marker: var(--swatch-blue-stroke);

  --color-note-bg: var(--swatch-ink-fill);
  --color-note-border: color-mix(in srgb, var(--swatch-ink-stroke) 33%, transparent);
  --color-note-title: var(--swatch-ink-stroke);
  --color-note-marker: var(--swatch-ink-stroke);

  --color-warning-bg: var(--swatch-amber-fill);
  --color-warning-border: color-mix(in srgb, var(--swatch-amber-stroke) 33%, transparent);
  --color-warning-title: var(--swatch-amber-stroke);
  --color-warning-marker: var(--swatch-amber-stroke);
  /* warn = legacy alias for warning (consumed by editor.css) */
  --color-warn-bg: var(--swatch-amber-fill);
  --color-warn-border: color-mix(in srgb, var(--swatch-amber-stroke) 33%, transparent);
  --color-warn-title: var(--swatch-amber-stroke);

  --color-success-bg: var(--swatch-green-fill);
  --color-success-border: color-mix(in srgb, var(--swatch-green-stroke) 33%, transparent);
  --color-success-title: var(--swatch-green-stroke);
  --color-success-marker: var(--swatch-green-stroke);

  --color-danger-bg: var(--swatch-red-fill);
  --color-danger-border: color-mix(in srgb, var(--swatch-red-stroke) 33%, transparent);
  --color-danger-title: var(--swatch-red-stroke);
  --color-danger-marker: var(--swatch-red-stroke);
```

Note the intentionally removed tokens (now unreferenced): `--color-warn-body`, `--color-warn-marker`, `--color-warning-body`, `--color-success-body`, `--color-danger-body`.

- [ ] **Step 3: Remove the body overrides in `components/renderer/renderer.css`**

Delete these three rule blocks so all callout bodies fall back to the default `.callout-body { color: var(--ink-text); }` (neutral):

Remove:
```css
.callout--warn .callout-body,
.callout--warning .callout-body {
  color: var(--color-warning-body);
}
```
Remove:
```css
.callout--success .callout-body {
  color: var(--color-success-body);
}
```
Remove:
```css
.callout--danger .callout-body {
  color: var(--color-danger-body);
}
```

- [ ] **Step 4: Add info/note marker rules in `components/renderer/renderer.css`**

Immediately before the existing `.callout--warn .callout-marker,` rule (currently line 684), add:

```css
.callout--info .callout-marker {
  background: var(--color-info-marker);
}
.callout--note .callout-marker {
  background: var(--color-note-marker);
}
```

(The warning/success/danger marker rules already exist and now reference the repointed tokens; the default `.callout-marker { background: var(--ink); }` no longer applies to any callout type.)

- [ ] **Step 5: Run the gates + verify Tailwind compiled the tokens**

Run: `pnpm build`
Expected: PASS. The build compiling confirms Tailwind v4 accepts the `color-mix` / `var()` `@theme` values. **If `pnpm build` fails on the `@theme` `color-mix`/`var()` tokens:** move ONLY the callout token block (the Step 2 block) out of `@theme` into a new `:root { … }` block below the `@theme` block in `app/globals.css` (leave the `--swatch-*` pairs in `@theme`), then re-run. `renderer.css`/`editor.css` reference them via `var()`, so this move is transparent.

Then run: `pnpm typecheck && pnpm lint && pnpm test -- --run`
Expected: all green (the drift test still passes — swatch tokens unchanged). Ignore `lib/use-auto-fit.ts:195`.

- [ ] **Step 6: Print/PDF verification of `color-mix` borders**

Verify the callouts render in the PDF print path (per the repo's "verify without a browser" method — extension may be unavailable):

1. Create a throwaway demo project and edit its `data/projects/<slug>/book.json` to include a step with all five callout types (`info`, `note`, `warning`, `success`, `danger`), each with a title + body.
2. With `pnpm dev` running, write a throwaway `_shot.mjs` in the project root using the `playwright` chromium dep to open `http://localhost:<port>/<slug>/print` and both screenshot it and export a PDF (`page.pdf({ preferCSSPageSize: true })`).
3. Read the screenshot: confirm each callout shows its swatch bg + title + numbered marker, and a **visible border** (the `color-mix` @33%). Confirm bodies are neutral near-black.
4. Confirm the PDF export renders the borders too (open/screenshot the PDF, or re-render the PDF to an image).
5. Delete `_shot.mjs` and the demo project.

**If the PDF border is missing or wrong** (color-mix didn't flatten): add precomputed border tokens to the `@theme` swatch block — `--swatch-{id}-border: #rrggbb54` (the stroke hex + `54` ≈ 33% alpha) for blue/ink/amber/green/red — and change each `--color-{type}-border` to `var(--swatch-{mapped}-border)`. Re-run Steps 5-6. Record the outcome (color-mix worked, or fallback applied) in the task report.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/renderer/renderer.css
git commit -m "feat: unify callouts onto swatch tokens (neutral body)"
```

---

### Task 3: ADR-007 — unified color tokens

**Files:**
- Create: `docs/adr/ADR-007-unified-color-tokens.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Confirm the ADR number**

Run: `ls docs/adr/`
Expected: highest existing is `ADR-006-*`. If a later number exists, use the next free number and adjust the filename/title accordingly.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/ADR-007-unified-color-tokens.md`:

```markdown
# ADR-007: Unified color tokens — swatch palette as single source

- Status: Accepted
- Date: 2026-07-04
- Related: ADR-001 (config-driven renderer), ADR-004 (annotation canvas), DESIGN.md §2.2

## Context

Two independent color systems coexisted: the 8 OKLCH annotation swatches lived only
in JS (`lib/annotation-palette.ts`), while callouts used their own hand-tuned hex in
`app/globals.css` `@theme` (`--color-{info,note,warning,success,danger}-*`). DESIGN
§2.2 calls for one coherent OKLCH palette shared by annotations and callouts.

## Decision

1. Register the 8 swatches as `@theme` CSS tokens `--swatch-{id}-fill/stroke`
   (Ink/Red/Orange/Amber/Green/Teal/Blue/Violet) — the single CSS palette source,
   mirrored from `lib/annotation-palette.ts` and guarded against drift by
   `lib/swatch-tokens.test.ts`.
2. Derive every callout's colors from its mapped swatch via a uniform recipe:
   bg = swatch.fill; title = swatch.stroke; marker = swatch.stroke;
   border = swatch.stroke @ 33% (`color-mix`); body = neutral `--ink-text`.
3. Map (DESIGN §2.2): info→Blue, note→Ink, success→Green, warning→Amber, danger→Red.
   Keep the `warn`→`warning` alias (consumed by `editor.css`).

## Consequences

- Callout colors shift onto the swatch palette: info teal→blue, note slate→teal-ink,
  titles lighter (stroke L≈0.58). Accepted — one coherent palette is the goal.
- Future callout/annotation colors come from these 8 tokens, not fresh hex.
- The JS↔CSS mirror is a deliberate duplication (the palette UI needs JS hex); the
  drift test keeps them in lock-step.
- `color-mix` is used for callout borders and verified to render in the Playwright→
  Chromium PDF path (precomputed 8-digit-hex fallback documented in the plan).
- CSS-only: no schema/model change, no migration; existing books unchanged.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-007-unified-color-tokens.md
git commit -m "docs: ADR-007 unified color tokens (swatch palette single source)"
```

---

## Self-Review

- **Spec coverage:** Piece 3 (swatch `@theme` tokens) → Task 1. Piece 2 (callout repoint + renderer body/marker changes) → Task 2. Drift guard → Task 1. Print/`color-mix` verification + fallback → Task 2 Step 6. Tailwind `@theme` `color-mix` check + fallback → Task 2 Steps 1/5. ADR-007 → Task 3. Map, recipe, neutral body, warn alias → Global Constraints. All spec sections covered.
- **Placeholder scan:** none — every step has exact code/commands.
- **Type/name consistency:** token names (`--swatch-{id}-fill/stroke`, `--color-{type}-{bg,border,title,marker}`), swatch hex, and the map are identical across Task 1, Task 2, and the drift test. `tokenValue` regex matches the `--name: #rrggbb;` form the tokens are written in.
