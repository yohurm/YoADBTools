import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";

import { motionSpecMs } from "../tokens/motion";
import {
  attachDialog,
  countDialogActions,
  dialogActionsAttrs,
  dialogBodyAttrs,
  dialogExitLock,
  dialogLayerStyle,
  resolveDialogOpen,
} from "./dialog-policy";
import { tooltipUnique } from "./tooltip-policy";

describe("dialog-policy", () => {
  afterEach(() => {
    tooltipUnique.dismiss();
    vi.useRealTimers();
  });

  it("open 接受布尔或 Accessor", () => {
    expect(resolveDialogOpen(true)).toBe(true);
    expect(resolveDialogOpen(false)).toBe(false);
    const [open] = createSignal(true);
    expect(resolveDialogOpen(open)).toBe(true);
  });

  it("叠层走 overlay dialog token，不写魔法数", () => {
    expect(dialogLayerStyle().zIndex).toBe("var(--yohu-z-dialog)");
  });

  it("内容区缺省写成 stack / auto / lg", () => {
    expect(dialogBodyAttrs({})).toEqual({
      "data-layout": "stack",
      "data-overflow": "auto",
      "data-pad": "lg",
      "data-region": "plain",
    });
  });

  it("stack + hidden 写成 data-overflow", () => {
    expect(dialogBodyAttrs({ overflow: "hidden" })).toEqual({
      "data-layout": "stack",
      "data-overflow": "hidden",
      "data-pad": "lg",
      "data-region": "plain",
    });
  });

  it("操作区 AUTO 写成 data-layout，只数 button 槽", () => {
    expect(dialogActionsAttrs(0)).toEqual({ "data-layout": "center" });
    expect(dialogActionsAttrs(1)).toEqual({ "data-layout": "center" });
    expect(dialogActionsAttrs(2)).toEqual({ "data-layout": "row" });
    expect(dialogActionsAttrs(3)).toEqual({ "data-layout": "stack" });

    const footer = document.createElement("div");
    footer.innerHTML =
      `<span>路径非法</span>` +
      `<button><span class="yohu-button__chrome"></span></button>` +
      `<button>确定</button>`;
    expect(countDialogActions(footer)).toBe(2);
    expect(countDialogActions(footer.querySelectorAll(".yohu-button__chrome"))).toBe(0);
  });

  it("pad none 写成 data-pad", () => {
    expect(dialogBodyAttrs({ pad: "none" })).toEqual({
      "data-layout": "stack",
      "data-overflow": "auto",
      "data-pad": "none",
      "data-region": "plain",
    });
    expect(dialogBodyAttrs({ lead: true })["data-region"]).toBe("split");
  });

  it("读面板盒：零盒不锁，正盒锁 px", () => {
    const panel = document.createElement("div");
    expect(dialogExitLock(panel)).toBeUndefined();
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 320 });
    expect(dialogExitLock(panel)).toEqual({ width: "400px", height: "320px" });
  });

  it("入栈立即卸缺省 Tooltip Unique，不把气泡压到模态上", () => {
    vi.useFakeTimers();
    const panel = document.createElement("div");
    const button = document.createElement("button");
    button.textContent = "新增组";
    panel.append(button);
    document.body.append(panel);
    tooltipUnique.requestShow(
      { id: "tree", content: "adb getprop ro.product.model", trigger: { top: 10, left: 20, bottom: 42, width: 80, height: 32 } },
      "effectsFast",
    );
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    expect(tooltipUnique.session()?.content).toContain("adb");
    const detach = attachDialog({
      getPanel: () => panel,
      onClose: () => {},
      restoreFocus: null,
    });
    expect(tooltipUnique.session()).toBeNull();
    detach();
    panel.remove();
  });
});
