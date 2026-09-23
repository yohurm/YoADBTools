import { describe, expect, it } from "vitest";

import { createScrollerSession } from "./scroller-session";

describe("scroller-session", () => {
  it("moveTo 按尺夹紧，reclamp 在尺缩短后收回", () => {
    const session = createScrollerSession();
    session.setMetrics({
      viewBlock: 200,
      contentBlock: 1000,
      viewInline: 400,
      contentInline: 800,
    });
    expect(session.moveTo(300, 50)).toEqual({ block: 300, inline: 50 });
    expect(session.moveTo(-10)).toEqual({ block: 0, inline: 50 });
    expect(session.moveTo(9999, 9999)).toEqual({ block: 800, inline: 400 });
    expect(session.moveBy(-100, -50)).toEqual({ block: 700, inline: 350 });
    session.setMetrics({
      viewBlock: 200,
      contentBlock: 400,
      viewInline: 400,
      contentInline: 400,
    });
    expect(session.reclamp()).toEqual({ block: 200, inline: 0 });
  });

  it("无尺时偏移停在 0", () => {
    const session = createScrollerSession();
    expect(session.moveTo(80, 12)).toEqual({ block: 0, inline: 0 });
  });
});
