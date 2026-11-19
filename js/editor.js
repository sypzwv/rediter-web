import { formatNovelText } from "./chapters.js";

export function formatEditor(textarea) {
  textarea.value = formatNovelText(textarea.value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

export function insertPunctuation(textarea, value) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  let insertion = value;
  let caretOffset = value.length;
  if (value === "“”") {
    const selection = textarea.value.slice(start, end);
    insertion = `“${selection}”`;
    caretOffset = selection ? insertion.length : 1;
  }
  textarea.setRangeText(insertion, start, end, "end");
  const caret = start + caretOffset;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}
