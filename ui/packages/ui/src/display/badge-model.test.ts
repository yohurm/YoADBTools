import { describe, expect, it } from "vitest";
import { BADGE_TONES, DEFAULT_BADGE_TONE, resolveBadgeSpec } from "./badge-model";

describe("badge-model", () => {
  it("缺省是 neutral", () => {
    expect(resolveBadgeSpec({ text: "默认" })).toEqual({ text: "默认", tone: "neutral" });
    expect(DEFAULT_BADGE_TONE).toBe("neutral");
  });

  it("徽章自持五色，不跟 Button role 绑死", () => {
    expect(BADGE_TONES).toEqual(["accent", "neutral", "danger", "success", "warning"]);
    expect(resolveBadgeSpec({ text: "危", tone: "danger" }).tone).toBe("danger");
    expect(resolveBadgeSpec({ text: "警", tone: "warning" }).tone).toBe("warning");
  });
});

