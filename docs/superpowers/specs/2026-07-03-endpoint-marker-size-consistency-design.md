# Endpoint marker size consistency (design)

**Date:** 2026-07-03
**Branch:** `fix/annotation-endpoint-marker-size` (base `28ab4ea`)
**Status:** Draft — awaiting user review.

## Problem

Connector endpoint markers read at inconsistent visual sizes for the same `EndpointSize`
setting. The user observed that at the default **medium**, the **arrow** looks roughly
twice the size of the **circle**, **diamond**, and **point**.

Root cause (`components/renderer/AnnotationLayer.tsx` `endpointMarker`, and `MARKER_PX` in
`lib/annotations.ts`): every style shares an `s × s` marker box (`MARKER_PX` = small 8 /
medium 12 / large 18), but each style fills a *different* fraction of it:

| Style | drawn extent | fraction of `s` |
|---|---|---|
| arrow | triangle fills the whole box | **1.00 s** |
| bar | line spans full height | 1.00 s |
| diamond | `dd = 0.34 s` → span `2·dd` | 0.68 s |
| circle | `r = 0.26 s` → diameter | 0.52 s |
| point | `dot = 0.20 s` → diameter | 0.40 s |

So arrow/bar read "full size" while the closed/dot caps read half-size — exactly the
mismatch reported.

## Goal

All five styles read at a **consistent visual extent** for a given `EndpointSize`, so
switching a connector's endpoint style doesn't change its apparent size. Per the user:
shrink the oversized arrow toward the others (and nudge the small ones up) to converge.

## Approach

Keep `MARKER_PX` (the box) unchanged. Retune each style's drawn geometry in
`endpointMarker` to a shared visual target of roughly **0.7 s**, biased by the fact that a
filled shape reads larger than a hollow one at equal bounding size:

| Style | new geometry (in the `s × s` box) | approx extent |
|---|---|---|
| arrow (filled) | `M${s*0.15},${s*0.15} L${s*0.85},${s/2} L${s*0.15},${s*0.85} z` | ~0.70 s (was 1.00) |
| bar | line from `y=s*0.1` to `y=s*0.9` | ~0.80 s (was 1.00) |
| diamond (hollow) | `dd = s*0.38` | ~0.76 s (was 0.68) |
| circle (hollow) | `r = s*0.35` | ~0.70 s (was 0.52) |
| point (filled dot) | `dot = s*0.24` | ~0.48 s (was 0.40) |

`refX/refY` stay as-is except the arrow's `refX` moves with its new tip: **`refX = s*0.85`**
(unchanged — the tip is still at `x = 0.85 s`). The point/circle/diamond/bar keep
`refX = refY = s/2` (centered on the endpoint). Hollow-marker `strokeWidth` stays `1.5`.

These are **starting ratios** — visual equality across a filled arrow, a hollow circle,
and a filled dot is partly subjective, so expect one round of eyeball tuning from the user
after it renders.

## Scope

- **Renderer change** (`AnnotationLayer.tsx` is the shared render for editor preview **and**
  `/print`), so markers update in both — this is intended (a consistency fix, not
  editor-only). No schema change.
- Only `endpointMarker`'s per-style geometry constants change; `MARKER_PX`, `markerRef`,
  the `<marker>` wiring, `markerUnits`, and the connector routing/line code are untouched.
- **Out of scope:** scaling markers with stroke width (a separate "standard sizing"
  enhancement — the complaint is inter-style inconsistency, not thin-vs-thick lines);
  changing the size *keywords* (small/medium/large stay 8/12/18).

## Testing

- No new unit test — these are visual geometry constants (asserting a constant equals a
  constant adds no signal). Verify `pnpm typecheck` (0), `pnpm lint` (clean), `pnpm build`
  (OK), and the existing suite stays green (215).
- Manual (user): draw a connector, cycle `from`/`to` through arrow / circle / diamond /
  point / bar at medium — all should read at a consistent size; check small and large too;
  confirm the same in `/print`. Nudge ratios if any style still looks off.

## Success criteria

- At a given `EndpointSize`, arrow / circle / diamond / point / bar appear consistently
  sized (no style ~2× another); the arrow is visibly smaller than before, the dot/circle a
  touch larger.
- Editor preview and PDF render identically; no schema/routing change; suite/build green.
