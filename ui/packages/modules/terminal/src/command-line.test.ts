import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { entryIsBlock, entryIsCommand, paramDescription, stepParamSlots } from "@yohu/api";

import {
  adbDisplayPrefix,
  commandCopyText,
  commandCopyLines,
  commandParamLabel,
  commandNeedsInput,
  commandTemplateLabel,
  blockFillFields,
  commandFillFields,
  entryArity,
  entryFillFields,
  entryNeedsInput,
  entryStepCount,
  entryTemplates,
  libraryEntryIcon,
  queuedIsLine,
  groupStepCount,
  formatAdbLine,
  insertPlaceholderAtDisplay,
  setParamDescription,
  stepParamLabel,
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

  it("命令标签和去空白说明各只活一处", () => {
    const params = [{ index: 0, description: " 主机 " }];
    expect(commandParamLabel(0)).toBe("{0}");
    expect(commandFillFields("ping {0}", params)).toEqual([
      { key: "0", label: "{0}", description: "主机" },
    ]);
    expect(blockFillFields([{ template: "ping {0}", params }])).toEqual([
      { key: "1-0", label: "1-0", description: "主机" },
    ]);
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

  it("库条目图标只按种类", () => {
    expect(entryIsCommand({ kind: "command" })).toBe(true);
    expect(entryIsCommand({ kind: "block" })).toBe(false);
    expect(entryIsBlock({ kind: "block" })).toBe(true);
    expect(entryIsBlock({ kind: "line" })).toBe(false);
    expect(queuedIsLine({ kind: "line" })).toBe(true);
    expect(queuedIsLine({ kind: "block" })).toBe(false);
    expect(libraryEntryIcon("command")).toBe("terminal");
    expect(libraryEntryIcon("block")).toBe("block");
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

});

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...productionSources(path));
    else if (/\.(ts|tsx)$/.test(name.name) && !name.name.includes(".test.")) out.push(path);
  }
  return out;
}

describe("命令占位标签和填参说明只各写一处", () => {
  it("生产源里只有 commandParamLabel 拼标签，去空白只剩一次", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const label = "`{${index}}`";
    const offenders = productionSources(root).filter((file) => {
      let text = readFileSync(file, "utf8");
      if (file.endsWith("command-line.ts")) text = text.replace("return `{${index}}`;", "");
      return text.includes(label);
    });
    expect(offenders).toEqual([]);
    const owner = readFileSync(join(root, "command-line.ts"), "utf8");
    expect(owner).not.toContain("paramDescription(params, index).trim()");
    expect(owner).not.toContain("paramDescription(step.params ?? [], index).trim()");
    expect(owner.match(/\.trim\(\)/g)?.length ?? 0).toBe(1);
  });
});

describe("改完参数说明后只排序一次", () => {
  it("sort_params_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "command-line.ts"), "utf8");
    const needle = ".sort(" + "compareParamIndex)";
    expect(src.split(needle).length - 1).toBe(1);
  });
});

describe("填参缺省参数只兜一次", () => {
  it("fill_params_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "command-line.ts"), "utf8");
    const needle = "params " + "?? []";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("fillDescription(");
  });
});

describe("库条目种类", () => {
  it("command / block 不在终端模块里比较，自由行只留在 command-line", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = productionSources(root).filter((file) => {
      const text = readFileSync(file, "utf8");
      const command = text.includes('kind === "command"') || text.includes('kind !== "command"');
      const block = text.includes('kind === "block"') || text.includes('kind !== "block"');
      const line = text.includes('kind === "line"') || text.includes('kind !== "line"');
      const lineOwner = file.endsWith("command-line.ts");
      return command || block || (line && !lineOwner);
    });
    expect(offenders).toEqual([]);
  });
});

describe("展示正文只取一次", () => {
  it("line_body_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "command-line.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("commandBody(" + "input)")).toBe(1);
    expect(times("function lineBody")).toBe(1);
    expect(times("export function lineBody")).toBe(0);
    expect(times("const body = lineBody(input)")).toBe(2);
  });
});

describe("无设备展示行只写一次", () => {
  it("bare_adb_line_once", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const needle = "formatAdbLine(" + '"-"';
    let owner = "";
    const offenders: string[] = [];
    for (const file of productionSources(root)) {
      const text = readFileSync(file, "utf8");
      const n = text.split(needle).length - 1;
      if (file.endsWith("command-line.ts")) owner = text;
      else if (n !== 0) offenders.push(file);
    }
    const times = (n: string) => owner.split(n).length - 1;
    expect(times(needle)).toBe(1);
    expect(offenders).toEqual([]);
    expect(times("function bareAdbLine")).toBe(1);
    expect(times("export function bareAdbLine")).toBe(0);
    expect(times("bareAdbLine(body)")).toBe(1);
    expect(times("bareAdbLine(template)")).toBe(1);
  });
});
