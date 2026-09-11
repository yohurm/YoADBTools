import { describe, expect, it } from "vitest";
import { Density } from "../tokens/density";
import { Stroke } from "../tokens/layout";
import {
  DEFAULT_TEXT_FIELD_STATUS,
  hasTextFieldSlot,
  resolveTextFieldActive,
  resolveTextFieldSpec,
  resolveTextFieldStatus,
  resolveTextFieldWidthKind,
  textFieldLineBoxPx,
  textFieldPaintKind,
} from "./textfield-model";

describe("textfield-model", () => {
  it("缺省 status 是 none，涂装 neutral", () => {
    expect(resolveTextFieldSpec({})).toEqual({
      status: DEFAULT_TEXT_FIELD_STATUS,
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false },
      width: "hug",
      active: false,
    });
    expect(textFieldPaintKind("none")).toBe("neutral");
  });

  it("error / warning 原样保留并映射涂装", () => {
    expect(resolveTextFieldStatus("error")).toBe("error");
    expect(resolveTextFieldStatus("warning")).toBe("warning");
    expect(textFieldPaintKind("error")).toBe("error");
    expect(textFieldPaintKind("warning")).toBe("warning");
  });

  it("未知 status 归一成 none，不留别名", () => {
    expect(resolveTextFieldStatus("success")).toBe("none");
    expect(resolveTextFieldStatus("invalid")).toBe("none");
    expect(resolveTextFieldStatus(undefined)).toBe("none");
  });

  it("空槽不算占位，非空缀与附加算占位", () => {
    expect(hasTextFieldSlot(undefined)).toBe(false);
    expect(hasTextFieldSlot(null)).toBe(false);
    expect(hasTextFieldSlot(false)).toBe(false);
    expect(hasTextFieldSlot("")).toBe(false);
    expect(hasTextFieldSlot("search")).toBe(true);
    expect(hasTextFieldSlot("http://")).toBe(true);

    expect(
      resolveTextFieldSpec({
        prefix: "search",
        suffix: "",
        addonBefore: "https://",
        addonAfter: false,
        status: "error",
      }).slots,
    ).toEqual({ prefix: true, suffix: false, addonBefore: true, addonAfter: false });
  });

  it("宽度：默认 hug，number 次之，block 优先", () => {
    expect(resolveTextFieldWidthKind({})).toBe("hug");
    expect(resolveTextFieldWidthKind({ type: "number" })).toBe("number");
    expect(resolveTextFieldWidthKind({ type: "number", block: true })).toBe("fill");
    expect(resolveTextFieldSpec({ type: "number" }).width).toBe("number");
    expect(resolveTextFieldSpec({ block: true }).width).toBe("fill");
  });

  it("写入盒 = 铬高 − 两侧 hairline，随密度变", () => {
    expect(textFieldLineBoxPx(Density.Comfortable.controlHeight)).toBe(
      Density.Comfortable.controlHeight - Stroke.Hairline * 2,
    );
    expect(textFieldLineBoxPx(Density.Compact.controlHeight)).toBe(
      Density.Compact.controlHeight - Stroke.Hairline * 2,
    );
    expect(textFieldLineBoxPx(Density.Comfortable.controlHeight)).toBe(30);
    expect(textFieldLineBoxPx(Density.Compact.controlHeight)).toBe(24);
  });

  it("active 与 status 正交，默认关", () => {
    expect(resolveTextFieldActive()).toBe(false);
    expect(resolveTextFieldActive(false)).toBe(false);
    expect(resolveTextFieldActive(true)).toBe(true);
    expect(resolveTextFieldSpec({ active: true }).active).toBe(true);
    expect(resolveTextFieldSpec({ active: true, status: "error" })).toEqual({
      status: "error",
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false },
      width: "hug",
      active: true,
    });
    expect(textFieldPaintKind(resolveTextFieldSpec({ active: true }).status)).toBe("neutral");
  });
});
