import { describe, expect, it } from "vitest";

import { Layout } from "../tokens/layout";
import { applyTooltipBox, placeTooltip, readTooltipTrigger, tooltipLayerStyle } from "./tooltip-place";

const VIEW = { width: 800, height: 600 };
const TRIGGER = { top: 200, left: 200, bottom: 232, width: 40, height: 32 };

describe("tooltip-place", () => {
  it("无锚点时测量为零盒", () => {
    expect(readTooltipTrigger(undefined)).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
  });

  it("上方够用时向上；宽 hug 内容并水平居中，箭头对锚点中心", () => {
    const box = placeTooltip(TRIGGER, { width: 80, height: 24 }, VIEW);
    expect(box.placement).toBe("top");
    expect(box.left).toBe(TRIGGER.left + TRIGGER.width / 2 - 40);
    expect(box.top).toBe(
      TRIGGER.top - Layout.TooltipGap - Layout.TooltipArrow / 2 - 24,
    );
    expect(box.arrowLeft).toBe(40);
  });

  it("不把高度锁成锚点高：矮气泡在锚点高于可用空档时仍向上", () => {
    const tall = { top: 40, left: 200, bottom: 80, width: 48, height: 40 };
    const box = placeTooltip(tall, { width: 64, height: 24 }, VIEW);
    expect(box.placement).toBe("top");
  });

  it("标题栏贴顶时翻到下方", () => {
    const caption = { top: 0, left: 720, bottom: 40, width: 48, height: 40 };
    const box = placeTooltip(caption, { width: 48, height: 24 }, VIEW);
    expect(box.placement).toBe("bottom");
    expect(box.top).toBe(40 + Layout.TooltipGap + Layout.TooltipArrow / 2);
  });

  it("右侧贴边夹 6vp，箭头夹在 20vp 垫内仍朝向锚点", () => {
    const close = { top: 0, left: 760, bottom: 40, width: 40, height: 40 };
    const box = placeTooltip(close, { width: 80, height: 24 }, VIEW);
    expect(box.left).toBe(VIEW.width - 80 - Layout.TooltipEdge);
    expect(box.arrowLeft).toBe(80 - Layout.TooltipArrowInset);
  });

  it("窄气泡箭头夹到中心，不超出 20vp 垫", () => {
    const box = placeTooltip(TRIGGER, { width: 36, height: 24 }, VIEW);
    expect(box.arrowLeft).toBe(18);
  });

  it("不写菜单锁宽 / 纵滚字段", () => {
    const box = placeTooltip(TRIGGER, { width: 120, height: 24 }, VIEW);
    expect(box).not.toHaveProperty("minWidth");
    expect(box).not.toHaveProperty("overflowY");
    expect(box).not.toHaveProperty("maxHeight");
  });

  it("层样式禁止 top/left 过渡", () => {
    const box = placeTooltip(TRIGGER, { width: 80, height: 24 }, VIEW);
    expect(tooltipLayerStyle(box).transition).toBe("none");
  });

  it("apply 清掉菜单定位残留", () => {
    const box = placeTooltip(TRIGGER, { width: 80, height: 24 }, VIEW);
    const el = document.createElement("div");
    el.style.width = "100px";
    el.style.minWidth = "40px";
    el.style.bottom = "12px";
    el.setAttribute("data-overflow-y", "");
    applyTooltipBox(el, box);
    expect(el.style.width).toBe("");
    expect(el.style.minWidth).toBe("");
    expect(el.style.bottom).toBe("auto");
    expect(el.hasAttribute("data-overflow-y")).toBe(false);
    expect(el.style.getPropertyValue("--yohu-tooltip-arrow")).toBe(`${box.arrowLeft}px`);
    expect(el.dataset.placement).toBe(box.placement);
    expect(el.dataset.placed).toBe("true");
    expect(el.style.transition).toBe("none");
    expect(el.style.zIndex).toBe("var(--yohu-z-overlay)");
  });
});
