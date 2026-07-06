# Editor Polish Bundle (design)

**Date:** 2026-07-05
**Branch:** `feat/editor-polish-bundle` (base `main` `454956f`)
**Status:** Draft — awaiting user review.

Five small, additive, editor-only improvements bundled into one branch.
Executed via **subagent-driven development** with **karpathy-guidelines**
discipline; per-task review by **staff-engineer** + **frontend-developer**
agents. No schema/model change → no ADR-first gate; ADR-004 gets a light
amendment note for the two new annotation interactions.

## Global constraints

- **No schema/model change.** All five are behavioral/UI/CSS + one derived
  render value already wired. `schemaVersion` unchanged, no migration.
- **Editor-only, never prints.** Items 1, 2, 4c live in `components/editor/**`
  + editor CSS. `components/renderer/**` and the `/print` path are untouched.
  (4a changes page dimensions, which is data already flowing to render — that
  is the only one that affects output, and it's pre-wired.)
- **Immutability:** all `Book` edits go through `lib/book-mutations.ts`.
- **Pure geometry is unit-tested** (`lib/annotations.ts` helpers, vitest,
  following the existing `annotations.test.ts` style). UI/CSS/interaction is
  build- + manual-verified (no DOM test harness — repo convention).
- Suite stays green; net-new tests only for the pure helpers.

---

## 1 — Shape cycler (select overlapping annotations)

**Problem.** Each shape renders its own `onPointerDown → selectAnnotation(a.id)`
(`PreviewAnnotations.tsx:434–553`), so a click always grabs the topmost shape
under the cursor. Shapes stacked underneath are unreachable by click.

**Design.** **Alt/Option-click** cycles selection to the next rect-bearing shape
beneath the current one under the cursor; plain click keeps selecting the
topmost; cycling wraps. No new on-screen affordance.

- New pure helpers in `lib/annotations.ts`:
  - `hitStack(annotations, point): string[]` — ids of rect-bearing shapes
    (`box`, `diamond`, `ellipse`, `text`, `bracket`) whose normalized bounds
    contain `point`, in **top-to-bottom z order** (render order reversed).
  - `nextInStack(stack: string[], currentId: string | null): string | null` —
    the id after `currentId` in `stack`, wrapping; first id if `currentId` not
    in stack; `null` if stack empty.
- Wiring in `PreviewAnnotations.tsx`: on a shape's `onPointerDown`, if
  `e.altKey`, compute `hitStack` at the pointer and `selectAnnotation(nextInStack(stack, selectedAnnotation))`
  instead of the plain `selectAnnotation(a.id)`. Non-alt path unchanged.
- **Scope:** rect-bearing shapes only (they share the `x/y/w/h` bounds model
  `collectSnapTargets` already trusts). Lines/connectors keep plain
  topmost-click selection — point-on-segment hit-testing is out of scope for v1.

**Tests.** `hitStack` (containment, z-order, kinds filtered, empty), `nextInStack`
(wrap, current-absent, single, empty) in `annotations.test.ts`.

---

## 2 — Text label alignment while typing

**Problem.** The inline editor (`TextEditor`, `PreviewAnnotations.tsx:716–785`)
positions via `labelRect()` and, for open shapes/connectors, wraps the
contentEditable in `.anno-editwrap.centered`, whose
`justify-content: center` (`editor.css:642–656`) is hardcoded — so a
left/right-aligned label appears **centered while typing**, then snaps to its
`align` on blur. Jarring.

**Design.** Make the live editing overlay render at the shape's `align` so
what-you-type equals what-you-get.

- Drive the wrapper's `justify-content` from `a.align`
  (`left`→`flex-start`, `center`→`center`, `right`→`flex-end`, default `center`
  for the pill) via an inline style keyed off `a.align`, replacing the static
  `justify-content: center` in the `.centered` rule.
- Confirm the non-centered (text-annotation) path already matches — the div
  already uses `textAlign: a.align ?? "left"` at `:767`; if it diverges, align
  it the same way.
- Pure CSS/inline-style. No model change.

**Tests.** None (CSS/interaction). Manual: type a left- and right-aligned label,
confirm no jump on blur.

---

## 4a — Custom page-size width/height inputs

**Problem.** `PageSize` includes `"Custom"` and `PageConfig.custom?:{w,h}` (mm)
is fully wired to render (`pageDimensions()` `grid-math.ts:15–21`,
`pageVars()` → `--page-w/-h`), but `PageSettings.tsx` shows no way to enter the
dimensions — selecting "Custom" silently falls back to A4.

**Design.** When `pageConfig.size === "Custom"`, render two number inputs —
**Width (mm)** and **Height (mm)** — bound to `pageConfig.custom`, calling the
existing `updatePageConfig({ custom: { w, h } })`.

- Defaults on first switch to Custom: current resolved dims (or A4 `210×297`).
- Values represent the **portrait base** (orientation still swaps at render).
- Validation: clamp each to a sane range (**10–2000 mm**), guard `NaN`. Extract
  the clamp as a tiny pure helper (`clampPageMm`) with a unit test.
- No schema change.

**Tests.** `clampPageMm` (below min, above max, NaN, in-range). Manual: pick
Custom, type dims, confirm the sheet resizes in preview.

---

## 4b — File-drop-onto-cell image upload

**Problem.** Setting a grid cell's image requires opening `CellEditor` and using
the picker. Dragging an image file onto a cell does nothing (no drop handlers
exist anywhere in the editor).

**Design.** Drag an image file over a grid cell → drop-highlight; drop uploads
via the existing endpoint and sets it as that cell's image, **replacing** any
existing one.

- **DRY the upload:** extract the fetch currently inline in `ImagePicker.tsx:66–89`
  into `lib/upload-image.ts` → `uploadImage(slug, chapterId, file): Promise<{ filename: string } | { error: string }>`.
  `ImagePicker` switches to call it (behavior-preserving); the cell-drop path
  reuses it.
- Add `onDragOver` / `onDragLeave` / `onDrop` to the per-cell hit regions in
  `PreviewGridSelect.tsx` (which already knows `ci/si/ri/cidx` and calls
  `selectCell`). On drop: take the first file, client-side validate the
  extension (mirror the server's `IMAGE_RE`), `uploadImage(slug, chapter.id, file)`,
  then `setCellImage(ci, si, ri, cidx, filename)`. Non-images ignored.
- Drop-highlight: a `.grid-cell--drop` class toggled on dragover (editor CSS).
- `setCellImage` already replaces the primary image object → replace semantics
  come for free.
- **Reachability:** `slug` + the chapter's `id` are already available to the
  editor (same props `ImagePicker` receives); thread them to the drop handler.

**Tests.** `uploadImage` — a small unit test with `fetch` mocked (success →
`{filename}`, error → `{error}`); confirms the FormData fields. Drop wiring is
manual: drag a PNG onto a cell, confirm upload + image set + non-image ignored.

---

## 4c — Equal-spacing distribution guides

**Problem.** `snapAlign` (`annotations.ts:811`) snaps to sibling **edges/centers**
only. There is no "equal gap" (Figma-style distribution) snapping while dragging.

**Design.** While dragging a rect-bearing annotation, if it forms an equal gap
with sibling shapes on an axis, snap to it and draw distribution guides.

- New pure helper `snapDistribute(moving: Rect, siblings: Rect[], thrX: number, thrY: number): DistResult`
  in `annotations.ts`, run **alongside** `snapAlign` in the move-drag path
  (`PreviewAnnotations.tsx:260–266`); alignment wins ties, distribution fills the
  rest. Reuses the drag-start sibling rects (static during drag — fine).
- **Scope the algorithm to two well-defined, testable cases per axis (X and Y
  independent):**
  1. **Centered between two neighbors** — moving rect sits between two siblings;
     snap its center so gap-before == gap-after.
  2. **Match nearest sibling gap** — snap so the moving rect's gap to its nearest
     neighbor equals an existing sibling-to-sibling gap.
  Each within the same `thrX/thrY` pixel threshold `snapAlign` uses.
- **New guide primitive** (additive to `GuideLine`):
  ```ts
  export interface DistGuide { axis: "x" | "y"; at: number; from: number; to: number }
  export interface DistResult { dx: number; dy: number; guides: DistGuide[] }
  ```
  `at` = the cross-axis line, `from`/`to` = the equal-gap span. Rendered as short
  capped tick bars (distinct from `snapAlign`'s full-length lines) via a new
  `.preview-anno-distguide` class. Stored in the existing `activeGuides`-style
  transient state (a sibling `activeDistGuides`), cleared on drag end.
- **Siblings = rect-bearing annotations only** (filter the drag-start set to
  annotation rects; exclude the page rect and grid-cell/img-slot rects that
  `collectSnapTargets` also returns — distribution among page furniture is noise).
- **Out of scope:** distributing 3+ selected shapes at once; grid-cell
  distribution; connector/line distribution.

**Tests.** `snapDistribute` in `annotations.test.ts` following the `snapAlign`
suite: centered-between-two (X and Y), match-adjacent-gap, threshold not met (no
snap), no siblings, independent axes.

---

## Task breakdown (for the plan)

Ordered smallest-risk first so early tasks are warmups:

1. **Item 2** — align-while-typing (CSS/inline-style). No new test.
2. **Item 4a** — custom page-size inputs + `clampPageMm` (unit test).
3. **Item 1** — `hitStack`/`nextInStack` (unit tests) + Alt-click wiring.
4. **Item 4b** — extract `uploadImage` (unit test) + cell drop handlers + highlight.
5. **Item 4c** — `snapDistribute` + `DistGuide` (unit tests), then drag wiring +
   tick-guide render.
6. **Docs** — amend ADR-004 with the two new annotation interactions (Alt-click
   shape cycling; distribution snapping); update ROADMAP backlog markers.

## Out of scope (deferred)

- Line/connector participation in shape-cycling or distribution.
- Multi-select distribution; grid-cell distribution.
- Page-dimension unit switching (mm only); orientation-aware input labels.
- ISO-32000 annotation standardization (item 3 — user-deferred).

## Success criteria

- Alt-click cycles through overlapping rect shapes; plain click unchanged.
- Left/right-aligned labels render at their `align` while typing (no blur jump).
- Custom page size is enterable and resizes the sheet in preview + export.
- Dropping an image file on a grid cell uploads and sets it (replacing).
- Dragging a shape into an equal gap snaps with a distribution guide.
- `pnpm typecheck` / `lint` / `test` / `build` green; new pure helpers covered.
- No schema bump, no migration, renderer/print untouched. ADR-004 amended.
