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

  it("无 props 是 emphasized+accent，没有 paint / variant 轴", () => {
    render(() => <YoButton>保存</YoButton>);
    const btn = screen.getByRole("button", { name: "保存" });
    expect(btn.getAttribute("data-style")).toBe("emphasized");
    expect(btn.getAttribute("data-tone")).toBe("accent");
    expect(btn.getAttribute("data-size")).toBe("md");
    expect(btn.hasAttribute("data-paint")).toBe(false);
    expect(btn.hasAttribute("data-variant")).toBe(false);
    expect(btn.className).not.toContain("yohu-button--primary");
  });

  it("tone=danger 是 EMPHASIZED + ERROR，不用旧 danger class", () => {
    render(() => (
      <YoButton tone="danger" size="sm">
        删除
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "删除" });
    expect(btn.getAttribute("data-style")).toBe("emphasized");
    expect(btn.getAttribute("data-tone")).toBe("danger");
    expect(btn.className).not.toContain("yohu-button--danger");
  });

  it("normal 走官方 comp-gray，不是 surface-2，hover 不换成 state-hover", () => {
    render(() => (
      <YoButton buttonStyle="normal" tone="neutral">
        取消
      </YoButton>
    ));
    expect(screen.getByRole("button").getAttribute("data-style")).toBe("normal");
    expect(css).toMatch(
      /\.yohu-button\[data-style="normal"\]\s*\{[^}]*--yohu-corner-fill:\s*var\(--yohu-comp-gray\)/,
    );
    expect(css).toMatch(
      /\.yohu-button\[data-style="normal"\]:not\(:disabled\):hover\s*\{[^}]*--yohu-corner-fill:\s*var\(--yohu-comp-gray-hover\)/,
    );
    expect(css).not.toContain("surface-2");
    expect(css).not.toContain("data-paint");
    expect(css).not.toContain("emphasized-soft");
    expect(css).not.toContain("emphasized-plate");
  });

  it("textual 无底", () => {
    render(() => (
      <YoButton buttonStyle="textual" tone="neutral">
        稍后
      </YoButton>
    ));
    expect(screen.getByRole("button").getAttribute("data-style")).toBe("textual");
    expect(css).toMatch(
      /\.yohu-button\[data-style="textual"\]\s*\{[^}]*--yohu-corner-fill:\s*transparent/,
    );
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => (
      <YoButton buttonStyle="normal" tone="neutral" onClick={onClick}>
        取消
      </YoButton>
    ));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 背板不改，只降字色", () => {
    render(() => <YoButton disabled>禁用</YoButton>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(css).toMatch(/\.yohu-button:disabled\s*\{[^}]*color:\s*var\(--yohu-fg-3\)/);
    expect(css).not.toMatch(/\.yohu-button:disabled\s*\{[^}]*--yohu-corner-fill:\s*var\(--yohu-disabled\)/);
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
  });

  it("aria-pressed 透传到按钮", () => {
    render(() => (
      <YoButton size="sm" buttonStyle="normal" tone="neutral" aria-pressed>
        仅显示
      </YoButton>
    ));
    expect(screen.getByRole("button", { name: "仅显示" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("可见字母不足时 aria-label 作无障碍名，不画气泡", () => {
    const { container } = render(() => (
      <YoButton buttonStyle="textual" tone="neutral" aria-label="Verbose">
        V
      </YoButton>
    ));
    expect(screen.getByRole("button", { name: "Verbose" })).toBeTruthy();
    expect(container.querySelector(".yohu-tooltip__anchor")).toBeNull();
  });

  it("没有 ink / flush / paint / variant 轴", () => {
    render(() => (
      <YoButton buttonStyle="textual" tone="neutral" aria-pressed>
        V
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "V" });
    expect(btn.hasAttribute("data-paint")).toBe(false);
    expect(btn.hasAttribute("data-ink")).toBe(false);
    expect(btn.hasAttribute("data-flush")).toBe(false);
    expect(css).not.toContain("[data-ink");
    expect(css).not.toContain("[data-flush");
    expect(css).not.toContain("[data-paint");
  });

  it("铬只 paint，字在 label hug", () => {
    const { container } = render(() => <YoButton>展开其余 294 项</YoButton>);
    expect(container.querySelector(".yohu-swap")?.getAttribute("data-anchor")).toBe("center");
    expect(container.querySelector(".yohu-button__chrome")?.getAttribute("data-mode")).toBe("paint");
    expect(container.querySelector(".yohu-button__label")?.textContent).toBe("展开其余 294 项");
    expect(hostRule()).toContain("min-width: min-content");
    expect(labelRule()).toContain("min-width: min-content");
  });

  it("block 铺满父级，解开帽宽", () => {
    render(() => (
      <YoButton block buttonStyle="textual" tone="neutral" aria-label="展开输入">
        展开
      </YoButton>
    ));
    expect(screen.getByRole("button", { name: "展开输入" }).getAttribute("data-block")).toBe("true");
    expect(css).toMatch(/\.yohu-button\[data-block\]\s*\{[^}]*width:\s*100%/);
  });

  it("始终走 YoCorner control paint，宿主不自画圆角", () => {
    const { container } = render(() => <YoButton>保存</YoButton>);
    expect(container.querySelector(".yohu-button__chrome")?.getAttribute("data-role")).toBe("control");
    expect(hostRule()).toContain("overflow: visible");
    expect(hostRule()).not.toContain("border-radius:");
    expect(hostRule()).toMatch(/border:\s*none/);
  });
});
