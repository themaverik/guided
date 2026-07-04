# Closed-shape fill tint + Circle shape (design)

**Date:** 2026-07-04
**Branch:** `feat/closed-shape-fill-circle` (base `53cc0e3`)
**Status:** Approved — one bundled spec.

Piece 1 of the OKLCH color-system remainder. Bundles two tightly-coupled
closed-shape additions that touch the same renderer / palette / anchor surface:
an opt-in **fill tint** for closed shapes, and a new **Circle** (ellipse)
primitive that is itself a closed, fillable shape.

## Problem

- Annotation shapes are stroke-only. The 8 OKLCH swatches
  (`lib/annotation-palette.ts`) already carry a paired **light fill** hex
  (`Swatch.fill`, L≈0.96) and the schema already has `Surface.fill?`, but
  nothing sets or offers it — `swatchPatch` applies stroke only. Authors cannot
  highlight a region with a soft interior tint.
- The P0 shape set in `DESIGN.md` / the locked decisions lists **Circle**, but
  it was never built. Current `Surface.kind` = box / line / bracket / diamond /
  text / polygon. There is no ellipse/circle.

## Decisions (settled in brainstorming)

1. **WYSIWYG, single opacity everywhere.** Paint the swatch's paired light
   pastel at full opacity in *both* the editor canvas and the exported PDF.
   No `@media print` branch, no prop threading. This honors the project's
   "keep the renderer print-accurate to preview" guardrail. It **amends**
   `DESIGN.md §2.2`'s literal "on-canvas fill renders ~50% as a tint" — the
   L≈0.96 token already reads as a subtle tint at full opacity, so the split
   is unnecessary and WYSIWYG is preferred.
2. **Outline-only by default; fill is opt-in.** A newly drawn closed shape has
   no fill (as today). A per-shape **Fill** toggle opts in to the tint. Keeps
   the "outline a button" use case clean and stays consistent with existing
   books; existing shapes are unaffected (additive, no migration).
3. **Bundle circle + fill into one spec/branch** — both are closed-shape work
   over the same files.
4. **Kind `ellipse`, tool label "Circle."** Geometrically it is a free ellipse
   inscribed in the drag bounds (ISO-32000 `/Circle` is an ellipse in the
   Rect; `DESIGN.md` calls it "Circle"). Free aspect, like Box is a free
   rectangle. Shift-to-constrain a perfect circle is deferred (YAGNI).

## Data model (additive — no schemaVersion bump, no migration)

- **Fill:** reuse the existing `Surface.fill?: string`. Set only on the three
  **closed** kinds — `box`, `diamond`, `ellipse`. Absent = outline-only.
- **New kind `ellipse`:** add `"ellipse"` to the `Surface.kind` union
  (`lib/book-schema.ts:135`). No new fields — an ellipse reuses the rectangular
  `x/y/w/h` bounds (cx/cy/rx/ry are derived at render time).
- **ADR-004 amendment** documents both: the new `ellipse` primitive and the
  opt-in closed-shape fill semantics (WYSIWYG, full-opacity paired token).

## Fill — behavior

### The paired fill helper (`lib/annotation-palette.ts`, pure, tested)

```ts
/** Light interior tint paired with a stroke color. Exact swatch fill when the
 *  stroke is one of the 8 swatch strokes; otherwise a lightened tint of the
 *  stroke (sRGB mix toward white) so custom colors still get a sensible fill. */
export function fillForStroke(stroke: string): string {
  const id = swatchByStroke(stroke);
  if (id) return SWATCHES.find((s) => s.id === id)!.fill;
  return mixToWhite(stroke, 0.85); // ~85% toward white → an L≈0.96-ish tint
}
```

`mixToWhite(hex, amount)` is a small local pure helper: parse `#rrggbb`, blend
each channel toward 255 by `amount`, re-serialize. Guards a malformed hex by
returning it unchanged. Both `fillForStroke` and `mixToWhite` are unit-tested.

### The Fill toggle (`components/editor/AnnotationContext.tsx`)

