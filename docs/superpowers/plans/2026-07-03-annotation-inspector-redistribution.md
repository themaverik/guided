# Annotation Inspector Redistribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all annotation editing off the left sidebar into a context-aware bottom `AnnotationPalette` (detail controls per selected shape) plus a minimal popover (color/width/delete), with the canvas handling direct manipulation.

**Architecture:** Consolidate the remaining option lists into `lib/annotation-options.ts`, extract the left panel's per-shape controls into a new `AnnotationContext` component (minus numeric coords / free-point / list), render it as a second row of the bottom palette when a shape is selected, trim the popover's connector row, and delete `AnnotationEditor` from `StepEditor`.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Zustand store, vitest (node env), pnpm.

## Global Constraints

- **Editor-only.** No renderer/print change: do not touch `components/renderer/**`, `app/[slug]/print/**`, `lib/book-render.ts`, `lib/book-schema.ts`, `lib/book-io.ts`, or persistence.
- **No schema change, no migration, no new ADR** (ADR-004 amendment only). Every relocated control writes existing fields via the store's `updateAnnotation`.
- **Annotations live in exactly two surfaces:** the context-aware bottom `AnnotationPalette` and the minimal popover. The left sidebar keeps only document structure.
- **Bottom palette contents when a shape is selected:** freeform color + width (all shapes); connector → routing + waypoint stepper + `from`/`to` endpoint (style / size / direction[square] / binding ref+anchor); text → font/size/align/color; bracket → orientation/flip.
- **Popover stays minimal:** swatches + width chips + delete `×` only (its SP2 connector row is removed).
- **Dropped (canvas-reachable or deliberately cut):** numeric coords x/y/w/h, endpoint free-point x/y, the shape list.
- **Pure logic in `lib/`;** vitest `include` is `lib/**/*.test.ts`, node env.
- **Verify each task:** `pnpm typecheck` 0, `pnpm lint` clean, `pnpm test -- --run` green, and (Tasks 3/5) `pnpm build` OK.

---

### Task 1: Consolidate the remaining option lists

Move `SIZES` / `ANCHORS` / `FONTS` / `FONT_LABELS` / `ALIGNS` out of `AnnotationEditor` into the shared `lib/annotation-options.ts` so `AnnotationContext` (Task 2) and the soon-deleted `AnnotationEditor` share one source.

**Files:**
- Modify: `lib/annotation-options.ts`
- Test: `lib/annotation-options.test.ts`
- Modify: `components/editor/AnnotationEditor.tsx` (import the lists instead of declaring them)

**Interfaces:**
- Produces: `SIZES: EndpointSize[]`, `ANCHORS: Anchor[]`, `FONTS: TextFont[]`, `FONT_LABELS: Record<TextFont, string>`, `ALIGNS: NonNullable<Surface["align"]>[]`.

- [ ] **Step 1: Write the failing test**

Add to `lib/annotation-options.test.ts` (new cases, keep existing):

```ts
import { SIZES, ANCHORS, FONTS, FONT_LABELS, ALIGNS } from "./annotation-options";

describe("annotation options — sizes/anchors/fonts/aligns", () => {
  it("endpoint sizes are small/medium/large", () => {
    expect(SIZES).toEqual(["small", "medium", "large"]);
  });
  it("anchors include center + edges + connector ends", () => {
    expect(ANCHORS).toEqual([
      "center", "top", "bottom", "left", "right",
      "top-left", "top-right", "bottom-left", "bottom-right",
      "start", "end", "mid",
    ]);
  });
  it("fonts each have a label", () => {
    expect(FONTS).toEqual(["sans", "serif", "mono", "open-sans", "montserrat", "roboto"]);
    for (const f of FONTS) expect(FONT_LABELS[f].length).toBeGreaterThan(0);
  });
  it("aligns are left/center/right", () => {
    expect(ALIGNS).toEqual(["left", "center", "right"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-options`
Expected: FAIL — `SIZES`/`ANCHORS`/`FONTS`/`FONT_LABELS`/`ALIGNS` are not exported.

- [ ] **Step 3: Add the lists to the shared module**

Append to `lib/annotation-options.ts` (and widen the type import on the first line to include `EndpointSize`, `Anchor`, `TextFont`, `Surface`):

