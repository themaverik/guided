# Left Sidebar Design Polish — Design Spec

**Date:** 2026-08-02
**Branch:** `feature/sidebar-design-polish`
**Status:** Approved by user (brainstorm sign-off 2026-08-02)
**Extends:** DESIGN.md (amended in the same commit) · ADR-007 (swatch tokens)

## Context

Production-release polish pass on the left editor sidebar. A screenshot review surfaced
raw red text in the cell editor; an audit (ui-ux-designer, 2026-08-02) against DESIGN.md
found the red items are three distinct kinds of UI plus broader token/typography drift:

1. `.img-picker-error` — transient upload errors rendered as permanent inline red text.
2. `.cell-crop-hint` ("This image doesn't fill the cell…") — a persistent state hint
   rendered as bare colored text.
3. "Remove image" (`CellEditor.tsx:143`) — a destructive **action button** reusing
   `.mini-btn danger` (fixed 22×22px), so its label wraps as broken red text.

Plus: no `--color-selection` token exists (root cause of the `#2563eb` vs `#3b82f6`
split), `#f0f5f6` hover tint repeated 7+ times, `#fff` hardcoded ~15 times despite
`--color-paper` existing, radius 6px outliers, section-label typography drift, a
`.border-fields` vs `border-controls` classname mismatch leaving the image Border
controls unstyled, and missing focus rings / ARIA state on segmented controls.

## Goals

- Every left-sidebar element consistent with DESIGN.md (as amended here).
- Transient errors → toasts; persistent hints → status pills; destructive text
  actions → a proper danger text-button.
- Meet DESIGN.md §9 accessibility in the sidebar (focus visibility, seg ARIA state).
- DESIGN.md updated so it can be shared as the canonical system for new visuals.

## Non-goals / guardrails

- **No behavior changes.** No changes to `components/renderer/**`, `Preview*.tsx`,
  annotation/grid interactions, or the print/PDF path.
- No new dependencies (zero-dep toast).
- No top-bar / ephemeral-notice / preview-toolbar redesign (only token adoption where
  a rule is shared).
- Implementation chunked so each SDD task needs < 70k context.

## Locked decisions

| Decision | Choice |
|---|---|
| Notification mapping | Transient events → toast · persistent state → pill · actions → buttons |
| Toast position | Fixed bottom-left, over the sidebar |
| Sidebar density | Keep 12px; document as a **dense control** role in DESIGN.md §3 |
| Danger small text | New AA-safe darker `--color-danger-text`; swatch Red `#cb4a47` stays for borders/icons/large elements |
| A11y scope | Include `:focus-visible` rings + `aria-pressed` on segmented buttons |

## Design

### D1. Tokens (`app/globals.css` `@theme`)

| Token | Value | Notes |
|---|---|---|
| `--color-selection` | `#3b82f6` (`oklch(0.62 0.17 250)`) | New. Repoint sidebar `#2563eb` uses (e.g. `.callout-item.selected`) at it. Editor-only overlay colors in `Preview*` files are **out of scope**. |
| `--color-hover-bg` | `#f0f5f6` | New. Replaces the 7+ repeated hover tints. Same rendered value — zero visual change. |
| `--color-danger-text` | `oklch(0.48 0.16 25)` ≈ `#9e332f` | New. Small danger text (≥ 5.5:1 on white). Replaces `#a11` at `.mini-btn.danger`, `.save-status.error`. |
| `--color-paper` | exists | Adopt in `editor.css` in place of hardcoded `#fff` (~15 sites, mechanical, zero visual change). |

Danger *surfaces* (toast bg/border, button hover tint) use the existing Red swatch
tokens (`--swatch-red-fill` / `--swatch-red-stroke`), per ADR-007.

### D2. Toast (new component)

- **Data:** store channel in `lib/store.tsx` — `notices: Notice[]`,
  `pushNotice({ tone, message })`, `dismissNotice(id)`.
  `Notice = { id, tone: "danger" | "success", message }`. Immutable updates.
- **Render:** new `components/editor/Toast.tsx`, mounted once in `EditorApp`
  (editor route only; never on `[slug]/print`).
- **Anatomy:** text pill, `padding 8px 12px`, radius 8px, Inter 13px/1.4,
  standard §4 elevation, tone bg/border/text from swatch tokens
  (danger = Red, success = Green).
- **Position/stack:** `position: fixed; left: 16px; bottom: 16px; z-index: 60`
  (below `.confirm-overlay`), column-reverse, gap 8px, newest on top.
- **Behavior:** auto-dismiss ~4000ms, timer pauses on hover/focus-within; manual `×`
  (borderless mini-btn glyph, `aria-label="Dismiss"`). Enter/exit fade +
  `translateY(4px)` at ~120ms; `prefers-reduced-motion` → no transition.
