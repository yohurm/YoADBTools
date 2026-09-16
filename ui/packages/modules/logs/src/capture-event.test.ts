import { describe, expect, it } from "vitest";

import { applyCaptureEvent } from "./capture-event";

describe("applyCaptureEvent", () => {
  it("旧世代丢弃", () => {
    expect(applyCaptureEvent(2, 1, false)).toEqual({ kind: "ignore" });
    expect(applyCaptureEvent(2, 1, true)).toEqual({ kind: "ignore" });
  });

  it("同世代 adopt 不必减水位", () => {
    expect(applyCaptureEvent(3, 3, true)).toEqual({ kind: "running", generation: 3 });
    expect(applyCaptureEvent(3, 3, false)).toEqual({ kind: "stopped", generation: 3 });
  });

  it("新世代只升不减", () => {
    expect(applyCaptureEvent(1, 4, true)).toEqual({ kind: "running", generation: 4 });
    expect(applyCaptureEvent(1, 4, false)).toEqual({ kind: "stopped", generation: 4 });
  });
});
