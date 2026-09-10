/**
 * 窗口标题栏策略（L3）。
 * 三键文案 / 涂装 / 双击是否落到控件，从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  captionPaint,
  resolveTitleBarSpec,
  type TitleBarCaptionKind,
  type TitleBarCaptionPaint,
  type TitleBarCaptions,
  type TitleBarInput,
  type TitleBarSpec,
} from "./titlebar-model";

export type TitleBarCaptionIcon = "window-min" | "window-max" | "window-restore" | "close";

export interface TitleBarHostAttrs {
  "data-captions": TitleBarCaptions;
  "data-brand": TitleBarSpec["brand"];
}

export interface TitleBarCaptionButton {
  kind: TitleBarCaptionKind;
  paint: TitleBarCaptionPaint;
  label: string;
  icon: TitleBarCaptionIcon;
}

export function titlebarHostAttrs(input: TitleBarInput): TitleBarHostAttrs {
  const spec = resolveTitleBarSpec(input);
  return {
    "data-captions": spec.captions,
    "data-brand": spec.brand,
  };
}

export function titlebarCaptionButtons(spec: TitleBarSpec): TitleBarCaptionButton[] {
  const restore = spec.maxAction === "restore";
  return [
    { kind: "min", paint: captionPaint("min"), label: "最小化", icon: "window-min" },
    {
      kind: "max",
      paint: captionPaint("max"),
      label: restore ? "还原" : "最大化",
      icon: restore ? "window-restore" : "window-max",
    },
    { kind: "close", paint: captionPaint("close"), label: "关闭", icon: "close" },
  ];
}

/** 点在按钮/链/输入上不触发双击最大化。 */
export function isCaptionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input") !== null;
}
