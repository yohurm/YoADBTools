import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import {
  applyAppend,
  canFreezeFollow,
  isFreshLine,
  keepMatching,
  lastSeqOf,
  mirrorCoversRange,
  nextDiscardFromSeq,
  panelFromLines,
  projectWindow,
  selectHits,
  seqBefore,
  signalCountOf,
  splitHitsForFreeze,
  trimRows,
  viewCeiling,
} from "./panel";
import { collapseStack, type SessionFilter } from "./pipeline";

const line = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "2026-01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const all: SessionFilter = {
  levels: [],
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
};

describe("panel 游标", () => {
  it("seqBefore / lastSeqOf / isFreshLine", () => {
    expect(seqBefore(0)).toBe(-1);
    expect(seqBefore(-1)).toBe(-1);
    expect(lastSeqOf([], 0)).toBe(-1);
    expect(lastSeqOf([], -1)).toBe(-1);
    expect(lastSeqOf(collapseStack([line(4)]), 0)).toBe(4);
    expect(isFreshLine(0, -1, 0)).toBe(true);
    expect(isFreshLine(0, 0, 0)).toBe(false);
    expect(canFreezeFollow([])).toBe(false);
    expect(canFreezeFollow(collapseStack([line(0)]))).toBe(true);
    expect(isFreshLine(1, 0, 2)).toBe(false);
  });

  it("清空把 fromSeq 推过已见与镜像末 seq", () => {
    expect(nextDiscardFromSeq(0, 4, 9)).toBe(10);
    expect(nextDiscardFromSeq(0, undefined, 9)).toBe(10);
    expect(nextDiscardFromSeq(3, 1, 1)).toBe(3);
    expect(nextDiscardFromSeq(-1, 4, 9)).toBe(-1);
  });

  it("镜像覆盖：有行且末 seq 仍在游标范围内", () => {
    expect(mirrorCoversRange(3, 9, 0)).toBe(true);
    expect(mirrorCoversRange(3, 9, 10)).toBe(false);
    expect(mirrorCoversRange(0, 9, 0)).toBe(false);
    expect(mirrorCoversRange(3, 9, -1)).toBe(false);
  });

  it("跟滚无 ceiling；冻结用 frozenThroughSeq", () => {
    expect(viewCeiling(true, 4)).toBeNull();
    expect(viewCeiling(false, 4)).toBe(4);
    expect(viewCeiling(false, null)).toBeNull();
  });
});

describe("panel 选择", () => {
  it("trimRows 只裁尾部容量", () => {
    const rows = collapseStack([line(0), line(1), line(2)]);
    expect(trimRows(rows, 2).map((r) => r.line.seq)).toEqual([1, 2]);
    expect(trimRows(rows, 10)).toHaveLength(3);
  });

  it("keepMatching 从已有面板筛选，不依赖镜像", () => {
    const rows = collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]);
    expect(keepMatching(rows, { ...all, levels: ["E"] }).map((l) => l.seq)).toEqual([1]);
  });

  it("splitHitsForFreeze：跟滚全进面板；冻结则 ceiling 以外计 pending", () => {
    const hits = [line(0), line(1), line(2)];
    expect(splitHitsForFreeze(hits, null).pending).toBe(0);
    expect(splitHitsForFreeze(hits, null).forPanel.map((l) => l.seq)).toEqual([0, 1, 2]);
    const frozen = splitHitsForFreeze(hits, 1);
    expect(frozen.forPanel.map((l) => l.seq)).toEqual([0, 1]);
    expect(frozen.pending).toBe(1);
  });

  it("selectHits 丢弃 fromSeq 之前的行", () => {
    const { forPanel, pending } = selectHits([line(0), line(1), line(2)], 1, null, all);
    expect(forPanel.map((l) => l.seq)).toEqual([1, 2]);
    expect(pending).toBe(0);
  });
});

describe("projectWindow", () => {
  it("镜像覆盖时按游标全量投影，不保留已画但已失效的行", () => {
    const drawn = collapseStack([line(0, { msg: "old" })]);
    const next = projectWindow({
      drawn,
      source: [line(1, { msg: "a" }), line(2, { msg: "b" })],
      sourceCoversRange: true,
      fromSeq: 1,
      following: true,
      frozenThroughSeq: null,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(next.visible.map((r) => r.line.msg)).toEqual(["a", "b"]);
  });

  it("镜像覆盖时放松过滤从源补回中间行", () => {
    const next = projectWindow({
      drawn: collapseStack([line(1, { msg: "hello" })]),
      source: [line(0, { msg: "a" }), line(1, { msg: "hello" }), line(2, { msg: "c" })],
      sourceCoversRange: true,
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(next.visible.map((r) => r.line.msg)).toEqual(["a", "hello", "c"]);
  });

  it("镜像不覆盖时只收窄已画行，不冲成空", () => {
    const drawn = collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]);
    const next = projectWindow({
      drawn,
      source: [],
      sourceCoversRange: false,
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      filter: { ...all, levels: ["E"] },
      cap: 100,
      pendingCount: 3,
    });
    expect(next.visible.map((r) => r.line.seq)).toEqual([1]);
    expect(next.pendingCount).toBe(3);
  });
});

describe("applyAppend", () => {
  it("跟滚追加并按容量裁剪", () => {
    const next = applyAppend({
      visible: collapseStack([line(0)]),
      lines: [line(1), line(2)],
      fromSeq: 0,
      following: true,
      paused: false,
      filter: all,
      cap: 2,
      pendingCount: 0,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([1, 2]);
    expect(next?.pendingCount).toBe(0);
  });

  it("空面板即使未跟滚也入镜，避免 pending 与等待空态并存", () => {
    const next = applyAppend({
      visible: [],
      lines: [line(0), line(1)],
      fromSeq: 0,
      following: false,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 8,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(next?.pendingCount).toBe(0);
  });

  it("未跟滚只加 pending", () => {
    const next = applyAppend({
      visible: collapseStack([line(0)]),
      lines: [line(1)],
      fromSeq: 0,
      following: false,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 2,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([0]);
    expect(next?.pendingCount).toBe(3);
  });

  it("暂停或未订阅不写面板", () => {
    expect(
      applyAppend({
        visible: [],
        lines: [line(0)],
        fromSeq: 0,
        following: true,
        paused: true,
        filter: all,
        cap: 100,
        pendingCount: 0,
      }),
    ).toBeNull();
    expect(
      applyAppend({
        visible: [],
        lines: [line(0)],
        fromSeq: -1,
        following: true,
        paused: false,
        filter: all,
        cap: 100,
        pendingCount: 0,
      }),
    ).toBeNull();
  });

  it("清空后的游标拒绝旧 seq", () => {
    const next = applyAppend({
      visible: [],
      lines: [line(0), line(1), line(5)],
      fromSeq: 5,
      following: true,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([5]);
  });
});

describe("panel 派生", () => {
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
