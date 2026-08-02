# Roadmap — Guided (guidebook-editor)

Upcoming features only. **v0.1.0 is released** — live at
[guide-editor.netlify.app](https://guide-editor.netlify.app); shipped work
lives in [CHANGELOG.md](CHANGELOG.md). The full pre-0.1.0 phase/plan history
is preserved in git history (`git log ROADMAP.md` before the v0.1.0 tag) and
in `docs/superpowers/` specs/plans. Architecture decisions live in
`docs/adr/`.

Status legend: [not started] · [in progress]

## Next up

- **UI polish (per DESIGN.md)** — [not started]. Catch-all for visual +
  interaction refinement against the canonical design system in `DESIGN.md`
  (tokens, type scale, spacing, control styling, focus states, mini-toolbars,
  popovers, mobile touch targets). Not yet scoped — break into concrete,
  verifiable passes during a brainstorm. Editor-only; `DESIGN.md` is the
  source of truth on visual questions.

## Later

- **Annotation standardization — remainder** — [not started]. Most of the
  original scope shipped in 0.1.0 (OKLCH paired-token palette unified across
  callouts + annotations per ADR-007, swatch palette + hybrid inspector,
  editor-only fill tint, ellipse/diamond shapes, elbow connectors with
  segment-drag reshape, snapping, grid-chrome toggle). Still open: internal
  ISO 32000 element vocabulary, a generic polygon preset, 8-handle resize on
  selection, arrow-snap defaults, and W3C Web Annotation export (P2 in the
  PRD).
- **PDF export on Netlify** — [not started]. The Playwright/Chromium export
  runs only on self-hosted deployments; on serverless it returns 501 and
  users print `/​<slug>/print` from the browser. Evaluate a
  serverless-compatible Chromium (or an external render service) so Export
  PDF works on the hosted app.

## Accepted limitations (revisit if the hosting model changes)

- No auth / rate limiting / CORS restrictions — accepted for the ephemeral
  ~1h-TTL hosting model (ADR-005).
- Content-Length body caps can be bypassed with chunked encoding — accepted
  residual; caps are a soft guard, not a hard quota.
- `listProjects`/`sweepExpired` scan the whole store per call — accepted at
  ephemeral-tool scale (ADR-008).

## Process

Each feature goes brainstorm → spec → plan → subagent-driven execution on a
new branch off `main`, with its own MADR ADR if it touches the schema or the
annotation/grid model.
