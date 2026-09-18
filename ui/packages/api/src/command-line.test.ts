import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  alignParams,
  combineOutput,
  commandBody,
  fillTemplate,
  toExecLine,
  insertPlaceholder,
  nextPlaceholderIndex,
  placeholderArity,
  placeholderSlots,
  placeholderTokens,
  previewFill,
  splitCommandLine,
} from "./command-line";

const testdata = (name: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), `../../../../core/yohu-domain/testdata/${name}`);

describe("placeholder（与 domain testdata/command_placeholders.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("command_placeholders.json"), "utf8")) as {
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

  it.each(fixture.tokens)("slots $template", (c) => {
    expect(placeholderArity(c.template)).toBe(c.arity);
    expect(placeholderSlots(c.template)).toEqual(c.slots);
    expect(nextPlaceholderIndex(c.template)).toBe(c.next);
    expect(placeholderTokens(c.template)).toEqual(c.tokens);
  });

  it.each(fixture.insert)("insert $template", (c) => {
    expect(insertPlaceholder(c.template, c.start, c.end)).toEqual({
      template: c.result,
      caret: c.caret,
    });
  });

  it.each(fixture.preview)("preview $template", (c) => {
    expect(previewFill(c.template, c.values)).toBe(c.preview);
  });
});

describe("alignParams（与 domain testdata/align_params.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("align_params.json"), "utf8")) as {
    slots: number[];
    params: { index: number; description: string }[];
    aligned: { index: number; description: string }[];
  }[];

  it.each(fixture)("case %#", (c) => {
    expect(alignParams(c.slots, c.params)).toEqual(c.aligned);
  });
});

describe("fillTemplate（与 domain testdata/command_fill.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("command_fill.json"), "utf8")) as {
    template: string;
    values: string[];
    arity: number;
    filled?: string;
    error?: string;
  }[];

  it.each(fixture)("$template", (c) => {
    expect(placeholderArity(c.template)).toBe(c.arity);
    if (c.error === "arity") {
      expect(() => fillTemplate(c.template, c.values)).toThrow(/填充值数量不一致/);
      return;
    }
    expect(fillTemplate(c.template, c.values)).toBe(c.filled);
  });
});

describe("commandBody（与 domain testdata/command_body.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("command_body.json"), "utf8")) as {
    input: string;
    body: string;
  }[];

  it.each(fixture)("$input", (c) => {
    expect(commandBody(c.input)).toBe(c.body);
  });
});

describe("combineOutput（与 domain testdata/combine_output.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("combine_output.json"), "utf8")) as {
    stdout: string;
    stderr: string;
    text: string;
  }[];

  it.each(fixture)("case %#", (c) => {
    expect(combineOutput(c.stdout, c.stderr)).toBe(c.text);
  });
});

describe("splitCommandLine（与 domain testdata/command_split.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("command_split.json"), "utf8")) as {
    input: string;
    args: string[];
  }[];

  it.each(fixture)("$input", (c) => {
    expect(splitCommandLine(c.input)).toEqual(c.args);
  });
});

describe("toExecLine", () => {
  it("仅开关打开时补 adb", () => {
    expect(toExecLine("shell ls", false)).toBe("shell ls");
    expect(toExecLine("shell ls", true)).toBe("adb shell ls");
    expect(toExecLine("adb shell ls", true)).toBe("adb shell ls");
    expect(toExecLine("ADB.exe devices", true)).toBe("adb devices");
    expect(toExecLine("  ", true)).toBe("adb");
  });
});
