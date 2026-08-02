# Guided — Design System (`DESIGN.md`)

The canonical visual + interaction system for **Guided**, a minimalist, image-driven, print-ready
guidebook editor. This is the source of truth for tokens, type, components, and interaction
patterns. Recommended home in the codebase: `guidebook-editor/DESIGN.md`. The token values below map
onto `app/globals.css` (`@theme`) and the per-area CSS files; the HTML reference that demonstrates
them is `Guided Design.dc.html`.

---

## 1. Identity & principles

- **Character:** a precise, calm, print-oriented tool — a drafting table, not a dashboard.
  Restraint over decoration. The author's screenshots supply the color; the chrome stays quiet,
  cool, and inky.
- **Anchor color:** deep teal ink `#024450` (`oklch(0.34 0.045 200)`), with cool, teal-tinted
  neutrals around it.
- **Avoid:** warm cream + serif + terracotta; neon-on-near-black; broadsheet hairline columns;
  gradient-heavy "AI" looks; decorative motion.
- **Less is more.** Every element earns its place; no filler stats, icons, or sections.

---

## 2. Color tokens

### 2.1 Neutrals (cool, teal-tinted)
| Token | OKLCH | Hex (≈) | Usage |
|---|---|---|---|
| `ink` | `oklch(0.34 0.045 200)` | `#024450` | Primary text, primary actions, active states |
| `ink-soft` | `oklch(0.48 0.04 200)` | `#3f6168` | Secondary text, labels, meta |
| `surface` | `oklch(0.99 0.003 200)` | `#fdfefe` | Cards, panels, left pane |
| `surface-2` | `oklch(0.975 0.004 200)` | `#f7fafa` | Insets, wells, card headers, canvas frame |
| `line` | `oklch(0.92 0.006 200)` | `#e8eded` | Dividers, hairline borders |
| `line-2` | `oklch(0.88 0.008 200)` | `#dbe2e2` | Stronger borders, input/control outlines |
| `selection` | `oklch(0.62 0.17 250)` | `#3b82f6` | Selection box, handles, grid guides, focus, snap (`--color-selection`) |
| `hover` | — | `#f0f5f6` | Hover tint on flat controls (nav items, mini/add buttons, tiles) |
| `danger-text` | `oklch(0.48 0.16 25)` | `#9e332f` | Small danger text (11–12px) — AA-safe; swatch Red stroke `#cb4a47` stays for borders, icons, large elements |
| `app-bg` | `oklch(0.93 0.005 200)` | `#eaefef` | Landing background, app shell behind preview |
| `cream` | — | `#f2f4f4` | Cover / intro / back-cover surfaces (print) |
| `img-border` | — | `#d7dede` | Image-slot frame (print) |

> **Migration:** the current `--color-app-bg: #e9e6e0` (warm) → cool `oklch(0.93 0.005 200)`. Keep
> `cream` / `img-border` (print surfaces).

### 2.2 Annotation + callout palette (paired tokens)
Uniform OKLCH lightness per role — **fill ≈ L 0.96, stroke ≈ L 0.58** — so light/dark contrast stays
perceptually even. **Picking a swatch sets fill AND stroke together.** Hex is the clamped sRGB
fallback for tools/exports.

| Swatch | fill OKLCH | fill hex | stroke OKLCH | stroke hex |
|---|---|---|---|---|
| Ink | `oklch(0.95 0.012 200)` | `#e6f1f2` | `oklch(0.34 0.045 200)` | `#024450` * |
| Red | `oklch(0.955 0.035 25)` | `#ffe8e4` | `oklch(0.585 0.165 25)` | `#cb4a47` |
| Orange | `oklch(0.96 0.04 58)` | `#ffecd8` | `oklch(0.585 0.135 58)` | `#b56410` |
| Amber | `oklch(0.965 0.045 92)` | `#fef3d2` | `oklch(0.585 0.12 92)` | `#957800` |
| Green | `oklch(0.955 0.035 150)` | `#e0f7e4` | `oklch(0.585 0.13 150)` | `#369150` |
| Teal | `oklch(0.955 0.03 195)` | `#daf7f6` | `oklch(0.585 0.095 195)` | `#188d8d` |
| Blue | `oklch(0.955 0.03 250)` | `#e2f2ff` | `oklch(0.585 0.15 250)` | `#217fd0` |
| Violet | `oklch(0.955 0.03 295)` | `#f1edff` | `oklch(0.585 0.16 295)` | `#8464cf` |

\* **Ink stroke** = brand `#024450` (`--color-ink`); its OKLCH approximates that — prefer `#024450`
over the raw conversion (`#163f41`). Other hexes are exact OKLCH→sRGB.

**Callout type → swatch:** info → Blue · note → Ink/Slate · success → Green · warning → Amber ·
danger → Red. On-canvas annotation **fill renders ~50% as a tint; stroke at full strength.**

**PDF mapping (shown live in the inspector):** `/C` = stroke (border) CMYK, `/IC` = fill (interior)
CMYK.

