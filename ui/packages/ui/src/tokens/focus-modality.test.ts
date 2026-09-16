import { afterEach, describe, expect, it } from "vitest";

import { bindFocusModality, YOHU_FOCUS_ATTR, YOHU_FOCUS_KEYBOARD } from "./focus-modality";

describe("bindFocusModality", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(YOHU_FOCUS_ATTR);
  });

  it("只有 Tab 写入 keyboard，方向键不激活", () => {
    const unbind = bindFocusModality();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.documentElement.getAttribute(YOHU_FOCUS_ATTR)).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.documentElement.getAttribute(YOHU_FOCUS_ATTR)).toBe(YOHU_FOCUS_KEYBOARD);
    unbind();
  });

  it("重复绑定只留一份监听", () => {
    const first = bindFocusModality();
    const second = bindFocusModality();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.documentElement.getAttribute(YOHU_FOCUS_ATTR)).toBe(YOHU_FOCUS_KEYBOARD);
    first();
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.documentElement.getAttribute(YOHU_FOCUS_ATTR)).toBeNull();
    second();
  });

  it("指针按下结束获焦态", () => {
    const unbind = bindFocusModality();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.documentElement.getAttribute(YOHU_FOCUS_ATTR)).toBeNull();
    unbind();
  });
});
