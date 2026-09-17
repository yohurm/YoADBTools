import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoSubheader } from "./Subheader";

function loadCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/list/Subheader.css"),
    resolve(process.cwd(), "packages/ui/src/list/Subheader.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

describe("YoSubheader", () => {
  it("默认列表型子标题", () => {
    const { container } = render(() => <YoSubheader title="模块" />);
    expect(screen.getByText("模块")).toBeTruthy();
    expect(container.querySelector(".yohu-subheader")?.getAttribute("data-tone")).toBe("list");
  });

  it("meta 贴标题，actions 才是行尾", () => {
    const { container } = render(() => (
      <YoSubheader title="设备" meta={<span>2</span>} actions={<span>刷新</span>} />
    ));
    const host = container.querySelector(".yohu-subheader") as HTMLElement;
    expect(host.getAttribute("data-has-meta")).toBe("true");
    const kids = Array.from(host.children);
    expect(kids[0]?.classList.contains("yohu-subheader__title")).toBe(true);
    expect(kids[1]?.classList.contains("yohu-subheader__meta")).toBe(true);
    expect(kids[1]?.textContent).toBe("2");
    expect(kids[2]?.classList.contains("yohu-subheader__actions")).toBe(true);
    expect(screen.getByText("刷新")).toBeTruthy();
    expect(host.hasAttribute("data-has-actions")).toBe(false);
    expect(host.hasAttribute("data-has-leading")).toBe(false);
    expect(host.hasAttribute("data-has-description")).toBe(false);
    expect(host.hasAttribute("data-has-trailing")).toBe(false);
  });

  it("列表型标题走二级字，不是三级点缀", () => {
    const css = loadCss();
    expect(css).toMatch(
      /\.yohu-subheader\[data-tone="list"\] \.yohu-subheader__title\s*\{[^}]*color:\s*var\(--yohu-fg-2\)/,
    );
    expect(css).toMatch(
      /\.yohu-subheader\[data-tone="content"\] \.yohu-subheader__title\s*\{[^}]*color:\s*var\(--yohu-fg\)/,
    );
    expect(css).not.toMatch(
      /\.yohu-subheader\[data-tone="list"\] \.yohu-subheader__title\s*\{[^}]*--yohu-fg-3/,
    );
  });

  it("有 meta 时标题 hug，禁止 flex 1 把邻接槽挤到盒尾", () => {
    const css = loadCss();
    expect(css).toMatch(
      /\.yohu-subheader\[data-has-meta\] \.yohu-subheader__title\s*\{[^}]*flex:\s*0 1 auto/,
    );
    expect(css).toContain("margin-inline-start: auto");
  });
});
