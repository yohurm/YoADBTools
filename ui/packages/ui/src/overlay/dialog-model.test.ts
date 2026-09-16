import { describe, expect, it } from "vitest";

import {
  resolveDialogActionsLayout,
  resolveDialogBodyRegion,
  resolveDialogBodySpec,
  resolveDialogBox,
  resolveDialogExitLock,
  resolveDialogInitial,
} from "./dialog-model";

describe("dialog-model", () => {
  it("打开且无显式高是 fit hug，不写 height", () => {
    expect(resolveDialogBox({ open: true })).toEqual({ kind: "fit", sized: false, style: {} });
    expect(resolveDialogBox({ open: true, width: 960 })).toEqual({
      kind: "fit",
      sized: true,
      style: { width: "960px" },
    });
  });

  it("显式高才 fill", () => {
    expect(resolveDialogBox({ open: true, width: 960, height: 480 })).toEqual({
      kind: "fill",
      sized: true,
      style: { width: "960px", height: "480px" },
    });
  });

  it("关闭有最后打开盒才 exit 锁盒，否则回退 props 尺寸", () => {
    const lock = { width: "400px", height: "320px" };
    expect(resolveDialogBox({ open: false, lastOpen: lock })).toEqual({
      kind: "exit",
      sized: false,
      style: lock,
    });
    expect(resolveDialogBox({ open: false, width: 960, lastOpen: lock })).toEqual({
      kind: "exit",
      sized: true,
      style: lock,
    });
    expect(resolveDialogBox({ open: false, width: 960 })).toEqual({
      kind: "exit",
      sized: true,
      style: { width: "960px" },
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
