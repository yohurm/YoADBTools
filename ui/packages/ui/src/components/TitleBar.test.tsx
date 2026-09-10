import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoTitleBar } from "./TitleBar";

function loadTitleBarCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/TitleBar.css"),
    resolve(process.cwd(), "packages/ui/src/components/TitleBar.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoTitleBar", () => {
  it("渲染标题并带拖动区", () => {
    const { container } = render(() => <YoTitleBar title="Yohu ADB Tools" icon="terminal" />);
    expect(screen.getByText("Yohu ADB Tools")).toBeTruthy();
    expect(container.querySelector("[data-tauri-drag-region]")).toBeTruthy();
    expect(container.querySelector('svg[data-icon="terminal"]')).toBeTruthy();
  });

  it("logoSrc 优先于字形 icon", () => {
    const { container } = render(() => (
      <YoTitleBar title="Yohu ADB Tools" icon="terminal" logoSrc="/app-icon.png" />
    ));
    expect(container.querySelector(".yohu-titlebar__logo")?.getAttribute("src")).toBe("/app-icon.png");
    expect(container.querySelector('svg[data-icon="terminal"]')).toBeNull();
  });

  it("三键顺序为最小化、最大化、关闭", () => {
    render(() => <YoTitleBar title="窗" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["最小化", "最大化", "关闭"]);
    expect(buttons.map((b) => b.getAttribute("data-caption"))).toEqual(["min", "max", "close"]);
    expect(buttons.map((b) => b.getAttribute("data-paint"))).toEqual(["window", "window", "close"]);
  });

  it("最大化时最大化键变为还原", () => {
    render(() => <YoTitleBar title="窗" maximized />);
    expect(screen.getByRole("button", { name: "还原" })).toBeTruthy();
  });

  it("三键回调", () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoTitleBar
        title="窗"
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "最大化" }));
    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("三键不参与拖动区", () => {
    const { container } = render(() => <YoTitleBar title="窗" />);
    const captions = container.querySelectorAll(".yohu-titlebar__caption");
    expect(captions.length).toBe(3);
    captions.forEach((btn) => {
      expect(btn.hasAttribute("data-tauri-drag-region")).toBe(false);
    });
  });

  it("拖动只在品牌与中区，不覆盖右侧铬条", () => {
    const { container } = render(() => <YoTitleBar title="窗" />);
    expect(container.querySelector(".yohu-titlebar")?.hasAttribute("data-tauri-drag-region")).toBe(
      false,
    );
    expect(container.querySelector(".yohu-titlebar__brand")?.hasAttribute("data-tauri-drag-region")).toBe(
      true,
    );
    expect(container.querySelector(".yohu-titlebar__center")?.hasAttribute("data-tauri-drag-region")).toBe(
      true,
    );
    expect(
      container.querySelector(".yohu-titlebar__trailing")?.hasAttribute("data-tauri-drag-region"),
    ).toBe(false);
  });

  it("双击标题栏切换最大化（点在三键上不触发）", () => {
    const onToggleMaximize = vi.fn();
    const { container } = render(() => <YoTitleBar title="窗" onToggleMaximize={onToggleMaximize} />);
    fireEvent.dblClick(container.querySelector(".yohu-titlebar__title") as HTMLElement);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    fireEvent.dblClick(screen.getByRole("button", { name: "最小化" }));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("侧栏操作与三键同在右侧铬条", () => {
    const { container } = render(() => (
      <YoTitleBar title="窗" actions={<button type="button" aria-label="侧栏" />} />
    ));
    const trailing = container.querySelector(".yohu-titlebar__trailing");
    expect(trailing?.querySelector(".yohu-titlebar__actions")).toBeTruthy();
    expect(trailing?.querySelectorAll(".yohu-titlebar__caption").length).toBe(3);
  });

  it("nativeCaptions 隐藏自定义三键并标记 native", () => {
    const { container } = render(() => <YoTitleBar title="窗" nativeCaptions />);
    expect(container.querySelectorAll(".yohu-titlebar__caption").length).toBe(0);
    expect(container.querySelector(".yohu-titlebar")?.getAttribute("data-captions")).toBe("native");
    expect(container.querySelector(".yohu-titlebar--native-captions")).toBeNull();
  });

  it("中区可承载 children（不再挂模块通栏）", () => {
    const { container } = render(() => (
      <YoTitleBar title="窗">
        <span>通栏</span>
      </YoTitleBar>
    ));
    expect(container.querySelector(".yohu-titlebar__center")?.textContent).toContain("通栏");
  });

  it("三键贴边满高，关闭例外色走 error token", () => {
    const css = loadTitleBarCss();
    expect(css.length).toBeGreaterThan(0);
    const bar = css.match(/\.yohu-titlebar\s*\{[^}]+\}/)?.[0] ?? "";
    expect(bar).not.toMatch(/padding-right/);
    const caption = css.match(/\.yohu-titlebar__caption\s*\{[^}]+\}/)?.[0] ?? "";
    expect(caption).toMatch(/height:\s*100%/);
    expect(caption).toMatch(/padding:\s*0/);
    expect(caption).toMatch(/border-radius:\s*var\(--yohu-radius-none\)/);
    expect(css).toMatch(
      /\[data-paint="close"\]:hover\s*\{[^}]*background-color:\s*var\(--yohu-error\)/,
    );
    expect(css).toMatch(
      /\[data-paint="close"\]:active\s*\{[^}]*background-color:\s*var\(--yohu-error-pressed\)/,
    );
    expect(css.toLowerCase()).not.toContain(["#", "c42b1c"].join(""));
    expect(css).not.toMatch(/color-mix/);
  });
});
