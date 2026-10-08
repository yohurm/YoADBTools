/**
 * 投屏编码默认档。与 yohu-domain::mirror USB_ENCODE / WIFI_ENCODE 同一 testdata/mirror_encode.json。
 * start_encode 只在 core 算，不进 View。协议词只认 MirrorProtocol。
 */

import type { MirrorProtocol } from "./types";

/** 无线协议。编码表和连接标签不是同一事实。 */
export function mirrorProtocolIsWifi(protocol: string | undefined): protocol is "wifi" {
  return protocol === "wifi";
}

export function mirrorProtocolIsUsb(protocol: string | undefined): protocol is "usb" {
  return protocol === "usb";
}

/** 下拉字符串收成协议。别的字不是协议。 */
export function mirrorProtocolOf(value: string): MirrorProtocol | undefined {
  if (mirrorProtocolIsWifi(value) || mirrorProtocolIsUsb(value)) return value;
  return undefined;
}

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

export function paramsOf(protocol: MirrorProtocol): MirrorEncodeParams {
  return mirrorProtocolIsWifi(protocol) ? WIFI_ENCODE : USB_ENCODE;
}

/** 与 `yohu-domain::is_tcp_connection` 相同：连接串以 `tcp:` 开头。 */
export function isTcpConnection(connection: string): boolean {
  return connection.startsWith("tcp:");
}

/** 没有连接串时按 USB。空串也算没有。`usb:` 路径和 `tcp:` 原样留下。 */
export function connectionOrUsb(connection: string | null | undefined): string {
  return connection ? connection : "usb";
}

/** 目录连接是 usb 或 usb:路径。协议词 usb 仍由 mirrorProtocolIsUsb 判定。 */
export function connectionIsUsbTransport(connection: string): boolean {
  return mirrorProtocolIsUsb(connection) || connection.startsWith("usb:");
}

/** 目录连接收成 USB / 无线。空串仍空。认不出的原样返回。协议下拉不走这里。 */
export function deviceConnectionLabel(connection: string | null | undefined): string {
  const value = connection?.trim() ?? "";
  if (!value) return "";
  if (connectionIsUsbTransport(value)) return LINK_USB;
  if (mirrorProtocolIsWifi(value) || isTcpConnection(value)) return LINK_WIRELESS;
  return value;
}

/** 连接方式与投屏协议共用的两句。 */
export const LINK_USB = "USB";
export const LINK_WIRELESS = "无线";