| Swatch | `/C` (stroke) | `/IC` (fill) |
|---|---|---|
| Ink | `0  0.04  0  0.73` | `0.01  0  0.01  0.04` |
| Red | `0  0.67  0.60  0.18` | `0  0.09  0.08  0.01` |
| Orange | `0  0.48  0.78  0.18` | `0  0.12  0.19  0.01` |
| Amber | `0.05  0.10  0.88  0.18` | `0.01  0.02  0.22  0.01` |
| Green | `0.63  0  0.47  0.22` | `0.16  0  0.12  0.03` |
| Teal | `0.88  0.23  0.28  0.14` | `0.22  0.06  0.07  0.01` |
| Blue | `0.82  0.57  0  0.15` | `0.20  0.14  0  0.02` |
| Violet | `0.58  0.80  0  0.15` | `0.14  0.20  0  0.02` |

---

## 3. Typography

Bound to the `next/font` CSS variables in `app/layout.tsx`.

- **Display:** Montserrat — restraint only (wordmark, logomark, cover/section/page titles).
- **Body / UI:** Inter.
- **Data / mono:** JetBrains Mono — token values, OKLCH/PDF/hex, measurements, file paths, step
  counts, section labels, timestamps.

| Role | Font | Size / weight | Tracking |
|---|---|---|---|
| Wordmark | Montserrat 800 | 42px | `-0.03em` (italic `ed`) |
| Cover title (print) | Montserrat 700 | 26pt | `-0.01em` |
| Chapter title (print) | Montserrat 700 | 18pt | `-0.01em` |
| Step title (print) | Montserrat 700 | 14pt | — |
| UI heading | Montserrat 600 | 18px | — |
| Body / input | Inter 400 | 13–14px / 1.5 | — |
| Label | Inter 400 | 11px (`ink-soft`) | — |
| Sub-header (pane) | Inter 600 | 12px (`ink`) | — |
| Dense control | Inter 400 | 12px | — |
| Section label | JetBrains Mono 500 | 10px UPPER (`ink`) | `1.5px` |
| Meta / data | JetBrains Mono 400 | 9–11px (`ink-soft`) | `1–1.5px` |

**Sub-header** = in-pane group titles ("Cell 2.2", row-card titles). **Dense control** = compact
sidebar controls (segmented buttons, control-row labels/selects, callout fields) — deliberate
drafting-table density; do not raise to body size.

---

## 4. Spacing · radius · elevation · motion

- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
- **Radius:** controls/inputs/buttons 7–8px; cards 8–9px; landing card 12px; logomark 6px.
  Tool-modern — not zero, not pill.
- **Elevation (soft, cool):** `0 1px 3px oklch(0.4 0.03 200 / .06), 0 8px 32px oklch(0.4 0.03 200 / .09)`.
  Popovers/overlays a touch deeper. Use sparingly; controls are flat (1px `line-2`), focus = 1px `ink`.
- **Motion:** functional only. Guide fade ~120ms; selection appear ~100ms; hover ~120ms; divider
  drag is direct (no animation). Respect `prefers-reduced-motion`. No decorative animation.

---

## 5. Geometry (print)

A4 baseline 210 × 297 mm; margins 1.5cm (working value `--page-margin: 18mm`). Page sizes
A4 / Letter / A5 / US Legal / Custom; portrait default + landscape toggle. Body region excludes
header/footer; the body band is visually delimited from the header/footer/margin zones. Keep all
renderer mm geometry pixel-accurate to `docs/screenshots/`.

---

## 6. Components

Each lists key style + states. See `Guided Design.dc.html` for the rendered reference.

- **Button — primary:** `ink` bg, white text, radius 7–8px, Inter 13–14px/500, ~32–38px tall.
  Hover `#013640`. **Secondary:** white bg, 1px `line-2`, `ink` text. **Dashed add:** 1px dashed
  `line-2`, transparent, `ink`/`ink-soft` text.
- **Input / textarea / select:** white, 1px `line-2`, radius 7px, ~32px, Inter 13px. Focus → 1px
  `ink` (+ optional `0 0 0 2.5px ink/15%` ring). Label = Inter 11px `ink-soft` above.
- **Section header (left pane):** 44px row, mono 10px/`1.5px` UPPER `ink` label + chevron
  (rotate 180° expanded); 1px `line` top border; body padding `0 16px 16px`. Collapsed may show a
  short summary on the right.
- **Card:** white, radius 8–9px, 1px `line`, soft shadow. **Chapter/Row card:** header row +
  expandable body; selected = 1px `ink` + `0 0 0 1px ink/12%` ring.
- **Nav / step item:** 32px, radius 6px, hover `surface-2`. **Active** = bg `oklch(0.948 0.016 200)`,
  1px `ink`, title `ink`/600, trailing 6px `ink` dot.
- **Toggle (pill switch):** 32×18, track `ink` on / `line-2` off, 14px white knob.
- **Segmented control:** 1px `line-2`, radius 7px; active segment `ink` bg / white. Use for
  side/below, routing, endpoints, fill chooser.
- **Stepper:** 24px ± buttons + mono value.
- **Mini-toolbar (↑ ↓ ×):** 18–22px buttons, 1px `line-2`; × uses danger tint (border
  `oklch(0.87 0.04 25)`, glyph `oklch(0.52 0.13 25)`).
