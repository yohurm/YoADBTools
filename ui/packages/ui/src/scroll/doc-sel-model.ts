/**
 * Family A 文档选区带几何。对照 Editor Selection Background：ch 尺铺底，不改字色。
 * 禁止再靠浏览器 ::selection 给着色 span 上色。
 */

export type DocSelBandStyle = {
  left: string;
  width: string;
};

/** hang 是续行前缀 ch；left 相对行盒 padding 边（hang 空档不进文档）。 */
export function docSelBandStyle(fromCh: number, chars: number, hang = 0): DocSelBandStyle {
  const from = Math.max(0, Math.floor(fromCh));
  const n = Math.max(0, Math.floor(chars));
  const indent = Math.max(0, Math.floor(hang));
  return {
    left: `${indent + from}ch`,
    width: `${n}ch`,
  };
}
