import { describe, expect, it } from "vitest";

import { Layout } from "../tokens/layout";
import { motionDurationMs } from "../tokens/motion";
import { Spacing } from "../tokens/spacing";
import {
  SCROLLER_AUTO_HIDE_MS,
  SCROLLER_OVERFLOW_SLACK,
  SCROLLER_PAGE_REPEAT_MS,
  SCROLLER_THUMB_MIN,
  resolveScrollerBarState,
  resolveScrollerFlowChild,
  resolveScrollerFlowSize,
  resolveScrollerInteractive,
  resolveScrollerOverflow,
  resolveScrollerPhase,
  resolveScrollerScrollEnd,
  resolveScrollerScrollTop,
  resolveScrollerThumb,
  resolveScrollerThumbCoversPointer,
  resolveScrollerThumbTop,
  resolveScrollerWheelDelta,
  resolveScrollerClampedTop,
  resolveScrollerPageTop,
  resolveScrollerPageTowardPointer,
} from "./scroller-model";

describe("scroller-model", () => {
  it("无法滚动则不溢出，滑块为空", () => {
    expect(SCROLLER_OVERFLOW_SLACK).toBe(Spacing.Xs);
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

  it("BarState：Auto 停滚隐藏，On 常驻，Off 不画条", () => {
    expect(resolveScrollerBarState()).toBe("auto");
    expect(resolveScrollerBarState("on")).toBe("on");
    expect(SCROLLER_AUTO_HIDE_MS).toBe(motionDurationMs("barHide"));
    expect(SCROLLER_PAGE_REPEAT_MS).toBe(motionDurationMs("fast"));
    expect(resolveScrollerInteractive()).toBe(true);
    expect(resolveScrollerInteractive(false)).toBe(false);
    expect(resolveScrollerPhase({ overflowing: true, barState: "on", idle: true, prev: "on" })).toBe("on");
    expect(resolveScrollerPhase({ overflowing: true, barState: "auto", idle: true, prev: "on" })).toBe("out");
    expect(resolveScrollerPhase({ overflowing: true, barState: "auto", idle: true, holding: true, prev: "on" })).toBe("on");
    expect(resolveScrollerPhase({ overflowing: true, barState: "off", prev: "on" })).toBe("out");
    expect(resolveScrollerPhase({ overflowing: true, barState: "off" })).toBe("none");
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
    expect(SCROLLER_THUMB_MIN).toBe(Layout.IconPreview);
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

  it("滚轮 deltaMode 换成像素并夹 top，不靠系统条", () => {
    expect(resolveScrollerWheelDelta({ deltaY: 40, deltaMode: 0, pageHeight: 200 })).toBe(40);
    expect(resolveScrollerWheelDelta({ deltaY: 2, deltaMode: 1, pageHeight: 200 })).toBe(32);
    expect(resolveScrollerWheelDelta({ deltaY: 1, deltaMode: 2, pageHeight: 200 })).toBe(200);
    expect(resolveScrollerClampedTop({ top: -10, view: 200, all: 400 })).toBe(0);
    expect(resolveScrollerClampedTop({ top: 80, view: 200, all: 400 })).toBe(80);
    expect(resolveScrollerClampedTop({ top: 999, view: 200, all: 400 })).toBe(200);
  });

  it("电脑点轨道按页翻，滑块盖住指针则停", () => {
    expect(resolveScrollerPageTop({ view: 200, all: 800, top: 0, next: true })).toBe(200);
    expect(resolveScrollerPageTop({ view: 200, all: 800, top: 50, next: false })).toBe(0);
    expect(resolveScrollerPageTowardPointer({ pointerY: 30, trackTop: 0, thumbTop: 80, thumbHeight: 48 })).toBe(false);
    expect(resolveScrollerPageTowardPointer({ pointerY: 200, trackTop: 0, thumbTop: 80, thumbHeight: 48 })).toBe(true);
    expect(resolveScrollerThumbCoversPointer({ pointerY: 100, trackTop: 0, thumbTop: 80, thumbHeight: 48 })).toBe(true);
  });
});
