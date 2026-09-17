import { describe, expect, it } from "vitest";

import {
  dialogHugsContent,
  resolveDialogActionsLayout,
  resolveDialogBodyRegion,
  resolveDialogBodySpec,
  resolveDialogBox,
  resolveDialogExitLock,
  resolveDialogInitial,
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

  it("零盒不锁，正盒锁成 px", () => {
    expect(resolveDialogExitLock(0, 320)).toBeUndefined();
    expect(resolveDialogExitLock(400, 0)).toBeUndefined();
    expect(resolveDialogExitLock(400, 320)).toEqual({ width: "400px", height: "320px" });
  });

});
