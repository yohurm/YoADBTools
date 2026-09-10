import { afterEach, describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import {
  applyCopyEvent,
  copyHasPayload,
  documentCopyText,
  LOG_COPY_ALL,
  LOG_COPY_NONE,
  logSelectionInList,
  seqFromTarget,
  serializeLogCopy,
  textOffsetInDoc,
} from "./copy";
import { defaultLogDocLayout, formatLogDoc, formatLogDocParts } from "./doc";
import { ALL_LOG_DISPLAY_COLUMNS } from "./format";

const layout = defaultLogDocLayout(ALL_LOG_DISPLAY_COLUMNS);

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

function mountRow(item: LogLine): HTMLElement {
  const el = document.createElement("div");
  el.dataset.seq = String(item.seq);
  for (const part of formatLogDocParts(item, layout)) {
    const span = document.createElement("span");
    span.dataset.kind = part.kind;
    span.textContent = part.text;
    el.append(span);
  }
  return el;
}

function pointAt(rowEl: HTMLElement, offset: number): { node: Node; offset: number } {
  let left = offset;
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (left <= len) {
        return { node, offset: left };
      }
      left -= len;
      return null;
    }
    for (const child of node.childNodes) {
      const hit = walk(child);
      if (hit) {
        return hit;
      }
    }
    return null;
  };
  return walk(rowEl) ?? { node: rowEl, offset: rowEl.childNodes.length };
}

function selectDoc(startRow: HTMLElement, start: number, endRow: HTMLElement, end: number): Selection {
  const from = pointAt(startRow, start);
  const to = pointAt(endRow, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("no Selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("serializeLogCopy", () => {
  const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];

  it("all 复制当前窗口全部可见行的清单文档", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_ALL,
        rows,
        listRoot: null,
        selection: null,
        layout,
      }),
    ).toBe(rows.map((item) => formatLogDoc(item.line, layout)).join("\n"));
  });

  it("无选区时回退一行；空则空串", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows,
        listRoot: null,
        selection: null,
        fallbackLine: rows[1]!.line,
        layout,
      }),
    ).toBe(formatLogDoc(rows[1]!.line, layout));
    expect(serializeLogCopy({ pick: LOG_COPY_NONE, rows, listRoot: null, selection: null, layout })).toBe("");
    expect(copyHasPayload({ pick: LOG_COPY_NONE, listRoot: null, selection: null })).toBe(false);
    expect(copyHasPayload({ pick: LOG_COPY_ALL, listRoot: null, selection: null })).toBe(true);
  });

  it("回退行含 UID 的清单文档带 pad 空格，不是 formatLogLine 紧贴格式", () => {
    const withUid = line({ uid: "shell", pid: 1705, tid: 1705, level: "W", tag: "binder", msg: "avc" });
    const text = serializeLogCopy({
      pick: LOG_COPY_NONE,
      rows: [],
      listRoot: null,
      selection: null,
      fallbackLine: withUid,
      layout,
    });
    expect(text).toBe(formatLogDoc(withUid, layout));
    expect(text.includes("binder")).toBe(true);
    expect(text.includes("avc")).toBe(true);
    const tag = formatLogDocParts(withUid, layout).find((part) => part.kind === "tag");
    expect(tag?.text.endsWith(" ")).toBe(true);
  });
});

describe("documentCopyText", () => {
  it("只选 Tag 字段时复制不含前面的时间/PID", () => {
    const item = line({ seq: 8, tag: "ActivityManager", msg: "hello" });
    const list = document.createElement("div");
    const rowEl = mountRow(item);
    list.append(rowEl);
    document.body.append(list);
    const parts = formatLogDocParts(item, layout);
    const before = parts.filter((part) => part.kind !== "tag" && part.kind !== "msg").reduce((n, part) => n + part.text.length, 0);
    const tag = parts.find((part) => part.kind === "tag")!;
    const lead = tag.text.length - tag.text.trimStart().length;
    const selection = selectDoc(rowEl, before + lead, rowEl, before + tag.text.trimEnd().length);
    expect(documentCopyText(list, selection, [{ line: item }], layout)).toBe("ActivityManager");
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        rows: [{ line: item }],
        listRoot: list,
        selection,
        fallbackLine: line({ seq: 9, msg: "other" }),
        layout,
      }),
    ).toBe("ActivityManager");
  });

  it("从 Tag 拖过 pad 空格，复制含字段后的空白", () => {
    const item = line({ seq: 1, tag: "Yohu", msg: "hello" });
    const list = document.createElement("div");
    const rowEl = mountRow(item);
    list.append(rowEl);
    document.body.append(list);
    const parts = formatLogDocParts(item, layout);
    const before = parts.filter((part) => part.kind !== "tag" && part.kind !== "msg").reduce((n, part) => n + part.text.length, 0);
    const tag = parts.find((part) => part.kind === "tag")!;
    expect(tag.text.trimStart().startsWith("Yohu")).toBe(true);
    expect(tag.text.length).toBeGreaterThan(4);
    const selection = selectDoc(rowEl, before, rowEl, before + tag.text.length);
    expect(documentCopyText(list, selection, [{ line: item }], layout)).toBe(tag.text);
    expect(documentCopyText(list, selection, [{ line: item }], layout).endsWith(" ")).toBe(true);
  });

  it("跨行中间未挂载行用同一文档补齐", () => {
    const rows = [row({ seq: 1, msg: "one" }), row({ seq: 2, msg: "two" }), row({ seq: 3, msg: "three" })];
    const list = document.createElement("div");
    const first = mountRow(rows[0]!.line);
    const last = mountRow(rows[2]!.line);
    list.append(first, last);
    document.body.append(list);
    const firstDoc = formatLogDoc(rows[0]!.line, layout);
    const lastDoc = formatLogDoc(rows[2]!.line, layout);
    const selection = selectDoc(first, 2, last, 4);
    expect(documentCopyText(list, selection, rows, layout)).toBe(
      [firstDoc.slice(2), formatLogDoc(rows[1]!.line, layout), lastDoc.slice(0, 4)].join("\n"),
    );
  });
});

describe("textOffsetInDoc / logSelectionInList", () => {
  it("文本节点偏移累加等于文档偏移；铬层不计长", () => {
    const item = line();
    const rowEl = mountRow(item);
    const fold = document.createElement("span");
    fold.dataset.logChrome = "";
    fold.textContent = "…3 帧折叠";
    rowEl.append(fold);
    document.body.append(rowEl);
    const firstText = rowEl.querySelector("span")?.firstChild;
    expect(firstText).toBeTruthy();
    expect(textOffsetInDoc(rowEl, firstText!, 3)).toBe(3);
    expect(textOffsetInDoc(rowEl, fold.firstChild!, 2)).toBe(formatLogDoc(item, layout).length);
  });

  it("折叠选区不算在清单里", () => {
    const list = document.createElement("div");
    document.body.append(list);
    expect(logSelectionInList(list, window.getSelection())).toBe(false);
  });
});

describe("seqFromTarget", () => {
  it("从 data-seq 读行号", () => {
    const root = document.createElement("div");
    const rowEl = document.createElement("div");
    rowEl.setAttribute("data-seq", "7");
    rowEl.append("hello");
    root.append(rowEl);
    expect(seqFromTarget(rowEl.firstChild)).toBe(7);
    expect(seqFromTarget(root)).toBeNull();
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
    expect(applyCopyEvent(event, "Yohu      ")).toBe(true);
    expect(prevented).toBe(true);
    expect(written).toEqual({ "text/plain": "Yohu      " });
  });
});
