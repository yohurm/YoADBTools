import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoProgressBar } from "./ProgressBar";

describe("YoProgressBar", () => {
  it("确定态：宽度按 value 比例渲染", () => {
    const { container } = render(() => <YoProgressBar value={50} />);
    const bar = container.querySelector(".yohu-progress__bar") as HTMLElement;
    expect(bar.style.width).toBe("50%");
    const host = screen.getByRole("progressbar");
    expect(host.getAttribute("aria-valuenow")).toBe("50");
    expect(host.getAttribute("data-mode")).toBe("determinate");
  });

  it("value 夹取到 0-100", () => {
    const { container } = render(() => <YoProgressBar value={150} />);
    expect((container.querySelector(".yohu-progress__bar") as HTMLElement).style.width).toBe("100%");
  });

  it("不定态应用 class 与 data-mode，不写宽度", () => {
    const { container } = render(() => <YoProgressBar indeterminate />);
    const host = container.querySelector(".yohu-progress") as HTMLElement;
    expect(host.getAttribute("data-mode")).toBe("indeterminate");
    expect(host.getAttribute("data-mode")).toBe("indeterminate");
    expect(host.getAttribute("aria-valuenow")).toBeNull();
    expect((container.querySelector(".yohu-progress__bar") as HTMLElement).style.width).toBe("");
  });
});
