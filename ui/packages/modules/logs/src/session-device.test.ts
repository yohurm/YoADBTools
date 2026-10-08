import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DeviceInfo, DeviceStatus } from "@yohu/api";

import {
  devicePickerDescription,
  devicePickerFields,
  devicePickerLabel,
  formatSessionDevice,
  shortSerial,
} from "./session-device";

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

describe("devicePickerFields", () => {
  it("主文案型号，次文案短号与连接", () => {
    expect(devicePickerFields(device("ABCDEFGH", "edge"))).toEqual({
      label: "edge",
      description: "EFGH · USB",
    });
    expect(devicePickerDescription(device("ABCDEFGH", "edge"))).toBe("EFGH · USB");
  });

  it("无名则主文案整串 serial，次文案只留连接", () => {
    expect(devicePickerFields(device("S1"))).toEqual({
      label: "S1",
      description: "USB",
    });
  });

  it("型号文本与 serial 相同仍算有型号", () => {
    expect(devicePickerLabel(device("S1", "S1"))).toBe("S1 · S1");
    expect(devicePickerDescription(device("S1", "S1"))).toBe("S1 · USB");
    const owner = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-device.ts"), "utf8");
    expect(owner).toContain("deviceHasModel");
    expect(owner).not.toContain("=== device.serial");
    expect(owner).not.toContain('startsWith("usb:")');
    expect(owner).not.toContain('=== "wifi"');
  });

  it("tcp 连接标无线", () => {
    expect(
      devicePickerFields({ ...device("ABCDEFGH", "edge"), connection: "tcp:1" }).description,
    ).toBe("EFGH · 无线");
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

describe("设备短号只取一次", () => {
  it("device_short_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-device.ts"), "utf8");
    const needle = "shortSerial(device." + "serial)";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("deviceShort(");
  });
});

describe("间隔点只拼一次", () => {
  it("join_dot_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-device.ts"), "utf8");
    const needle = '.join("' + ' · ")';
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("joinDot(");
  });
});
