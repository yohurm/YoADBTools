import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FPS_OPTIONS,
  PROTOCOL_OPTIONS,
  RATE_OPTIONS,
  SIZE_OPTIONS,
  fpsLabel,
  rateLabel,
  sizeLabel,
  withCurrentOption,
} from "./quality";

describe("质量档（与 domain testdata/mirror_encode.json 同一张 USB/WIFI 表）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/mirror_encode.json",
  );
  const table = JSON.parse(readFileSync(testdata, "utf8")) as {
    usb: { max_size: number; video_bit_rate: number; max_fps: number; video_codec: string };
    wifi: { max_size: number; video_bit_rate: number; max_fps: number; video_codec: string };
  };

  it("协议选项含 usb / wifi", () => {
    expect(PROTOCOL_OPTIONS.map((item) => item.value)).toEqual(["usb", "wifi"]);
  });

  it("长边 / 码率 / 帧率选项含 USB 与 WIFI 默认档", () => {
    const sizes = SIZE_OPTIONS.map((item) => item.value);
    const rates = RATE_OPTIONS.map((item) => item.value);
    const fps = FPS_OPTIONS.map((item) => item.value);
    expect(sizes).toContain(String(table.usb.max_size));
    expect(sizes).toContain(String(table.wifi.max_size));
    expect(rates).toContain(String(table.usb.video_bit_rate));
    expect(rates).toContain(String(table.wifi.video_bit_rate));
    expect(fps).toContain(String(table.usb.max_fps));
    expect(fps).toContain(String(table.wifi.max_fps));
  });

  it("当前值已在表内则不复制选项", () => {
    expect(withCurrentOption(SIZE_OPTIONS, 1280, sizeLabel)).toBe(SIZE_OPTIONS);
  });

  it("当前值不在表内则插到最前", () => {
    expect(withCurrentOption(SIZE_OPTIONS, 720, sizeLabel)[0]).toEqual({ value: "720", label: "720" });
    expect(withCurrentOption(RATE_OPTIONS, 500_000, rateLabel)[0]).toEqual({
      value: "500000",
      label: "500000 bps",
    });
    expect(withCurrentOption(FPS_OPTIONS, 24, fpsLabel)[0]).toEqual({ value: "24", label: "24 fps" });
  });

  it("USB 默认档文案：原始 / 16 Mbps / 不限", () => {
    expect(sizeLabel(table.usb.max_size)).toBe("原始");
    expect(rateLabel(table.usb.video_bit_rate)).toBe("16 Mbps");
    expect(fpsLabel(table.usb.max_fps)).toBe("不限");
  });
});
