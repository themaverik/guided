# ADR-007: Unified color tokens — swatch palette as single source

- Status: Accepted
- Date: 2026-07-04
- Related: ADR-001 (config-driven renderer), ADR-004 (annotation canvas), DESIGN.md §2.2

## Context

Two independent color systems coexisted: the 8 OKLCH annotation swatches lived only
in JS (`lib/annotation-palette.ts`), while callouts used their own hand-tuned hex in
`app/globals.css` `@theme` (`--color-{info,note,warning,success,danger}-*`). DESIGN
§2.2 calls for one coherent OKLCH palette shared by annotations and callouts.

## Decision

1. Register the 8 swatches as `@theme` CSS tokens `--swatch-{id}-fill/stroke`
   (Ink/Red/Orange/Amber/Green/Teal/Blue/Violet) — the single CSS palette source,
   mirrored from `lib/annotation-palette.ts` and guarded against drift by
   `lib/swatch-tokens.test.ts`.
2. Derive every callout's colors from its mapped swatch via a uniform recipe:
   bg = swatch.fill; title = swatch.stroke; marker = swatch.stroke;
   border = swatch.stroke @ 33% (`color-mix`); body = neutral `--ink-text`.
3. Map (DESIGN §2.2): info→Blue, note→Ink, success→Green, warning→Amber, danger→Red.
   Keep the `warn`→`warning` alias (consumed by `editor.css`).

## Consequences

- Callout colors shift onto the swatch palette: info teal→blue, note slate→teal-ink,
  titles lighter (stroke L≈0.58). Accepted — one coherent palette is the goal.
- Future callout/annotation colors come from these 8 tokens, not fresh hex.
- The JS↔CSS mirror is a deliberate duplication (the palette UI needs JS hex); the
  drift test keeps them in lock-step.
- `color-mix` is used for callout borders and verified to render in the Playwright→
  Chromium PDF path (print-media computed styles resolve the border to a concrete
  `color(srgb … / 0.33)`; precomputed 8-digit-hex fallback documented in the plan,
  not needed).
- CSS-only: no schema/model change, no migration; existing books unchanged.
