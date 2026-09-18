import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LogLine } from "./types";
import { formatLogLine } from "./log-format";

describe("formatLogLine（与 domain testdata/format_log_line.json 同一套向量）", () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata/format_log_line.json"),
      "utf8",
    ),
  ) as { line: LogLine; expect: string }[];

  it.each(fixture)("case %#", (c) => {
    expect(formatLogLine(c.line)).toBe(c.expect);
  });
});
