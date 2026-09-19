import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";
import { formatLogLine } from "@yohu/api";

import { formatLogLineParts, joinLogLineParts } from "./format";

const line = (over: Partial<LogLine> = {}): LogLine => ({
  seq: 1,
  ts: "2026-09-11 16:45:07.089",
  pid: 123,
  tid: 45,
  level: "I",
  tag: "Tag",
  msg: "hello",
  ...over,
});

describe("formatLogLineParts（导出 testdata；join === formatLogLine）", () => {
  it("无 uid 时 join 与 formatLogLine 同文", () => {
    const row = line();
    expect(joinLogLineParts(formatLogLineParts(row))).toBe(formatLogLine(row));
  });

  it("有 uid 时切段含 uid，join 仍是文档行", () => {
    const row = line({ uid: "1000" });
    const parts = formatLogLineParts(row);
    expect(parts.some((part) => part.kind === "uid")).toBe(true);
    expect(joinLogLineParts(parts)).toBe(formatLogLine(row));
  });
});
