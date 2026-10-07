import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { moduleIsActive, moduleIsPlanned } from "./registry";

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionSources(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      if (!entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) out.push(path);
    }
  }
  return out;
}

describe("壳不转出邻层", () => {
  it("不再把 @yohu/api 或 @yohu/ui 再导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = productionSources(root).filter((file) =>
      /export\s+(type\s+)?\{[^}]*\}\s+from\s+"@yohu\/(api|ui)"/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("模块是否当前、是否占位", () => {
  it("当前 id 与占位标记", () => {
    expect(moduleIsActive("terminal", "terminal")).toBe(true);
    expect(moduleIsActive("terminal", "files")).toBe(false);
    expect(moduleIsPlanned({ isPlanned: true })).toBe(true);
    expect(moduleIsPlanned({ isPlanned: false })).toBe(false);
    expect(moduleIsPlanned({})).toBe(false);
  });

  it("生产源不再自己比导航 id 或占位标记", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("registry.ts")) {
        body = body
          .replace("return moduleId === activeId;", "")
          .replace("return mod.isPlanned === true;", "");
      }
      expect(body, file).not.toContain("=== props.activeId");
      expect(body, file).not.toContain("=== navStore.activeModuleId()");
      expect(body, file).not.toContain("mod.isPlanned");
      expect(body, file).not.toContain(".isPlanned");
    }
  });
});
