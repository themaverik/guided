# ADR-001: Config-Driven A4 Renderer Architecture

- Status: Accepted
- Date: 2026-05-29
- Deciders: Lamtei
- Supersedes: the editor stack described in `CLAUDE.md` (TipTap/ProseMirror + Server Actions, no Zustand)

## Context and Problem Statement

The project carries two conflicting architecture descriptions:

- `CLAUDE.md` specifies a TipTap (ProseMirror) WYSIWYG editor with rich-block content stored as portable TipTap JSON, Server Components by default, persistence via Server Actions, and an explicit ban on a state library (Redux/Zustand).
- `design_handoff_guidebook_editor/README.md` specifies a different product entirely: a print-ready A4 guidebook editor whose document is one plain config object (`book`), rendered by a faithful port of an existing HTML prototype, with a two-pane editor, Zustand state, image upload + `book.js` read/write API routes, and a millimeter-accurate auto-fit algorithm.

These are not reconcilable as written. TipTap models free-form rich text; the handoff models a fixed, structured layout grammar (chapters → steps → image rows → callouts) where the "content" is a typed config object, not a ProseMirror document. We must pick one before any code is written, because the choice dictates the data model, the state layer, the persistence path, and the renderer.

## Decision Drivers

- The handoff ships a complete, pixel-accurate reference renderer (`design-references/Guidebook A4.html`) plus a fully populated example config (`public/book.js`) and an editor UI reference (`Editor UI Reference.html`). This is the concrete, current spec.
- The document is inherently structured (A4 pages, fixed slot geometry, callout grammar), not free-form prose. A typed config object models it directly; a ProseMirror schema would be an awkward, lossy fit.
- The config must remain hand-editable as `public/book.js` so a developer can change the book without the UI. TipTap JSON is not hand-authored comfortably.
- The auto-fit algorithm (`fitSteps`) needs synchronous read-then-write access to rendered DOM measurements — a client-side concern that does not benefit from the Server-Component-first posture.

## Considered Options

1. **Handoff README governs** — build the config-driven A4 renderer + two-pane editor exactly as the README specifies (typed `book` object, Zustand store, API routes for `book.js` + upload, `fitSteps` port). Treat `CLAUDE.md`'s TipTap stack as stale.
2. **Reconcile to CLAUDE.md** — keep the README's UX/renderer but force it onto TipTap, Server Actions, and a context+reducer store.
3. **Hybrid** — config object for layout, TipTap for the rich-text fields (callout/instruction bodies).

## Decision Outcome

Chosen: **Option 1 — the handoff README governs.**

The handoff is the live, detailed, reference-backed specification for the product actually being built. The `CLAUDE.md` TipTap architecture describes a product that does not match the reference implementation and would impose a state and content model the domain does not want. We adopt the handoff stack verbatim:

- Document = one typed `book` object (port the TypeScript shape from the README into `lib/book-schema.ts`).
- State = a single Zustand store holding `book`, with separate UI-selection state (active chapter/step/row/slot).
- Persistence = API routes that read/write `public/book.js` (`window.BOOK = …`), mirrored to `localStorage` for crash recovery.
- Renderer = a React port of `design-references/Guidebook A4.html`, pixel-accurate, with the `fitSteps` auto-fit ported into a `useLayoutEffect` hook.
- No TipTap. Rich-text fields (instructions, callout bodies) are plain text/textarea inputs, matching the prototype.

`CLAUDE.md` should be updated (or annotated) to reflect this stack so it stops contradicting the build. That update is a follow-up task, not a blocker for starting.

### Consequences

Positive:

- The build maps 1:1 to a working reference; fidelity is verifiable against the prototype and screenshots.
- The hand-editable `book.js` workflow is preserved.
- Auto-fit and the client-island renderer have a clean home without fighting a Server-Component-first rule.

Negative / trade-offs:

- Diverges from the documented house style (Server Actions, no Zustand). Mitigated by recording this ADR and updating `CLAUDE.md`.
- API routes (not Server Actions) own persistence — acceptable here because `book.js` is also a static, externally-editable artifact, which is exactly the case `CLAUDE.md` carves out for API routes.
- Introduces Zustand as a dependency in the editor bundle. Justified: the `book` object is shared, deeply-nested, mutated from many controls, and drives an imperative auto-fit pass; prop-drilling or context+reducer would be heavier here.

## Open Questions (resolve during Phase 0)

- `book.js` vs `book.json` + shim: README allows either. Default to single `book.js` to match the prototype exactly; revisit only if parsing the assignment proves brittle.
- Drag-and-drop library for reorder (chapters/steps/rows/callouts) — pick one in Phase 4.
- Whether to update `CLAUDE.md` in place or layer a `docs/` note — decide with the repo owner.

## References

- `design_handoff_guidebook_editor/README.md` — full functional spec.
- `design-references/Guidebook A4.html` — renderer + `fitSteps` source of truth.
- `design-references/public/book.js` — example data model.
- `design_handoff_guidebook_editor/Editor UI Reference.html` — editor structure-outline mockup.
