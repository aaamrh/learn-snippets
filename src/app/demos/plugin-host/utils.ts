/**
 * 编辑器辅助工具函数
 */

/**
 * 对编辑器选区应用 wrapper（加粗 / 斜体）
 *
 * - 有选中文字时：toggle 包裹/移除 wrapper
 * - 无选中文字时：插入占位符并选中
 *
 * @param el       contentEditable 元素
 * @param action   "bold" → **  |  "italic" → *
 */
export function applyTextWrap(el: HTMLElement, action: "bold" | "italic"): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;

  const wrapper = action === "bold" ? "**" : "*";
  const selectedText = selection.toString();

  if (!selectedText) {
    // 没有选中文字 → 插入占位符
    const placeholder = action === "bold" ? "粗体文字" : "斜体文字";
    const insertText = `${wrapper}${placeholder}${wrapper}`;
    range.deleteContents();
    const textNode = document.createTextNode(insertText);
    range.insertNode(textNode);
    // 选中占位文字（不含 wrapper）
    const newRange = document.createRange();
    newRange.setStart(textNode, wrapper.length);
    newRange.setEnd(textNode, wrapper.length + placeholder.length);
    selection.removeAllRanges();
    selection.addRange(newRange);
  } else {
    // 有选中文字 → toggle 包裹/移除
    const alreadyWrapped =
      selectedText.startsWith(wrapper) &&
      selectedText.endsWith(wrapper) &&
      selectedText.length > wrapper.length * 2;
    const newText = alreadyWrapped
      ? selectedText.slice(wrapper.length, -wrapper.length)
      : `${wrapper}${selectedText}${wrapper}`;
    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);
    const newRange = document.createRange();
    newRange.selectNodeContents(textNode);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }

  // 触发 input 事件同步内容
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