```ts
import type {
  EndpointStyle,
  Connector,
  Endpoint,
  EndpointSize,
  Anchor,
  TextFont,
  Surface,
} from "@/lib/book-schema";

// (existing ENDPOINT_STYLES / ROUTINGS / DIRECTION_OPTIONS stay above)

export const SIZES: EndpointSize[] = ["small", "medium", "large"];

export const ANCHORS: Anchor[] = [
  "center", "top", "bottom", "left", "right",
  "top-left", "top-right", "bottom-left", "bottom-right",
  "start", "end", "mid",
];

export const FONTS: TextFont[] = [
  "sans", "serif", "mono", "open-sans", "montserrat", "roboto",
];
export const FONT_LABELS: Record<TextFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
  "open-sans": "Open Sans",
  montserrat: "Montserrat",
  roboto: "Roboto",
};

export const ALIGNS: NonNullable<Surface["align"]>[] = ["left", "center", "right"];
```

(Update the module's header comment's second line to note it now also carries size/anchor/font/align lists.)

- [ ] **Step 4: Point AnnotationEditor at the shared lists**

In `components/editor/AnnotationEditor.tsx`, delete the local `FONTS`, `FONT_LABELS`, `ALIGNS`, `SIZES`, `ANCHORS` declarations (lines ~23–54) and add them to the existing `annotation-options` import:

```tsx
import {
  ENDPOINT_STYLES,
  ROUTINGS,
  DIRECTION_OPTIONS,
  SIZES,
  ANCHORS,
  FONTS,
  FONT_LABELS,
  ALIGNS,
} from "@/lib/annotation-options";
```

Keep the `Anchor`, `EndpointSize`, `TextFont`, `Surface` type imports in `AnnotationEditor` — they are still used by the `as` casts.

- [ ] **Step 5: Run tests + verify**

Run:
```bash
pnpm test -- --run annotation-options
pnpm typecheck
pnpm lint
```
Expected: PASS (new + existing option tests); typecheck 0; lint clean (no unused/dupe).

- [ ] **Step 6: Commit**

```bash
git add lib/annotation-options.ts lib/annotation-options.test.ts components/editor/AnnotationEditor.tsx
git commit -m "refactor: consolidate size/anchor/font/align option lists into annotation-options"
```

---

### Task 2: `AnnotationContext` component

The per-shape detail controls, lifted from `AnnotationEditor` (minus numeric coords, free-point x/y, and the list), rewritten to take a single selected `shape`.

**Files:**
- Create: `components/editor/AnnotationContext.tsx`

**Interfaces:**
- Consumes: `updateAnnotation` (store); `resolveEndpoint` (`lib/annotations`); the option lists from `lib/annotation-options`.
- Produces: `export default function AnnotationContext({ ci, si, shape, annotations }: { ci: number; si: number; shape: Annotation; annotations: Annotation[] })`.

- [ ] **Step 1: Create the component**

Create `components/editor/AnnotationContext.tsx`:

