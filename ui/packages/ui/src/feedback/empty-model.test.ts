import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveEmptyStateSpec } from "./empty-model";

describe("empty-model", () => {
  it("只要标题时没有插画 / 描述 / action / fill", () => {
    expect(resolveEmptyStateSpec({ title: "空" })).toEqual({
      title: "空",
      description: undefined,
      hasIcon: false,
      hasAction: false,
      fill: false,
      size: "md",
    });
  });

  it("空字符串描述视为没有描述", () => {
    expect(resolveEmptyStateSpec({ title: "空", description: "" }).description).toBeUndefined();
  });

  it("插画与 action 是独立开关", () => {
    expect(
      resolveEmptyStateSpec({ title: "空", description: "说明", hasIcon: true, hasAction: true }),
    ).toEqual({
      title: "空",
      description: "说明",
      hasIcon: true,
      hasAction: true,
      fill: false,
      size: "md",
    });
  });

  it("fill 是独立开关", () => {
    expect(resolveEmptyStateSpec({ title: "空", fill: true }).fill).toBe(true);
  });

  it("size 只认 sm，其余回落 md", () => {
    expect(resolveEmptyStateSpec({ title: "空", size: "sm" }).size).toBe("sm");
    expect(resolveEmptyStateSpec({ title: "空", size: "md" }).size).toBe("md");
  });

  it("小号只在模型里比较一次", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const model = readFileSync(resolve(dir, "empty-model.ts"), "utf8");
    const policy = readFileSync(resolve(dir, "empty-policy.ts"), "utf8");
    const view = readFileSync(resolve(dir, "EmptyState.tsx"), "utf8");
    const body = model.replace('return size === "sm"', "").replace('export type EmptyStateSize = "md" | "sm";', "");
    expect(body).not.toContain('=== "sm"');
    expect(body).not.toContain('"md" | "sm"');
    expect(policy).not.toContain('=== "sm"');
    expect(policy).not.toContain('"md" | "sm"');
    expect(view).not.toContain('"md" | "sm"');
    expect(policy).toContain("emptySizeIsSm");
  });
});
