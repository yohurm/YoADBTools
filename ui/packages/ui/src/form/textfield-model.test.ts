import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Density } from "../tokens/density";
import { Stroke } from "../tokens/layout";
import {
  DEFAULT_TEXT_FIELD_MAX_ROWS,
  DEFAULT_TEXT_FIELD_ROWS,
  DEFAULT_TEXT_FIELD_STATUS,
  hasTextFieldSlot,
  resolveTextFieldActive,
  resolveTextFieldMaxRows,
  resolveTextFieldMultiline,
  resolveTextFieldRows,
  canStepTextFieldNumber,
  parseTextFieldNumber,
  resolveTextFieldBound,
  resolveTextFieldSpec,
  resolveTextFieldStatus,
  resolveTextFieldStep,
  resolveTextFieldStepper,
  resolveTextFieldWidthKind,
  stepTextFieldNumber,
  textFieldLineBoxPx,
  textFieldPaintKind,
  DEFAULT_TEXT_FIELD_STEP,
} from "./textfield-model";

describe("textfield-model", () => {
  it("缺省 status 是 none，涂装 neutral", () => {
    expect(resolveTextFieldSpec({})).toEqual({
      status: DEFAULT_TEXT_FIELD_STATUS,
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false, tokens: false },
      width: "hug",
      active: false,
      multiline: false,
      rows: 1,
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

  it("写入盒只 clip，Token 算占槽", () => {
    expect(resolveTextFieldSpec({ tokens: true }).slots.tokens).toBe(true);
    expect(hasTextFieldSlot({})).toBe(true);
  });

  it("不再导出 TEXT_FIELD_STATUSES / TEXT_FIELD_CONTROL_OVERFLOW", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/textfield-model.ts"),
      resolve(process.cwd(), "packages/ui/src/form/textfield-model.ts"),
    ];
    const src = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/\bTEXT_FIELD_STATUSES\b/);
    expect(src).not.toMatch(/\bTEXT_FIELD_CONTROL_OVERFLOW\b/);
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
    ).toEqual({ prefix: true, suffix: false, addonBefore: true, addonAfter: false, tokens: false });
  });

  it("宽度：显式 width 优先，否则 block → number → hug", () => {
    expect(resolveTextFieldWidthKind({})).toBe("hug");
    expect(resolveTextFieldWidthKind({ type: "number" })).toBe("number");
    expect(resolveTextFieldWidthKind({ type: "number", block: true })).toBe("fill");
    expect(resolveTextFieldWidthKind({ width: "control" })).toBe("control");
    expect(resolveTextFieldWidthKind({ width: "control", block: true })).toBe("control");
    expect(resolveTextFieldSpec({ type: "number" }).width).toBe("number");
    expect(resolveTextFieldSpec({ block: true }).width).toBe("fill");
    expect(resolveTextFieldSpec({ width: "control" }).width).toBe("control");
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
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false, tokens: false },
      width: "hug",
      active: true,
      multiline: false,
      rows: 1,
    });
    expect(textFieldPaintKind(resolveTextFieldSpec({ active: true }).status)).toBe("neutral");
  });

  it("multiline 同一门面：缺省 2 行，不当数字槽", () => {
    expect(resolveTextFieldMultiline()).toBe(false);
    expect(resolveTextFieldRows({})).toBe(1);
    expect(resolveTextFieldRows({ multiline: true })).toBe(DEFAULT_TEXT_FIELD_ROWS);
    expect(resolveTextFieldRows({ multiline: true, rows: 1 })).toBe(1);
    expect(resolveTextFieldWidthKind({ type: "number", multiline: true })).toBe("hug");
    expect(resolveTextFieldSpec({ multiline: true, block: true })).toEqual({
      status: DEFAULT_TEXT_FIELD_STATUS,
      slots: { prefix: false, suffix: false, addonBefore: false, addonAfter: false, tokens: false },
      width: "fill",
      active: false,
      multiline: true,
      rows: 2,
    });
  });

  it("弱多行 L2 只给下限与帽，不从字符串推行数", () => {
    const files = [
      resolve(process.cwd(), "src/form/textfield-model.ts"),
      resolve(process.cwd(), "packages/ui/src/form/textfield-model.ts"),
    ];
    const src = files.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toContain("countTextFieldLines");
    expect(src).not.toContain("resolveTextFieldGrowRows");
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 1 })).toBe(DEFAULT_TEXT_FIELD_MAX_ROWS);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 8 })).toBe(8);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 1, maxRows: 4 })).toBe(4);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 3, maxRows: 2 })).toBe(DEFAULT_TEXT_FIELD_MAX_ROWS);
    expect(resolveTextFieldMaxRows({ value: "a\nb" } as { multiline?: boolean })).toBe(1);
  });

  it("单行 number 才画步进，multiline 不当数字槽", () => {
    expect(resolveTextFieldStepper({})).toBe(false);
    expect(resolveTextFieldStepper({ type: "text" })).toBe(false);
    expect(resolveTextFieldStepper({ type: "number" })).toBe(true);
    expect(resolveTextFieldStepper({ type: "number", multiline: true })).toBe(false);
  });

  it("步进：空值当 0，默认步长 1，触边夹取", () => {
    expect(resolveTextFieldStep()).toBe(DEFAULT_TEXT_FIELD_STEP);
    expect(resolveTextFieldStep(0)).toBe(DEFAULT_TEXT_FIELD_STEP);
    expect(resolveTextFieldStep(-2)).toBe(DEFAULT_TEXT_FIELD_STEP);
    expect(resolveTextFieldStep(0.5)).toBe(0.5);
    expect(resolveTextFieldBound()).toBeUndefined();
    expect(resolveTextFieldBound(Number.NaN)).toBeUndefined();
    expect(parseTextFieldNumber("")).toBeUndefined();
    expect(parseTextFieldNumber("12")).toBe(12);
    expect(stepTextFieldNumber({ value: "", direction: 1 })).toBe("1");
    expect(stepTextFieldNumber({ value: "0", direction: 1 })).toBe("1");
    expect(stepTextFieldNumber({ value: "1", direction: -1, min: 0 })).toBe("0");
    expect(stepTextFieldNumber({ value: "0", direction: -1, min: 0 })).toBe("0");
    expect(stepTextFieldNumber({ value: "10", direction: 1, max: 10 })).toBe("10");
    expect(stepTextFieldNumber({ value: "1", direction: 1, step: 0.5 })).toBe("1.5");
    expect(canStepTextFieldNumber({ value: "0", direction: -1, min: 0 })).toBe(false);
    expect(canStepTextFieldNumber({ value: "10", direction: 1, max: 10 })).toBe(false);
    expect(canStepTextFieldNumber({ value: "", direction: -1, min: 0 })).toBe(true);
    expect(canStepTextFieldNumber({ value: "5", direction: 1, max: 10 })).toBe(true);
  });
});
