import { readdirSync, readFileSync } from "node:fs";
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

  it("线程列宽 5 只写一次", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const owner = readFileSync(resolve(here, "log-format.ts"), "utf8");
    expect(owner).toContain("return String(value).padStart(5);");
    const files = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of files) {
      let body = readFileSync(resolve(here, name), "utf8");
      if (name === "log-format.ts") body = body.replace("return String(value).padStart(5);", "");
      expect(body, name).not.toContain("padStart(5)");
    }
  });
});
