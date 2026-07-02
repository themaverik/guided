# Annotation Delete Key + Confirm Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the selected annotation with the Delete/Backspace key or the left-panel `×`, both routed through one styled confirmation modal.

**Architecture:** A pure `shouldHandleDeleteKey` guard (`lib/keyboard.ts`); transient `pendingDelete` store state + `requestDeleteAnnotation`/`cancelDeleteAnnotation`; a presentational `ConfirmDialog`; a `useAnnotationDeleteKey` hook + an `AnnotationDeleteController` wiring component mounted inside the store provider; the left-panel `×` rerouted to the same confirm path. Editor-only — no `Book` schema change, no renderer/print change.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (unit), manual/in-browser (visual).

## Global Constraints

- **Editor-only:** all changes in `lib/keyboard.ts`, `lib/store.tsx`, new editor components, `EditorApp.tsx`, `AnnotationEditor.tsx`, `editor.css`. The renderer (`components/renderer/**`) and print path are untouched; nothing new renders in `/print`.
- **No `Book` schema change** — `pendingDelete` is transient editor state, never persisted. No `CURRENT_SCHEMA_VERSION` bump, no migration.
- **Keys = Delete + Backspace.** The shortcut must NOT fire while focus is in an `<input>` / `<textarea>` / `<select>` / `contenteditable` (the inline text editor).
- **Both triggers confirm:** the key and the left-panel `×` both call `requestDeleteAnnotation` → the one modal → `removeAnnotation` on confirm.
- **Modal:** styled to DESIGN.md; Cancel (neutral) + Delete (danger); Esc and overlay-click cancel; focus lands on Cancel on open. Copy: title "Delete annotation?", message "This removes the selected annotation and can't be undone.", confirm "Delete".
- **Provider context:** `EditorApp`'s function body is OUTSIDE `EditorStoreProvider`, so any component calling `useEditor` (the hook + the dialog wiring) must be a CHILD rendered inside the provider — hence `AnnotationDeleteController`, not inline in `EditorApp`.
- Immutable store updates. Commit type `feat` for code, `docs` for ADR/ROADMAP. **No AI attribution** in commit messages. Do NOT `git push`.
- Pre-existing `lib/use-auto-fit.ts` lint warning is acceptable; introduce no new warnings.

---

### Task 1: Pure `shouldHandleDeleteKey` guard

**Files:**
- Create: `lib/keyboard.ts`
- Test: `lib/keyboard.test.ts`

**Interfaces:**
- Produces:
  - `type EditableLike = { tagName?: string; isContentEditable?: boolean }`
  - `function shouldHandleDeleteKey(key: string, active: EditableLike | null, hasSelection: boolean): boolean` — true iff `hasSelection`, `key` is `"Delete"` or `"Backspace"`, and `active` is not editable (not `isContentEditable`, and `tagName` not `INPUT`/`TEXTAREA`/`SELECT`).

- [ ] **Step 1: Write the failing tests**

Create `lib/keyboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldHandleDeleteKey } from "@/lib/keyboard";

describe("shouldHandleDeleteKey", () => {
  it("handles Delete/Backspace with a selection and non-editable focus", () => {
    expect(shouldHandleDeleteKey("Delete", null, true)).toBe(true);
    expect(shouldHandleDeleteKey("Backspace", { tagName: "DIV" }, true)).toBe(true);
  });
  it("ignores other keys", () => {
    expect(shouldHandleDeleteKey("a", null, true)).toBe(false);
    expect(shouldHandleDeleteKey("Enter", null, true)).toBe(false);
  });
  it("ignores when nothing is selected", () => {
    expect(shouldHandleDeleteKey("Delete", null, false)).toBe(false);
  });
  it("ignores when focus is in an input/textarea/select", () => {
    expect(shouldHandleDeleteKey("Delete", { tagName: "INPUT" }, true)).toBe(false);
    expect(shouldHandleDeleteKey("Backspace", { tagName: "TEXTAREA" }, true)).toBe(false);
    expect(shouldHandleDeleteKey("Delete", { tagName: "SELECT" }, true)).toBe(false);
  });
  it("ignores when focus is contenteditable (inline text editor)", () => {
    expect(shouldHandleDeleteKey("Backspace", { isContentEditable: true }, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/keyboard.test.ts`
Expected: FAIL — cannot resolve `@/lib/keyboard` / `shouldHandleDeleteKey is not a function`.

