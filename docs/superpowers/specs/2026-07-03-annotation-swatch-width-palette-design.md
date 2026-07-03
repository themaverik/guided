# On-canvas swatch palette + width presets (design)

**Date:** 2026-07-03
**Branch:** `feat/annotation-swatch-width-palette` (base `09e1bc1`)
**Status:** Approved — proceeding to implementation plan.

## Context

SP1 (`feat/floating-annotation-palette`, shipped) put annotation authoring on the
canvas: a floating `AnnotationPalette` sets the active tool and a **draw color** via a
plain `<input type="color">` chip plus six arbitrary hex presets. Two gaps remain from
the design system:

1. **Color is ad-hoc.** DESIGN.md §2.2 defines an **8-swatch OKLCH paired-token
   palette** (fill + stroke per hue) as the single color source for annotations *and*
   callouts. The SP1 chip ignores it. ROADMAP flags "the full OKLCH swatch palette is
   the immediate next item (swap-in point is the plain-hex color chip in SP1)."
2. **No stroke-width control on the canvas.** Width is only editable as a raw number in
   the left panel (`AnnotationEditor`, `min 1 / max 12`). The user wants **predefined
   width presets** offered next to the shape + color controls on the canvas.

This slice adds both to the on-canvas palette.

### Scope decisions (locked with the user)

- **Color behavior = stroke + `swatchId` only.** Picking a swatch sets the shape's
  `stroke` to the token's stroke hex and persists `swatchId`. **Deferred** to the later
  "OKLCH color system" slice: paired fill tint, the Fill/No-fill toggle, the
  editor-tint-vs-export-full-opacity split, callout unification, and `@theme` CSS
  tokens. This slice therefore needs **no renderer/print change**.
- **Width presets = 4 steps:** Thin `1` · Medium `2` (current default) · Thick `4` ·
  Heavy `6`.
- **Home = the on-canvas `AnnotationPalette`.** The left panel stays untouched (its
  cleanup is the separate SP3 backlog item).
- **Initial draw color defaults to Ink `#024450`** (the brand anchor), replacing the
  non-palette `#658995` as the on-canvas draw default, so a swatch reads as active from
  the start. Editor-only.

### Why no schema change

`lib/book-schema.ts` already carries `swatchId?: string` on both `Surface` and
`Connector` (groundwork from PRD Decision 10), and `Surface.fill?`. The renderer already
reads `stroke`/`width`. So this slice only writes existing fields — **no schema change,
no migration, no ADR** (it is a pure editor affordance; ADR-004 already covers the
annotation authoring surface).

## The palette module — `lib/annotation-palette.ts`

A new pure module is the single source of truth so the UI and tests share it.

```ts
export interface Swatch { id: string; label: string; fill: string; stroke: string }
export const SWATCHES: Swatch[] = [ /* 8 tokens, DESIGN.md §2.2 */ ];
//   ink    #e6f1f2 / #024450     red    #ffe8e4 / #cb4a47
//   orange #ffecd8 / #b56410     amber  #fef3d2 / #957800
//   green  #e0f7e4 / #369150     teal   #daf7f6 / #188d8d
//   blue   #e2f2ff / #217fd0     violet #f1edff / #8464cf

export interface WidthPreset { label: string; value: number }
export const WIDTH_PRESETS: WidthPreset[] = [
  { label: "Thin", value: 1 }, { label: "Medium", value: 2 },
  { label: "Thick", value: 4 }, { label: "Heavy", value: 6 },
];

export const DEFAULT_SWATCH_ID = "ink";
export function swatchByStroke(hex: string): string | undefined; // -> swatch id
```

- `fill` is used **only** to paint the swatch chip (bg = fill, 2px border = stroke, per
  DESIGN §Swatch). Only `stroke` is applied to shapes in this slice.
- `swatchByStroke` normalizes case and returns the matching swatch id, or `undefined`
  when the current color is off-palette (e.g. a left-panel hand-edit) — used to decide
  which chip renders active.

## Store — transient draw state (`lib/store.tsx`)

