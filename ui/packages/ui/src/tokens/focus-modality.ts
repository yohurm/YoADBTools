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
  const onKey: EventListener = (event) => {
    if (!(event instanceof KeyboardEvent) || !isFocusActivationKey(event.key)) return;
    root.setAttribute(YOHU_FOCUS_ATTR, YOHU_FOCUS_KEYBOARD);
  };
  function listen(type: string, handler: EventListener): () => void {
    doc.addEventListener(type, handler, true);
    return () => doc.removeEventListener(type, handler, true);
  }
  const stopPointer = listen("pointerdown", onPointer);
  const stopKey = listen("keydown", onKey);
  const current = (): void => {
    if (detach !== current) return;
    stopPointer();
    stopKey();
    root.removeAttribute(YOHU_FOCUS_ATTR);
    detach = null;
  };
  detach = current;
  return current;
}
