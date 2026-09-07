import { describe, expect, it } from "vitest";

import { formatDeviceStatusHint, formatDeviceStatusMeta } from "./device-status-format";

describe("formatDeviceStatusMeta / hint", () => {
  it("拼 Android 版本与电量；无数据为空串", () => {
    expect(formatDeviceStatusMeta(undefined)).toBe("");
    expect(
      formatDeviceStatusMeta({
        serial: "S",
        generation: 1,
        release: "15",
        battery_pct: 87,
        charging: true,
      }),
    ).toBe("Android 15 · 87% 充电");
    expect(formatDeviceStatusMeta({ serial: "S", generation: 1, sdk: 34 })).toBe("API 34");
  });

  it("hint 附加深浅色与息屏", () => {
    expect(
      formatDeviceStatusHint({
        serial: "S",
        generation: 1,
        release: "15",
        battery_pct: 40,
        night: true,
        screen_on: false,
        brand: "motorola",
      }),
    ).toBe("Android 15 · 40% · 深色 · 息屏 · motorola");
  });
});
