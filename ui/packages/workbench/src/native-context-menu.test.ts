import { describe, expect, it } from "vitest";
import { allowNativeContextMenu } from "./native-context-menu";

describe("allowNativeContextMenu", () => {
  it("写入控件保留系统菜单", () => {
    const input = document.createElement("input");
    document.body.append(input);
    expect(allowNativeContextMenu(input)).toBe(true);
    input.remove();
  });

  it("页面其余挡住 Chromium 菜单", () => {
    const div = document.createElement("div");
    document.body.append(div);
    expect(allowNativeContextMenu(div)).toBe(false);
    expect(allowNativeContextMenu(null)).toBe(false);
    div.remove();
  });
});