- [ ] **Step 3: Implement `lib/keyboard.ts`**

Create `lib/keyboard.ts`:

```ts
/** A minimal view of the focused element — enough to decide whether a keystroke
 *  is "inside a text field" without depending on the DOM, so it stays unit-testable.
 *  `document.activeElement` (an `Element`) satisfies this shape at the call site. */
export type EditableLike = { tagName?: string; isContentEditable?: boolean };

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when Delete/Backspace should trigger annotation removal: an annotation is
 *  selected, the key is Delete or Backspace, and focus is NOT in a text field or
 *  contenteditable (so editing text is never hijacked). Pure. */
export function shouldHandleDeleteKey(
  key: string,
  active: EditableLike | null,
  hasSelection: boolean,
): boolean {
  if (!hasSelection) return false;
  if (key !== "Delete" && key !== "Backspace") return false;
  if (active?.isContentEditable) return false;
  if (active?.tagName && EDITABLE_TAGS.has(active.tagName)) return false;
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/keyboard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

```bash
git add lib/keyboard.ts lib/keyboard.test.ts
git commit -m "feat: shouldHandleDeleteKey — guard for the annotation delete shortcut"
```

---

### Task 2: Store — `pendingDelete` + request/cancel actions

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: store state `pendingDelete: { ci: number; si: number; id: string } | null` (default `null`); actions `requestDeleteAnnotation(ci: number, si: number, id: string): void`, `cancelDeleteAnnotation(): void`.
- Consumes: existing `removeAnnotation` (unchanged).

- [ ] **Step 1: Add the interface fields**

In `lib/store.tsx`, inside `EditorState`, immediately after the `drawColor: string;` field, add:

```ts
  /** Transient: the annotation queued for delete-confirmation, or null. */
  pendingDelete: { ci: number; si: number; id: string } | null;
```

In the actions section, immediately after the `setDrawColor: (color: string) => void;` signature, add:

```ts
  requestDeleteAnnotation: (ci: number, si: number, id: string) => void;
  cancelDeleteAnnotation: () => void;
```

- [ ] **Step 2: Add the initial value + action implementations**

In `createEditorStore`, immediately after the `drawColor: ANNO_STROKE,` initial value, add:

```ts
    pendingDelete: null,
```

Immediately after the `setDrawColor: (color) => set({ drawColor: color }),` implementation, add:

```ts
    requestDeleteAnnotation: (ci, si, id) => set({ pendingDelete: { ci, si, id } }),
    cancelDeleteAnnotation: () => set({ pendingDelete: null }),
```

- [ ] **Step 3: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/store.tsx
git commit -m "feat: pendingDelete state + request/cancel delete actions"
```

---

### Task 3: `ConfirmDialog` component + styles

**Files:**
- Create: `components/editor/ConfirmDialog.tsx`
- Modify: `components/editor/editor.css`

**Interfaces:**
- Produces: `export default function ConfirmDialog(props: { open: boolean; title: string; message: string; confirmLabel: string; cancelLabel?: string; tone?: "danger" | "default"; onConfirm: () => void; onCancel: () => void })`.

- [ ] **Step 1: Create the component**

Create `components/editor/ConfirmDialog.tsx`:

