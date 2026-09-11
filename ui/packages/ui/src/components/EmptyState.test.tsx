import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoEmptyState } from "./EmptyState";

function loadEmptyCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/EmptyState.css"),
    resolve(process.cwd(), "packages/ui/src/components/EmptyState.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoEmptyState", () => {
  it("渲染标题与描述", () => {
    render(() => <YoEmptyState title="暂无日志" description="请选择设备开始采集" />);
    expect(screen.getByText("暂无日志")).toBeTruthy();
    expect(screen.getByText("请选择设备开始采集")).toBeTruthy();
  });

  it("可选插画", () => {
    const { container } = render(() => <YoEmptyState icon="log" title="空" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector(".yohu-empty-state")?.getAttribute("data-has-icon")).toBe("true");
    expect(container.querySelector(".yohu-empty-state__illustration")).toBeTruthy();
  });

  it("可选 action 槽，不是 Dialog", () => {
    const { container } = render(() => <YoEmptyState title="空" action={<button type="button">开始采集</button>} />);
    expect(screen.getByRole("button", { name: "开始采集" })).toBeTruthy();
    expect(container.querySelector(".yohu-empty-state")?.getAttribute("data-has-action")).toBe("true");
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(container.querySelector(".yohu-dialog")).toBeNull();
  });

  it("挤位跟随布局，自身不写 transition", () => {
    const css = loadEmptyCss();
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toMatch(/\.yohu-empty-state[^{]*\{[^}]*transition/);
  });

  it("fill 写 data-fill；默认不写", () => {
    const filled = render(() => <YoEmptyState title="空" fill />);
    expect(filled.container.querySelector(".yohu-empty-state")?.getAttribute("data-fill")).toBe("true");
    filled.unmount();
    const { container } = render(() => <YoEmptyState title="空" />);
    expect(container.querySelector(".yohu-empty-state")?.getAttribute("data-fill")).toBeNull();
  });

  it("data-fill 在父级伸缩并居中，不是 cover", () => {
    const css = loadEmptyCss();
    const fill = css.match(/\.yohu-empty-state\[data-fill\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(fill).toContain("flex: 1");
    expect(fill).toContain("min-height: 0");
    expect(fill).toContain("height: 100%");
    expect(css).not.toContain("data-cover");
    expect(css).not.toMatch(/\.yohu-empty-state\[data-fill\][^{]*\{[^}]*position:\s*absolute/);
  });
});
