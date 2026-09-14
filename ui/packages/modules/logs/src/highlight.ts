/**
 * 消息列关键字高亮（纯函数）。无关键字时不要走切段，由视图直接画原文。
 * 查找与过滤同一套 ASCII A–Z 折叠；切片取原文。
 */

import { indexOfAsciiIgnoreCase } from "./filter";

export type HighlightPart = string | { mark: string };

export function highlightMessage(msg: string, keyword: string): HighlightPart[] {
  if (!keyword) return [msg];
  const parts: HighlightPart[] = [];
  let cursor = 0;
  let index = indexOfAsciiIgnoreCase(msg, keyword, cursor);
  while (index >= 0) {
    if (index > cursor) parts.push(msg.slice(cursor, index));
    parts.push({ mark: msg.slice(index, index + keyword.length) });
    cursor = index + keyword.length;
    index = indexOfAsciiIgnoreCase(msg, keyword, cursor);
  }
  if (cursor < msg.length) parts.push(msg.slice(cursor));
  return parts;
}
