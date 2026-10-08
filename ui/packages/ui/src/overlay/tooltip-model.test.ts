import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOLTIP_DELAY,
  DEFAULT_TOOLTIP_HIDE_DELAY,
  tooltipDomId,
  tooltipIsEmpty,
  tooltipPlaceDiscrete,
} from "./tooltip-model";

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

  it("落点离散，不是滑块轨道", () => {
    expect(tooltipPlaceDiscrete()).toBe(true);
  });

  it("trimmed_text_present_once", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const paths = [
      "../container/formrow-model.ts",
      "../display/description-list-model.ts",
      "./tooltip-model.ts",
    ];
    for (const rel of paths) {
      let body = readFileSync(join(here, rel), "utf8");
      if (rel === "../container/formrow-model.ts") {
        body = body.replace("return value.trim().length > 0", "");
      }
      expect(body, rel).not.toContain("trim().length");
    }
  });
});
