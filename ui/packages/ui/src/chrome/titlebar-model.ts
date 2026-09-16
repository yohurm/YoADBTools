/**
 * 窗口标题栏领域模型（L2）。
 * 品牌优先位图；三键是窗口铬，不是工具栏按钮。
 * 不碰 DOM、不判定双击命中。
 */

export type TitleBarCaptions = "trailing" | "native";
export type TitleBarBrand = "logo" | "icon" | "none";
export type TitleBarCaptionKind = "min" | "max" | "close";
export type TitleBarCaptionPaint = "window" | "close";
export type TitleBarMaxAction = "maximize" | "restore";

export const TITLEBAR_CAPTION_KINDS = ["min", "max", "close"] as const;

export interface TitleBarInput {
  logoSrc?: string;
  icon?: string;
  nativeCaptions?: boolean;
  maximized?: boolean;
}

export interface TitleBarSpec {
  captions: TitleBarCaptions;
  brand: TitleBarBrand;
  maxAction: TitleBarMaxAction;
  showCaptions: boolean;
}

export function resolveTitleBarBrand(input: Pick<TitleBarInput, "logoSrc" | "icon">): TitleBarBrand {
  if (input.logoSrc) return "logo";
  if (input.icon) return "icon";
  return "none";
}

export function resolveTitleBarSpec(input: TitleBarInput): TitleBarSpec {
  const native = input.nativeCaptions === true;
  return {
    captions: native ? "native" : "trailing",
    brand: resolveTitleBarBrand(input),
    maxAction: input.maximized ? "restore" : "maximize",
    showCaptions: !native,
  };
}

export function captionPaint(kind: TitleBarCaptionKind): TitleBarCaptionPaint {
  return kind === "close" ? "close" : "window";
}
