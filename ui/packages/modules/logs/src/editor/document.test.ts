import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { DEFAULT_LOG_DISPLAY_COLUMNS } from "../layout";
import { LogDocument, type DocRow } from "./document";
import { defaultFormatOptions } from "./format";

function line(seq: number, over: Partial<LogLine> = {}): LogLine {
  return {
    seq,
    ts: "2026-01-01 12:00:00.000",
    pid: 100,
    tid: 1,
    level: "I",
    tag: "T",
    msg: `m${seq}`,
    ...over,
  };
}

function row(seq: number, over: Partial<LogLine> = {}): DocRow {
  return { line: line(seq, over) };
}

const options = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS, "yohu");

describe("LogDocument", () => {
  it("未 setOptions 时 sync 不 format", () => {
    const doc = new LogDocument();
    expect(doc.sync([row(1)])).toBe(false);
    expect(doc.messages).toHaveLength(0);
  });

  it("reload 产出文本；空 reload 回到空引用", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    expect(doc.reload([row(1), row(2)])).toBe(true);
    expect(doc.messages).toHaveLength(2);
    expect(doc.messages[0]?.text).toContain("m1");
    expect(doc.reload([])).toBe(true);
    expect(doc.messages).toHaveLength(0);
    expect(doc.reload([])).toBe(false);
  });

  it("同一 rows 引用 sync 返回 false，messages 引用不变", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const rows = [row(1), row(2)];
    doc.sync(rows);
    const first = doc.messages;
    expect(doc.sync(rows)).toBe(false);
    expect(doc.messages).toBe(first);
  });

  it("append 前缀对象不动", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const a = row(1);
    const b = row(2);
    const first = [a];
    doc.sync(first);
    const kept = doc.messages[0];
    const next = [a, b];
    expect(doc.sync(next)).toBe(true);
    expect(doc.messages[0]).toBe(kept);
    expect(doc.messages).toHaveLength(2);
    expect(doc.messages[1]?.seq).toBe(2);
  });

  it("空 append 不换引用", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    doc.reload([row(1)]);
    const first = doc.messages;
    expect(doc.append([])).toBe(false);
    expect(doc.messages).toBe(first);
  });

  it("evict 头丢尾留", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const rows = [row(1), row(2), row(3)];
    doc.sync(rows);
    const tail = doc.messages[2];
    expect(doc.sync(rows.slice(1))).toBe(true);
    expect(doc.messages).toHaveLength(2);
    expect(doc.messages[1]).toBe(tail);
  });

  it("环裁：重叠前缀 + 新尾", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const keep = [row(2), row(3)];
    const start = [row(1), ...keep];
    doc.sync(start);
    const kept = doc.messages[1];
    const next = [...keep, row(4)];
    expect(doc.sync(next)).toBe(true);
    expect(doc.messages[0]).toBe(kept);
    expect(doc.messages.map((item) => item.seq)).toEqual([2, 3, 4]);
  });

  it("setOptions 同 key 不重载；scheme 变才整表新对象", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const rows = [row(1)];
    doc.sync(rows);
    const first = doc.messages[0];
    expect(doc.setOptions({ ...options, chPx: 11 })).toBe(false);
    expect(doc.messages[0]).toBe(first);
    expect(doc.setOptions({ ...options, scheme: "logcat" })).toBe(true);
    expect(doc.messages[0]).not.toBe(first);
    expect(doc.messages[0]?.bar).toBe("none");
  });

  it("10k adopt 同引用", () => {
    const doc = new LogDocument();
    doc.setOptions(options);
    const rows = Array.from({ length: 10_000 }, (_, i) => row(i));
    doc.sync(rows);
    const t0 = performance.now();
    expect(doc.sync(rows)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(2);
  });
});
