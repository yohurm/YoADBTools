import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoSpinner } from "./Spinner";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Spinner.css"), "utf-8");

describe("YoSpinner", () => {
  it("默认 sm 档、无轨道、aria 隐藏", () => {
    const { container } = render(() => <YoSpinner />);
    const host = container.querySelector(".yohu-spinner");
    expect(host?.getAttribute("data-size")).toBe("sm");
    expect(host?.getAttribute("aria-hidden")).toBe("true");
    expect(host?.querySelector(".yohu-spinner__arc")).toBeTruthy();
    expect(host?.querySelector(".yohu-spinner__track")).toBeNull();
  });

  it("track 时画底道，size 档落在 data-size", () => {
    const { container } = render(() => <YoSpinner size="lg" track />);
    const host = container.querySelector(".yohu-spinner");
    expect(host?.getAttribute("data-size")).toBe("lg");
    expect(host?.querySelector(".yohu-spinner__track")).toBeTruthy();
  });

  it("宿主槽位名透传", () => {
    const { container } = render(() => <YoSpinner class="yohu-loading__spinner" />);
    expect(container.querySelector(".yohu-spinner.yohu-loading__spinner")).toBeTruthy();
  });

  it("弧长伸缩走 loopSlow token，静止底形不是 0 长度", () => {
    expect(css).toContain("animation: yohu-spinner-arc var(--yohu-dur-loop-slow)");
    expect(css).toContain("stroke-dasharray: 35 65");
    expect(css).not.toContain("border-top-color");
  });
});
