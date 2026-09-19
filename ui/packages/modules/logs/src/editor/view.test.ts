import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { DEFAULT_LOG_DISPLAY_COLUMNS } from "../layout";
import { LogDocument } from "./document";
import { defaultFormatOptions, hangChars, trackTemplate } from "./format";
import { VisualBoard, clipMessage, visualBoardChars, visualLineChars, wrapBody, wrapMessage } from "./view";

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

const options = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS, "yohu");

function formatted(over: Partial<LogLine> = {}) {
  const doc = new LogDocument();
  doc.setOptions(options);
  doc.reload([{ line: line(over), collapsedAfter: over.msg?.includes("world") ? 3 : undefined }]);
  return doc.messages[0]!;
}

describe("wrapBody", () => {
  it("空消息一行空切片", () => {
    expect(wrapBody("", 10)).toEqual([{ text: "", from: 0 }]);
  });

  it("短于宽度不切", () => {
    expect(wrapBody("hello", 10)).toEqual([{ text: "hello", from: 0 }]);
  });

  it("优先在空格后断，否则硬切", () => {
    expect(wrapBody("hello world now", 10)).toEqual([
      { text: "hello ", from: 0 },
      { text: "world now", from: 6 },
    ]);
    expect(wrapBody("abcdefghijXYZ", 10)).toEqual([
      { text: "abcdefghij", from: 0 },
      { text: "XYZ", from: 10 },
    ]);
  });

  it("硬换行强制切行，且不进切片正文", () => {
    expect(wrapBody("one\ntwo", 10)).toEqual([
      { text: "one", from: 0 },
      { text: "two", from: 4 },
    ]);
    expect(wrapBody("hello\n", 10)).toEqual([
      { text: "hello", from: 0 },
      { text: "", from: 5 },
    ]);
  });
});

describe("hang / 轨道", () => {
  it("默认 hang 是前缀轨道合计", () => {
    expect(hangChars(options)).toBe(24 + 6 + 24 + 4);
    expect(trackTemplate(options).startsWith("24ch 6ch 24ch 4ch")).toBe(true);
  });
});

describe("clipMessage", () => {
  it("无硬换行时一行，文本等于逻辑文档，不看行宽", () => {
    const message = formatted({ msg: "hello world now and then again" });
    const visuals = clipMessage(message);
    expect(visuals).toHaveLength(1);
    expect(visuals[0]?.wrapIndex).toBe(0);
    expect(visuals[0]?.docFrom).toBe(0);
    expect(visuals[0]?.hang).toBe(0);
    expect(visuals[0]?.text).toBe(message.text);
    expect(visuals[0]?.ranges).toEqual(message.ranges);
  });

  it("硬换行切开，续行 hang 对齐消息列，正文不含空格垫", () => {
    const message = formatted({ msg: "line1\nline2" });
    const visuals = clipMessage(message);
    expect(visuals).toHaveLength(2);
    expect(visuals[0]?.text.endsWith("line1")).toBe(true);
    expect(visuals[0]?.hang).toBe(0);
    expect(visuals[1]?.text).toBe("line2");
    expect(visuals[1]?.hang).toBe(message.headerChars);
    expect(visuals[1]?.docFrom).toBe(message.headerChars + "line1\n".length);
    expect(message.text.slice(visuals[1]!.docFrom, visuals[1]!.docFrom + visuals[1]!.text.length)).toBe("line2");
    expect(visualLineChars(visuals[1]!)).toBe(message.headerChars + "line2".length);
    expect(visualBoardChars(visuals)).toBeGreaterThan(message.headerChars);
  });
});

describe("wrapMessage", () => {
  it("宽足够时仍是一行，文本等于逻辑文档", () => {
    const message = formatted();
    const visuals = wrapMessage(message, 1000);
    expect(visuals).toHaveLength(1);
    expect(visuals[0]?.wrapIndex).toBe(0);
    expect(visuals[0]?.docFrom).toBe(0);
    expect(visuals[0]?.text).toBe(message.text);
  });

  it("只折消息；续行没有时间 / PID / Tag / 级别", () => {
    const message = formatted({ msg: "hello world now" });
    const visuals = wrapMessage(message, hangChars(options) + 10);
    expect(visuals.length).toBeGreaterThan(1);
    expect(visuals[0]?.text).toContain(" I ");
    expect(visuals[0]?.text).toContain("hello ");
    for (const visual of visuals.slice(1)) {
      expect(visual.ranges.every((range) => range.kind === "msg")).toBe(true);
      expect(visual.docFrom).toBeGreaterThan(0);
    }
    expect(visuals.map((visual) => visual.text.slice(visual.wrapIndex === 0 ? message.headerChars : 0)).join("")).toBe(
      "hello world now",
    );
    expect(message.text.includes("\n")).toBe(false);
  });

  it("续行 docFrom 对齐逻辑文档，不含 hang 空格", () => {
    const message = formatted({ msg: "hello world now" });
    const visuals = wrapMessage(message, hangChars(options) + 10);
    const cont = visuals[1]!;
    expect(cont).toBeDefined();
    expect(message.text.slice(cont.docFrom, cont.docFrom + cont.text.length)).toBe(cont.text);
    expect(cont.text.startsWith(" ")).toBe(false);
  });

  it("折叠徽章只挂最后一条可视行", () => {
    const message = formatted({ msg: "hello world now" });
    const visuals = wrapMessage(message, hangChars(options) + 10);
    expect(visuals.length).toBeGreaterThan(1);
    expect(visuals.slice(0, -1).every((row) => row.collapsedAfter === undefined)).toBe(true);
    expect(visuals.at(-1)?.collapsedAfter).toBe(3);
  });
});

