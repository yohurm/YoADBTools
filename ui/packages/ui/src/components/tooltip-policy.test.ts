import { afterEach, describe, expect, it, vi } from "vitest";

import { motionSpecMs } from "../tokens/motion";
import {
  bindTooltipInputModality,
  createTooltipUnique,
  dismissTooltipOverlay,
  resolveTooltipDelay,
  tooltipAnchorAttrs,
  tooltipCanShow,
  tooltipCanShowOnFocus,
  tooltipNoteInput,
  tooltipUnique,
} from "./tooltip-policy";

const BOX = { top: 10, left: 20, bottom: 42, width: 80, height: 32 };

describe("tooltip-policy", () => {
  afterEach(() => {
    tooltipNoteInput("pointer");
    tooltipUnique.dismiss();
    vi.useRealTimers();
  });

  it("锚点布局：block 主轴、stretch 交叉轴，可叠加", () => {
    expect(tooltipAnchorAttrs({})).toEqual({
      "data-block": undefined,
      "data-stretch": undefined,
    });
    expect(tooltipAnchorAttrs({ block: true })).toEqual({
      "data-block": "",
      "data-stretch": undefined,
    });
    expect(tooltipAnchorAttrs({ stretch: true })).toEqual({
      "data-block": undefined,
      "data-stretch": "",
    });
    expect(tooltipAnchorAttrs({ block: true, stretch: true })).toEqual({
      "data-block": "",
      "data-stretch": "",
    });
  });

  it("延迟名缺省 effectsEnter；禁用或空文案不能出示", () => {
    expect(resolveTooltipDelay()).toBe("effectsEnter");
    expect(resolveTooltipDelay("effectsFast")).toBe("effectsFast");
    expect(tooltipCanShow(true, "保存")).toBe(false);
    expect(tooltipCanShow(false, "")).toBe(false);
    expect(tooltipCanShow(false, "保存")).toBe(true);
  });

  it("焦点出示只认键盘模态；指针点击后程序首焦不能出示", () => {
    tooltipNoteInput("pointer");
    expect(tooltipCanShowOnFocus()).toBe(false);
    tooltipNoteInput("keyboard");
    expect(tooltipCanShowOnFocus()).toBe(true);
    const unbind = bindTooltipInputModality();
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tooltipCanShowOnFocus()).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(tooltipCanShowOnFocus()).toBe(true);
    unbind();
    tooltipNoteInput("pointer");
  });

  it("dismissTooltipOverlay 立即卸缺省槽", () => {
    vi.useFakeTimers();
    tooltipUnique.requestShow({ id: "a", content: "新增组", trigger: BOX }, "effectsFast");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    expect(tooltipUnique.session()?.content).toBe("新增组");
    dismissTooltipOverlay();
    expect(tooltipUnique.session()).toBeNull();
  });

  it("延迟后才进入 Unique 槽；未到点不画", () => {
    vi.useFakeTimers();
    const unique = createTooltipUnique();
    unique.requestShow({ id: "a", content: "保存", trigger: BOX });
    expect(unique.session()).toBeNull();
    vi.advanceTimersByTime(motionSpecMs("effectsEnter") - 1);
    expect(unique.session()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(unique.session()?.content).toBe("保存");
    unique.destroy();
  });

  it("已出示时切换锚点立即换内容，仍是同一槽", () => {
    vi.useFakeTimers();
    const unique = createTooltipUnique();
    unique.requestShow({ id: "a", content: "A", trigger: BOX }, "effectsFast");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    unique.requestShow({ id: "b", content: "B", trigger: { ...BOX, left: 200 } }, "effectsEnter");
    expect(unique.session()?.id).toBe("b");
    expect(unique.session()?.content).toBe("B");
    unique.destroy();
  });

  it("destroy 幂等，之后 requestShow 不再生效", () => {
    vi.useFakeTimers();
    const unique = createTooltipUnique();
    unique.destroy();
    unique.destroy();
    unique.requestShow({ id: "a", content: "X", trigger: BOX }, "effectsFast");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    expect(unique.session()).toBeNull();
  });

  it("hide 延迟后卸槽；代际不匹配的晚到回调丢弃", () => {
    vi.useFakeTimers();
    const unique = createTooltipUnique();
    unique.requestShow({ id: "a", content: "A", trigger: BOX }, "effectsFast");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    unique.requestHide("a", "effectsFast");
    unique.requestShow({ id: "b", content: "B", trigger: BOX }, "effectsFast");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    expect(unique.session()?.id).toBe("b");
    unique.destroy();
  });
});
