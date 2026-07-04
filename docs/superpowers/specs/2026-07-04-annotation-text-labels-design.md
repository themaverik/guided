# Annotation text labels + text-box frame (design)

**Date:** 2026-07-04
**Branch:** `feat/annotation-text-labels` (base `e443de3`)
**Status:** Approved — one bundled spec.

Two coupled text capabilities for annotations: give the standalone **text box** an
optional border + background (Piece A), and let **any shape carry a centered text
label** added by double-click (Piece B).

## Problem

- The `text` annotation renders as bare text — no border, no background. Authors
  want a framed callout-style text box with three independent colors.
- Shapes (box, circle, diamond, line, bracket) cannot carry a text label. Authors
  want to double-click a shape and type a caption that lives with that shape.

## Decisions (from brainstorming)

1. **Three-role model, reusing existing fields** (see below) — additive, no schema
   change, no migration.
2. **Piece B covers every shape kind** (closed and open), not just closed.
3. **In-shape text is always auto-centered** — no per-shape offset/nudge. The
   standalone Text tool remains for free placement.
4. **Text-box border + fill are opt-in** (off by default); existing text boxes
   unchanged.
5. **Open-shape labels sit centered at the shape's midpoint, and the label masks
   the stroke** (an opaque pill) so text never crosses the line/spine — the "small
   space" for the text. (A true stroke-gap is a possible later refinement.)
6. **Text-box fill is an INDEPENDENT color** (its own picker), not the
   stroke-paired tint used by closed-shape fill — the user asked for three
   independent colors (text / border / background).

## The three-role model (additive — no schemaVersion bump, no migration)

Every `Surface` already carries the fields; we apply them in three roles:

| Role | Fields | Notes |
|---|---|---|
| **Text** | `text`, `color`, `fontSize`, `fontFamily`, `align` | `color` = text color (defaults to `stroke`) |
| **Border** | `stroke`, `width` | `width: 0` = no border (text box default today) |
| **Background** | `fill` | independent color on a text box; unused on a shape with a label unless the shape itself is filled |

No new fields. `ADR-004` amendment documents the widened roles + in-shape labels.

## Piece A — text-box frame (opt-in)

**Rendering** (`components/renderer/AnnotationLayer.tsx`, the `kind:"text"` case):
the `.anno-text` div (already `width/height:100%`, `box-sizing:border-box`) gains
inline style:
- `background: s.fill` when `fill` is set,
- `border: ${s.width}px solid ${s.stroke}` when `width > 0`,
- `padding: 2px 4px` when either border or fill is present (so text isn't flush).

Text stays top-aligned (unchanged). WYSIWYG — same in preview and PDF.

**Controls** (`components/editor/AnnotationContext.tsx`, text branch):
- The existing top-row **color input already sets `stroke`** and the **width input
  sets `width`** — these become the border color + border width for a text box. Add
  a **Border** checkbox that toggles `width` between `0` and a default (`2`), so the
  border is genuinely opt-in and the width input only bites when on.
- Add a **Fill** checkbox (background on/off) + an **independent fill color**
  `<input type="color">` bound to `fill`. Toggling on seeds `fill` to a default
  (`#ffffff`); the color input then sets it independently of stroke.
- The text row keeps the existing text-color input (`color`), size, font, align.

Result: three independent color inputs for a text box — text (`color`), border
(`stroke`), background (`fill`).

## Piece B — in-shape text labels

### Placement helper `labelRect(s)` (pure, `lib/annotations.ts`, tested)

Returns the normalized rect the label occupies:
- **Closed** (`box` / `diamond` / `ellipse`): the shape bounds `{x, y, w, h}` — the
  label fills the shape, centered.
- **Open** (`line` / `bracket`): a generous box centered on the shape's midpoint
  `(cx, cy) = (x + w/2, y + h/2)`, size `LABEL_W = 0.3` × `LABEL_H = 0.1`
  (normalized), clamped to `[0,1]`. The visible label auto-sizes inside it (below).
- **text**: returns its own bounds (the text box positions its content directly).

### Rendering (`AnnotationLayer.tsx`)

A shared helper renders a label `<foreignObject>` at `labelRect(s)` when `s.text`
is non-empty:
- **Closed shape:** the existing shape element (rect / diamond path / ellipse) plus,
  wrapped in a `<g>`, a label whose inner div is `display:flex; align-items:center;
  justify-content:<align>; width/height:100%` — text centered vertically and
  horizontally over the shape (on top of any fill).
- **Open shape (line / bracket):** the existing stroke element plus a label whose
  **inner div is `inline-block` with an opaque `background` (page white `#ffffff`),
  padding, and rounded corners**, centered within the (generous) foreignObject via a
  flex container. The pill hugs the text and masks the stroke beneath it, so the
  line/spine appears to leave a clean space for the label.

New CSS class `.anno-shape-label` (renderer.css) for the centered/pill variants;
`.anno-text` (text box) unchanged except the new inline border/fill.

### Editing (`components/editor/PreviewAnnotations.tsx`)

- **`editTarget`** gate widens from `s.kind === "text"` to any surface being edited
  (`s.id === editingId && s.kind !== "connector"`).
- **Double-click** on any shape's hit region (box / ellipse / diamond / line /
  bracket, not just text) calls `selectAnnotation(a.id)` + `setEditingId(a.id)`.
