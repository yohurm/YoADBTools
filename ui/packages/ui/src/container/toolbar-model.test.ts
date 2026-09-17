import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOLBAR_CHROME,
  DEFAULT_TOOLBAR_OVERFLOW,
  DEFAULT_TOOLBAR_PAD,
  resolveToolbarSpec,
} from "./toolbar-model";

describe("toolbar-model", () => {
  it("缺省是命令带壳 + 横向裁切，不是 Overflow 菜单", () => {
    expect(resolveToolbarSpec()).toEqual({
      chrome: DEFAULT_TOOLBAR_CHROME,
      overflow: DEFAULT_TOOLBAR_OVERFLOW,
      pad: DEFAULT_TOOLBAR_PAD,
    });
    expect(DEFAULT_TOOLBAR_CHROME).toBe("band");
    expect(DEFAULT_TOOLBAR_OVERFLOW).toBe("hidden");
    expect(DEFAULT_TOOLBAR_PAD).toBe("band");
  });

  it("pad=xs 贴栏走 plain 铬，不嵌套命令带", () => {
    expect(resolveToolbarSpec({ pad: "xs" })).toEqual({
      chrome: "plain",
      overflow: DEFAULT_TOOLBAR_OVERFLOW,
      pad: "xs",
    });
  });

  it("chrome / overflow 不接受 input 覆写；贴栏由 pad 推导", () => {
    expect(resolveToolbarSpec().chrome).toBe("band");
    expect(resolveToolbarSpec().overflow).toBe("hidden");
    expect(resolveToolbarSpec({ pad: "xs" }).chrome).toBe("plain");
    expect(resolveToolbarSpec({ pad: "xs" }).overflow).toBe(DEFAULT_TOOLBAR_OVERFLOW);
  });
});
