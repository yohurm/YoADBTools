/**
 * CSS Custom Highlight 登记。零产品类型：只认 name + Range。
 * 多行共用同一 Highlight 桶；卸载时按 Range 退订。
 */

import type { NamedMarkupRun } from "./markup-policy";

type HighlightLike = {
  add(range: AbstractRange): void;
  delete(range: AbstractRange): void;
  readonly size: number;
};

type HighlightCtor = new () => HighlightLike;

type HighlightMap = {
  set(name: string, highlight: HighlightLike): void;
  delete(name: string): boolean;
};

type HighlightBucket = { highlight: HighlightLike };

const buckets = new Map<string, HighlightBucket>();

function engine(): { Highlight: HighlightCtor; highlights: HighlightMap } | null {
  const ctor = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  const highlights = (globalThis as { CSS?: { highlights?: HighlightMap } }).CSS?.highlights;
  if (!ctor || !highlights) {
    return null;
  }
  return { Highlight: ctor, highlights };
}

function bucket(name: string): HighlightBucket | null {
  const api = engine();
  if (!api) {
    return null;
  }
  const existing = buckets.get(name);
  if (existing) {
    return existing;
  }
  const highlight = new api.Highlight();
  api.highlights.set(name, highlight);
  const next = { highlight };
  buckets.set(name, next);
  return next;
}

function release(name: string, range: AbstractRange): void {
  const current = buckets.get(name);
  if (!current) {
    return;
  }
  current.highlight.delete(range);
  if (current.highlight.size > 0) {
    return;
  }
  engine()?.highlights.delete(name);
  buckets.delete(name);
}

/** 把 run 绑到一个 Text 节点。无 Highlight 引擎时零操作（不做 span 回退）。 */
export function bindMarkupRuns(textNode: Text, runs: readonly NamedMarkupRun[]): () => void {
  const stops: (() => void)[] = [];
  const len = textNode.data.length;
  for (const run of runs) {
    const from = Math.max(0, Math.min(run.from, len));
    const to = Math.max(from, Math.min(run.to, len));
    if (to <= from) {
      continue;
    }
    const owned = bucket(run.name);
    if (!owned) {
      continue;
    }
    const range = document.createRange();
    range.setStart(textNode, from);
    range.setEnd(textNode, to);
    owned.highlight.add(range);
    const name = run.name;
    stops.push(() => release(name, range));
  }
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
