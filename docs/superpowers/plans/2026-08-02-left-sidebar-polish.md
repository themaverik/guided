# Left Sidebar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the left editor sidebar into strict DESIGN.md compliance: toast notifications for transient errors, status pill for the crop hint, outlined danger button for "Remove image", token/typography/radius alignment, and sidebar a11y (focus rings + `aria-pressed`).

**Architecture:** Spec: `docs/superpowers/specs/2026-08-02-left-sidebar-polish-design.md` (DESIGN.md already amended, commits `a611e6a` + `4be2fa0`). New `@theme` tokens in `app/globals.css`; a `notices` channel in the Zustand store (`lib/store.tsx`) rendered by a new `components/editor/Toast.tsx`; the rest is CSS/classname changes in `components/editor/editor.css` and small markup edits in `CellEditor.tsx` / `ImagePicker.tsx`.

**Tech Stack:** Next.js 15, React 19, Zustand (vanilla store + provider), Tailwind v4 CSS-first `@theme`, Vitest.

## Global Constraints

- **NO behavior changes.** Only visual/CSS/classname/attribute changes plus the toast plumbing described here.
- **Never touch** `components/renderer/**`, `components/editor/Preview*.tsx`, `app/[slug]/print/**`, or any print/PDF code.
- Do NOT change `#2563eb`/blue values outside the single `.cell-editor .callout-item.selected` rule — preview overlay blues are out of scope.
- All `Book`/store updates immutable (new arrays/objects; the codebase pattern is `set((s) => ({...}))`).
- Fonts: use `var(--font-body)` / `var(--font-mono)` — never hardcode font names (the app maps body→Roboto via `next/font`; DESIGN.md's face mapping is bound through these vars).
- Verification gate per task: `pnpm typecheck && pnpm test && pnpm lint` all green (suite currently 287 tests).
- Commit after each task; conventional commits; **no AI attribution lines**.
- Branch: `feature/sidebar-design-polish` (already checked out; 2 docs commits on it).

---

### Task 1: New design tokens in `@theme`

**Files:**
- Modify: `app/globals.css` (the `@theme` block, after `--color-danger-marker` around line 82)

**Interfaces:**
- Produces: CSS custom properties `--color-selection`, `--color-hover-bg`, `--color-danger-text` consumed by Tasks 2–5. (`--color-paper` already exists.)

- [ ] **Step 1: Add the tokens**

In `app/globals.css`, inside the `@theme { … }` block, immediately after the `--color-danger-marker` line, add:

```css
  /* UI-chrome tokens (DESIGN §2.1 amendment, sidebar polish 2026-08-02) */
  --color-selection: #3b82f6;   /* selection/focus blue — heals the #2563eb drift */
  --color-hover-bg: #f0f5f6;    /* hover tint on flat controls */
  --color-danger-text: #9e332f; /* AA-safe small danger text; swatch red stays for borders/fills */
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all green (no consumer yet; this is additive CSS).
Also run: `grep -c "color-selection\|color-hover-bg\|color-danger-text" app/globals.css` → expect `3`.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add selection/hover/danger-text UI tokens to @theme"
```

---

### Task 2: Toast notification system (store channel + component + ImagePicker migration)

**Files:**
- Modify: `lib/store.tsx` (interface ~line 65–120, implementation ~line 261+)
- Create: `components/editor/Toast.tsx`
- Modify: `components/editor/EditorApp.tsx` (mount inside provider, next to `<AnnotationDeleteController />`)
- Modify: `components/editor/ImagePicker.tsx` (drop local `error` state; lines 29, 72–82, 141)
- Modify: `components/editor/editor.css` (add `.toast-*` rules; delete `.img-picker-error` rules at lines 1020, 1027–1029)
- Test: `lib/store.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing from other tasks (tone colors use pre-existing `--color-danger-*`/`--color-success-*` tokens; `--color-danger-text` from Task 1).
- Produces: `export interface Notice { id: number; tone: "danger" | "success"; message: string }` in `lib/store.tsx`; state `notices: Notice[]`; actions `pushNotice(tone: Notice["tone"], message: string): void` and `dismissNotice(id: number): void`.

- [ ] **Step 1: Write the failing test**

Append to `lib/store.test.ts` (reuse the existing top-level `book` fixture):

```ts
describe("notices channel", () => {
  it("pushNotice appends immutably with unique ids; dismissNotice removes", () => {
    const store = createEditorStore(book, "slug");
    store.getState().pushNotice("danger", "Upload failed");
    const afterFirst = store.getState().notices;
    store.getState().pushNotice("success", "Image uploaded.");
    expect(store.getState().notices).toHaveLength(2);
    expect(afterFirst).toHaveLength(1); // prior array not mutated
    const [a, b] = store.getState().notices;
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ tone: "danger", message: "Upload failed" });
    store.getState().dismissNotice(a.id);
    expect(store.getState().notices.map((n) => n.id)).toEqual([b.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- store.test`
Expected: FAIL — `pushNotice is not a function` / property `notices` missing.

- [ ] **Step 3: Implement the store channel**

In `lib/store.tsx`:

1. Below the imports, add:

```ts
export interface Notice {
  id: number;
  tone: "danger" | "success";
  message: string;
}
```

2. In `export interface EditorState` add (near `overflows: string[]`):

```ts
  notices: Notice[];
  pushNotice: (tone: Notice["tone"], message: string) => void;
  dismissNotice: (id: number) => void;
```

3. In `createEditorStore` (~line 257), add a sequence counter above the `createStore` call, then the state + actions inside the object literal (near `overflows: []` / `setOverflows`):

```ts
  let noticeSeq = 0;
```

```ts
    notices: [],
    pushNotice: (tone, message) =>
      set((s) => ({ notices: [...s.notices, { id: ++noticeSeq, tone, message }] })),
    dismissNotice: (id) =>
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- store.test`
Expected: PASS (all existing store tests still green).

- [ ] **Step 5: Create `components/editor/Toast.tsx`**

```tsx
"use client";

/*
 * Toast stack (DESIGN §6 Notification): fixed bottom-left over the left pane.
 * Renders the store's transient notices; ~4s auto-dismiss paused on hover or
 * focus; manual ×. Editor-only — never mounted on the print route.
 */
import { useEffect, useRef, useState } from "react";
import { useEditor, type Notice } from "@/lib/store";

const TOAST_MS = 4000;
const EXIT_MS = 140;
const MIN_RESUME_MS = 800;

function ToastItem({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);
  const remaining = useRef(TOAST_MS);
  const started = useRef(Date.now());
  const timer = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onDismiss, EXIT_MS);
  };

  useEffect(() => {
    started.current = Date.now();
    timer.current = window.setTimeout(close, remaining.current);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    window.clearTimeout(timer.current);
    remaining.current -= Date.now() - started.current;
  };
  const resume = () => {
    if (closingRef.current) return;
    started.current = Date.now();
    timer.current = window.setTimeout(close, Math.max(remaining.current, MIN_RESUME_MS));
  };

  return (
    <div
      className={`toast toast-${notice.tone}${closing ? " closing" : ""}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span>{notice.message}</span>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={close}>
        ×
      </button>
    </div>
  );
}

export default function Toast() {
  const notices = useEditor((s) => s.notices);
  const dismissNotice = useEditor((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <div className="toast-stack">
      {notices.map((n) => (
        <div key={n.id} role={n.tone === "danger" ? "alert" : "status"}>
          <ToastItem notice={n} onDismiss={() => dismissNotice(n.id)} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Mount in `EditorApp.tsx`**

Add `import Toast from "./Toast";` and render `<Toast />` directly after `<AnnotationDeleteController />` (inside `EditorStoreProvider`).

- [ ] **Step 7: Toast CSS**

In `components/editor/editor.css`, add at the end of the file:

```css
/* Toast stack (DESIGN §6 Notification — sidebar polish) */
.toast-stack {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 60; /* above panes, below .confirm-overlay (100) */
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: 340px;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 1px 3px #02445010, 0 8px 32px #02445017;
  animation: toast-in 120ms ease;
}
.toast.closing {
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 120ms ease, transform 120ms ease;
}
@keyframes toast-in {
  from { opacity: 0; transform: translateY(4px); }
}
.toast-danger {
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  color: var(--color-danger-text);
}
.toast-success {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  color: var(--color-success-title);
}
.toast-x {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 5px;
  margin-left: auto;
  flex: 0 0 auto;
}
.toast-x:hover { background: rgb(0 0 0 / 0.06); }
@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
  .toast.closing { transition: none; }
}
```

- [ ] **Step 8: Migrate `ImagePicker` errors to toasts**

In `components/editor/ImagePicker.tsx`:
1. Delete `const [error, setError] = useState<string | null>(null);` (line 29).
2. Add `const pushNotice = useEditor((s) => s.pushNotice);` next to the existing `useEditor` call.
3. In `onUpload`: delete `setError(null);`; replace `setError(result.error);` with `pushNotice("danger", result.error);`; replace the catch's `setError("upload failed");` with `pushNotice("danger", "Upload failed — check your connection and try again.");`.
4. Delete the JSX `{error ? <p className="img-picker-error">{error}</p> : null}` (line 141).
5. In `editor.css`: remove `.img-picker-error` from the grouped rule at line 1019–1023 (keep `.img-picker-hint`) and delete the `.img-picker-error { color: #a11; }` rule (lines 1027–1029).

- [ ] **Step 9: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all green. `grep -rn "img-picker-error" components/ app/` → no matches.

- [ ] **Step 10: Commit**

```bash
git add lib/store.tsx lib/store.test.ts components/editor/Toast.tsx components/editor/EditorApp.tsx components/editor/ImagePicker.tsx components/editor/editor.css
git commit -m "feat: toast notification channel + bottom-left stack; upload errors become toasts"
```

---

### Task 3: Status pill, outlined danger button, border-controls fix

**Files:**
- Modify: `components/editor/CellEditor.tsx` (lines 96–100 crop hint, line 143 Remove image)
- Modify: `components/editor/editor.css` (`.cell-crop-hint` at 1201–1205, `.overflow-warn` at 239–247, `.border-fields` at ~845)

**Interfaces:**
- Consumes: `--color-danger-text` (Task 1), pre-existing `--color-warn-*`, `--color-paper`, `--swatch-red-*` tokens.
- Produces: CSS classes `.status-pill`, `.status-pill--warn`, `.btn-outline-danger` (Task 5 adds their focus rings).

- [ ] **Step 1: Add the shared pill + danger button CSS**

In `editor.css`, replace the `.preview-toolbar .overflow-warn { … }` rule (lines 239–247) with a grouped rule so the overflow badge and the new pill share one recipe (values unchanged — no visual change to the toolbar badge):

```css
/* Status pill (DESIGN §6): persistent state, inline next to its control */
.status-pill,
.preview-toolbar .overflow-warn {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-warn-title);
  background: var(--color-warn-bg);
  border: 1px solid var(--color-warn-border);
  border-radius: 6px;
  padding: 3px 8px;
}
```

(If the original rule contains extra properties beyond these, keep them in the grouped rule verbatim.)

Then add, near the `.mini-btn` rules (~line 315):

```css
/* Outlined danger button (DESIGN §6): text-labeled destructive actions */
.btn-outline-danger {
  display: inline-block;
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--swatch-red-stroke) 40%, transparent);
  border-radius: 7px;
  background: var(--color-paper);
  color: var(--color-danger-text);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.btn-outline-danger:hover {
  background: var(--swatch-red-fill);
  border-color: var(--swatch-red-stroke);
}
```

- [ ] **Step 2: Convert the crop hint to a pill**

In `CellEditor.tsx` lines 96–100, replace:

```tsx
            {showCropPrompt ? (
              <p className="cell-crop-hint">
                This image doesn&apos;t fill the cell — choose a crop above, or keep the ratio.
              </p>
            ) : null}
```

with:

```tsx
            {showCropPrompt ? (
              <span className="status-pill status-pill--warn">
                Image doesn&apos;t fill the cell — choose a crop, or keep the ratio
              </span>
            ) : null}
```

Delete the `.cell-editor .cell-crop-hint { … }` rule (`editor.css:1201–1205`). Add an empty-safe modifier only if needed — `.status-pill--warn` carries no extra declarations today (warn is the base recipe), so no extra CSS rule is required.

- [ ] **Step 3: Convert "Remove image" to the outlined danger button**

In `CellEditor.tsx` line 143, replace `className="mini-btn danger"` with `className="btn-outline-danger"` on the Remove image button only (the `×` mini-btns elsewhere keep `mini-btn danger`).

- [ ] **Step 4: Fix the border-controls classname mismatch**

In `editor.css` (~line 845) rename the selector `.border-fields` → `.border-controls` (rule body unchanged) so the grid layout defined there actually applies to `CellEditor.tsx`'s `<div className="border-controls">`.
**Check rendering after this:** open the editor (`pnpm dev`, any project, grid step → select a cell with an image → enable Border) and confirm the Colour/Width/Radius rows lay out on the grid without overflowing the pane. If the old grid template (`1fr 70px 70px`) fights the current `.ctrl-row` children markup, adjust the rule to `display: flex; flex-direction: column; gap: 8px;` instead — the goal is styled, aligned rows, not resurrecting a stale layout at any cost.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: green. `grep -rn "cell-crop-hint\|border-fields" components/` → no matches.
Visual: crop hint renders as amber mono pill; Remove image is a single-line outlined red button with red-tint hover.

- [ ] **Step 6: Commit**

```bash
git add components/editor/CellEditor.tsx components/editor/editor.css
git commit -m "feat: status pill for crop hint, outlined danger Remove-image button, border-controls fix"
```

---

### Task 4: Token + typography + radius consistency sweep (editor.css only)

**Files:**
- Modify: `components/editor/editor.css` only.

**Interfaces:**
- Consumes: `--color-selection`, `--color-hover-bg`, `--color-danger-text` (Task 1), `--color-paper` (pre-existing).
- Produces: nothing new — mechanical alignment.

- [ ] **Step 1: Paper adoption (zero visual change)**

In `editor.css`, replace every `background: #fff` / `background: #ffffff` declaration value with `background: var(--color-paper)`. (~15 sites; `grep -n "background: #fff" components/editor/editor.css` first, then replace all listed occurrences. Do not touch `#fff` used for text `color` (e.g. `.seg-btn.active { color: #fff }`) — those stay.)

- [ ] **Step 2: Hover token adoption (zero visual change)**

Replace every `#f0f5f6` in `editor.css` with `var(--color-hover-bg)` (sites include `.editor-nav-item:hover/.active` ~119–123, `.mini-btn:hover` ~306, `.add-btn:hover` ~330, `.img-tile:hover` ~988, `.preview-toolbar button:hover` ~191, `.preview-toolbar a:hover` ~217, `.rta-toolbar button:hover` ~591).

- [ ] **Step 3: Selection + danger token adoption**

- `.cell-editor .callout-item.selected` (~line 1230): `outline: 2px solid #2563eb` → `outline: 2px solid var(--color-selection)`. **This is the only blue to change** — leave every other `#2563eb`/`#3b82f6` in the file alone (preview overlays, out of scope).
- `.mini-btn.danger` (~312–315): `color: #a11` → `color: var(--color-danger-text)`; `border-color: #a112` → `border-color: color-mix(in srgb, var(--color-danger-text) 13%, transparent)`.
- `.preview-toolbar .save-status.error` (~236–238): `color: #a11` → `color: var(--color-danger-text)`.
- After this: `grep -n "#a11" components/editor/editor.css` → no matches.

- [ ] **Step 4: Typography — section labels**

`.editor-section-title` (~61–68): set `font-size: 10px; font-weight: 500; letter-spacing: 1.5px;` (keep the existing mono family, uppercase transform, and color; only these three values change per DESIGN §3 Section label).

- [ ] **Step 5: Radius alignment**

- `border-radius: 6px` → `7px` on: `.mini-btn` (~298), `.stepper button` (~478), `.callout-item input, .callout-item textarea, .callout-item select` (~541), `.rta-toolbar button` (~580).
- `.row-card` (~366): `border-radius: 10px` → `9px`.
- Leave all other radii (8px rules already match spec; `.wm-icon-preview` 4px thumbnail stays).

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: green (CSS-only). Visual spot-check in `pnpm dev`: sidebar looks identical except slightly smaller/tighter section labels and marginally rounder mini-buttons; hovers/danger reds unchanged in tone family.

- [ ] **Step 7: Commit**

```bash
git add components/editor/editor.css
git commit -m "refactor: adopt paper/hover/selection/danger tokens; align section-label type and radii to DESIGN.md"
```

---

### Task 5: Accessibility — focus rings + aria-pressed

**Files:**
- Modify: `components/editor/editor.css` (focus rules; `.seg` overflow at ~445–449)
- Modify: `components/editor/CellEditor.tsx` (Fit seg ~85–93, align seg ~194–204)
- Modify: `components/editor/CalloutEditor.tsx` (its 2 `seg-btn` groups)
- Modify: `components/editor/RowCard.tsx` (its 2 `seg-btn` groups)

**Interfaces:**
- Consumes: `--color-ink` (existing), `--color-danger-text` (Task 1), `.btn-outline-danger` (Task 3).
- Produces: nothing consumed later.

- [ ] **Step 1: Focus-visible CSS**

Add to `editor.css` (near the `.mini-btn` block):

```css
/* Visible keyboard focus (DESIGN §9) on sidebar controls */
.seg-btn:focus-visible,
.mini-btn:focus-visible,
.add-btn:focus-visible,
.stepper button:focus-visible,
.ctrl-row select:focus-visible,
.callout-item input:focus-visible,
.callout-item textarea:focus-visible,
.callout-item select:focus-visible,
.toast-x:focus-visible {
  outline: 1px solid var(--color-ink);
  outline-offset: 2px;
}
.mini-btn.danger:focus-visible,
.btn-outline-danger:focus-visible {
  outline: 1px solid var(--color-danger-text);
  outline-offset: 2px;
}
```

Then on `.seg` (~445–449): change `overflow: hidden` → `overflow: visible`, and to preserve the pill corners without clip, add:

```css
.seg-btn:first-child { border-radius: 7px 0 0 7px; }
.seg-btn:last-child { border-radius: 0 7px 7px 0; }
```

(`.seg-btn` itself keeps `border-radius: 0` implicitly for middle segments; verify the seg still renders with rounded outer corners and square inner joins.)

- [ ] **Step 2: aria-pressed on segmented buttons**

Locate every `.seg-btn` in the four left-pane files: `grep -n "seg-btn" components/editor/CellEditor.tsx components/editor/CalloutEditor.tsx components/editor/RowCard.tsx`. Each renders a pattern like ``className={`seg-btn${cond ? " active" : ""}`}``. On each such `<button>`, add `aria-pressed={cond}` using **the same boolean expression** that drives the `active` class. Example (CellEditor Fit control):

```tsx
<button
  key={v}
  className={`seg-btn${fit === v ? " active" : ""}`}
  aria-pressed={fit === v}
  onClick={() => setCellImageFit(ci, si, ri, cellIndex, v)}
>
```

Do NOT modify any `seg-btn` inside `Preview*.tsx` files (none expected, but do not touch them if found).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: green.
Keyboard check in `pnpm dev`: Tab through the sidebar — every seg button, mini button, add button, select, and callout field shows a visible ink ring; danger controls show a red ring; seg corner rounding intact.
`grep -c "aria-pressed" components/editor/CellEditor.tsx` → `2 groups' worth` (6 buttons total: 3 fit + 3 align).

- [ ] **Step 4: Commit**

```bash
git add components/editor/editor.css components/editor/CellEditor.tsx components/editor/CalloutEditor.tsx components/editor/RowCard.tsx
git commit -m "feat: visible focus rings and aria-pressed state for sidebar controls"
```

---

### Final verification (after Task 5)

- [ ] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` — all green.
- [ ] `git diff main -- components/renderer app/[slug]/print` → empty (guardrail proof).
- [ ] Manual walk per spec Verification section: toast on failed upload (bottom-left, ~4s, hover-pauses, ×), crop-hint pill, outlined Remove image, focus rings, unchanged preview/annotation behavior.
- [ ] `pnpm e2e` if the environment supports it (Playwright editor + PDF flows) — expected unaffected.
