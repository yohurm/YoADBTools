import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOAST_TONE,
  applyToastPatch,
  resolveToastSpec,
  toastPaintTone,
  type ToastTone,
} from "./toast-model";

describe("toast-model", () => {
  it("缺省 tone 是 info，其余槽空", () => {
    expect(resolveToastSpec({ text: "提示" })).toEqual({
      text: "提示",
      tone: DEFAULT_TOAST_TONE,
      detail: "",
      leading: "",
      sticky: false,
      progress: undefined,
      meta: "",
    });
    expect(DEFAULT_TOAST_TONE).toBe("info");
  });

  it("传入 tone / sticky / 进度原样保留", () => {
    expect(
      resolveToastSpec({
        text: "失败",
        tone: "error",
        sticky: true,
        detail: "远端不存在",
        leading: "arrow-down",
        progress: { value: 40 },
        meta: "0 / 99",
      }),
    ).toEqual({
      text: "失败",
      tone: "error",
      detail: "远端不存在",
      leading: "arrow-down",
      sticky: true,
      progress: { value: 40 },
      meta: "0 / 99",
    });
  });

  it("patch 可清进度", () => {
    const item = {
      id: 1,
      open: true,
      ...resolveToastSpec({ text: "a", progress: { value: 10 }, sticky: true }),
    };
    expect(applyToastPatch(item, { progress: null, sticky: false }).progress).toBeUndefined();
    expect(applyToastPatch(item, { progress: null, sticky: false }).sticky).toBe(false);
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
