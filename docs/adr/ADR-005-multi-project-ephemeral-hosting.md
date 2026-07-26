# ADR-005: Multi-Project Ephemeral Hosting

- Status: Accepted (implemented in slices across ROADMAP Phase 10)
- Date: 2026-05-30
- Deciders: Lamtei
- Supersedes: the single hand-editable `public/book.js` persistence from the handoff and ADR-001.

## Context and Problem Statement

ROADMAP Theme D (Phase 10) turns the app from a local single-file tool into the hosted product
"Guided": a landing page, multiple projects each at their own endpoint, a demo and quickstart, a
1-hour ephemeral save after inactivity, project download + PDF export, and a privacy stance of
storing only what the user enters (no accounts/PII). The current model — one `public/book.js`
written on disk, images dropped into `public/<chapterId>/` — cannot represent multiple projects and
must be replaced.

## Decision

### Per-project filesystem store with a TTL

Each project is a directory under a server data root:

```
data/projects/<slug>/
  book.json          # the Book config (JSON; replaces window.BOOK = …)
  meta.json          # { slug, name, createdAt, updatedAt }
  assets/<chapterId>/<file>   # project-scoped uploads (was public/<chapterId>/)
```

- `data/` is gitignored and ephemeral. No database; the filesystem is the store. This is adequate
  for a research-preview, keeps "we only store what you enter," and makes download trivial (zip the
  folder).
- **1-hour idle TTL.** `updatedAt` is bumped on every save/touch. A sweeper deletes any project
  whose `updatedAt` is older than the TTL. With no cron in this environment, the sweep runs
  opportunistically at the start of project API calls (cheap directory stat scan); a scheduled task
  can replace it later.

### Slugs and routing

- A project's slug is derived from its name: lowercased, non-alphanumerics → hyphens, collapsed,
  trimmed. Collisions get a `-2`, `-3`, … suffix.
- **Reserved slugs** (never assigned to a user project): `demo`, `quickstart`, `api`, `assets`,
  `print`, `new`, `_next`.
- Routes: `/` = landing; `/<slug>` = editor; `/<slug>/print` = print/PDF route; `/demo` = the demo
  project (seeded from the existing example); `/quickstart` = the guide. Asset URLs are served
  through a project-scoped route (e.g. `/api/projects/<slug>/assets/<chapterId>/<file>`) rather than
  `public/`, since assets now live under `data/`, outside the static `public/` tree.

### The demo project

The existing seed (`public/book.js`) becomes the content of the read-only `/demo` project, so there
is always a populated example. A new project starts from a minimal default book.

### Security (folded in from the next-security discussion)

- Security headers are set natively (Next `headers()`/middleware), not via a third-party plugin.
- Upload route already sanitizes filenames and slugs (`safeSegment`) to prevent path traversal;
  the same applies to project slugs (validated against the reserved list and a strict charset).
- Add basic rate limiting to the upload and PDF-export routes (DoS) when those land.
- Phase 9 markdown is rendered from an escape-first, fixed-tag renderer (no raw HTML), so no
  sanitizer dependency is required; revisit if richer markup is introduced.

## Consequences

- Replaces the single-file model; `public/book.js` survives only as the demo seed. The "hand-edit
  the file" workflow becomes "download/edit/re-import" per project (a follow-up import path).
- No DB keeps ops simple but means projects are genuinely ephemeral — the UI must make the 1-hour
  expiry and the download option obvious.
- Asset serving moves off `public/`, so the renderer's image URL composition changes to the
  project-scoped asset route (threaded as a base path, not hardcoded `/<chapterId>/`).
- Implemented in slices to avoid breaking the working editor: (1) store foundation, (2) project APIs
  + routing + asset re-pointing, (3) landing/demo/quickstart + legal, (4) download + PDF.

## Open questions

- Project import (upload a downloaded zip/JSON to recreate a project).
- Per-project total asset size cap and dedup.
- Production packaging of the data root and the headless browser for PDF (deferred).

## References

- ROADMAP "v2 — Feature expansion", Phase 10.
- Feature request items #8, #9, #10, #11; the `next-security` evaluation.

## Amendment (2026-07-26): per-page background + text color (Wave 3 gate)

Extends the existing book-wide `Book.background?`/`Book.pageTextColor?` fields with
page-scoped overrides on the cover, chapter-intro, and back-cover pages. This amendment is
the ADR-first gate for Wave 3; no code lands with it. It belongs to this ADR rather than
ADR-001 because the addition is purely about asset resolution/portability under the
per-project store, not renderer architecture.

New optional fields: `Chapter.background?` / `Chapter.pageTextColor?` (chapter-intro page),
`Ending.background?` / `Ending.pageTextColor?` (back-cover page), and `Book.coverBackground?`
/ `Book.coverTextColor?` (cover page — distinct from the book-wide `background`/
`pageTextColor` fallback, since the cover already inherits that fallback like every other
page and needs its own override on top). Scope is deliberately narrow: cover /
chapter-intro / back-cover only — **no per-step background**; steps keep inheriting the
book-wide `background` fallback exactly as today.

Backgrounds follow the same portable-bare-filename rule as the existing book-wide
`Background.image` and `Watermark.icon`: stored as a filename only, resolved through
`backgroundImageSrc` against whichever project is currently serving the book, so a
downloaded/re-imported project keeps resolving its per-page backgrounds under the new
project's asset base rather than a stale slug.

Text color layers rather than replaces: a page's own `pageTextColor`, if set, wins for that
page; otherwise it falls back to `book.pageTextColor`; otherwise the default ink. This
requires applying `pageInkVars` at that page's own `.page` section (today it is applied once
at the `.book` root), so one page can diverge from the rest of the book without affecting
it.

Additive: all new fields are optional. No `schemaVersion` bump, no migration; a page
without its own override renders byte-identical to today (falling through to the existing
book-wide `background`/`pageTextColor` behavior).
