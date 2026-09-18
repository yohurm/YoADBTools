/**
 * 投屏编码默认档。与 yohu-domain::mirror USB_ENCODE / WIFI_ENCODE 同一 testdata/mirror_encode.json。
 * start_encode 只在 core 算，不进 View。
 */

export interface MirrorEncodeParams {
  max_size: number;
  video_bit_rate: number;
  max_fps: number;
  video_codec: string;
}

export const USB_ENCODE: MirrorEncodeParams = {
  max_size: 0,
  video_bit_rate: 16_000_000,
  max_fps: 0,
  video_codec: "h265",
};

export const WIFI_ENCODE: MirrorEncodeParams = {
  max_size: 1280,
  video_bit_rate: 4_000_000,
  max_fps: 30,
  video_codec: "h264",
};

export function paramsOf(protocol: "usb" | "wifi"): MirrorEncodeParams {
  return protocol === "wifi" ? WIFI_ENCODE : USB_ENCODE;
}
