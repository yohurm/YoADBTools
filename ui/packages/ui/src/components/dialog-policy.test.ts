import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";

import { motionSpecMs } from "../tokens/motion";
import {
  attachDialog,
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
    });
  });

  it("stack + hidden 写成 data-overflow", () => {
    expect(dialogBodyAttrs({ overflow: "hidden" })).toEqual({
      "data-layout": "stack",
      "data-overflow": "hidden",
      "data-pad": "lg",
    });
  });

  it("pad none 写成 data-pad", () => {
    expect(dialogBodyAttrs({ pad: "none" })).toEqual({
      "data-layout": "stack",
      "data-overflow": "auto",
      "data-pad": "none",
    });
  });

  it("读面板盒：零盒不锁，正盒锁 px", () => {
    const panel = document.createElement("div");
    expect(dialogExitLock(panel)).toBeUndefined();
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 320,
      width: 400,
      height: 320,
      toJSON: () => ({}),
    });
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
