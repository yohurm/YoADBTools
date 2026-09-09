import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LogLine } from "@yohu/api";

import {
  formatLogLine,
  formatLogLineForDisplay,
  formatLogLineParts,
  joinLogLineParts,
} from "./format";

describe("formatLogLine（与 domain testdata/format_log_line.json 同一套向量）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/format_log_line.json",
  );
  const fixture: { line: LogLine; expect: string }[] = JSON.parse(readFileSync(testdata, "utf8")) as {
    line: LogLine;
    expect: string;
  }[];

  it.each(fixture)("case %#", (c) => {
    expect(formatLogLine(c.line)).toBe(c.expect);
    expect(joinLogLineParts(formatLogLineParts(c.line))).toBe(c.expect);
  });

  it("关闭显示列后文档变短，消息仍在", () => {
    const line = fixture[1]!.line;
    const hidden = formatLogLineForDisplay(line, {
      ts: false,
      uid: false,
      pid: true,
      tid: true,
      level: true,
      tag: false,
    });
    expect(hidden).toBe("  100   200 I hello");
    expect(hidden.includes(line.msg)).toBe(true);
    expect(hidden.includes(line.ts)).toBe(false);
  });
});
