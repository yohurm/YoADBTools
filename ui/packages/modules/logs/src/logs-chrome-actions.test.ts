import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  logsChromeActions,
  logsChromeIsCapture,
  logsChromeIsClear,
  logsChromeIsClearDevice,
  logsChromeIsExport,
  logsChromeIsPause,
} from "./logs-chrome-actions";

describe("日志页眉动作", () => {
  it("采集中才有暂停，滞后才有溢出标记", () => {
    expect(logsChromeActions({ capturing: false, overflowed: false })).toEqual([
      "capture",
      "clear",
      "clear-device",
      "export",
    ]);
    expect(logsChromeActions({ capturing: true, overflowed: true })).toEqual([
      "capture",
      "pause",
      "clear",
      "clear-device",
      "export",
      "overflow",
    ]);
  });

  it("采集、暂停、清空、清设备、导出各判一次", () => {
    expect(logsChromeIsCapture("capture")).toBe(true);
    expect(logsChromeIsPause("pause")).toBe(true);
    expect(logsChromeIsClear("clear")).toBe(true);
    expect(logsChromeIsClearDevice("clear-device")).toBe(true);
    expect(logsChromeIsExport("export")).toBe(true);
    expect(logsChromeIsPause("overflow")).toBe(false);
    expect(logsChromeIsClear("clear-device")).toBe(false);
  });
});

describe("日志页眉动作只在页眉模块判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const ids = ["clear-device", "capture", "pause", "clear", "export", "overflow"];

  it("视图不再比较 id 字面量", () => {
    for (const name of ["logs-chrome-actions.ts", "LogAnalyzerView.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      for (const id of ids) body = body.replaceAll(`return id === "${id}"`, "");
      for (const id of ids) expect(body, name).not.toContain(`id === "${id}"`);
    }
  });
});
