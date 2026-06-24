# Handoff: Guided — whole-app visual redesign

## Overview
Guided is a minimalist, image-driven, print-ready guidebook editor. Authors lay out
annotated screenshots on A4 pages and export print-accurate PDFs. This handoff covers a
**whole-app visual redesign** spanning the landing/project picker, the two-pane editor
shell, the left controls pane, the live A4 preview, the **annotation palette + inspector**
(the signature element), and the print/export view.

The design direction is a **precise, calm, print-oriented tool — a drafting table, not a
dashboard.** Restraint over decoration. The author's screenshots supply the color; the
chrome stays quiet, cool, and inky.

## About the Design Files
The file in this bundle (`Guided Design.dc.html`) is a **design reference created in HTML** —
a single scrollable canvas with four labeled sections showing the intended look and behavior.
It is **not production code to copy directly.**

**The target codebase already exists**: the `guidebook-editor` Next.js 15 app (App Router,
React 19, Tailwind v4 CSS-first `@theme`, Zustand store, plain CSS modules per area). The task
is to **recreate these designs inside that existing environment**, editing the real files
listed under "Files to touch" below and following the app's established patterns — not to ship
the HTML. Geometry constants (millimeters) and the print renderer must stay pixel-accurate to
the existing output in `docs/screenshots/`.

The annotation palette section is **interactive** in the reference: clicking a tool or a
swatch updates the inspector live. That interactivity is the spec for the real component's
behavior.

## Fidelity
**High-fidelity (hifi).** Final colors (OKLCH), typography, spacing, radii, and interaction
states are all specified. Recreate pixel-accurately using the codebase's existing CSS files and
React components. Where the redesign departs structurally from current code, it is called out
explicitly (most notably: a new full-width top bar, and a rebuilt annotation palette/inspector).

---

## Design Tokens

> **`DESIGN.md`** (in this bundle) is the canonical design-system reference — full token tables
> (with OKLCH **and** hex), type scale, components, and interaction patterns. The values below are a
> summary; when in doubt, `DESIGN.md` wins. Recommended home in the codebase: `guidebook-editor/DESIGN.md`.

All neutrals are **cool, teal-tinted OKLCH**. Several of these already exist in
`app/globals.css` `@theme`; the redesign **shifts the warmer / sRGB values to the cool OKLCH
scale below** and **adds the paired annotation palette**. Update `@theme` to match.

### Neutrals
| Token | Value | Usage |
|---|---|---|
| `ink` | `oklch(0.34 0.045 200)` ≈ `#024450` | Primary text, primary actions, active states |
| `ink-soft` | `oklch(0.48 0.04 200)` | Secondary text, labels, meta |
| `surface` | `oklch(0.99 0.003 200)` (≈ `#fff`) | Cards, panels, left pane |
| `surface-2` | `oklch(0.975 0.004 200)` | Insets, wells, canvas/preview frame, card headers |
| `line` | `oklch(0.92 0.006 200)` | Dividers, hairline borders |
| `line-2` | `oklch(0.88 0.008 200)` | Stronger borders, input/control outlines |
| `selection` | `oklch(0.62 0.17 250)` | Selection box, active handles, grid guides, focus ring |
| `cream` | `#f2f4f4` | Cover / intro / back-cover surfaces (print) |
| `img-border` | `#d7dede` | Image slot frame (print) |
| `app-bg` (canvas) | `oklch(0.93 0.005 200)` | Landing page background, gray app shell behind preview |

