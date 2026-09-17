import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as motion from "./index";

function loadMotionIndex(): string {
  const candidates = [
    resolve(process.cwd(), "src/motion/index.ts"),
    resolve(process.cwd(), "packages/ui/src/motion/index.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("motion 族内桶", () => {
  it("仍导出 YoPresence / YoCollapse / YoRail / prefersReducedMotion", () => {
    expect(motion.YoPresence).toBeTypeOf("function");
    expect(motion.YoCollapse).toBeTypeOf("function");
    expect(motion.YoRail).toBeTypeOf("function");
    expect(motion.prefersReducedMotion).toBeTypeOf("function");
  });

  it("不导出 wipe / travel binder / 已删 rail 别名", () => {
    const barrel = loadMotionIndex();
    expect(barrel.length).toBeGreaterThan(0);
    expect(barrel).not.toContain("THEME_WIPE_COVERAGE");
    expect(barrel).not.toContain("themeWipeFrames");
    expect(barrel).not.toContain("themeWipeRadius");
    expect(barrel).not.toContain("useTravel");
    expect(barrel).not.toContain("useGrow");
    expect(barrel).not.toContain("useCollapseTravel");
    expect(barrel).not.toContain("bindTravel");
    expect(barrel).not.toContain("bindGrow");
    expect(barrel).not.toContain("RailPresentation");
    expect(barrel).not.toContain("railLayoutExpanded");
    expect(barrel).not.toContain("railCopyOpaque");
    expect(barrel).not.toContain("railBlockHidden");
  });
});
