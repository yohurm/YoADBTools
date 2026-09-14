import { describe, expect, it } from "vitest";
import { DEFAULT_CHIP_DISMISS, DEFAULT_CHIP_TONE, resolveChipSpec } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";

describe("chip-model / policy", () => {
  it("缺省 tone 是 accent", () => {
    expect(resolveChipSpec({ text: "libc" })).toEqual({
      text: "libc",
      tone: DEFAULT_CHIP_TONE,
      leading: false,
      dismiss: null,
    });
    expect(DEFAULT_CHIP_TONE).toBe("accent");
    expect(DEFAULT_CHIP_DISMISS).toBe("always");
  });

  it("有 onDismiss 才写 data-dismiss，默认 always", () => {
    expect(chipHostAttrs({ text: "libc" })["data-dismiss"]).toBeUndefined();
    expect(chipHostAttrs({ text: "libc", dismissible: true })["data-dismiss"]).toBe("always");
    expect(chipHostAttrs({ text: "libc", dismissible: true, dismiss: "hover" })["data-dismiss"]).toBe(
      "hover",
    );
    expect(chipHostAttrs({ text: "libc", tone: "neutral" })["data-tone"]).toBe("neutral");
  });

  it("leading 写 data-leading", () => {
    expect(chipHostAttrs({ text: "a" })["data-leading"]).toBeUndefined();
    expect(chipHostAttrs({ text: "a", leading: "folder" })["data-leading"]).toBe(true);
  });
});
