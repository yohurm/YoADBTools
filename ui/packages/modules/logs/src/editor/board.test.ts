import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { LineBoard, clipMessage, documentLines, documentMaxChars, wrapMessage } from "./board";
import { LogDocument } from "./document";
import { DEFAULT_LOG_DISPLAY_COLUMNS, defaultFormatOptions, headerWidth } from "./format";

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

const clipOpts = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS, "yohu");
const wrapOpts = { ...clipOpts, softWrap: true };

function formatted(over: Partial<LogLine> = {}, softWrap = false) {
  const doc = new LogDocument();
  doc.setOptions(softWrap ? wrapOpts : clipOpts);
  doc.reload([{ line: line(over), collapsedAfter: over.msg?.includes("world") ? 3 : undefined }]);
  return doc.messages[0]!;
}

describe("documentLines / clip", () => {
  it("无硬换行时一行，文本等于逻辑文档", () => {
    const message = formatted({ msg: "hello world now and then again" });
    const visuals = clipMessage(message);
    expect(visuals).toHaveLength(1);
    expect(visuals[0]?.text).toBe(message.text);
  });

  it("Soft-Wrap 关：续行文档含 hang 空格，可视行不再另加 hang 字段", () => {
    const message = formatted({ msg: "line1\nline2" });
    const visuals = documentLines(message);
    expect(visuals).toHaveLength(2);
    expect(visuals[0]?.text.endsWith("line1")).toBe(true);
    expect(visuals[1]?.text.startsWith(" ".repeat(headerWidth(clipOpts)))).toBe(true);
    expect(visuals[1]?.text.trimStart()).toBe("line2");
    expect(message.text.slice(visuals[1]!.docFrom)).toBe(visuals[1]?.text);
  });
});

describe("wrapMessage", () => {
  it("Soft-Wrap 开：硬换行续行从第 0 列，不垫空格", () => {
    const message = formatted({ msg: "line1\nline2" }, true);
    const visuals = wrapMessage(message, 1000);
    expect(visuals).toHaveLength(2);
    expect(visuals[1]?.text).toBe("line2");
  });

  it("视口软折续行第 0 列，映回同一文档", () => {
    const message = formatted({ msg: "hello world now" }, true);
    const visuals = wrapMessage(message, headerWidth(wrapOpts) + 10);
    expect(visuals.length).toBeGreaterThan(1);
    expect(visuals.map((row) => row.text).join("")).toBe(message.text);
  });

  it("折叠徽章只挂最后一条可视行", () => {
    const message = formatted({ msg: "hello world now" }, true);
    const visuals = wrapMessage(message, headerWidth(wrapOpts) + 10);
    expect(visuals.slice(0, -1).every((row) => row.collapsedAfter === undefined)).toBe(true);
    expect(visuals.at(-1)?.collapsedAfter).toBe(3);
  });
});

describe("LineBoard", () => {
  it("同 messages 同宽返回同一引用", () => {
    const doc = new LogDocument();
    doc.setOptions(wrapOpts);
    doc.reload([{ line: line({ seq: 1 }) }]);
    const board = new LineBoard();
    const first = board.project(doc.messages, 80, "wrap");
    expect(board.project(doc.messages, 80, "wrap")).toBe(first);
  });

  it("append 不重切旧行", () => {
    const doc = new LogDocument();
    doc.setOptions(clipOpts);
    const a = { line: line({ seq: 1, msg: "one" }) };
    const b = { line: line({ seq: 2, msg: "two" }) };
    doc.sync([a]);
    const board = new LineBoard();
    const first = board.project(doc.messages, 80, "clip");
    const kept = first[0];
    doc.sync([a, b]);
    const next = board.project(doc.messages, 80, "clip");
    expect(next[0]).toBe(kept);
    expect(next).toHaveLength(2);
  });

  it("clip 无视行宽，长消息仍一行", () => {
    const doc = new LogDocument();
    doc.setOptions(clipOpts);
    doc.reload([{ line: line({ seq: 1, msg: "hello world now and then again" }) }]);
    const board = new LineBoard();
    const first = board.project(doc.messages, 8, "clip");
    expect(first).toHaveLength(1);
    expect(documentMaxChars(first)).toBe(doc.messages[0]!.text.length);
    expect(board.project(doc.messages, 80, "clip")).toBe(first);
  });

  it("clip 硬换行切开，不看行宽", () => {
    const doc = new LogDocument();
    doc.setOptions(clipOpts);
    doc.reload([{ line: line({ seq: 1, msg: "one\ntwo" }) }]);
    const board = new LineBoard();
    const first = board.project(doc.messages, 8, "clip");
    expect(first).toHaveLength(2);
    expect(first[1]?.text.trimStart()).toBe("two");
  });

  it("wash 行盒写在 range.box=line 上，不是第二层 ch 带", () => {
    const message = formatted({ level: "F", msg: "fatal" });
    const visuals = clipMessage(message);
    const boxes = visuals[0]!.ranges.filter((range) => range.box === "line");
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((range) => range.end > range.start)).toBe(true);
    expect(boxes[0]!.end).toBeLessThanOrEqual(visuals[0]!.text.length);
  });
});

describe("Board 不回调 Formatter", () => {
  it("board 源文件不 import formatMessage", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "board.ts"), "utf-8");
    expect(src).not.toMatch(/\bformatMessage\b/);
    expect(src).toContain("from \"./document\"");
    expect(src).not.toContain("from \"./format\"");
    expect(src).toContain("clipMessage");
    expect(src).toContain("wrapMessage");
    expect(src).toContain("documentLines");
    expect(src).toContain("LineBoard");
    expect(src).not.toContain("wrapBody");
    expect(src).not.toContain("VisualBoard");
    expect(src).not.toContain("--yohu-log-hang");
    expect(src).not.toContain("--yohu-log-board");
    expect(src).not.toContain("log_line_layout");
  });
});
