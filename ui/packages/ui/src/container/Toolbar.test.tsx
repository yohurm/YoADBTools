import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToolbar } from "./Toolbar";
import { YoButton } from "../basic/Button";

const here = dirname(fileURLToPath(import.meta.url));
const toolbarCss = readFileSync(resolve(here, "Toolbar.css"), "utf-8");
const toolbarSrc = readFileSync(resolve(here, "Toolbar.tsx"), "utf-8");

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
    expect(toolbar.getAttribute("data-overflow")).toBe("hidden");
    expect(toolbar.getAttribute("data-pad")).toBe("band");
    expect(screen.getByRole("button", { name: "刷新" })).toBeTruthy();
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

  it("两轴 overflow hidden，消费 data-overflow", () => {
    expect(toolbarCss).toMatch(/\[data-overflow="hidden"\]\s*\{[^}]*overflow:\s*hidden/);
    expect(toolbarCss).not.toMatch(/overflow-x\s*:/);
    expect(toolbarCss).not.toMatch(/overflow-y\s*:/);
    expect(toolbarCss).not.toMatch(/overflow\s*:\s*auto/);
    expect(toolbarCss).not.toContain(".yohu-corner__content");
    expect(toolbarSrc).toContain('direction="row"');
    expect(toolbarSrc).toContain('align="center"');
    expect(toolbarSrc).toContain('overflow="hidden"');
    expect(toolbarSrc).toContain('gap="sm"');
  });
});
