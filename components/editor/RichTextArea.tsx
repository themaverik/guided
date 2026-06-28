"use client";

/*
 * A textarea with a minimal markdown toolbar (bold, italic, bullet, number).
 * Stores plain markdown-subset strings (see lib/markdown). Toolbar actions
 * transform the current selection and restore it after the controlled update.
 */
import { useLayoutEffect, useRef } from "react";

type Transform = (
  value: string,
  start: number,
  end: number,
) => { value: string; start: number; end: number };

function wrap(marker: string): Transform {
  return (value, s, e) => {
    const inner = value.slice(s, e);
    const next = value.slice(0, s) + marker + inner + marker + value.slice(e);
    return { value: next, start: s + marker.length, end: e + marker.length };
  };
}

function prefixLines(makePrefix: (n: number) => string): Transform {
  return (value, s, e) => {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const nl = value.indexOf("\n", e);
    const lineEnd = nl === -1 ? value.length : nl;
    const block = value.slice(lineStart, lineEnd);
    let n = 1;
    const out = block
      .split("\n")
      .map((l) => (l.trim() === "" ? l : makePrefix(n++) + l))
      .join("\n");
    const next = value.slice(0, lineStart) + out + value.slice(lineEnd);
    return { value: next, start: lineStart, end: lineStart + out.length };
  };
}

export default function RichTextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
  showHeadings = false,
  showStrike = false,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  showHeadings?: boolean;
  showStrike?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    if (pendingSel.current && ref.current) {
      ref.current.focus();
      ref.current.selectionStart = pendingSel.current[0];
      ref.current.selectionEnd = pendingSel.current[1];
      pendingSel.current = null;
    }
  });

  const apply = (t: Transform) => {
    const ta = ref.current;
    if (!ta) return;
    const { value: next, start, end } = t(value, ta.selectionStart, ta.selectionEnd);
    pendingSel.current = [start, end];
    onChange(next);
  };

  return (
    <div className="rta">
      <div className="rta-toolbar">
        <button type="button" onClick={() => apply(wrap("**"))} title="Bold">
          <b>B</b>
        </button>
        <button type="button" onClick={() => apply(wrap("*"))} title="Italic">
          <i>I</i>
        </button>
        {showStrike ? (
          <button type="button" onClick={() => apply(wrap("~~"))} title="Strikethrough">
            <s>S</s>
          </button>
        ) : null}
        {showHeadings ? (
          <>
            <button type="button" onClick={() => apply(prefixLines(() => "## "))} title="Heading">
              H2
            </button>
            <button type="button" onClick={() => apply(prefixLines(() => "### "))} title="Subheading">
              H3
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => apply(prefixLines(() => "- "))}
          title="Bullet list"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => apply(prefixLines((n) => `${n}. `))}
          title="Numbered list"
        >
          1.
        </button>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
