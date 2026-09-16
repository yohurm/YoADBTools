import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoButton } from "./Button";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Button.css"), "utf8");

function hostRule(): string {
  return css.match(/^\.yohu-button\s*\{([^}]*)\}/m)?.[1] ?? "";
}

function labelRule(): string {
  return css.match(/^\.yohu-button__label\s*\{([^}]*)\}/m)?.[1] ?? "";
}

describe("YoButton", () => {
  it("字重对照 HarmonyOS Medium，不是 Semibold", () => {
    expect(css).toContain("font-weight: var(--yohu-font-weight-medium)");
    expect(css).not.toContain("font-weight: var(--yohu-font-weight-semibold)");
  });

  it("无 props 是 solid+accent 主按钮，没有旧变体 class", () => {
    render(() => <YoButton>保存</YoButton>);
    const btn = screen.getByRole("button", { name: "保存" });
    expect(btn.getAttribute("data-variant")).toBe("solid");
    expect(btn.getAttribute("data-tone")).toBe("accent");
    expect(btn.getAttribute("data-size")).toBe("md");
    expect(btn.getAttribute("data-paint")).toBe("solid-on");
    expect(btn.className).not.toContain("yohu-button--primary");
    expect(btn.className).not.toContain("yohu-button--md");
  });

  it("tone=danger 走 solid-on，不用旧 danger class", () => {
    render(() => (
      <YoButton tone="danger" size="sm">
        删除
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "删除" });
    expect(btn.getAttribute("data-paint")).toBe("solid-on");
    expect(btn.getAttribute("data-tone")).toBe("danger");
    expect(btn.getAttribute("data-size")).toBe("sm");
    expect(btn.className).not.toContain("yohu-button--danger");
  });

  it("outlined+neutral 等同旧 secondary", () => {
    render(() => (
      <YoButton variant="outlined" tone="neutral">
        取消
      </YoButton>
    ));
    expect(screen.getByRole("button").getAttribute("data-paint")).toBe("outlined-neutral");
  });

  it("ghost+neutral 等同旧 ghost", () => {
    render(() => (
      <YoButton variant="ghost" tone="neutral">
        稍后
      </YoButton>
    ));
    expect(screen.getByRole("button").getAttribute("data-paint")).toBe("ghost-neutral");
  });

  it("solid+success 走软底语义字，不走 solid-on", () => {
    render(() => (
      <YoButton tone="success">
        通过
      </YoButton>
    ));
    expect(screen.getByRole("button").getAttribute("data-paint")).toBe("solid-tone");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => (
      <YoButton variant="outlined" tone="neutral" onClick={onClick}>
        取消
      </YoButton>
    ));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 状态具有 disabled 属性", () => {
    render(() => <YoButton disabled>禁用</YoButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("loading 状态显示 spinner 并禁用", () => {
    render(() => <YoButton loading>加载中</YoButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.querySelector(".yohu-button__spinner")).toBeTruthy();
  });

  it("文案切换后面名跟着变（测试环境跳过换牌等待）", () => {
    const [label, setLabel] = createSignal("预览");
    render(() => <YoButton>{label()}</YoButton>);
    expect(screen.getByRole("button", { name: "预览" })).toBeTruthy();
    setLabel("收起预览");
    expect(screen.getByRole("button", { name: "收起预览" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "预览" })).toBeNull();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-resizing")).toBeNull();
  });

  it("aria-pressed 透传到按钮", () => {
    render(() => (
      <YoButton size="sm" variant="outlined" tone="neutral" aria-pressed>
        仅显示
      </YoButton>
    ));
    expect(screen.getByRole("button", { name: "仅显示" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("可见字母不足时 aria-label 作无障碍名，不画气泡", () => {
    const { container } = render(() => (
      <YoButton variant="ghost" tone="neutral" aria-label="Verbose">
        V
      </YoButton>
    ));
    expect(screen.getByRole("button", { name: "Verbose" })).toBeTruthy();
    expect(container.querySelector(".yohu-tooltip__anchor")).toBeNull();
  });

  it("没有 ink / flush 轴", () => {
    render(() => (
      <YoButton variant="ghost" tone="neutral" aria-pressed>
        V
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "V" });
    expect(btn.getAttribute("data-paint")).toBe("ghost-neutral");
    expect(btn.hasAttribute("data-ink")).toBe(false);
    expect(btn.hasAttribute("data-flush")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(css).not.toContain("[data-ink");
    expect(css).not.toContain("[data-flush");
    expect(css).not.toContain("--yohu-button-ink: inherit");
    expect(css).not.toContain("border-radius: var(--yohu-radius-none)");
  });

  it("铬只 paint，字在 label hug，不点 swap、不 clip-path 裁字", () => {
    const { container } = render(() => <YoButton>展开其余 294 项</YoButton>);
    expect(container.querySelector(".yohu-swap")?.getAttribute("data-anchor")).toBe("center");
    expect(container.querySelector(".yohu-button__chrome")?.getAttribute("data-mode")).toBe("paint");
    expect(container.querySelector(".yohu-corner__content")).toBeNull();
    expect(container.querySelector(".yohu-button__label")?.textContent).toBe("展开其余 294 项");
    expect(hostRule()).toContain("min-width: min-content");
    expect(hostRule()).toContain("justify-content: center");
    expect(labelRule()).toContain("min-width: min-content");
    expect(labelRule()).toContain("justify-content: center");
    expect(css).not.toContain(".yohu-button__chrome .yohu-corner__content");
    expect(css).not.toContain(".yohu-button .yohu-swap");
    expect(css).not.toContain(".yohu-swap__clip");
  });

  it("ghost-tone 是鸿蒙 NORMAL 灰底，不是透明 TEXTUAL", () => {
    expect(css).toMatch(
      /\.yohu-button\[data-paint="ghost-tone"\]\s*\{[^}]*--yohu-corner-fill:\s*var\(--yohu-surface-2\)/,
    );
    expect(css).not.toMatch(
      /\.yohu-button\[data-paint="ghost-tone"\]\s*\{[^}]*--yohu-corner-fill:\s*transparent/,
    );
  });

  it("始终走 YoCorner control paint，宿主不自画圆角", () => {
    const { container } = render(() => <YoButton>保存</YoButton>);
    expect(container.querySelector(".yohu-button__chrome")?.getAttribute("data-role")).toBe("control");
    expect(container.querySelector(".yohu-button__chrome")?.getAttribute("data-mode")).toBe("paint");
    expect(hostRule()).toContain("overflow: visible");
    expect(hostRule()).not.toContain("overflow: hidden");
    expect(hostRule()).not.toContain("border-radius:");
  });

  it("paint 声明描边几何，outlined 色只走 corner-stroke，宿主不写 border", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Button.tsx"), "utf8");
    expect(src).toMatch(/<YoCorner[^>]*stroke/);
    expect(src).toContain('mode="paint"');
    expect(css).toContain("--yohu-corner-stroke: var(--yohu-border)");
    expect(css).toContain("--yohu-corner-stroke: var(--yohu-button-ink)");
    expect(hostRule()).toMatch(/border:\s*none/);
    expect(hostRule()).not.toContain("--yohu-stroke");
  });
});
