/**
 * 投屏质量档（离开 View）。USB/WIFI 默认数字读 `@yohu/api` `USB_ENCODE` / `WIFI_ENCODE`。
 */

import { LINK_USB, LINK_WIRELESS } from "@yohu/api";

export interface QualityOption {
  value: string;
  label: string;
}

export const PROTOCOL_OPTIONS: QualityOption[] = [
  { value: "usb", label: LINK_USB },
  { value: "wifi", label: LINK_WIRELESS },
];

/** 质量数字的十进制。长边为零的「原始」和当前值插项不并。 */
function optionText(n: number): string {
  return String(n);
}

export function sizeLabel(n: number): string {
  return n === 0 ? "原始" : optionText(n);
}

export function rateLabel(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000} Mbps` : `${n} bps`;
}

export function fpsLabel(n: number): string {
  return n === 0 ? "不限" : `${n} fps`;
}

function optionsFrom(values: readonly number[], labelOf: (n: number) => string): QualityOption[] {
  return values.map((n) => ({ value: optionText(n), label: labelOf(n) }));
}

export const SIZE_OPTIONS: QualityOption[] = optionsFrom([0, 640, 1024, 1280, 1920], sizeLabel);

export const RATE_OPTIONS: QualityOption[] = optionsFrom(
  [1_000_000, 2_000_000, 4_000_000, 8_000_000, 16_000_000],
  rateLabel,
);

export const FPS_OPTIONS: QualityOption[] = optionsFrom([0, 15, 30, 60, 120], fpsLabel);

export function withCurrentOption(
  options: QualityOption[],
  current: number,
  labelOf: (n: number) => string,
): QualityOption[] {
  const value = String(current);
  if (options.some((item) => item.value === value)) return options;
  return [{ value, label: labelOf(current) }, ...options];
}
