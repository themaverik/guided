# Editor Improvement rev6 — Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per-task review by **staff-engineer + frontend-developer** agents (in parallel) before moving on, under **karpathy-guidelines** discipline (surgical changes, simplest thing that works, verifiable success).

**Goal:** Ship the three surgical, no-schema rev6 improvements — darker blue/purple swatch strokes, multi-line + correctly-aligned text labels, and a draggable selection popover.

**Architecture:** Pure CSS/logic edits inside `annotation-palette.ts`, `globals.css`, `AnnotationLayer.tsx`/renderer CSS, `PreviewAnnotations.tsx`/editor CSS, and `AnnotationSelectionPopover.tsx`. No `Book` schema field changes; no ADR gate. The colour swap is data that already flows to render (swatch tokens); the newline fix is data-driven render; the popover offset is editor-only session state.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4 (`@theme` in `app/globals.css`), Zustand store, Vitest.

## Global Constraints

- All schema additive/none this wave — **no `schemaVersion` bump, no migration.**
- **Immutability:** any `Book` edit goes through `lib/book-mutations.ts`. (This wave has none — colour/label/popover changes are palette/CSS/component-state.)
- **`Book` JSON is the source of truth**; HTML/PDF are derived-only.
- Keep the renderer **print-accurate**; the newline + colour changes must render identically in the editor preview and the `/print` export.
- Base `main` `f7828bb`, branch `feature/improvement-rev6`.
- Gate every task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.

---

## File Structure

- `lib/annotation-palette.ts` — swap two `SWATCHES` stroke hexes (blue, violet).
- `app/globals.css` — mirror `--swatch-blue-stroke` / `--swatch-violet-stroke`.
- `lib/swatch-tokens.test.ts` — existing drift test; no edit, it re-verifies.
- `components/editor/PreviewAnnotations.tsx` — `TextEditor` `innerText` capture.
- `components/renderer/AnnotationLayer.tsx` — `.anno-shape-label` / `.anno-text` render (verify `white-space`).
- `components/renderer/renderer.css` — `white-space: pre-wrap` on label/text classes.
- `components/editor/editor.css` — `white-space: pre-wrap` on `.anno-text.editing`; `.anno-popover` drag affordance.
- `components/editor/AnnotationSelectionPopover.tsx` — drag handle + per-id offset.

---

## Task 1: Darker blue + purple swatch strokes (#4)

**Files:**
- Modify: `lib/annotation-palette.ts:21-22`
- Modify: `app/globals.css:45,47`
- Test: `lib/swatch-tokens.test.ts` (existing — no edit)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SWATCHES` blue/violet strokes are `#1A5FB4` / `#6740B8`; `--swatch-blue-stroke` / `--swatch-violet-stroke` mirror them; info callouts inherit the new blue via `--color-info-*`.

- [ ] **Step 1: Run the drift test as a baseline (currently passes)**

Run: `pnpm test -- swatch-tokens`
Expected: PASS (old values in sync).

- [ ] **Step 2: Update the two swatch strokes**

In `lib/annotation-palette.ts`, change only these two lines:

```ts
  { id: "blue", label: "Blue", fill: "#e2f2ff", stroke: "#1A5FB4" },
  { id: "violet", label: "Violet", fill: "#f1edff", stroke: "#6740B8" },
```

Leave `ink` and every other swatch untouched.

- [ ] **Step 3: Run the drift test to verify it now FAILS**

Run: `pnpm test -- swatch-tokens`
Expected: FAIL — `--swatch-blue-stroke`/`--swatch-violet-stroke` no longer match `SWATCHES`.

- [ ] **Step 4: Mirror the `@theme` tokens**

In `app/globals.css`, change only these two declarations:

```css
--swatch-blue-stroke: #1A5FB4;
--swatch-violet-stroke: #6740B8;
```

(The test lowercases before comparing, so casing is fine. Info callouts read `--swatch-blue-stroke` via `--color-info-*` and pick this up automatically — intended.)

- [ ] **Step 5: Run the drift test to verify PASS**

Run: `pnpm test -- swatch-tokens`
Expected: PASS.

- [ ] **Step 6: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/annotation-palette.ts app/globals.css
git commit -m "style: darken blue and violet annotation swatch strokes"
```

**Manual verify:** draw a blue + violet annotation and an info callout; the blue/purple borders read deeper; ink unchanged.

---

## Task 2: Multi-line + aligned text labels (#3a)

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx:830,838` (`TextEditor` capture)
- Modify: `components/renderer/renderer.css` (`.anno-shape-label span`, `.anno-text`)
- Modify: `components/editor/editor.css:635` (`.anno-text.editing`)
- Modify: `components/renderer/AnnotationLayer.tsx` (only if a class lacks the span it needs — verify first)

**Interfaces:**
- Consumes: existing `LabelBox`, `ShapeLabel`, `.anno-text` render; `TextEditor` overlay.
- Produces: labels persist `\n` and render each line; edit overlay wraps identically; alignment matches while typing and rendered.

- [ ] **Step 1: Capture newlines in the editor**

In `components/editor/PreviewAnnotations.tsx`, in `TextEditor`, replace both `e.currentTarget.textContent` reads with `e.currentTarget.innerText`:

```tsx
          onInput={(e) => onChange(e.currentTarget.innerText ?? "")}
          ...
          onBlur={(e) => {
            onChange(e.currentTarget.innerText ?? "");
            onDone();
          }}
```

