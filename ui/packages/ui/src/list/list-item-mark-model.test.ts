import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LIST_ITEM_MARK_CLASS,
  LIST_ITEM_MARK_FILL_CLASS,
  LIST_ITEM_MARK_INSET_BLOCK_VAR,
  LIST_ITEM_MARK_WIDTH_VAR,
} from "./list-item-mark-model";

function loadMarkCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/list/Mark.css"),
    resolve(process.cwd(), "packages/ui/src/list/Mark.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("list-item-mark-model", () => {
  it("几何单源：宽 4vp、块向内缩行圆角、贴起边；填充另层", () => {
    expect(LIST_ITEM_MARK_CLASS).toBe("yohu-list-item__mark");
    expect(LIST_ITEM_MARK_FILL_CLASS).toBe("yohu-list-item__mark-fill");
    expect(LIST_ITEM_MARK_WIDTH_VAR).toBe("--yohu-space-xs");
    expect(LIST_ITEM_MARK_INSET_BLOCK_VAR).toBe("--yohu-radius-sm");
  });

  it("Mark.css 井只消费模型变量，填充才上色，禁止写死条高", () => {
    const css = loadMarkCss();
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain(`.${LIST_ITEM_MARK_CLASS}`);
    expect(css).toContain(`.${LIST_ITEM_MARK_FILL_CLASS}`);
    expect(css).toContain("inset-inline-start: 0");
    expect(css).toContain(`inset-block: var(${LIST_ITEM_MARK_INSET_BLOCK_VAR})`);
    expect(css).toContain(`width: var(${LIST_ITEM_MARK_WIDTH_VAR})`);
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("border-start-start-radius: 0");
    expect(css).toContain("border-start-end-radius: var(--yohu-radius-pill)");
    expect(css).toContain("background: var(--yohu-accent)");
    expect(css).not.toContain("border-radius: inherit");
    expect(css).not.toContain("height: var(--yohu-space-lg)");
    expect(css).not.toContain("margin-top:");
    expect(css).not.toContain("inset-inline-start: var(--yohu-space-xs)");
    expect(css).not.toContain("--yohu-stroke-emphasis");
  });
});
