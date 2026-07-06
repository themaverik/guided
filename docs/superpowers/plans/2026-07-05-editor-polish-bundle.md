# Editor Polish Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five small, additive, editor-only improvements — overlapping-shape cycler, text-label alignment while typing, custom page-size inputs, file-drop-onto-cell upload, and equal-spacing distribution guides.

**Architecture:** Pure geometry/logic lands as unit-tested helpers in `lib/` (`hitStack`/`nextInStack`, `clampPageMm`, `uploadImage`, `snapDistribute`); the editor components (`PreviewAnnotations.tsx`, `PageSettings.tsx`, `PreviewGridSelect.tsx`, `ImagePicker.tsx`) consume them. No `Book` schema/model change; renderer and `/print` untouched.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Zustand, vitest.

## Global Constraints

- **No schema/model change.** `schemaVersion` unchanged; no migration. All edits additive.
- **Editor-only, never prints.** Items 1, 2, 4c live in `components/editor/**` + editor CSS. Do NOT touch `components/renderer/**` or the `/print` path. (4a changes page dimensions — data already wired to render — so it is the only one affecting output.)
- **Immutability:** all `Book` edits go through the store actions backed by `lib/book-mutations.ts`. Never mutate book state in place.
- **Pure helpers are unit-tested** (vitest, following `lib/annotations.test.ts` style). UI/CSS/interaction is build- + manual-verified — the repo has no DOM test harness; do NOT add one.
- **Zustand selector rule:** never return a fresh array/object literal from a `useEditor((s) => …)` selector — select primitives or stable references; default at the use-site. (A fresh-`[]` selector has shipped a crash here before.)
- **Trust `pnpm typecheck` / `pnpm build`, not the LSP snapshot** — module-not-found / not-exported diagnostics are routinely stale false alarms here.
- Suite stays green; net-new tests only for the pure helpers.

---

### Task 1: Text-label alignment while typing (Item 2)

The inline `TextEditor` wraps the contentEditable in `.anno-editwrap.centered`, whose `justify-content: center` (`editor.css:650`) is hardcoded — so a left/right-aligned label on an open shape/connector appears centered while typing, then snaps to its `align` on blur. Drive the wrapper's `justify-content` from the shape's `align` so what-you-type equals what-you-get. Pure CSS/inline-style; no unit test (manual-verified per repo convention).

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx` (the `TextEditor` component, ~717–785)
- Modify: `components/editor/editor.css:647-651` (`.anno-editwrap.centered`)

**Interfaces:**
- Consumes: `Annotation.align?` (`"left" | "center" | "right"`), already read at `:767`.
- Produces: nothing new.

- [ ] **Step 1: Remove the hardcoded centering from CSS**

In `components/editor/editor.css`, change the `.anno-editwrap.centered` rule (drop `justify-content` — it becomes inline-driven; keep flex + vertical centering):

```css
.anno-editwrap.centered {
  display: flex;
  align-items: center;
}
```

- [ ] **Step 2: Drive `justify-content` from `align` in `TextEditor`**

In `components/editor/PreviewAnnotations.tsx`, inside `TextEditor`, after the `const centered = a.kind !== "text";` line, add the mapping:

```tsx
  const centered = a.kind !== "text";
  const justify =
    a.align === "left" ? "flex-start" : a.align === "right" ? "flex-end" : "center";
```

Then set it as an inline style on the wrapper div (which currently has only `className`):

```tsx
      <div
        className={`anno-editwrap${centered ? " centered" : ""}`}
        style={centered ? { justifyContent: justify } : undefined}
      >
```

- [ ] **Step 3: Verify types + build**

Run: `pnpm typecheck && pnpm build`
Expected: both green.

- [ ] **Step 4: Manual verification**

Run `pnpm dev`. Create a bracket (or line) annotation, double-click to add a label, set its alignment to **left**, and type — the caret/text must sit at the left while typing (no jump to center on blur). Repeat for **right**. Then confirm a **text-box** annotation's label still aligns correctly (it uses `textAlign` on the div at `:767` and should already match — if it does not, make its non-centered `.anno-text.editing` `width: 100%` so `text-align` takes effect, and note it in the report).

- [ ] **Step 5: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "fix: text-label alignment matches align while typing"
```

---

### Task 2: Custom page-size width/height inputs (Item 4a)

