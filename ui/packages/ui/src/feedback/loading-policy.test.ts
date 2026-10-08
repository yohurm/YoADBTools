import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadingDescription, loadingHostAttrs } from "./loading-policy";

describe("loading-policy", () => {
  it("默认 status + busy，不铺满", () => {
    expect(loadingHostAttrs({ title: "加载中" })).toEqual({
      role: "status",
      "aria-busy": true,
      "aria-live": "polite",
      "data-cover": undefined,
      "data-fill": undefined,
    });
  });

  it("cover 写入 data-cover", () => {
    expect(loadingHostAttrs({ title: "加载中", cover: true })["data-cover"]).toBe("");
    expect(loadingHostAttrs({ title: "加载中", cover: true })["data-fill"]).toBeUndefined();
  });

  it("fill 写入 data-fill，不是 data-cover", () => {
    expect(loadingHostAttrs({ title: "加载中", fill: true })["data-fill"]).toBe("");
    expect(loadingHostAttrs({ title: "加载中", fill: true })["data-cover"]).toBeUndefined();
  });

  it("描述空串不占槽，视图不再看原始 prop", () => {
    expect(loadingDescription({ title: "加载中", description: "" })).toBeUndefined();
    expect(loadingDescription({ title: "加载中", description: "请稍候" })).toBe("请稍候");
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Loading.tsx"), "utf8");
    expect(view).not.toContain("Show when={props.description}");
  });
});
