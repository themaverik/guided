# Connector endpoint direction override — Phase 1 (design)

**Date:** 2026-07-01
**Branch:** `feat/connector-endpoint-direction` (base `e9c75e1`)
**Status:** Approved — proceeding to implementation plan.

## Context

A `square` (elbow) connector's arrowhead orients along its **final segment**
(`AnnotationLayer.tsx`, `orient="auto-start-reverse"`, marker on the last segment).
For a **free-point** (unanchored) connector, that final segment's orientation is
chosen by a fixed dominant-axis heuristic (`squareHorizontalFirst`,
`|Δx| ≥ |Δy|`), and the P3 segment-drag handles reshape the middle but never flip
the entry orientation. So an author cannot control which way the arrow points at a
free endpoint — the reported problem (arrow stuck pointing up when the author wants
it pointing right toward a callout).

Anchored endpoints already get a direction from their bound edge (`anchorDir` /
`anchorAxis`, which return `null` for free points). This feature lets a free
endpoint carry an **explicit direction** that the same routing machinery honors.

**Scope split (user chose "both"):** this is **Phase 1** — schema + routing + a
panel control. **Phase 2** (its own later cycle) adds an on-canvas drag handle to
set the direction spatially.

## The model

New **additive** field on `Endpoint` (`lib/book-schema.ts`):

```ts
/** Overrides the auto-routing direction for a square connector at this end.
 *  The way the connector RUNS at this end (its first/last segment travel): for
 *  the `to` end (arrowhead) this is the way the arrow points; for `from` it is the
 *  way the connector leaves. Absent = auto (dominant-axis heuristic). */
dir?: "left" | "right" | "up" | "down";
```

- `"left"/"right"` ⇒ the end's segment is **horizontal**; `"up"/"down"` ⇒
  **vertical**.
- On the **`to`** end the arrow points the chosen way; on **`from`** the connector
  leaves the chosen way.
- Absent = today's behavior. No migration.

## Routing (`lib/annotations.ts`)

The square route is built from each endpoint's **effective direction**, in
precedence order **explicit `dir` → bound anchor edge → dominant-axis heuristic**:

1. **Axis** — `anchorAxis(ep)` returns `"h"` for `dir` left/right, `"v"` for
   up/down (in addition to today's anchor-edge cases). This alone makes
   `squareHorizontalFirst` route the directed end's segment on the chosen axis —
   which already fixes the reported case (a `to.dir:"right"` end gets a horizontal
   final segment, and because the callout sits to the right of the source the
   arrow points right).

2. **Sign** — to make `"left"` vs `"right"` (and `"up"` vs `"down"`) genuinely
   distinct regardless of layout, a **directed endpoint is stubbed**: its
   first/last segment is a short `STUB`-length run in the chosen travel direction,
   so the arrow points exactly the chosen way even when the far endpoint is on the
   "wrong" side. The stub reuses the existing `STUB = 0.04` constant and the same
   L/Z/C/U corner logic that already routes anchored (directed) endpoints —
   `anchorDir(ep)` is extended to yield the correct signed vector for a free
   endpoint's `dir` (accounting for `from` vs `to`: `from` leaves along `dir`, `to`
   arrives along `dir`).

`squareRoute` is extended to honor a single directed endpoint (today it only takes
the signed `anchorDir` path when **both** ends are directed); the changes are
additive branches guarded by the existing 140+ connector-routing tests plus new
ones, so P1 auto-routing and P3 bends are preserved. `connectorPoints` /
`routeWithBends` are otherwise unchanged; the P3 segment-drag bends still apply on
top of the directed base route.

**Editor + print parity:** `dir` lives in the `Book` and flows through
`connectorPoints`, so the editor preview and the printed PDF route identically.
This is a **data-driven** routing change — the renderer (`AnnotationLayer.tsx`)
is untouched.

**Straight connectors** are unaffected (their arrow already follows the line);
`dir` applies only to `square` routing.

## UI (`components/editor/AnnotationEditor.tsx`)

The connector inspector's **From** and **To** rows each gain a compact direction
control — **Auto / ← / → / ↑ / ↓** (5 states) — writing `from.dir` / `to.dir` via
the existing `updateAnnotation`. Reuses the existing segmented-button (`.seg`)
style already used elsewhere in the editor. Selecting **Auto** clears `dir`.

## Testing

### Unit (`lib/annotations.test.ts`)

1. **Axis honored for a free endpoint** — `anchorAxis({dir:"right"})` → `"h"`,
   `{dir:"up"}` → `"v"` (no `ref`).
2. **Signed vector honored** — `anchorDir` yields the correct signed vector for a
   free endpoint's `dir`, role-aware (`from` vs `to`).
3. **`to.dir:"right"` makes the last segment horizontal & rightward** — for a
   free-point square connector with the target to the right, the final segment is
   horizontal and travels +x (arrow points right).
4. **Sign forced against layout** — `to.dir:"right"` with the target to the *left*
   still yields a final segment travelling +x (the stub forces it), so `"right"`
   ≠ `"left"`.
5. **Precedence** — explicit `dir` overrides a bound anchor; absent `dir` on both
   ends reproduces today's heuristic route exactly (regression).
6. **P3 bends still apply** on a directed base route.

### Visual (in-browser)

On a grid step, set the To end of the image→callout connector to **→**; confirm
the arrow points right in the preview and in `/print`. Try **↑/↓/←** and **Auto**.

## Out of scope (Phase 1)

- The **on-canvas drag handle** (Phase 2).
- `dir` on `straight` connectors (their arrow already follows the line).
- Diagonal directions.
- Changing marker/anchor behavior otherwise.

## Docs

- **ADR-004** amended: `Endpoint.dir` (additive), the effective-direction
  precedence (explicit → anchor → heuristic), the stub-forces-sign routing note,
  editor+print parity via `connectorPoints`, no renderer change, Phase-2 drag
  deferred.
- **ROADMAP.md**: note endpoint direction override (Phase 1, panel) done; Phase 2
  (on-canvas drag) pending.
