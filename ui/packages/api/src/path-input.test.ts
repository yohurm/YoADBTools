import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseRemotePath, type PathStrategy } from "./path-input";

const testdata = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../core/yohu-domain/testdata/path_input.json",
);

type Case = {
  raw: string;
  current: string;
  ok: boolean;
  path?: string;
  reason?: string;
  applied?: PathStrategy[];
};

const cases = JSON.parse(readFileSync(testdata, "utf8")) as Case[];

describe("parseRemotePath（与 domain testdata/path_input.json 同一套向量）", () => {
  it.each(cases)("$raw", (c) => {
    const got = parseRemotePath(c.raw, c.current);
    expect(got.ok).toBe(c.ok);
    if (got.ok) {
      if (c.path != null) expect(got.path).toBe(c.path);
      for (const step of c.applied ?? []) expect(got.applied).toContain(step);
      return;
    }
    if (c.reason != null) expect(got.reason).toBe(c.reason);
  });
});
