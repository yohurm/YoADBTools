import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHIP_TONE, resolveChipSpec } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";

describe("chip-model / policy", () => {
  it("缺省 tone 是 accent，无关闭", () => {
    expect(resolveChipSpec({ text: "libc" })).toEqual({
      text: "libc",
      tone: DEFAULT_CHIP_TONE,
      leading: false,
      dismiss: false,
      block: false,
    });
    expect(DEFAULT_CHIP_TONE).toBe("accent");
  });

  it("有 onDismiss 才写 data-dismiss", () => {
    expect(chipHostAttrs({ text: "libc" })["data-dismiss"]).toBeUndefined();
    expect(chipHostAttrs({ text: "libc", dismissible: true })["data-dismiss"]).toBe("");
    expect(chipHostAttrs({ text: "libc", tone: "neutral" })["data-tone"]).toBe("neutral");
  });

  it("leading 写 data-leading", () => {
    expect(chipHostAttrs({ text: "a" })["data-leading"]).toBeUndefined();
    expect(chipHostAttrs({ text: "a", leading: "folder" })["data-leading"]).toBe("");
  });

  it("block 写 data-block", () => {
    expect(chipHostAttrs({ text: "a" })["data-block"]).toBeUndefined();
    expect(chipHostAttrs({ text: "a", block: true })["data-block"]).toBe("");
  });

  it("前导空串、null、false 不算占槽；空白串算", () => {
    expect(resolveChipSpec({ text: "a", leading: "" }).leading).toBe(false);
    expect(resolveChipSpec({ text: "a", leading: null }).leading).toBe(false);
    expect(resolveChipSpec({ text: "a", leading: false }).leading).toBe(false);
    expect(resolveChipSpec({ text: "a", leading: " " }).leading).toBe(true);
  });

  it("占槽规则只留在文本槽", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const owner = "form/textfield-model.ts";
    const line = 'if (typeof value === "string") return value.length > 0;';
    const bodies = productionBodies(src, owner, line);
    expect(bodies.length).toBeGreaterThan(10);
    for (const body of bodies) {
      expect(body).not.toContain('if (typeof value === "string") return value.length > 0');
    }
  });
});

function productionBodies(root: string, owner: string, line: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionBodies(full, owner, line));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
    let text = readFileSync(full, "utf8");
    if (full.replaceAll("\\", "/").endsWith(owner)) text = text.replace(line, "");
    out.push(text);
  }
  return out;
}
