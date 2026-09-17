/**
 * 子标题领域模型（L2）。
 * 对照 HarmonyOS SubHeader：列表子标题小字低对比；内容子标题更重。
 * meta 贴标题；actions 才是行尾。不碰 DOM。
 */

export type YoSubheaderTone = "list" | "content";
export type YoSubheaderPad = "section" | "flush";

export const DEFAULT_SUBHEADER_TONE: YoSubheaderTone = "list";
export const DEFAULT_SUBHEADER_PAD: YoSubheaderPad = "section";

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
}

export function resolveSubheaderSpec(input: SubheaderInput): SubheaderSpec {
  return {
    title: input.title,
    tone: input.tone === "content" ? "content" : DEFAULT_SUBHEADER_TONE,
    pad: input.pad === "flush" ? "flush" : DEFAULT_SUBHEADER_PAD,
    hasMeta: Boolean(input.hasMeta),
  };
}
