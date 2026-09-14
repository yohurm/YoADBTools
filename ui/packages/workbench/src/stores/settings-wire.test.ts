import { describe, expect, it } from "vitest";

import { wireSettingValue } from "./settings-wire";

describe("wireSettingValue", () => {
  it("整段十进制整数收成 JSON number", () => {
    expect(wireSettingValue("buffer_capacity", "10000")).toBe(10000);
    expect(wireSettingValue("buffer_capacity", "0")).toBe(0);
    expect(wireSettingValue("devices_auto_refresh", "30")).toBe(30);
    expect(wireSettingValue("devices_auto_refresh", "-1")).toBe(-1);
  });

  it("前缀、小数、空白、科学计数原样进 IPC", () => {
    expect(wireSettingValue("buffer_capacity", "12abc")).toBe("12abc");
    expect(wireSettingValue("buffer_capacity", "1.5")).toBe("1.5");
    expect(wireSettingValue("devices_auto_refresh", " 8")).toBe(" 8");
    expect(wireSettingValue("devices_auto_refresh", "8 ")).toBe("8 ");
    expect(wireSettingValue("buffer_capacity", "1e3")).toBe("1e3");
    expect(wireSettingValue("buffer_capacity", "+10")).toBe("+10");
    expect(wireSettingValue("buffer_capacity", "")).toBe("");
  });

  it("已是 number 或非数字键不改写", () => {
    expect(wireSettingValue("buffer_capacity", 50)).toBe(50);
    expect(wireSettingValue("theme", "dark")).toBe("dark");
    expect(wireSettingValue("adb_path", "C:\\adb.exe")).toBe("C:\\adb.exe");
  });
});
