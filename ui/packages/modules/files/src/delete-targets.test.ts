import { describe, expect, it } from "vitest";

import { DELETE_PREVIEW_LIMIT, canToggleDelete, dropDeleteName } from "./delete-targets";

describe("canToggleDelete", () => {
  it("只有超出预览才给展开/收起", () => {
    expect(canToggleDelete(["a.png"])).toBe(false);
    expect(canToggleDelete(Array.from({ length: DELETE_PREVIEW_LIMIT }, (_, i) => `f${i}.png`))).toBe(
      false,
    );
    expect(
      canToggleDelete(Array.from({ length: DELETE_PREVIEW_LIMIT + 1 }, (_, i) => `f${i}.png`)),
    ).toBe(true);
  });
});

describe("dropDeleteName", () => {
  it("按名移除待删对象", () => {
    expect(dropDeleteName(["a.png", "b.png", "c.png"], "b.png")).toEqual(["a.png", "c.png"]);
  });

  it("没有该项时保持原名单", () => {
    expect(dropDeleteName(["a.png"], "missing.png")).toEqual(["a.png"]);
  });
});
