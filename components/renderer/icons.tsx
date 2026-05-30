/** Inline SVGs ported from the prototype (photo placeholder + double-row arrow). */

export function PhotoIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
    </svg>
  );
}

export function ArrowGlyph() {
  return (
    <div className="step-arrow" aria-hidden="true">
      <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2 10 H34 M28 4 L34 10 L28 16"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
