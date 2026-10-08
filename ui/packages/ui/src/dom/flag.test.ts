import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { closedAttr, flagAttr, flagIsOn, presenceAttr, presenceIsOn, trueAttr } from "./flag";

function productionSources(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionSources(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
    if (name === "flag.ts") continue;
    out.push(readFileSync(full, "utf8"));
  }
  return out;
}

describe("flag attr", () => {
  it("开写成 true，关写成 false", () => {
    expect(flagAttr(true)).toBe("true");
    expect(flagAttr(false)).toBe("false");
    expect(flagIsOn("true")).toBe(true);
    expect(flagIsOn("false")).toBe(false);
  });

  it("存在性旗是空串，不在则不写", () => {
    expect(presenceAttr(true)).toBe("");
    expect(presenceAttr(false)).toBeUndefined();
    expect(presenceIsOn("")).toBe(true);
    expect(presenceIsOn(undefined)).toBe(false);
  });

  it("开着写成 true，关着省略", () => {
    expect(trueAttr(true)).toBe(true);
    expect(trueAttr(false)).toBeUndefined();
  });

  it("关掉写成 true，开着省略", () => {
    expect(closedAttr(false)).toBe(true);
    expect(closedAttr(true)).toBeUndefined();
  });

  it("勾选和展开不再各自编码 true/false", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const sources = productionSources(root);
    expect(sources.length).toBeGreaterThan(10);
    for (const src of sources) {
      expect(src).not.toContain('? "true" : "false"');
      expect(src).not.toContain('=== "true"');
      expect(src).not.toContain('? "" : undefined');
      expect(src).not.toContain('? "true" : undefined');
      expect(src).not.toMatch(/["']data-[a-z0-9-]+["']:\s*[^;\n]*\? true : undefined/);
      expect(src).not.toMatch(/data-[a-z0-9-]+=\{[^}]*\? true\s*:/);
      expect(src).not.toMatch(/when=\{!?[a-zA-Z0-9().]*\["data-[a-z0-9-]+"\]\}/);
      expect(src).not.toMatch(/Boolean\([^)\n]*\["data-[a-z0-9-]+"\]\)/);
      expect(src).not.toMatch(/\["data-[a-z0-9-]+"\]\s*===\s*""/);
      expect(src).not.toContain('dataset.placed = "true"');
      expect(src).not.toContain("!props.open || undefined");
      expect(src).not.toContain("!open() || undefined");
      expect(src).not.toContain("? true : undefined");
      expect(src).not.toContain("!props.open ? true : undefined");
    }
  });
});