`PageSize` includes `"Custom"` and `PageConfig.custom?:{w,h}` (mm) is fully wired to render (`pageDimensions()` in `grid-math.ts`, `pageVars()` → `--page-w/-h`), but `PageSettings.tsx` offers no way to enter the dimensions. Add width/height (mm) inputs shown only when `size === "Custom"`, clamped to a sane range via a new pure `clampPageMm` helper.

**Files:**
- Modify: `lib/grid-math.ts` (add `clampPageMm`, `MIN_PAGE_MM`, `MAX_PAGE_MM`)
- Test: `lib/grid-math.test.ts`
- Modify: `components/editor/PageSettings.tsx`

**Interfaces:**
- Consumes: `PageConfig.custom?: { w: number; h: number }`, `updatePageConfig(patch: Partial<PageConfig>)`.
- Produces: `clampPageMm(v: number): number` — clamps to `[MIN_PAGE_MM, MAX_PAGE_MM]`, `NaN`/non-finite → `MIN_PAGE_MM`.

- [ ] **Step 1: Write the failing test**

Add to `lib/grid-math.test.ts` (import `clampPageMm`, `MIN_PAGE_MM`, `MAX_PAGE_MM` from `./grid-math` — add to the existing import):

```ts
describe("clampPageMm", () => {
  it("passes a value within range through unchanged", () => {
    expect(clampPageMm(210)).toBe(210);
  });
  it("clamps below the minimum", () => {
    expect(clampPageMm(2)).toBe(MIN_PAGE_MM);
  });
  it("clamps above the maximum", () => {
    expect(clampPageMm(9999)).toBe(MAX_PAGE_MM);
  });
  it("maps NaN / non-finite to the minimum", () => {
    expect(clampPageMm(Number.NaN)).toBe(MIN_PAGE_MM);
    expect(clampPageMm(Infinity)).toBe(MAX_PAGE_MM);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- --run lib/grid-math.test.ts`
Expected: FAIL — `clampPageMm` is not exported.

- [ ] **Step 3: Implement `clampPageMm`**

In `lib/grid-math.ts`, add:

```ts
/** Printable page-dimension bounds (mm). */
export const MIN_PAGE_MM = 10;
export const MAX_PAGE_MM = 2000;

/** Clamp a page dimension (mm) into the printable range; non-finite → the min. */
export function clampPageMm(v: number): number {
  if (!Number.isFinite(v)) return MIN_PAGE_MM;
  return Math.max(MIN_PAGE_MM, Math.min(MAX_PAGE_MM, v));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- --run lib/grid-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the custom-size inputs to `PageSettings.tsx`**

Add the import at the top (alongside the existing imports):

```tsx
import { clampPageMm, MIN_PAGE_MM, MAX_PAGE_MM } from "@/lib/grid-math";
```

Then, immediately after the closing `</div>` of the Size `editor-field` (the block ending at `:28`), insert the conditional inputs:

```tsx
      {cfg.size === "Custom" ? (
        <div className="editor-field">
          <label htmlFor="pg-cw">Width (mm)</label>
          <input
            id="pg-cw"
            type="number"
            min={MIN_PAGE_MM}
            max={MAX_PAGE_MM}
            value={cfg.custom?.w ?? 210}
            onChange={(e) =>
              update({ custom: { w: clampPageMm(Number(e.target.value)), h: cfg.custom?.h ?? 297 } })
            }
          />
          <label htmlFor="pg-ch">Height (mm)</label>
          <input
            id="pg-ch"
            type="number"
            min={MIN_PAGE_MM}
            max={MAX_PAGE_MM}
            value={cfg.custom?.h ?? 297}
            onChange={(e) =>
              update({ custom: { w: cfg.custom?.w ?? 210, h: clampPageMm(Number(e.target.value)) } })
            }
          />
        </div>
      ) : null}
