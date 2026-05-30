# ADR-002: Styling Primitive Schema Extensions

- Status: Accepted
- Date: 2026-05-30
- Deciders: Lamtei
- Relates to: ADR-001 (config-driven model). Extends the `Book` schema; does not change the architecture.

## Context and Problem Statement

The v2 plan's Theme A (ROADMAP "Phase 8") adds four styling capabilities: configurable image
borders, an expanded callout type set with icons, per-section font overrides, and a page
background image. Each touches the `Book` data model. The repo requires an ADR before a schema
change, and the overriding constraint is that **existing configs must keep rendering unchanged** —
the model is the hand-editable source of truth, so additions must be backward-compatible.

## Decision

Extend the schema additively, with each new field optional and every existing shape still valid.

### 1. Border (`#1`)

Widen the row/step `border` field from `boolean` to `boolean | BorderStyle`:

```ts
interface BorderStyle { color?: string; width?: string; radius?: string }
type Border = boolean | BorderStyle;
```

Resolution: `undefined`/`true` → default frame (6px solid `#d7dede`, radius 6px); `false` → no
frame; object → framed with the provided overrides (each falling back to the default). A
`resolveBorder()` helper centralizes this. Existing `true`/`false` values are unaffected.

### 2. Callout types + icons (`#2`)

Expand `CalloutType` to `info | note | success | warning | danger`, with `warn` retained as a
**deprecated alias** normalized to `warning` (so the existing seed and the prototype's `warn`
callouts render identically — `warning` reuses the old amber palette). Each type carries a leading
icon rendered in the callout title. New palette tokens are added for `success` (green) and
`danger` (red). A `normalizeCalloutType()` helper maps `warn → warning`.

### 3. Per-section fonts (`#5`)

Add an optional `book.theme` with per-section font overrides:

```ts
interface SectionFont { family?: string; size?: string; color?: string }
interface Theme { cover?, chapter?, step?, row?, callout?: SectionFont }
```

Applied as CSS custom properties on the `.book` root; renderer selectors read them with
`var(--th-…, <existing default>)`, so defaults stay pixel-accurate when no theme is set. Font
`family` is constrained to the three already-loaded families (Montserrat, Inter, JetBrains Mono)
because arbitrary families would require loading new web fonts; `size` and `color` are free.

### 4. Background image (`#11`)

Add an optional `book.background`:

```ts
interface Background { image?: string; opacity?: number }
```

Rendered as a full-page layer behind content on every page. Z-order is fixed: page background
color → background image → watermark → content (`page-inner` at `z-index: 1`). The image is
uploaded through the existing asset upload path.

## Update (2026-05-30): font family is a CSS string

The initial decision limited `SectionFont.family` to the three loaded font roles. To support a
broader palette (Roboto, Open Sans, Arial, Helvetica, Courier, Hack, generic sans-serif), `family`
is now a free **CSS font-family string**. next/font-loaded families are referenced via their CSS
variable (e.g. `var(--font-roboto)`); system fonts use a literal stack (e.g. `Arial, sans-serif`).
Roboto and Open Sans are loaded via `next/font`; Hack is offered as a stack that falls back to
monospace unless installed locally (it is not a Google/system font). The editor presents a preset
dropdown, but any valid CSS font-family value can be hand-edited. This keeps the field a simple
string (no structural change) while removing the loaded-font restriction.

## Consequences

- Fully backward-compatible: omitting every new field reproduces today's output exactly; the
  `warn → warning` alias keeps existing callouts identical.
- The data model stays compact and hand-editable — new fields are simple scalars/objects, no
  nested document trees (consistent with the rich-text decision to store markdown strings).
- Theme `family` is deliberately limited to loaded fonts; lifting that needs a font-loading
  mechanism, deferred.
- Background image + watermark now share the overlay stack; their z-order is specified above to
  avoid ambiguity.

## References

- ROADMAP "v2 — Feature expansion", Phase 8.
- Items #1, #2, #5, #11 from the feature request.
