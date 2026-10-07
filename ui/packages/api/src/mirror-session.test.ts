import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { mirrorIsFailed, mirrorIsLive, mirrorIsStarting, mirrorSessionEnded } from "./mirror-session";

describe("投屏会话词", () => {
  it("在播、启动、失败和结束各判一次", () => {
    expect(mirrorIsLive("live")).toBe(true);
    expect(mirrorIsLive("starting")).toBe(false);
    expect(mirrorIsStarting("starting")).toBe(true);
    expect(mirrorIsStarting("live")).toBe(false);
    expect(mirrorIsFailed("failed")).toBe(true);
    expect(mirrorIsFailed("live")).toBe(false);
    expect(mirrorSessionEnded("stopped")).toBe(true);
    expect(mirrorSessionEnded("failed")).toBe(true);
    expect(mirrorSessionEnded("live")).toBe(false);
  });

  it("live / starting / failed / stopped 只写在会话词", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "mirror-session.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/mirror/src/control-ready.ts"),
      resolve(here, "../../modules/mirror/src/store.ts"),
      resolve(here, "../../modules/mirror/src/MirrorView.tsx"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("mirror-session.ts")) {
        body = body
          .replace('return state === "live"', "")
          .replace('return state === "starting"', "")
          .replace('return state === "failed"', "")
          .replace('return state === "stopped" || mirrorIsFailed(state)', "");
      }
      if (path.endsWith("types.ts")) {
        body = body.replace('export type MirrorSessionState = "starting" | "live" | "stopped" | "failed";', "");
      }
      expect(body, path).not.toContain('=== "live"');
      expect(body, path).not.toContain('=== "starting"');
      expect(body, path).not.toContain('=== "failed"');
      expect(body, path).not.toContain('=== "stopped"');
    }
  });
});
