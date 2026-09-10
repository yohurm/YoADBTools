import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import {
  applyCopyEvent,
  copyHasPayload,
  documentCopyText,
  mapLogCellOffsetToDoc,
  LOG_COPY_ALL,
  LOG_COPY_NONE,
  seqFromTarget,
  serializeLogCopy,
  textOffsetInRow,
} from "./copy";
import { formatLogLine } from "./format";
import { DEFAULT_LOG_DISPLAY_COLUMNS, logLineCellText, visibleLogColumns } from "./layout";

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

function row(over: Partial<LogLine> = {}): { line: LogLine } {
  return { line: line(over) };
}

function mountDocRows(lines: readonly LogLine[], wrapVirtual = false): HTMLElement {
  const root = document.createElement("div");
  for (const item of lines) {
    const host = document.createElement("div");
    if (wrapVirtual) host.className = "yohu-virtual-list__row";
    const rowEl = document.createElement("div");
    rowEl.className = "yohu-logs__cols yohu-logs__row";
    rowEl.setAttribute("data-seq", String(item.seq));
    for (const col of visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS)) {
      const cell = document.createElement("span");
      cell.className = `yohu-col-cell yohu-logs__row-${col.key}`;
      cell.textContent = logLineCellText(item, col.key);
      rowEl.append(cell);
    }
    host.append(rowEl);
    root.append(wrapVirtual ? host : rowEl);
  }
  document.body.append(root);
  return root;
}

function selectRange(start: Node, startOff: number, end: Node, endOff: number): Selection {
  const range = document.createRange();
  range.setStart(start, startOff);
  range.setEnd(end, endOff);
  const sel = window.getSelection();
  if (!sel) throw new Error("no selection");
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
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

describe("documentCopyText", () => {
  it("折叠或清单外选区不收行", () => {
    const root = mountDocRows([line({ seq: 1 })]);
    const collapsed = {
      isCollapsed: true,
      rangeCount: 0,
    } as unknown as Selection;
    expect(documentCopyText(root, collapsed, [row({ seq: 1 })])).toBe("");
    expect(documentCopyText(root, null, [row({ seq: 1 })])).toBe("");
    root.remove();
  });

  it("单行局部切片等于文档字符，列间空格在文档里", () => {
    const item = line({ seq: 9, msg: "hello" });
    const root = mountDocRows([item]);
    const rowEl = root.querySelector(`[data-seq="9"]`);
    const text = rowEl?.querySelector(".yohu-logs__row-tag")?.firstChild;
    if (!rowEl || !text) throw new Error("row");
    const doc = formatLogLine(item);
    const sel = selectRange(text, 0, text, 4);
    expect(documentCopyText(root, sel, [{ line: item }])).toBe("Yohu");
    expect(doc.includes("   100   200")).toBe(true);
    root.remove();
  });

  it("跨行选整行时中间未挂载行按文档补齐", () => {
    const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];
    const root = mountDocRows([rows[0]!.line, rows[2]!.line]);
    const first = root.querySelector(`[data-seq="1"]`);
    const last = root.querySelector(`[data-seq="3"]`);
    if (!first || !last) throw new Error("rows");
    const text = documentCopyText(root, selectBetween(first, last), rows);
    expect(text).toBe(rows.map((r) => formatLogLine(r.line)).join("\n"));
    expect(window.getSelection()?.toString()).not.toBe(text);
    root.remove();
  });

  it("跨行首行从字符偏移切，末行切到偏移", () => {
    const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];
    const root = mountDocRows([rows[0]!.line, rows[2]!.line]);
    const firstText = root.querySelector(`[data-seq="1"] .yohu-logs__row-msg`)?.firstChild;
    const lastText = root.querySelector(`[data-seq="3"] .yohu-logs__row-msg`)?.firstChild;
    if (!firstText || !lastText) throw new Error("text");
    const firstDoc = formatLogLine(rows[0]!.line);
    const lastDoc = formatLogLine(rows[2]!.line);
    const from = firstDoc.indexOf("one");
    const to = lastDoc.indexOf("three") + 3;
    const text = documentCopyText(root, selectRange(firstText, 0, lastText, 3), rows);
    expect(text).toBe([firstDoc.slice(from), formatLogLine(rows[1]!.line), lastDoc.slice(0, to)].join("\n"));
    root.remove();
  });

  it("虚拟列表行包装也能命中 data-seq", () => {
    const rows = [row({ seq: 4, msg: "a" }), row({ seq: 5, msg: "b" })];
    const root = mountDocRows(rows.map((r) => r.line), true);
    const first = root.querySelector(`[data-seq="4"]`);
    const last = root.querySelector(`[data-seq="5"]`);
    if (!first || !last) throw new Error("rows");
    expect(documentCopyText(root, selectBetween(first, last), rows)).toBe(
      rows.map((r) => formatLogLine(r.line)).join("\n"),
    );
    root.remove();
  });
});