```

- [ ] **Step 6: Verify types + build + manual**

Run: `pnpm typecheck && pnpm build`
Expected: green. Then `pnpm dev`: set Size = Custom, enter e.g. 150 × 200 — the preview sheet must resize. Switch back to A4 — reverts.

- [ ] **Step 7: Commit**

```bash
git add lib/grid-math.ts lib/grid-math.test.ts components/editor/PageSettings.tsx
git commit -m "feat: custom page-size width/height inputs"
```

---

### Task 3: Overlapping-shape cycler (Item 1)

Each shape's transparent hit-area calls `selectAnnotation(a.id)` on `onPointerDown`, so a click always grabs the topmost shape under the cursor; stacked shapes underneath are unreachable. Add **Alt/Option-click** to cycle selection down through the rect-bearing shapes under the cursor (plain click unchanged; cycling wraps), backed by two pure helpers.

**Files:**
- Modify: `lib/annotations.ts` (add `hitStack`, `nextInStack`)
- Test: `lib/annotations.test.ts`
- Modify: `components/editor/PreviewAnnotations.tsx` (the per-annotation `onDown`, ~435)

**Interfaces:**
- Consumes: `Annotation` union, `Point`, the `selectedId` prop, the `toN(e)` pointer→normalized helper (`:193`), `selectAnnotation`.
- Produces:
  - `hitStack(annotations: Annotation[], p: Point): string[]` — ids of rect-bearing surfaces (`box`/`diamond`/`ellipse`/`text`/`bracket`) whose bounds contain `p`, **topmost first**.
  - `nextInStack(stack: string[], currentId: string | null): string | null` — id after `currentId` (wrapping); first id if `currentId` absent; `null` if empty.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotations.test.ts` (add `hitStack`, `nextInStack` to the existing `@/lib/annotations` import). Reuse the existing `box(id,x,y,w,h)` factory:

```ts
describe("hitStack + nextInStack — overlapping-shape cycling", () => {
  it("returns rect-bearing shapes under the point, topmost first", () => {
    const a = box("a", 0.0, 0.0, 0.6, 0.6); // bottom
    const b = box("b", 0.1, 0.1, 0.4, 0.4); // top (later in array)
    expect(hitStack([a, b], { x: 0.2, y: 0.2 })).toEqual(["b", "a"]);
  });
  it("excludes shapes that don't contain the point", () => {
    const a = box("a", 0.0, 0.0, 0.2, 0.2);
    const b = box("b", 0.5, 0.5, 0.2, 0.2);
    expect(hitStack([a, b], { x: 0.1, y: 0.1 })).toEqual(["a"]);
  });
  it("advances to the next id, wrapping to the first", () => {
    expect(nextInStack(["b", "a"], "b")).toBe("a");
    expect(nextInStack(["b", "a"], "a")).toBe("b");
  });
  it("returns the first id when current is absent, null when empty", () => {
    expect(nextInStack(["b", "a"], null)).toBe("b");
    expect(nextInStack(["b", "a"], "zzz")).toBe("b");
    expect(nextInStack([], "a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: FAIL — `hitStack`/`nextInStack` not exported.

- [ ] **Step 3: Implement the helpers**

In `lib/annotations.ts`, add (near the other geometry helpers, e.g. after `nearestPoint`):

```ts
/** Ids of rect-bearing surfaces (box/diamond/ellipse/text/bracket) whose bounds
 *  contain `p`, top-most first (array order is bottom→top, so reverse). Pure;
 *  used to cycle selection through overlapping shapes on Alt-click. */
export function hitStack(annotations: Annotation[], p: Point): string[] {
  const ids: string[] = [];
  for (const a of annotations) {
    if (
      a.kind === "box" || a.kind === "diamond" || a.kind === "ellipse" ||
      a.kind === "text" || a.kind === "bracket"
    ) {
      if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) {
        ids.push(a.id);
      }
    }
  }
  return ids.reverse();
}

/** The id after `currentId` in `stack`, wrapping to the first; the first id if
 *  `currentId` is not in `stack`; `null` if `stack` is empty. */
