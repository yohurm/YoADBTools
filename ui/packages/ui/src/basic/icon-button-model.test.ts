import { describe, expect, it } from "vitest";
import {
  DEFAULT_ICON_BUTTON_SIZE,
  iconButtonContentOk,
  resolveIconButtonSpec,
} from "./icon-button-model";

describe("icon-button-model", () => {
  it("缺省是 md + 具名图标", () => {
    expect(resolveIconButtonSpec({ hasIcon: true })).toEqual({
      size: DEFAULT_ICON_BUTTON_SIZE,
      paint: undefined,
      content: "icon",
    });
    expect(DEFAULT_ICON_BUTTON_SIZE).toBe("md");
  });

  it("传入 size 原样保留", () => {
    expect(resolveIconButtonSpec({ size: "sm", hasIcon: true }).size).toBe("sm");
  });

  it("paint=window 进 spec，未知值丢掉", () => {
    expect(resolveIconButtonSpec({ hasIcon: true, paint: "window" }).paint).toBe("window");
    expect(resolveIconButtonSpec({ hasIcon: true, paint: "ghost" as never }).paint).toBeUndefined();
  });

  it("有 slot 时内容区走 slot，不是具名图标", () => {
    expect(resolveIconButtonSpec({ hasIcon: true, hasSlot: true }).content).toBe("slot");
    expect(resolveIconButtonSpec({ hasSlot: true }).content).toBe("slot");
  });

  it("空内容不合法，图标或 slot 任一即可", () => {
    expect(iconButtonContentOk({})).toBe(false);
    expect(iconButtonContentOk({ hasIcon: true })).toBe(true);
    expect(iconButtonContentOk({ hasSlot: true })).toBe(true);
  });
});