```tsx
"use client";

/*
 * Context-aware annotation detail controls (bottom-palette context row). Given
 * the selected shape, renders its full editable properties: freeform color +
 * width for every shape, plus connector routing/waypoints/endpoints, text
 * font/size/align/color, and bracket orientation/flip. Position and size are
 * edited by dragging on the canvas — there are no numeric coordinate fields
 * here. Editor-only; writes via updateAnnotation.
 */
import type {
  Anchor,
  Annotation,
  Connector,
  Endpoint,
  EndpointSize,
  EndpointStyle,
  Surface,
  TextFont,
} from "@/lib/book-schema";
import { resolveEndpoint } from "@/lib/annotations";
import { useEditor } from "@/lib/store";
import {
  ENDPOINT_STYLES,
  ROUTINGS,
  DIRECTION_OPTIONS,
  SIZES,
  ANCHORS,
  FONTS,
  FONT_LABELS,
  ALIGNS,
} from "@/lib/annotation-options";

export default function AnnotationContext({
  ci,
  si,
  shape,
  annotations,
}: {
  ci: number;
  si: number;
  shape: Annotation;
  annotations: Annotation[];
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);

  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );

  const setWaypointCount = (c: Connector, n: number) => {
    const count = Math.max(0, Math.min(6, n));
    const cur = c.waypoints ?? [];
    let wps: { x: number; y: number }[];
    if (count <= cur.length) {
      wps = cur.slice(0, count);
    } else {
      wps = [...cur];
      const a = resolveEndpoint(annotations, c.from);
      const b = resolveEndpoint(annotations, c.to);
      while (wps.length < count) {
        const prev = wps.length ? wps[wps.length - 1] : a;
        wps.push({ x: (prev.x + b.x) / 2, y: (prev.y + b.y) / 2 });
      }
    }
    updateAnnotation(ci, si, c.id, { waypoints: wps.length ? wps : undefined });
  };

  const EndpointFields = ({ c, which }: { c: Connector; which: "from" | "to" }) => {
    const ep = c[which];
    const set = (patch: Partial<Endpoint>) =>
      updateAnnotation(ci, si, c.id, { [which]: { ...ep, ...patch } });
    return (
      <div className="anno-endpoint">
        <span className="anno-eplabel">{which}</span>
        <select
          value={ep.ref ?? ""}
          aria-label={`${which} binding`}
          onChange={(e) => set({ ref: e.target.value || undefined })}
        >
          <option value="">free point</option>
          {surfaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind} {s.id}
            </option>
          ))}
        </select>
        {ep.ref ? (
          <select
            value={ep.anchor ?? "center"}
            aria-label={`${which} anchor`}
            onChange={(e) => set({ anchor: e.target.value as Anchor })}
          >
            {ANCHORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={ep.style}
          aria-label={`${which} style`}
          onChange={(e) => set({ style: e.target.value as EndpointStyle })}
        >
          {ENDPOINT_STYLES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        {ep.style !== "none" ? (
          <select
            value={ep.size ?? "medium"}
            aria-label={`${which} size`}
            onChange={(e) => set({ size: e.target.value as EndpointSize })}
          >
            {SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>
        ) : null}
        {c.routing === "square" ? (
          <select
            value={ep.dir ?? ""}
            aria-label={`${which} direction`}
            title="Direction the connector runs at this end"
            onChange={(e) => set({ dir: (e.target.value || undefined) as Endpoint["dir"] })}
          >
            {DIRECTION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    );
  };

  const c: Connector | null = shape.kind === "connector" ? (shape as Connector) : null;

  return (
    <div className="anno-context">
      <div className="anno-context-row">
        <input
          type="color"
          value={shape.stroke}
          onChange={(e) => updateAnnotation(ci, si, shape.id, { stroke: e.target.value })}
          title="Custom color"
          aria-label="Custom color"
        />
        <input
          className="anno-w"
          type="number"
          min={1}
          max={12}
          value={shape.width}
          onChange={(e) =>
            updateAnnotation(ci, si, shape.id, { width: Number(e.target.value) || 1 })
          }
          title="Custom width"
          aria-label="Custom width"
        />
      </div>

      {c ? (
        <div className="anno-context-row">
          <select
            value={c.routing ?? "straight"}
            aria-label="Routing"
            onChange={(e) =>
              updateAnnotation(ci, si, c.id, {
                routing: e.target.value as Connector["routing"],
              })
            }
          >
            {ROUTINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="stepper" title="Waypoints (drag on canvas)">
            <button onClick={() => setWaypointCount(c, (c.waypoints?.length ?? 0) - 1)}>
              −
            </button>
            <span>{c.waypoints?.length ?? 0}</span>
            <button onClick={() => setWaypointCount(c, (c.waypoints?.length ?? 0) + 1)}>
              +
            </button>
          </div>
          <EndpointFields c={c} which="from" />
          <EndpointFields c={c} which="to" />
        </div>
      ) : null}

      {shape.kind === "text" ? (
        <div className="anno-context-row anno-text-ctrls">
          <label className="anno-num">
            size
            <input
              type="number"
              min={6}
              max={120}
              value={shape.fontSize ?? 16}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, {
                  fontSize: Math.max(6, Number(e.target.value) || 16),
                })
              }
            />
          </label>
          <select
            value={shape.fontFamily ?? "sans"}
            aria-label="Font"
            onChange={(e) =>
              updateAnnotation(ci, si, shape.id, { fontFamily: e.target.value as TextFont })
            }
          >
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {FONT_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            value={shape.align ?? "left"}
            aria-label="Align"
            onChange={(e) =>
              updateAnnotation(ci, si, shape.id, { align: e.target.value as Surface["align"] })
            }
          >
            {ALIGNS.map((al) => (
              <option key={al} value={al}>
                {al}
              </option>
            ))}
          </select>
          <input
            type="color"
            value={shape.color ?? shape.stroke}
            onChange={(e) => updateAnnotation(ci, si, shape.id, { color: e.target.value })}
            title="Text color"
            aria-label="Text color"
          />
        </div>
      ) : null}

      {shape.kind === "bracket" ? (
        <div className="anno-context-row">
          <select
            value={shape.orientation ?? "horizontal"}
            aria-label="Orientation"
            onChange={(e) =>
              updateAnnotation(ci, si, shape.id, {
                orientation: e.target.value as Surface["orientation"],
              })
            }
          >
            <option value="horizontal">horizontal</option>
            <option value="vertical">vertical</option>
          </select>
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.flip ?? false}
              onChange={(e) => updateAnnotation(ci, si, shape.id, { flip: e.target.checked })}
            />
            Invert
          </label>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
pnpm typecheck
pnpm lint
```
Expected: 0 type errors (the `shape.kind === "text"`/`"bracket"` guards narrow to the Surface variant, so `fontSize`/`orientation`/`flip`/`align`/`color` are valid); lint clean. (Not mounted yet — Task 3 wires it in.)

