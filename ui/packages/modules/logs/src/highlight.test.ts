import { describe, expect, it } from "vitest";

import { containsAsciiIgnoreCase } from "./filter";
import { highlightMessage } from "./highlight";

describe("highlightMessage", () => {
  it("无关键字不切段，原文一整段", () => {
    expect(highlightMessage("hello world", "")).toEqual(["hello world"]);
  });

  it("忽略大小写切出 mark，前后原文保留", () => {
    expect(highlightMessage("Hello World", "world")).toEqual(["Hello ", { mark: "World" }]);
    expect(highlightMessage("abcabc", "bc")).toEqual(["a", { mark: "bc" }, "a", { mark: "bc" }]);
  });

  it("非 ASCII 关键字与过滤同一套 ASCII 折叠，不用 toLowerCase", () => {
    const dotted = "prefix İstanbul";
    expect("İ".toLowerCase().length).toBeGreaterThan("İ".length);
    expect(containsAsciiIgnoreCase(dotted, "İ")).toBe(true);
    expect(highlightMessage(dotted, "İ")).toEqual(["prefix ", { mark: "İ" }, "stanbul"]);

    const kelvin = "\u212A";
    expect(kelvin.toLowerCase()).toBe("k");
    expect(containsAsciiIgnoreCase("foo k bar", kelvin)).toBe(false);
    expect(highlightMessage("foo k bar", kelvin)).toEqual(["foo k bar"]);
    expect(containsAsciiIgnoreCase(`foo ${kelvin} bar`, kelvin)).toBe(true);
    expect(highlightMessage(`foo ${kelvin} bar`, kelvin)).toEqual(["foo ", { mark: kelvin }, " bar"]);
  });
});
