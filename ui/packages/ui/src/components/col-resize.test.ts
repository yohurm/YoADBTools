import { describe, expect, it } from "vitest";

import { beginColResize, moveColResize } from "./col-resize";

const spec = { key: "tag", defaultWidth: 192, minWidth: 48 };

describe("col-resize", () => {
  it("从 startX 重算绝对宽度，不累加 dx", () => {
    const session = beginColResize("tag", 100, 192);
    expect(moveColResize(session, 120, spec)).toBe(212);
    expect(moveColResize(session, 80, spec)).toBe(172);
    expect(moveColResize(session, 100, spec)).toBe(192);
  });

  it("低于 min 钳到 minWidth", () => {
    const session = beginColResize("tag", 200, 192);
    expect(moveColResize(session, 0, spec)).toBe(48);
  });

  it("非有限坐标保持起点宽度", () => {
    const session = beginColResize("tag", 100, 192);
    expect(moveColResize(session, Number.NaN, spec)).toBe(192);
  });
});
