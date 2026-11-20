import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import type { SessionFilter } from "../filter";
import { applyAppend, panelFromLines, SESSION_NEVER_STARTED, signalCountOf } from "./log-window-reducer";
import type { ViewRow } from "../stack";
import { collapseStack } from "../stack";

const line = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "2026-01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: `m${seq}`,
  ...over,
});

const all: SessionFilter = {
  levels: [],
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
};

function rows(...seqs: number[]): ViewRow[] {
  return collapseStack(seqs.map((seq) => line(seq)));
}

describe("log-window-reducer：连续 seq 契约", () => {
  it("连续命中无空洞：追加且 following 时 pending 归零", () => {
    const out = applyAppend({
      visible: rows(0, 1),
      lines: [line(2), line(3)],
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(out?.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    expect(out?.gap).toBeUndefined();
    expect(out?.pendingCount).toBe(0);
  });

  it("首 seq 越过已画末行 → 报空洞区间（供装配层回环补齐）", () => {
    const out = applyAppend({
      visible: rows(0, 1),
      lines: [line(4)],
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    // 已画末行 1，命中首 4 → 缺 2、3
    expect(out?.gap).toEqual({ fromSeq: 2, toSeq: 3 });
    expect(out?.visible.map((r) => r.line.seq)).toEqual([0, 1, 4]);
  });

  it("空文档首次命中 seq0 不算空洞（after = fromSeq-1）", () => {
    const out = applyAppend({
      visible: [],
      lines: [line(0)],
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(out?.gap).toBeUndefined();
  });

  it("暂停 / 未开始不产出更新", () => {
    const paused = applyAppend({
      visible: rows(0),
      lines: [line(1)],
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      paused: true,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(paused).toBeNull();
    const never = applyAppend({
      visible: [],
      lines: [line(0)],
      fromSeq: SESSION_NEVER_STARTED,
      following: true,
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(never).toBeNull();
  });

  it("panelFromLines + signalCountOf 单一派生", () => {
    const visible = panelFromLines(
      [line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }), line(1)],
      100,
    );
    expect(signalCountOf(visible)).toBe(1);
  });
});
