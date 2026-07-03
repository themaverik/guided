/*
 * Shared option lists for annotation endpoint style / connector routing /
 * direction, used by both the left-panel AnnotationEditor and the on-canvas
 * selection popover so the option sets cannot drift. Editor-only.
 */
import type { EndpointStyle, Connector, Endpoint } from "@/lib/book-schema";

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
