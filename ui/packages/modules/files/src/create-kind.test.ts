import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createKindFieldLabel, createKindSeed, createKindTitle } from "./create-kind";

describe("createKind", () => {
  it("标题和默认名各一句", () => {
    expect(createKindTitle("file")).toBe("新建文件");
    expect(createKindTitle("dir")).toBe("新建目录");
    expect(createKindFieldLabel("file")).toBe("新文件名");
    expect(createKindFieldLabel("dir")).toBe("新目录名");
    expect(createKindSeed("file")).toBe("新建文件.txt");
    expect(createKindSeed("dir")).toBe("新建文件夹");
  });

  it("目录只由 entryIsDir 判定", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('=== "dir"');
    }
  });
});
