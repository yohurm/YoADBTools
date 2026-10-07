import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Layout } from "../tokens/layout";
import { controlIconPx } from "./control-icon";

describe("control icon px", () => {
  it("sm 用小图标，其余用中图标", () => {
    expect(controlIconPx("sm")).toBe(Layout.IconSm);
    expect(controlIconPx("md")).toBe(Layout.IconMd);
  });

  it("图标钮和分段钮不再自己换算像素", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of ["IconButton.tsx", "SegmentedButton.tsx"]) {
      const src = readFileSync(resolve(dir, name), "utf8");
      expect(src).toContain("controlIconPx");
      expect(src).not.toContain('=== "sm"');
      expect(src).not.toContain("Layout.IconSm");
      expect(src).not.toContain("Layout.IconMd");
    }
  });

  it("图标档只写在 control-icon", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of ["control-icon.ts", "icon-button-model.ts", "IconButton.tsx", "segmented-policy.ts"]) {
      let body = readFileSync(resolve(dir, name), "utf8");
      if (name === "control-icon.ts") body = body.replace('export type ControlIconSize = "sm" | "md";', "");
      expect(body, name).not.toContain('"sm" | "md"');
      expect(body, name).not.toContain("YoIconButtonSize");
      expect(body, name).not.toContain("SegmentedIconSize");
    }
    const model = readFileSync(resolve(dir, "segmented-model.ts"), "utf8");
    expect(model).toContain("ControlIconSize");
    expect(model).not.toContain("SegmentedIconSize");
  });
});
