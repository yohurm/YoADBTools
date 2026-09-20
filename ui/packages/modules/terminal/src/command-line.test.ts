import { describe, expect, it } from "vitest";

import { stepParamSlots, toExecLine as apiToExecLine } from "@yohu/api";

import {
  adbDisplayPrefix,
  commandCopyText,
  commandCopyLines,
  commandNeedsInput,
  commandTemplateLabel,
  blockFillFields,
  commandFillFields,
  entryArity,
  entryFillFields,
  entryNeedsInput,
  entryStepCount,
  entryTemplates,
  groupStepCount,
  formatAdbLine,
  insertPlaceholderAtDisplay,
  paramDescription,
  setParamDescription,
  stepParamLabel,
  toExecLine,
} from "./command-line";

describe("command-line", () => {
  it("commandNeedsInput 看占位符", () => {
    expect(commandNeedsInput("shell ls")).toBe(false);
    expect(commandNeedsInput("shell ping {0}")).toBe(true);
  });

  it("块填参按步展开 1-0 / 2-0，同号 {n} 各占一格", () => {
    expect(
      entryArity({ kind: "command", id: "c", name: "ls", template: "shell ls" }),
    ).toBe(0);
    expect(
      entryNeedsInput({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [{ template: "shell echo {0}" }, { template: "shell ping {0}" }],
      }),
    ).toBe(true);
    expect(
      entryArity({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [{ template: "shell echo {0}" }, { template: "shell ping {0}" }],
      }),
    ).toBe(2);
    expect(stepParamLabel({ step: 1, index: 0 })).toBe("1-0");
    expect(stepParamSlots(["shell ping {13}", "shell echo {0}"])).toEqual([
      { step: 1, index: 13 },
      { step: 2, index: 0 },
    ]);
    expect(
      entryFillFields({
        kind: "block",
        id: "b",
        name: "ping",
        gap_ms: 0,
        steps: [
          { template: "shell ping {0}", params: [{ index: 0, description: "主机" }] },
          { template: "shell echo {0}", params: [{ index: 0, description: "文本" }] },
        ],
      }),
    ).toEqual([
      { key: "1-0", label: "1-0", description: "主机" },
      { key: "2-0", label: "2-0", description: "文本" },
    ]);
  });

  it("insertPlaceholderAtDisplay 把 adb 前缀映射回正文", () => {
    expect(adbDisplayPrefix("")).toBe(formatAdbLine("-", "").length);
    expect(adbDisplayPrefix("shell ping")).toBe(formatAdbLine("-", "shell ping").length - "shell ping".length);
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

  it("填参栏字段跟模板走", () => {
    const params = setParamDescription([], 0, "主机");
    expect(paramDescription(params, 0)).toBe("主机");
    expect(commandFillFields("ping {0}", params)).toEqual([
      { key: "0", label: "{0}", description: "主机" },
    ]);
    expect(blockFillFields([{ template: "ping {0}", params }])).toEqual([
      { key: "1-0", label: "1-0", description: "主机" },
    ]);
  });

  it("entryStepCount / groupStepCount 按叶子步数计进度", () => {
    expect(entryStepCount({ kind: "command", id: "c", name: "ls", template: "shell ls" })).toBe(1);
    expect(
      entryStepCount({
        kind: "block",
        id: "b",
        name: "两步",
        gap_ms: 0,
        steps: [{ template: "a" }, { template: "b" }],
      }),
    ).toBe(2);
    expect(
      groupStepCount({
        entries: [
          { kind: "command", id: "c", name: "ls", template: "shell ls" },
          {
            kind: "block",
            id: "b",
            name: "两步",
            gap_ms: 0,
            steps: [{ template: "a" }, { template: "b" }],
          },
        ],
      }),
    ).toBe(3);
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

  it("toExecLine 转发 @yohu/api", () => {
    expect(toExecLine).toBe(apiToExecLine);
  });

});
