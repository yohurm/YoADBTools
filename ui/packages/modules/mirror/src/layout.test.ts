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
    expect(func).toContain("YoFormRow");
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
