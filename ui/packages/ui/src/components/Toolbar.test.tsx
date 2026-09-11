import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToolbar } from "./Toolbar";
import { YoButton } from "./Button";

const toolbarCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Toolbar.css"), "utf-8");

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
    expect(toolbar.getAttribute("data-pad")).toBe("band");
    expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
  });

  it("pad=xs 写成 data-pad", () => {
    render(() => (
      <YoToolbar pad="xs">
        <YoButton>新增</YoButton>
      </YoToolbar>
    ));
    expect(screen.getByRole("toolbar").getAttribute("data-pad")).toBe("xs");
  });

  it("垫走 data-pad，铬不写 padding", () => {
    expect(toolbarCss).toContain('[data-pad="band"]');
    expect(toolbarCss).toContain('[data-pad="xs"]');
    expect(toolbarCss).not.toMatch(/\[data-chrome="band"\]\s*\{[^}]*padding:/);
  });
});
