import { describe, expect, it } from "vitest";

import { foreignHoldCount, holdCount, sessionHolds, type HoldSession } from "./hold";

const row = (over: Partial<HoldSession> & Pick<HoldSession, "id">): HoldSession => ({
  serial: "S1",
  capturing: false,
  starting: false,
  ...over,
});

describe("sessionHolds", () => {
  it("capturing 或 starting 都是 hold", () => {
    expect(sessionHolds({ capturing: true, starting: false })).toBe(true);
    expect(sessionHolds({ capturing: false, starting: true })).toBe(true);
    expect(sessionHolds({ capturing: true, starting: true })).toBe(true);
    expect(sessionHolds({ capturing: false, starting: false })).toBe(false);
  });
});

describe("holdCount", () => {
  it("自 starting 计入", () => {
    const sessions = [row({ id: 1, starting: true })];
    expect(holdCount(sessions, "S1")).toBe(1);
    expect(holdCount(sessions, "S2")).toBe(0);
  });

  it("兄 capturing + 己 starting 为 2，去掉自己后剩 1", () => {
    const sessions = [
      row({ id: 1, capturing: true }),
      row({ id: 2, starting: true }),
    ];
    expect(holdCount(sessions, "S1")).toBe(2);
    expect(foreignHoldCount(sessions, "S1", 2)).toBe(1);
    expect(foreignHoldCount(sessions, "S1", 1)).toBe(1);
  });

  it("关窗后重建 System 默认不计入", () => {
    const rebuilt = [row({ id: 99 })];
    expect(sessionHolds(rebuilt[0]!)).toBe(false);
    expect(holdCount(rebuilt, "S1")).toBe(0);
    expect(foreignHoldCount(rebuilt, "S1", 1)).toBe(0);
  });
});
