/**
 * 投屏质量档（离开 View）。USB/WIFI 默认数字与 domain testdata/mirror_encode.json 对齐。
 */

export interface QualityOption {
  value: string;
  label: string;
}

export const PROTOCOL_OPTIONS: QualityOption[] = [
  { value: "usb", label: "USB" },
  { value: "wifi", label: "无线" },
];

export const SIZE_OPTIONS: QualityOption[] = [
  { value: "0", label: "原始" },
  { value: "640", label: "640" },
  { value: "1024", label: "1024" },
  { value: "1280", label: "1280" },
  { value: "1920", label: "1920" },
];

export const RATE_OPTIONS: QualityOption[] = [
  { value: "1000000", label: "1 Mbps" },
  { value: "2000000", label: "2 Mbps" },
  { value: "4000000", label: "4 Mbps" },
  { value: "8000000", label: "8 Mbps" },
  { value: "16000000", label: "16 Mbps" },
];

export const FPS_OPTIONS: QualityOption[] = [
  { value: "0", label: "不限" },
  { value: "15", label: "15 fps" },
  { value: "30", label: "30 fps" },
  { value: "60", label: "60 fps" },
  { value: "120", label: "120 fps" },
];

export function sizeLabel(n: number): string {
  return n === 0 ? "原始" : String(n);
}

export function rateLabel(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000} Mbps` : `${n} bps`;
}

export function fpsLabel(n: number): string {
  return n === 0 ? "不限" : `${n} fps`;
}

export function withCurrentOption(
  options: QualityOption[],
  current: number,
  labelOf: (n: number) => string,
): QualityOption[] {
  const value = String(current);
  if (options.some((item) => item.value === value)) return options;
  return [{ value, label: labelOf(current) }, ...options];
}