- **Project card:** doc-icon tile + title (Inter 13px/500) + mono meta; hover `surface-2`.
  **Expiring-soon** variant = amber-tinted + `⚡ NNm` pill.
- **Callout (print):** radius 2mm, 1px border, type-colored per the palette mapping; title
  Montserrat 600; below-layout markers auto-numbered.
- **Toast (transient notification):** fixed bottom-left over the left pane (`16px` inset,
  z below modals); text pill, padding `8px 12px`, radius 8px, Inter 13px/1.4, standard elevation;
  tone from the swatch palette (danger = Red, success = Green); auto-dismiss ~4s (paused on
  hover/focus) + `×` dismiss; ~120ms fade + 4px rise, reduced-motion safe; `role="alert"`
  (danger) / `role="status"` (success). Newest on top, 8px gap.
- **Status pill (persistent state):** JetBrains Mono 500 11px sentence-case; warn tones
  (`warn-title` on `warn-bg`, 1px `warn-border`), radius 6px, padding `3px 8px`, inline next to
  the control it describes (overflow badge, crop hint).
- **Danger text-button:** content-sized, padding `4px 8px`, radius 7px, transparent bg,
  `danger-text` color, Inter 12px/500, nowrap; hover = Red swatch fill tint. For text-labeled
  destructive actions ("Remove image"); icon-only `×` stays a mini-toolbar button.
- **Swatch:** 38px, radius 8px; bg = fill, 2px border = stroke, + bottom-right stroke badge.
  States: default · hover (darker fill + soft shadow) · **selected** (`0 0 0 2.5px #fff, 0 0 0 4.5px selection` ring) · focus (2.5px dashed `selection`, 2px offset).
- **Selection handles:** **8 handles** (4 corners + 4 edge mid-points) + a **center move dot**, in
  `selection`; ~6–7px filled dots. (Matches the live `PreviewAnnotations` overlay.)
- **Connector:** 2px stroke; **open-circle endpoint anchors** bound to object edges; **segment
  midpoint handles** for reshaping; arrowhead/endpoint styles none/arrow/circle/diamond/point/bar.

---

## 7. Interaction patterns

- **Grid visibility:** one toggle in the top bar + the preview toolbar; dashed `selection` guides for
  margins, header/footer zones, and row/column dividers; body band faintly tinted; ~120ms fade.
- **Divider drag (row/column):** hover thickens + resize cursor; drag redistributes (neighbour
  shrinks) with live mm readout; stops at a floor; floor-blocked state. Direct, no animation.
- **Object drag (layer-1 primary objects):** drag freely **within the cell**, clamped to cell bounds
  — never crosses into a neighbour.
- **Snapping:** within threshold, a solid `selection` guide line + anchor dots highlight the
  edge/center being snapped to.
- **Annotation — drawn on the canvas:** tools + palette live in a **floating toolbar over the page
  canvas**; shapes are drawn / selected / dragged / snapped **directly on the page**; the inspector is
  a **popover anchored to the selection**. The side panel is *not* the drawing surface (too small) —
  it only lists shapes + numeric properties. Annotations snap to **primary objects** (image slots,
  callouts).
- **Closed-shape fill:** Box / Circle / Polygon offer **Fill / No-fill**: filled = light fill + dark
  stroke (paired swatch, ~50% tint on canvas); no-fill = dark stroke only, transparent interior.
- **Corner radius:** every corner-bearing shape (rectangle, square, polygon) **and** every connector
  elbow is rounded (default 8px; 0 = sharp). No hard 90° corners — FigJam-grade.
- **Connector routing & reshape:** `Straight · Curved · Square` per connector (inspector). **Reshape
  by dragging a segment** (midpoint handle) — bends + rounded corners update automatically; **no
  manual waypoint points**. Ends snap to object anchors; bound connectors re-route live as nodes move.
- **Overflow:** non-blocking inline warning badge; content scales to fit, never clipped.
- **Save status:** idle (hidden) → `Saving…` → `Saved` → `Save failed` (danger tone).
- **Notifications:** transient events (upload failed, action succeeded) → toast, bottom-left;
  persistent state (image doesn't fill cell, page overflow) → inline status pill beside the
  relevant control; destructive actions are buttons, never notification-styled text. Errors are
  descriptive, never color-only.

---

## 8. Responsive

| Breakpoint | Behavior |
|---|---|
| Desktop > 1024px | Default two-pane editor. Primary target. |
| Tablet 768–1024 | Controls pane collapsible; preview scales. |
| Mobile < 768 | Read / light-edit. Picker, preview, quickstart, palette fully touch-friendly. |

Many authors open via the Claude mobile app — picker, preview, and palette must be comfortable on a
phone; **touch targets ≥ 40px.**

---

## 9. Accessibility

- Visible keyboard focus on every control; swatches + tools keyboard-navigable; dividers arrow-key
  nudge by a step.
- ARIA: shapes labelled by type + color; toggles announce state.
- Contrast: stroke/text tokens meet AA on their surfaces; `selection` clearly distinguishable.
- Touch targets ≥ 40px on mobile.
