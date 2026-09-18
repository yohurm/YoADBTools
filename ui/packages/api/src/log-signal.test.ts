import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LogLine } from "./types";
import { scanSignal } from "./log-signal";

describe("scanSignal（与 domain testdata/log_signal.json 同一套向量）", () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata/log_signal.json"),
      "utf8",
    ),
  ) as { line: LogLine; kind: "crash" | "anr" | null }[];

  it.each(fixture)("$line.tag $line.msg", (c) => {
    const hit = scanSignal(c.line);
    expect(hit?.kind ?? null).toBe(c.kind);
    if (c.kind) expect(hit?.pid).toBe(c.line.pid);
  });
});
