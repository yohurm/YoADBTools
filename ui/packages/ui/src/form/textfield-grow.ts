/**
 * 弱多行抬高口（L4 binder，不进 L5）。
 * 用后高是 UA `field-sizing`；这里只在意图当拍通知祖先 YoGrow。
 * 意图：input / change / paste。横向槽变了才再量（软折行重排）。
 * 禁止读内容固有高，禁止自己写 height，禁止盯插值盒的块轴。
 */

export interface TextFieldGrowHost {
  onIntent: () => void;
}

export function bindTextFieldGrow(field: HTMLTextAreaElement, host: TextFieldGrowHost): () => void {
  const onIntent = (): void => host.onIntent();
  const listen = (type: string): (() => void) => {
    field.addEventListener(type, onIntent);
    return () => field.removeEventListener(type, onIntent);
  };
  const stopInput = listen("input");
  const stopChange = listen("change");
  const stopPaste = listen("paste");

  let lastInline = field.clientWidth;
  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => {
      const inline = field.clientWidth;
      if (inline === lastInline) return;
      lastInline = inline;
      onIntent();
    });
    observer.observe(field);
  }

  return () => {
    stopInput();
    stopChange();
    stopPaste();
    observer?.disconnect();
  };
}
