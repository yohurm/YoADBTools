import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ModuleId } from "@yohu/api";

import { mirrorPresentShouldBeActive } from "./mirror-present";

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionSources(path));
    else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.")
    ) {
      out.push(path);
    }
  }
  return out;
}

describe("mirrorPresentShouldBeActive", () => {
  it("只有投屏模块激活舞台", () => {
    expect(mirrorPresentShouldBeActive(ModuleId.Mirror)).toBe(true);
    expect(mirrorPresentShouldBeActive(ModuleId.Terminal)).toBe(false);
    expect(mirrorPresentShouldBeActive(undefined)).toBe(false);
  });

  it("模块身份只在 mirror-present 里比较", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("mirror-present.ts")) {
        body = body.replace("return moduleId === ModuleId.Mirror;", "");
      }
      expect(body, file).not.toContain("ModuleId.Mirror");
    }
  });
});
