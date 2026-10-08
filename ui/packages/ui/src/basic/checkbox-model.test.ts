import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkboxPaintKind, checkboxToneIsSection, resolveCheckboxSpec, resolveCheckboxTone } from "./checkbox-model";

describe("checkbox-model", () => {
  it("缺省未勾选，涂装 idle", () => {
    expect(resolveCheckboxSpec({})).toEqual({ checked: false });
    expect(checkboxPaintKind({ checked: false })).toBe("idle");
  });

  it("checked 原样保留并映射涂装", () => {
    expect(resolveCheckboxSpec({ checked: true })).toEqual({ checked: true });
    expect(checkboxPaintKind({ checked: true })).toBe("checked");
  });

  it("分组墨水只比一次 section", () => {
    expect(checkboxToneIsSection("section")).toBe(true);
    expect(checkboxToneIsSection("body")).toBe(false);
    expect(checkboxToneIsSection()).toBe(false);
    expect(resolveCheckboxTone("section")).toBe("section");
    expect(resolveCheckboxTone("other")).toBe("body");
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["checkbox-model.ts", "checkbox-policy.ts", "Checkbox.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "checkbox-model.ts") body = body.replace('return tone === "section"', "");
      expect(body, name).not.toContain('=== "section"');
      expect(body, name).not.toContain('=== "body"');
    }
  });
});
