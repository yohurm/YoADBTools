import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToolbar } from "./Toolbar";
import { YoButton } from "./Button";

describe("YoToolbar", () => {
  it("水平排列 children", () => {
    render(() => (
      <YoToolbar>
        <YoButton>刷新</YoButton>
        <YoButton variant="outlined" tone="neutral">导出</YoButton>
      </YoToolbar>
    ));
    const toolbar = screen.getByRole("toolbar");
    expect(toolbar.className).toContain("yohu-toolbar");
    expect(toolbar.getAttribute("data-chrome")).toBe("band");
    expect(toolbar.getAttribute("data-overflow")).toBe("scroll");
    expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
  });
});
