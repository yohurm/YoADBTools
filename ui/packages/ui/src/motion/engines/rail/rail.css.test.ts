import { describe, expect, it } from "vitest";

import { loadMotionCss } from "../../css";

describe("rail.css 契约", () => {
  it("一拍 spatial-rail，data-stream 开合流，禁止 display:none", () => {
    const css = loadMotionCss();
    const rail = css.slice(css.indexOf(".yohu-recipe-rail"));
    const block = rail.slice(0, rail.indexOf(".yohu-recipe-preview"));
    expect(block).toContain("var(--yohu-motion-spatial-rail)");
    expect(block).toContain('[data-stream="open"]');
    expect(block).toContain("width var(--yohu-motion-spatial-rail)");
    expect(block).toContain("min-height var(--yohu-motion-spatial-rail)");
    expect(block).toContain("opacity var(--yohu-motion-spatial-rail)");
    expect(block).toContain("translateX(calc(-1 * var(--yohu-space-sm)))");
    expect(block).not.toContain("spatial-panel");
    expect(block).not.toContain("display: none");
  });
});
