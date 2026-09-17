/**
 * 子标题领域模型（L2）。
 * 对照 HarmonyOS SubHeader + 标题栏 titleStyle：
 *   主标题 / 内容型 = font_primary；列表型 / 副标题 = font_secondary。
 * 三级字不是标题（对比不够 3:1，也不是官方 secondaryTitle）。
 * meta 贴标题；actions 才是行尾。不碰 DOM。
 */

export type YoSubheaderTone = "list" | "content";
export type YoSubheaderPad = "section" | "flush";
export type SubheaderInk = "--yohu-fg" | "--yohu-fg-2";

export const DEFAULT_SUBHEADER_TONE: YoSubheaderTone = "list";
export const DEFAULT_SUBHEADER_PAD: YoSubheaderPad = "section";
export const SUBHEADER_LIST_INK: SubheaderInk = "--yohu-fg-2";
export const SUBHEADER_CONTENT_INK: SubheaderInk = "--yohu-fg";

export interface SubheaderInput {
  title: string;
  tone?: YoSubheaderTone;
  pad?: YoSubheaderPad;
  hasMeta?: boolean;
}

export interface SubheaderSpec {
  title: string;
  tone: YoSubheaderTone;
  pad: YoSubheaderPad;
  hasMeta: boolean;
  ink: SubheaderInk;
}

export function resolveSubheaderInk(tone: YoSubheaderTone): SubheaderInk {
  return tone === "content" ? SUBHEADER_CONTENT_INK : SUBHEADER_LIST_INK;
}

export function resolveSubheaderSpec(input: SubheaderInput): SubheaderSpec {
  const tone = input.tone === "content" ? "content" : DEFAULT_SUBHEADER_TONE;
  return {
    title: input.title,
    tone,
    pad: input.pad === "flush" ? "flush" : DEFAULT_SUBHEADER_PAD,
    hasMeta: Boolean(input.hasMeta),
    ink: resolveSubheaderInk(tone),
  };
}
