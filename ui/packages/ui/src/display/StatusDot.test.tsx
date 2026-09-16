import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoStatusDot } from "./StatusDot";

describe("YoStatusDot", () => {
  it("缺省 offline 且装饰 hidden", () => {
    const { container } = render(() => <YoStatusDot />);
    const dot = container.querySelector(".yohu-status-dot");
    expect(dot?.getAttribute("data-tone")).toBe("offline");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("role")).toBeNull();
  });

  it("有 label 才暴露", () => {
    const { container } = render(() => <YoStatusDot tone="success" label="在线" />);
    const dot = container.querySelector(".yohu-status-dot");
    expect(dot?.getAttribute("data-tone")).toBe("success");
    expect(dot?.getAttribute("aria-label")).toBe("在线");
    expect(dot?.getAttribute("role")).toBe("img");
    expect(dot?.hasAttribute("aria-hidden")).toBe(false);
  });
});
