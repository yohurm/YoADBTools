import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LogLine } from "@yohu/api";

import { formatLogLine } from "./format";

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
  });
});