- **`TextEditor`** positions at `labelRect(s)` (not raw bounds) so the inline editor
  sits where the label renders; for non-text kinds it centers (matching the render).
- Clearing the text (empty) removes the label (an empty `text` renders nothing).

### Controls (`AnnotationContext.tsx`)

The text controls row (size / font / align / text color) is shown when the selected
shape **has a label** (`shape.text != null`) **or** is a `kind:"text"` box. So once
a double-click adds text to a shape, its text controls appear; the shape's existing
stroke/width/fill controls remain its border/background.

## Out of scope (deferred)

- A true stroke-gap for open-shape labels (mask pill is the MVP).
- Nudging in-shape text off-center; multi-label per shape.
- Vertical-align control for the text box (stays top-aligned).
- Independent fill for closed *shapes* — they keep the stroke-paired tint from the
  circle+fill feature; only the text box gets an independent fill color here.

## Testing

Unit (vitest, `lib/**`):
- `lib/annotations.test.ts` — `labelRect`:
  - closed kind (`box`) → returns the bounds unchanged.
  - `ellipse` / `diamond` → bounds unchanged.
  - `line` → a `0.3 × 0.1` box centered on the midpoint `(x+w/2, y+h/2)`.
  - `bracket` → centered box on its bbox center.
  - clamping: a midpoint near an edge keeps the box within `[0,1]`.

Manual (build- and browser-verified; no DOM harness):
- Text box: toggle Border → outline in the border color; toggle Fill → background in
  an independently-chosen color; text color stays separate. All three render in the
  exported PDF.
- Double-click a rectangle / circle / diamond → type → text centers in the middle;
  double-click a line / bracket → the label sits at the midpoint and the stroke is
  masked behind it (no crossing). Clearing the text removes the label.
- Text controls (size/font/align/color) appear for a shape once it has a label.
- Export PDF → labels + frames render identically to the canvas.

Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` green.
**Run the app** for the editor/store changes (double-click + `editTarget` widening).

## Success criteria

- A text box can have an independent text color, border color, and background color,
  each opt-in for border/fill; renders identically in editor and PDF.
- Double-clicking any shape (closed or open) lets you type a label that lives with
  the shape: closed shapes center it; open shapes center it at the midpoint with the
  stroke masked so text never crosses the shape.
- Additive — no schemaVersion bump, no migration; existing books unchanged. ADR-004
  amended. typecheck / lint / suite / build green.
