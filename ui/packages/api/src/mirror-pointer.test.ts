import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { mirrorPointerCaptures, mirrorPointerReleases } from "./mirror-pointer";

describe("投屏指针", () => {
  it("按下抓住，抬起或离开放开，移动两头都不是", () => {
    expect(mirrorPointerCaptures("down")).toBe(true);
    expect(mirrorPointerCaptures("move")).toBe(false);
    expect(mirrorPointerCaptures("up")).toBe(false);
    expect(mirrorPointerReleases("up")).toBe(true);
    expect(mirrorPointerReleases("leave")).toBe(true);
    expect(mirrorPointerReleases("down")).toBe(false);
    expect(mirrorPointerReleases("move")).toBe(false);
  });

  it("种类比较不进投屏视图", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "mirror-pointer.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/mirror/src/MirrorView.tsx"),
      resolve(here, "../../modules/mirror/src/store.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("mirror-pointer.ts")) {
        body = body.replace('return kind === "down"', "").replace('return kind === "up" || kind === "leave"', "");
      }
      if (path.endsWith("types.ts")) {
        body = body.replace('export type MirrorPointerKind = "down" | "move" | "up" | "leave";', "");
      }
      expect(body, path).not.toContain('kind === "down"');
      expect(body, path).not.toContain('kind === "up"');
      expect(body, path).not.toContain('kind === "leave"');
      expect(body, path).not.toContain('kind === "move"');
      if (!path.endsWith("types.ts")) expect(body, path).not.toContain('"down" | "move" | "up" | "leave"');
    }
  });
});
