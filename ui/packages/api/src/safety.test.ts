import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SAFETY_ROOTS } from "./identity";
import {
  checkDescendant,
  guardBrowsePath,
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
    if (!result.ok) expect(result.error).toBe(c.error);
  });

  const names = JSON.parse(readFileSync(entryName, "utf8")) as { name: string; valid: boolean }[];

  it.each(names)("name=$name", (c) => {
    expect(validateEntryName(c.name) === null).toBe(c.valid);
  });
});
