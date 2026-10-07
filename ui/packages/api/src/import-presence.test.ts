import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { importAlreadyPresent } from "./import-presence";

describe("导入是否已在库", () => {
  it("已有只判一次", () => {
    expect(importAlreadyPresent("existing")).toBe(true);
    expect(importAlreadyPresent("new")).toBe(false);
  });

  it("导入勾选不再自己比 existing", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "import-presence.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/terminal/src/import-selection.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("import-presence.ts")) body = body.replace('return presence === "existing"', "");
      if (path.endsWith("types.ts")) body = body.replace('export type ImportPresence = "new" | "existing";', "");
      expect(body, path).not.toContain('presence === "existing"');
      expect(body, path).not.toContain('=== "new"');
      if (!path.endsWith("types.ts")) expect(body, path).not.toContain('"new" | "existing"');
    }
  });
});
