import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render } from "@solidjs/testing-library";
import { YoColHeader } from "./ColHeader";

function loadColHeaderCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/components/ColHeader.css"),
    resolve(process.cwd(), "packages/ui/src/components/ColHeader.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const colHeaderCss = loadColHeaderCss();

describe("YoColHeader", () => {
  it("轨道承担 columnheader，内容区与拖拽条是兄弟", () => {
    const onResize = vi.fn();
    const { container } = render(() => (
      <YoColHeader
        ariaSort="ascending"
        resizable
        resizeLabel="调节名称列宽"
        width={240}
        minWidth={140}
        onWidthChange={onResize}
      >
        名称
      </YoColHeader>
    ));
    const track = container.querySelector(".yohu-col-header");
    const content = container.querySelector(".yohu-col-header__content");
    const resizer = container.querySelector(".yohu-col-resizer");
    expect(track?.getAttribute("role")).toBe("columnheader");
    expect(track?.getAttribute("aria-sort")).toBe("ascending");
    expect(content?.textContent).toBe("名称");
    expect(resizer?.getAttribute("aria-label")).toBe("调节名称列宽");
    expect(content?.nextElementSibling).toBe(resizer);
  });

  it("不可拖拽时不渲染拖拽条", () => {
    const { container } = render(() => (
      <YoColHeader ariaSort="none">日期</YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-resizer")).toBeNull();
    expect(container.querySelector(".yohu-col-header")?.getAttribute("aria-sort")).toBe("none");
  });

  it("center 对齐写 data-align", () => {
    const { container } = render(() => (
      <YoColHeader align="center">级别</YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-header")?.getAttribute("data-align")).toBe("center");
  });

  it("end 对齐写 data-align", () => {
    const { container } = render(() => (
      <YoColHeader align="end">大小</YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-header")?.getAttribute("data-align")).toBe("end");
  });

  it("默认靠左，未传 align 也写 data-align=start", () => {
    const { container } = render(() => (
      <YoColHeader>级别</YoColHeader>
    ));
    expect(container.querySelector(".yohu-col-header")?.getAttribute("data-align")).toBe("start");
  });

  it("悬浮片铺满交互宿主，文案边距只写在内容槽", () => {
    expect(colHeaderCss).toContain("--yohu-col-header-overlay-inset: 0");
    expect(colHeaderCss).toContain("--yohu-col-header-overlay-radius: var(--yohu-radius-none)");
    expect(colHeaderCss).toContain("--yohu-col-header-content-pad:");
    expect(colHeaderCss).toContain("--yohu-ripple-inset: var(--yohu-col-header-overlay-inset)");
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header__content\s*>\s*\.yohu-interactive,\s*\.yohu-col-header__content\s*>\s*\.yohu-tooltip__anchor\s*>\s*\.yohu-interactive\s*\{[^}]*padding:\s*0/,
    );
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header__label\s*\{[^}]*padding:\s*var\(--yohu-col-header-content-pad\)/,
    );
    expect(colHeaderCss).not.toMatch(
      /\.yohu-col-header__content\s*>\s*\.yohu-interactive[^{]*\{[^}]*padding:\s*var\(--yohu-col-header-content-pad\)/,
    );
  });

  it("标题默认靠左，列内边距左 md 右 sm，不画列分割线", () => {
    expect(colHeaderCss).toContain(
      "--yohu-col-header-content-pad: var(--yohu-col-cell-pad, 0 var(--yohu-space-sm) 0 var(--yohu-space-md))",
    );
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header__label\s*\{[^}]*justify-content:\s*flex-start/,
    );
    expect(colHeaderCss).not.toContain(".yohu-col-header:not(:last-child)::after");
    expect(colHeaderCss).not.toContain(":has(.yohu-col-resizer)");
  });

  it("排序字色走宿主 aria-sort，文案槽消费 token", () => {
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header\[aria-sort="ascending"\]\s*\.yohu-col-header__label/,
    );
    expect(colHeaderCss).toMatch(
      /\.yohu-col-header\[aria-sort="descending"\]\s*\.yohu-col-header__label/,
    );
    expect(colHeaderCss).toContain("color: var(--yohu-fg)");
    expect(colHeaderCss).toContain("font-weight: var(--yohu-font-weight-semibold)");
  });

  it("无 onSort 时库仍包文案槽，标题有垫与对齐", () => {
    const { container } = render(() => <YoColHeader align="end">级别</YoColHeader>);
    const label = container.querySelector(".yohu-col-header__label");
    const title = container.querySelector(".yohu-col-header__title");
    expect(label).not.toBeNull();
    expect(title?.textContent).toBe("级别");
    expect(container.querySelector(".yohu-interactive")).toBeNull();
    expect(container.querySelector(".yohu-col-header__sort-icon")).toBeNull();
    expect(container.querySelector(".yohu-col-header")?.getAttribute("data-align")).toBe("end");
  });

  it("有 onSort 时库内渲染 interactive、文案槽与 chevron", () => {
    const onSort = vi.fn();
    const { container } = render(() => (
      <YoColHeader ariaSort="ascending" onSort={onSort} tooltip="按名称排序">
        名称
      </YoColHeader>
    ));
    const button = container.querySelector(".yohu-col-header__content .yohu-interactive");
    expect(button?.tagName).toBe("BUTTON");
    expect(container.querySelector(".yohu-col-header__label")).not.toBeNull();
    expect(container.querySelector(".yohu-col-header__title")?.textContent).toBe("名称");
    expect(container.querySelector("[data-icon='chevron-up']")).not.toBeNull();
    expect(container.querySelector(".yohu-tooltip__anchor")).not.toBeNull();
    fireEvent.click(button!);
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it("降序显示 chevron-down，未排序不占图标位", () => {
    const { container, unmount } = render(() => (
      <YoColHeader ariaSort="descending" onSort={() => undefined}>
        大小
      </YoColHeader>
    ));
    expect(container.querySelector("[data-icon='chevron-down']")).not.toBeNull();
    unmount();
    const idle = render(() => (
      <YoColHeader ariaSort="none" onSort={() => undefined}>
        大小
      </YoColHeader>
    ));
    expect(idle.container.querySelector(".yohu-col-header__sort-icon")).toBeNull();
    expect(idle.container.querySelector(".yohu-interactive")).not.toBeNull();
  });

  it("包入口不导出 ColResizePhase / col-resize", () => {
    const candidates = [
      resolve(process.cwd(), "src/index.ts"),
      resolve(process.cwd(), "packages/ui/src/index.ts"),
    ];
    let index = "";
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        index = readFileSync(candidate, "utf-8");
        break;
      }
    }
    expect(index).not.toContain("ColResizePhase");
    expect(index).not.toMatch(/from ["']\.\/components\/col-resize["']/);
  });
});
