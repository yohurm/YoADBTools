import { describe, expect, it } from "vitest";

import { Density, setDensity } from "@yohu/ui";

import { controlRowHeight } from "./layout";

describe("terminal layout", () => {
  it("清单行高跟当前密度", () => {
    setDensity("compact");
    expect(controlRowHeight()).toBe(Density.Compact.controlHeight);
    setDensity("comfortable");
    expect(controlRowHeight()).toBe(Density.Comfortable.controlHeight);
  });
});
