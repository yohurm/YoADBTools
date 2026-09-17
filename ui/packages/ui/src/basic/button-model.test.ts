import { describe, expect, it } from "vitest";
import {
  BUTTON_STYLES,
  BUTTON_TONES,
  resolveButtonSpec,
  type YoButtonStyle,
  type YoButtonTone,
} from "./button-model";

describe("button-model", () => {
  it("缺省是 emphasized + accent + md", () => {
    expect(resolveButtonSpec({})).toEqual({
      buttonStyle: "emphasized",
      tone: "accent",
      size: "md",
    });
  });

  it("传入轴原样保留", () => {
    expect(resolveButtonSpec({ buttonStyle: "textual", tone: "danger", size: "sm" })).toEqual({
      buttonStyle: "textual",
      tone: "danger",
      size: "sm",
    });
  });

  it("规格只有 buttonStyle × tone × size，没有 paint / variant / success", () => {
    const spec = resolveButtonSpec({ buttonStyle: "normal", tone: "neutral" });
    expect(spec).toEqual({ buttonStyle: "normal", tone: "neutral", size: "md" });
    expect(spec).not.toHaveProperty("variant");
    expect(spec).not.toHaveProperty("paint");
    expect(BUTTON_STYLES).toEqual(["emphasized", "normal", "textual"]);
    expect(BUTTON_TONES).toEqual(["accent", "neutral", "danger"]);
    const tones: YoButtonTone[] = [...BUTTON_TONES];
    const styles: YoButtonStyle[] = [...BUTTON_STYLES];
    expect(tones).not.toContain("success");
    expect(tones).not.toContain("warning");
    expect(styles).not.toContain("outlined");
  });
});
