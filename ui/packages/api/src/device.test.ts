import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DeviceInfo } from "./types";
import { androidApiLabel, androidReleaseLabel, DEVICE_UNSELECTED, deviceDisplayName, deviceHasModel, deviceIsOnline, deviceIsUnauthorized, deviceNightWord, lookupSelectedDevices, selectedSerial } from "./device";

const testdata = (...segments: string[]): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../core/yohu-domain/testdata", ...segments);

describe("deviceDisplayName（与 domain testdata/device_display_name.json 同一套向量）", () => {
  const fixture: { serial: string; model: string | null; expect: string }[] = JSON.parse(
    readFileSync(testdata("device_display_name.json"), "utf8"),
  ) as { serial: string; model: string | null; expect: string }[];

  it.each(fixture)("$serial / model=$model", (c) => {
    expect(deviceDisplayName({ serial: c.serial, model: c.model ?? undefined })).toBe(c.expect);
  });
});

describe("lookupSelectedDevices（与 domain testdata/lookup_selected_devices.json 同一套向量）", () => {
  const fixture: { serials: string[]; catalog: DeviceInfo[]; expect: string[] }[] = JSON.parse(
    readFileSync(testdata("lookup_selected_devices.json"), "utf8"),
  ) as { serials: string[]; catalog: DeviceInfo[]; expect: string[] }[];

  it.each(fixture)("serials=$serials", (c) => {
    expect(lookupSelectedDevices(c.serials, c.catalog).map((d) => d.serial)).toEqual(c.expect);
  });
});

describe("deviceHasModel", () => {
  it("去空白后非空才算有型号", () => {
    expect(deviceHasModel({ model: "edge" })).toBe(true);
    expect(deviceHasModel({ model: "  " })).toBe(false);
    expect(deviceHasModel({})).toBe(false);
    const owner = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "device.ts"), "utf8");
    const body = owner.replace("return device.model?.trim() ?? \"\";", "");
    expect(body).not.toContain("model?.trim");
  });
});

describe("deviceIsOnline", () => {
  it("只有 online 算在线，未授权单独认", () => {
    expect(deviceIsOnline("online")).toBe(true);
    expect(deviceIsOnline("offline")).toBe(false);
    expect(deviceIsOnline("unauthorized")).toBe(false);
    expect(deviceIsUnauthorized("unauthorized")).toBe(true);
    expect(deviceIsUnauthorized("online")).toBe(false);
    expect(deviceNightWord(true)).toBe("深色");
    expect(deviceNightWord(false)).toBe("浅色");
    expect(androidReleaseLabel("15")).toBe("Android 15");
    expect(androidApiLabel(35)).toBe("API 35");
  });
});

describe("空面板标题", () => {
  it("只写在 device.ts", () => {
    expect(DEVICE_UNSELECTED).toBe("未选择设备");
    expect(selectedSerial("S1")).toEqual({ ok: true, serial: "S1" });
    expect(selectedSerial(null)).toEqual({ ok: false, reason: DEVICE_UNSELECTED });
    expect(selectedSerial(undefined)).toEqual({ ok: false, reason: DEVICE_UNSELECTED });
    const listing = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../modules/files/src/listing.ts"), "utf8");
    const transfers = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../modules/files/src/transfers.ts"), "utf8");
    expect(listing).not.toContain("DEVICE_UNSELECTED");
    expect(transfers).not.toContain("DEVICE_UNSELECTED");
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = resolve(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk(packages);
    for (const path of files) {
      const rel = path.replaceAll("\\", "/");
      if (rel.endsWith("/api/src/device.ts")) continue;
      expect(readFileSync(path, "utf8"), rel).not.toContain(DEVICE_UNSELECTED);
    }
  });
});
