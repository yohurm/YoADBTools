import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoBadge } from "./Badge";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Badge.css"), "utf-8");

describe("YoBadge", () => {
  it("渲染文本与默认 neutral 色调", () => {
    render(() => <YoBadge text="默认" />);
    const badge = screen.getByText("默认").closest(".yohu-badge");
    expect(badge?.getAttribute("data-tone")).toBe("neutral");
    expect(badge?.className).not.toContain("yohu-badge--neutral");
    const slot = badge?.querySelector(".yohu-corner__content");
    expect(slot?.getAttribute("data-direction")).toBe("row");
    expect(slot?.getAttribute("data-align")).toBe("center");
    expect(slot?.getAttribute("data-overflow")).toBe("hidden");
    expect(slot?.getAttribute("data-pad")).toBe("inline-sm");
    expect(css).not.toContain(".yohu-corner__content");
  });

  it("应用指定色调，自持 success 不跟 Button role 绑死", () => {
    render(() => <YoBadge text="成功" tone="success" />);
    expect(screen.getByText("成功").closest(".yohu-badge")?.getAttribute("data-tone")).toBe("success");
  });

  it("warning / danger 一次替换旧 warn / error", () => {
    const { unmount } = render(() => <YoBadge text="警告" tone="warning" />);
    expect(screen.getByText("警告").closest(".yohu-badge")?.getAttribute("data-tone")).toBe("warning");
    unmount();
    render(() => <YoBadge text="危险" tone="danger" />);
    expect(screen.getByText("危险").closest(".yohu-badge")?.getAttribute("data-tone")).toBe("danger");
  });

  it("文本同时作为 aria-label（UIA 可发现）", () => {
    render(() => <YoBadge text="通过" tone="success" />);
    expect(screen.getByLabelText("通过")).toBeTruthy();
  });
});
