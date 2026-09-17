import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { loadMotionCss, loadMotionLayerCss } from "../../css";
import { YoIndicator } from "./index";

describe("YoIndicator", () => {
  it("挂配方 class，并把父级标成 indicator-host", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow="a" variant="fill" />
        <button class="yohu-interactive yohu-interactive--selected" type="button">
          A
        </button>
      </div>
    ));
    const thumb = container.querySelector(".yohu-recipe-indicator");
    expect(thumb?.classList.contains("yohu-recipe-indicator--fill")).toBe(true);
    expect(thumb?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".track")?.classList.contains("yohu-indicator-host")).toBe(true);
    expect(container.querySelector(".track")?.getAttribute("data-indicator-variant")).toBe("fill");
  });

  it("follow 为空时不标 ready", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={null} variant="underline" />
        <button class="yohu-interactive yohu-interactive--selected" type="button">
          A
        </button>
      </div>
    ));
    expect(container.querySelector(".yohu-recipe-indicator--underline")).toBeTruthy();
    expect(container.querySelector(".track")?.hasAttribute("data-indicator-ready")).toBe(false);
  });

  it("decorate=false 不把父级标成 indicator-host", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator decorate={false} follow="a" variant="fill" />
        <button class="yohu-interactive yohu-interactive--selected" type="button">
          A
        </button>
      </div>
    ));
    expect(container.querySelector(".track")?.classList.contains("yohu-indicator-host")).toBe(false);
    expect(container.querySelector(".yohu-recipe-indicator--fill")).toBeTruthy();
  });

  it("follow 变化仍保持同一滑块节点", () => {
    const [follow, setFollow] = createSignal("a");
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={follow()} variant="fill" />
        <button
          class="yohu-interactive"
          classList={{ "yohu-interactive--selected": follow() === "a" }}
          type="button"
        >
          A
        </button>
        <button
          class="yohu-interactive"
          classList={{ "yohu-interactive--selected": follow() === "b" }}
          type="button"
        >
          B
        </button>
      </div>
    ));
    const first = container.querySelector(".yohu-recipe-indicator");
    setFollow("b");
    expect(container.querySelector(".yohu-recipe-indicator")).toBe(first);
  });

  it("fill 滑块圆角走 --yohu-ripple-radius，与 document 行盒 chip 同一 token", () => {
    const css = loadMotionLayerCss("engines/indicator/indicator.css");
    expect(css).toMatch(
      /\.yohu-recipe-indicator--fill\s*\{[^}]*border-radius:\s*var\(--yohu-ripple-radius\)/,
    );
  });

  it("fill 宿主两轴 hidden 裁切过冲，禁止只写 overflow-x 把纵轴算成 auto", () => {
    const css = loadMotionCss();
    expect(css).toMatch(
      /\.yohu-indicator-host\[data-indicator-variant="fill"\]\s*\{[^}]*overflow:\s*hidden/,
    );
    expect(css).not.toMatch(
      /\.yohu-indicator-host\[data-indicator-variant="fill"\]\s*\{[^}]*overflow-x:\s*hidden/,
    );
    expect(css).not.toMatch(
      /\.yohu-indicator-host\[data-indicator-variant="(underline|thumb)"\][^}]*overflow:\s*hidden/,
    );
  });

  it("indicator.css 不给 .yohu-list-item__info 写 transition: color", () => {
    const css = loadMotionLayerCss("engines/indicator/indicator.css");
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toMatch(/\.yohu-list-item__info\s*\{[^}]*transition:\s*color/);
    expect(css).not.toMatch(/\.yohu-interactive\s+\*\s*\{[^}]*transition:\s*color/);
  });
});
