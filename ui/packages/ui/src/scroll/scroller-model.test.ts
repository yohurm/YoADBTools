import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Layout } from "../tokens/layout";
import { motionDurationMs } from "../tokens/motion";
import { Spacing } from "../tokens/spacing";
import {
  SCROLLER_AUTO_HIDE_MS,
  SCROLLER_LANE,
  SCROLLER_OVERFLOW_SLACK,
  SCROLLER_PAGE_HOLD_MS,
  SCROLLER_PAGE_REPEAT_MS,
  SCROLLER_SMALL_REGION,
  SCROLLER_THUMB,
  SCROLLER_THUMB_ACTIVE,
  SCROLLER_THUMB_END,
  SCROLLER_THUMB_MIN,
  SCROLLER_THUMB_MIN_RATIO,
  SCROLLER_THUMB_MIN_SMALL,
  resolveScrollerBarState,
  resolveScrollerFlowChild,
  resolveScrollerFlowSize,
  resolveScrollerGutter,
  resolveScrollerInteractive,
  resolveScrollerOverflow,
  resolveScrollerPhase,
  resolveScrollerReducedPhase,
  resolveScrollerScrollEnd,
  resolveScrollerScrollTop,
  resolveScrollerThumb,
  resolveScrollerThumbCoversPointer,
  resolveScrollerThumbMin,
  resolveScrollerThumbTop,
  resolveScrollerWheelDelta,
  resolveScrollerAxis,
  scrollerAxisIsBoth,
  scrollerPhaseAcceptsPointer,
  scrollerPhaseIsNone,
  scrollerPhaseIsOut,
  scrollerBarIsAuto,
  scrollerBarIsOff,
  scrollerBarIsOn,
  scrollerPhaseIsShown,
  resolveScrollerViewSize,
  resolveScrollerValueNow,
  resolveScrollerViewFromGutter,
  resolveScrollerContentBox,
  resolveScrollerDrive,
  scrollerDriveIsFlow,
  scrollerOverflowIsHidden,
  scrollerPlaneTransform,
  resolveScrollerClampedTop,
  resolveScrollerPageTop,
  resolveScrollerPageTowardPointer,
} from "./scroller-model";

