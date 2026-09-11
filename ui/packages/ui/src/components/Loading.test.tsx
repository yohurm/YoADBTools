import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoLoading } from "./Loading";

function loadLoadingCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/Loading.css"),
    resolve(process.cwd(), "packages/ui/src/components/Loading.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoLoading", () => {
  it("渲染标题与描述，并暴露 status 语义", () => {
    render(() => <YoLoading title="启动中" description="正在建立隧道" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("启动中")).toBeTruthy();
    expect(screen.getByText("正在建立隧道")).toBeTruthy();
    expect(status.querySelector(".yohu-loading__spinner")).toBeTruthy();
  });

  it("可选描述；cover 铺满父级", () => {
    const { container } = render(() => <YoLoading title="加载中" cover />);
    expect(screen.getByText("加载中")).toBeTruthy();
    expect(container.querySelector(".yohu-loading")?.getAttribute("data-cover")).toBe("true");
    expect(container.querySelector(".yohu-loading")?.getAttribute("data-fill")).toBeNull();
    expect(container.querySelector(".yohu-loading--cover")).toBeNull();
    expect(container.querySelector(".yohu-loading__description")).toBeNull();
  });

  it("fill 写 data-fill，不写 data-cover", () => {
    const { container } = render(() => <YoLoading title="加载中" fill />);
    expect(container.querySelector(".yohu-loading")?.getAttribute("data-fill")).toBe("true");
    expect(container.querySelector(".yohu-loading")?.getAttribute("data-cover")).toBeNull();
  });

  it("cover 盖住下层；fill 参与父级伸缩", () => {
    const css = loadLoadingCss();
    const cover = css.match(/\.yohu-loading\[data-cover\]\s*\{[^}]*\}/)?.[0] ?? "";
    const fill = css.match(/\.yohu-loading\[data-fill\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cover).toContain("position: absolute");
    expect(cover).toContain("inset: 0");
    expect(fill).toContain("flex: 1");
    expect(fill).toContain("min-height: 0");
    expect(fill).toContain("height: 100%");
    expect(fill).not.toContain("position: absolute");
  });
});
