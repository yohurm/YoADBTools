import { describe, expect, it } from "vitest";

import { listFrameHostAttrs, listFrameStyle } from "./list-frame-policy";

describe("list-frame-policy", () => {
  it("缺省 variant=hot", () => {
    expect(listFrameHostAttrs()).toEqual({ "data-variant": "hot" });
    expect(listFrameHostAttrs("focus")).toEqual({ "data-variant": "focus" });
  });

  it("style 是内容坐标绝对盒", () => {
    expect(listFrameStyle({ x: 2, y: 68, width: 396, height: 24 })).toEqual({
      position: "absolute",
      top: "68px",
      left: "2px",
      width: "396px",
      height: "24px",
    });
  });
});