(`innerText` preserves the contentEditable's `<div>`/`<br>` line breaks as `\n`; `textContent` collapses them.)

- [ ] **Step 2: Render newlines — renderer CSS**

In `components/renderer/renderer.css`, add `white-space: pre-wrap;` to the label + text rules. Find `.anno-shape-label span` (the `<span>` inside `LabelBox`, `AnnotationLayer.tsx:47-50`) and `.anno-text` (the free-text div, `AnnotationLayer.tsx:173`). If a `.anno-shape-label span` rule does not exist yet, add one:

```css
.anno-shape-label span { white-space: pre-wrap; }
.anno-text { white-space: pre-wrap; }
```

(Search the file first; extend the existing rule if present rather than duplicating.)

- [ ] **Step 3: Render newlines — editor overlay CSS**

In `components/editor/editor.css`, add `white-space: pre-wrap;` to `.anno-text.editing` (`:635`) so the live editor shows the breaks it is capturing.

- [ ] **Step 4: Verify alignment parity**

Confirm the `.anno-editwrap` justify (driven from `a.align`, `PreviewAnnotations.tsx:793-794,815-816`) and the rendered `LabelBox` justify (`AnnotationLayer.tsx:44`) resolve identically for `left`/`center`/`right`/unset. For a closed-shape label (box/diamond/ellipse — the fill-bounds path), the default should render centred both while editing and rendered. Fix any divergence by aligning the overlay's `justifyContent`/`textAlign` to the render values; make no other change.

- [ ] **Step 5: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add components/editor/PreviewAnnotations.tsx components/renderer/renderer.css components/editor/editor.css
git commit -m "fix: preserve newlines and alignment in annotation text labels"
```

**Manual verify (no DOM test harness — repo convention):** on a box label and a connector label, type two lines; confirm the break survives blur → reopen → `/print`; type left- and right-aligned labels and confirm no jump between typing and rendered.

---

## Task 3: Draggable selection popover (#1)

**Files:**
- Modify: `components/editor/AnnotationSelectionPopover.tsx`
- Modify: `components/editor/editor.css:1376` (`.anno-popover` — grip cursor/affordance)

**Interfaces:**
- Consumes: `popoverPlacement(box, size, viewport, gap)` (`lib/annotation-popover.ts:32`), `shapeBounds`.
- Produces: popover renders at `popoverPlacement(...) + offset`, where `offset` is a per-annotation `{dx,dy}` held in component state (never persisted). Re-clamped inside the container.

- [ ] **Step 1: Add per-id offset state**

In `AnnotationSelectionPopover.tsx`, add component state:

```tsx
const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
```

Reset it when the step changes (a `useEffect` keyed on `ci, si` that calls `setOffsets({})`), so offsets are session- and step-scoped ("per annotation").

- [ ] **Step 2: Apply the offset after auto-placement, re-clamped**

Where `pl = popoverPlacement(...)` is computed (`:81`), add the current shape's offset and clamp back inside the container so it can't leave the viewport:

```tsx
const off = shape ? offsets[shape.id] ?? { dx: 0, dy: 0 } : { dx: 0, dy: 0 };
const size = pop ? { w: pop.offsetWidth, h: pop.offsetHeight } : { w: 240, h: 40 };
const top = Math.max(POPOVER_GAP, Math.min(pl.top + off.dy, cr.height - size.h - POPOVER_GAP));
const left = Math.max(POPOVER_GAP, Math.min(pl.left + off.dx, cr.width - size.w - POPOVER_GAP));
setPos({ top, left });
```

Add `offsets` to the `useLayoutEffect` dependency array.

- [ ] **Step 3: Add a drag handle to the popover bar**

Prepend a grip element inside `.anno-popover-row` (or make the popover bar's empty area draggable). On `onPointerDown` of the grip, record the start pointer + start offset, `setPointerCapture`, and on `pointermove` update `offsets[shape.id]` by the pointer delta; release on `pointerup`. Guard against starting a drag from the swatch/width/delete buttons (only the grip starts a drag).

```tsx
const dragRef = useRef<{ id: string; startX: number; startY: number; base: { dx: number; dy: number } } | null>(null);
const onGripDown = (e: React.PointerEvent) => {
  if (!shape) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  dragRef.current = { id: shape.id, startX: e.clientX, startY: e.clientY, base: offsets[shape.id] ?? { dx: 0, dy: 0 } };
};
const onGripMove = (e: React.PointerEvent) => {
  const d = dragRef.current;
  if (!d) return;
  setOffsets((o) => ({ ...o, [d.id]: { dx: d.base.dx + (e.clientX - d.startX), dy: d.base.dy + (e.clientY - d.startY) } }));
};
const onGripUp = () => { dragRef.current = null; };
```

Render the grip (e.g. a `⠿` / two-row-dots span) as the first child of the row with `className="anno-popover-grip"`, wired to these handlers.

- [ ] **Step 4: Grip affordance CSS**

In `editor.css`, add a `.anno-popover-grip { cursor: grab; }` (`:active { cursor: grabbing; }`) rule with small padding, matching the popover's muted palette.

- [ ] **Step 5: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add components/editor/AnnotationSelectionPopover.tsx components/editor/editor.css
git commit -m "feat: let the annotation selection popover be dragged aside"
```

**Manual verify:** select a shape whose popover covers it, drag the popover aside by the grip; it stays put while that shape is focused; selecting a different shape shows its own (un-offset) popover; changing steps resets offsets. Nothing is written to the project JSON.

---

## Self-Review

- **Spec coverage:** #4 → Task 1; #3a (newlines + centering) → Task 2; #1 → Task 3. All Wave 1 items covered.
- **Placeholders:** none — every code step has real content; manual-verify steps are explicit (repo has no DOM test harness for CSS/interaction).
- **Type consistency:** `offsets: Record<string,{dx,dy}>`, `popoverPlacement` return `{top,left,side}`, `innerText` string — consistent across steps.

## Execution Handoff

Recommended: **subagent-driven development** — fresh subagent per task, staff-engineer + frontend-developer review between tasks, under karpathy discipline.
