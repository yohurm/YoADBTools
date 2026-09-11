import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  combineOutput,
  commandBody,
  commandCopyText,
  commandCopyLines,
  commandNeedsInput,
  entryArity,
  entryNeedsInput,
  fillTemplate,
  formatAdbLine,
  placeholderArity,
  toExecLine,
} from "./command-line";

describe("command-line", () => {
  it("placeholderArity 取最大索引 + 1", () => {
    expect(placeholderArity("shell getprop")).toBe(0);
    expect(placeholderArity("shell ping {0}")).toBe(1);
    expect(placeholderArity("{0} {1}")).toBe(2);
    expect(placeholderArity("{2}")).toBe(3);
  });

  it("commandNeedsInput 看占位符", () => {
    expect(commandNeedsInput("shell ls")).toBe(false);
    expect(commandNeedsInput("shell ping {0}")).toBe(true);
  });

  it("entryArity 取命令或块内全步最大元数", () => {
    expect(
      entryArity({ kind: "command", id: "c", name: "ls", template: "shell ls" }),
    ).toBe(0);
    expect(
      entryNeedsInput({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [{ template: "shell echo {0}" }, { template: "shell ping {1}" }],
      }),
    ).toBe(true);
    expect(
      entryArity({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [{ template: "shell echo {0}" }, { template: "shell ping {1}" }],
      }),
    ).toBe(2);
  });

  it("fillTemplate 与 domain testdata/command_fill.json 同一套向量", () => {
    const testdata = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../core/yohu-domain/testdata/command_fill.json",
    );
    const fixture = JSON.parse(readFileSync(testdata, "utf8")) as {
      template: string;
      values: string[];
      arity: number;
      filled?: string;
      error?: string;
    }[];
    for (const c of fixture) {
      expect(placeholderArity(c.template)).toBe(c.arity);
      if (c.error === "arity") {
        expect(() => fillTemplate(c.template, c.values)).toThrow(/填充值数量不一致/);
        continue;
      }
      expect(fillTemplate(c.template, c.values)).toBe(c.filled);
    }
  });

  it("commandBody 去掉前导 adb", () => {
    expect(commandBody("  shell ls  ")).toBe("shell ls");
    expect(commandBody("adb shell ls")).toBe("shell ls");
    expect(commandBody("ADB.exe shell ls")).toBe("shell ls");
    expect(commandBody("adbd")).toBe("adbd");
  });

  it("formatAdbLine 始终带 adb", () => {
    expect(formatAdbLine("ABC", "shell getprop")).toBe("adb -s ABC shell getprop");
    expect(formatAdbLine("ABC", "adb shell ls")).toBe("adb -s ABC shell ls");
    expect(formatAdbLine("-", "shell ls")).toBe("adb shell ls");
  });

  it("commandCopyText 就是编辑器里的具体命令", () => {
    expect(commandCopyText("shell getprop ro.product.model")).toBe(
      "adb shell getprop ro.product.model",
    );
  });

  it("commandCopyLines 按序拼接、跳过空正文", () => {
    expect(commandCopyLines(["shell ls", "  ", "shell pwd"])).toBe("adb shell ls\nadb shell pwd");
  });

  it("toExecLine 仅开关打开时补 adb", () => {
    expect(toExecLine("shell ls", false)).toBe("shell ls");
    expect(toExecLine("shell ls", true)).toBe("adb shell ls");
    expect(toExecLine("adb shell ls", true)).toBe("adb shell ls");
    expect(toExecLine("ADB.exe devices", true)).toBe("adb devices");
  });

  it("combineOutput 拼接两路", () => {
    expect(combineOutput("out", "")).toBe("out");
    expect(combineOutput("", "err")).toBe("err");
    expect(combineOutput("out", "err")).toBe("out\nerr");
    expect(combineOutput("", "", "fallback")).toBe("fallback");
  });
});
