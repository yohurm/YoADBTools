import { describe, expect, it } from "vitest";
import { BUTTON_TONES } from "./button-model";
import { BADGE_TONES, DEFAULT_BADGE_TONE, resolveBadgeSpec } from "./badge-model";

describe("badge-model", () => {
  it("缺省是 neutral", () => {
    expect(resolveBadgeSpec({ text: "默认" })).toEqual({ text: "默认", tone: "neutral" });
    expect(DEFAULT_BADGE_TONE).toBe("neutral");
  });

  it("tone 与 Button 同一枚举，不含 warn/error", () => {
    expect(BADGE_TONES).toEqual(BUTTON_TONES);
    expect(resolveBadgeSpec({ text: "危", tone: "danger" }).tone).toBe("danger");
    expect(resolveBadgeSpec({ text: "警", tone: "warning" }).tone).toBe("warning");
  });
});
