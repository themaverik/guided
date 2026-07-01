# Connector direction drag handle — Phase 2 (design)

**Date:** 2026-07-01
**Branch:** `feat/connector-direction-handle` (base `08afedc`)
**Status:** Approved — proceeding to implementation plan.

## Context

Phase 1 (shipped, `08afedc`) added `Endpoint.dir?: "left"|"right"|"up"|"down"` and a
panel control (auto/←/→/↑/↓) to set a square connector's endpoint direction so the
arrow points a chosen way. The user chose "both" a panel and an on-canvas handle;
**Phase 2** adds the on-canvas **direction drag handle** — set `dir` spatially by
dragging a knob at the endpoint.

Reuses the Phase-1 `dir` field and routing entirely; this is purely an editor
interaction. No schema change; nothing new renders in print.

## The handle

For a **focused `square` connector**, each endpoint (`from` and `to`) gets a small
draggable **direction knob** on a short stem:

- The knob sits `KNOB_PX = 24` screen-px out from the endpoint, along the endpoint's
  **current run direction**, connected to the endpoint by a thin stem line.
- The run direction is derived from the **rendered route** (`connectorRoute`): for
  `from` it is `sign(points[1] − points[0])` per axis; for `to` it is
  `sign(points[last] − points[last−1])` (the arrow direction). Route segments are
  orthogonal, so this is a unit axis vector. Because the route already reflects
  `dir`, the knob shows the current state whether `dir` is set or auto.
- Straight connectors get **no knob** (`dir` is square-only). The knob is distinct
  from, and offset from, the existing endpoint **move** handle (at the endpoint
  center) and the segment handles.

## Interaction

Dragging a knob writes `ep.dir`:

- The drag vector `(pointerNorm − endpointNorm)` is snapped to the nearest compass
  axis by a pure helper `compassDir(dx, dy) → "left"|"right"|"up"|"down"` (dominant
  axis + sign; on an exact tie, horizontal wins).
- `apply` sets `{ [which]: { ...ep, dir } }` via `updateAnnotation` (rAF-throttled,
  same as the other handles), so the route (and arrow) updates live as you drag.
- **Uniform semantics:** the UI sets `ep.dir` to the dragged direction for both
  ends — the routing's role-aware `anchorDir` handles the from-vs-to sign
  internally. So "drag the knob the way you want the connector to run here" — for
  the `to` end that is the way the arrow points.
- **Clearing to auto** stays on the Phase-1 panel ("auto dir"); the knob only
  *sets* a direction, keeping the gesture unambiguous.

## Architecture

All editor-only; no renderer/print change; no schema change.

- **`lib/annotations.ts`:** add pure `compassDir(dx: number, dy: number): "left" |
  "right" | "up" | "down"`. Unit-tested.
- **`components/editor/PreviewAnnotations.tsx`:**
  - `Part` gains `"dir"`; the `drag` ref carries `which?: "from" | "to"` for a dir
    drag.
  - `startDirDrag(id, which)` initiates it.
  - In `apply`, a `d.part === "dir"` branch: resolve the endpoint, compute
    `compassDir(p.x − ep0.x, p.y − ep0.y)`, and `updateAnnotation(ci, si, d.id,
    { [d.which]: { ...cur, dir } })`.
  - In the focused-`square`-connector JSX, render, per endpoint, a stem `<line>` +
    a knob (small circle) at `endpoint + runDir · KNOB_PX`, with
    `onPointerDown={startDirDrag(focused.id, which)}`. `runDir` from
    `connectorRoute(...)` as above (fallback to the `to`/`from` resolved point when
    a segment is degenerate → hide the knob if no direction can be derived).
- **`components/editor/editor.css`:** a `.preview-anno-dir` knob style + a
  `.preview-anno-dir-stem` line style.

## Testing

- **Unit (`lib/annotations.test.ts`):** `compassDir` — `(0.1, 0)`→"right",
  `(-0.1, 0)`→"left", `(0, 0.1)`→"down", `(0, -0.1)`→"up", dominant-axis
  (`(0.1, 0.05)`→"right"), exact tie (`(0.1, 0.1)`→"right", horizontal wins).
- **Visual (in-browser):** focus the image→callout square connector; drag the To
  knob right/left/up/down → the arrow snaps to each; matches the panel's To value;
  the From knob sets the leave direction; `/print` shows no knob.

## Out of scope

- Clearing to auto via a drag gesture (the panel handles it).
- Diagonal directions or free-angle rotation (`dir` is 4-way).
- Knobs on straight connectors.
- Any routing change (Phase 1 already routes `dir`).

## Docs

- **ADR-004** amended: the on-canvas direction knob (Phase 2) — reuses Phase-1
  `dir`; `compassDir` pure snap helper; editor-only (no print), no schema change;
  clearing-to-auto stays on the panel.
- **ROADMAP.md**: mark the endpoint direction override Phase 2 (drag handle) done;
  the direction-override feature complete.
