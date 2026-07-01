"use client";

/*
 * Page-level annotation property editor (ADR-004). Add surfaces (box / line /
 * bracket) and connectors, and edit geometry, color, width, endpoint style /
 * size / binding. Coordinates are normalized to the whole page (0–100%).
 * Direct-manipulation drag/snap happens on the main preview.
 */
import type {
  Annotation,
  Anchor,
  Connector,
  Endpoint,
  EndpointSize,
  EndpointStyle,
  Surface,
  TextFont,
} from "@/lib/book-schema";
import { newConnector, newSurface } from "@/lib/book-mutations";
import { resolveEndpoint } from "@/lib/annotations";
import { useEditor } from "@/lib/store";

const STYLES: EndpointStyle[] = [
  "none",
  "arrow",
  "circle",
  "diamond",
  "point",
  "bar",
];
const FONTS: TextFont[] = [
  "sans",
  "serif",
  "mono",
  "open-sans",
  "montserrat",
  "roboto",
];
const FONT_LABELS: Record<TextFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
  "open-sans": "Open Sans",
  montserrat: "Montserrat",
  roboto: "Roboto",
};
const ALIGNS: NonNullable<Surface["align"]>[] = ["left", "center", "right"];
const SIZES: EndpointSize[] = ["small", "medium", "large"];
const ANCHORS: Anchor[] = [
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

const toPct = (n: number) => Math.round((n ?? 0) * 100);
const fromPct = (s: string) => Math.max(0, Math.min(100, Number(s) || 0)) / 100;

export default function AnnotationEditor({
  ci,
  si,
  annotations,
}: {
  ci: number;
  si: number;
  annotations: Annotation[];
}) {
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);

  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );

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
    updateAnnotation(ci, si, c.id, {
      waypoints: wps.length ? wps : undefined,
    });
  };

  const Num = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <label className="anno-num">
      {label}
      <input
        type="number"
        min={0}
        max={100}
        value={toPct(value)}
        onChange={(e) => onChange(fromPct(e.target.value))}
      />
    </label>
  );

  const EndpointFields = ({
    c,
    which,
  }: {
    c: Connector;
    which: "from" | "to";
  }) => {
    const ep = c[which];
    const set = (patch: Partial<Endpoint>) =>
      updateAnnotation(ci, si, c.id, { [which]: { ...ep, ...patch } });
    return (
      <div className="anno-endpoint">
        <span className="anno-eplabel">{which}</span>
        <select
          value={ep.ref ?? ""}
          onChange={(e) => set({ ref: e.target.value || undefined })}
        >
          <option value="">free point</option>
          {surfaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind} {s.id}
            </option>
          ))}
        </select>
        {ep.ref ? (
          <select
            value={ep.anchor ?? "center"}
            onChange={(e) => set({ anchor: e.target.value as Anchor })}
          >
            {ANCHORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          <>
            <Num label="x" value={ep.x ?? 0.5} onChange={(v) => set({ x: v })} />
            <Num label="y" value={ep.y ?? 0.5} onChange={(v) => set({ y: v })} />
          </>
        )}
        <select
          value={ep.style}
          onChange={(e) => set({ style: e.target.value as EndpointStyle })}
        >
          {STYLES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        {ep.style !== "none" ? (
          <select
            value={ep.size ?? "medium"}
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
            onChange={(e) =>
              set({ dir: (e.target.value || undefined) as Endpoint["dir"] })
            }
            title="Direction the connector runs at this end (arrow direction for the To end)"
          >
            <option value="">auto dir</option>
            <option value="left">← left</option>
            <option value="right">→ right</option>
            <option value="up">↑ up</option>
            <option value="down">↓ down</option>
          </select>
        ) : null}
      </div>
    );
  };

  return (
    <div className="anno-editor">
      <p className="anno-hint">
        Drag shapes and connector ends on the preview. Snap a connector end to a
        box/line/bracket to anchor it.
      </p>
      <div className="anno-toolbar">
        <button onClick={() => addAnnotation(ci, si, newSurface("box"))}>
          + Box
        </button>
        <button onClick={() => addAnnotation(ci, si, newSurface("line"))}>
          + Line
        </button>
        <button onClick={() => addAnnotation(ci, si, newSurface("bracket"))}>
          + Bracket
        </button>
        <button onClick={() => addAnnotation(ci, si, newSurface("diamond"))}>
          + Diamond
        </button>
        <button onClick={() => addAnnotation(ci, si, newSurface("text"))}>
          + Text
        </button>
        <button onClick={() => addAnnotation(ci, si, newConnector())}>
          + Connector
        </button>
      </div>

      {annotations.map((a) => (
        <div
          className={`anno-item${selectedAnnotation === a.id ? " selected" : ""}`}
          key={a.id}
          onPointerDown={() => selectAnnotation(a.id)}
        >
          <div className="anno-item-head">
            <span className="anno-kind">{a.kind}</span>
            <input
              type="color"
              value={a.stroke}
              onChange={(e) =>
                updateAnnotation(ci, si, a.id, { stroke: e.target.value })
              }
              title="Stroke"
            />
            <input
              className="anno-w"
              type="number"
              min={1}
              max={12}
              value={a.width}
              onChange={(e) =>
                updateAnnotation(ci, si, a.id, {
                  width: Number(e.target.value) || 1,
                })
              }
              title="Width"
            />
            <button
              className="mini-btn danger"
              onClick={() => removeAnnotation(ci, si, a.id)}
              aria-label="Remove annotation"
            >
              ×
            </button>
          </div>

          {a.kind !== "connector" ? (
            <>
              <div className="anno-coords">
                <Num
                  label="x"
                  value={a.x}
                  onChange={(v) => updateAnnotation(ci, si, a.id, { x: v })}
                />
                <Num
                  label="y"
                  value={a.y}
                  onChange={(v) => updateAnnotation(ci, si, a.id, { y: v })}
                />
                <Num
                  label="w"
                  value={a.w}
                  onChange={(v) => updateAnnotation(ci, si, a.id, { w: v })}
                />
                <Num
                  label="h"
                  value={a.h}
                  onChange={(v) => updateAnnotation(ci, si, a.id, { h: v })}
                />
              </div>
              {a.kind === "bracket" ? (
                <div className="anno-endpoint">
                  <select
                    value={a.orientation ?? "horizontal"}
                    onChange={(e) =>
                      updateAnnotation(ci, si, a.id, {
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
                      checked={a.flip ?? false}
                      onChange={(e) =>
                        updateAnnotation(ci, si, a.id, { flip: e.target.checked })
                      }
                    />
                    Invert
                  </label>
                </div>
              ) : null}
              {a.kind === "text" ? (
                <div className="anno-text-ctrls">
                  <label className="anno-num">
                    size
                    <input
                      type="number"
                      min={6}
                      max={120}
                      value={a.fontSize ?? 16}
                      onChange={(e) =>
                        updateAnnotation(ci, si, a.id, {
                          fontSize: Math.max(6, Number(e.target.value) || 16),
                        })
                      }
                    />
                  </label>
                  <select
                    value={a.fontFamily ?? "sans"}
                    onChange={(e) =>
                      updateAnnotation(ci, si, a.id, {
                        fontFamily: e.target.value as TextFont,
                      })
                    }
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f}>
                        {FONT_LABELS[f]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={a.align ?? "left"}
                    onChange={(e) =>
                      updateAnnotation(ci, si, a.id, {
                        align: e.target.value as Surface["align"],
                      })
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
                    value={a.color ?? a.stroke}
                    onChange={(e) =>
                      updateAnnotation(ci, si, a.id, { color: e.target.value })
                    }
                    title="Text color"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="ctrl-row">
                <span className="ctrl-label">Path</span>
                <select
                  value={a.routing ?? "straight"}
                  onChange={(e) =>
                    updateAnnotation(ci, si, a.id, {
                      routing: e.target.value as Connector["routing"],
                    })
                  }
                >
                  <option value="straight">straight</option>
                  <option value="square">rectangular</option>
                </select>
              </div>
              <div className="ctrl-row">
                <span className="ctrl-label">Points (drag on preview)</span>
                <div className="stepper">
                  <button
                    onClick={() =>
                      setWaypointCount(a, (a.waypoints?.length ?? 0) - 1)
                    }
                  >
                    −
                  </button>
                  <span>{a.waypoints?.length ?? 0}</span>
                  <button
                    onClick={() =>
                      setWaypointCount(a, (a.waypoints?.length ?? 0) + 1)
                    }
                  >
                    +
                  </button>
                </div>
              </div>
              <EndpointFields c={a} which="from" />
              <EndpointFields c={a} which="to" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
