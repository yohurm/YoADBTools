/**
 * Markup 名：paint → ::highlight() 身份。不碰 DOM、不写色值。
 */

import { markupPaintIsInk, markupPaintIsMark, markupPaintIsWash, type MarkupPaint } from "./markup-model";

export const MARKUP_MARK_NAME = "yohu-log-mark";

const VAR_RE = /^var\((--yohu-[A-Za-z0-9-]+)\)$/;

export function markupTokenId(cssVar: string): string | null {
  const match = VAR_RE.exec(cssVar.trim());
  if (!match) {
    return null;
  }
  return match[1]!.slice("--yohu-".length);
}

export function markupHighlightName(paint: MarkupPaint): string | null {
  if (markupPaintIsMark(paint)) {
    return MARKUP_MARK_NAME;
  }
  if (markupPaintIsInk(paint)) {
    const id = markupTokenId(paint.color);
    return id ? `yohu-ink-${id}` : null;
  }
  if (!markupPaintIsWash(paint)) return null;
  const id = markupTokenId(paint.background);
  return id ? `yohu-wash-${id}` : null;
}

export type NamedMarkupRun = { from: number; to: number; name: string };

export function nameMarkupRuns(
  runs: readonly { from: number; to: number; paint: MarkupPaint }[],
): NamedMarkupRun[] {
  const out: NamedMarkupRun[] = [];
  for (const run of runs) {
    const name = markupHighlightName(run.paint);
    if (!name) {
      continue;
    }
    out.push({ from: run.from, to: run.to, name });
  }
  return out;
}
