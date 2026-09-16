import { describe, expect, it } from "vitest";

import {
  formatDeviceRailTip,
  formatDeviceStatusHint,
  formatDeviceStatusMeta,
} from "./device-status-format";

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

  it("图标轨提示拼型号串号与未授权", () => {
    expect(
      formatDeviceRailTip({
        name: "Moto X",
        serial: "A1",
        unauthorized: true,
        hint: "Android 15 · 87% 充电",
      }),
    ).toBe("Moto X · A1 · 未授权 · Android 15 · 87% 充电");
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
