# ADR-008: Pluggable Storage Driver (Filesystem + Netlify Blobs)

- Status: accepted
- Date: 2026-08-02
- Extends: ADR-005 (multi-project ephemeral hosting)

## Context and Problem Statement

ADR-005 stores each project as a directory under `data/projects/<slug>/`
(book.json + meta.json + assets/). The 0.1.0 release deploys to Netlify,
where API routes run as serverless functions with a read-only filesystem and
no shared disk — the filesystem store cannot work there. How do we keep the
ephemeral-project model working both locally and on Netlify?

## Decision Drivers

- Keep local development zero-config (no Netlify CLI required for `pnpm dev`).
- Preserve the ADR-005 model unchanged: slug-keyed projects, idle TTL sweep,
  no database, no auth.
- Keep the slug/path validation chokepoints introduced by the 2026-08-02
  security hardening.

## Considered Options

1. Storage driver interface with filesystem + Netlify Blobs implementations.
2. Port everything to Netlify Blobs only (require `netlify dev` locally).
3. Netlify Database (Postgres) for projects.
4. Host elsewhere (Node/Docker) and skip Netlify.

## Decision Outcome

Option 1. `lib/storage.ts` defines a minimal `StorageDriver` (read / write /
exists / listKeys / removePrefix) over flat keys `"<slug>/book.json"`,
`"<slug>/meta.json"`, `"<slug>/assets/<chapterId>/<file>"`.

- **fs driver** (default): maps keys under `data/projects/` — byte-compatible
  with the ADR-005 layout.
- **netlify-blobs driver**: site-scoped store `guided-projects` with strong
  consistency (create → redirect → load must read its own write). Selected by
  `GUIDED_STORAGE=blobs` (set on the site, scope All), or as a fallback on a
  deployed Netlify build (`NETLIFY=true` without `NETLIFY_DEV`/`NETLIFY_LOCAL`,
  so `netlify dev` stays on the filesystem). `GUIDED_STORAGE=fs` forces the
  filesystem driver. Selection is the pure `resolveDriverKind(env)`.

`lib/project-store.ts` keeps its public API but now performs all validation
in pure string space (`isValidSlug`, `safeRelPath`) before keys reach a
driver; `assetDir`/`resolveAsset` (absolute-path contracts) became
`saveAsset`/`readAsset`/`listChapterAssets` (buffer contracts). The demo seed
is a static JSON import (`public/example/book.json`) so it bundles into
serverless functions.

Blobs has no transactions; last-write-wins on `book.json` matches the
existing single-author autosave model (same behavior as the fs store).
Server-side PDF export (Playwright) remains unavailable on Netlify Functions
— the route's existing 501 fallback stands, with browser print-to-PDF via
`/<slug>/print` as the documented alternative.

### Consequences

- Good: full project lifecycle works on Netlify; local dev unchanged.
- Good: traversal guards are now pure functions with unit tests.
- Bad: two drivers to keep in behavioral sync (covered by the fs-driver unit
  tests plus the shared store logic above the interface).
- Bad: `sweepExpired`/`listProjects` list the whole store per call —
  acceptable at ephemeral-tool scale, revisit if project counts grow.
