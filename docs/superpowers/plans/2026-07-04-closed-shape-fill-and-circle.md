# Closed-shape fill tint + Circle shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in interior **fill tint** to closed annotation shapes and a new **Circle** (ellipse) primitive that is itself a fillable closed shape.

**Architecture:** The `ellipse` kind mirrors the existing `diamond` (rectangular `x/y/w/h` bounds, edge+center anchors, no corners) and renders as a direct `<ellipse>` element like the box `<rect>`. Fill reuses the existing `Surface.fill?` field, painted at full opacity in both preview and print (WYSIWYG — no `@media print` split). Fill is opt-in via a per-shape toggle and re-pairs to the stroke on recolor.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Zustand; SVG renderer; vitest for `lib/**` unit tests. No new dependencies.

## Global Constraints

- **Additive only:** no `schemaVersion` bump, no migration. Existing books render unchanged (their shapes have no `fill`; there are no `ellipse` shapes yet).
- **WYSIWYG:** fill renders identically in the editor canvas and the exported PDF — full opacity, no `@media print` branch, no export flag.
- **Fill applies to closed shapes only:** `box`, `diamond`, `ellipse`. Never `line` / `bracket` / `text` / `connector`.
- **New shapes are outline-only by default** (no `fill`); fill is opt-in.
- **Kind is `ellipse`; the UI label is `Circle`.**
- **Immutability:** all `Book` edits go through `updateAnnotation` / mutation helpers; never mutate in place.
- **Editor-only affordances never print,** but the fill *value* and the ellipse *shape* are data-driven and DO render in `/print` (that is intended).
- **Zustand selectors must return stable snapshots** — never mint a fresh array/object in a `useEditor((s) => …)` selector.
- Gates for every task: `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` all green; no unused imports.

---

### Task 1: ADR-004 amendment (docs)

Model change → ADR first. Document the new `ellipse` kind and the opt-in closed-shape fill semantics.

