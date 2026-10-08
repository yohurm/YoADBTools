import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoFormRow } from "./FormRow";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "FormRow.css"), "utf8");

describe("YoFormRow", () => {
  it("左侧标题信息、右侧控件为两列兄弟，说明不独占下一行", () => {
    const { container } = render(() => (
      <YoFormRow title="主题" description="跟随系统或手动选择" note={<span>立即生效</span>}>
        <button type="button">浅色</button>
      </YoFormRow>
    ));
    const row = container.querySelector(".yohu-form-row");
    const line = row?.querySelector(":scope > .yohu-form-row__line");
    const info = line?.querySelector(":scope > .yohu-form-row__info");
    const control = line?.querySelector(":scope > .yohu-form-row__control");
    expect(info).toBeTruthy();
    expect(control).toBeTruthy();
    expect(row?.getAttribute("data-has-description")).toBe("");
    expect(row?.getAttribute("data-has-note")).toBe("");
    const heading = info?.querySelector(".yohu-form-row__heading");
    expect(heading?.querySelector(".yohu-form-row__title")?.textContent).toBe("主题");
    expect(heading?.querySelector(".yohu-form-row__note")?.textContent).toBe("立即生效");
    expect(info?.querySelector(".yohu-form-row__description")?.textContent).toBe(
      "跟随系统或手动选择",
    );
    expect(control?.querySelector("button")?.textContent).toBe("浅色");
    expect(heading?.nextElementSibling?.classList.contains("yohu-form-row__description")).toBe(
      true,
    );
    expect(row?.querySelector(":scope > .yohu-form-row__description")).toBeNull();
  });

  it("无副标题、无备注时不渲染空槽", () => {
    const { container } = render(() => <YoFormRow title="版本">0.1.0</YoFormRow>);
    expect(screen.getByText("版本")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(container.querySelector(".yohu-form-row")?.getAttribute("data-has-description")).toBeNull();
    expect(container.querySelector(".yohu-form-row")?.getAttribute("data-has-note")).toBeNull();
    expect(container.querySelector(".yohu-form-row__description")).toBeNull();
    expect(container.querySelector(".yohu-form-row__note")).toBeNull();
  });

  it("行主轴贴尾，控件槽 margin-inline-start:auto，折行后仍靠右", () => {
    expect(css).toMatch(/\.yohu-form-row__line \{[\s\S]*?justify-content: flex-end/);
    expect(css).toMatch(/\.yohu-form-row \{[\s\S]*?min-width:\s*0/);
    expect(css).not.toMatch(/\.yohu-form-row \{[^}]*overflow:\s*hidden/);
    expect(css).toContain("margin-inline-start: auto");
    expect(css).not.toContain("justify-content: space-between");
  });

  it("右槽 hug 贴尾不收缩，不 stretch；路径与按钮同簇", () => {
    expect(css).toMatch(/\.yohu-form-row__control\s*\{[^}]*flex:\s*0 0 auto/);
    expect(css).not.toContain("data-control-fill");
    expect(css).not.toMatch(/\.yohu-form-row__control[\s\S]*?flex:\s*1 1 auto/);
    expect(css).not.toMatch(/\.yohu-form-row__control\s*\{[^}]*flex:\s*0 1 auto/);
  });

  it("stacked 纵排铺满，不靠页面点内部槽", () => {
    const { container } = render(() => (
      <YoFormRow title="长边" layout="stacked">
        <span>1080</span>
      </YoFormRow>
    ));
    expect(container.querySelector(".yohu-form-row")?.getAttribute("data-layout")).toBe("stacked");
    expect(css).toMatch(/\[data-layout="stacked"\] \.yohu-form-row__line\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\[data-layout="stacked"\] \.yohu-form-row__control\s*\{[^}]*width:\s*100%/);
  });

  it("flush 去掉行垫，stacked 控件仍铺满", () => {
    const { container } = render(() => (
      <YoFormRow title="设备" layout="stacked" pad="flush">
        <span>select</span>
      </YoFormRow>
    ));
    expect(container.querySelector(".yohu-form-row")?.getAttribute("data-pad")).toBe("flush");
    expect(css).toMatch(/\[data-pad="flush"\]\s*\{[^}]*padding:\s*0/);
  });

  it("子项缩进在主行内，关掉时仍挂着，不另起主行", () => {
    const { container } = render(() => (
      <YoFormRow title="命令库默认展开" subTitle="指定命令组" subOpen={false} sub={<span>设备信息</span>}>
        <button type="button">全部折叠</button>
      </YoFormRow>
    ));
    const row = container.querySelector(".yohu-form-row");
    expect(row?.getAttribute("data-has-sub")).toBe("");
    const sub = row?.querySelector(":scope > .yohu-form-row__sub-slot");
    const title = sub?.querySelector(".yohu-form-row__sub-title");
    expect(title?.textContent).toBe("指定命令组");
    const arc = title?.querySelector(".yohu-form-row__sub-arc path");
    expect(arc?.getAttribute("d")).toBe("M2 2 A12 12 0 0 0 14 14");
    expect(title?.querySelector("[data-icon='chevron-down']")).toBeNull();
    expect(css).toMatch(/\.yohu-form-row__sub-arc path\s*\{[^}]*stroke-linecap:\s*round/);
    expect(css).not.toContain("tree-chevron");
    expect(css).toMatch(/\.yohu-form-row__sub-title\s*\{[^}]*font-size:\s*var\(--yohu-font-body\)/);
    expect(css).toMatch(/\.yohu-form-row__sub-title\s*\{[^}]*color:\s*var\(--yohu-fg-2\)/);
    expect(css).toMatch(/\.yohu-form-row__sub-arc\s*\{[^}]*color:\s*var\(--yohu-fg-3\)/);
    expect(sub?.querySelector(".yohu-collapse")?.getAttribute("data-open")).toBe("false");
    expect(sub?.textContent).toContain("设备信息");
    expect(row?.querySelectorAll(".yohu-form-row__title").length).toBe(1);
    expect(css).toMatch(/\.yohu-form-row__sub\s*\{[^}]*padding-inline-start:\s*var\(--yohu-space-lg\)/);
    expect(css).toMatch(/\.yohu-form-row__sub-slot\s*\{[^}]*min-height:\s*0/);
  });

  it("相邻行不画分割线", () => {
    expect(css).not.toContain(".yohu-form-row + .yohu-form-row");
    expect(css).not.toMatch(/border-top:\s*var\(--yohu-stroke-hairline\)/);
  });
});
