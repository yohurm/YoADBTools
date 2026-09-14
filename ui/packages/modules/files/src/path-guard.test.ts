/**
 * path-guard 与 core SafetyRoot::check 共用 testdata/safety_root.json。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { guardBrowsePath, type PathGuardError } from "./path-guard";

describe("guardBrowsePath（与 domain testdata/safety_root.json 同一套向量）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/safety_root.json",
  );
  const fixture: {
    path: string;
    ok?: boolean;
    normalized?: string;
    error?: PathGuardError;
  }[] = JSON.parse(readFileSync(testdata, "utf8")) as {
    path: string;
    ok?: boolean;
    normalized?: string;
    error?: PathGuardError;
  }[];

  it.each(fixture)("$path", (c) => {
    const result = guardBrowsePath(c.path);
    if (c.ok) {
      expect(result.ok).toBe(true);
      if (result.ok && c.normalized) expect(result.path).toBe(c.normalized);
      return;
    }
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(c.error);
  });
});
