import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("终端内核不转出", () => {
  it("模块不再把 @yohu/api 再导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = productionSources(root).filter((file) =>
      /export\s+(type\s+)?\{[^}]*\}\s+from\s+"@yohu\/api"/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
