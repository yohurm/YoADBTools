import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  updateStageIsApplying,
  updateStageIsDownloading,
  updateStageIsFailed,
  updateStageIsReady,
  updateStageIsTransfer,
  updateStageIsVerifying,
} from "./update-stage";

describe("update-stage", () => {
  it("传输含下载与校验", () => {
    expect(updateStageIsDownloading("downloading")).toBe(true);
    expect(updateStageIsVerifying("verifying")).toBe(true);
    expect(updateStageIsVerifying(undefined)).toBe(false);
    expect(updateStageIsTransfer("downloading")).toBe(true);
    expect(updateStageIsTransfer("verifying")).toBe(true);
    expect(updateStageIsTransfer("ready")).toBe(false);
    expect(updateStageIsReady("ready")).toBe(true);
    expect(updateStageIsApplying("applying")).toBe(true);
    expect(updateStageIsFailed("failed")).toBe(true);
    expect(updateStageIsFailed("applying")).toBe(false);
  });

  it("进度 stage 只在 update-stage 里比较", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "update-stage.ts"),
      resolve(here, "../../workbench/src/stores/update-store.ts"),
      resolve(here, "../../workbench/src/settings/UpdateDialogs.tsx"),
    ];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const body = path.endsWith("update-stage.ts")
        ? text
            .replace('return stage === "downloading"', "")
            .replace('return stage === "verifying"', "")
            .replace('return stage === "ready"', "")
            .replace('return stage === "applying"', "")
            .replace('return stage === "failed"', "")
        : text;
      expect(body, path).not.toContain('stage === "');
      expect(body, path).not.toContain('stage !== "');
    }
  });
});
