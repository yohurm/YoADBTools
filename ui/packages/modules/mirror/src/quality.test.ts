import { USB_ENCODE, WIFI_ENCODE } from "@yohu/api";
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

describe("质量档（选项含 @yohu/api USB/WIFI 默认档）", () => {
  it("协议选项含 usb / wifi", () => {
    expect(PROTOCOL_OPTIONS.map((item) => item.value)).toEqual(["usb", "wifi"]);
  });

  it("长边 / 码率 / 帧率选项含 USB 与 WIFI 默认档", () => {
    const sizes = SIZE_OPTIONS.map((item) => item.value);
    const rates = RATE_OPTIONS.map((item) => item.value);
    const fps = FPS_OPTIONS.map((item) => item.value);
    expect(sizes).toContain(String(USB_ENCODE.max_size));
    expect(sizes).toContain(String(WIFI_ENCODE.max_size));
    expect(rates).toContain(String(USB_ENCODE.video_bit_rate));
    expect(rates).toContain(String(WIFI_ENCODE.video_bit_rate));
    expect(fps).toContain(String(USB_ENCODE.max_fps));
    expect(fps).toContain(String(WIFI_ENCODE.max_fps));
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
    expect(sizeLabel(USB_ENCODE.max_size)).toBe("原始");
    expect(rateLabel(USB_ENCODE.video_bit_rate)).toBe("16 Mbps");
    expect(fpsLabel(USB_ENCODE.max_fps)).toBe("不限");
  });
});
