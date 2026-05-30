/* Leading glyph per callout type. Inherits the title color via currentColor. */
type Kind = "info" | "note" | "success" | "warning" | "danger";

export default function CalloutIcon({ type }: { type: Kind }) {
  return (
    <span className="callout-icon" aria-hidden="true">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[type]}
      </svg>
    </span>
  );
}

const PATHS: Record<Kind, React.ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  note: (
    <>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M15 4v4h4" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </>
  ),
};
