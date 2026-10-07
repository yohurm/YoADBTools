import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { entryIsDir, entryIsFile, entryIsSymlink } from "./entry-kind";

describe("条目种类", () => {
  it("目录、文件、链接各判一次", () => {
    expect(entryIsDir("dir")).toBe(true);
    expect(entryIsDir("symlink")).toBe(false);
    expect(entryIsFile("file")).toBe(true);
    expect(entryIsFile("dir")).toBe(false);
    expect(entryIsSymlink("symlink")).toBe(true);
    expect(entryIsSymlink("file")).toBe(false);
  });

  it("清单和图标不再自己比种类", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "entry-kind.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/files/src/model.ts"),
      resolve(here, "../../ui/src/file-glyph.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("entry-kind.ts")) {
        body = body.replace('return kind === "dir"', "").replace('return kind === "file"', "").replace('return kind === "symlink"', "");
      }
      if (path.endsWith("types.ts")) {
        body = body.replace('export type EntryKind = "dir" | "file" | "symlink" | "other";', "");
      }
      expect(body, path).not.toContain('kind === "dir"');
      expect(body, path).not.toContain('kind === "file"');
      expect(body, path).not.toContain('kind === "symlink"');
      expect(body, path).not.toContain("FileIconKind");
      if (!path.endsWith("types.ts")) expect(body, path).not.toContain('"dir" | "file" | "symlink" | "other"');
    }
  });
});
