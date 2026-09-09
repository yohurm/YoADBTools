import { describe, expect, it } from "vitest";

import { highlightMessage } from "./highlight";

describe("highlightMessage", () => {
  it("无关键字不切段，原文一整段", () => {
    expect(highlightMessage("hello world", "")).toEqual(["hello world"]);
  });

  it("忽略大小写切出 mark，前后原文保留", () => {
    expect(highlightMessage("Hello World", "world")).toEqual(["Hello ", { mark: "World" }]);
    expect(highlightMessage("abcabc", "bc")).toEqual(["a", { mark: "bc" }, "a", { mark: "bc" }]);
  });
});
