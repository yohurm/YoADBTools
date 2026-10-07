import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PREVIEW_COLLAPSE, PREVIEW_TITLE, previewEmptyDetail, previewToggleLabel } from "./preview-label";

describe("previewToggleLabel", () => {
  it("开着是收起，关着是预览", () => {
    expect(previewToggleLabel(false)).toBe(PREVIEW_TITLE);
    expect(previewToggleLabel(true)).toBe(PREVIEW_COLLAPSE);
    expect(PREVIEW_TITLE).toBe("预览");
    expect(PREVIEW_COLLAPSE).toBe("收起预览");
  });

  it("缺值是破折号，生产路径只写这一笔", () => {
    expect(previewEmptyDetail()).toBe("—");
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(root)) {
      if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
      let body = readFileSync(join(root, name), "utf8");
      if (name === "preview-label.ts") body = body.replace('return "—"', "");
      expect(body, name).not.toContain('"—"');
    }
  });
});
