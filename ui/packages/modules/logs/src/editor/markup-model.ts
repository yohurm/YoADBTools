/**
 * MarkupModel 对照：Document 偏移上的着色 run。
 * 不碰 DOM / 选区 / 关键字。选区是原生 Selection；检索是 highlight.ts。
 */

export type MarkupInk = { kind: "ink"; color: string };
export type MarkupWash = { kind: "wash"; color: string; background: string };
export type MarkupMark = { kind: "mark" };
export type MarkupPaint = MarkupInk | MarkupWash | MarkupMark;

export type MarkupRun = {
  from: number;
  to: number;
  paint: MarkupPaint;
};

/** Formatter range 的着色面。本文件不 import format / document。 */
export type MarkupSourceRange = {
  start: number;
  end: number;
  tone?: "plain" | "ink" | "wash";
  style?: {
    "--yohu-log-ink"?: string;
    "--yohu-log-level-fg"?: string;
    "--yohu-log-level-bg"?: string;
  };
};

function paintOf(range: MarkupSourceRange): MarkupPaint | null {
  if (range.tone === "ink") {
    const color = range.style?.["--yohu-log-ink"];
    return color ? { kind: "ink", color } : null;
  }
  if (range.tone === "wash") {
    const color = range.style?.["--yohu-log-level-fg"];
    const background = range.style?.["--yohu-log-level-bg"];
    return color && background ? { kind: "wash", color, background } : null;
  }
  return null;
}

/** Formatter range → 着色 run。plain / 空段不进 Markup。 */
export function markupRunsFromRanges(ranges: readonly MarkupSourceRange[]): MarkupRun[] {
  const out: MarkupRun[] = [];
  for (const range of ranges) {
    const paint = paintOf(range);
    if (!paint || range.end <= range.start) {
      continue;
    }
    out.push({ from: range.start, to: range.end, paint });
  }
  return out;
}
