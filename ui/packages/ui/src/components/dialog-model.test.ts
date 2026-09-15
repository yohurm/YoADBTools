import { describe, expect, it } from "vitest";

import {
  dialogPanelPaint,
  mergeDialogPanelStyle,
  resolveDialogBodySpec,
  resolveDialogExitLock,
  resolveDialogInitial,
} from "./dialog-model";

describe("dialog-model", () => {
  it("未指定宽高不写 inline，显式宽高才 sized / fill", () => {
    expect(dialogPanelPaint()).toEqual({ sized: false, fill: false, style: {} });
    expect(dialogPanelPaint(960)).toEqual({
      sized: true,
      fill: false,
      style: { width: "960px" },
    });
    expect(dialogPanelPaint(960, 480)).toEqual({
      sized: true,
      fill: true,
      style: { width: "960px", height: "480px" },
    });
  });

  it("内容区缺省是 stack + auto + lg", () => {
    expect(resolveDialogBodySpec({})).toEqual({
      layout: "stack",
      overflow: "auto",
      pad: "lg",
    });
  });

  it("stack + hidden 只改溢出，垫与排列保持缺省", () => {
    expect(resolveDialogBodySpec({ overflow: "hidden" })).toEqual({
      layout: "stack",
      overflow: "hidden",
      pad: "lg",
    });
  });

  it("pad none 去掉内容区垫", () => {
    expect(resolveDialogBodySpec({ pad: "none" })).toEqual({
      layout: "stack",
      overflow: "auto",
      pad: "none",
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

  it("零盒不锁，正盒锁成 px", () => {
    expect(resolveDialogExitLock(0, 320)).toBeUndefined();
    expect(resolveDialogExitLock(400, 0)).toBeUndefined();
    expect(resolveDialogExitLock(400, 320)).toEqual({ width: "400px", height: "320px" });
  });

  it("出场锁盖过 hug 与显式尺寸", () => {
    const lock = { width: "400px", height: "320px" };
    expect(mergeDialogPanelStyle(dialogPanelPaint(), lock)).toEqual(lock);
    expect(mergeDialogPanelStyle(dialogPanelPaint(960, 480), lock)).toEqual(lock);
    expect(mergeDialogPanelStyle(dialogPanelPaint(960))).toEqual({ width: "960px" });
  });
});
