import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@yohu/api", () => ({
  MIRROR_MIN_LAYOUT_PX: 64,
}));

import { MIRROR_MIN_LAYOUT_PX } from "@yohu/api";

import { clientPointerPx, clientZoneRect, assembleMirrorLayout, layoutInsetKey, layoutIsPresentable, shouldReportLayout } from "./layout";

describe("clientPointerPx", () => {
  it("与 avail 同一套物理坐标，不加屏幕原点", () => {
    expect(clientPointerPx(10, 20, 1.5)).toEqual({
      x: Math.round(10 * 1.5),
      y: Math.round(20 * 1.5),
    });
  });
});

describe("clientZoneRect", () => {
  it("把 CSS 盒乘 DPR，不加屏幕原点", () => {
    expect(clientZoneRect({ left: 10, top: 20, width: 100, height: 200 }, 1.5)).toEqual({
      x: Math.round(10 * 1.5),
      y: Math.round(20 * 1.5),
      width: Math.round(100 * 1.5),
      height: Math.round(200 * 1.5),
    });
  });

  it("DPR 非法时按 1，零盒保持 0", () => {
    expect(clientZoneRect({ left: 0, top: 0, width: 0, height: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("先取整四边，宽高由边导出", () => {
    const css = { left: 10.4, top: 20.4, width: 200.4, height: 300.4 };
    const dpr = 1.5;
    const rect = clientZoneRect(css, dpr);
    expect(rect.x).toBe(Math.round(10.4 * 1.5));
    expect(rect.y).toBe(Math.round(20.4 * 1.5));
    expect(rect.x + rect.width).toBe(Math.round((10.4 + 200.4) * 1.5));
    expect(rect.y + rect.height).toBe(Math.round((20.4 + 300.4) * 1.5));
    expect(rect.width).not.toBe(Math.round(200.4 * 1.5));
  });

  it("把 visualViewport 偏移加进客户区原点", () => {
    expect(
      clientZoneRect({ left: 10, top: 20, width: 100, height: 200 }, 2, {
        left: 5,
        top: 6,
      }),
    ).toEqual({
      x: Math.round((10 + 5) * 2),
      y: Math.round((20 + 6) * 2),
      width: 200,
      height: 400,
    });
  });
});

describe("layoutIsPresentable", () => {
  it("与 protocol MIRROR_MIN_LAYOUT_PX 对齐", () => {
    expect(MIRROR_MIN_LAYOUT_PX).toBe(64);
    expect(layoutIsPresentable(486, 1)).toBe(false);
    expect(layoutIsPresentable(MIRROR_MIN_LAYOUT_PX, MIRROR_MIN_LAYOUT_PX)).toBe(true);
  });
});

describe("assembleMirrorLayout", () => {
  const avail = {
    x: 10,
    y: 20,
    width: 300,
    height: 600,
    visible: true,
    dpr: 1.5,
    dark: true,
  };
  const flags = {
    serial: "S1",
    fullscreen: true,
    paused: true,
    control: false,
    hasDevice: true,
    failed: false,
    error: "",
  };

  it("avail 与会话旗标合成 MirrorLayout，不含 contain / 编码尺寸", () => {
    const layout = assembleMirrorLayout(avail, flags);
    expect(layout).toEqual({
      serial: "S1",
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1.5,
      fullscreen: true,
      paused: true,
      control: false,
      has_device: true,
      failed: false,
      error: "",
      dark: true,
    });
    expect(layout).not.toHaveProperty("video_width");
    expect(layout).not.toHaveProperty("stroke_px");
    expect(layout).not.toHaveProperty("epoch");
  });

  it("inset key 覆盖占用与会话旗标", () => {
    const layout = assembleMirrorLayout(avail, flags);
    expect(layoutInsetKey(layout)).toBe(
      "S1,10,20,300x600,v=true,dpr=1.5,f=true,p=true,c=false,dev=true,fail=false,e=,dark=true",
    );
  });
});

const viewSrc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "MirrorView.tsx"), "utf-8");
const statusSrc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Status.tsx"), "utf-8");

describe("MirrorView 滚轴", () => {
  it("ops / func 走 YoScroller，avail 不套", () => {
    expect(viewSrc).toContain("YoScroller");
    const ops = viewSrc.slice(viewSrc.indexOf('class="yohu-mirror__ops"'), viewSrc.indexOf('class="yohu-mirror__func"'));
    expect(ops).toMatch(/<YoScroller>/);
    expect(ops).toContain("<For");
    const func = viewSrc.slice(viewSrc.indexOf('class="yohu-mirror__func"'));
    expect(func).toMatch(/<YoScroller>/);
    expect(func).toContain("QualityRow");
    expect(viewSrc).toContain("YoFormRow");
    const avail = viewSrc.slice(viewSrc.indexOf('class="yohu-mirror__avail"'), viewSrc.indexOf('class="yohu-mirror__ops"'));
    expect(avail).not.toContain("YoScroller");
    expect(avail).toContain("yohu-mirror__hole");
    expect(avail).toContain("onPointerDown");
    expect(avail).toContain("onPointerLeave");
    expect(viewSrc).not.toContain("deviceLabel");
    expect(viewSrc).toContain("onCleanup(() => toaster.destroy())");
    expect(viewSrc).toContain("leaveAvail");
    expect(viewSrc).not.toContain("Toast.success");
    expect(statusSrc).toContain("YoBadge");
    expect(statusSrc).not.toMatch(/<span[\s>]/);
  });

  it("滚动与可见性直接推布局", () => {
    expect(viewSrc.split("function on" + "Win").length - 1).toBe(0);
    expect(viewSrc.split("function on" + "Vis").length - 1).toBe(0);
    expect(viewSrc).not.toContain("on" + "Win");
    expect(viewSrc).not.toContain("on" + "Vis");
    expect(viewSrc).toContain('listen(window, "scroll", pushLayout, true)');
    expect(viewSrc).toContain('listen(document, "visibilitychange", pushLayout)');
  });

  it("监听只登记一次", () => {
    expect(viewSrc.split("add" + "EventListener").length - 1).toBe(1);
    expect(viewSrc.split("remove" + "EventListener").length - 1).toBe(1);
    expect(viewSrc).toContain('listen(window, "keydown", onEsc)');
  });

  it("尺寸与主题直接推布局", () => {
    expect(viewSrc.split("push" + "Layout()").length - 1).toBe(1);
    expect(viewSrc).toContain("new ResizeObserver(pushLayout)");
    expect(viewSrc).toContain("onResolvedThemeChange(pushLayout)");
  });

  it("没有视口轴时是 0", () => {
    expect(viewSrc.split("?? " + "0").length - 1).toBe(1);
    expect(viewSrc).toContain("viewportAxis(vv?.offsetLeft)");
    expect(viewSrc).toContain("viewportAxis(vv?.offsetTop)");
    expect(viewSrc).toContain("hostPixelRatio()");
  });
});

describe("shouldReportLayout", () => {
  it("隐藏即使小于最小像素也上报", () => {
    expect(
      shouldReportLayout({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        visible: false,
        dpr: 1,
        dark: false,
      }),
    ).toBe(true);
  });

  it("可见且低于最小像素不上报", () => {
    expect(
      shouldReportLayout({
        x: 0,
        y: 0,
        width: 63,
        height: 64,
        visible: true,
        dpr: 1,
        dark: false,
      }),
    ).toBe(false);
  });
});

const layoutSrc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "layout.ts"), "utf-8");

describe("客户区跨度", () => {
  it("宽高都经 zoneSpan，旧跨度只留在函数里", () => {
    expect(layoutSrc.split("Math.max(0, " + "far.x - origin.x)").length - 1).toBe(0);
    expect(layoutSrc.split("Math.max(0, " + "far.y - origin.y)").length - 1).toBe(0);
    expect(layoutSrc).toContain("zoneSpan(far.x, origin.x)");
    expect(layoutSrc).toContain("zoneSpan(far.y, origin.y)");
    expect(layoutSrc.split("function zoneSpan").length - 1).toBe(1);
    expect(layoutSrc.split("return Math.max(0, far - origin)").length - 1).toBe(1);
  });
});

describe("物理轴", () => {
  it("横纵都经 physicalAxis，旧乘积只留在函数里", () => {
    expect(layoutSrc.split("Math.round(" + "x * dpr)").length - 1).toBe(0);
    expect(layoutSrc.split("Math.round(" + "y * dpr)").length - 1).toBe(0);
    expect(layoutSrc).toContain("physicalAxis(x, dpr)");
    expect(layoutSrc).toContain("physicalAxis(y, dpr)");
    expect(layoutSrc.split("function physicalAxis").length - 1).toBe(1);
    expect(layoutSrc.split("return Math.round(css * dpr)").length - 1).toBe(1);
    expect(layoutSrc).toContain("function zoneSpan");
    expect(layoutSrc).toContain("function finiteOrZero");
  });
});

describe("客户区轴", () => {
  it("横纵都经 cssAxis，旧偏移只留在函数里", () => {
    expect(layoutSrc.split("cssX + " + "finiteOrZero(viewportOffset.left)").length - 1).toBe(0);
    expect(layoutSrc.split("cssY + " + "finiteOrZero(viewportOffset.top)").length - 1).toBe(0);
    expect(layoutSrc).toContain("cssAxis(cssX, viewportOffset.left)");
    expect(layoutSrc).toContain("cssAxis(cssY, viewportOffset.top)");
    expect(layoutSrc.split("function cssAxis").length - 1).toBe(1);
    expect(layoutSrc.split("return css + finiteOrZero(offset)").length - 1).toBe(1);
    expect(layoutSrc).toContain("function finiteOrZero");
    expect(layoutSrc).toContain("function physicalAxis");
    expect(layoutSrc).toContain("physicalAxis(x, dpr)");
  });
});

function times(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("视口零偏移", () => {
  it("指针和可用区缺省都从零开始，字面只留在函数体", () => {
    expect(times(layoutSrc, "{ left: " + "0, top: 0 }")).toBe(1);
    expect(times(layoutSrc, "function zeroOffset")).toBe(1);
    expect(times(layoutSrc, "export function zeroOffset")).toBe(0);
    expect(times(layoutSrc, "zeroOffset()")).toBe(3);
  });
});

describe("客户区远端", () => {
  it("宽和高都是起点加上跨度，视口偏移不并", () => {
    expect(times(layoutSrc, "css.left + " + "css.width")).toBe(0);
    expect(times(layoutSrc, "css.top + " + "css.height")).toBe(0);
    expect(times(layoutSrc, "return origin + " + "span")).toBe(1);
    expect(times(layoutSrc, "function cssFar")).toBe(1);
    expect(times(layoutSrc, "export function cssFar")).toBe(0);
    expect(times(layoutSrc, "cssFar(css.left, css.width)")).toBe(1);
    expect(times(layoutSrc, "cssFar(css.top, css.height)")).toBe(1);
    expect(layoutSrc).toContain("function cssAxis");
  });
});

describe("最小像素可呈现", () => {
  it("宽和高都达到最小物理像素，隐藏上报不并", () => {
    expect(times(layoutSrc, "width >= " + "MIRROR_MIN_LAYOUT_PX")).toBe(0);
    expect(times(layoutSrc, "height >= " + "MIRROR_MIN_LAYOUT_PX")).toBe(0);
    expect(times(layoutSrc, "px >= " + "MIRROR_MIN_LAYOUT_PX")).toBe(1);
    expect(times(layoutSrc, "function spanPresentable")).toBe(1);
    expect(times(layoutSrc, "export function spanPresentable")).toBe(0);
    expect(times(layoutSrc, "spanPresentable(width)")).toBe(1);
    expect(times(layoutSrc, "spanPresentable(height)")).toBe(1);
    expect(layoutSrc).toContain("!avail.visible || layoutIsPresentable");
  });
});
