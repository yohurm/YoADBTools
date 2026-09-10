import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoIconButton } from "./IconButton";

describe("YoIconButton", () => {
  it("渲染图标与悬浮提示，默认 md 透明铬", () => {
    const { container } = render(() => <YoIconButton icon="refresh" title="刷新" />);
    const btn = screen.getByRole("button", { name: "刷新" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("title")).toBeNull();
    expect(btn.closest(".yohu-tooltip__anchor")).toBeTruthy();
    expect(btn.getAttribute("data-size")).toBe("md");
    expect(btn.getAttribute("data-paint")).toBeNull();
    expect(btn.className).not.toContain("yohu-button");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("size=sm 写入 data-size，不接受魔法 px", () => {
    render(() => <YoIconButton icon="settings" size="sm" title="设置" />);
    expect(screen.getByRole("button", { name: "设置" }).getAttribute("data-size")).toBe("sm");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(() => <YoIconButton icon="settings" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 时禁用", () => {
    render(() => <YoIconButton icon="play" disabled />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading 时旋转并禁用", () => {
    const { container } = render(() => <YoIconButton icon="refresh" title="刷新" loading />);
    const btn = screen.getByRole("button", { name: "刷新" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("data-busy")).toBe("");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".yohu-icon-button[data-busy]")).toBeTruthy();
  });

  it("pressed 时带 aria-pressed 与 data-pressed", () => {
    render(() => <YoIconButton icon="nav-home" title="Home" pressed />);
    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("data-pressed")).toBe("");
  });

  it("aria-pressed 可不带按下铬", () => {
    render(() => <YoIconButton icon="display-on" title="主题" aria-pressed={true} />);
    const btn = screen.getByRole("button", { name: "主题" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("data-pressed")).toBeNull();
  });

  it("children 覆盖具名图标作为内容区", () => {
    const { container } = render(() => (
      <YoIconButton title="自定义">
        <span data-slot="glyph">槽</span>
      </YoIconButton>
    ));
    expect(container.querySelector("[data-slot=glyph]")?.textContent).toBe("槽");
    expect(container.querySelector("svg")).toBeNull();
  });
});
