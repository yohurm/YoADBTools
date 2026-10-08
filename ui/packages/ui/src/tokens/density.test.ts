import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Density, densityIsCompact, densityScale } from "./density";
import { getDensity, setDensity } from "./index";

describe("密度", () => {
  it("紧凑只判一次，缺省是 comfortable", () => {
    expect(densityIsCompact("compact")).toBe(true);
    expect(densityIsCompact("comfortable")).toBe(false);
    expect(densityIsCompact(null)).toBe(false);
    expect(densityScale("compact")).toBe(Density.Compact);
    expect(densityScale("comfortable")).toBe(Density.Comfortable);
    setDensity("compact");
    expect(getDensity()).toBe("compact");
    expect(densityIsCompact(getDensity())).toBe(true);
    setDensity("comfortable");
    expect(getDensity()).toBe("comfortable");
  });
});

describe("紧凑密度只写一处", () => {
  it("生产源里只有 densityIsCompact 比较 compact", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === "node_modules") continue;
          walk(path);
          continue;
        }
        if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test.")) files.push(path);
      }
    };
    walk(packages);
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith(`${join("tokens", "density.ts")}`)) {
        body = body.replace('return name === "compact"', "");
      }
      expect(body, path).not.toContain('name === "compact"');
      expect(body, path).not.toContain('getAttribute("data-density") === "compact"');
    }
  });
});
