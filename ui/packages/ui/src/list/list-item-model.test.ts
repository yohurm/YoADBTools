import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  listItemRingIsInset,
  listItemRoleIsButton,
  listItemSizeIsDevice,
  listItemSizeIsNav,
  resolveListItemSpec,
} from "./list-item-model";

const here = dirname(fileURLToPath(import.meta.url));

describe("list item shape", () => {
  it("按钮行、设备行高、内收环各只比一次", () => {
    expect(listItemRoleIsButton("button")).toBe(true);
    expect(listItemRoleIsButton("option")).toBe(false);
    expect(listItemRoleIsButton(undefined)).toBe(false);
    expect(listItemSizeIsDevice("device")).toBe(true);
    expect(listItemSizeIsNav("nav")).toBe(true);
    expect(listItemSizeIsNav("device")).toBe(false);
    expect(listItemRingIsInset("inset")).toBe(true);
    expect(listItemRingIsInset(undefined)).toBe(false);
    expect(resolveListItemSpec({}).size).toBe("nav");
    expect(resolveListItemSpec({ role: "button", current: true }).role).toBe("button");

    const model = readFileSync(resolve(here, "list-item-model.ts"), "utf8")
      .replace('return role === "button"', "")
      .replace('return size === "device"', "")
      .replace('return ring === "inset"', "");
    const policy = readFileSync(resolve(here, "list-item-policy.ts"), "utf8");
    const view = readFileSync(resolve(here, "ListItem.tsx"), "utf8");
    for (const [name, text] of [
      ["model", model],
      ["policy", policy],
      ["view", view],
    ] as const) {
      expect(text, name).not.toContain('=== "button"');
      expect(text, name).not.toContain('=== "option"');
      expect(text, name).not.toContain('=== "device"');
      expect(text, name).not.toContain('=== "nav"');
      expect(text, name).not.toContain('=== "inset"');
      expect(text, name).not.toContain('!== "nav"');
      expect(text, name).not.toContain("Boolean(props.selected)");
    }
  });
});