For closed shapes only (`box` / `diamond` / `ellipse`), render a checkbox in
the first `.anno-context-row`, reusing the existing `.ctrl-check` class:

```tsx
{(shape.kind === "box" || shape.kind === "diamond" || shape.kind === "ellipse") ? (
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

### Re-pairing fill when the stroke changes

Fill must stay matched to the shape's stroke. Two recolor paths:

- **Swatch apply** — extend `swatchPatch` with a `filled` flag:

  ```ts
  export function swatchPatch(
    sw: Swatch,
    kind: string,
    filled = false,
  ): { stroke: string; swatchId: string; color?: string; fill?: string } {
    const patch = { stroke: sw.stroke, swatchId: sw.id } as {
      stroke: string; swatchId: string; color?: string; fill?: string;
    };
    if (kind === "text") patch.color = sw.stroke;
    if (filled && (kind === "box" || kind === "diamond" || kind === "ellipse"))
      patch.fill = sw.fill;
    return patch;
  }
  ```

  Call sites pass `shape.fill != null` as `filled`:
  - `AnnotationPalette.tsx:65` → `swatchPatch(sw, selected.kind, selected.fill != null)`
  - `AnnotationSelectionPopover.tsx:100` → `swatchPatch(sw, shape.kind, shape.fill != null)`
  - The draw-default seed (no selected shape) is unaffected: `filled` defaults
    to `false`, so new shapes stay outline-only.

- **Custom color input** (`AnnotationContext.tsx` `<input type="color">`) — when
  the shape is filled, include the re-derived fill in the same patch:

  ```tsx
  onChange={(e) => {
    const stroke = e.target.value;
    updateAnnotation(ci, si, shape.id,
      shape.fill != null ? { stroke, fill: fillForStroke(stroke) } : { stroke });
  }}
  ```

### Rendering — no opacity change

`components/renderer/AnnotationLayer.tsx` already paints `fill={s.fill ?? "none"}`
for box (line 46) and diamond (line 89) at full opacity. That **is** the WYSIWYG
behavior — preview and Playwright PDF render identically (fill is data-driven, so
it correctly flows to `/print`). The only renderer addition is the new **ellipse
render case** (below), which paints `fill={s.fill ?? "none"}` the same way.

## Circle (ellipse) — mirrors the diamond

The diamond is the closest analog: rectangular bounds, edge + center anchors,
no corner anchors. The ellipse reuses that plumbing everywhere.

| File | Change |
|---|---|
| `lib/book-schema.ts` | `+ "ellipse"` in the `Surface.kind` union |
| `lib/book-mutations.ts` `newSurface` | `if (kind === "ellipse") return { ...base, kind, x: 0.35, y: 0.3, w: 0.3, h: 0.3 }` |
| `lib/store.tsx` `AnnotationTool` | `+ "ellipse"` in the tool union |
| `components/editor/AnnotationPalette.tsx` `TOOLS` | `+ { tool: "ellipse", label: "Circle", icon: <circle cx="7" cy="7" r="4.5" /> }` (place after Diamond) |
| `lib/annotations.ts` `DrawKind` | `+ "ellipse"` |
| `lib/annotations.ts` `DRAW_DEFAULTS` | `ellipse: { w: 0.3, h: 0.3 }` |
| `lib/annotations.ts` `anchorPoint` | add `ellipse` to the `box \|\| diamond \|\| text` branch (edge-midpoint math already gives the ellipse's bounding-box touch points) |
| `lib/annotations.ts` `snapAnchors` | add `ellipse` to the diamond branch → `["center","top","bottom","left","right"]` (corners are empty space on an ellipse) |
| `components/renderer/AnnotationLayer.tsx` `SurfaceShape` | new `ellipse` case (below) |
| `components/editor/PreviewAnnotations.tsx` | `collectSnapTargets` rect-kind check (line 68) `+ ellipse`; `surfaceAnchors` (line 78) `+ ellipse` → diamond set; hit-region render (line ~454) `+ ellipse` case |
| `lib/annotation-draw.ts` `buildDrawnShape` | **no change** — ellipse rides the generic surface path once it is a valid tool / DrawKind / kind |

### Ellipse render case (`SurfaceShape`)

```tsx
if (s.kind === "ellipse") {
  return (
    <ellipse
      cx={pct(s.x + s.w / 2)}
      cy={pct(s.y + s.h / 2)}
      rx={pct(s.w / 2)}
      ry={pct(s.h / 2)}
      stroke={s.stroke}
      strokeWidth={s.width}
      fill={s.fill ?? "none"}
    />
  );
}
```

`pct` maps normalized 0–1 to SVG `%`; the layer's `preserveAspectRatio="none"`
already handles non-uniform scaling of the overlay, so a free ellipse renders
correctly at any aspect. (`rx`/`ry` as `%` resolve against the viewport width /
height respectively — consistent with how box `width`/`height` use `%`.)

### Ellipse hit region (`PreviewAnnotations`)

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

Move / resize handles are bounding-box based and kind-agnostic (they read
`a.x/y/w/h` and the measured `rect`), so the circle inherits drag-move and
corner/edge resize for free, exactly like the diamond.

## Out of scope (deferred)

- The `@media print` tint split (rejected — WYSIWYG chosen).
- `@theme` CSS tokens (OKLCH remainder piece 3) and callout unification
  (piece 2) — separate later cycles.
- The PDF `/C` `/IC` CMYK inspector readout from `DESIGN.md §2.2`.
- Shift-to-constrain a perfect circle; polygon authoring; fill for
  line/bracket/text (they are not closed).

## Testing

Unit (vitest, `lib/**/*.test.ts`):

- `annotation-palette.test.ts`
  - `fillForStroke("#024450")` → `"#e6f1f2"` (exact Ink swatch fill); every
    swatch stroke → its exact paired fill.
  - `fillForStroke("#123456")` (non-swatch) → a lighter hex than the input
    (each channel ≥ input, ≤ 255) via `mixToWhite`.
  - `swatchPatch(sw, "box", true).fill === sw.fill`; `swatchPatch(sw, "box", false).fill === undefined`; `swatchPatch(sw, "line", true).fill === undefined` (open kind never filled); `swatchPatch(sw, "ellipse", true).fill === sw.fill`.
- `annotation-draw.test.ts`
  - `buildDrawnShape("ellipse", a, b, style)` → `kind: "ellipse"` with drag
    bounds and **no `fill`** (outline-only default).
- `annotations.test.ts`
  - `anchorPoint({kind:"ellipse",...}, "right")` → right edge midpoint (same
    math as box/diamond).
  - `snapAnchors("ellipse")` → `["center","top","bottom","left","right"]`.
  - `boundsFromDrag(a, b, "ellipse")` → the min/max rect (same as box).

Manual (build- and browser-verified; no DOM test harness by design):

- Draw a Circle from the palette; it rubber-bands and selects like a Box.
- Select a box/diamond/circle → the Fill checkbox appears; toggle on → light
  interior tint; toggle off → outline only. (Line/bracket/text show no Fill.)
- Recolor a filled shape via a swatch and via the custom color input → fill
  re-pairs to the new stroke.
- Connector endpoints snap to the circle's center + four edge points.
- Export the PDF (`/<slug>/pdf`) → the fill renders identically to the canvas
  (WYSIWYG), at full opacity.

Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` — all
green. **Run the app** for the palette/store change (a fresh-array Zustand
selector regression is invisible to diff-only review).

## Success criteria

- A **Circle** tool draws a fillable ellipse that behaves like the diamond
  (draw, select, move, resize, snap, delete) in both layout modes.
- Closed shapes (box / diamond / circle) have an opt-in **Fill** toggle;
  filled interiors use the swatch's paired light token and re-pair on recolor.
- Fill renders **identically** in the editor and the exported PDF (WYSIWYG,
  full opacity); no `@media print` branch.
- Additive: no schemaVersion bump, no migration; existing books unchanged.
  ADR-004 amended. typecheck / lint / suite / build green; no unused imports.
