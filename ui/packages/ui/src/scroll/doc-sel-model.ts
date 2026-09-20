/**
 * Family A 文档选区带几何。对照 Editor Selection Background：ch 尺铺底，不改字色。
 * 禁止再靠浏览器 ::selection 给着色 span 上色。
 */

export type DocSelBandStyle = {
  left: string;
  width: string;
};

/** left 相对行盒 padding 边。hang 空格已在 Document 文本里，不再另加缩进。 */
export function docSelBandStyle(fromCh: number, chars: number): DocSelBandStyle {
  const from = Math.max(0, Math.floor(fromCh));
  const n = Math.max(0, Math.floor(chars));
  return {
    left: `${from}ch`,
    width: `${n}ch`,
  };
}