describe("scroller-model", () => {
  it("默认只纵滚，both 才开横轴", () => {
    expect(resolveScrollerAxis()).toBe("block");
    expect(resolveScrollerAxis("block")).toBe("block");
    expect(resolveScrollerAxis("both")).toBe("both");
    expect(resolveScrollerViewSize(200, 0, 16)).toBe(184);
    expect(resolveScrollerViewSize(200, 8, 8)).toBe(184);
    expect(resolveScrollerViewSize(10, 8, 8)).toBe(0);
    expect(resolveScrollerViewFromGutter(200, false)).toBe(200);
    expect(resolveScrollerViewFromGutter(200, true)).toBe(200 - SCROLLER_LANE);
    expect(resolveScrollerContentBox(undefined, 400, 300, 200)).toEqual({ block: 400, inline: 300 });
    expect(resolveScrollerContentBox({ block: 2200 }, 0, 0, 800)).toEqual({ block: 2200, inline: 800 });
    expect(resolveScrollerContentBox({ block: 2200, inline: 1400 }, 0, 0, 800)).toEqual({
      block: 2200,
      inline: 1400,
    });
    expect(resolveScrollerDrive(undefined)).toBe("flow");
    expect(resolveScrollerDrive({ block: 2200 })).toBe("offset");
    expect(scrollerPlaneTransform(80)).toBe("translate3d(0px, -80px, 0)");
    expect(scrollerPlaneTransform(80, 12)).toBe("translate3d(-12px, -80px, 0)");
  });

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

  it("溢出且未 Off 才让出侧轨，Auto 隐条也留槽", () => {
    expect(SCROLLER_THUMB_END).toBe(Spacing.Xs);
    expect(SCROLLER_LANE).toBe(SCROLLER_THUMB_ACTIVE + SCROLLER_THUMB_END * 2);
    expect(SCROLLER_LANE).toBe(Spacing.Lg);
    expect(SCROLLER_THUMB + SCROLLER_THUMB_END).toBeLessThan(SCROLLER_LANE);
    expect(SCROLLER_THUMB_ACTIVE + SCROLLER_THUMB_END).toBeLessThanOrEqual(SCROLLER_LANE);
    expect(resolveScrollerGutter({ overflowing: false })).toBe(false);
    expect(resolveScrollerGutter({ overflowing: true })).toBe(true);
    expect(resolveScrollerGutter({ overflowing: true, barState: "auto" })).toBe(true);
    expect(resolveScrollerGutter({ overflowing: true, barState: "on" })).toBe(true);
    expect(resolveScrollerGutter({ overflowing: true, barState: "off" })).toBe(false);
  });

  it("BarState：Auto 停滚隐藏，On 常驻，Off 不画条", () => {
    expect(resolveScrollerBarState()).toBe("auto");
    expect(resolveScrollerBarState("on")).toBe("on");
    expect(SCROLLER_AUTO_HIDE_MS).toBe(motionDurationMs("barHide"));
    expect(SCROLLER_PAGE_HOLD_MS).toBe(500);
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

  it("滑块高 = 视口² / 内容；短轨按官方 20%/8vp 取最短", () => {
    expect(SCROLLER_THUMB).toBe(Spacing.Xs);
    expect(SCROLLER_THUMB_ACTIVE).toBe(Spacing.Sm);
    expect(SCROLLER_THUMB_MIN).toBe(Layout.IconPreview);
    expect(SCROLLER_SMALL_REGION).toBe(Layout.Preview);
    expect(SCROLLER_THUMB_MIN_SMALL).toBe(Spacing.Sm);
    expect(SCROLLER_THUMB_MIN_RATIO).toBe(0.2);
    expect(resolveScrollerThumbMin(0)).toBe(SCROLLER_THUMB_MIN);
    expect(resolveScrollerThumbMin(80)).toBe(16);
    expect(resolveScrollerThumbMin(240)).toBe(SCROLLER_THUMB_MIN);
    expect(resolveScrollerThumb({ view: 200, all: 400, top: 0 })).toEqual({ top: 0, height: 100 });
    expect(resolveScrollerThumb({ view: 200, all: 400, top: 200 })).toEqual({ top: 100, height: 100 });
    expect(resolveScrollerThumb({ view: 80, all: 800, top: 0 })?.height).toBe(16);
    expect(resolveScrollerThumb({ view: 400, all: 4000, top: 0 })?.height).toBe(SCROLLER_THUMB_MIN);
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

  it("aria 百分比走进度比例", () => {
    expect(resolveScrollerValueNow(0, 0)).toBe(0);
    expect(resolveScrollerValueNow(1, 3)).toBe(33);
    expect(resolveScrollerValueNow(150, 100)).toBe(100);
  });

  it("双轴只在 scrollerAxisIsBoth 里比较", () => {
    expect(scrollerAxisIsBoth("both")).toBe(true);
    expect(scrollerAxisIsBoth("block")).toBe(false);
    expect(scrollerAxisIsBoth()).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.") || name === "scroller-model.ts") continue;
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('=== "both"');
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('!== "both"');
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('axis() === "block"');
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('"block" | "both"');
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('"auto" | "hidden"');
    }
  });

  it("滚动相位只在模型里比较", () => {
    expect(scrollerPhaseIsNone("none")).toBe(true);
    expect(scrollerPhaseIsNone("on")).toBe(false);
    expect(scrollerPhaseIsOut("out")).toBe(true);
    expect(scrollerPhaseIsShown("in")).toBe(true);
    expect(scrollerPhaseIsShown("on")).toBe(true);
    expect(scrollerPhaseIsShown("out")).toBe(false);
    expect(scrollerPhaseAcceptsPointer("on")).toBe(true);
    expect(scrollerPhaseAcceptsPointer("none")).toBe(false);
    expect(scrollerPhaseAcceptsPointer("out")).toBe(false);
    expect(resolveScrollerReducedPhase("in")).toEqual({ phase: "on", prev: "on" });
    expect(resolveScrollerReducedPhase("on")).toEqual({ phase: "on", prev: "on" });
    expect(resolveScrollerReducedPhase("out")).toEqual({ phase: "none", prev: undefined });
    expect(resolveScrollerReducedPhase("none")).toEqual({ phase: "none", prev: undefined });
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body =
        name === "scroller-model.ts"
          ? text
              .replace('return phase === "none"', "")
              .replace('return phase === "out"', "")
              .replace('return phase === "in" || phase === "on"', "")
          : text;
      const phaseBody = body.replaceAll('=== "inline"', "");
      expect(phaseBody, name).not.toContain('=== "none"');
      expect(phaseBody, name).not.toContain('=== "out"');
      expect(phaseBody, name).not.toContain('!== "out"');
      expect(phaseBody, name).not.toContain('=== "in"');
    }
  });

  it("条状态只在模型里比较", () => {
    expect(scrollerBarIsAuto("auto")).toBe(true);
    expect(scrollerBarIsAuto("on")).toBe(false);
    expect(scrollerBarIsOn("on")).toBe(true);
    expect(scrollerBarIsOff("off")).toBe(true);
    expect(scrollerBarIsOff("auto")).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body =
        name === "scroller-model.ts"
          ? text
              .replace('return state === "auto"', "")
              .replace('return state === "on"', "")
              .replace('return state === "off"', "")
          : text;
      expect(body, name).not.toContain('=== "auto"');
      expect(body, name).not.toContain('!== "auto"');
      expect(body, name).not.toContain('=== "off"');
      expect(body, name).not.toContain('!== "off"');
      expect(body, name).not.toContain('bar === "on"');
    }
  });

  it("驱动只在模型里比较 flow", () => {
    expect(scrollerDriveIsFlow("flow")).toBe(true);
    expect(scrollerDriveIsFlow("offset")).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body = name === "scroller-model.ts" ? text.replace('return drive === "flow"', "") : text;
      expect(body, name).not.toContain('drive() === "flow"');
      expect(body, name).not.toContain('drive() !== "flow"');
      expect(body, name).not.toContain('drive === "flow"');
    }
  });

  it("裁切只在模型里比较 hidden", () => {
    expect(scrollerOverflowIsHidden("hidden")).toBe(true);
    expect(scrollerOverflowIsHidden("auto")).toBe(false);
    expect(scrollerOverflowIsHidden()).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body = name === "scroller-model.ts" ? text.replace('return overflow === "hidden"', "") : text;
      expect(body, name).not.toContain('overflow() === "hidden"');
      expect(body, name).not.toContain('overflow === "hidden"');
    }
  });
});