- **A11y:** container `role="alert" aria-live="assertive"` for danger,
  `role="status" aria-live="polite"` for success.
- **First consumer:** `ImagePicker` upload errors — replace local `error` state
  render (`.img-picker-error` removed) with `pushNotice`. Keep messages descriptive
  ("Upload failed — file too large"), never color-only.

### D3. Status pill

Formalize the existing `.overflow-warn` recipe as `.status-pill` (modifier
`.status-pill--warn`): JetBrains Mono 500 11px, no uppercase,
`color --color-warn-title`, `bg --color-warn-bg`, `1px --color-warn-border`,
radius 6px, `padding 3px 8px`, inline. `.cell-crop-hint` becomes a
`.status-pill--warn` immediately below the Fit control (same copy).
`.overflow-warn` repoints to the shared class (no visual change).

### D4. Danger button (outlined)

New `.btn-outline-danger` (user-selected over a quiet text-button, 2026-08-02):
content-sized, `padding 5px 10px`, radius 7px, bg `--color-paper`,
`1px solid --swatch-red-stroke` at ~40% alpha, `color --color-danger-text`,
Inter 12px/500, nowrap; hover = bg `--swatch-red-fill` + full-strength border;
`:focus-visible` ring per D6. Follows the DESIGN.md secondary-button anatomy with
danger tones. Applied to "Remove image" (`CellEditor.tsx:143`) and any other
text-labeled destructive sidebar action found during implementation. Icon-only
`×` buttons keep `.mini-btn.danger` (with the new token color).

### D5. Consistency sweep (CSS-only)

- `.editor-section-title` → mono **10px / 500 / 1.5px** tracking, UPPER, `ink` (§3).
- Radius 6px → **7px** on `.mini-btn`, `.stepper button`,
  `.callout-item input/textarea/select`, `.rta-toolbar button`.
- `.row-card` radius 10px → 9px (cards 8–9px).
- Fix classname mismatch: `CellEditor.tsx` `border-controls` ↔ `editor.css:845`
  `.border-fields` — rename the CSS rule to `.border-controls` so the intended
  Colour/Width/Radius grid layout applies.
- Token adoption per D1 (`paper`, `hover-bg`, `selection`, `danger-text`).
- 12px control text **stays** (dense-control role); control heights stay.

### D6. Accessibility

- `:focus-visible` on all sidebar controls currently lacking it (`.seg-btn`,
  `.mini-btn`, `.add-btn`, `.btn-text-danger`, `.ctrl-row select`,
  `.callout-item` fields): `outline: 1px solid var(--color-ink); outline-offset: 2px`
  (danger variants use `--color-danger-text`). Give `.seg` `overflow: visible`
  + per-corner radii on end buttons so rings aren't clipped.
- Segmented controls (Fit, text-align, and other `.seg-btn` groups in the sidebar):
  add `aria-pressed={active}` — attribute-only, no behavior change.

### DESIGN.md amendments (same commit)

- §2.1: add `hover` and `danger-text` token rows; note `selection` now exists as
  `--color-selection` in `@theme`.
- §3: add **Sub-header** (Inter 12px/600 `ink` — `.editor-subtitle`,
  `.row-card-title`) and **Dense control** (Inter 12px — compact sidebar controls)
  roles.
- §6: add **Notification (toast)**, **Status pill**, **Danger text-button** entries.
- §7: add notification interaction pattern (transient → toast bottom-left ·
  persistent → inline pill · actions are never notifications).

## Implementation chunking (for the plan)

Each task independently buildable, < 70k context, verified by
`pnpm typecheck && pnpm test && pnpm lint`:

1. Tokens + DESIGN.md amendments (globals.css + docs; no component changes).
2. Toast: store channel + `Toast.tsx` + mount + `ImagePicker` migration (+ unit
   tests for the store channel).
3. Status pill + danger text-button + border-controls classname fix (CellEditor +
   editor.css).
4. Consistency sweep (editor.css mechanical pass: paper/hover/selection/danger
   tokens, radii, section-title type).
5. A11y: focus-visible rules + `aria-pressed` on seg groups.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm lint` green; store channel unit-tested.
- Visual: sidebar matches DESIGN.md; upload error appears as bottom-left toast,
  auto-dismisses at ~4s, dismissible, announced to screen readers.
- Crop hint renders as amber pill; "Remove image" renders as a single-line danger
  text-button.
- Print/preview regression: `pnpm e2e` unaffected; no diff under
  `components/renderer/**`; grid/annotation interactions untouched.
- Keyboard walk of the sidebar shows a visible ring on every control.

## Out of scope (logged for backlog)

- ImagePicker combobox ARIA semantics (`aria-expanded`/`listbox`).
- Top-bar / ephemeral-notice restyle.
- Preview overlay blues (`#2563eb` in `Preview*` files) → `--color-selection`.
- Toast "+N more" collapse (YAGNI at current error volume).
