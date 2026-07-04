# Connector endpoint binding UI cleanup (design)

**Date:** 2026-07-04
**Branch:** `feat/endpoint-binding-ui-cleanup` (base `152489c`)
**Status:** Approved — small inline change.

## Problem

The bottom-panel connector endpoint controls (`AnnotationContext`'s `EndpointFields`) expose
a `ref` ("free point" / bind-to-surface) dropdown and an `anchor` dropdown per endpoint.
These are confusing and partly misleading:

- The "**From: free point** … **To: free point**" labeling is meaningless to users.
- In practice the dropdown often shows "free point" *even after the user snapped the endpoint
  to something* — because snapping to **grid content** (a screenshot / callout / cell) is
  deliberately *snap-and-stay* (a free point, no binding); only **drawn shapes** (box / line /
  bracket) create a `ref` binding. So the control is technically correct but reads as broken.

## Why removal loses nothing

Canvas snap-drag already does everything the dropdowns did (`PreviewAnnotations.tsx:315-340`,
`snapPoint` in `lib/annotations.ts`):

- **Bind:** drag an endpoint near a drawn shape → `snapPoint` sets `ref` + the nearest `anchor`
  automatically.
- **Un-bind:** drag it into empty space (past threshold) → free point; **Alt-drag** forces free
  even next to a shape.
- **Anchor:** chosen automatically by proximity.

The connector line visibly attaches to the shape and re-routes as the shape moves, so binding
has its own on-canvas feedback.

## Change

In `components/editor/AnnotationContext.tsx`:

- **`EndpointFields`:** remove the `ref` binding `<select>` (the "free point" + surfaces list)
  and the `anchor` `<select>`. Each endpoint keeps only **style**, **size** (when style ≠
  `none`), and **direction** (when `routing === "square"`).
- Remove the now-unused `surfaces` prop from `EndpointFields` (param + type) and both call
  sites (`<EndpointFields … />`), and the `surfaces = annotations.filter(...)` computation.
- Remove the now-unused `ANCHORS` value import and `Anchor` type import. Keep `Surface`
  (still used by the `updateAnnotation` patch type + `shape.kind` casts) and every other
  import.

**No schema change:** `Endpoint.ref` / `Endpoint.anchor` stay in the data model and are still
set/cleared by canvas snap-drag; only the panel UI is removed. Renderer/print untouched.
`straight` and `square` routing both remain (the earlier "drop straight" idea was rejected —
`straight` is the only way to draw a diagonal pointer arrow, the core screenshot annotation).

## Deferred (YAGNI)

An explicit "bound" indicator dot on the endpoint — the line attaching to the shape is already
the feedback; add later only if it proves unclear.

## Testing

No new unit test (pure UI removal; the drag/snap binding logic is unchanged and already covered).
Verify `pnpm typecheck` (0 — catches the now-unused `ANCHORS`/`Anchor`/`surfaces`), `pnpm lint`
(clean, no unused), `pnpm test -- --run` (219 green), `pnpm build` (OK). Manual (user): select a
connector → endpoint controls show only style/size/direction; drag an endpoint onto a drawn box
→ it binds and re-routes; drag it off → free; Alt-drag → free.

## Success criteria

- No `ref`/`anchor`/"free point" dropdowns in the endpoint controls; only style/size/direction.
- Binding still works entirely via canvas drag (bind / un-bind / anchor); no data or capability
  lost. Editor-only; no schema/renderer/print change; typecheck/lint/suite/build green; no unused
  imports.
