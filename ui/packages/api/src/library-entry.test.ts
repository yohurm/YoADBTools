import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { entryIsBlock, entryIsCommand } from "./library-entry";

describe("库条目种类", () => {
  it("命令和命令块各判一次", () => {
    expect(entryIsCommand({ kind: "command" })).toBe(true);
    expect(entryIsCommand({ kind: "block" })).toBe(false);
    expect(entryIsBlock({ kind: "block" })).toBe(true);
    expect(entryIsBlock({ kind: "line" })).toBe(false);
  });

  it("command / block 只写在库条目", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "library-entry.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/terminal/src/command-line.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("library-entry.ts")) {
        body = body.replace('return entry.kind === "command"', "").replace('return entry.kind === "block"', "");
      }
      if (path.endsWith("types.ts")) body = body.replace('export type LibraryEntryKind = "command" | "block";', "");
      expect(body, path).not.toContain('kind === "command"');
      expect(body, path).not.toContain('kind === "block"');
      expect(body, path).not.toContain("ImportEntryKind");
      if (!path.endsWith("types.ts")) expect(body, path).not.toContain('"command" | "block"');
    }
  });
});