export function nextInStack(stack: string[], currentId: string | null): string | null {
  if (stack.length === 0) return null;
  const i = currentId == null ? -1 : stack.indexOf(currentId);
  return stack[(i + 1) % stack.length];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire Alt-click into the hit-area handler**

In `components/editor/PreviewAnnotations.tsx`, add `hitStack, nextInStack` to the existing `@/lib/annotations` import. Then change the per-annotation `onDown` (currently at `:435-438`) to:

```tsx
        const onDown = (e: React.PointerEvent) => {
          e.stopPropagation();
          if (e.altKey) {
            const next = nextInStack(hitStack(annotations, toN(e)), selectedId);
            if (next) {
              selectAnnotation(next);
              return;
            }
          }
          selectAnnotation(a.id);
        };
```

(`selectedId` is the component prop; `toN` is defined at `:193`; both are in scope inside the `annotations.map` render.)

- [ ] **Step 6: Verify types + build + manual**

Run: `pnpm typecheck && pnpm build`
Expected: green. Then `pnpm dev`: draw two overlapping boxes; plain-click selects the top one; hold **Alt/Option** and click repeatedly over the overlap — selection cycles top → underneath → wraps. Confirm Alt-drag still disables snapping (unchanged; the drag path reads `e.altKey` independently).

- [ ] **Step 7: Commit**

```bash
git add lib/annotations.ts lib/annotations.test.ts components/editor/PreviewAnnotations.tsx
git commit -m "feat: Alt-click cycles selection through overlapping shapes"
```

---

### Task 4: File-drop-onto-cell image upload (Item 4b)

Dragging an image file onto a grid cell does nothing today. Add drag-and-drop: hovering an image file over a cell highlights it; dropping uploads via the existing endpoint and sets it as that cell's image (replacing any existing one, which `setCellImage` already does). Extract the upload fetch — currently inline in `ImagePicker` — into a shared, testable `lib/upload-image.ts` helper (DRY).

**Files:**
- Create: `lib/upload-image.ts`
- Test: `lib/upload-image.test.ts`
- Modify: `components/editor/ImagePicker.tsx` (use the shared helper)
- Modify: `components/editor/PreviewGridSelect.tsx` (drop handlers + highlight)
- Modify: `components/editor/editor.css` (drop highlight)

**Interfaces:**
- Consumes: `uploadApiFor(slug)` (`@/lib/project-routes`), `projectSlug` + `book.chapters[ci].id` + `setCellImage` from the store.
- Produces:
  - `uploadImage(slug: string, chapterId: string, file: File): Promise<{ filename: string } | { error: string }>`
  - `isImageFile(name: string): boolean` (client mirror of the server `IMAGE_RE`)

- [ ] **Step 1: Write the failing test**

Create `lib/upload-image.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadImage, isImageFile } from "./upload-image";

afterEach(() => vi.unstubAllGlobals());

const file = new Blob(["x"], { type: "image/png" }) as unknown as File;

describe("isImageFile", () => {
  it("accepts common image extensions, rejects others", () => {
    expect(isImageFile("a.png")).toBe(true);
    expect(isImageFile("a.JPEG")).toBe(true);
    expect(isImageFile("a.webp")).toBe(true);
    expect(isImageFile("a.pdf")).toBe(false);
    expect(isImageFile("noext")).toBe(false);
  });
});

describe("uploadImage", () => {
  it("returns the filename on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ filename: "shot.png" }),
    })));
    const res = await uploadImage("proj", "ch1", file);
    expect(res).toEqual({ filename: "shot.png" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("returns the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "bad type" }),
    })));
    expect(await uploadImage("proj", "ch1", file)).toEqual({ error: "bad type" });
  });
  it("returns a generic error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await uploadImage("proj", "ch1", file)).toEqual({ error: "upload failed" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- --run lib/upload-image.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/upload-image.ts`**

```ts
import { uploadApiFor } from "@/lib/project-routes";

/** Client mirror of the server's accepted image extensions (server-paths.IMAGE_RE
 *  is server-only). Server validation remains authoritative; this is UX only. */
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i;

/** True if `name` looks like a supported image by extension. */
export function isImageFile(name: string): boolean {
  return IMAGE_RE.test(name);
}

/** POST a file to the project's upload endpoint under `chapterId`; returns the
 *  stored filename or an error message. Never throws. */
export async function uploadImage(
  slug: string,
  chapterId: string,
  file: File,
): Promise<{ filename: string } | { error: string }> {
  try {
    const fd = new FormData();
    fd.append("chapterId", chapterId);
    fd.append("file", file);
    const res = await fetch(uploadApiFor(slug), { method: "POST", body: fd });
    const data = (await res.json()) as { filename?: string; error?: string };
    if (!res.ok || !data.filename) return { error: data.error ?? "upload failed" };
    return { filename: data.filename };
  } catch {
    return { error: "upload failed" };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- --run lib/upload-image.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `ImagePicker` to use the helper (behavior-preserving)**

In `components/editor/ImagePicker.tsx`, add `import { uploadImage } from "@/lib/upload-image";` and replace the body of `onUpload`'s `try` block (`:72-81`) so the FormData/fetch is delegated:

```tsx
    try {
      const result = await uploadImage(slug, chapterId, file);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await refresh();
      onPick(result.filename);
    } catch {
      setError("upload failed");
    } finally {
      setUploading(false);
    }
```

Remove the now-unused `uploadApiFor` import if nothing else in the file uses it (leave `imagesApiFor`, `assetUrl`).

- [ ] **Step 6: Add drop handlers + highlight to `PreviewGridSelect`**

In `components/editor/PreviewGridSelect.tsx`:

Add imports and store selectors (primitive selectors — safe):

```tsx
import { useLayoutEffect, useState } from "react";
import { isImageFile, uploadImage } from "@/lib/upload-image";
```

Inside the component, after `const selectCell = useEditor((s) => s.selectCell);`:

```tsx
  const setCellImage = useEditor((s) => s.setCellImage);
  const slug = useEditor((s) => s.projectSlug);
  const chapterId = useEditor((s) => s.book.chapters[ci]?.id ?? "");
  const [dropKey, setDropKey] = useState<string | null>(null);
```

Add a helper above the return (drag types are readable during dragover; file names are not, so validate the extension only on drop):

```tsx
  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");
```

Then extend the cell `<button>` — add `drop` to the className and the three handlers:

```tsx
            className={`grid-cell-select${isSel ? " selected" : ""}${
              dropKey === `${ri}-${cidx}` ? " drop" : ""
            }`}
            onDragOver={(e) => {
              if (!isFileDrag(e)) return;
              e.preventDefault();
              setDropKey(`${ri}-${cidx}`);
            }}
            onDragLeave={() => setDropKey((k) => (k === `${ri}-${cidx}` ? null : k))}
            onDrop={async (e) => {
              e.preventDefault();
              setDropKey(null);
              const dropped = e.dataTransfer.files?.[0];
              if (!dropped || !isImageFile(dropped.name) || !chapterId) return;
              const result = await uploadImage(slug, chapterId, dropped);
              if ("filename" in result) setCellImage(ci, si, ri, cidx, result.filename);
            }}
```

- [ ] **Step 7: Add the drop-highlight CSS**

In `components/editor/editor.css`, after the `.grid-cell-select.selected` rule (`:1166-1170`), add:

```css
.preview-grid-select .grid-cell-select.drop {
  outline: 2px dashed #2563eb;
  outline-offset: -2px;
  background: rgba(37, 99, 235, 0.12);
}
```

- [ ] **Step 8: Verify types + build + manual**

Run: `pnpm typecheck && pnpm test -- --run && pnpm build`
Expected: green. Then `pnpm dev` on a project with a grid step: drag a PNG from the OS over a cell — it highlights (dashed); drop — the image uploads and fills the cell (replacing any prior image). Drag a non-image (e.g. `.txt`) — dropping is ignored. Confirm the existing `ImagePicker` upload button still works (regression).

- [ ] **Step 9: Commit**

```bash
git add lib/upload-image.ts lib/upload-image.test.ts components/editor/ImagePicker.tsx components/editor/PreviewGridSelect.tsx components/editor/editor.css
git commit -m "feat: drag-and-drop image onto a grid cell to upload + set it"
```

---

### Task 5: Equal-spacing distribution geometry (Item 4c — part 1)

`snapAlign` snaps to sibling edges/centers only. Add a pure `snapDistribute` that, while a rect is dragged, detects when it forms an equal gap with sibling rects on an axis and returns the delta to apply plus the equal-gap spans to draw. Two well-defined cases per axis, independent X/Y. This task is geometry + tests only; wiring is Task 6.

**Files:**
- Modify: `lib/annotations.ts` (add `DistGuide`, `DistResult`, `snapDistribute`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `Rect`.
- Produces:
  - `interface DistGuide { axis: "x" | "y"; at: number; from: number; to: number }`
  - `interface DistResult { dx: number; dy: number; guides: DistGuide[] }`
  - `snapDistribute(moving: Rect, siblings: Rect[], thrX: number, thrY: number): DistResult` — X/Y independent; `thr <= 0` disables that axis; no siblings → no snap.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotations.test.ts` (add `snapDistribute` and the `DistGuide` type to the imports; `DistGuide` is a type-only import if the file separates them — otherwise a value import is fine since it is only referenced in assertions via the result):

```ts
describe("snapDistribute — equal-spacing", () => {
  const T = 0.05;
  const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

  it("centers a rect between two neighbors (equal gaps)", () => {
    // left [0,0.1], right [0.4,0.5], moving w=0.1 → centered x = 0.2
    const res = snapDistribute(r(0.22, 0.4, 0.1, 0.1), [r(0, 0, 0.1, 0.1), r(0.4, 0, 0.1, 0.1)], T, T);
    expect(res.dx).toBeCloseTo(-0.02, 6);
    expect(res.dy).toBe(0);
    expect(res.guides.filter((g) => g.axis === "x")).toHaveLength(2);
  });

  it("matches the adjacent gap when only one side has neighbors", () => {
    // siblings [0,0.1] & [0.2,0.3] → existing gap 0.1; moving to the right snaps
    // so its left gap equals 0.1 → x = 0.3 + 0.1 = 0.4
    const res = snapDistribute(r(0.42, 0.4, 0.1, 0.1), [r(0, 0, 0.1, 0.1), r(0.2, 0, 0.1, 0.1)], T, T);
    expect(res.dx).toBeCloseTo(-0.02, 6);
    expect(res.guides.some((g) => g.axis === "x")).toBe(true);
  });

  it("does not snap beyond the threshold", () => {
    const res = snapDistribute(r(0.8, 0.4, 0.1, 0.1), [r(0, 0, 0.1, 0.1), r(0.4, 0, 0.1, 0.1)], T, T);
    expect(res).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("returns no snap when there are no siblings", () => {
    expect(snapDistribute(r(0.5, 0.5, 0.1, 0.1), [], T, T)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("disables an axis when its threshold is 0", () => {
    const res = snapDistribute(r(0.22, 0.4, 0.1, 0.1), [r(0, 0, 0.1, 0.1), r(0.4, 0, 0.1, 0.1)], 0, T);
    expect(res.dx).toBe(0);
    expect(res.guides.filter((g) => g.axis === "x")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: FAIL — `snapDistribute` not exported.

- [ ] **Step 3: Implement `snapDistribute` + types**

In `lib/annotations.ts`, add the types next to `GuideLine`/`AlignSnapResult` (~746-748):

```ts
/** A distribution guide: a short capped bar marking one equal gap. For axis "x"
 *  the bar is horizontal at cross-y `at`, spanning x `from`→`to`; for axis "y" it
 *  is vertical at cross-x `at`, spanning y `from`→`to`. */
export interface DistGuide { axis: "x" | "y"; at: number; from: number; to: number }
export interface DistResult { dx: number; dy: number; guides: DistGuide[] }
```

Then add the implementation (near `snapAlign`):

```ts
/** One axis of equal-spacing distribution. `m0`/`mSize` = moving interval
 *  start+size; `sibs` = sibling intervals (start `s`, end `e`, center `c`) on this
 *  axis; `thr` = normalized snap threshold (≤0 disables). Returns the delta to
 *  apply and the equal-gap spans, or null. */
function distributeAxis(
  m0: number,
  mSize: number,
  sibs: { s: number; e: number; c: number }[],
  thr: number,
): { delta: number; gaps: [number, number][] } | null {
  if (thr <= 0 || sibs.length === 0) return null;
  const mc = m0 + mSize / 2;
  const left = sibs.filter((s) => s.c < mc).sort((a, b) => b.c - a.c);
  const right = sibs.filter((s) => s.c > mc).sort((a, b) => a.c - b.c);
  const L = left[0];
  const R = right[0];
  // Case 1 — centered between two neighbors (equal gaps on both sides).
  if (L && R) {
    const target = (L.e + R.s - mSize) / 2;
    const delta = target - m0;
    if (Math.abs(delta) > thr) return null;
    return { delta, gaps: [[L.e, target], [target + mSize, R.s]] };
  }
  // Case 2 — continue the run: match the gap just beyond the single neighbor.
  if (L && left[1]) {
    const gap = L.s - left[1].e;
    const target = L.e + gap;
    const delta = target - m0;
    if (Math.abs(delta) > thr) return null;
    return { delta, gaps: [[L.e, target]] };
  }
  if (R && right[1]) {
    const gap = right[1].s - R.e;
    const target = R.s - gap - mSize;
    const delta = target - m0;
    if (Math.abs(delta) > thr) return null;
    return { delta, gaps: [[target + mSize, R.s]] };
  }
  return null;
}

/** Figma-style equal-spacing snap for a moving rect against sibling rects. X and Y
 *  resolve independently. Returns the position delta + distribution guide bars.
 *  Pure. `siblings` should already exclude the moving surface. */
export function snapDistribute(
  moving: Rect,
  siblings: Rect[],
  thrX: number,
  thrY: number,
): DistResult {
  const mcx = moving.x + moving.w / 2;
  const mcy = moving.y + moving.h / 2;
  const sibX = siblings.map((s) => ({ s: s.x, e: s.x + s.w, c: s.x + s.w / 2 }));
  const sibY = siblings.map((s) => ({ s: s.y, e: s.y + s.h, c: s.y + s.h / 2 }));
  const rx = distributeAxis(moving.x, moving.w, sibX, thrX);
  const ry = distributeAxis(moving.y, moving.h, sibY, thrY);
  const guides: DistGuide[] = [];
  if (rx) for (const [from, to] of rx.gaps) guides.push({ axis: "x", at: mcy, from, to });
  if (ry) for (const [from, to] of ry.gaps) guides.push({ axis: "y", at: mcx, from, to });
  return { dx: rx ? rx.delta : 0, dy: ry ? ry.delta : 0, guides };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: snapDistribute equal-spacing geometry + DistGuide"
```

---

### Task 6: Wire distribution guides into the drag (Item 4c — part 2)

Run `snapDistribute` alongside `snapAlign` in the move-drag path — alignment wins each axis, distribution fills the axes alignment didn't snap — and render the distribution guides as capped tick bars distinct from the alignment lines.

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx` (drag ref, `startDrag`, `apply`, `onUp`, render, state)
- Modify: `components/editor/editor.css` (`.preview-anno-distguide`)

**Interfaces:**
- Consumes: `snapDistribute`, `DistGuide` (from `@/lib/annotations`).
- Produces: nothing exported.

- [ ] **Step 1: Import + state**

Add `snapDistribute` and the type `DistGuide` to the `@/lib/annotations` import. After `const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);` (`:134`), add:

```tsx
  const [activeDistGuides, setActiveDistGuides] = useState<DistGuide[]>([]);
```

- [ ] **Step 2: Carry sibling rects on the drag**

Add `sibs?: Rect[];` to the `drag` ref object type (the `useRef<{ … } | null>` at `:121-131`). In `startDrag` (`:201-220`), where `targets` is collected, also compute annotation-sibling rects (rect-bearing, excluding self) and store them:

```tsx
    let targets: Rect[] | undefined;
    let sibs: Rect[] | undefined;
    if (part === "move" || part === "resize") {
      const pageEl = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
      if (pageEl) targets = collectSnapTargets(pageEl, annotations, id);
      sibs = annotations
        .filter(
          (an) =>
            an.id !== id &&
            (an.kind === "box" || an.kind === "diamond" || an.kind === "ellipse" ||
              an.kind === "text" || an.kind === "bracket"),
        )
        .map((an) => ({ x: an.x, y: an.y, w: an.w, h: an.h }));
    }
    drag.current = { id, part, grabX, grabY, targets, sibs };
```

- [ ] **Step 3: Run distribution after alignment in `apply`**

In the `d.part === "move"` branch (`:256-267`), replace the snap block so distribution runs on the axes alignment left unsnapped:

```tsx
      if (d.part === "move") {
        let x = clamp01(p.x - d.grabX);
        let y = clamp01(p.y - d.grabY);
        let guides: GuideLine[] = [];
        let dguides: DistGuide[] = [];
        if (!alt && a.kind !== "line") {
          if (d.targets) {
            const s = snapAlign({ x, y, w: a.w, h: a.h }, d.targets, thrX, thrY, "move");
            x = clamp01(x + s.dx);
            y = clamp01(y + s.dy);
            guides = s.guides;
          }
          if (d.sibs) {
            const alignedX = guides.some((g) => g.axis === "x");
            const alignedY = guides.some((g) => g.axis === "y");
            const dist = snapDistribute(
              { x, y, w: a.w, h: a.h }, d.sibs, alignedX ? 0 : thrX, alignedY ? 0 : thrY,
            );
            x = clamp01(x + dist.dx);
            y = clamp01(y + dist.dy);
            dguides = dist.guides;
          }
        }
        setActiveGuides(guides);
        setActiveDistGuides(dguides);
        updateAnnotation(ci, si, d.id, { x, y });
      } else if (a.kind === "line") {
```

(The `else if (a.kind === "line")` and resize branches are unchanged; ensure the resize branch still `setActiveGuides(...)` as before — leave it. Distribution applies to move only.)

- [ ] **Step 4: Clear distribution guides on drag end**

In `onUp` (`:352-364`), next to `setActiveGuides([]);` add:

```tsx
    setActiveGuides([]);
    setActiveDistGuides([]);
```

- [ ] **Step 5: Render the distribution guides**

In the SVG, right after the `activeGuides.map(...)` block (`:407-413`), add:

```tsx
      {activeDistGuides.map((g, i) =>
        g.axis === "x" ? (
          <g key={`dg-${i}`} className="preview-anno-distguide">
            <line x1={g.from * W} y1={g.at * H} x2={g.to * W} y2={g.at * H} />
            <line x1={g.from * W} y1={g.at * H - 4} x2={g.from * W} y2={g.at * H + 4} />
            <line x1={g.to * W} y1={g.at * H - 4} x2={g.to * W} y2={g.at * H + 4} />
          </g>
        ) : (
          <g key={`dg-${i}`} className="preview-anno-distguide">
            <line x1={g.at * W} y1={g.from * H} x2={g.at * W} y2={g.to * H} />
            <line x1={g.at * W - 4} y1={g.from * H} x2={g.at * W + 4} y2={g.from * H} />
            <line x1={g.at * W - 4} y1={g.to * H} x2={g.at * W + 4} y2={g.to * H} />
          </g>
        ),
      )}
```

- [ ] **Step 6: Add the distribution-guide CSS**

In `components/editor/editor.css`, after the `.preview-anno-guide` rule (`:710-715`), add (a distinct magenta so it reads differently from the red alignment guides):

```css
.preview-anno-distguide line {
  stroke: #c026d3;
  stroke-width: 1;
  pointer-events: none;
  shape-rendering: crispEdges;
}
```

- [ ] **Step 7: Verify types + build + manual**

Run: `pnpm typecheck && pnpm test -- --run && pnpm build`
Expected: green. Then `pnpm dev`: place three boxes roughly in a row with unequal gaps; drag the middle one — as its two gaps approach equal it snaps and two magenta capped bars appear. Confirm alignment (red) guides still work and an axis that snaps to alignment does NOT also show a distribution bar.

- [ ] **Step 8: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "feat: render equal-spacing distribution guides while dragging"
```

---

### Task 7: Docs — ADR-004 amendment + ROADMAP

Record the two new annotation interactions (Alt-click shape cycling; equal-spacing distribution snapping) as an amendment to ADR-004, and tick the backlog items in ROADMAP.

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Amend ADR-004**

Append a dated amendment section to `docs/adr/ADR-004-annotation-canvas.md` noting: (a) **Alt/Option-click cycles selection** through overlapping rect-bearing shapes via pure `hitStack`/`nextInStack` (lines/connectors excluded); (b) **equal-spacing distribution snapping** (`snapDistribute` + `DistGuide`) runs alongside `snapAlign` on the move drag — alignment wins per axis, distribution fills the rest — rendered as editor-only magenta tick bars (never prints). Both additive, no schema change. Also note the text-label editing overlay now honors `align` while typing.

- [ ] **Step 2: Update ROADMAP**

In `ROADMAP.md`, mark the bundled backlog items done (shape cycler; text-label center-while-typing; custom page-size inputs; file-drop-onto-cell; equal-spacing/distribution guides) with the branch/commit reference, per the repo's ROADMAP continuity pattern.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 amendment (shape cycler + distribution) + ROADMAP"
```

---

## Self-Review

- **Spec coverage:** Item 1 → Task 3; Item 2 → Task 1; Item 4a → Task 2; Item 4b → Task 4; Item 4c → Tasks 5+6; ADR/ROADMAP → Task 7. All covered.
- **Type consistency:** `hitStack`/`nextInStack`, `clampPageMm`/`MIN_PAGE_MM`/`MAX_PAGE_MM`, `uploadImage`/`isImageFile`, `snapDistribute`/`DistGuide`/`DistResult` — names identical across their producing and consuming tasks. `setCellImage(ci,si,ri,cellIndex,filename)` matches the store signature. `updatePageConfig(patch)` matches.
- **No placeholders:** every step carries concrete code or a concrete command.
- **Ordering:** smallest-risk first (CSS fix → pure-helper features → the geometry-heavy 4c last), so early tasks warm up the review loop.

## Execution Handoff

Per the user's decision: **subagent-driven development**, karpathy-guidelines discipline, per-task review by **staff-engineer** + **frontend-developer** agents, final whole-branch review before merge.