```tsx
"use client";

/*
 * Reusable presentational confirmation modal — props-driven, no store coupling.
 * A dimmed overlay + centered panel with Cancel + confirm buttons. Esc and
 * overlay-click cancel; focus lands on Cancel on open (safe default for a
 * destructive action). Editor-only; never rendered in print.
 */
import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const titleId = "confirm-dialog-title";
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="confirm-title">
          {title}
        </h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="confirm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn ${tone === "danger" ? "danger" : "primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the modal styles**

In `components/editor/editor.css`, append at the end of the file:

```css
/* Confirmation modal (reusable) */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 36, 43, 0.42);
}
.confirm-panel {
  width: min(380px, calc(100vw - 40px));
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(2, 68, 80, 0.28);
  padding: 22px 22px 18px;
}
.confirm-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: #024450;
}
.confirm-message {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.5;
  color: #4a5b5b;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.confirm-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #d7dede;
  background: #f2f4f4;
  color: #024450;
  font-size: 14px;
  cursor: pointer;
}
.confirm-btn:hover {
  background: #e6ecec;
}
.confirm-btn.primary {
  background: #024450;
  border-color: #024450;
  color: #fff;
}
.confirm-btn.danger {
  background: #d64545;
  border-color: #d64545;
  color: #fff;
}
.confirm-btn.danger:hover {
  background: #c23b3b;
}
.confirm-btn:focus-visible {
  outline: 2px solid #2f6df6;
  outline-offset: 2px;
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/editor/ConfirmDialog.tsx components/editor/editor.css
git commit -m "feat: reusable ConfirmDialog modal"
```

---

### Task 4: Delete-key hook + controller wiring + reroute the `×`

**Files:**
- Create: `components/editor/use-annotation-delete-key.ts`
- Create: `components/editor/AnnotationDeleteController.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `components/editor/AnnotationEditor.tsx`

**Interfaces:**
- Consumes: `shouldHandleDeleteKey` (Task 1); store `selection`/`selectedAnnotation`/`requestDeleteAnnotation`/`pendingDelete`/`removeAnnotation`/`cancelDeleteAnnotation` (Task 2); `ConfirmDialog` (Task 3).
- Produces: `useAnnotationDeleteKey(): void`; `AnnotationDeleteController` (default export, no props).

- [ ] **Step 1: Create the keydown hook**

Create `components/editor/use-annotation-delete-key.ts`:

```ts
"use client";

/*
 * Global Delete/Backspace shortcut for the selected annotation. Opens the confirm
 * modal (via requestDeleteAnnotation) rather than deleting directly. The pure
 * shouldHandleDeleteKey guard skips inputs/textarea/select/contenteditable so
 * editing text is never hijacked. Editor-only.
 */
import { useEffect } from "react";
import { shouldHandleDeleteKey } from "@/lib/keyboard";
import { useEditor } from "@/lib/store";

export function useAnnotationDeleteKey() {
  const selection = useEditor((s) => s.selection);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const requestDeleteAnnotation = useEditor((s) => s.requestDeleteAnnotation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleDeleteKey(e.key, document.activeElement, selectedAnnotation != null)) {
        return;
      }
      if (selection.stepIndex == null || selectedAnnotation == null) return;
      e.preventDefault();
      requestDeleteAnnotation(selection.chapterIndex, selection.stepIndex, selectedAnnotation);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, selectedAnnotation, requestDeleteAnnotation]);
}
```

- [ ] **Step 2: Create the controller (installs the hook + renders the dialog)**

Create `components/editor/AnnotationDeleteController.tsx`:

```tsx
"use client";

/*
 * Installs the Delete/Backspace shortcut and renders the annotation delete
 * confirmation modal, driven by the store's pendingDelete. Mounted once inside
 * the editor store provider (EditorApp's body is outside the provider, so this
 * store-consuming logic lives here). Editor-only.
 */
import ConfirmDialog from "./ConfirmDialog";
import { useAnnotationDeleteKey } from "./use-annotation-delete-key";
import { useEditor } from "@/lib/store";

export default function AnnotationDeleteController() {
  useAnnotationDeleteKey();
  const pendingDelete = useEditor((s) => s.pendingDelete);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const cancelDeleteAnnotation = useEditor((s) => s.cancelDeleteAnnotation);

  return (
    <ConfirmDialog
      open={pendingDelete != null}
      title="Delete annotation?"
      message="This removes the selected annotation and can't be undone."
      confirmLabel="Delete"
      tone="danger"
      onConfirm={() => {
        if (pendingDelete) {
          removeAnnotation(pendingDelete.ci, pendingDelete.si, pendingDelete.id);
        }
        cancelDeleteAnnotation();
      }}
      onCancel={cancelDeleteAnnotation}
    />
  );
}
```

- [ ] **Step 3: Mount the controller inside the store provider**

In `components/editor/EditorApp.tsx`, add the import after the other editor imports (near line 13):

```tsx
import AnnotationDeleteController from "./AnnotationDeleteController";
```

Then, inside `.editor-shell`, immediately after the closing `</div>` of the `.editor` block (after line 60, before `</div>` closing `.editor-shell`), add:

```tsx
        <AnnotationDeleteController />
```

(It must be a child of `EditorStoreProvider` — which it is here — so `useEditor` resolves.)

- [ ] **Step 4: Reroute the left-panel `×` button**

In `components/editor/AnnotationEditor.tsx`:

- Change the `removeAnnotation` binding (line 76) from:

```tsx
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
```

to:

```tsx
  const requestDeleteAnnotation = useEditor((s) => s.requestDeleteAnnotation);
```

- Change the delete button's `onClick` (line 245) from:

```tsx
              onClick={() => removeAnnotation(ci, si, a.id)}
```

to:

```tsx
              onClick={() => requestDeleteAnnotation(ci, si, a.id)}
```

(`removeAnnotation` is used nowhere else in this file, so no dangling reference remains.)

- [ ] **Step 5: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors (no unused `removeAnnotation` in `AnnotationEditor.tsx`).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 6: In-browser verification**

Start `pnpm dev`. Select an annotation → press **Delete**: the modal appears with focus on Cancel. **Esc**, overlay-click, and **Cancel** each dismiss without deleting. **Delete** button removes the shape. Repeat with **Backspace**. Click the left-panel **×** → the same modal opens. While editing annotation text inline (double-click a text shape) or typing in a left-panel field, **Backspace/Delete edits the text** and does NOT open the modal. Open `/print` → no modal.

- [ ] **Step 7: Commit**

```bash
git add components/editor/use-annotation-delete-key.ts components/editor/AnnotationDeleteController.tsx components/editor/EditorApp.tsx components/editor/AnnotationEditor.tsx
git commit -m "feat: Delete/Backspace shortcut + confirm modal for annotation removal"
```

---

### Task 5: ADR-004 amendment, ROADMAP, full verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–4. No code.

- [ ] **Step 1: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green (pre-existing `use-auto-fit.ts` warning only).

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-02): annotation delete key + confirm modal

