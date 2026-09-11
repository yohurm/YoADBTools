import { describe, expect, it } from "vitest";

import { dialogPanelPaint, resolveDialogBodySpec } from "./dialog-model";

describe("dialog-model", () => {
  it("未指定宽高不写 inline，显式宽高才 sized", () => {
    expect(dialogPanelPaint()).toEqual({ sized: false, style: {} });
    expect(dialogPanelPaint(960, 480)).toEqual({
      sized: true,
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
});
