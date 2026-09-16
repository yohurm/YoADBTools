import { describe, expect, it } from "vitest";
import { progressFillWidth, progressHostAttrs } from "./progress-policy";

describe("progress-policy", () => {
  it("确定态写入 valuemin/max/now 与宽度", () => {
    expect(progressHostAttrs({ value: 50 })).toEqual({
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 50,
      "data-mode": "determinate",
    });
    expect(progressFillWidth({ value: 50 })).toBe("50%");
  });

  it("不定态不报 now、不写宽度", () => {
    const attrs = progressHostAttrs({ value: 20, indeterminate: true });
    expect(attrs["aria-valuenow"]).toBeUndefined();
    expect(attrs["data-mode"]).toBe("indeterminate");
    expect(progressFillWidth({ indeterminate: true })).toBeUndefined();
  });
});
