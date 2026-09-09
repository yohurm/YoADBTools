/**
 * 消息列关键字高亮（纯函数）。无关键字时不要走切段，由视图直接画原文。
 */

export type HighlightPart = string | { mark: string };

export function highlightMessage(msg: string, keyword: string): HighlightPart[] {
  if (!keyword) return [msg];
  const lower = msg.toLowerCase();
  const needle = keyword.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle, cursor);
  while (index >= 0) {
    if (index > cursor) parts.push(msg.slice(cursor, index));
    parts.push({ mark: msg.slice(index, index + needle.length) });
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < msg.length) parts.push(msg.slice(cursor));
  return parts;
}
