import { describe, expect, it } from "vitest";
import {
  BUTTON_TONES,
  BUTTON_VARIANTS,
  buttonPaintKind,
  buttonSolidInk,
  resolveButtonSpec,
  type ButtonPaintKind,
  type YoButtonTone,
  type YoButtonVariant,
} from "./button-model";

describe("button-model", () => {
  it("缺省是 solid + accent + md", () => {
    expect(resolveButtonSpec({})).toEqual({ variant: "solid", tone: "accent", size: "md" });
  });

  it("传入轴原样保留", () => {
    expect(resolveButtonSpec({ variant: "ghost", tone: "danger", size: "sm" })).toEqual({
      variant: "ghost",
      tone: "danger",
      size: "sm",
    });
  });

  it("实心上墨：accent/danger 反色字，success/warning 语义字，neutral 次级底", () => {
    expect(buttonSolidInk("accent")).toBe("on");
    expect(buttonSolidInk("danger")).toBe("on");
    expect(buttonSolidInk("success")).toBe("tone");
    expect(buttonSolidInk("warning")).toBe("tone");
    expect(buttonSolidInk("neutral")).toBe("neutral");
  });

  it("15 格 variant×tone 都有涂装，且不把 success/warning 实心标成 solid-on", () => {
    const matrix: Record<YoButtonVariant, Record<YoButtonTone, ButtonPaintKind>> = {
      solid: {
        accent: "solid-on",
        danger: "solid-on",
        success: "solid-tone",
        warning: "solid-tone",
        neutral: "solid-neutral",
      },
      outlined: {
        accent: "outlined-tone",
        danger: "outlined-tone",
        success: "outlined-tone",
        warning: "outlined-tone",
        neutral: "outlined-neutral",
      },
      ghost: {
        accent: "ghost-tone",
        danger: "ghost-tone",
        success: "ghost-tone",
        warning: "ghost-tone",
        neutral: "ghost-neutral",
      },
    };

    for (const variant of BUTTON_VARIANTS) {
      for (const tone of BUTTON_TONES) {
        expect(buttonPaintKind({ variant, tone, size: "md" })).toBe(matrix[variant][tone]);
      }
    }
  });
});
