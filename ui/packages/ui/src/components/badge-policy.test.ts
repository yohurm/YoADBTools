import { describe, expect, it } from "vitest";
import { badgeHostAttrs } from "./badge-policy";

describe("badge-policy", () => {
  it("缺省宿主是 neutral + 文本 aria-label", () => {
    expect(badgeHostAttrs({ text: "默认" })).toEqual({
      "data-tone": "neutral",
      "aria-label": "默认",
    });
  });

  it("写入指定 tone", () => {
    expect(badgeHostAttrs({ text: "通过", tone: "success" })["data-tone"]).toBe("success");
    expect(badgeHostAttrs({ text: "警告", tone: "warning" })["data-tone"]).toBe("warning");
    expect(badgeHostAttrs({ text: "危险", tone: "danger" })["data-tone"]).toBe("danger");
  });
});
