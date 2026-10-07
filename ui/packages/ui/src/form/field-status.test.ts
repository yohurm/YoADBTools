import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FIELD_STATUS,
  fieldPaintKind,
  fieldStatusInvalid,
  fieldStatusIsError,
  resolveFieldStatus,
} from "./field-status";

function productionSources(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..");
  const out: string[] = [];
  for (const dir of ["form", "search"]) {
    for (const name of readdirSync(join(root, dir))) {
      if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
      if (name === "field-status.ts") continue;
      out.push(readFileSync(join(root, dir, name), "utf8"));
    }
  }
  return out;
}

describe("field status", () => {
  it("error 与 warning 原样保留，未知值归 none", () => {
    expect(resolveFieldStatus("error")).toBe("error");
    expect(resolveFieldStatus("warning")).toBe("warning");
    expect(resolveFieldStatus("success")).toBe(DEFAULT_FIELD_STATUS);
    expect(resolveFieldStatus(undefined)).toBe("none");
    expect(fieldPaintKind("error")).toBe("error");
    expect(fieldPaintKind("warning")).toBe("warning");
    expect(fieldPaintKind("none")).toBe("neutral");
    expect(fieldStatusInvalid("error")).toBe(true);
    expect(fieldStatusInvalid("warning")).toBeUndefined();
    expect(fieldStatusIsError("error")).toBe(true);
  });

  it("文本框和搜索框不再各自比较 error / warning", () => {
    const sources = productionSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(src).not.toContain('=== "error"');
      expect(src).not.toContain('=== "warning"');
    }
  });
});

describe("字段状态原样保留", () => {
  it("error 与 warning 条件只留在谓词函数体", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "field-status.ts"), "utf8");
    const times = (needle: string): number => src.split(needle).length - 1;
    expect(times("fieldStatusIsError(status) || " + "fieldStatusIsWarning(status)")).toBe(1);
    expect(times("function fieldStatusAsWritten")).toBe(1);
    expect(times("export function fieldStatusAsWritten")).toBe(0);
    expect(times("fieldStatusAsWritten(status)")).toBe(2);
    expect(times("return DEFAULT_FIELD_STATUS")).toBe(1);
    expect(times('return "neutral"')).toBe(1);
    expect(src).toContain("function fieldStatusInvalid");
    expect(times("fieldStatusIsError(status)")).toBe(2);
  });
});
