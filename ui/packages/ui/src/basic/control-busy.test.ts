import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  controlBusyAttr,
  controlIsBlock,
  controlIsChecked,
  controlIsDisabled,
  resolveControlBusy,
} from "./control-busy";

describe("control busy", () => {
  it("默认可点且不报 busy", () => {
    expect(resolveControlBusy({})).toEqual({ disabled: false, busy: false });
    expect(controlBusyAttr(false)).toBeUndefined();
  });

  it("disabled 关掉输入", () => {
    expect(controlIsDisabled(undefined)).toBe(false);
    expect(controlIsDisabled(false)).toBe(false);
    expect(controlIsDisabled(true)).toBe(true);
    expect(controlIsBlock(undefined)).toBe(false);
    expect(controlIsBlock(true)).toBe(true);
    expect(resolveControlBusy({ disabled: true })).toEqual({ disabled: true, busy: false });
  });

  it("loading 同时禁用并报 busy", () => {
    expect(resolveControlBusy({ loading: true })).toEqual({ disabled: true, busy: true });
    expect(controlBusyAttr(true)).toBe(true);
  });

  it("disabled 与 loading 同时出现仍禁用", () => {
    expect(resolveControlBusy({ disabled: true, loading: true })).toEqual({
      disabled: true,
      busy: true,
    });
  });

  it("缺省不算勾选", () => {
    expect(controlIsChecked({})).toBe(false);
    expect(controlIsChecked({ checked: false })).toBe(false);
    expect(controlIsChecked({ checked: true })).toBe(true);
  });

  it("勾选只在控件忙这份上判定", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const bodies = productionBodies(src, "basic/control-busy.ts", "return Boolean(input.checked);");
    expect(bodies.length).toBeGreaterThan(10);
    for (const body of bodies) expect(body).not.toContain("Boolean(input.checked)");
  });

  it("按钮和图标按钮不再各自写 loading 判定", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const sources = productionSources(root);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(src).not.toContain("Boolean(input.loading)");
      expect(src).not.toContain("Boolean(input.disabled)");
      expect(src).not.toContain("Boolean(host().disabled)");
      expect(src).not.toContain("Boolean(options?.groupDisabled)");
      expect(src).not.toContain("selectIsDisabled");
      expect(src).not.toContain("Boolean(input.block)");
      expect(src).not.toContain("Boolean(block)");
      expect(src).not.toContain("resolveChipBlock");
      expect(src).not.toContain("Boolean(input.readOnly)");
      expect(src).not.toContain("host().disabled || host().readOnly");
      expect(src).not.toContain("interactive.busy ? true : undefined");
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

function productionSources(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionSources(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.") || name === "control-busy.ts") continue;
    out.push(readFileSync(full, "utf8"));
  }
  return out;
}
