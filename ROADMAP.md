# Roadmap — Guided (guidebook-editor)

Upcoming features only. Shipped work lives in [CHANGELOG.md](CHANGELOG.md);
the full pre-0.1.0 phase/plan history is preserved in git history
(`git log ROADMAP.md` before the 0.1.0 tag) and in `docs/superpowers/`
specs/plans. Architecture decisions live in `docs/adr/`.

Status legend: [not started] · [in progress]

## Next up

- **UI polish (per DESIGN.md)** — [not started]. Catch-all for visual +
  interaction refinement against the canonical design system in `DESIGN.md`
  (tokens, type scale, spacing, control styling, focus states, mini-toolbars,
  popovers, mobile touch targets). Not yet scoped — break into concrete,
  verifiable passes during a brainstorm. Editor-only; `DESIGN.md` is the
  source of truth on visual questions.

## Later

- **Annotation standardization** — [not started]. ISO 32000 vocabulary;
  Circle + Polygon / Diamond preset; 8-handle selection; segment-drag
  connector reshape; arrow-snap defaults; grid-guides on/off toggle.
- **OKLCH color system** — [not started]. Paired tokens in `@theme`; swatch
  palette + hybrid inspector; editor-only fill tint, full opacity in export;
  unify callouts.

## Accepted limitations (revisit if the hosting model changes)

- No auth / rate limiting / CORS restrictions — accepted for the ephemeral
  ~1h-TTL hosting model (ADR-005).
- Content-Length body caps can be bypassed with chunked encoding — accepted
  residual; caps are a soft guard, not a hard quota.

## Process

Each feature goes brainstorm → spec → plan → subagent-driven execution on a
new branch off `main`, with its own MADR ADR if it touches the schema or the
annotation/grid model.