- [ ] **Step 3: Commit**

```bash
git add components/editor/AnnotationContext.tsx
git commit -m "feat: AnnotationContext — per-shape detail controls for the bottom palette"
```

---

### Task 3: Render the context row in the palette + CSS

**Files:**
- Modify: `components/editor/AnnotationPalette.tsx`
- Modify: `components/editor/editor.css`

**Interfaces:**
- Consumes: `AnnotationContext` (Task 2); the palette's existing `selected` shape selector.

- [ ] **Step 1: Wrap the current bar in a main row and add the context row**

In `components/editor/AnnotationPalette.tsx`:

1. Add the import:
```tsx
import AnnotationContext from "./AnnotationContext";
```
2. Add an `annotations` selector next to the existing `selected` selector:
```tsx
  const annotations = useEditor(
    (s) => s.book.chapters[ci]?.steps[si]?.annotations ?? [],
  );
```
3. Wrap the existing children (the `TOOLS.map(...)`, the swatch `<span className="ap-div" />` + `SWATCHES.map(...)`, and the width `<span className="ap-div" />` + `WIDTH_PRESETS.map(...)`) in a `<div className="ap-main-row">…</div>`, and append the context row after it. The returned JSX becomes:

```tsx
  return (
    <div className="annotation-palette" role="toolbar" aria-label="Annotation tools">
      <div className="ap-main-row">
        {TOOLS.map(({ tool, label, icon }) => (
          <button
            key={tool}
            type="button"
            className={`ap-tool${activeTool === tool ? " active" : ""}`}
            aria-pressed={activeTool === tool}
            title={label}
            onClick={() => setActiveTool(tool)}
          >
            <svg viewBox="0 0 14 14" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
              {icon}
            </svg>
          </button>
        ))}
        <span className="ap-div" />
        {SWATCHES.map((sw) => (
          <button
            key={sw.id}
            type="button"
            className={`ap-swatch${activeSwatchId === sw.id ? " active" : ""}`}
            style={{ background: sw.fill, borderColor: sw.stroke }}
            title={sw.label}
            aria-label={`Color ${sw.label}`}
            aria-pressed={activeSwatchId === sw.id}
            onClick={() => applySwatch(sw)}
          />
        ))}
        <span className="ap-div" />
        {WIDTH_PRESETS.map((w) => (
          <button
            key={w.value}
            type="button"
            className={`ap-width${drawWidth === w.value ? " active" : ""}`}
            title={`${w.label} (${w.value})`}
            aria-label={`Width ${w.label}`}
            aria-pressed={drawWidth === w.value}
            onClick={() => applyWidth(w.value)}
          >
            <span className="ap-width-bar" style={{ height: w.value }} />
          </button>
        ))}
      </div>
      {selected ? (
        <AnnotationContext ci={ci} si={si} shape={selected} annotations={annotations} />
      ) : null}
    </div>
  );
```

