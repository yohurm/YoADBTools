import { readdirSync, readFileSync } from "node:fs";
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

describe("空路径句子只写一次", () => {
  it("剥掉所有者后再扫生产文件", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const owner = readFileSync(resolve(here, "path-input.ts"), "utf8");
    expect(owner).toContain('return fail("路径为空", applied);');
    const files = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of files) {
      let body = readFileSync(resolve(here, name), "utf8");
      if (name === "path-input.ts") body = body.replace('return fail("路径为空", applied);', "");
      expect(body, name).not.toContain('fail("路径为空"');
    }
  });
});

describe("反斜杠换成斜杠只写一次", () => {
  it("posix_slashes_once", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const needle = ".replace(/" + "\\\\" + '/g, "/")';
    const safety = readFileSync(resolve(here, "safety.ts"), "utf8");
    const input = readFileSync(resolve(here, "path-input.ts"), "utf8");
    expect(safety.split(needle).length - 1).toBe(1);
    expect(input.split(needle).length - 1).toBe(0);
    expect(input).toContain("posixSlashes(");
  });
});
