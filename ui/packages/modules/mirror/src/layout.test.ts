import { describe, expect, it, vi } from "vitest";

vi.mock("@yohu/api", () => ({
  MIRROR_MIN_LAYOUT_PX: 64,
}));

import { MIRROR_MIN_LAYOUT_PX } from "@yohu/api";

import { clientZoneRect, assembleMirrorLayout, layoutInsetKey, layoutIsPresentable, shouldReportLayout, workbenchDark } from "./layout";

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

describe("workbenchDark", () => {
  it("只认 html data-theme=dark", () => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(workbenchDark(document)).toBe(true);
    document.documentElement.setAttribute("data-theme", "light");
    expect(workbenchDark(document)).toBe(false);
    if (prev === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", prev);
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