> **Migration note:** the current `--color-app-bg: #e9e6e0` is too warm — replace with the cool
> `oklch(0.93 0.005 200)` above. Keep `cream` and `img-border` as-is (they're print surfaces).

### Annotation + callout palette (paired tokens)
Uniform OKLCH lightness across hues — **fill ≈ L 0.96, stroke ≈ L 0.58** — so light/dark
contrast stays perceptually even. Picking a swatch sets **fill AND stroke together**.

OKLCH is the source of truth (uniform perceptual lightness); the sRGB **hex** columns are the
clamped fallback for tools/exports that need hex — surfaced live in the inspector and the palette
reference.

| Swatch | fill (OKLCH) | fill hex | stroke (OKLCH) | stroke hex |
|---|---|---|---|---|
| Ink | `oklch(0.95 0.012 200)` | `#e6f1f2` | `oklch(0.34 0.045 200)` | `#024450` * |
| Red | `oklch(0.955 0.035 25)` | `#ffe8e4` | `oklch(0.585 0.165 25)` | `#cb4a47` |
| Orange | `oklch(0.96 0.04 58)` | `#ffecd8` | `oklch(0.585 0.135 58)` | `#b56410` |
| Amber | `oklch(0.965 0.045 92)` | `#fef3d2` | `oklch(0.585 0.12 92)` | `#957800` |
| Green | `oklch(0.955 0.035 150)` | `#e0f7e4` | `oklch(0.585 0.13 150)` | `#369150` |
| Teal | `oklch(0.955 0.03 195)` | `#daf7f6` | `oklch(0.585 0.095 195)` | `#188d8d` |
| Blue | `oklch(0.955 0.03 250)` | `#e2f2ff` | `oklch(0.585 0.15 250)` | `#217fd0` |
| Violet | `oklch(0.955 0.03 295)` | `#f1edff` | `oklch(0.585 0.16 295)` | `#8464cf` |

\* **Ink stroke** resolves to the brand token `#024450` (the codebase's `--color-ink`); its OKLCH
is an approximation of that brand value, so prefer `#024450` over the raw OKLCH→sRGB conversion
(`#163f41`). All other hex values are the exact sRGB conversion of their OKLCH.

**Callout type → swatch mapping (one source of truth):** info → Blue · note → Ink/Slate ·
success → Green · warning → Amber · danger → Red. On-canvas annotation fills render at ~50% as
a tint; stroke at full strength. (The existing flat callout colors in `globals.css`
`--color-info-*` etc. may stay for the print callouts, but new annotation marks must use the
paired palette above.)

### Typography
- **Display:** Montserrat — used with restraint (cover, page/section titles, wordmark, logomark).
- **Body / UI:** Inter.
- **Data / mono:** JetBrains Mono — token values, OKLCH/PDF mappings, measurements, file paths,
  step counts, section labels.

Scale (screen UI):
| Role | Font | Size / weight | Notes |
|---|---|---|---|
| Wordmark | Montserrat 800 | 42px / `-0.03em` | landing; `ed` italic |
| Section title (print) | Montserrat 700 | 26pt cover, 18pt chapter, 14pt step | print renderer |
| UI heading | Montserrat 600 | 18px | — |
| Body / input | Inter 400 | 13–14px / 1.5 | controls, fields |
| Label | Inter 400 | 11px | field labels (`ink-soft`) |
| Section label | JetBrains Mono 500 | 10px / `letter-spacing 1.5px` / uppercase | left-pane + panel headers (`ink`) |
| Meta / data | JetBrains Mono 400 | 9–11px | step counts, OKLCH, PDF, timestamps (`ink-soft`) |

These bind to the `next/font` CSS variables already set in `app/layout.tsx`
(`--font-montserrat`, `--font-inter`, `--font-jetbrains-mono`).

### Spacing / radius / elevation
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
- **Radius:** 7–8px for controls/inputs/buttons; 8–9px for cards; 12px for the landing card.
  (Tool-modern — not zero, not pill.)
- **Elevation (soft, cool):** `0 1px 3px oklch(0.4 0.03 200 / .06), 0 8px 32px oklch(0.4 0.03 200 / .09)`.
  Use sparingly. Inputs/controls are flat with a 1px `line-2` border; focus adds a 1px `ink` border.

### Geometry (unchanged — keep `globals.css :root` mm constants)
Page sizes A4 / Letter / A5 / US Legal / Custom; portrait default + landscape toggle. A4
baseline 210 × 297mm, margins 1.5cm (the current `--page-margin: 18mm` is the working value).
Body region excludes header/footer; visually delimit the body band from header/footer/margin
zones on the canvas.

---

## Screens / Views

### 1 — Landing / project picker
**Files:** `app/page.tsx`, `components/landing/LandingActions.tsx`, `app/landing.css`
**Purpose:** entry point — start a new project, view demo, view quickstart, reopen a recent
(ephemeral, ~1h TTL) project.

**Layout:** full-viewport flex-center on `app-bg` (`oklch(0.93 0.005 200)`). Centered card,
max-width ~400px, white, radius 12px, soft shadow, `overflow:hidden`. Two-tone:
- **Card header** (`surface-2` bg, 36px padding, 1px `line` bottom border):
  - Kicker: JetBrains Mono 9px, `letter-spacing 2.5px`, uppercase, `ink-soft` — `Guidebook · Editor`
  - Wordmark: Montserrat 800 42px `-0.03em` `ink` — `Guid` + italic `ed`
  - Tagline: Inter 13.5px / 1.6 `ink-soft`, max-width 280px — "A simple, minimalist, image-driven, print-ready guidebook editor."
- **Card body** (white, 28px 36px 32px padding):
  - New-project row: text input (`Name your project…`, 38px tall, radius 8px, 1px `line-2`) + primary `Create →` button (`ink` bg, white text).
  - "or" divider (hairline — label — hairline).
  - Two full-width secondary buttons (1px `line-2`, white): `View demo`, `View quickstart`.
  - 1px `line` divider.
  - Recent section: header row `Recent` (mono label) + `Clear all` (mono underlined, `ink-soft`).
  - Project cards (each: 9–10px padding, radius 8px, 1px `line`, hover → `surface-2`):
    - 28px doc-icon tile (`surface-2` bg, 1px `line`), title (Inter 13px/500 `ink`, truncates),
      meta (mono 10px `ink-soft` — `3 chapters · 2m ago`), trailing chevron.
    - **Expiring-soon variant:** amber-tinted (bg `oklch(0.996 0.008 90)`, border `oklch(0.87 0.04 80)`),
      amber icon, and a trailing pill badge `⚡ 48m` (bg `oklch(0.96 0.05 75)`, border
      `oklch(0.76 0.09 72)`, mono 9px).
  - Footer: centered `Terms of Use · Privacy Policy` (Inter 11px `ink-soft`).

**Copy:** keep the existing wordmark treatment (`Guid` + italic `ed`) and exact tagline.

### 2 — Editor shell (two-pane)
**Files:** `components/editor/EditorApp.tsx`, `components/editor/PreviewPane.tsx`, `components/editor/editor.css`
**Purpose:** the main workspace. Left controls (~380px, scrollable); right live A4 preview
scaled to fit, origin top-center.

**STRUCTURAL CHANGE — add a full-width top bar.** Today there is no app top bar; the
project-level actions live inside `PreviewPane`'s toolbar. The redesign introduces a top bar
**spanning both panes**, below the ephemeral notice and above the `LeftPane | resizer | PreviewPane`
row. Recommended: render it in `EditorApp.tsx` (a new `TopBar` component) so the editor body
becomes `flex-direction:column → [EphemeralNotice][TopBar][editor row]`.

Vertical stack (frame is 1280×820 in the mock):
1. **Ephemeral notice** (36px, full width) — amber band (`oklch(0.965 0.04 90)` bg, `oklch(0.87 0.045 80)` bottom border). Centered text `⏱ This project expires in ~48 minutes. Download to keep your work.` + `Download ZIP` button (`ink` bg, white, radius 6px). Only shows when expiring; reuse `EphemeralNotice`.
2. **Top bar** (48px, white, 1px `line` bottom, 16px h-padding, gap 10px):
   - Left: 28px **logomark** — `ink` rounded-6px square, Montserrat 800 15px white `G`.
   - Breadcrumb: `Guided` (Inter 12px `ink-soft`) · `/` (`line-2`) · **project name** (Inter 13px/500 `ink`) + small pencil icon (editable in place).
   - Spacer (flex 1).
   - Save status: mono 10.5px `ink` — green dot + `Saved 2m ago` (states: idle hidden, `Saving…`, `Saved`, `Save failed` in a warn/danger tone).
   - **Grid-visibility toggle** — 32px icon button (1px `line-2`, white), 4-dot grid glyph.
   - `Download` and `Print` — secondary buttons (32px, 1px `line-2`, white, Inter 12.5px/500).
   - `Export PDF` — primary (`ink` bg, white).
3. **Editor row** (fills remaining height): `LeftPane` (380px) · 5px resizer (`line`; hover/active → `ink`; `col-resize`) · right pane (`surface-2` bg).
   - **Right-pane toolbar** (40px, white, 1px `line` bottom): `‹ Prev` · `Page N / M` (mono) · `Next ›` · spacer · **Grid** label + pill switch (track `ink` when on, white knob). Page nav stays here (outside the scaled element), per the existing pattern.
   - **Preview scroll area** (`surface-2`, `overflow:auto`): the scaled `<A4Book>`. Current page gets a 3px `ink` outline (existing `.page--active`, restyle to the ink token). Subtle `selection`-tinted dashed margin guides appear when grid is on (≈120ms fade; respect `prefers-reduced-motion`).

### 3 — Left controls pane
**Files:** `components/editor/LeftPane.tsx` + each section component (`BookSettings`, `ThemeSettings`,
`BackgroundSettings`, `WatermarkSettings`, `ChapterList`, `StepEditor`, `RowCard`, `CalloutEditor`,
`ImagePicker`, `AnnotationEditor`), `components/editor/editor.css`
**Purpose:** sectioned authoring controls for the selected step.

**Section pattern (restyle `.editor-section` / `.editor-section-title`):** each top-level
section is a collapsible block separated by a 1px `line` top border. Header row is 44px tall,
16px h-padding, with a mono 10px/`1.5px`/uppercase `ink` label on the left and a chevron on the
right (rotate 180° when expanded). Collapsed sections may show a short summary on the right
(e.g. Fonts → `Custom`). Section body padding `0 16px 16px`.

Sections, in order: **Book Settings** (Title / Subtitle / Author / Edition — Inter 13px inputs,
32px, radius 7px, 1px `line-2`, focus → 1px `ink`); **Fonts** (per-section family/size/color,
collapsible); **Background**; **Watermark**; **Chapters**; **Step** (selected); **Ending**.

**Watermark sub-panel** (`components/editor/WatermarkSettings.tsx` — see design section 05):
collapsible section with an **Enable** pill toggle, **Text** input (e.g. `CONFIDENTIAL — DRAFT`),
a **Position** picker (a small page-shaped 2D control with the 5 valid spots — `center` +
4 corners — selected spot = `ink` dot with a `selection` ring; the others outline), an **Opacity**
slider (0–1, default ~0.08, mono readout), a **Size** slider (0.3–2.5×, default 1.00×, mono
readout), and an optional **Logo** upload (dashed button → uploads to `public/_watermark/`, shown
above the text). All values flow through the existing `updateWatermark` store action; defaults
`DEFAULT_WATERMARK_OPACITY` / `DEFAULT_WATERMARK_SCALE`.

**Watermark render** (`components/renderer/Watermark.tsx` + `.watermark` in `renderer.css` —
keep current geometry): a non-interactive overlay above the page background, below content
(`z-index:0`), `print-color-adjust:exact` so it survives print. **center** = the logo+text mark
stacked, rotated −30°, large (text ~64pt, icon ~120mm, both × `--wm-scale`), `ink` color at the
chosen opacity. **corners** = small (text ~13pt, icon ~24mm), inset ~10mm (top corners tighter,
~4mm, to clear the chapter subheading). Text is Montserrat 800, uppercase, letter-spaced.

**Chapters:** each chapter is a card (1px `line`, radius 8px). Header row: mono index `01`,
title (Inter 12.5px/600 `ink`), mono `N steps`, and a 3-button mini-toolbar (↑ ↓ ×; the ×
uses a danger tint — border `oklch(0.87 0.04 25)`, glyph `oklch(0.52 0.13 25)`). Expanded chapter
shows an indented step list (2px `line` left rule):
- **Step item:** mono index + title (Inter 12px). Normal = `ink-soft`.
- **Active/selected step:** bg `oklch(0.948 0.016 200)`, 1px `ink` border, radius 6px, title
  `ink`/600, trailing 6px `ink` dot.
- `+ Add step` (dashed `line-2` button) at the list end; `+ Add chapter` below the cards.

**Step editor:** section header shows `Step` + `02 · Connect your data` summary. Fields: Page
title (focused state = 1px `ink` border + `0 0 0 2.5px oklch(0.34 0.045 200 / .15)` ring), Page
instruction (textarea). Then **Rows**:
- **Row card** (selected = 1px `ink` + `0 0 0 1px ink/12%` ring). Header: `Row 1`, mono `1 col`,
  mini ↑ ↓ × toolbar. Body (1px `line` top): **Image picker** (26px thumb tile + mono filename +
  caret), **Placement** segmented control (`Side` | `Below`; active segment = `ink` bg/white),
  **Callouts** stepper (− N +), then per-callout cards: a type `<select>` (info/note/warning/…),
  ↑ ↓ × mini-toolbar, Title input, Body textarea. `+ Add row` (dashed) below.
- **Annotations** section header carries a count badge (mono pill). Expands into the annotation
  system (screen 5).

### 4 — Grid canvas (right pane) — interaction design
**Files:** `components/editor/PreviewPane.tsx`, `components/editor/PreviewAnnotations.tsx`,
`components/renderer/*`, `components/editor/editor.css`
- Visible grid guides, toggleable from both the top bar and the right-pane toolbar; dashed lines
  tinted with `selection` at low alpha; ≈120ms fade (respect reduced motion).
- Clear visual distinction between the **body band** and the header/footer/margin zones.
- Row/column divider handles: idle → hover (thicken + resize cursor) → drag (live redistribute,
  neighbor shrinks, stop at floor) → floor-blocked state. Direct drag, no animation.
- Cell selection + in-cell object drag; snap guide lines / anchor highlights within threshold.
- Shape select: selection box + **8 handles (4 corners + 4 edge mid-points)** and a **center move
  dot**, all in `selection` (matches the live build). Resize from any handle; drag the center to move.
- Overflow: non-blocking inline warning badge; content scales to fit, never clipped (the existing
  `.preview-toolbar .overflow-warn` badge — restyle to the warn/amber tokens).
- Missing image: labelled cream placeholder with photo icon + expected file path (existing
  `.img-slot` empty state — keep, retune to tokens).

### 5 — Annotation toolbar + shape palette + inspector  ⭐ signature element
**Files:** `components/editor/AnnotationEditor.tsx`, `components/editor/editor.css`
**This is the biggest departure from current code.** The existing `AnnotationEditor` exposes a
plain `<input type="color">` + numeric width per item. Rebuild it around the **paired
fill/stroke palette + a live inspector**. Build directly on the language shown in the reference's
section 03.

**Interaction model (important):** annotations are **drawn, selected, dragged, and snapped directly
on the page canvas** (the right-pane preview overlay — see `PreviewAnnotations.tsx`, which adds
move/resize handles and draggable, snapping connector ends). The **tools + palette live in a
floating toolbar over the canvas**, and the **inspector opens as a popover anchored to the selected
shape**. The side panel is *not* the drawing surface (too small) — at most it lists shapes + exposes
numeric properties. Selected shapes show **8 handles (4 corners + 4 edge mid-points) + a center move
dot**; connector ends are **open-circle anchors** bound to a box edge.

**Tools row** — 8 buttons, 42×36px, radius 7px, 1px `line-2`, icon in `ink`. Active tool = `ink`
bg + white icon + `ink` border. Tools (map to existing `newSurface` / `newConnector` kinds where
they exist; add the rest): **Box, Circle, Line, PolyLine, Polygon, Ink, FreeText, Highlight.**

**Palette row** — the 8 paired swatches, 38×38px, radius 8px. Each swatch: `background` = the
swatch **fill**, `border: 2px solid` = the **stroke**, plus a 12px bottom-right corner badge
(`border-radius: 4px 0 8px 0`) filled with the **stroke** — so one chip reads as a fill/stroke
pair. Clicking sets fill AND stroke together. **States:** default; hover (slightly darker fill +
soft shadow); **selected** = `box-shadow: 0 0 0 2.5px #fff, 0 0 0 4.5px <selection>` ring; focus =
2.5px dashed `selection` outline, 2px offset.

**Inspector** — header `Inspector · <SwatchName>` (mono). Then, **live to the current selection**:
- Two 52px chips side by side — **Fill** and **Stroke** (each radius 8px, 1.5px `line-2` border) —
  with mono uppercase labels.
- An OKLCH readout well (`surface-2`, radius 7px): `fill <oklch(…)>` over a hairline over
  `stroke <oklch(…)>`, all JetBrains Mono.
- **PDF mapping** well (`surface-2`): `/C  [ … ]` (stroke, the PDF border color) and
  `/IC  [ … ]` (fill, the PDF interior color), mono. These are the per-swatch CMYK arrays — see
  the table in "State Management / data" below; compute from the OKLCH→CMYK conversion the export
  pipeline uses, displayed live.
- **Stroke width** control with a slider + mono `2pt` readout.
- **Corner radius** control (slider + mono `8px` readout) — **every corner-bearing shape and every
  connector elbow is rounded** (rectangle, square, polygon; default radius 8px, 0 = sharp). No hard
  90° corners anywhere — match FigJam-grade flow shapes. Circles/straight lines ignore it.
- **Fill / No-fill** — shown **only for closed shapes** (Box / Circle / Polygon). A two-chip chooser
  rendered with the current swatch: **Filled** = light fill + dark stroke (the paired swatch, ~50%
  tint on canvas); **No-fill** = dark stroke only, transparent interior. Selected chip carries the
  `selection` ring.
- **Routing** — lives **here in the left panel / inspector** (per-connector, like the build's `Path`
  dropdown), shown for **Line / PolyLine / Connector**: a `Straight · Curved · Square` selector. The
  chosen routing **renders on the page canvas** (see design section 05). **Square** = orthogonal
  elbow with the corner-radius arc at each bend; **Curved** = bezier; **Straight** = direct.
  (Extends the existing connector `routing: straight | elbow`.)
- **Endpoints** — `From` and `To` segmented controls over styles `none · arrow · circle · diamond`
  (existing endpoint styles: none/arrow/circle/diamond/point/bar — include the full set; active
  segment = `ink`/white).

#### Connectors & flow (design section 05)
Connectors join two **objects** (their `from`/`to` endpoints bind to a shape/cell — see the existing
`Connector` primitive + `resolveEndpoint`). Behaviour to match:
- **Snap to anchors:** each object exposes edge-mid-point anchors (N/E/S/W). A connector end within
  threshold snaps to the nearest anchor; the live anchor highlights in `selection` blue (filled dot
  + white ring). Idle anchors render as faint outline dots on hover/select.
- **Reshape by dragging a segment (Figma/FigJam standard):** each straight leg of an elbow connector
  exposes a **midpoint segment handle**; dragging it perpendicular slides that leg and the bend
  follows automatically — corners re-fillet to the radius. **Do not** require the user to add manual
  waypoint points (the current diamond-point stepper UX): waypoints are created/removed implicitly as
  segments are dragged. Endpoints stay draggable + snapping; the `waypoints` array is the storage,
  but the *interaction* is segment-drag, not a points counter.
- **Live re-route:** moving or resizing a node re-routes its bound connectors (straight, curved, or
  square) automatically.
- **Rounded elbows:** Square routing fillets every bend to the corner-radius arc — render the path
  with arc/quadratic corners, not sharp `L` joints.
- **Nodes are rounded:** flow nodes (primary objects) use the shape corner radius (≈10px in the
  mock) and the paired palette for fill/stroke, so the whole diagram reads FigJam-grade.

A separate reference frame in the mock documents swatch **states** (default/hover/selected/focus)
and the full **palette token table** — use it to verify the values.

### 6 — Print / export preview
**Files:** `app/[slug]/print/…`, `components/renderer/*`, `components/renderer/renderer.css`
**Purpose:** the `/[slug]/print` route — one `.page` per sheet, no editor chrome.
- Gray `app-bg` behind the sheets; each A4 sheet white (or `cream` for cover/intro/back), soft
  shadow on screen, none in `@media print`.
- **Cover page** (matches `docs/screenshots/cover-contents.png`): mono kicker `A Guidebook · N Chapters`
  (`ink`), Montserrat 700 title, Inter subtitle (`ink-soft`), `Contents` mono label, TOC rows
  (grid `index | title+sub | p.NN`, hairline `line` separators, Montserrat 600 chapter titles),
  footer `Author` / `Edition` in mono.
- **Step page** (matches `docs/screenshots/side-callouts.png`): mono step header
  `STEP n OF m` / `CH. nn — TITLE`, Montserrat title, numbered instruction, image slot + side/below
  callouts. Keep all renderer geometry pixel-accurate.
- **Export menu** — floating panel (top-right): white, radius 9px, 1px `line`, soft shadow, mono
  `Export` header, three rows: `Print to PDF`, `Download ZIP`, and a primary `Export PDF`
  (`ink` bg, white) — each with a leading icon. Wire to the existing `/api/projects/[slug]/pdf`,
  `/download`, and `/[slug]/print` endpoints.

### 7 — Quickstart & demo  /  8 — Legal
**Files:** `app/quickstart/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx`, `.prose` in `app/landing.css`
Not separately mocked — they reuse the existing `.prose` document style. Retune `.prose` to the
cool tokens (Montserrat headings in `ink`, Inter body in `ink-text`, JetBrains Mono `code` and the
`back` link, `cream` code background). Keep the ephemeral-data / no-personal-details note on the
legal pages and the populated demo project.

---

## Interactions & Behavior
- **Tool select** (annotation): sets active tool; inspector shows/hides Fill toggle (fillable
  shapes), Routing (Line/PolyLine/Connector), and Endpoints accordingly. Corner-radius applies to
  every corner-bearing shape and connector elbow.
- **Connector draw / edit:** drag from one object to another; ends snap to anchor points; switch
  routing (Straight / Curved / Square) per connector; Square elbows render with rounded corners;
  bound connectors re-route live as nodes move.
- **Swatch pick:** fill + stroke update together; inspector OKLCH + PDF `/C`·`/IC` readouts update
  live.
- **Divider drag:** direct (no animation); neighbor shrinks; stop at floor; floor-blocked state.
- **Shape select:** selection box + 8 handles (corners + edge mid-points) + center move dot
  (`selection`), ~100ms appear.
- **Connector binding:** each end (`From`/`To`) = bound object id + edge anchor (top/bottom/left/
  right/center) + endpoint style; `Path` routing = straight/curved/square; waypoints via the points
  stepper. Ends render as open-circle anchors on the bound box edge (design section 05, frame C).
- **Snap:** within threshold, show snap guide line / highlight anchor.
- **Grid toggle:** fade in/out ~120ms; respect `prefers-reduced-motion`.
- **Page overflow:** non-blocking inline warn badge; content scales, never clipped.
- **Hover:** ~120ms; section headers, nav items, project cards, swatches.
- **Save status:** idle (hidden) → `Saving…` → `Saved` → `Save failed` (danger tone).
- **Responsive:** desktop >1024 default two-pane; tablet 768–1024 collapsible controls + scaled
  preview; mobile <768 read/light-edit — picker, preview, quickstart, and palette fully touch-
  friendly (targets ≥40px). Many authors open via the Claude mobile app.

## State Management
Existing Zustand store (`lib/store.tsx`) already drives book/selection/overflows/annotation
selection. Redesign additions:
- **Top bar** reads project name + save status (`use-autosave`); grid-visibility becomes a shared
  boolean (lift the toggle so both the top bar and right-pane toolbar reflect it).
- **Section collapse** state per left-pane section (local UI state is fine).
- **Annotation inspector** reads the active tool + selected swatch and derives the displayed OKLCH
  pair and PDF `/C`·`/IC` arrays.

### Per-swatch PDF `/C` (stroke) and `/IC` (fill) arrays shown in the inspector
(CMYK, 0–1 — display values; compute from the export pipeline's OKLCH→CMYK conversion)
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

## Accessibility
- Visible keyboard focus on every control; swatches and tools keyboard-navigable; dividers
  arrow-key nudge.
- ARIA: shapes labelled by type + color; toggles announce state.
- Contrast: stroke/text tokens meet AA on their surfaces; `selection` clearly distinguishable.
- Touch targets ≥40px on mobile.

## Motion
Subtle and functional only. Guide fade ~120ms ease; selection appear ~100ms; hover ~120ms; divider
drag is direct (no animation). Avoid decorative animation. Respect `prefers-reduced-motion`.

## Assets
No new image assets. Icons are inline SVG (document, pencil, grid, chevrons, camera/photo, export
glyphs, annotation tool icons). Fonts are already wired via `next/font` in `app/layout.tsx`
(Montserrat, Inter, JetBrains Mono — plus Roboto / Open Sans available for per-section font
overrides). Reference print fidelity against `docs/screenshots/` (cover-contents, side-callouts,
callouts-below, image-border).

## Files
- `DESIGN.md` (in this bundle) — **canonical design system**: tokens (OKLCH + hex), type, components,
  interaction patterns. Drop in at `guidebook-editor/DESIGN.md`.
- `Guided Design.dc.html` (in this bundle) — the high-fidelity design reference. Open in a browser;
  the annotation section is interactive.

### Files to touch in the codebase
- `app/globals.css` — `@theme` tokens (cool neutrals + paired annotation palette); cool the `app-bg`.
- `app/landing.css`, `app/page.tsx`, `components/landing/LandingActions.tsx` — landing redesign.
- `components/editor/EditorApp.tsx` — add the full-width **TopBar**; restructure to a column.
- `components/editor/editor.css` — section headers, chapter/step list, row card, annotation palette/inspector, toolbar, resizer.
- `components/editor/PreviewPane.tsx` — move project actions to the top bar; keep page nav + grid toggle in the right-pane toolbar.
- `components/editor/AnnotationEditor.tsx` — rebuild as paired palette + inspector (signature element).
- `components/editor/LeftPane.tsx` + section components — collapsible sections, active-step styling.
- `components/renderer/renderer.css` — retune cover/step/callout to tokens; keep mm geometry pixel-accurate.
- `app/quickstart|terms|privacy` + `.prose` — retune to cool tokens.
