import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("视图不再用原文真值决定槽位", () => {
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Toast.tsx"), "utf8");
    expect(view).not.toContain("Show when={props.toast.leading}");
    expect(view).not.toContain("Show when={props.toast.detail}");
    expect(view).not.toContain("Show when={props.toast.progress}");
    expect(view).not.toContain("Show when={props.toast.meta}");
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

  it("可选提示文本去空白缺省空串只写一处", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "toast-model.ts"), "utf8");
    const needle = ".trim() " + "?? \"\"";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("trimmedToastText(input.detail)");
    expect(source).toContain("trimmedToastText(input.leading)");
    expect(source).toContain("trimmedToastText(input.meta)");
    expect(source).toContain("patchedToastText(patch.detail, item.detail)");
    expect(source).toContain("patchedToastText(patch.meta, item.meta)");
  });

  it("补丁文本有则去空白无则保留只写一处", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "toast-model.ts"), "utf8");
    const needle = "!== undefined ? " + "next.trim()";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("patchedToastText(patch.leading, item.leading)");
    expect(source).not.toContain("trimmedToastText(patch.");
  });
});
