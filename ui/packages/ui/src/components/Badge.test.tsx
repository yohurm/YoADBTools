import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoBadge } from "./Badge";

describe("YoBadge", () => {
  it("渲染文本与默认 neutral 色调", () => {
    render(() => <YoBadge text="默认" />);
    const badge = screen.getByText("默认");
    expect(badge.getAttribute("data-tone")).toBe("neutral");
    expect(badge.className).not.toContain("yohu-badge--neutral");
  });

  it("应用指定色调，与 Button 同一枚举", () => {
    render(() => <YoBadge text="成功" tone="success" />);
    expect(screen.getByText("成功").getAttribute("data-tone")).toBe("success");
  });

  it("warning / danger 一次替换旧 warn / error", () => {
    const { unmount } = render(() => <YoBadge text="警告" tone="warning" />);
    expect(screen.getByText("警告").getAttribute("data-tone")).toBe("warning");
    unmount();
    render(() => <YoBadge text="危险" tone="danger" />);
    expect(screen.getByText("危险").getAttribute("data-tone")).toBe("danger");
  });

  it("文本同时作为 aria-label（UIA 可发现）", () => {
    render(() => <YoBadge text="通过" tone="success" />);
    expect(screen.getByLabelText("通过")).toBeTruthy();
  });
});
