import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Density } from "../tokens/density";
import { Stroke } from "../tokens/layout";
import {
  DEFAULT_TEXT_FIELD_MAX_ROWS,
  DEFAULT_TEXT_FIELD_ROWS,
  DEFAULT_TEXT_FIELD_STATUS,
  countTextFieldLines,
  hasTextFieldSlot,
  resolveTextFieldActive,
  resolveTextFieldGrowRows,
  resolveTextFieldMaxRows,
  resolveTextFieldMultiline,
  resolveTextFieldRows,
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

  it("弱多行按硬换行抬高，空串 1 行，帽默认 6", () => {
    expect(countTextFieldLines(undefined)).toBe(1);
    expect(countTextFieldLines("")).toBe(1);
    expect(countTextFieldLines("adb")).toBe(1);
    expect(countTextFieldLines("a\nb\nc")).toBe(3);
    expect(countTextFieldLines("a\n")).toBe(2);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 1 })).toBe(DEFAULT_TEXT_FIELD_MAX_ROWS);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 8 })).toBe(8);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 1, maxRows: 4 })).toBe(4);
    expect(resolveTextFieldMaxRows({ multiline: true, rows: 3, maxRows: 2 })).toBe(DEFAULT_TEXT_FIELD_MAX_ROWS);
    expect(resolveTextFieldGrowRows({ multiline: true, rows: 1, value: "" })).toBe(1);
    expect(resolveTextFieldGrowRows({ multiline: true, rows: 1, value: "a\nb\nc" })).toBe(3);
    expect(
      resolveTextFieldGrowRows({
        multiline: true,
        rows: 1,
        value: "1\n2\n3\n4\n5\n6\n7\n8",
      }),
    ).toBe(DEFAULT_TEXT_FIELD_MAX_ROWS);
    expect(resolveTextFieldGrowRows({ value: "a\nb" })).toBe(1);
  });
});
