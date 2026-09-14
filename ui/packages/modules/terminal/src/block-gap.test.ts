import { describe, expect, it } from "vitest";

import { commandBlockGapLabel } from "./block-gap";

describe("commandBlockGapLabel", () => {
  it("0 为无；整秒；其余毫秒", () => {
    expect(commandBlockGapLabel(0)).toBe("无");
    expect(commandBlockGapLabel(200)).toBe("200 毫秒");
    expect(commandBlockGapLabel(1000)).toBe("1 秒");
  });
});
