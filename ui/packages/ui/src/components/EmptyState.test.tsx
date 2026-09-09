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

  it("可选图标", () => {
    const { container } = render(() => <YoEmptyState icon="log" title="空" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("挤位跟随布局，自身不写 transition", () => {
    const css = loadEmptyCss();
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toMatch(/\.yohu-empty-state[^{]*\{[^}]*transition/);
  });
});
