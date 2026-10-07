import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SAFETY_ROOTS } from "./identity";
import {
  checkDescendant,
  guardBrowsePath,
  ENTRY_NAME_EMPTY,
  ENTRY_NAME_SEPARATOR,
  invalidNameText,
  notAbsoluteText,
  outsideRootText,
  traversalText,
  joinPath,
  parentOf,
  parentWithinSafety,
  splitPath,
  validateEntryName,
  type PathGuardError,
} from "./safety";

const root = dirname(fileURLToPath(import.meta.url));
const algebra = resolve(root, "../../../../core/yohu-domain/testdata/path_algebra.json");
const safetyRoot = resolve(root, "../../../../core/yohu-domain/testdata/safety_root.json");
const entryName = resolve(root, "../../../../core/yohu-domain/testdata/entry_name.json");

type AlgebraCase = {
  op: string;
  dir?: string;
  name?: string;
  path?: string;
  parent?: string | null;
  segments?: string[];
  ok?: boolean;
};

describe("safety（与 domain testdata 同一套向量）", () => {
  const cases = JSON.parse(readFileSync(algebra, "utf8")) as AlgebraCase[];

  it.each(cases)("$op $path$dir", (c) => {
    switch (c.op) {
      case "join":
        expect(joinPath(c.dir ?? "", c.name ?? "")).toBe(c.path);
        break;
      case "parent":
        expect(parentOf(c.path ?? "")).toBe(c.parent ?? null);
        break;
      case "segments":
        expect(splitPath(c.path ?? "")).toEqual(c.segments);
        break;
      case "parent_within":
        expect(parentWithinSafety(c.path ?? "", SAFETY_ROOTS)).toBe(c.parent ?? null);
        break;
      case "descendant":
        expect(checkDescendant(c.path ?? "").ok).toBe(c.ok);
        break;
      default:
        throw new Error(`unknown op ${c.op}`);
    }
  });

  const browse = JSON.parse(readFileSync(safetyRoot, "utf8")) as {
    path: string;
    ok?: boolean;
    normalized?: string;
    error?: PathGuardError;
  }[];

  it.each(browse)("guard $path", (c) => {
    const result = guardBrowsePath(c.path);
    if (c.ok) {
      expect(result.ok).toBe(true);
      if (result.ok && c.normalized) expect(result.path).toBe(c.normalized);
      return;
    }
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(c.error);
    if (c.error === "outside_root") expect(result.reason).toBe(outsideRootText(c.path));
    if (c.error === "not_absolute") expect(result.reason).toBe(notAbsoluteText(c.path));
    if (c.error === "traversal") expect(result.reason).toBe(traversalText(c.path));
  });

  const names = JSON.parse(readFileSync(entryName, "utf8")) as {
    name: string;
    valid: boolean;
    detail?: string;
  }[];

  it.each(names)("name=$name", (c) => {
    if (c.valid) {
      expect(validateEntryName(c.name)).toBeNull();
      expect(c.detail).toBeUndefined();
      return;
    }
    expect(validateEntryName(c.name)).toBe(invalidNameText(c.detail ?? ""));
  });

  it("空名和分隔符载荷只写一次", () => {
    const src = readFileSync(resolve(root, "safety.ts"), "utf8");
    expect(src.split(ENTRY_NAME_EMPTY).length - 1).toBe(1);
    expect(src.split(ENTRY_NAME_SEPARATOR).length - 1).toBe(1);
  });

  it("根前缀只写一次", () => {
    const owner = readFileSync(resolve(root, "safety.ts"), "utf8").replace(
      "return path.startsWith(`${root}/`)",
      "",
    );
    expect(owner).not.toContain("path.startsWith(`${root}/`)");
    expect(owner).not.toContain("path === root || path.startsWith");
  });

  it("绝对路径和尾斜杠只写一次", () => {
    const owner = readFileSync(resolve(root, "safety.ts"), "utf8");
    expect(owner).toContain('return path.startsWith("/");');
    expect(owner).toContain('return path.replace(/\\/+$/, "");');
    const files = readdirSync(root).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of files) {
      let body = readFileSync(resolve(root, name), "utf8");
      if (name === "safety.ts") {
        body = body.replace('return path.startsWith("/");', "").replace('return path.replace(/\\/+$/, "");', "");
      }
      expect(body, name).not.toContain('startsWith("/")');
      expect(body, name).not.toContain('replace(/\\/+$/, "")');
    }
  });
});
