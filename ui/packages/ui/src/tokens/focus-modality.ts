/**
 * 焦点框模态（HarmonyOS 焦点导航：平板/电脑按 Tab 才激活焦点框，方向键不激活）。
 * 指针（鼠标/触摸）结束获焦态。属性写在 <html>，CSS 只认 data-yohu-focus=keyboard。
 */

export const YOHU_FOCUS_ATTR = "data-yohu-focus";
export const YOHU_FOCUS_KEYBOARD = "keyboard";

function isFocusActivationKey(key: string): boolean {
  return key === "Tab";
}

let detach: (() => void) | null = null;

/** 在 document 上监听 Tab / 指针。重复调用会先卸旧监听。返回卸绑。 */
export function bindFocusModality(doc: Document = document): () => void {
  detach?.();
  const root = doc.documentElement;
  const onPointer = (): void => {
    root.removeAttribute(YOHU_FOCUS_ATTR);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!isFocusActivationKey(event.key)) return;
    root.setAttribute(YOHU_FOCUS_ATTR, YOHU_FOCUS_KEYBOARD);
  };
  doc.addEventListener("pointerdown", onPointer, true);
  doc.addEventListener("keydown", onKey, true);
  const current = (): void => {
    if (detach !== current) return;
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.removeEventListener("keydown", onKey, true);
    root.removeAttribute(YOHU_FOCUS_ATTR);
    detach = null;
  };
  detach = current;
  return current;
}
