/** A minimal view of the focused element — enough to decide whether a keystroke
 *  is "inside a text field" without depending on the DOM, so it stays unit-testable.
 *  `document.activeElement` (an `Element`) satisfies this shape at the call site. */
export type EditableLike = { tagName?: string; isContentEditable?: boolean };

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when Delete/Backspace should trigger annotation removal: an annotation is
 *  selected, the key is Delete or Backspace, and focus is NOT in a text field or
 *  contenteditable (so editing text is never hijacked). Pure. */
export function shouldHandleDeleteKey(
  key: string,
  active: EditableLike | null,
  hasSelection: boolean,
): boolean {
  if (!hasSelection) return false;
  if (key !== "Delete" && key !== "Backspace") return false;
  if (active?.isContentEditable) return false;
  if (active?.tagName && EDITABLE_TAGS.has(active.tagName)) return false;
  return true;
}
