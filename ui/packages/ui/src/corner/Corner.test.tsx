import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoCorner } from "./Corner";

const cornerCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Corner.css"), "utf-8");

describe("YoCorner", () => {
  it("host 内容槽写下公开 data，缺省不点消费方 class", () => {
    const { container } = render(() => <YoCorner>正文</YoCorner>);
    const slot = container.querySelector(".yohu-corner__content");
    expect(slot?.getAttribute("data-direction")).toBe("column");
    expect(slot?.getAttribute("data-align")).toBe("stretch");
    expect(slot?.getAttribute("data-justify")).toBe("start");
    expect(slot?.getAttribute("data-overflow")).toBe("visible");
    expect(slot?.getAttribute("data-pad")).toBe("none");
    expect(slot?.getAttribute("data-gap")).toBe("none");
  });

  it("公开 prop 写到 __content", () => {
    const { container } = render(() => (
      <YoCorner direction="row" align="center" justify="center" overflow="auto" pad="inline-sm" gap="sm">
        行
      </YoCorner>
    ));
    const slot = container.querySelector(".yohu-corner__content");
    expect(slot?.getAttribute("data-direction")).toBe("row");
    expect(slot?.getAttribute("data-align")).toBe("center");
    expect(slot?.getAttribute("data-justify")).toBe("center");
    expect(slot?.getAttribute("data-overflow")).toBe("auto");
    expect(slot?.getAttribute("data-pad")).toBe("inline-sm");
    expect(slot?.getAttribute("data-gap")).toBe("sm");
  });

  it("overflow=auto 藏系统条写在本 CSS", () => {
    expect(cornerCss).toMatch(
      /\.yohu-corner__content\[data-overflow="auto"\]\s*\{[\s\S]*?overflow:\s*auto;/,
    );
    expect(cornerCss).toMatch(
      /\.yohu-corner__content\[data-overflow="auto"\]\s*\{[\s\S]*?scrollbar-width:\s*none;/,
    );
    expect(cornerCss).toContain('.yohu-corner__content[data-overflow="auto"]::-webkit-scrollbar');
  });

  it("量盒走布局盒，禁止 getBoundingClientRect 吃 Presence scale", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Corner.tsx"), "utf-8");
    expect(src).toContain("offsetWidth");
    expect(src).toContain("offsetHeight");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
  });

  it("绘制铺满 CSS 盒：单位 viewBox + none，禁止 meet 第二世界", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Corner.tsx"), "utf-8");
    const { container } = render(() => <YoCorner>正文</YoCorner>);
    const svg = container.querySelector(".yohu-corner__paint");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1 1");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(src).toContain("CORNER_PAINT_VIEWBOX");
    expect(src).toContain('preserveAspectRatio="none"');
    expect(src).not.toMatch(/viewBox=\{paint\(\)\.viewBox\}/);
  });

  it("内容槽 border-box，pad 不把 width:100% 加出宿主", () => {
    expect(cornerCss).toMatch(/\.yohu-corner__content\s*\{[^}]*box-sizing:\s*border-box;/);
  });

  it("pad / direction / align / justify / gap 由本 CSS 解释", () => {
    expect(cornerCss).toContain('.yohu-corner__content[data-direction="row"]');
    expect(cornerCss).toContain('.yohu-corner__content[data-align="center"]');
    expect(cornerCss).toContain('.yohu-corner__content[data-justify="center"]');
    expect(cornerCss).toContain('.yohu-corner__content[data-pad="inline-sm"]');
    expect(cornerCss).toContain('.yohu-corner__content[data-pad="block-xs"]');
    expect(cornerCss).toContain('.yohu-corner__content[data-gap="sm"]');
  });
});
