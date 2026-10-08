import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ALLOWED = new Set([
  "export type NativeDragDropEvent = DragDropEvent;",
  "export type YoSearchControl = HTMLInputElement;",
]);

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.isDirectory()) out.push(...productionSources(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      if (!entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) out.push(path);
    }
  }
  return out;
}

describe("类型不再起第二名", () => {
  it("产品类型别名只留官方拖放负载和检索输入元素", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const offenders: string[] = [];
    for (const file of productionSources(root)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (/^export type \w+ = \w+;$/.test(trimmed) && !ALLOWED.has(trimmed)) offenders.push(`${file}: ${trimmed}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