describe("mapLogCellOffsetToDoc", () => {
  it("单元格「100」映射到文档 padStart 后的 PID", () => {
    const item = line();
    const doc = formatLogLine(item);
    const from = mapLogCellOffsetToDoc(item, DEFAULT_LOG_DISPLAY_COLUMNS, "pid", 0);
    const to = mapLogCellOffsetToDoc(item, DEFAULT_LOG_DISPLAY_COLUMNS, "pid", 3);
    expect(doc.slice(from, to)).toBe("100");
  });
});

describe("textOffsetInRow / seqFromTarget", () => {
  it("跳过 data-log-chrome，偏移只计文档", () => {
    const root = document.createElement("div");
    const rowEl = document.createElement("div");
    rowEl.setAttribute("data-seq", "7");
    rowEl.append("hello");
    const chrome = document.createElement("span");
    chrome.setAttribute("data-log-chrome", "");
    chrome.textContent = "折叠";
    rowEl.append(chrome);
    root.append(rowEl);
    document.body.append(root);
    expect(textOffsetInRow(rowEl, chrome, chrome.childNodes.length)).toBe(5);
    expect(seqFromTarget(rowEl.firstChild)).toBe(7);
    expect(seqFromTarget(root)).toBeNull();
    root.remove();
  });
});

describe("serializeLogCopy", () => {
  const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];

  it("all 复制当前窗口全部可见行，不只视口", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_ALL,
        rows,
        listRoot: null,
        selection: null,
      }),
    ).toBe(rows.map((r) => formatLogLine(r.line)).join("\n"));
  });

  it("无选区时回退一行；空则空串", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows,
        listRoot: null,
        selection: null,
        fallbackLine: rows[1]!.line,
      }),
    ).toBe(formatLogLine(rows[1]!.line));
    expect(serializeLogCopy({ pick: LOG_COPY_NONE, rows, listRoot: null, selection: null })).toBe("");
    expect(copyHasPayload({ pick: LOG_COPY_NONE, selection: null })).toBe(false);
    expect(copyHasPayload({ pick: LOG_COPY_ALL, selection: null })).toBe(true);
  });

  it("含 UID / 无 UID 与 formatLogLine 一致", () => {
    const withUid = line({ uid: "shell", pid: 1705, tid: 1705, level: "W", tag: "binder", msg: "avc" });
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows: [],
        listRoot: null,
        selection: null,
        fallbackLine: withUid,
      }),
    ).toBe("01-01 12:00:00.000    shell  1705  1705 W binder: avc");
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows: [],
        listRoot: null,
        selection: null,
        fallbackLine: line(),
      }),
    ).toBe("01-01 12:00:00.000   100   200 I Yohu: hello");
  });

  it("选区优先于 fallback", () => {
    const item = line({ seq: 1, msg: "one" });
    const root = mountDocRows([item]);
    const rowEl = root.querySelector(`[data-seq="1"]`);
    if (!rowEl) throw new Error("row");
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows: [{ line: item }],
        listRoot: root,
        selection: selectBetween(rowEl, rowEl),
        fallbackLine: line({ seq: 9, msg: "other" }),
      }),
    ).toBe(formatLogLine(item));
    root.remove();
  });
});

describe("applyCopyEvent", () => {
  it("只写 text/plain 并拦截默认", () => {
    const written: Record<string, string> = {};
    let prevented = false;
    const event = {
      preventDefault: () => {
        prevented = true;
      },
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
