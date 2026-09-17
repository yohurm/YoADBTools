import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSwitch } from "./Switch";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Switch.css"), "utf8");

describe("YoSwitch", () => {
  it("关闭态 aria-checked=false", () => {
    render(() => <YoSwitch ariaLabel="自动刷新" checked={false} />);
    const sw = screen.getByRole("switch", { name: "自动刷新" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.getAttribute("data-paint")).toBe("off");
    expect(sw.className).not.toContain("yohu-switch--on");
  });

  it("点击取反 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSwitch ariaLabel="启用" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("开启态走 data-paint=on", () => {
    render(() => <YoSwitch ariaLabel="启用" checked />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("data-paint")).toBe("on");
    expect(sw.getAttribute("data-checked")).toBe("true");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.className).not.toContain("yohu-switch--on");
  });

  it("轨走 YoCorner 胶囊，宿主不再 overflow+底色叠圆角", () => {
    const { container } = render(() => <YoSwitch ariaLabel="自动刷新" checked={false} />);
    expect(container.querySelector(".yohu-switch__chrome")?.getAttribute("data-role")).toBe("control");
    expect(container.querySelector(".yohu-corner__content")?.getAttribute("data-overflow")).toBe("hidden");
    const host = css.match(/^\.yohu-switch\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(host).toContain("overflow: visible");
    expect(host).toContain("background-color: transparent");
    expect(host).not.toContain("overflow: hidden");
    expect(host).toContain("--yohu-corner-fill: var(--yohu-switch-off)");
    expect(css).not.toContain(".yohu-corner__content");
  });

  it("disabled 不触发 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSwitch ariaLabel="禁用" checked={false} disabled onChange={onChange} />);
    const sw = screen.getByRole("switch") as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute("data-disabled")).toBe("true");
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});
