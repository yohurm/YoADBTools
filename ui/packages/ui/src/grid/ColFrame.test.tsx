import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { YoColCell } from "./ColCell";
import { YoColFrame } from "./ColFrame";
import { YoColRow } from "./ColRow";
import { YoColTrack } from "./ColTrack";

describe("YoColFrame", () => {
  it("只写一次轨道与列垫，表头和行都不内联 template", () => {
    const { container } = render(() => (
      <YoColFrame template="80px minmax(96px, 1fr)">
        <YoColRow>
          <span>时间</span>
        </YoColRow>
        <YoColTrack>
          <YoColCell>09-10</YoColCell>
        </YoColTrack>
      </YoColFrame>
    ));
    const frame = container.querySelector(".yohu-col-frame") as HTMLElement;
    expect(frame.style.getPropertyValue("--yohu-col-tracks")).toBe("80px minmax(96px, 1fr)");
    expect(container.querySelector(".yohu-col-row")?.getAttribute("style") ?? "").not.toContain(
      "grid-template-columns",
    );
    expect(container.querySelector(".yohu-col-track")?.getAttribute("style") ?? "").not.toContain(
      "grid-template-columns",
    );
    expect(container.querySelector(".yohu-col-cell")).not.toBeNull();
    expect(frame.getAttribute("data-cell-pad")).toBe("list");
    expect(frame.getAttribute("data-tone")).toBe("list");
  });

  it("文档列表 cellPad=none 关掉列垫", () => {
    const { container } = render(() => (
      <YoColFrame template="20ch minmax(12ch, 1fr)" cellPad="none">
        <YoColRow>
          <span>时间</span>
        </YoColRow>
      </YoColFrame>
    ));
    const frame = container.querySelector(".yohu-col-frame") as HTMLElement;
    expect(frame.getAttribute("data-cell-pad")).toBe("none");
    expect(frame.style.getPropertyValue("--yohu-col-tracks")).toBe("20ch minmax(12ch, 1fr)");
  });

  it("文档表头 tone=document 写等宽尺", () => {
    const { container } = render(() => (
      <YoColFrame template="192px max-content" cellPad="none" tone="document">
        <YoColRow>
          <span>时间</span>
        </YoColRow>
      </YoColFrame>
    ));
    const frame = container.querySelector(".yohu-col-frame") as HTMLElement;
    expect(frame.getAttribute("data-tone")).toBe("document");
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ColFrame.css"), "utf-8");
    expect(css).toMatch(/\[data-tone="document"\]\s*\{[^}]*--yohu-font-mono/);
    expect(css).toMatch(/\[data-tone="document"\]\s*\{[^}]*--yohu-col-row-min:\s*max-content/);
    expect(css).not.toContain(".yohu-col-row");
  });
});

describe("YoColFrame 侧轨", () => {
  it("清单溢出让出侧轨时表头跟 gutter 对齐，不写 scrollbar-gutter", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ColFrame.css"), "utf-8");
    expect(css).toContain(':has([data-gutter="on"])');
    expect(css).not.toContain(".yohu-scroller");
    expect(css).not.toContain(".yohu-col-row");
    expect(css).toContain("--yohu-col-gutter-pad: var(--yohu-space-lg)");
    expect(css).toContain("--yohu-col-head-gutter: var(--yohu-col-gutter-pad)");
    expect(css).toContain("--yohu-col-cell-pad: 0 var(--yohu-space-sm) 0 var(--yohu-space-md)");
    const gutterOwner = css.replace("--yohu-col-gutter-pad: var(--yohu-space-lg)", "");
    expect(gutterOwner).not.toContain("var(--yohu-space-lg)");
    expect(css).not.toContain(".yohu-col-head");
    expect(css).not.toContain("padding-inline-end: var(--yohu-col-head-gutter");
    const head = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ColHead.css"), "utf-8");
    expect(head).not.toContain("var(--yohu-space-lg)");
    expect(head).toContain("padding-inline-end: var(--yohu-col-head-gutter, 0)");
    expect(head).toContain("--yohu-col-gutter-pad: 0");
    expect(css).not.toContain("> *");
    expect(css).not.toMatch(/scrollbar-gutter\s*:/);
  });

  it("单元格只吃列架发布的列垫，不读表头变量", () => {
    const cell = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ColCell.css"), "utf-8");
    expect(cell).toContain("padding: var(--yohu-col-cell-pad)");
    expect(cell).not.toContain("yohu-col-header");
  });
});
