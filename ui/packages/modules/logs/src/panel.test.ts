import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import {
  applyAppend,
  canFreezeFollow,
  EMPTY_VIEW_ROWS,
  effectiveFollowing,
  freezePoint,
  isFreshLine,
  keepMatching,
  lastSeqOf,
  nextDiscardFromSeq,
  panelFollows,
  panelFromLines,
  captureStarted,
  seqBefore,
  signalCountOf,
  trimRows,
} from "./panel";
import type { SessionFilter } from "./filter";
import { collapseStack } from "./stack";
import { EXPORT_NEEDS_CAPTURE, sessionHasCapture } from "./workspace";

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
    expect(panelFollows(false, [])).toBe(true);
    expect(panelFollows(true, [])).toBe(true);
    expect(panelFollows(false, collapseStack([line(0)]))).toBe(false);
    expect(isFreshLine(1, 0, 2)).toBe(false);
    expect(freezePoint(null, 7)).toBe(7);
    expect(freezePoint(3, 7)).toBe(7);
    expect(freezePoint(9, 7)).toBe(9);
    expect(effectiveFollowing(true, false)).toBe(true);
    expect(effectiveFollowing(true, true)).toBe(false);
    expect(effectiveFollowing(false, false)).toBe(false);
  });

  it("清空把 fromSeq 推过已见与镜像末 seq", () => {
    expect(nextDiscardFromSeq(0, 4, 9)).toBe(10);
    expect(nextDiscardFromSeq(0, undefined, 9)).toBe(10);
    expect(nextDiscardFromSeq(3, 1, 1)).toBe(3);
    expect(nextDiscardFromSeq(-1, 4, 9)).toBe(-1);
  });
});

describe("panel 选择", () => {
  it("trimRows 只裁尾部容量；未超 cap 保持同一引用", () => {
    const rows = collapseStack([line(0), line(1), line(2)]);
    expect(trimRows(rows, 2).map((r) => r.line.seq)).toEqual([1, 2]);
    expect(trimRows(rows, 10)).toBe(rows);
    expect(
      applyAppend({
        visible: rows,
        lines: [],
        fromSeq: 0,
        following: true,
        frozenThroughSeq: null,
        paused: false,
        filter: all,
        cap: 10,
        pendingCount: 3,
      })?.visible,
    ).toBe(rows);
    expect(
      applyAppend({
        visible: rows,
        lines: [],
        fromSeq: 0,
        following: true,
        frozenThroughSeq: null,
        paused: false,
        filter: all,
        cap: 10,
        pendingCount: 0,
      }),
    ).toBeNull();
  });

  it("keepMatching 从已有面板筛选，不依赖镜像", () => {
    const rows = collapseStack([line(0, { level: "I" }), line(1, { level: "E" })]);
    expect(keepMatching(rows, { ...all, levels: ["E"] }).map((l) => l.seq)).toEqual([1]);
  });

  it("空投影同一引用", () => {
    expect(panelFromLines([], 8)).toBe(EMPTY_VIEW_ROWS);
    expect(panelFromLines([], 100)).toBe(EMPTY_VIEW_ROWS);
  });
});

describe("applyAppend", () => {
  it("跟滚追加并按容量裁剪", () => {
    const next = applyAppend({
      visible: collapseStack([line(0)]),
      lines: [line(1), line(2)],
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
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
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 8,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(next?.pendingCount).toBe(0);
  });

  it("未跟滚仍写入文档并累计 pending", () => {
    const next = applyAppend({
      visible: collapseStack([line(0)]),
      lines: [line(1)],
      fromSeq: 0,
      following: false,
      frozenThroughSeq: 0,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 2,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(next?.pendingCount).toBe(3);
  });

  it("冻结点之前的回补不入 pending，只有冻结点之后新到的才计数", () => {
    const next = applyAppend({
      visible: collapseStack([line(0)]),
      lines: [line(1), line(2), line(5)],
      fromSeq: 0,
      following: false,
      frozenThroughSeq: 2,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 4,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 5]);
    expect(next?.pendingCount).toBe(5);
  });

  it("暂停或未订阅不写面板", () => {
    expect(
      applyAppend({
        visible: [],
        lines: [line(0)],
        fromSeq: 0,
        following: true,
        frozenThroughSeq: null,
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
        frozenThroughSeq: null,
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
      frozenThroughSeq: null,
      paused: false,
      filter: all,
      cap: 100,
      pendingCount: 0,
    });
    expect(next?.visible.map((r) => r.line.seq)).toEqual([5]);
  });
});

describe("panel 派生", () => {
  it("panelFromLines 折叠行；信号计数由 signalCountOf 单点派生", () => {
    const visible = panelFromLines(
      [line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" })],
      100,
    );
    expect(visible).toHaveLength(1);
    expect(signalCountOf(visible)).toBe(1);
  });

  it("信号计数跟裁剪后的可见行，不累计已滚出的崩溃", () => {
    const visible = panelFromLines(
      [
        line(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
        line(1, { msg: "ok" }),
        line(2, { msg: "still ok" }),
      ],
      2,
    );
    expect(visible.map((r) => r.line.seq)).toEqual([1, 2]);
    expect(signalCountOf(visible)).toBe(0);
  });
});

describe("跟滚抬起只写一处", () => {
  it("会话和视图不再自己或上空面板", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const panel = readFileSync(resolve(here, "stream/log-window-reducer.ts"), "utf8").replace(
      "return following || !canFreezeFollow(visible);",
      "",
    );
    expect(panel).not.toContain("|| !canFreezeFollow");
    expect(readFileSync(resolve(here, "workspace.ts"), "utf8")).not.toContain("|| !canFreezeFollow");
    const view = readFileSync(resolve(here, "LogAnalyzerView.tsx"), "utf8");
    expect(view).not.toContain("rows.length > 0");
  });
});

describe("sessionHasCapture", () => {
  it("没设备或从未开始都不能导出", () => {
    expect(captureStarted(-1)).toBe(false);
    expect(captureStarted(0)).toBe(true);
    expect(sessionHasCapture(null)).toBe(false);
    expect(sessionHasCapture({ serial: null, fromSeq: 0 })).toBe(false);
    expect(sessionHasCapture({ serial: "S1", fromSeq: -1 })).toBe(false);
    expect(sessionHasCapture({ serial: "S1", fromSeq: 0 })).toBe(true);
    expect(EXPORT_NEEDS_CAPTURE).toBe("请先选择设备并采集日志");
  });
});

describe("没有新行只判一次", () => {
  it("no_lines_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "stream/log-window-reducer.ts"), "utf8");
    const needle = "lines.length " + "=== 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("noLines(");
  });
});

describe("冻结上限只有一源", () => {
  it("panel 消费 follow-state 的 frozenThroughSeq，不再用已画末行当第二份上限", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "stream/log-window-reducer.ts"), "utf8");
    expect(body).toContain("freezePoint(opts.frozenThroughSeq, after)");
    expect(body).not.toContain("frozenThroughSeq === null ? Number.POSITIVE_INFINITY");
  });
});
