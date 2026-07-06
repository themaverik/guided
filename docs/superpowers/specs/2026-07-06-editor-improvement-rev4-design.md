# Improvement Rev4 — Design

Six additive, mostly-independent changes bundled into one branch. Executed via
**subagent-driven development** with **karpathy-guidelines** discipline. No `Book.schemaVersion`
bump — every schema addition is an optional field with a documented default, so
`migrateBook`'s existing gate is untouched and old `book.json` files keep rendering identically.

## 1 — Demo hardening

Demo is a special, disposable sandbox: seeded fresh from `public/example/book.json` on first
visit, forced into grid layout (Task 1), never offered for crash-recovery, and never persisted
past the tab's lifetime. `isDemo` is derived, not stored — `projectSlug === "demo"` — since
`"demo"` is already a reserved slug (`RESERVED_SLUGS`, `lib/project-store.ts:23`) that can't
collide with a real project.

`forceGridLayout` is intentionally separate from `migrateBook`/`migrateStep`: the latter is a
*lossless, additive* schema migration that runs on every load and must stay reversible
(`layoutMode` untouched). `forceGridLayout` is a one-time, demo-only content transform (flips
`layoutMode` to `"grid"`) — conflating the two would make ordinary schema migration silently
opinionated about rendering mode for all books, which breaks the zero-regression rule.

## 2 — Legacy migration

**Feasibility: confirmed yes**, and already half-built. `legacyStepToGrid` handles every legacy
shape the schema allows (single/double/wide, side/below callouts, arbitrary callout counts) by
construction — it's a total function over `Step`, not a best-effort heuristic, so there's no
"can't migrate this one" case to design a fallback for. The only new work is a **bulk** entry
point (`migrateAllStepsToGrid`) and a UI trigger, since today conversion is only exposed per-step
via the Layout dropdown.

Design choice: migration is **additive and non-destructive** — `layoutMode: "legacy"` steps keep
their legacy fields forever (grid conversion only *adds* `grid` + flips the mode flag), so
"migrate all" is safely re-orderable / reversible per step, and re-running it is idempotent
(steps already in grid mode are skipped, matching `setStepLayoutMode`'s existing guard).

New-project default: brand-new steps (`blankStep()`) start in grid mode with one empty cell.
This doesn't touch any existing book — `layoutMode` is only ever unset today on already-authored
legacy steps, which keep resolving to `"legacy"` via `stepLayoutMode()`'s fallback.

## 3 — Background image

### Why it "doesn't work" today

Two real defects, no CSS/paint-order bug:

1. **No fit control.** `background-size: cover` is hardcoded — an image whose aspect ratio
   doesn't match the page (e.g. a portrait photo behind a landscape page) gets aggressively
   cropped with no way to change that, which reads as "broken" even though it's rendering.
2. **Baked, non-portable URL.** `BackgroundSettings.tsx` stores a full
   `/api/projects/<slug>/assets/_background/<file>` URL at upload time. Unlike the watermark icon
   (stored as a bare filename, re-resolved per-project at render time via `watermarkIconSrc`), a
   duplicated or re-imported project keeps pointing at the *old* slug's asset path — a silent
   404, no error surfaced, which is very plausibly what "does not work" describes in practice.

### Fit modes → CSS

Rendering switches from a `background-image` CSS layer to a plain `<img>` so `object-fit` is
available (`background-size` has no "never-upscale" keyword, but `object-fit: scale-down` does):

| Mode      | `object-fit`  | Behavior                                             |
|-----------|---------------|-------------------------------------------------------|
| `auto`    | `cover`       | Default. Fills the page, crops overflow. Same as the prior hardcoded behavior — old books render unchanged. |
| `crop`    | `cover`       | Same mechanism as `auto`, offered as an explicit, named choice. |
| `shrink`  | `scale-down`  | Fits within the page **without ever enlarging** a small image — shrinks only if it's larger than the page. |
| `fit`     | `contain`     | Whole image visible, letterboxed if the aspect ratio doesn't match. |
| `stretch` | `fill`        | Exactly fills the page on both axes; distorts if the aspect ratio differs. |

Per the request: "image should at least have good resolution" — this is an authoring-guidance
note (encourage high-res uploads so `cover`/`fill` don't look soft), not a new validation rule;
no file-resolution check is added.

## 4 — Watermark

Already correctly supports icon-only / text-only / both (`Watermark.tsx:33-37`) and already
applies one `opacity` value to the whole `.watermark` wrapper, inherited by both children — so
opacity consistency (item 4.2) needs no code change, just confirmation.

What changes: `.wm-mark`'s flex axis (`column` → `row`) so an icon renders to the *left* of the
text, centered on the same baseline, instead of stacked above it. The icon's mm-based size is
brought down from "stacked hero logo" proportions (120mm/24mm) to "icon beside a text mark"
proportions (~40mm/~14mm, height-driven, `width: auto`) — otherwise a row layout at the old sizes
would dwarf the text.

## 5 — Fonts

Global CSS-variable swap, not a per-selector change: `--font-heading` and `--font-body` (the two
variables nearly every renderer selector already falls back to) are repointed from
Montserrat/Inter to Roboto. A new `--font-cover` variable preserves Montserrat *only* for
`.cover-title`, since the request carves out Cover title as the one exception. Chapter/Step/Row
titles and Callouts need no per-selector edit — they already fall back to `--font-heading`/
`--font-body`, which now resolve to Roboto. The per-section `ThemeSettings` override UI is
unaffected (it already lets an author pick any of the five bundled families, including Roboto).

## 6 — Restore & discard

Two distinct flows, per the request:

**(a) Abrupt-close restore.** The bug isn't really "images aren't cached" — it's that restore
*recreates the project from scratch* even though the original project (assets and all) is still
sitting on the server for the whole TTL window (default 1 day, vastly longer than a crash-to-
reopen gap). Fix: check if the original slug is still live (`GET .../book`); if so, `PUT` the
cached book onto it (covers "edits made right before the crash didn't make it to the last
autosave") and reopen the *same* project — assets untouched, images intact. Only the genuinely
rare "expired before you came back" case falls back to the old recreate-elsewhere behavior, and
that fallback now says so (images can't be recovered, because the cache never held binaries and
the source directory is gone).

This deliberately does **not** add a client-side image cache (IndexedDB, base64 blobs, etc.) —
that would duplicate storage the ephemeral project store (ADR-005) already provides for the
window that matters, at the cost of real complexity (large blobs in local storage / IDB quota,
sync-on-save, cache eviction).

**(b) Homepage discard.** Today there's no delete at all — only `sweepExpired()` (time-based) and
the local-only, no-confirmation `clearRecent()`. New: a per-item **Discard** action that (1) opens
the exact same `ConfirmDialog` component/props pattern `AnnotationDeleteController` uses (danger
tone, "Discard"/"Cancel"), and, on confirm, (2) deletes the project server-side (new `DELETE
/api/projects/[slug]`) *and* (3) clears the local recovery-cache entry — "discard" now means
actually gone, not just hidden from the list. Bulk "Clear all" is upgraded to the same dialog for
visual consistency (previously a bare `window.confirm`).