describe("VisualBoard", () => {
  it("同 messages 同宽返回同一引用", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([{ line: line({ seq: 1 }) }]);
    const board = new VisualBoard();
    const first = board.project(doc.messages, 80, "wrap");
    expect(board.project(doc.messages, 80, "wrap")).toBe(first);
  });

  it("append 不重切旧行", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const a = { line: line({ seq: 1, msg: "one" }) };
    const b = { line: line({ seq: 2, msg: "two" }) };
    doc.sync([a]);
    const board = new VisualBoard();
    const first = board.project(doc.messages, 80, "wrap");
    const kept = first[0];
    doc.sync([a, b]);
    const next = board.project(doc.messages, 80, "wrap");
    expect(next[0]).toBe(kept);
    expect(next).toHaveLength(2);
    expect(next[1]?.seq).toBe(2);
  });

  it("evict 头丢尾留，不重切剩余行", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const a = { line: line({ seq: 1, msg: "one" }) };
    const b = { line: line({ seq: 2, msg: "two" }) };
    const c = { line: line({ seq: 3, msg: "three" }) };
    doc.sync([a, b, c]);
    const board = new VisualBoard();
    const first = board.project(doc.messages, 80, "wrap");
    const kept = first[2];
    doc.sync([b, c]);
    const next = board.project(doc.messages, 80, "wrap");
    expect(next).toHaveLength(2);
    expect(next[1]).toBe(kept);
  });

  it("解析失败行续行 hang 为 0", () => {
    const message = formatted({ level: "?", msg: "hello world now", tag: "", ts: "" });
    expect(message.headerChars).toBe(0);
    const visuals = wrapMessage(message, 10);
    expect(visuals.length).toBeGreaterThan(1);
    expect(visuals.every((row) => row.hang === 0)).toBe(true);
  });

  it("变宽才重切", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([{ line: line({ seq: 1, msg: "hello world now" }) }]);
    const board = new VisualBoard();
    const wide = board.project(doc.messages, hangChars(options) + 80, "wrap");
    const kept = wide[0];
    const narrow = board.project(doc.messages, hangChars(options) + 10, "wrap");
    expect(narrow[0]).not.toBe(kept);
    expect(narrow.length).toBeGreaterThan(wide.length);
  });

  it("clip 无视行宽，长消息仍一行", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([{ line: line({ seq: 1, msg: "hello world now and then again" }) }]);
    const board = new VisualBoard();
    const first = board.project(doc.messages, 8, "clip");
    expect(first).toHaveLength(1);
    expect(first[0]?.text).toBe(doc.messages[0]?.text);
    expect(board.project(doc.messages, 80, "clip")).toBe(first);
  });

  it("clip 硬换行切开，不看行宽", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([{ line: line({ seq: 1, msg: "one\ntwo" }) }]);
    const board = new VisualBoard();
    const first = board.project(doc.messages, 8, "clip");
    expect(first).toHaveLength(2);
    expect(first[1]?.text).toBe("two");
    expect(first[1]?.hang).toBe(doc.messages[0]?.headerChars);
    expect(board.project(doc.messages, 80, "clip")).toBe(first);
  });

  it("clip 与 wrap 切换才重切", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([{ line: line({ seq: 1, msg: "hello world now" }) }]);
    const board = new VisualBoard();
    const clipped = board.project(doc.messages, hangChars(options) + 10, "clip");
    expect(clipped).toHaveLength(1);
    const wrapped = board.project(doc.messages, hangChars(options) + 10, "wrap");
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped).not.toBe(clipped);
  });
});

describe("View 不回调 Formatter", () => {
  it("view 源文件不 import formatMessage", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "view.tsx"), "utf-8");
    expect(src).not.toMatch(/\bformatMessage\b/);
    expect(src).toContain("from \"./document\"");
    expect(src).not.toContain("from \"./format\"");
    expect(src).not.toContain("../layout");
    expect(src).toContain("YoVirtualList");
    expect(src).toContain("itemHeight={props.itemHeight}");
    expect(src).toContain("yohu-doc-sel");
    expect(src).toContain("docSelBandStyle");
    expect(src).toContain("from \"./selection\"");
    expect(src).toContain("clipMessage");
    expect(src).toContain("contentWidth");
    expect(src).toContain("visualBoardChars");
    expect(src).toContain("data-layout");
    expect(src).toContain("LogLineLayout");
    expect(src).not.toContain("log_line_layout");
  });
});