**Files:**
- Modify: `docs/adr/ADR-004-*.md` (the annotation-canvas ADR — find it with `ls docs/adr | grep -i 004`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (docs only).

- [ ] **Step 1: Locate the ADR**

Run: `ls docs/adr` and open the ADR-004 file. Read its existing "amendment" entries (it has been amended through Plan 11) to match their heading/format.

- [ ] **Step 2: Append an amendment section**

Add a dated amendment (2026-07-04) that records, in the ADR's existing amendment style:

- **New primitive `ellipse`** added to `Surface.kind`. "Circle" in the UI / ISO-32000 `/Circle` vocabulary; geometrically a free ellipse inscribed in the shape's `x/y/w/h` bounds (no new fields; cx/cy/rx/ry derived at render). Mirrors the `diamond`: edge+center anchors, no corner anchors.
- **Opt-in closed-shape fill.** The existing `Surface.fill?` is now settable on `box` / `diamond` / `ellipse` via a per-shape toggle. New shapes stay outline-only. Fill uses the swatch's paired light token (`Swatch.fill`) or a lightened tint of a custom stroke, and re-pairs when the stroke changes.
- **WYSIWYG rendering decision:** fill paints at full opacity in both preview and export (no `@media print` tint split). This intentionally amends `DESIGN.md §2.2`'s literal "~50% on canvas" wording — the L≈0.96 token already reads as a subtle tint, and WYSIWYG upholds the "renderer print-accurate to preview" guardrail.
- Note it is additive (no schemaVersion bump / migration).

- [ ] **Step 3: Commit**

```bash
git add docs/adr
git commit -m "docs: ADR-004 amendment — ellipse primitive + opt-in closed-shape fill"
```

---

### Task 2: Ellipse primitive — schema, tool, geometry, draw (lib, TDD)

Pure/model core so an ellipse can be constructed, drawn from a drag, and snapped — no rendering yet.

**Files:**
- Modify: `lib/book-schema.ts` (the `Surface.kind` union, ~line 135)
- Modify: `lib/store.tsx` (the `AnnotationTool` union, ~line 54)
- Modify: `lib/book-mutations.ts` (`newSurface`, ~line 336)
- Modify: `lib/annotations.ts` (`DrawKind` ~674, `DRAW_DEFAULTS` ~680, `anchorPoint` ~90, `snapAnchors` ~580)
- Test: `lib/annotation-draw.test.ts`, `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `boundsFromDrag`, `newSurface`, `anchorPoint`, `Anchor`, `Surface`.
- Produces: `Surface` with `kind: "ellipse"`; exported `snapAnchors(kind: Surface["kind"]): Anchor[]`; `DrawKind` includes `"ellipse"`; `AnnotationTool` includes `"ellipse"`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotation-draw.test.ts` (inside the existing `describe("buildDrawnShape", …)`):

```ts
it("builds an ellipse from the drag bounds with no fill by default", () => {
  const s = buildDrawnShape("ellipse", A, B, style);
  expect(s!.kind).toBe("ellipse");
  expect(s!.stroke).toBe("#cb4a47");
  expect(s!.width).toBe(4);
  expect(s!.swatchId).toBe("red");
  const r = s as { x: number; y: number; w: number; h: number; fill?: string };
  expect(r.x).toBeCloseTo(0.2);
  expect(r.y).toBeCloseTo(0.2);
  expect(r.w).toBeCloseTo(0.4);
  expect(r.h).toBeCloseTo(0.3);
  expect(r.fill).toBeUndefined();
});
```

Add to `lib/annotations.test.ts`. First extend its import (line 2) to include `anchorPoint` and `snapAnchors`, then add a new describe block:

```ts
describe("ellipse geometry", () => {
  const e: Surface = {
    id: "e", kind: "ellipse", x: 0.2, y: 0.2, w: 0.4, h: 0.2,
    stroke: "#024450", width: 2,
  };
  it("anchorPoint gives bounding-box edge midpoints", () => {
    const right = anchorPoint(e, "right");
    expect(right.x).toBeCloseTo(0.6);
    expect(right.y).toBeCloseTo(0.3);
    const top = anchorPoint(e, "top");
    expect(top.x).toBeCloseTo(0.4);
    expect(top.y).toBeCloseTo(0.2);
    const center = anchorPoint(e, "center");
    expect(center.x).toBeCloseTo(0.4);
    expect(center.y).toBeCloseTo(0.3);
  });
  it("snapAnchors offers center + four edges (no corners)", () => {
    expect(snapAnchors("ellipse")).toEqual(["center", "top", "bottom", "left", "right"]);
  });
  it("boundsFromDrag treats ellipse like a rubber-band rect", () => {
    const b = boundsFromDrag({ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.6 }, "ellipse");
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.3);
    expect(b.h).toBeCloseTo(0.4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- --run lib/annotation-draw.test.ts lib/annotations.test.ts`
Expected: FAIL — `"ellipse"` not assignable to `DrawKind` / `AnnotationTool`, and `snapAnchors` not exported. (Type errors may surface as test or compile failures.)

- [ ] **Step 3: Add `"ellipse"` to the schema kind union**

In `lib/book-schema.ts`, the `Surface.kind` line:

```ts
  kind: "box" | "line" | "bracket" | "diamond" | "text" | "polygon" | "ellipse";
```

- [ ] **Step 4: Add `"ellipse"` to the `AnnotationTool` union**

In `lib/store.tsx` (~line 54), after `"diamond"`:

```ts
export type AnnotationTool =
  | "select"
  | "box"
  | "line"
  | "bracket"
  | "diamond"
  | "ellipse"
  | "text"
  | "connector";
```

- [ ] **Step 5: Add the `ellipse` case to `newSurface`**

In `lib/book-mutations.ts`, in `newSurface`, after the `diamond` line (~339):

```ts
  if (kind === "ellipse") return { ...base, kind, x: 0.35, y: 0.3, w: 0.3, h: 0.3 };
```

- [ ] **Step 6: Extend `DrawKind` + `DRAW_DEFAULTS`**

In `lib/annotations.ts` (~line 674):

```ts
export type DrawKind = "box" | "diamond" | "text" | "bracket" | "line" | "ellipse";
```

In `DRAW_DEFAULTS` (~line 680), add:

```ts
  ellipse: { w: 0.3, h: 0.3 },
```

(`boundsFromDrag` needs no other change — `ellipse` falls through to the rubber-band rect branch, same as `box`.)

- [ ] **Step 7: Add `ellipse` to `anchorPoint`**

In `lib/annotations.ts` `anchorPoint` (~line 95), extend the rectangular branch:

```ts
  if (kind === "box" || kind === "diamond" || kind === "text" || kind === "ellipse") {
```

- [ ] **Step 8: Export `snapAnchors` and add the `ellipse` case**

In `lib/annotations.ts` (~line 580) add `export` and fold `ellipse` into the diamond branch:

```ts
/** Anchors offered as snap targets per surface kind. */
export function snapAnchors(kind: Surface["kind"]): Anchor[] {
  if (kind === "box" || kind === "text") {
    return [
      "center", "top", "bottom", "left", "right",
      "top-left", "top-right", "bottom-left", "bottom-right",
    ];
  }
  // Diamond + ellipse: only the four edge points + center sit on the shape
  // (corners are empty space), so those are the useful snap targets.
  if (kind === "diamond" || kind === "ellipse") {
    return ["center", "top", "bottom", "left", "right"];
  }
  return ["start", "mid", "end"];
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test -- --run lib/annotation-draw.test.ts lib/annotations.test.ts`
Expected: PASS.

- [ ] **Step 10: Full gates + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all green.

```bash
git add lib/book-schema.ts lib/store.tsx lib/book-mutations.ts lib/annotations.ts lib/annotation-draw.test.ts lib/annotations.test.ts
git commit -m "feat: ellipse annotation primitive (schema, tool, geometry, draw)"
```

---

### Task 3: Ellipse rendering + editor wiring (renderer, palette, overlay)

Make the circle drawable, selectable, and visible. No unit tests (component/SVG render — build- and manually-verified, per the project's no-DOM-harness convention).

**Files:**
- Modify: `components/renderer/AnnotationLayer.tsx` (`SurfaceShape`)
- Modify: `components/editor/AnnotationPalette.tsx` (`TOOLS`)
- Modify: `components/editor/PreviewAnnotations.tsx` (`collectSnapTargets` ~68, `surfaceAnchors` ~78, hit-region render ~454)

**Interfaces:**
- Consumes: `Surface` with `kind: "ellipse"`, `pct` (from Task 2 + existing).
- Produces: an on-canvas + print `<ellipse>`; a "Circle" palette tool.

- [ ] **Step 1: Add the ellipse render case to `SurfaceShape`**

In `components/renderer/AnnotationLayer.tsx`, immediately after the `if (s.kind === "box") { … }` block, add:

```tsx
  if (s.kind === "ellipse") {
    return (
      <ellipse
        cx={pct(s.x + s.w / 2)}
        cy={pct(s.y + s.h / 2)}
        rx={pct(s.w / 2)}
        ry={pct(s.h / 2)}
        {...common}
        fill={s.fill ?? "none"}
      />
    );
  }
```

(`common` supplies `stroke` + `strokeWidth` + `fill:"none"`; the explicit `fill` overrides it, exactly like the box case. `%` `rx`/`cx` resolve against viewport width, `ry`/`cy` against height — matching the box `width`/`height`.)

- [ ] **Step 2: Add the Circle tool to the palette**

In `components/editor/AnnotationPalette.tsx`, in `TOOLS`, after the `diamond` entry:

```tsx
  { tool: "ellipse", label: "Circle", icon: <circle cx="7" cy="7" r="4.5" /> },
```

(The icon inherits `fill="none" stroke="currentColor"` from the parent tool-button `<svg viewBox="0 0 14 14">`, so it draws a hollow circle like the other outline icons.)

- [ ] **Step 3: Include ellipse in `collectSnapTargets`**

In `components/editor/PreviewAnnotations.tsx` (~line 68):

```tsx
    if (an.kind === "box" || an.kind === "diamond" || an.kind === "text" || an.kind === "bracket" || an.kind === "ellipse") {
```

- [ ] **Step 4: Include ellipse in `surfaceAnchors`**

In `components/editor/PreviewAnnotations.tsx` (~line 78), extend the diamond branch:

```tsx
const surfaceAnchors = (s: Surface): Anchor[] =>
  s.kind === "box" || s.kind === "text"
    ? [
        "center", "top", "bottom", "left", "right",
        "top-left", "top-right", "bottom-left", "bottom-right",
      ]
    : s.kind === "diamond" || s.kind === "ellipse"
      ? ["center", "top", "bottom", "left", "right"]
      : ["start", "mid", "end"];
```

- [ ] **Step 5: Add the ellipse hit region**

In `components/editor/PreviewAnnotations.tsx`, immediately after the `if (a.kind === "box") { … }` hit-region block (~line 466), add:

```tsx
        if (a.kind === "ellipse") {
          return (
            <ellipse
              key={`hit-${a.id}`}
              cx={(a.x + a.w / 2) * W}
              cy={(a.y + a.h / 2) * H}
              rx={(a.w / 2) * W}
              ry={(a.h / 2) * H}
              className="preview-anno-hit"
              pointerEvents="all"
              onPointerDown={onDown}
            />
          );
        }
```

(Move/resize handles are bounding-box based and kind-agnostic, so the circle inherits drag-move and resize like the diamond — no handle code changes.)

- [ ] **Step 6: Gates + manual verification**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all green.

Manual (run `pnpm dev`): the palette shows a **Circle** tool; drawing rubber-bands an ellipse; it selects, moves, and resizes like a box/diamond; a connector endpoint snaps to its center + four edge points; `/<slug>/print` shows the ellipse.

- [ ] **Step 7: Commit**

```bash
git add components/renderer/AnnotationLayer.tsx components/editor/AnnotationPalette.tsx components/editor/PreviewAnnotations.tsx
git commit -m "feat: render + author the Circle (ellipse) annotation"
```

---

### Task 4: Fill helper + `swatchPatch` extension (lib, TDD)

Pure fill logic: derive a paired light fill for any stroke, and let `swatchPatch` carry it for filled closed shapes.

**Files:**
- Modify: `lib/annotation-palette.ts` (add `mixToWhite`, `fillForStroke`; extend `swatchPatch`)
- Test: `lib/annotation-palette.test.ts`

**Interfaces:**
- Consumes: `SWATCHES`, `swatchByStroke`, `Swatch`.
- Produces: `mixToWhite(hex, amount): string`; `fillForStroke(stroke): string`; `swatchPatch(sw, kind, filled?)` now returns an optional `fill`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotation-palette.test.ts`:

```ts
import { fillForStroke, mixToWhite } from "./annotation-palette";

describe("fill tint", () => {
  it("mixToWhite lightens each channel toward white by amount", () => {
    expect(mixToWhite("#000000", 1)).toBe("#ffffff");
    expect(mixToWhite("#000000", 0)).toBe("#000000");
    expect(mixToWhite("#ffffff", 0.5)).toBe("#ffffff");
    expect(mixToWhite("not-a-hex", 0.5)).toBe("not-a-hex");
  });

  it("fillForStroke returns the exact paired fill for every swatch stroke", () => {
    for (const s of SWATCHES) {
      expect(fillForStroke(s.stroke)).toBe(s.fill);
      expect(fillForStroke(s.stroke.toUpperCase())).toBe(s.fill);
    }
  });

  it("fillForStroke lightens an off-palette stroke", () => {
    const out = fillForStroke("#123456");
    expect(out).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out).not.toBe("#123456");
    // each channel is lighter than (or equal to) the source
    const src = [0x12, 0x34, 0x56];
    const got = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    got.forEach((c, i) => expect(c).toBeGreaterThan(src[i]));
  });

  it("swatchPatch adds fill only for filled closed shapes", () => {
    const sw = SWATCHES[1]; // red
    expect(swatchPatch(sw, "box", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "diamond", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "ellipse", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "box", false).fill).toBeUndefined();
    expect(swatchPatch(sw, "line", true).fill).toBeUndefined();
    expect(swatchPatch(sw, "text", true).fill).toBeUndefined();
    expect(swatchPatch(sw, "box").fill).toBeUndefined(); // default filled=false
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- --run lib/annotation-palette.test.ts`
Expected: FAIL — `fillForStroke` / `mixToWhite` not exported; `swatchPatch` has no `fill`.

- [ ] **Step 3: Add `mixToWhite` + `fillForStroke`**

In `lib/annotation-palette.ts`, after `swatchByStroke`:

```ts
/** Blend a `#rrggbb` hex toward white by `amount` (0–1). A malformed hex is
 *  returned unchanged. */
export function mixToWhite(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The light interior tint paired with a stroke: the exact swatch fill when the
 *  stroke is a swatch stroke, else a lightened tint of the stroke (so custom
 *  colors still get a sensible fill). */
export function fillForStroke(stroke: string): string {
  const id = swatchByStroke(stroke);
  if (id) return SWATCHES.find((s) => s.id === id)!.fill;
  return mixToWhite(stroke, 0.85);
}
```

- [ ] **Step 4: Extend `swatchPatch` with a `filled` flag**

Replace `swatchPatch` in `lib/annotation-palette.ts` with:

```ts
/** The immutable patch a swatch applies to a shape: stroke + swatchId, plus
 *  `color` for text (whose visible color is `color`, not `stroke`), plus the
 *  paired `fill` when `filled` and the kind is a closed shape. */
export function swatchPatch(
  sw: Swatch,
  kind: string,
  filled = false,
): { stroke: string; swatchId: string; color?: string; fill?: string } {
  const patch: {
    stroke: string;
    swatchId: string;
    color?: string;
    fill?: string;
  } = { stroke: sw.stroke, swatchId: sw.id };
  if (kind === "text") patch.color = sw.stroke;
  if (filled && (kind === "box" || kind === "diamond" || kind === "ellipse"))
    patch.fill = sw.fill;
  return patch;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- --run lib/annotation-palette.test.ts`
Expected: PASS (existing 2-arg `swatchPatch` tests still pass — `filled` defaults to `false`).

- [ ] **Step 6: Full gates + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all green.

```bash
git add lib/annotation-palette.ts lib/annotation-palette.test.ts
git commit -m "feat: fillForStroke + mixToWhite helpers; swatchPatch carries paired fill"
```

---

### Task 5: Fill UI wiring (toggle + recolor re-pairing)

Wire the Fill toggle into the context row and re-pair fill everywhere the stroke can change. No unit tests (component wiring — build- and manually-verified). **Run the app** — this touches store-driven selectors/patches.

**Files:**
- Modify: `components/editor/AnnotationContext.tsx` (import `fillForStroke`; custom color input; add Fill checkbox)
- Modify: `components/editor/AnnotationPalette.tsx` (`applySwatch` at ~line 65)
- Modify: `components/editor/AnnotationSelectionPopover.tsx` (`applySwatch` at ~line 100)

**Interfaces:**
- Consumes: `fillForStroke`, `swatchPatch(sw, kind, filled)` (Task 4); `shape.fill`, `shape.kind` (Task 2 for `"ellipse"`).
- Produces: nothing downstream (leaf UI).

- [ ] **Step 1: Import `fillForStroke` into AnnotationContext**

In `components/editor/AnnotationContext.tsx`, add to the `@/lib/annotation-palette` import (there is no existing import from it — add one):

```ts
import { fillForStroke } from "@/lib/annotation-palette";
```

- [ ] **Step 2: Re-pair fill in the custom color input**

In `AnnotationContext.tsx`, replace the stroke color input's `onChange` (the first `<input type="color">`, currently `onChange={(e) => updateAnnotation(ci, si, shape.id, { stroke: e.target.value })}`) with:

```tsx
          onChange={(e) => {
            const stroke = e.target.value;
            updateAnnotation(
              ci,
              si,
              shape.id,
              shape.kind !== "connector" && shape.fill != null
                ? { stroke, fill: fillForStroke(stroke) }
                : { stroke },
            );
          }}
```

- [ ] **Step 3: Add the Fill checkbox for closed shapes**

In `AnnotationContext.tsx`, inside the first `.anno-context-row` (the one holding the color + `.anno-w` width inputs), after the width `<input>`, add:

```tsx
        {shape.kind === "box" || shape.kind === "diamond" || shape.kind === "ellipse" ? (
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.fill != null}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, {
                  fill: e.target.checked ? fillForStroke(shape.stroke) : undefined,
                })
              }
            />
            Fill
          </label>
        ) : null}
```

- [ ] **Step 4: Pass `filled` from the palette's `applySwatch`**

In `components/editor/AnnotationPalette.tsx` (~line 65):

```tsx
    if (selected)
      updateAnnotation(
        ci,
        si,
        selected.id,
        swatchPatch(sw, selected.kind, selected.kind !== "connector" && selected.fill != null),
      );
```

- [ ] **Step 5: Pass `filled` from the popover's `applySwatch`**

In `components/editor/AnnotationSelectionPopover.tsx` (~line 100):

```tsx
  const applySwatch = (sw: Swatch) =>
    updateAnnotation(
      ci,
      si,
      shape.id,
      swatchPatch(sw, shape.kind, shape.kind !== "connector" && shape.fill != null),
    );
```

- [ ] **Step 6: Gates + manual verification**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all green.

Manual (run `pnpm dev` — required for store/selector changes):
- Select a box / diamond / circle → a **Fill** checkbox appears; line / bracket / text / connector show none.
- Toggle Fill on → soft interior tint in the swatch's paired color; toggle off → outline only.
- With Fill on, pick a different swatch (palette **and** popover) → the fill re-pairs to the new color; pick a custom color → the fill re-pairs (lightened).
- No console crash on selecting shapes on a fresh page (guards the snapshot-selector regression).
- Export the PDF (`/<slug>/pdf`) → the fill matches the canvas exactly (full opacity).

- [ ] **Step 7: Commit**

```bash
git add components/editor/AnnotationContext.tsx components/editor/AnnotationPalette.tsx components/editor/AnnotationSelectionPopover.tsx
git commit -m "feat: opt-in Fill toggle for closed shapes with recolor re-pairing"
```

---

## Self-Review (completed)

- **Spec coverage:** ellipse primitive (T2/T3), fill helper + patch (T4), fill toggle + re-pair (T5), WYSIWYG render (T3 ellipse case + existing box/diamond fill paint), ADR (T1), tests (T2/T4). All spec sections mapped.
- **Placeholder scan:** none — every code step shows the exact code.
- **Type consistency:** `swatchPatch(sw, kind, filled)` signature identical at all three call sites; `filled` guarded by `kind !== "connector"` because `Connector` has no `fill`; `snapAnchors` exported in T2 before it is imported by the T2 test; `AnnotationTool` and `Surface.kind` both gain `"ellipse"` in T2 so `newSurface(tool)`/`buildDrawnShape` stay assignable; `fillForStroke`/`mixToWhite` defined in T4 before use in T5.

## Execution note

Task order respects dependencies: T1 (ADR) → T2 (ellipse core) → T3 (ellipse UI, needs T2's kind/tool) → T4 (fill core) → T5 (fill UI, needs T2's `ellipse` kind + T4's helpers). T3 and T4 are independent of each other.
