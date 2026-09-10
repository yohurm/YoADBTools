import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoPanel } from "./Panel";

describe("YoPanel", () => {
  it("渲染标题与内容，默认 md 内边距", () => {
    const { container } = render(() => <YoPanel title="面板标题">内容</YoPanel>);
    const panel = container.querySelector(".yohu-panel");
    expect(screen.getByText("面板标题")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
    expect(panel?.getAttribute("data-variant")).toBe("card");
    expect(panel?.getAttribute("data-padding")).toBe("md");
    expect(panel?.getAttribute("data-header")).toBe("card-title");
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
    expect(container.querySelector(".yohu-panel--pane")).toBeNull();
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
});