describe("滑块行程", () => {
  it("视口减去滑块长度后不小于 0", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scroller-model.ts"), "utf8");
    const heightNeedle = "Math.max(0, " + "view - height)";
    const thumbNeedle = "Math.max(0, " + "input.view - input.thumbHeight)";
    const endNeedle = "Math.max(0, " + "all - view)";
    expect(source.split(heightNeedle).length - 1).toBe(0);
    expect(source.split(thumbNeedle).length - 1).toBe(0);
    expect(source).toContain("scrollerThumbRoom(view, height)");
    expect(source).toContain("scrollerThumbRoom(input.view, input.thumbHeight)");
    expect(source.split("return Math.max(0, view - thumb)").length - 1).toBe(1);
    expect(source).toContain(endNeedle);
  });
});

describe("绑定位移行程", () => {
  it("四处 room 调用模型行程", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const binder = readFileSync(join(dir, "scroller-binder.ts"), "utf8");
    const model = readFileSync(join(dir, "scroller-model.ts"), "utf8");
    const blockRoom = "Math.max(0, " + "metrics.viewBlock - current.height)";
    const inlineRoom = "Math.max(0, " + "metrics.viewInline - current.height)";
    const endNeedle = "Math.max(0, " + "all - view)";
    expect(binder.split(blockRoom).length - 1).toBe(0);
    expect(binder.split(inlineRoom).length - 1).toBe(0);
    expect(binder.split("scrollerThumbRoom(metrics.viewBlock, current.height)").length - 1).toBe(2);
    expect(binder.split("scrollerThumbRoom(metrics.viewInline, current.height)").length - 1).toBe(2);
    expect(model.split("export function scrollerThumbRoom").length - 1).toBe(1);
    expect(model.split("return Math.max(0, view - thumb)").length - 1).toBe(1);
    expect(model).toContain(endNeedle);
  });
});

describe("滚动垫", () => {
  it("起始垫和结束垫不小于 0", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scroller-model.ts"), "utf8");
    const startNeedle = "Math.max(0, " + "paddingStart)";
    const endNeedle = "Math.max(0, " + "paddingEnd)";
    expect(source.split(startNeedle).length - 1).toBe(0);
    expect(source.split(endNeedle).length - 1).toBe(0);
    expect(source).toContain("scrollerPad(paddingStart)");
    expect(source).toContain("scrollerPad(paddingEnd)");
    expect(source.split("function scrollerPad").length - 1).toBe(1);
    expect(source.split("return Math.max(0, value)").length - 1).toBe(3);
    expect(source).toContain("Math.max(0, client - scrollerPad");
    expect(source.split("return Math.max(0, view - thumb)").length - 1).toBe(1);
  });
});

describe("滚动偏移", () => {
  it("滑块几何和夹紧滚动偏移不小于 0", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scroller-model.ts"), "utf8");
    const oldTop = "Math.max(0, " + "input.top)";
    const thumbRatio = "Math.max(0, " + "input.thumbTop / room)";
    expect(source.split(oldTop).length - 1).toBe(0);
    expect(source.split("scrollerOffset(input.top)").length - 1).toBe(2);
    expect(source.split("function scrollerOffset").length - 1).toBe(1);
    expect(source.split("function scrollerPad").length - 1).toBe(1);
    expect(source.split("return Math.max(0, value)").length - 1).toBe(3);
    expect(source.split("return Math.max(0, view - thumb)").length - 1).toBe(1);
    expect(source).toContain("return Math.max(0, all - view)");
    expect(source).toContain(thumbRatio);
  });
});

describe("内容盒边长", () => {
  it("有声明尺时块边和横轴回退不小于 0", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scroller-model.ts"), "utf8");
    const blockNeedle = "Math.max(0, " + "declared.block)";
    const inlineNeedle = "Math.max(0, " + "viewInline)";
    expect(source.split(blockNeedle).length - 1).toBe(0);
    expect(source.split(inlineNeedle).length - 1).toBe(0);
    expect(source).toContain("scrollerExtent(declared.block)");
    expect(source).toContain("scrollerExtent(viewInline)");
    expect(source).toContain("declared.inline != null && declared.inline > 0");
    expect(source.split("function scrollerExtent").length - 1).toBe(1);
    expect(source.split("function scrollerPad").length - 1).toBe(1);
    expect(source.split("return Math.max(0, value)").length - 1).toBe(3);
    expect(source).toContain("Math.max(0, client - scrollerPad");
    expect(source).toContain("return Math.max(0, all - view)");
  });
});
