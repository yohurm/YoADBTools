import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoPanel } from "./Panel";

const panelCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Panel.css"), "utf-8");

describe("YoPanel", () => {
  it("渲染标题与内容，默认 md 内边距", () => {
    const { container } = render(() => <YoPanel title="面板标题">内容</YoPanel>);
    const panel = container.querySelector(".yohu-panel");
    expect(screen.getByText("面板标题")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
    expect(panel?.getAttribute("data-variant")).toBe("card");
    expect(panel?.getAttribute("data-padding")).toBe("md");
    expect(panel?.getAttribute("data-header")).toBe("card-title");
    expect(panel?.getAttribute("data-align")).toBe("stretch");
    expect(panel?.getAttribute("data-gap")).toBe("none");
    expect(panel?.getAttribute("data-overflow")).toBe("visible");
    expect(panel?.hasAttribute("data-overflow-x")).toBe(false);
    expect(panel?.hasAttribute("data-padding-block")).toBe(false);
    expect(container.querySelector(".yohu-panel")?.getAttribute("data-padding")).toBe("md");
    expect(container.querySelector(".yohu-panel")?.getAttribute("data-variant")).toBe("card");
  });

  it("支持自定义 padding", () => {
    const { container } = render(() => <YoPanel padding="lg">内容</YoPanel>);
    expect(container.querySelector(".yohu-panel")?.getAttribute("data-padding")).toBe("lg");
  });

  it("pane 变体撑满分区，默认 none 内边距", () => {
    const { container } = render(() => <YoPanel variant="pane">分栏</YoPanel>);
    const panel = container.querySelector(".yohu-panel");
    expect(panel?.getAttribute("data-variant")).toBe("pane");
    expect(panel?.getAttribute("data-padding")).toBe("none");
    expect(panel?.getAttribute("data-header")).toBe("none");
    expect(panel?.getAttribute("data-align")).toBe("stretch");
    expect(panel?.getAttribute("data-gap")).toBe("none");
    expect(panel?.getAttribute("data-overflow")).toBe("auto");
    expect(container.querySelector(".yohu-panel--pane")).toBeNull();
  });

  it("内容区布局走公开 data-*", () => {
    const { container } = render(() => (
      <YoPanel variant="pane" align="center" gap="2xs" paddingBlock="xs" overflowX="hidden">
        钮
      </YoPanel>
    ));
    const panel = container.querySelector(".yohu-panel");
    expect(panel?.getAttribute("data-align")).toBe("center");
    expect(panel?.getAttribute("data-gap")).toBe("2xs");
    expect(panel?.getAttribute("data-padding-block")).toBe("xs");
    expect(panel?.getAttribute("data-overflow")).toBe("auto");
    expect(panel?.getAttribute("data-overflow-x")).toBe("hidden");
  });

  it("overflow hidden 两轴裁切，不写 overflow-x", () => {
    const { container } = render(() => (
      <YoPanel variant="pane" overflow="hidden">
        区
      </YoPanel>
    ));
    const panel = container.querySelector(".yohu-panel");
    expect(panel?.getAttribute("data-overflow")).toBe("hidden");
    expect(panel?.hasAttribute("data-overflow-x")).toBe(false);
  });

  it("pane 支持 title 与 actions", () => {
    render(() => (
      <YoPanel variant="pane" title="执行结果" actions={<button type="button">清屏</button>}>
        列表
      </YoPanel>
    ));
    expect(screen.getByText("执行结果")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清屏" })).toBeTruthy();
    expect(document.querySelector(".yohu-panel__heading")?.textContent).toBe("执行结果");
  });

  it("自定义 header 替代 title", () => {
    const { container } = render(() => (
      <YoPanel variant="pane" title="忽略" header={<div>路径</div>}>
        内容
      </YoPanel>
    ));
    expect(screen.getByText("路径")).toBeTruthy();
    expect(container.querySelector(".yohu-panel")?.getAttribute("data-header")).toBe("custom");
    expect(container.querySelector(".yohu-panel__heading")).toBeNull();
  });

  it("内容区铬走 data-*，pane 不再写死 overflow", () => {
    expect(panelCss).toContain('[data-overflow="auto"] .yohu-panel__body');
    expect(panelCss).toContain('[data-overflow="hidden"] .yohu-panel__body');
    expect(panelCss).toContain('[data-align="center"] .yohu-panel__body');
    expect(panelCss).toContain('[data-gap="2xs"] .yohu-panel__body');
    expect(panelCss).toContain('[data-gap="lg"] .yohu-panel__body');
    expect(panelCss).toContain('[data-padding-block="xs"] .yohu-panel__body');
    expect(panelCss).toContain('[data-overflow-x="hidden"] .yohu-panel__body');
    expect(panelCss).not.toMatch(
      /\[data-variant="pane"\]\s+\.yohu-panel__body\s*\{[^}]*overflow:\s*auto/,
    );
  });
});
