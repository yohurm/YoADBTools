import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { USB_ENCODE, WIFI_ENCODE, paramsOf } from "./mirror";

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
});
