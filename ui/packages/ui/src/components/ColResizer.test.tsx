import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { YoColResizer } from "./ColResizer";

/** jsdom 的 PointerEvent 常丢 clientX；直接写到事件上。 */
function firePointer(el: HTMLElement, type: "pointerdown" | "pointermove" | "pointerup", clientX: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { configurable: true, value: clientX });
  Object.defineProperty(event, "button", { configurable: true, value: 0 });
  Object.defineProperty(event, "pointerId", { configurable: true, value: 1 });
  el.dispatchEvent(event);
}

describe("YoColResizer", () => {
  it("边界是 separator，带 valuemin/now", () => {
    const onWidthChange = vi.fn();
    const { container } = render(() => (
      <YoColResizer width={192} minWidth={48} label="调节 Tag 列宽" onWidthChange={onWidthChange} />
    ));
    const handle = container.querySelector(".yohu-col-resizer");
    expect(handle?.getAttribute("role")).toBe("separator");
    expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle?.getAttribute("aria-label")).toBe("调节 Tag 列宽");
    expect(handle?.getAttribute("aria-valuemin")).toBe("48");
    expect(handle?.getAttribute("aria-valuenow")).toBe("192");
    expect(handle?.tagName).toBe("DIV");
  });

  it("指针 start/move/end 报绝对宽度", () => {
    const onWidthChange = vi.fn();
    const { container } = render(() => (
      <YoColResizer width={192} minWidth={48} onWidthChange={onWidthChange} />
    ));
    const handle = container.querySelector(".yohu-col-resizer") as HTMLElement;
    firePointer(handle, "pointerdown", 100);
    expect(onWidthChange).toHaveBeenCalledWith(192, "start");
    firePointer(handle, "pointermove", 120);
    expect(onWidthChange).toHaveBeenCalledWith(212, "move");
    firePointer(handle, "pointerup", 120);
    expect(onWidthChange).toHaveBeenCalledWith(212, "end");
  });

  it("键盘左右微调，Home 到 min", () => {
    const onWidthChange = vi.fn();
    const { container } = render(() => (
      <YoColResizer width={192} minWidth={48} onWidthChange={onWidthChange} />
    ));
    const handle = container.querySelector(".yohu-col-resizer") as HTMLElement;
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onWidthChange).toHaveBeenCalledWith(200, "end");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(onWidthChange).toHaveBeenCalledWith(48, "end");
  });
});
