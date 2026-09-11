import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoButton } from "./Button";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Button.css"), "utf8");

describe("YoButton", () => {
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

  it("ink + flush 写 data-ink=inherit 与 data-flush，不改 paint", () => {
    render(() => (
      <YoButton variant="ghost" tone="neutral" ink flush aria-pressed>
        V
      </YoButton>
    ));
    const btn = screen.getByRole("button", { name: "V" });
    expect(btn.getAttribute("data-paint")).toBe("ghost-neutral");
    expect(btn.getAttribute("data-ink")).toBe("inherit");
    expect(btn.hasAttribute("data-flush")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("inherit 按下消费 --yohu-button-fill；flush 铺满且自隐铬", () => {
    expect(css).toContain('[data-ink="inherit"]');
    expect(css).toContain("--yohu-button-ink: inherit");
    expect(css).toContain("--yohu-button-fill: inherit");
    expect(css).toContain('[data-ink="inherit"][aria-pressed="true"]');
    expect(css).toContain("background-color: var(--yohu-button-fill)");
    expect(css).toContain("[data-flush]");
    expect(css).toContain("height: 100%");
    expect(css).toContain("border-radius: var(--yohu-radius-none)");
  });
});
