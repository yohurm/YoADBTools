import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { loadMotionCss, loadMotionLayerCss } from "../../css";
import { YoIndicator } from "./index";

describe("YoIndicator", () => {
  it("滑块挂自己的配方 class，不改父级的宿主标记", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow="a" variant="fill" />
        <button type="button" data-selected="">
          A
        </button>
      </div>
    ));
    const thumb = container.querySelector(".yohu-recipe-indicator");
    expect(thumb?.classList.contains("yohu-recipe-indicator--fill")).toBe(true);
    expect(thumb?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".track")?.classList.contains("yohu-indicator-host")).toBe(false);
    expect(container.querySelector(".track")?.hasAttribute("data-indicator-variant")).toBe(false);
  });

  it("follow 为空时不标 ready", () => {
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={null} variant="underline" />
        <button type="button" data-selected="">
          A
        </button>
      </div>
    ));
    expect(container.querySelector(".yohu-recipe-indicator--underline")).toBeTruthy();
    expect(container.querySelector(".track")?.hasAttribute("data-indicator-ready")).toBe(false);
  });

  it("不剥掉轨自己声明的宿主标记", () => {
    const { container } = render(() => (
      <div class="track yohu-indicator-host" data-indicator-variant="thumb">
        <YoIndicator follow="a" variant="thumb" />
        <button type="button" data-selected="">
          A
        </button>
      </div>
    ));
    const track = container.querySelector(".track");
    expect(track?.classList.contains("yohu-indicator-host")).toBe(true);
    expect(track?.getAttribute("data-indicator-variant")).toBe("thumb");
    expect(container.querySelector(".yohu-recipe-indicator--thumb")).toBeTruthy();
  });

  it("follow 变化仍保持同一滑块节点", () => {
    const [follow, setFollow] = createSignal("a");
    const { container } = render(() => (
      <div class="track">
        <YoIndicator follow={follow()} variant="fill" />
        <button type="button" data-selected={follow() === "a" ? "" : undefined}>
          A
        </button>
        <button type="button" data-selected={follow() === "b" ? "" : undefined}>
          B
        </button>
      </div>
    ));
    const first = container.querySelector(".yohu-recipe-indicator");
    setFollow("b");
    expect(container.querySelector(".yohu-recipe-indicator")).toBe(first);
  });

  it("thumb 滑块自己吃宿主漆色，不点分段项 class", () => {
    const css = loadMotionLayerCss("engines/indicator/indicator.css");
    expect(css).toMatch(
      /\.yohu-recipe-indicator--thumb\s*\{[^}]*background:\s*var\(--yohu-indicator-thumb-fill/,
    );
    expect(css).toContain('[data-indicator-variant="thumb"]:has([data-selected]:hover:not(:disabled))');
    expect(css).not.toContain(".yohu-segmented");
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

  it("fill 只发布选中片透明与字色过渡，不改交互态伪元素", () => {
    const css = loadMotionLayerCss("engines/indicator/indicator.css");
    expect(css).toContain("--yohu-interactive-selected-opacity: 0");
    expect(css).toContain("--yohu-interactive-transition: color var(--yohu-motion-effects-fast)");
    expect(css).not.toContain("::before");
    expect(css).not.toContain(".yohu-interactive");
    expect(css).toContain('[data-indicator-variant="fill"]:has([data-selected]:hover:not(:disabled):not([aria-disabled="true"]))');
    expect(css).not.toContain(".yohu-list-item");
    expect(css).not.toContain(".yohu-badge");
    expect(css).not.toContain(".yohu-tone");
  });
});
