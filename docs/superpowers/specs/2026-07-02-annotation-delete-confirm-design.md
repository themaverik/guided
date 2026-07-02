# Annotation delete key + confirm modal (design)

**Date:** 2026-07-02
**Branch:** `feat/annotation-delete-confirm` (base `71df5b3`)
**Status:** Approved — proceeding to implementation plan.

## Context

Today an annotation can only be deleted via the small `×` button on each
left-panel card (`AnnotationEditor.tsx:245` → `removeAnnotation`, no
confirmation). There is no keyboard delete, and no guard against accidental
removal. This adds a **Delete / Backspace** shortcut and a **styled in-app
confirmation modal**, routing **both** the key and the existing `×` button
through one confirm-then-remove path.

Editor-only: no `Book` schema change, renderer/`/print` untouched. `pendingDelete`
is transient editor state.

## Decisions of record (from brainstorm sign-off)

1. **Styled in-app confirm modal** (not native `window.confirm`). The app has no
   styled modal today (only `window.confirm` in `LandingActions.tsx:59`); this
   introduces the first reusable `ConfirmDialog`.
2. **Both triggers confirm:** Delete/Backspace **and** the left-panel `×` route
   through one `requestDeleteAnnotation` → confirm → `removeAnnotation` path.
3. **Keys = Delete + Backspace** (Figma convention).
4. **Focus defaults to Cancel** (safer for a destructive action).
5. **Guard:** the key never fires while editing annotation text inline or typing in
   any `<input>` / `<textarea>` / `<select>` / `contenteditable`.

## State (Zustand store — `lib/store.tsx`)

Transient editor state, joining `selectedAnnotation` / `activeTool` / `drawColor`
(never persisted to the `Book`):

- `pendingDelete: { ci: number; si: number; id: string } | null` (default `null`).
- `requestDeleteAnnotation(ci: number, si: number, id: string): void` — sets
  `pendingDelete`.
- `cancelDeleteAnnotation(): void` — clears it.

`removeAnnotation` is unchanged (it already clears `selectedAnnotation` when the
removed id was selected).

## Keyboard trigger — `useAnnotationDeleteKey` hook + pure guard

- **Pure guard (new `lib/keyboard.ts`):**
  `shouldHandleDeleteKey(key: string, active: EditableLike | null, hasSelection: boolean): boolean`
  where `EditableLike = { tagName?: string; isContentEditable?: boolean }`.
  Returns `true` **iff** `hasSelection` **and** `key === "Delete" || key === "Backspace"`
  **and** `active` is not editable (not `isContentEditable`, and `tagName` not
  `INPUT` / `TEXTAREA` / `SELECT`). Pure and unit-tested.
- **Hook (`components/editor/use-annotation-delete-key.ts`):** a `window` `keydown`
  listener (mounted in `EditorApp`). On each key it reads `selectedAnnotation` and
  `selection` from the store, calls `shouldHandleDeleteKey(e.key,
  document.activeElement, selectedAnnotation != null)`; if `true`, `e.preventDefault()`
  and `requestDeleteAnnotation(selection.chapterIndex, selection.stepIndex,
  selectedAnnotation)`. The listener is cleaned up on unmount. (Annotations live on
  the selected step, so `ci`/`si` come from `selection`.)

## The `×` button — `AnnotationEditor.tsx`

Reroute the card delete button (`:245`) from
`onClick={() => removeAnnotation(ci, si, a.id)}` to
`onClick={() => requestDeleteAnnotation(ci, si, a.id)}`, so it opens the same
confirm.

## The modal — `components/editor/ConfirmDialog.tsx` (new)

Presentational, props-driven so it is reusable (e.g. SP2):
`{ open: boolean; title: string; message: string; confirmLabel: string;
cancelLabel?: string; tone?: "danger" | "default"; onConfirm: () => void;
onCancel: () => void }`.

- Renders nothing when `!open`. Otherwise a dimmed overlay + centered white rounded
  panel with title, message, and **Cancel** (neutral) + **confirm** (danger tone)
  buttons, styled to DESIGN.md tokens.
- `role="dialog"`, `aria-modal="true"`, labelled by the title.
- **Esc** and **overlay click** call `onCancel`. Focus moves to the **Cancel**
  button on open.
- No global state coupling — it is driven entirely by props.

## Wiring — `EditorApp.tsx`

- Mount `useAnnotationDeleteKey()` (installs the keydown listener).
- Read `pendingDelete` + the store actions, and render one `<ConfirmDialog>`:
  `open={pendingDelete != null}`, delete-annotation copy, `tone="danger"`,
  `onConfirm={() => { removeAnnotation(pendingDelete.ci, pendingDelete.si,
  pendingDelete.id); cancelDeleteAnnotation(); }}`, `onCancel={cancelDeleteAnnotation}`.
- Copy: title **"Delete annotation?"**, message **"This removes the selected
  annotation and can't be undone."**, confirm label **"Delete"**.

## Architecture summary

- **`lib/keyboard.ts`** (new): pure `shouldHandleDeleteKey` + `EditableLike` type (unit-tested).
- **`lib/store.tsx`:** `pendingDelete` state + `requestDeleteAnnotation` /
  `cancelDeleteAnnotation`.
- **`components/editor/ConfirmDialog.tsx`** (new): presentational modal.
- **`components/editor/use-annotation-delete-key.ts`** (new): the keydown hook.
- **`components/editor/EditorApp.tsx`:** mount the hook + the dialog.
- **`components/editor/AnnotationEditor.tsx`:** reroute the `×` button.
- **`components/editor/editor.css`:** `.confirm-*` modal styles.

## Testing

- **Unit (`lib/keyboard.test.ts`):** `shouldHandleDeleteKey` — Delete/Backspace with a
  selection and a non-editable target → `true`; a null active target → `true`; any
  other key → `false`; no selection → `false`; active `INPUT` / `TEXTAREA` /
  `SELECT` / `contentEditable` → `false`.
- **Visual (in-browser):** select a shape → press Delete → modal appears, focus on
  Cancel; Esc / overlay / Cancel dismiss without deleting; Delete button removes the
  shape. The left-panel `×` opens the same modal. While editing annotation text or
  typing in a field, Delete/Backspace edits text and does NOT open the modal.
  `/print` is unaffected (no modal in export).

## Out of scope

- Undo/redo (the app has none; the modal is the safeguard).
- Multi-select delete (one selected annotation at a time — current model).
- Confirmation for other destructive actions (chapters/steps/rows) — this is
  annotation-scoped.
- Any `Book` schema change, renderer change, or print change.

## Docs

- **ADR-004** amended: keyboard delete (Delete/Backspace) + a styled `ConfirmDialog`
  for annotation removal; transient `pendingDelete` store state; pure
  `shouldHandleDeleteKey` guard (skips editable targets); both the key and the
  left-panel `×` route through the one confirm path; editor-only (no schema/print
  change).
- **ROADMAP.md:** note the annotation delete-key + confirm modal shipped.
