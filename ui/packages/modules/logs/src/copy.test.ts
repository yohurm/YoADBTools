import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import {
  applyCopyEvent,
  copyHasPayload,
  intersectingRowSeqs,
  linesForCopy,
  pickFromSelection,
  serializeLogCopy,
} from "./copy";
import { formatLogLine } from "./format";
import type { ViewRow } from "./stack";

function line(over: Partial<LogLine> = {}): LogLine {
  return {
    seq: 1,
    ts: "01-01 12:00:00.000",
    pid: 100,
    tid: 200,
    level: "I",
    tag: "Yohu",
    msg: "hello",
    ...over,
  };
}

function row(over: Partial<LogLine> = {}): ViewRow {
  return { line: line(over) };
}

function mountRows(seqs: readonly number[], wrapVirtual = false): HTMLElement {
  const root = document.createElement("div");
  for (const seq of seqs) {
    const host = document.createElement("div");
    if (wrapVirtual) host.className = "yohu-virtual-list__row";
    const rowEl = document.createElement("div");
    rowEl.className = "yohu-logs__row";
    rowEl.setAttribute("data-seq", String(seq));
    const ts = document.createElement("span");
    ts.textContent = "01-01";
    const pid = document.createElement("span");
    pid.textContent = String(seq);
    const msg = document.createElement("span");
    msg.textContent = `消息${seq}`;
    rowEl.append(ts, pid, msg);
    host.append(rowEl);
    root.append(wrapVirtual ? host : rowEl);
  }
  document.body.append(root);
  return root;
}

function selectBetween(a: Node, b: Node): Selection {
  const range = document.createRange();
  range.setStartBefore(a);
  range.setEndAfter(b);
  const sel = window.getSelection();
  if (!sel) throw new Error("no selection");
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

describe("intersectingRowSeqs / pickFromSelection", () => {
  it("折叠或清单外选区不收行", () => {
    const root = mountRows([1]);
    const outside = document.createTextNode("other");
    document.body.append(outside);
    const collapsed = {
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: root.firstChild,
      focusNode: root.firstChild,
    } as unknown as Selection;
    const outSel = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: outside,
      focusNode: outside,
      getRangeAt: () => document.createRange(),
    } as unknown as Selection;
    expect(intersectingRowSeqs(root, collapsed)).toEqual([]);
    expect(intersectingRowSeqs(root, outSel)).toEqual([]);
    expect(pickFromSelection(root, collapsed)).toBeNull();
    outside.remove();
    root.remove();
  });

  it("相交行收成 seq 闭区间；DOM 只有起止行时复制仍含 visible 中间行", () => {
    const root = mountRows([1, 3]);
    const first = root.querySelector(`[data-seq="1"]`);
    const last = root.querySelector(`[data-seq="3"]`);
    if (!first || !last) throw new Error("rows");
    const scope = pickFromSelection(root, selectBetween(first, last));
    expect(scope).toEqual({ kind: "range", fromSeq: 1, toSeq: 3 });
    const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];
    expect(serializeLogCopy({ scope: scope!, rows })).toBe(
      [formatLogLine(rows[0]!.line), formatLogLine(rows[1]!.line), formatLogLine(rows[2]!.line)].join("\n"),
    );
    expect(window.getSelection()?.toString()).not.toBe(serializeLogCopy({ scope: scope!, rows }));
    root.remove();
  });

  it("虚拟列表行包装也能命中 data-seq", () => {
    const root = mountRows([4, 5], true);
    const first = root.querySelector(`[data-seq="4"]`);
    const last = root.querySelector(`[data-seq="5"]`);
    if (!first || !last) throw new Error("rows");
    expect(pickFromSelection(root, selectBetween(first, last))).toEqual({ kind: "range", fromSeq: 4, toSeq: 5 });
    root.remove();
  });
});

describe("serializeLogCopy", () => {
  const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];

  it("range 按 visible 顺序取出闭区间，补上 DOM 没有的中间行", () => {
    expect(
      serializeLogCopy({
        scope: { kind: "range", fromSeq: 1, toSeq: 3 },
        rows,
      }),
    ).toBe([formatLogLine(rows[0]!.line), formatLogLine(rows[1]!.line), formatLogLine(rows[2]!.line)].join("\n"));
    expect(linesForCopy({ scope: { kind: "range", fromSeq: 3, toSeq: 1 }, rows }).map((l) => l.seq)).toEqual([
      1, 2, 3,
    ]);
  });

  it("all 复制当前窗口全部可见行，不只视口", () => {
    expect(serializeLogCopy({ scope: { kind: "all" }, rows })).toBe(
      rows.map((r) => formatLogLine(r.line)).join("\n"),
    );
  });

  it("无选区时回退一行；空则空串", () => {
    expect(serializeLogCopy({ scope: { kind: "none" }, rows, fallbackLine: rows[1]!.line })).toBe(
      formatLogLine(rows[1]!.line),
    );
    expect(serializeLogCopy({ scope: { kind: "none" }, rows })).toBe("");
    expect(copyHasPayload({ scope: { kind: "none" }, rows })).toBe(false);
    expect(copyHasPayload({ scope: { kind: "all" }, rows })).toBe(true);
  });

  it("含 UID / 无 UID 与 formatLogLine 一致", () => {
    const withUid = line({ uid: "shell", pid: 1705, tid: 1705, level: "W", tag: "binder", msg: "avc" });
    expect(serializeLogCopy({ scope: { kind: "none" }, rows: [], fallbackLine: withUid })).toBe(
      "01-01 12:00:00.000    shell  1705  1705 W binder: avc",
    );
    expect(serializeLogCopy({ scope: { kind: "none" }, rows: [], fallbackLine: line() })).toBe(
      "01-01 12:00:00.000   100   200 I Yohu: hello",
    );
  });
});

describe("applyCopyEvent", () => {
  it("只写 text/plain 并拦截默认（阻止 Grid HTML/碎片）", () => {
    const written: Record<string, string> = {};
    let prevented = false;
    const event = {
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => undefined,
      clipboardData: {
        setData: (type: string, value: string) => {
          written[type] = value;
        },
      },
    } as unknown as ClipboardEvent;
    expect(applyCopyEvent(event, "")).toBe(false);
    expect(prevented).toBe(false);
    expect(applyCopyEvent(event, "01-01 12:00:00.000   100   200 I Yohu: hello")).toBe(true);
    expect(prevented).toBe(true);
    expect(written).toEqual({ "text/plain": "01-01 12:00:00.000   100   200 I Yohu: hello" });
  });
});
