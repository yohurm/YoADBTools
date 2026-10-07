import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  updatePhaseIsApplying,
  updatePhaseIsBusy,
  updatePhaseIsDownloading,
  updatePhaseIsIdle,
  updatePhaseIsReady,
  updatePhaseShowsConfirm,
  updatePhaseShowsFound,
} from "./update-phase";

describe("update-phase", () => {
  it("发现框与确认框分属两组阶段", () => {
    expect(updatePhaseIsIdle("idle")).toBe(true);
    expect(updatePhaseShowsFound("idle")).toBe(true);
    expect(updatePhaseShowsFound("downloading")).toBe(true);
    expect(updatePhaseShowsFound("ready")).toBe(false);
    expect(updatePhaseIsDownloading("downloading")).toBe(true);
    expect(updatePhaseIsReady("ready")).toBe(true);
    expect(updatePhaseIsApplying("applying")).toBe(true);
    expect(updatePhaseShowsConfirm("ready")).toBe(true);
    expect(updatePhaseShowsConfirm("applying")).toBe(true);
    expect(updatePhaseShowsConfirm("downloading")).toBe(false);
    expect(updatePhaseIsBusy("downloading")).toBe(true);
    expect(updatePhaseIsBusy("applying")).toBe(true);
    expect(updatePhaseIsBusy("idle")).toBe(false);
  });

  it("本机阶段只在 update-phase 里比较", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [resolve(here, "update-phase.ts"), resolve(here, "update-store.ts"), resolve(here, "../settings/UpdateDialogs.tsx")];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const body = path.endsWith("update-phase.ts")
        ? text
            .replace('return phase === "idle"', "")
            .replace('return phase === "downloading"', "")
            .replace('return phase === "ready"', "")
            .replace('return phase === "applying"', "")
        : text;
      expect(body, path).not.toContain('phase() === "');
      expect(body, path).not.toContain('phase === "');
      expect(body, path).not.toContain('current === "');
      expect(body, path).not.toContain('current !== "');
    }
  });
});
