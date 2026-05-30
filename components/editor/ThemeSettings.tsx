"use client";

/*
 * Per-section font overrides (family/size/color). Family is limited to the
 * three loaded fonts; empty values fall back to the pixel-accurate defaults.
 */
import type { SectionFont, ThemeSection } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const SECTIONS: { key: ThemeSection; label: string }[] = [
  { key: "cover", label: "Cover title" },
  { key: "chapter", label: "Chapter title" },
  { key: "step", label: "Step title" },
  { key: "row", label: "Row title" },
  { key: "callout", label: "Callouts" },
];

// label → CSS font-family value. next/font families use their CSS variable;
// system fonts use a literal stack. Hack is not bundled — it falls back to
// monospace unless the user has it installed.
const FAMILIES: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "var(--font-montserrat)", label: "Montserrat" },
  { value: "var(--font-inter)", label: "Inter" },
  { value: "var(--font-jetbrains-mono)", label: "JetBrains Mono" },
  { value: "var(--font-roboto)", label: "Roboto" },
  { value: "var(--font-open-sans)", label: "Open Sans" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: "Helvetica" },
  { value: '"Courier New", Courier, monospace', label: "Courier" },
  { value: '"Hack", monospace', label: "Hack" },
  { value: "sans-serif", label: "Sans-serif" },
];

export default function ThemeSettings() {
  const theme = useEditor((s) => s.book.theme);
  const updateTheme = useEditor((s) => s.updateTheme);

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Fonts</h2>
      {SECTIONS.map(({ key, label }) => {
        const font: SectionFont = theme?.[key] ?? {};
        return (
          <div className="theme-row" key={key}>
            <span className="theme-row-label">{label}</span>
            <div className="theme-row-controls">
              <select
                value={font.family ?? ""}
                onChange={(e) =>
                  updateTheme(key, {
                    family: (e.target.value || undefined) as
                      | SectionFont["family"]
                      | undefined,
                  })
                }
              >
                {FAMILIES.map((f) => (
                  <option key={f.label} value={f.value ?? ""}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                className="theme-size"
                placeholder="size"
                value={font.size ?? ""}
                onChange={(e) => updateTheme(key, { size: e.target.value })}
              />
              <input
                className="theme-color"
                type="color"
                value={font.color ?? "#024450"}
                onChange={(e) => updateTheme(key, { color: e.target.value })}
                title="Color"
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
