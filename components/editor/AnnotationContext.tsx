"use client";

/*
 * Context-aware annotation detail controls (bottom-palette context row). Given
 * the selected shape, renders its full editable properties: freeform color +
 * width for every shape, plus connector routing/waypoints/endpoints, text
 * font/size/align/color, and bracket orientation/flip. Position and size are
 * edited by dragging on the canvas — there are no numeric coordinate fields
 * here. Editor-only; writes via updateAnnotation.
 */
import type {
  Annotation,
  Connector,
  Endpoint,
  EndpointSize,
  EndpointStyle,
  Surface,
  TextFont,
} from "@/lib/book-schema";
import { DEFAULT_TEXT_SIZE } from "@/lib/book-schema";
import { resolveEndpoint } from "@/lib/annotations";
import { fillForStroke } from "@/lib/annotation-palette";
import { useEditor } from "@/lib/store";
import {
  ENDPOINT_STYLES,
  ROUTINGS,
  DIRECTION_OPTIONS,
  SIZES,
  FONTS,
  FONT_LABELS,
  ALIGNS,
} from "@/lib/annotation-options";

function EndpointFields({
  c,
  which,
  ci,
  si,
  updateAnnotation,
}: {
  c: Connector;
  which: "from" | "to";
  ci: number;
  si: number;
  updateAnnotation: (
    ci: number,
    si: number,
    id: string,
    patch: Partial<Surface> & Partial<Connector>,
  ) => void;
}) {
  const ep = c[which];
  const set = (patch: Partial<Endpoint>) =>
    updateAnnotation(ci, si, c.id, { [which]: { ...ep, ...patch } });
  // Binding (ref/anchor) is done by dragging the endpoint onto a shape on the
  // canvas (snapPoint); the panel only carries the discrete style/size/dir.
  return (
    <div className="anno-endpoint">
      <span className="anno-eplabel">{which}</span>
      <select
        value={ep.style}
        aria-label={`${which} style`}
        onChange={(e) => set({ style: e.target.value as EndpointStyle })}
      >
        {ENDPOINT_STYLES.map((st) => (
          <option key={st} value={st}>
            {st}
          </option>
        ))}
      </select>
      {ep.style !== "none" ? (
        <select
          value={ep.size ?? "medium"}
          aria-label={`${which} size`}
          onChange={(e) => set({ size: e.target.value as EndpointSize })}
        >
          {SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {sz}
            </option>
          ))}
        </select>
      ) : null}
      {c.routing === "square" ? (
        <select
          value={ep.dir ?? ""}
          aria-label={`${which} direction`}
          title="Direction the connector runs at this end"
          onChange={(e) =>
            set({ dir: (e.target.value || undefined) as Endpoint["dir"] })
          }
        >
          {DIRECTION_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

export default function AnnotationContext({
  ci,
  si,
  shape,
  annotations,
}: {
  ci: number;
  si: number;
  shape: Annotation;
  annotations: Annotation[];
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);

  const setWaypointCount = (c: Connector, n: number) => {
    const count = Math.max(0, Math.min(6, n));
    const cur = c.waypoints ?? [];
    let wps: { x: number; y: number }[];
    if (count <= cur.length) {
      wps = cur.slice(0, count);
    } else {
      wps = [...cur];
      const a = resolveEndpoint(annotations, c.from);
      const b = resolveEndpoint(annotations, c.to);
      while (wps.length < count) {
        const prev = wps.length ? wps[wps.length - 1] : a;
        wps.push({ x: (prev.x + b.x) / 2, y: (prev.y + b.y) / 2 });
      }
    }
    updateAnnotation(ci, si, c.id, { waypoints: wps.length ? wps : undefined });
  };

  const c: Connector | null = shape.kind === "connector" ? (shape as Connector) : null;

  return (
    <div className="anno-context">
      <div className="anno-context-row">
        <input
          type="color"
          value={shape.stroke}
          onChange={(e) => {
            const stroke = e.target.value;
            updateAnnotation(
              ci,
              si,
              shape.id,
              shape.kind !== "connector" && shape.kind !== "text" && shape.fill != null
                ? { stroke, fill: fillForStroke(stroke) }
                : { stroke },
            );
          }}
          title="Custom color"
          aria-label="Custom color"
        />
        <input
          className="anno-w"
          type="number"
          min={1}
          max={12}
          value={shape.width}
          onChange={(e) =>
            updateAnnotation(ci, si, shape.id, { width: Number(e.target.value) || 1 })
          }
          title="Custom width"
          aria-label="Custom width"
        />
        {shape.kind === "box" || shape.kind === "diamond" || shape.kind === "ellipse" ? (
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.fill != null}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, {
                  fill: e.target.checked ? fillForStroke(shape.stroke) : undefined,
                })
              }
            />
            Fill
          </label>
        ) : null}
      </div>

      {c ? (
        <div className="anno-context-row">
          <select
            value={c.routing ?? "straight"}
            aria-label="Routing"
            onChange={(e) =>
              updateAnnotation(ci, si, c.id, {
                routing: e.target.value as Connector["routing"],
              })
            }
          >
            {ROUTINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="stepper" title="Waypoints (drag on canvas)">
            <button type="button" onClick={() => setWaypointCount(c, (c.waypoints?.length ?? 0) - 1)}>
              −
            </button>
            <span>{c.waypoints?.length ?? 0}</span>
            <button type="button" onClick={() => setWaypointCount(c, (c.waypoints?.length ?? 0) + 1)}>
              +
            </button>
          </div>
          <EndpointFields c={c} which="from" ci={ci} si={si} updateAnnotation={updateAnnotation} />
          <EndpointFields c={c} which="to" ci={ci} si={si} updateAnnotation={updateAnnotation} />
        </div>
      ) : null}

      {shape.kind === "text" || (shape.kind !== "connector" && shape.text != null) ? (
        <div className="anno-context-row anno-text-ctrls">
          {(() => {
            const surf = shape as Surface;
            return (
              <>
                <label className="anno-num">
                  size
                  <input
                    type="number"
                    min={6}
                    max={120}
                    value={surf.fontSize ?? DEFAULT_TEXT_SIZE}
                    onChange={(e) =>
                      updateAnnotation(ci, si, surf.id, {
                        fontSize: Math.max(6, Number(e.target.value) || DEFAULT_TEXT_SIZE),
                      })
                    }
                  />
                </label>
                <select
                  value={surf.fontFamily ?? "sans"}
                  aria-label="Font"
                  onChange={(e) =>
                    updateAnnotation(ci, si, surf.id, { fontFamily: e.target.value as TextFont })
                  }
                >
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_LABELS[f]}
                    </option>
                  ))}
                </select>
                <select
                  value={surf.align ?? "left"}
                  aria-label="Align"
                  onChange={(e) =>
                    updateAnnotation(ci, si, surf.id, { align: e.target.value as Surface["align"] })
                  }
                >
                  {ALIGNS.map((al) => (
                    <option key={al} value={al}>
                      {al}
                    </option>
                  ))}
                </select>
                <input
                  type="color"
                  value={surf.color ?? surf.stroke}
                  onChange={(e) => updateAnnotation(ci, si, surf.id, { color: e.target.value })}
                  title="Text color"
                  aria-label="Text color"
                />
              </>
            );
          })()}
        </div>
      ) : null}

      {shape.kind === "text" ? (
        <div className="anno-context-row">
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={(shape.width ?? 0) > 0}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, { width: e.target.checked ? 2 : 0 })
              }
            />
            Border
          </label>
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.fill != null}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, {
                  fill: e.target.checked ? "#ffffff" : undefined,
                })
              }
            />
            Fill
          </label>
          {shape.fill != null ? (
            <input
              type="color"
              value={shape.fill}
              onChange={(e) => updateAnnotation(ci, si, shape.id, { fill: e.target.value })}
              title="Fill (background) color"
              aria-label="Fill color"
            />
          ) : null}
        </div>
      ) : null}

      {shape.kind === "bracket" ? (
        <div className="anno-context-row">
          <select
            value={shape.orientation ?? "horizontal"}
            aria-label="Orientation"
            onChange={(e) =>
              updateAnnotation(ci, si, shape.id, {
                orientation: e.target.value as Surface["orientation"],
              })
            }
          >
            <option value="horizontal">horizontal</option>
            <option value="vertical">vertical</option>
          </select>
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.flip ?? false}
              onChange={(e) => updateAnnotation(ci, si, shape.id, { flip: e.target.checked })}
            />
            Invert
          </label>
        </div>
      ) : null}
    </div>
  );
}
