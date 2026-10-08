import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  dialogHugsContent,
  dialogInitialIsFooter,
  dialogWidthIsSet,
  dialogNodeOn,
  dialogRegionIsSplit,
  dialogTailAlignIsStretch,
  resolveDialogActionsLayout,
  resolveDialogBodyRegion,
  resolveDialogBodySpec,
  resolveDialogBox,
  resolveDialogExitLock,
  resolveDialogInitial,
  resolveDialogTailAlign,
} from "./dialog-model";

describe("dialog-model", () => {
  it("打开且无显式高是 fit hug，不写 height", () => {
    expect(resolveDialogBox({ open: true })).toEqual({
      kind: "fit",
      locked: false,
      sized: false,
      style: {},
    });
    expect(resolveDialogBox({ open: true, width: 960 })).toEqual({
      kind: "fit",
      locked: false,
      sized: true,
      style: { width: "960px" },
    });
  });

  it("无显式高才 hug，fill 不套 Travel", () => {
    expect(dialogHugsContent()).toBe(true);
    expect(dialogHugsContent(undefined)).toBe(true);
    expect(dialogHugsContent(560)).toBe(false);
  });

  it("显式高才 fill", () => {
    expect(resolveDialogBox({ open: true, width: 960, height: 480 })).toEqual({
      kind: "fill",
      locked: false,
      sized: true,
      style: { width: "960px", height: "480px" },
    });
  });

  it("关窗只锁盒，kind 仍按有没有显式高", () => {
    const lock = { width: "400px", height: "320px" };
    expect(resolveDialogBox({ open: false, lastOpen: lock })).toEqual({
      kind: "fit",
      locked: true,
      sized: false,
      style: lock,
    });
    expect(resolveDialogBox({ open: false, width: 960, lastOpen: lock })).toEqual({
      kind: "fit",
      locked: true,
      sized: true,
      style: lock,
    });
    expect(resolveDialogBox({ open: false, width: 960 })).toEqual({
      kind: "fit",
      locked: true,
      sized: true,
      style: { width: "960px" },
    });
  });

  it("fill 关窗仍是 fill，只加 locked", () => {
    const lock = { width: "960px", height: "560px" };
    expect(resolveDialogBox({ open: false, width: 960, height: 560, lastOpen: lock })).toEqual({
      kind: "fill",
      locked: true,
      sized: true,
      style: lock,
    });
    expect(resolveDialogBox({ open: false, width: 960, height: 560 })).toEqual({
      kind: "fill",
      locked: true,
      sized: true,
      style: { width: "960px", height: "560px" },
    });
  });

  it("内容区缺省是 stack + auto + lg + plain", () => {
    expect(resolveDialogBodySpec({})).toEqual({
      layout: "stack",
      overflow: "auto",
      pad: "lg",
      region: "plain",
    });
  });

  it("有 lead 或 tail 才 split，Collapse 只许进 main", () => {
    expect(resolveDialogBodyRegion()).toBe("plain");
    expect(resolveDialogBodyRegion(true, false)).toBe("split");
    expect(resolveDialogBodyRegion(false, true)).toBe("split");
    expect(resolveDialogBodySpec({ lead: true }).region).toBe("split");
  });

  it("stack + hidden 只改溢出，垫与排列保持缺省", () => {
    expect(resolveDialogBodySpec({ overflow: "hidden" })).toEqual({
      layout: "stack",
      overflow: "hidden",
      pad: "lg",
      region: "plain",
    });
  });

  it("pad none 去掉内容区垫", () => {
    expect(resolveDialogBodySpec({ pad: "none" })).toEqual({
      layout: "stack",
      overflow: "auto",
      pad: "none",
      region: "plain",
    });
  });

  it("显式 row 盖过缺省排列", () => {
    expect(resolveDialogBodySpec({ layout: "row" }).layout).toBe("row");
  });

  it("首焦只认 auto / footer", () => {
    expect(resolveDialogInitial()).toBe("auto");
    expect(resolveDialogInitial("footer")).toBe("footer");
    expect(resolveDialogInitial("first")).toBe("auto");
  });

  it("操作区 AUTO：1 居中、2 左右、3 以上从下至上", () => {
    expect(resolveDialogActionsLayout(0)).toBe("center");
    expect(resolveDialogActionsLayout(1)).toBe("center");
    expect(resolveDialogActionsLayout(2)).toBe("row");
    expect(resolveDialogActionsLayout(3)).toBe("stack");
    expect(resolveDialogActionsLayout(4)).toBe("stack");
  });

  it("尾槽铺满和分区只在模型里比较", () => {
    expect(dialogTailAlignIsStretch("stretch")).toBe(true);
    expect(dialogTailAlignIsStretch("start")).toBe(false);
    expect(dialogTailAlignIsStretch()).toBe(false);
    expect(resolveDialogTailAlign("stretch")).toBe("stretch");
    expect(resolveDialogTailAlign()).toBe("start");
    expect(dialogRegionIsSplit("split")).toBe(true);
    expect(dialogRegionIsSplit("plain")).toBe(false);
    expect(dialogInitialIsFooter("footer")).toBe(true);
    expect(dialogInitialIsFooter("auto")).toBe(false);
    expect(dialogInitialIsFooter("first")).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body =
        name === "dialog-model.ts"
          ? text
              .replace('return align === "stretch"', "")
              .replace('return region === "split"', "")
              .replace('return value === "footer"', "")
              .replace("return height === undefined", "")
          : text;
      expect(body, name).not.toContain('=== "stretch"');
      expect(body, name).not.toContain('=== "split"');
      expect(body, name).not.toContain('=== "footer"');
      expect(body, name).not.toContain("height === undefined");
      expect(body, name).not.toContain("height !== undefined");
    }
  });

  it("铅槽和尾槽的有无只在 dialogNodeOn", () => {
    expect(dialogNodeOn(undefined)).toBe(false);
    expect(dialogNodeOn(null)).toBe(false);
    expect(dialogNodeOn(false)).toBe(true);
    expect(dialogNodeOn("x")).toBe(true);
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Dialog.tsx"), "utf8");
    expect(view).not.toContain("!= null");
  });

  it("零盒不锁，正盒锁成 px", () => {
    expect(resolveDialogExitLock(0, 320)).toBeUndefined();
    expect(resolveDialogExitLock(400, 0)).toBeUndefined();
    expect(resolveDialogExitLock(400, 320)).toEqual({ width: "400px", height: "320px" });
  });

  it("显式宽只在 dialogWidthIsSet 里比较", () => {
    expect(dialogWidthIsSet()).toBe(false);
    expect(dialogWidthIsSet(undefined)).toBe(false);
    expect(dialogWidthIsSet(0)).toBe(true);
    expect(dialogWidthIsSet(960)).toBe(true);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name)) continue;
      let body = readFileSync(join(dir, name), "utf8");
      if (name.includes(".test.")) body = body.replaceAll("width !== undefined", "");
      if (name === "dialog-model.ts") body = body.replace("return width !== undefined", "");
      expect(body, name).not.toContain("width !== undefined");
    }
  });

  it("空盒只在 cornerExtentIsEmpty 里比较", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const owner = readFileSync(join(dir, "../corner/corner-model.ts"), "utf8").replace(
      "return width <= 0 || height <= 0",
      "",
    );
    expect(owner).not.toContain("width <= 0 || height <= 0");
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const body = readFileSync(join(dir, name), "utf8");
      expect(body, name).not.toContain("width <= 0 || height <= 0");
    }
  });

});
