import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MotionSpec } from "../../../tokens/motion";
import { TRAVEL_SPEC } from "../../spec/recipes";

function load(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

describe("travel axes", () => {
  it("block 与 inline 共用 TRAVEL_SPEC", () => {
    expect(TRAVEL_SPEC).toBe("spatialPanel");
    expect(MotionSpec[TRAVEL_SPEC]).toEqual(MotionSpec.spatialPanel);

    const css = load("src/motion/engines/travel/travel.css");
    expect(css).toContain("height var(--yohu-motion-spatial-panel)");
    expect(css).toContain("width var(--yohu-motion-spatial-panel)");
    expect(css).not.toContain("--yohu-motion-spatial-local");
    expect(css).not.toContain("--yohu-motion-spatial-small");
    expect(css).not.toContain("animate(");
    expect(css).not.toContain("@keyframes");

    const ts = [
      load("src/motion/engines/travel/travel.tsx"),
      load("src/motion/engines/travel/travel-bind.ts"),
    ].join("\n");
    expect(ts).toContain("TRAVEL_SPEC");
    expect(ts).toContain("props.spec ?? TRAVEL_SPEC");
    expect(ts).toContain("host.spec?.() ?? TRAVEL_SPEC");
  });
});
