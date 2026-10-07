import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { captureStateIsRunning } from "./capture-state";

describe("采集槽位", () => {
  it("运行只判一次", () => {
    expect(captureStateIsRunning("running")).toBe(true);
    expect(captureStateIsRunning("stopped")).toBe(false);
  });

  it("采集客户端不再自己比 running", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "capture-state.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/logs/src/capture.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("capture-state.ts")) body = body.replace('return state === "running"', "");
      if (path.endsWith("types.ts")) body = body.replace('export type CaptureState = "running" | "stopped";', "");
      expect(body, path).not.toContain('state === "running"');
      expect(body, path).not.toContain('"running" | "stopped"');
    }
  });
});
