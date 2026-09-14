import { describe, expect, it } from "vitest";

import type { DeviceInfo, DeviceStatus } from "@yohu/api";

import { devicePickerLabel, formatSessionDevice, shortSerial } from "./session-device";

const device = (serial: string, model?: string): DeviceInfo => ({
  serial,
  model,
  state: "online",
  connection: "usb",
});

const status = (partial: Partial<DeviceStatus> & { serial: string }): DeviceStatus => ({
  generation: 1,
  ...partial,
});

describe("shortSerial", () => {
  it("空为空白；长号取末 4 位", () => {
    expect(shortSerial(null)).toBe("");
    expect(shortSerial("abc")).toBe("abc");
    expect(shortSerial("ABCDEFGH")).toBe("EFGH");
  });
});

describe("devicePickerLabel", () => {
  it("有型号则拼短号，无名则整串 serial", () => {
    expect(devicePickerLabel(device("ABCDEFGH", "edge"))).toBe("edge · EFGH");
    expect(devicePickerLabel(device("S1"))).toBe("S1");
  });
});

describe("formatSessionDevice", () => {
  it("无 serial 为破折号", () => {
    expect(formatSessionDevice(null, [], {})).toBe("—");
    expect(formatSessionDevice(undefined, [], {})).toBe("—");
  });

  it("拼设备名、Android 版本与 API，不带序列号前缀", () => {
    expect(
      formatSessionDevice("R58M", [device("R58M", "edge 60 pro")], {
        R58M: status({ serial: "R58M", release: "15", sdk: 35 }),
      }),
    ).toBe("edge 60 pro · Android 15 · API 35");
  });

  it("无型号时用人读回退（serial），有 SDK 无 release 只出 API", () => {
    expect(
      formatSessionDevice("S1", [device("S1")], {
        S1: status({ serial: "S1", sdk: 34 }),
      }),
    ).toBe("S1 · API 34");
  });

  it("目录中找不到设备时仍用 serial，版本可缺", () => {
    expect(formatSessionDevice("gone", [], {})).toBe("gone");
  });
});
