import { describe, expect, it } from "vitest";

import { DEFAULT_TOOLBAR_CHROME, DEFAULT_TOOLBAR_OVERFLOW, resolveToolbarSpec } from "./toolbar-model";

describe("toolbar-model", () => {
  it("缺省是命令带壳 + 横向滚动，不是 Overflow 菜单", () => {
    expect(resolveToolbarSpec()).toEqual({
      chrome: DEFAULT_TOOLBAR_CHROME,
      overflow: DEFAULT_TOOLBAR_OVERFLOW,
    });
    expect(DEFAULT_TOOLBAR_CHROME).toBe("band");
    expect(DEFAULT_TOOLBAR_OVERFLOW).toBe("scroll");
  });
});
