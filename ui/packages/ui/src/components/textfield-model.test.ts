import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_FIELD_STATUS,
  hasTextFieldSlot,
  resolveTextFieldSpec,
  resolveTextFieldStatus,
  textFieldPaintKind,
} from "./textfield-model";

describe("textfield-model", () => {
  it("缺省 status 是 none，涂装 neutral", () => {
    expect(resolveTextFieldSpec({})).toEqual({
      status: DEFAULT_TEXT_FIELD_STATUS,
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false },
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
});
