import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveLoadingSpec } from "./loading-model";

describe("loading-model", () => {
  it("缺省不铺满、没有描述", () => {
    expect(resolveLoadingSpec({ title: "加载中" })).toEqual({
      title: "加载中",
      description: undefined,
      cover: false,
      fill: false,
    });
  });

  it("空字符串描述视为没有描述", () => {
    expect(resolveLoadingSpec({ title: "加载中", description: "" }).description).toBeUndefined();
  });

  it("cover 铺满", () => {
    expect(resolveLoadingSpec({ title: "加载中", description: "请稍候", cover: true })).toEqual({
      title: "加载中",
      description: "请稍候",
      cover: true,
      fill: false,
    });
  });

  it("fill 与 cover 不是别名", () => {
    expect(resolveLoadingSpec({ title: "加载中", fill: true })).toEqual({
      title: "加载中",
      description: undefined,
      cover: false,
      fill: true,
    });
    expect(resolveLoadingSpec({ title: "加载中", cover: true }).fill).toBe(false);
    expect(resolveLoadingSpec({ title: "加载中", fill: true }).cover).toBe(false);
  });

  it("描述空串和 fill 只在空态模型判定", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const bodies = productionBodies(src, "feedback/empty-model.ts", [
      "return description ? description : undefined;",
      "return Boolean(input.fill);",
    ]);
    expect(bodies.length).toBeGreaterThan(10);
    for (const body of bodies) {
      expect(body).not.toContain("description ? description : undefined");
      expect(body).not.toContain("Boolean(input.fill)");
    }
  });
});

function productionBodies(root: string, owner: string, lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionBodies(full, owner, lines));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
    let text = readFileSync(full, "utf8");
    if (full.replaceAll("\\", "/").endsWith(owner)) {
      for (const line of lines) text = text.replace(line, "");
    }
    out.push(text);
  }
  return out;
}
