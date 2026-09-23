/**
 * 消息列关键字偏移（纯函数）。不切 DOM、不着色、不认 Formatter。
 * 查找与过滤同一套 ASCII A–Z 折叠。
 */

import { indexOfAsciiIgnoreCase } from "@yohu/api";

export type KeywordRange = { from: number; to: number };

export type KeywordWindow = {
  start: number;
  end: number;
  kind: string;
};

export function keywordRanges(text: string, keyword: string): KeywordRange[] {
  if (!keyword) {
    return [];
  }
  const out: KeywordRange[] = [];
  let cursor = 0;
  let index = indexOfAsciiIgnoreCase(text, keyword, cursor);
  while (index >= 0) {
    out.push({ from: index, to: index + keyword.length });
    cursor = index + keyword.length;
    index = indexOfAsciiIgnoreCase(text, keyword, cursor);
  }
  return out;
}

/** 只在指定 kind 窗口内标关键字；默认消息列。 */
export function keywordRangesInWindows(
  text: string,
  windows: readonly KeywordWindow[],
  keyword: string,
  kind = "msg",
): KeywordRange[] {
  if (!keyword) {
    return [];
  }
  const out: KeywordRange[] = [];
  for (const window of windows) {
    if (window.kind !== kind || window.end <= window.start) {
      continue;
    }
    const slice = text.slice(window.start, window.end);
    for (const hit of keywordRanges(slice, keyword)) {
      out.push({ from: window.start + hit.from, to: window.start + hit.to });
    }
  }
  return out;
}
