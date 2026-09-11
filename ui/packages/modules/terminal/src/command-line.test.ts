import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  alignParams,
  combineOutput,
  commandBody,
  commandCopyText,
  commandCopyLines,
  commandNeedsInput,
  commandTemplateLabel,
  entryArity,
  entryNeedsInput,
  entryParams,
  entrySlots,
  entryTemplates,
  fillTemplate,
  placeholderSlots,
  formatAdbLine,
  insertPlaceholder,
  insertPlaceholderAtDisplay,
  nextPlaceholderIndex,
  paramDescription,
  placeholderArity,
  placeholderTokens,
  previewFill,
  setParamDescription,
  toExecLine,
} from "./command-line";

describe("command-line", () => {
  it("placeholderSlots 只收实际出现的独立 {n}", () => {
    expect(placeholderSlots("shell getprop")).toEqual([]);
    expect(placeholderSlots("shell ping {0}")).toEqual([0]);
    expect(placeholderSlots("{0} {1}")).toEqual([0, 1]);
    expect(placeholderSlots("{2}")).toEqual([2]);
    expect(placeholderSlots("shell ping -c 3 {13}")).toEqual([13]);
    expect(placeholderArity("{2}")).toBe(1);
    expect(placeholderArity("shell ping -c 3 {13}")).toBe(1);
  });

  it("commandNeedsInput 看占位符", () => {
    expect(commandNeedsInput("shell ls")).toBe(false);
    expect(commandNeedsInput("shell ping {0}")).toBe(true);
  });

  it("entrySlots 取命令或块内全步独立槽位并集", () => {
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
    expect(
      entrySlots({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [{ template: "shell ping {13}" }, { template: "shell echo {0}" }],
      }),
    ).toEqual([0, 13]);
  });

  it("占位符槽位 / 插入 / 预览与 domain testdata/command_placeholders.json 同一套向量", () => {
    const testdata = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../core/yohu-domain/testdata/command_placeholders.json",
    );
    const fixture = JSON.parse(readFileSync(testdata, "utf8")) as {
      tokens: {
        template: string;
        arity: number;
        slots: number[];
        next: number;
        tokens: { index: number; start: number; end: number }[];
      }[];
      insert: {
        template: string;
        start: number;
        end: number;
        result: string;
        caret: number;
      }[];
      preview: { template: string; values: string[]; preview: string }[];
    };
    for (const c of fixture.tokens) {
      expect(placeholderArity(c.template)).toBe(c.arity);
      expect(placeholderSlots(c.template)).toEqual(c.slots);
      expect(nextPlaceholderIndex(c.template)).toBe(c.next);
      expect(placeholderTokens(c.template)).toEqual(c.tokens);
    }
    for (const c of fixture.insert) {
      expect(insertPlaceholder(c.template, c.start, c.end)).toEqual({
        template: c.result,
        caret: c.caret,
      });
    }
    for (const c of fixture.preview) {
      expect(previewFill(c.template, c.values)).toBe(c.preview);
    }
  });

  it("insertPlaceholderAtDisplay 把 adb 前缀映射回正文", () => {
    expect(insertPlaceholderAtDisplay("shell ping", 14, 14)).toEqual({
      body: "shell ping {0}",
      caret: 18,
    });
    expect(insertPlaceholderAtDisplay("", 3, 3)).toEqual({
      body: "{0}",
      caret: 7,
    });
    expect(insertPlaceholderAtDisplay("shell ping host", 10, 19)).toEqual({
      body: "shell {0}",
      caret: 13,
    });
  });

  it("commandTemplateLabel 说明 {n} 是独立参数", () => {
    expect(commandTemplateLabel()).toBe("具体命令（{n}代表使用命令时需要填入的独立参数）");
  });

  it("参数描述按独立槽位对齐、空说明丢弃", () => {
    const params = setParamDescription([], 0, "主机");
    expect(paramDescription(params, 0)).toBe("主机");
    expect(alignParams([0], params)).toEqual([{ index: 0, description: "主机" }]);
    expect(alignParams([], params)).toEqual([]);
    expect(alignParams([0, 1], setParamDescription(params, 1, "  "))).toEqual([
      { index: 0, description: "主机" },
    ]);
    expect(
      alignParams(
        [13],
        [
          { index: 0, description: "幽灵" },
          { index: 13, description: " 主机 " },
        ],
      ),
    ).toEqual([{ index: 13, description: "主机" }]);
    expect(
      entryParams({
        kind: "command",
        id: "c",
        name: "ping",
        template: "ping {0}",
        params: [{ index: 0, description: "主机" }],
      }),
    ).toEqual([{ index: 0, description: "主机" }]);
  });

  it("entryTemplates 列出命令或块内全部步骤", () => {
    expect(entryTemplates({ kind: "command", id: "c", name: "ping", template: "shell ping {0}" })).toEqual([
      "shell ping {0}",
    ]);
    expect(
      entryTemplates({
        kind: "block",
        id: "b",
        name: "两步",
        gap_ms: 0,
        steps: [{ template: "echo {0}" }, { template: "ping {1}" }],
      }),
    ).toEqual(["echo {0}", "ping {1}"]);
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
