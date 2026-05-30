"use client";

/* Callout controls for one row: enable, count, placement, columns, per-item edit. */
import type { Callout, CalloutCols, CalloutLayout } from "@/lib/book-schema";
import { normalizeCalloutType } from "@/lib/book-schema";
import { CALLOUT_TYPES } from "@/lib/book-mutations";
import { useEditor } from "@/lib/store";
import RichTextArea from "./RichTextArea";

export default function CalloutEditor({
  ci,
  si,
  ri,
  callouts,
  calloutLayout,
  calloutCols,
}: {
  ci: number;
  si: number;
  ri: number;
  callouts: Callout[];
  calloutLayout: CalloutLayout;
  calloutCols: CalloutCols;
}) {
  const setCalloutCount = useEditor((s) => s.setCalloutCount);
  const updateCallout = useEditor((s) => s.updateCallout);
  const removeCallout = useEditor((s) => s.removeCallout);
  const moveCallout = useEditor((s) => s.moveCallout);
  const updateRow = useEditor((s) => s.updateRow);

  const count = callouts.length;

  if (count === 0) {
    return (
      <button
        className="add-btn"
        onClick={() => setCalloutCount(ci, si, ri, 1)}
      >
        + Add callouts
      </button>
    );
  }

  return (
    <div className="callout-editor">
      <div className="ctrl-row">
        <span className="ctrl-label">Callouts</span>
        <div className="stepper">
          <button
            onClick={() => setCalloutCount(ci, si, ri, count - 1)}
            aria-label="Fewer callouts"
          >
            −
          </button>
          <span>{count}</span>
          <button
            onClick={() => setCalloutCount(ci, si, ri, count + 1)}
            aria-label="More callouts"
          >
            +
          </button>
        </div>
      </div>

      <div className="ctrl-row">
        <span className="ctrl-label">Placement</span>
        <div className="seg">
          {(["side", "below"] as CalloutLayout[]).map((m) => (
            <button
              key={m}
              className={`seg-btn${calloutLayout === m ? " active" : ""}`}
              onClick={() => updateRow(ci, si, ri, { calloutLayout: m })}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {calloutLayout === "below" ? (
        <div className="ctrl-row">
          <span className="ctrl-label">Columns</span>
          <div className="seg">
            {([1, 2, 3] as CalloutCols[]).map((c) => (
              <button
                key={c}
                className={`seg-btn${calloutCols === c ? " active" : ""}`}
                onClick={() => updateRow(ci, si, ri, { calloutCols: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="callout-list">
        {callouts.map((c, k) => (
          <div className="callout-item" key={k}>
            <div className="callout-item-head">
              <select
                value={normalizeCalloutType(c.type)}
                onChange={(e) =>
                  updateCallout(ci, si, ri, k, {
                    type: e.target.value as Callout["type"],
                  })
                }
              >
                {CALLOUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="mini-btns">
                <button
                  className="mini-btn"
                  onClick={() => moveCallout(ci, si, ri, k, -1)}
                  disabled={k === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="mini-btn"
                  onClick={() => moveCallout(ci, si, ri, k, 1)}
                  disabled={k === count - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="mini-btn danger"
                  onClick={() => removeCallout(ci, si, ri, k)}
                  aria-label="Remove callout"
                >
                  ×
                </button>
              </div>
            </div>
            <input
              placeholder="Title"
              value={c.title ?? ""}
              onChange={(e) =>
                updateCallout(ci, si, ri, k, { title: e.target.value })
              }
            />
            <RichTextArea
              rows={2}
              placeholder="Body"
              value={c.body ?? ""}
              onChange={(v) => updateCallout(ci, si, ri, k, { body: v })}
            />
            <div className="ctrl-row">
              <span className="ctrl-label">Placement</span>
              <select
                value={c.placement ?? ""}
                onChange={(e) =>
                  updateCallout(ci, si, ri, k, {
                    placement: (e.target.value || undefined) as
                      | CalloutLayout
                      | undefined,
                  })
                }
              >
                <option value="">Row default ({calloutLayout})</option>
                <option value="side">side</option>
                <option value="below">below</option>
              </select>
            </div>

            {(c.placement ?? calloutLayout) === "below" ? (
              <div className="ctrl-row">
                <span className="ctrl-label">Column span</span>
                <select
                  value={c.span ?? 1}
                  onChange={(e) =>
                    updateCallout(ci, si, ri, k, {
                      span: Number(e.target.value) as CalloutCols,
                    })
                  }
                >
                  {Array.from({ length: calloutCols }, (_, n) => n + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n} / {calloutCols}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ) : (
              <div className="ctrl-row">
                <span className="ctrl-label">Width %</span>
                <input
                  className="theme-size"
                  type="number"
                  min={10}
                  max={100}
                  placeholder="100"
                  value={c.widthPct ?? ""}
                  onChange={(e) =>
                    updateCallout(ci, si, ri, k, {
                      widthPct: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
