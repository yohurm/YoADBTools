import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSwitch } from "./Switch";

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
