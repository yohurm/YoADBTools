import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LINK_USB,
  LINK_WIRELESS,
  connectionIsUsbTransport,
  connectionOrUsb,
  deviceConnectionLabel,
  USB_ENCODE,
  WIFI_ENCODE,
  isTcpConnection,
  mirrorProtocolIsUsb,
  mirrorProtocolIsWifi,
  mirrorProtocolOf,
  paramsOf,
} from "./mirror";

describe("mirror encode（与 domain testdata/mirror_encode.json 同一张表）", () => {
  const table = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata/mirror_encode.json"),
      "utf8",
    ),
  ) as {
    usb: typeof USB_ENCODE;
    wifi: typeof WIFI_ENCODE;
  };

  it("USB / WIFI 默认档", () => {
    expect(USB_ENCODE).toEqual(table.usb);
    expect(WIFI_ENCODE).toEqual(table.wifi);
    expect(paramsOf("usb")).toEqual(USB_ENCODE);
    expect(paramsOf("wifi")).toEqual(WIFI_ENCODE);
  });

  it("USB 默认档的数字只写在 USB_ENCODE", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const owner = readFileSync(resolve(here, "mirror.ts"), "utf8");
    expect(owner).toContain("video_bit_rate: 16_000_000,");
    const files = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of files) {
      let body = readFileSync(resolve(here, name), "utf8");
      if (name === "mirror.ts") body = body.replace("video_bit_rate: 16_000_000,", "");
      expect(body, name).not.toContain("16_000_000");
      expect(body, name).not.toContain("mirror_max_size: 0");
      expect(body, name).not.toContain("mirror_max_fps: 0");
    }
  });

  it("tcp: 前缀与 start 表的 force_forward 一致", () => {
    const cases = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata/mirror_start_encode.json"),
        "utf8",
      ),
    ) as { connection: string; force_forward: boolean }[];
    for (const row of cases) {
      expect(isTcpConnection(row.connection)).toBe(row.force_forward);
    }
    expect(LINK_USB).toBe("USB");
    expect(LINK_WIRELESS).toBe("无线");
  });

  it("目录连接收成 USB / 无线", () => {
    expect(connectionIsUsbTransport("usb")).toBe(true);
    expect(connectionIsUsbTransport("usb:1-2")).toBe(true);
    expect(connectionIsUsbTransport("tcp:1")).toBe(false);
    expect(deviceConnectionLabel("usb")).toBe("USB");
    expect(deviceConnectionLabel("usb:1-2")).toBe("USB");
    expect(deviceConnectionLabel("tcp:192.168.1.8:5555")).toBe("无线");
    expect(deviceConnectionLabel("wifi")).toBe("无线");
    expect(connectionOrUsb(undefined)).toBe("usb");
    expect(connectionOrUsb(null)).toBe("usb");
    expect(connectionOrUsb("")).toBe("usb");
    expect(connectionOrUsb("usb:1-2")).toBe("usb:1-2");
    expect(connectionOrUsb("tcp:1")).toBe("tcp:1");
    expect(deviceConnectionLabel("")).toBe("");
    expect(deviceConnectionLabel("  ")).toBe("");
    const here = dirname(fileURLToPath(import.meta.url));
    const store = readFileSync(resolve(here, "../../modules/mirror/src/store.ts"), "utf8");
    const view = readFileSync(resolve(here, "../../modules/mirror/src/MirrorView.tsx"), "utf8");
    expect(store).not.toContain('|| "usb"');
    expect(store).not.toContain('?? "usb"');
    expect(store).not.toContain('connection: "usb"');
    expect(view).not.toContain('?? "usb"');
  });
});

describe("投屏协议", () => {
  it("下拉字符串只收成 usb / wifi", () => {
    expect(mirrorProtocolOf("usb")).toBe("usb");
    expect(mirrorProtocolOf("wifi")).toBe("wifi");
    expect(mirrorProtocolOf("tcp:1")).toBeUndefined();
    expect(mirrorProtocolIsWifi("wifi")).toBe(true);
    expect(mirrorProtocolIsWifi("usb")).toBe(false);
    expect(mirrorProtocolIsUsb("usb")).toBe(true);
  });

  it("编码函数和投屏视图不再另写协议联合", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "mirror.ts"),
      resolve(here, "../../modules/mirror/src/MirrorView.tsx"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      body = body.replace('return protocol === "wifi"', "");
      body = body.replace('return protocol === "usb"', "");
      expect(body, path).not.toContain('"usb" | "wifi"');
      expect(body, path).not.toContain('=== "wifi"');
      expect(body, path).not.toContain('=== "usb"');
    }
  });
});