Mirror the existing `drawColor` with two new transient fields (editor/UI state only,
never persisted to the `Book`):

- `drawWidth: number` (default `2`) + `setDrawWidth(v)`
- `drawSwatch: string` (swatchId, default `DEFAULT_SWATCH_ID`) + `setDrawSwatch(id)`
- Initialize `drawColor` to Ink's stroke `#024450` (was `ANNO_STROKE = #658995`).

`ANNO_STROKE` and the `newSurface`/`newConnector` defaults in `lib/book-mutations.ts`
stay as-is; the on-canvas draw path overrides stroke/width/swatchId from the transient
state, and it is the real creation path.

## Palette UI — `AnnotationPalette.tsx`

Replace the `<input type="color">` chip + the six `PRESETS` hex buttons with two rows
after the tool group + divider:

1. **Swatch row** — the 8 tokens as chips (bg = fill, 2px border = stroke). Active chip =
   `swatchByStroke(drawColor)` (falls back to `drawSwatch`). Click →
   `setDrawColor(stroke)` + `setDrawSwatch(id)`; if a shape is selected,
   `updateAnnotation(ci, si, selected, { stroke, swatchId })` — and for a selected
   **text** surface also set `{ color: stroke }` (text's visible color is `color`, not
   `stroke`).
2. **Width row** — 4 line-weight chips (a short stroke preview at each weight). Active =
   chip whose `value === drawWidth`. Click → `setDrawWidth(v)`; if a shape is selected,
   `updateAnnotation(ci, si, selected, { width: v })`.

Both rows keep the existing behavior of applying to the current selection *and* setting
the draw default for the next shape. ARIA: chips are `<button>`s with
`aria-pressed` + a descriptive `aria-label` (e.g. `Color Red`, `Width Thick`).

## Draw path — `use-annotation-draw.ts`

`buildShape(tool, a, b, color)` gains `width` + `swatchId` params (read from the store's
`drawWidth` / `drawSwatch` alongside the existing `drawColor`). Newly drawn shapes carry:

- surfaces (non-text): `{ stroke: color, width, swatchId }`
- text: `{ color, width, swatchId }`
- connectors: `{ stroke: color, width, swatchId }`

No structural change — `newSurface`/`newConnector` still supply the rest of the shape;
these three fields are overridden from the transient draw state.

## Left panel — unchanged

`AnnotationEditor`'s raw `<input type="color">` + numeric width input stay and keep
working. When a swatch sets the stroke, the panel's color input reflects the new hex.
Editing width there to an off-preset value simply leaves no width chip highlighted. No
conflict; left-panel migration is the separate SP3 item.

## Testing (vitest — extends the existing suite)

`lib/annotation-palette.test.ts` (new):

- all 8 swatches have a valid 7-char hex `fill` and `stroke`, and unique ids;
- `swatchByStroke` round-trips every swatch stroke to its id, is case-insensitive, and
  returns `undefined` for an unknown hex;
- `WIDTH_PRESETS` are exactly `[1, 2, 4, 6]` and `DEFAULT_SWATCH_ID` resolves to a real
  swatch.

Extend the draw-path test so a shape built from `buildShape` carries `width` and
`swatchId` (surface, text, and connector cases), and text uses `color`.

`pnpm typecheck` + `pnpm lint` clean; full suite green.

## Out of scope (explicitly deferred)

Fill tint + Fill/No-fill toggle; export full-opacity split; callout unification onto the
palette; `@theme` CSS token migration; SP2 selection popover; SP3 left-panel migration.

## Success criteria

- The on-canvas palette shows the 8 OKLCH swatches (chip = fill bg + stroke border) and
  4 width chips; the active swatch + width are highlighted from initial state (Ink,
  Medium).
- Picking a swatch sets the draw color and persists `swatchId`; picking a width sets the
  draw width; both also apply to a currently-selected shape (text color included).
- A shape drawn after choosing a swatch + width is created with that stroke, width, and
  `swatchId`.
- Renderer/print output is byte-unchanged; no schema change; no migration.
- New + extended unit tests pass; typecheck + lint clean; full suite green.
