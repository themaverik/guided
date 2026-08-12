# Changelog

All notable changes to **Guided** (guidebook-editor) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/).

Moving forward: every user-visible change lands here; `ROADMAP.md` holds only
upcoming features.

## [1.0.0] — 2026-08-13

First stable release — promotes the 0.1.0 feature set to 1.0.

### Fixed

- Local runs no longer assume a Netlify deployment for storage; the
  filesystem driver is used unless `GUIDED_STORAGE=blobs` is set.

### Changed

- README rewritten around an animated demo GIF and the new
  https://guide-editor.netlify.app URL.
- `ROADMAP.md` and `PRD.md` brought up to post-0.1.0 reality (shipped
  history now lives here).
- CI: `actions/checkout` bumped to v7 in the security-scan workflow.

## [0.1.0] — 2026-08-02

Initial public release.

### Added

- **Print-ready A4 renderer** — config-driven pages (cover, TOC, chapter
  intros, step pages, back cover) rendered from a single typed `Book` JSON
  document with millimetre-accurate geometry (ADR-001).
- **Editor** — Next.js 15 / React 19 / Zustand WYSIWYG shell: chapter/step
  management, image rows, callouts (with bullet + numbered lists), rich-text
  markdown subset, per-section themes, backgrounds, watermark, page text
  colors, Roboto default fonts.
- **Flexible grid layout engine** — opt-in per-step grid (`layoutMode`) with
  on-canvas divider resize, cell object stacks (image + callout + text),
  per-image fit/crop modes, borders, alignment, drag-to-float callouts,
  uniform overflow auto-shrink (`fitGrid`), custom page sizes (ADR-006).
- **Annotation canvas** — floating tool palette with drag-to-size creation,
  boxes / diamonds / ellipses / text / brackets / lines, FigJam-parity elbow
  connectors (orthogonal auto-routing, rounded corners, draggable segment
  handles), alignment + distribution + grid snapping, selection popover,
  shared OKLCH swatch palette (ADR-004, ADR-007).
- **Projects & persistence** — per-project storage with ephemeral ~1h TTL
  (ADR-005), autosave with localStorage crash backup, zip export/import,
  project restore and discard.
- **PDF export** — flattened-vector PDF via Playwright/Chromium against the
  dedicated print route; dynamic page sizes.
- **Release packaging** — MIT license + third-party notices, privacy/terms
  pages with a terms-acceptance gate on the landing page, demo video, Netlify
  deployment (storage on Netlify Blobs via a pluggable driver, ADR-008).

### Security

- Slug validation at every store entry point (path-traversal defense).
- Zip decompression caps: 200 MB extracted / 10k entries (zip-bomb defense).
- Request body-size ceilings on book save, project create, image upload
  (20 MB) and archive import (100 MB) with `413` responses.
- Client-supplied book JSON sanitized server-side: page geometry clamped,
  text-color fields pattern-checked against CSS injection.
- PDF export no longer trusts the request Host header (loopback +
  `PDF_BASE_URL` override), navigation timeout, concurrency cap.
- Generic client error messages on upload/import failures (details stay in
  server logs); legacy `new Function` config parser removed.
- All reported dependency CVEs patched via pnpm overrides.
