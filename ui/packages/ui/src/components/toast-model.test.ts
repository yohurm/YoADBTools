import { describe, expect, it } from "vitest";
import { DEFAULT_TOAST_TONE, resolveToastSpec, toastPaintTone, type ToastTone } from "./toast-model";

describe("toast-model", () => {
  it("缺省 tone 是 info", () => {
    expect(resolveToastSpec({ text: "提示" })).toEqual({ text: "提示", tone: DEFAULT_TOAST_TONE });
    expect(DEFAULT_TOAST_TONE).toBe("info");
  });

  it("传入 tone 原样保留", () => {
    expect(resolveToastSpec({ text: "失败", tone: "error" })).toEqual({ text: "失败", tone: "error" });
  });

  it("公开 tone 涂装对齐 Button：error→danger，info→accent", () => {
    const paints: Record<ToastTone, string> = {
      success: "success",
      error: "danger",
      info: "accent",
    };
    for (const tone of Object.keys(paints) as ToastTone[]) {
      expect(toastPaintTone(tone)).toBe(paints[tone]);
    }
  });
});