Adds a keyboard delete for annotations behind a styled confirmation.

- **Keyboard (`useAnnotationDeleteKey`, mounted via `AnnotationDeleteController`
  inside the store provider):** Delete/Backspace requests removal of the selected
  annotation. A pure `shouldHandleDeleteKey(key, active, hasSelection)` guard
  (`lib/keyboard.ts`, unit-tested) skips `<input>`/`<textarea>`/`<select>`/
  `contenteditable`, so editing text is never hijacked.
- **One confirm path:** the key and the left-panel `×` both call
  `requestDeleteAnnotation` (transient store `pendingDelete`), opening a reusable
  presentational `ConfirmDialog` (Esc / overlay / Cancel dismiss; focus on Cancel;
  danger-toned Delete). Confirm → existing `removeAnnotation`.
- **Editor-only:** transient state, no schema change; renderer/`/print` untouched
  (the modal is editor chrome).
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, under "Backlog / next up", add a short **done** entry: annotation **delete key (Delete/Backspace) + styled confirm modal** — both the shortcut and the left-panel `×` route through one `ConfirmDialog`; pure `shouldHandleDeleteKey` guard; editor-only; on `feat/annotation-delete-confirm`. Match the existing backlog entry style/markers.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 delete-key/confirm amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- Styled in-app confirm modal → Task 3 (`ConfirmDialog`).
- Both triggers confirm (key + `×`) → Task 4 (hook + `×` reroute), Task 2 (`requestDeleteAnnotation`).
- Keys Delete + Backspace; guard against editable focus → Task 1 (`shouldHandleDeleteKey`) + Task 4 (hook passes `document.activeElement`).
- Focus on Cancel; Esc / overlay dismiss → Task 3.
- `pendingDelete` transient state → Task 2.
- Provider-context wiring (`AnnotationDeleteController` inside provider) → Task 4 Steps 2–3.
- Editor-only, no schema/renderer/print change → Global Constraints + tasks (no renderer files).
- Pure guard unit-tested; suite stays green → Task 1 + Task 5.
- ADR + ROADMAP → Task 5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; tests show exact expected values. ✓

**3. Type consistency:** `EditableLike` / `shouldHandleDeleteKey(key, active, hasSelection)` (Task 1) match the hook's call `shouldHandleDeleteKey(e.key, document.activeElement, selectedAnnotation != null)` (Task 4) — `document.activeElement` (`Element | null`) is structurally assignable to `EditableLike | null` (optional props). `pendingDelete: { ci, si, id } | null` + `requestDeleteAnnotation(ci, si, id)` / `cancelDeleteAnnotation()` (Task 2) are consumed identically in `AnnotationDeleteController` and the hook (Task 4) and the `×` reroute. `ConfirmDialog` prop shape (Task 3) matches its use in `AnnotationDeleteController` (Task 4). ✓
