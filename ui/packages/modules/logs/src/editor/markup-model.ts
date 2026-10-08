/**
 * MarkupModel 对照：Document 偏移上的着色 run。
 * 不碰 DOM / 选区 / 关键字。选区是原生 Selection；检索是 highlight.ts。
 * 不 import format / document。着色调走 token-tone。
 */

import { washSpanOpen } from "./markup-wash";
import { tokenToneIsInk, tokenToneIsWash, type TokenTone } from "./token-tone";

export type MarkupInk = { kind: "ink"; color: string };
export type MarkupWash = { kind: "wash"; color: string; background: string };
export type MarkupMark = { kind: "mark" };
export type MarkupPaint = MarkupInk | MarkupWash | MarkupMark;

export function markupPaintIsMark(paint: MarkupPaint): paint is MarkupMark {
  return paint.kind === "mark";
}

export function markupPaintIsInk(paint: MarkupPaint): paint is MarkupInk {
  return paint.kind === "ink";
}

/** 级别底。几何交给 wash，不是 ::highlight 的 ink。 */
export function markupPaintIsWash(paint: MarkupPaint): paint is MarkupWash {
  return paint.kind === "wash";
}

export type MarkupRun = {
  from: number;
  to: number;
  paint: MarkupPaint;
};

export function markupWashCells(
  runs: readonly MarkupRun[],
): { from: number; to: number; fill: string }[] {
  const cells: { from: number; to: number; fill: string }[] = [];
  for (const run of runs) {
    if (!markupPaintIsWash(run.paint)) continue;
    cells.push({ from: run.from, to: run.to, fill: run.paint.background });
  }
  return cells;
}

/** Formatter range 的着色面。 */
export type MarkupSourceRange = {
  start: number;
  end: number;
  tone?: TokenTone;
  style?: {
    "--yohu-log-ink"?: string;
    "--yohu-log-level-fg"?: string;
    "--yohu-log-level-bg"?: string;
  };
};

function paintOf(range: MarkupSourceRange): MarkupPaint | null {
  if (tokenToneIsInk(range.tone)) {
    const color = range.style?.["--yohu-log-ink"];
    return color ? { kind: "ink", color } : null;
  }
  if (tokenToneIsWash(range.tone)) {
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
    if (!paint || !washSpanOpen(range.start, range.end)) {
      continue;
    }
    out.push({ from: range.start, to: range.end, paint });
  }
  return out;
}
