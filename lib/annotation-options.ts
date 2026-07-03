/*
 * Shared option lists for annotation endpoint style / connector routing /
 * direction / size / anchor / font / align, used by both the left-panel
 * AnnotationEditor and the on-canvas selection popover so the option sets
 * cannot drift. Editor-only.
 */
import type {
  EndpointStyle,
  Connector,
  Endpoint,
  EndpointSize,
  Anchor,
  TextFont,
  Surface,
} from "@/lib/book-schema";

export const ENDPOINT_STYLES: EndpointStyle[] = [
  "none",
  "arrow",
  "circle",
  "diamond",
  "point",
  "bar",
];

export type Routing = NonNullable<Connector["routing"]>;
export const ROUTINGS: { value: Routing; label: string }[] = [
  { value: "straight", label: "straight" },
  { value: "square", label: "rectangular" },
];

export type DirValue = "" | NonNullable<Endpoint["dir"]>;
export const DIRECTION_OPTIONS: { value: DirValue; label: string }[] = [
  { value: "", label: "auto dir" },
  { value: "left", label: "← left" },
  { value: "right", label: "→ right" },
  { value: "up", label: "↑ up" },
  { value: "down", label: "↓ down" },
];

export const SIZES: EndpointSize[] = ["small", "medium", "large"];

export const ANCHORS: Anchor[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "start",
  "end",
  "mid",
];

export const FONTS: TextFont[] = [
  "sans",
  "serif",
  "mono",
  "open-sans",
  "montserrat",
  "roboto",
];
export const FONT_LABELS: Record<TextFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
  "open-sans": "Open Sans",
  montserrat: "Montserrat",
  roboto: "Roboto",
};

export const ALIGNS: NonNullable<Surface["align"]>[] = ["left", "center", "right"];
