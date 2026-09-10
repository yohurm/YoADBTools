import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { appendLines, isFreshLine, keepMatching, lastSeqOf, mergeLinesBySeq, panelFromLines, rebuildFiltered, seqBefore, signalCountOf, splitHitsForFreeze, trimRows } from "./panel";
import { collapseStack, type SessionFilter } from "./pipeline";

const line = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const all: SessionFilter = {
  minLevel: null,
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
};

describe("panel", () => {
  it("seqBefore / lastSeqOf / isFreshLine", () => {
    expect(seqBefore(0)).toBe(-1);
    expect(seqBefore(-1)).toBe(-1);
    expect(lastSeqOf([], 0)).toBe(-1);
    expect(lastSeqOf([], -1)).toBe(-1);
    expect(lastSeqOf(collapseStack([line(4)]), 0)).toBe(4);
    expect(isFreshLine(0, -1, 0)).toBe(true);
    expect(isFreshLine(0, 0, 0)).toBe(false);
    expect(isFreshLine(1, 0, 2)).toBe(false);
  });

  it("trimRows 只裁尾部容量", () => {
    const rows = collapseStack([line(0), line(1), line(2)]);
    expect(trimRows(rows, 2).map((r) => r.line.seq)).toEqual([1, 2]);
    expect(trimRows(rows, 10)).toHaveLength(3);
  });

  it("keepMatching 从已有面板筛选，不依赖镜像", () => {
    const rows = collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]);
    expect(keepMatching(rows, { ...all, minLevel: "E" }).map((l) => l.seq)).toEqual([1]);
  });

  it("mergeLinesBySeq 按 seq 合并去重，同 seq 取右侧", () => {
    expect(mergeLinesBySeq([line(0), line(2)], [line(1), line(2, { msg: "newer" })]).map((l) => [l.seq, l.msg])).toEqual([
      [0, "m"],
      [1, "m"],
      [2, "newer"],
    ]);
  });

  it("rebuildFiltered 从镜像补回中间被筛掉的行，不清空已画行", () => {
    const drawn = collapseStack([line(1, { msg: "hello" })]);
    const restored = rebuildFiltered(drawn, [line(0, { msg: "a" }), line(1, { msg: "hello" }), line(2, { msg: "c" })], all, 100);
    expect(restored.visible.map((r) => r.line.msg)).toEqual(["a", "hello", "c"]);

    const tightened = rebuildFiltered(
      collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]),
      [],
      { ...all, minLevel: "E" },
      100,
    );
    expect(tightened.visible.map((r) => r.line.seq)).toEqual([1]);
  });

  it("splitHitsForFreeze：跟滚全进面板；冻结则 ceiling 以外计 pending", () => {
    const hits = [line(0), line(1), line(2)];
    expect(splitHitsForFreeze(hits, null).pending).toBe(0);
    expect(splitHitsForFreeze(hits, null).forPanel.map((l) => l.seq)).toEqual([0, 1, 2]);
    const frozen = splitHitsForFreeze(hits, 1);
    expect(frozen.forPanel.map((l) => l.seq)).toEqual([0, 1]);
    expect(frozen.pending).toBe(1);
  });

  it("appendLines 在末尾追加并按容量裁剪", () => {
    const current = collapseStack([line(0)]);
    const next = appendLines(current, [line(1), line(2)], 2);
    expect(next.map((r) => r.line.seq)).toEqual([1, 2]);
  });

  it("panelFromLines 折叠并计数信号", () => {
    const { visible, signalCount } = panelFromLines(
      [line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" })],
      100,
    );
    expect(visible).toHaveLength(1);
    expect(signalCount).toBe(1);
  });

  it("信号计数跟裁剪后的可见行，不累计已滚出的崩溃", () => {
    const { visible, signalCount } = panelFromLines(
      [
        line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
        line(1, { msg: "ok" }),
        line(2, { msg: "still ok" }),
      ],
      2,
    );
    expect(visible.map((r) => r.line.seq)).toEqual([1, 2]);
    expect(signalCount).toBe(0);
    expect(signalCountOf(visible)).toBe(0);
  });
});