(Leave the component's existing hooks, `applySwatch`, `applyWidth`, `activeSwatchId`, and `selected` selector unchanged above the return.)

- [ ] **Step 2: Restructure the palette CSS to a column + add context styles**

In `components/editor/editor.css`, change the `.annotation-palette` rule to stack vertically, and add the main-row + context rules. Replace the existing `.annotation-palette { … }` block with:

```css
.annotation-palette {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  max-width: min(92%, 900px);
  background: #fff;
  border: 1px solid #d7dede;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(2, 68, 80, 0.18);
}
.ap-main-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.anno-context {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #e8eded;
}
.anno-context-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.anno-context input[type="color"] {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid #dbe2e2;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
}
.anno-context select,
.anno-context .anno-num input,
.anno-context .anno-w {
  height: 28px;
  border: 1px solid #dbe2e2;
  border-radius: 7px;
  background: #fff;
  color: #024450;
  font-size: 12px;
  padding: 0 4px;
}
```

(The lifted controls reuse the existing `.anno-endpoint`, `.anno-eplabel`, `.anno-num`, `.anno-text-ctrls`, `.stepper`, `.ctrl-check` rules already in the file.)

- [ ] **Step 3: Verify typecheck, lint, suite, build**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```
Expected: typecheck 0; lint clean; suite green; build OK.

- [ ] **Step 4: Commit**

```bash
git add components/editor/AnnotationPalette.tsx components/editor/editor.css
git commit -m "feat: bottom palette grows a context row of detail controls on selection"
```

---

### Task 4: Trim the popover to minimal

**Files:**
- Modify: `components/editor/AnnotationSelectionPopover.tsx`

- [ ] **Step 1: Remove the connector row + its dead code**

In `components/editor/AnnotationSelectionPopover.tsx`:

1. Delete the entire connector-row block — the `{c ? ( … ) : null}` JSX (currently lines ~155–210, the second `.anno-popover-row` and everything inside it).
2. Delete the now-unused `c` constant and the `setEndpoint` helper (currently lines ~99 and ~105–106).
3. Trim imports: remove `ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS` (the whole `@/lib/annotation-options` import line), and remove `Connector`, `Endpoint`, `EndpointStyle` from the `@/lib/book-schema` type import — leaving `import type { Annotation } from "@/lib/book-schema";`.
4. Update the file header comment's second line: the popover now reflects color + width + delete only (drop the "+ connector endpoint/routing/direction" phrase).

The returned JSX keeps exactly the first `.anno-popover-row` (swatches + `ap-div` + widths + `ap-div` + the `mini-btn danger` `×`) and the surrounding `<div ref={popRef} className="anno-popover" …>` wrapper.

- [ ] **Step 2: Verify**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
```
Expected: typecheck 0; lint clean (no unused `Connector`/`Endpoint`/`EndpointStyle`/`c`/`setEndpoint`/option-list imports); suite green.

- [ ] **Step 3: Commit**

```bash
git add components/editor/AnnotationSelectionPopover.tsx
git commit -m "feat: trim selection popover to color/width/delete (connector detail moved to palette)"
```

---

### Task 5: Remove AnnotationEditor from the left sidebar

**Files:**
- Modify: `components/editor/StepEditor.tsx`
- Delete: `components/editor/AnnotationEditor.tsx`

- [ ] **Step 1: Remove the mount + import**

In `components/editor/StepEditor.tsx`:
1. Delete the import line `import AnnotationEditor from "./AnnotationEditor";` (line ~11).
2. Delete the annotations section at the end of the returned JSX — the `<h3 className="editor-subtitle">Annotations …</h3>` and the `<AnnotationEditor … />` line (lines ~100–104), leaving the closing `</section>`.

- [ ] **Step 2: Delete the component**

```bash
git rm components/editor/AnnotationEditor.tsx
```

- [ ] **Step 3: Remove now-dead annotation-editor CSS**

In `components/editor/editor.css`, delete the rules that were only used by `AnnotationEditor` and its per-shape cards: `.anno-editor`, `.anno-hint`, `.anno-item`, `.anno-item.selected`, `.anno-item-head`, `.anno-kind`, `.anno-item-head input[type="color"]`, `.anno-coords`, `.anno-item > select`. **Keep** `.anno-endpoint`, `.anno-eplabel`, `.anno-endpoint select`, `.anno-endpoint .anno-num`, `.anno-num`, `.anno-num input`, `.anno-text-ctrls`, `.anno-text-ctrls .anno-num`, `.anno-text-ctrls select`, `.anno-w`, `.ctrl-row`, `.ctrl-label`, `.ctrl-checks`, `.ctrl-check`, `.stepper*` — these are reused by `AnnotationContext`. If unsure whether a class is still referenced, grep before deleting: `grep -rn "anno-editor\|anno-item\|anno-coords\|anno-hint" components/`.

- [ ] **Step 4: Verify (nothing references the deleted file/classes)**

Run:
```bash
grep -rn "AnnotationEditor" components/ app/ || echo "no references"
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```
Expected: no `AnnotationEditor` references remain; typecheck 0; lint clean; suite green; build OK.

- [ ] **Step 5: Commit**

```bash
git add components/editor/StepEditor.tsx components/editor/editor.css
git commit -m "feat: remove AnnotationEditor from the left sidebar (annotations now on canvas surfaces)"
```

---

### Task 6: Docs + manual smoke

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/adr/ADR-004-annotation-canvas.md`

- [ ] **Step 1: Manual smoke (record result)**

Do NOT start a dev server / browser in an automated environment — if the extension is unavailable, mark deferred to human. When run by a human: select each shape kind and confirm the bottom palette shows its full controls (color+width always; connector routing/waypoints/from+to style·size·direction·binding; text font/size/align/color; bracket orientation/flip); the popover shows only color/width/delete; the left sidebar has no annotation section; move/resize still work by dragging on canvas; `/print` unchanged.

- [ ] **Step 2: Update ROADMAP + ADR-004**

In `ROADMAP.md`, under the annotation-palette epic, record that the inspector was redistributed: the left-panel `AnnotationEditor` was removed; annotations now edit via the context-aware bottom palette + minimal popover + canvas (branch `feat/annotation-inspector-redistribution`); numeric coords / free-point / shape-list dropped (canvas-reachable). Note this supersedes the SP3 "trim" draft.

In `docs/adr/ADR-004-annotation-canvas.md`, append a dated amendment (2026-07-03) in the file's existing `## Amendment (date): …` style: annotation editing consolidated onto two surfaces — a context-aware bottom `AnnotationPalette` (per-shape detail via `AnnotationContext`) and a minimal popover (color/width/delete) — plus canvas direct manipulation; `AnnotationEditor` removed; option lists fully consolidated in `lib/annotation-options.ts`; editor-only, no schema change; numeric coords / free-point / shape-list intentionally dropped.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md docs/adr/ADR-004-annotation-canvas.md
git commit -m "docs: ROADMAP + ADR-004 — annotation inspector redistribution"
```

---

## Self-Review

**Spec coverage:**
- Bottom palette context-aware detail controls → Tasks 2 (`AnnotationContext`) + 3 (wire + CSS). ✓
- Freeform color + width kept (all shapes) → Task 2 common row. ✓
- Connector style/size/direction/routing/binding/waypoints → Task 2. ✓ Text font/size/align/color; bracket orient/flip → Task 2. ✓
- Popover minimal (connector row removed) → Task 4. ✓
- Left sidebar `AnnotationEditor` removed + file deleted → Task 5. ✓
- Option lists consolidated → Task 1. ✓
- Dropped numeric coords / free-point / list → not carried into `AnnotationContext` (Task 2), list gone with the editor (Task 5). ✓
- No schema/renderer/print change → Global Constraints; renderer files untouched across all tasks. ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step; commands show expected output. ✓

**Type consistency:** `SIZES`/`ANCHORS`/`FONTS`/`FONT_LABELS`/`ALIGNS` (Task 1) imported verbatim by `AnnotationContext` (Task 2) and `AnnotationEditor` (Task 1, until deleted Task 5). `AnnotationContext({ ci, si, shape, annotations })` (Task 2) mounted with those exact props (Task 3). `updateAnnotation(ci, si, id, patch)` matches the store signature throughout. Popover trim (Task 4) leaves only `Annotation`-typed usage. ✓
