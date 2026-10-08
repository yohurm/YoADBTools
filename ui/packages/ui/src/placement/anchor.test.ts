import { describe, expect, it } from "vitest";

import { readAnchorBox } from "./anchor";

describe("readAnchorBox", () => {
  it("无锚点时是零盒", () => {
    expect(readAnchorBox(undefined)).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
  });
});
