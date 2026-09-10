import { describe, expect, it } from "vitest";

import { DEFAULT_TOOLTIP_DELAY, DEFAULT_TOOLTIP_HIDE_DELAY, tooltipDomId, tooltipIsEmpty } from "./tooltip-model";

describe("tooltip-model", () => {
  it("缺省延迟是 MotionSpec 名，不是裸 ms", () => {
    expect(DEFAULT_TOOLTIP_DELAY).toBe("effectsEnter");
    expect(DEFAULT_TOOLTIP_HIDE_DELAY).toBe("effectsFast");
  });

  it("空文案不能出示", () => {
    expect(tooltipIsEmpty("")).toBe(true);
    expect(tooltipIsEmpty("  ")).toBe(true);
    expect(tooltipIsEmpty(null)).toBe(true);
    expect(tooltipIsEmpty("保存")).toBe(false);
  });

  it("稳定 tooltip id", () => {
    expect(tooltipDomId("t1")).toBe("yohu-tooltip-t1");
  });
});
