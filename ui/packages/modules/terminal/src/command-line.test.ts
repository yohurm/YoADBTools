import { describe, expect, it } from "vitest";

import {
  combineOutput,
  commandBody,
  commandNeedsInput,
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

  it("fillTemplate 按序替换且不二次扫描值", () => {
    expect(fillTemplate("ping -c 3 {0}", ["8.8.8.8"])).toBe("ping -c 3 8.8.8.8");
    expect(fillTemplate("{0} {1} {0}", ["a", "b"])).toBe("a b a");
    expect(fillTemplate("{0}", ["{1} literal"])).toBe("{1} literal");
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
