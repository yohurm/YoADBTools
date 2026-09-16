import { describe, expect, it } from "vitest";

import {
  SCROLLER_OVERFLOW_SLACK,
  SCROLLER_THUMB_MIN,
  resolveScrollerFlowChild,
  resolveScrollerFlowSize,
  resolveScrollerOverflow,
  resolveScrollerPhase,
  resolveScrollerScrollEnd,
  resolveScrollerScrollTop,
  resolveScrollerThumb,
  resolveScrollerThumbTop,
} from "./scroller-model";

describe("scroller-model", () => {
  it("无法滚动则不溢出，滑块为空", () => {
    expect(SCROLLER_OVERFLOW_SLACK).toBe(4);
    expect(resolveScrollerOverflow(200, 200)).toBe(false);
    expect(resolveScrollerOverflow(200, 204)).toBe(false);
    expect(resolveScrollerOverflow(0, 400)).toBe(false);
    expect(resolveScrollerThumb({ view: 200, all: 200, top: 0 })).toBeUndefined();
  });

  it("溢出才有滑块，相位只走显隐", () => {
    expect(resolveScrollerOverflow(200, 400)).toBe(true);
    expect(resolveScrollerPhase({ overflowing: true })).toBe("in");
    expect(resolveScrollerPhase({ overflowing: true, prev: "in" })).toBe("on");
    expect(resolveScrollerPhase({ overflowing: false, prev: "on" })).toBe("out");
    expect(resolveScrollerPhase({ overflowing: false, prev: "out" })).toBe("out");
    expect(resolveScrollerPhase({ overflowing: false })).toBe("none");
  });

  it("in-flow 底边当内容高，abspos 不计", () => {
    expect(resolveScrollerFlowChild("static")).toBe(true);
    expect(resolveScrollerFlowChild("relative")).toBe(true);
    expect(resolveScrollerFlowChild("absolute")).toBe(false);
    expect(resolveScrollerFlowChild("fixed")).toBe(false);
    expect(resolveScrollerFlowSize([])).toBe(0);
    expect(resolveScrollerFlowSize([{ top: 0, height: 120 }])).toBe(120);
    expect(
      resolveScrollerFlowSize([
        { top: 0, height: 80 },
        { top: 80, height: 0 },
      ]),
    ).toBe(80);
  });

  it("Travel 插值中不新出条，已显示则保持", () => {
    expect(resolveScrollerPhase({ overflowing: true, traveling: true })).toBe("none");
    expect(resolveScrollerPhase({ overflowing: true, traveling: true, prev: "none" })).toBe("none");
    expect(resolveScrollerPhase({ overflowing: true, traveling: true, prev: "on" })).toBe("on");
    expect(resolveScrollerPhase({ overflowing: false, traveling: true, prev: "on" })).toBe("out");
  });

  it("滑块高 = 视口² / 内容，最短 IconPreview", () => {
    expect(SCROLLER_THUMB_MIN).toBe(48);
    expect(resolveScrollerThumb({ view: 200, all: 400, top: 0 })).toEqual({ top: 0, height: 100 });
    expect(resolveScrollerThumb({ view: 200, all: 400, top: 200 })).toEqual({ top: 100, height: 100 });
    expect(resolveScrollerThumb({ view: 80, all: 800, top: 0 })?.height).toBe(SCROLLER_THUMB_MIN);
  });

  it("钉底只认 in-flow 底边", () => {
    expect(resolveScrollerScrollEnd(200, 400)).toBe(200);
    expect(resolveScrollerScrollEnd(400, 200)).toBe(0);
  });

  it("拖滑块：位移与 scrollTop 互逆", () => {
    expect(resolveScrollerScrollTop({ view: 200, all: 400, thumbHeight: 100, thumbTop: 0 })).toBe(0);
    expect(resolveScrollerScrollTop({ view: 200, all: 400, thumbHeight: 100, thumbTop: 100 })).toBe(200);
    expect(resolveScrollerThumbTop({ pointerY: 80, trackTop: 20, grab: 10, room: 100 })).toBe(50);
    expect(resolveScrollerThumbTop({ pointerY: 0, trackTop: 20, grab: 10, room: 100 })).toBe(0);
    expect(resolveScrollerThumbTop({ pointerY: 400, trackTop: 20, grab: 10, room: 100 })).toBe(100);
  });
});
