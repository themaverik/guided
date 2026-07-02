import { describe, expect, it } from "vitest";
import { shouldHandleDeleteKey } from "@/lib/keyboard";

describe("shouldHandleDeleteKey", () => {
  it("handles Delete/Backspace with a selection and non-editable focus", () => {
    expect(shouldHandleDeleteKey("Delete", null, true)).toBe(true);
    expect(shouldHandleDeleteKey("Backspace", { tagName: "DIV" }, true)).toBe(true);
  });
  it("ignores other keys", () => {
    expect(shouldHandleDeleteKey("a", null, true)).toBe(false);
    expect(shouldHandleDeleteKey("Enter", null, true)).toBe(false);
  });
  it("ignores when nothing is selected", () => {
    expect(shouldHandleDeleteKey("Delete", null, false)).toBe(false);
  });
  it("ignores when focus is in an input/textarea/select", () => {
    expect(shouldHandleDeleteKey("Delete", { tagName: "INPUT" }, true)).toBe(false);
    expect(shouldHandleDeleteKey("Backspace", { tagName: "TEXTAREA" }, true)).toBe(false);
    expect(shouldHandleDeleteKey("Delete", { tagName: "SELECT" }, true)).toBe(false);
  });
  it("ignores when focus is contenteditable (inline text editor)", () => {
    expect(shouldHandleDeleteKey("Backspace", { isContentEditable: true }, true)).toBe(false);
  });
});
