import { describe, expect, it } from "vitest";
import { DEFAULT_CHIP_TONE, resolveChipSpec } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";

describe("chip-model / policy", () => {
  it("缺省 tone 是 accent", () => {
    expect(resolveChipSpec({ text: "libc" })).toEqual({ text: "libc", tone: DEFAULT_CHIP_TONE });
    expect(DEFAULT_CHIP_TONE).toBe("accent");
  });

  it("有 onDismiss 才写 data-dismiss", () => {
    expect(chipHostAttrs({ text: "libc" })["data-dismiss"]).toBeUndefined();
    expect(chipHostAttrs({ text: "libc", dismissible: true })["data-dismiss"]).toBe(true);
    expect(chipHostAttrs({ text: "libc", tone: "neutral" })["data-tone"]).toBe("neutral");
  });
});
