import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { defaultFormatOptions, formatMessage, formatParts, hangChars, wrapMessage } from "./editor";
import { ALL_LOG_DISPLAY_COLUMNS } from "./layout";

const options = defaultFormatOptions(ALL_LOG_DISPLAY_COLUMNS, "yohu");

function line(over: Partial<LogLine> = {}): LogLine {
  return {
    seq: 1,
    ts: "2026-01-01 12:00:00.000",
    pid: 100,
    tid: 200,
    level: "I",
    tag: "Yohu",
    msg: "hello",
    ...over,
  };
}

function messageOf(item: LogLine) {
  const formatted = formatMessage(item, options);
  return { seq: item.seq, text: formatted.text };
}

function mountRow(item: LogLine): HTMLElement {
  const formatted = formatMessage(item, options);
  const el = document.createElement("div");
  el.dataset.seq = String(item.seq);
  for (const range of formatted.ranges) {
    const span = document.createElement("span");
    if (range.role === "pad") {
      span.dataset.logPad = "";
    } else {
      span.dataset.kind = range.kind;
    }
    span.textContent = formatted.text.slice(range.start, range.end);
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
  const messages = [messageOf(line({ seq: 1, msg: "one" })), messageOf(line({ seq: 2, msg: "two" })), messageOf(line({ seq: 3, msg: "three" }))];

  it("all 复制当前窗口全部可见行的清单文档", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_ALL,
        messages,
        listRoot: null,
        selection: null,
      }),
    ).toBe(messages.map((item) => item.text).join("\n"));
  });

  it("无选区时回退一行；空则空串", () => {
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        messages,
        listRoot: null,
        selection: null,
        fallbackText: messages[1]!.text,
      }),
    ).toBe(messages[1]!.text);
    expect(serializeLogCopy({ pick: LOG_COPY_NONE, messages, listRoot: null, selection: null })).toBe("");
    expect(copyHasPayload({ pick: LOG_COPY_NONE, listRoot: null, selection: null })).toBe(false);
    expect(copyHasPayload({ pick: LOG_COPY_ALL, listRoot: null, selection: null })).toBe(true);
  });

  it("回退行含 UID 的清单文档带 pad 空格，不是 formatLogLine 紧贴格式", () => {
    const withUid = line({ uid: "shell", pid: 1705, tid: 1705, level: "W", tag: "binder", msg: "avc" });
    const text = serializeLogCopy({
      pick: LOG_COPY_NONE,
      messages: [],
      listRoot: null,
      selection: null,
      fallbackText: formatMessage(withUid, options).text,
    });
    expect(text).toBe(formatMessage(withUid, options).text);
    expect(text.includes("binder")).toBe(true);
    expect(text.includes("avc")).toBe(true);
    const tag = formatParts(formatMessage(withUid, options)).find((part) => part.kind === "tag");
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
    const parts = formatParts(formatMessage(item, options));
    const tagAt = parts.findIndex((part) => part.kind === "tag");
    const before = parts.slice(0, tagAt).reduce((n, part) => n + part.text.length, 0);
    const tag = parts[tagAt]!;
    const lead = tag.text.length - tag.text.trimStart().length;
    const selection = selectDoc(rowEl, before + lead, rowEl, before + tag.text.trimEnd().length);
    expect(documentCopyText(list, selection, [messageOf(item)])).toBe("ActivityManager");
    expect(
      serializeLogCopy({
        pick: LOG_COPY_NONE,
        messages: [messageOf(item)],
        listRoot: list,
        selection,
        fallbackText: formatMessage(line({ seq: 9, msg: "other" }), options).text,
      }),
    ).toBe("ActivityManager");
  });

  it("从 Tag 拖过 pad 空格，复制含字段后的空白", () => {
    const item = line({ seq: 1, tag: "Yohu", msg: "hello" });
    const list = document.createElement("div");
    const rowEl = mountRow(item);
    list.append(rowEl);
    document.body.append(list);
    const parts = formatParts(formatMessage(item, options));
    const tagAt = parts.findIndex((part) => part.kind === "tag");
    const before = parts.slice(0, tagAt).reduce((n, part) => n + part.text.length, 0);
    const tag = parts[tagAt]!;
    expect(tag.text.trimStart().startsWith("Yohu")).toBe(true);
    expect(tag.text.length).toBeGreaterThan(4);
    const selection = selectDoc(rowEl, before, rowEl, before + tag.text.length);
    expect(documentCopyText(list, selection, [messageOf(item)])).toBe(tag.text);
    expect(documentCopyText(list, selection, [messageOf(item)]).endsWith(" ")).toBe(true);
  });

  it("跨行中间未挂载行用同一文档补齐", () => {
    const items = [line({ seq: 1, msg: "one" }), line({ seq: 2, msg: "two" }), line({ seq: 3, msg: "three" })];
    const messages = items.map(messageOf);
    const list = document.createElement("div");
    const first = mountRow(items[0]!);
    const last = mountRow(items[2]!);
    list.append(first, last);
    document.body.append(list);
    const selection = selectDoc(first, 2, last, 4);
    expect(documentCopyText(list, selection, messages)).toBe(
      [messages[0]!.text.slice(2), messages[1]!.text, messages[2]!.text.slice(0, 4)].join("\n"),
    );
  });

  it("跨可视续行复制映回同一逻辑文档，不含 hang", () => {
    const item = line({ seq: 4, msg: "hello world now" });
    const formatted = formatMessage(item, options);
    const visuals = wrapMessage(
      {
        seq: item.seq,
        text: formatted.text,
        ranges: formatted.ranges,
        headerChars: formatted.headerChars,
        bar: formatted.bar,
        line: item,
      },
      hangChars(options) + 10,
    );
    expect(visuals.length).toBeGreaterThan(1);
    const list = document.createElement("div");
    const els = visuals.map((visual) => {
      const el = document.createElement("div");
      el.dataset.seq = String(item.seq);
      el.dataset.wrap = String(visual.wrapIndex);
      el.dataset.docFrom = String(visual.docFrom);
      for (const range of visual.ranges) {
        const span = document.createElement("span");
        if (range.role === "pad") {
          span.dataset.logPad = "";
        }
        span.textContent = visual.text.slice(range.start, range.end);
        el.append(span);
      }
      list.append(el);
      return el;
    });
    document.body.append(list);
    const last = els.at(-1)!;
    const selection = selectDoc(els[0]!, 0, last, last.textContent?.length ?? 0);
    expect(documentCopyText(list, selection, [messageOf(item)])).toBe(formatted.text);
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
    const firstLen = firstText!.textContent?.length ?? 0;
    expect(firstLen).toBeGreaterThan(0);
    expect(textOffsetInDoc(rowEl, firstText!, firstLen)).toBe(firstLen);
    expect(textOffsetInDoc(rowEl, firstText!, firstLen + 8)).toBe(firstLen);
    expect(textOffsetInDoc(rowEl, fold.firstChild!, 2)).toBe(formatMessage(item, options).text.length);
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

describe("rangeHitsNode", () => {
  it("产品文件只用 Range 边界比较，没有 intersectsNode / jsdom catch", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "copy.ts"), "utf-8");
    expect(src).toContain("compareBoundaryPoints");
    expect(src).not.toContain("intersectsNode");
    expect(src).not.toContain("jsdom");
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
