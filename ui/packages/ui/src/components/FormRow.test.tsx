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
    const info = row?.querySelector(":scope > .yohu-form-row__info");
    const control = row?.querySelector(":scope > .yohu-form-row__control");
    expect(info).toBeTruthy();
    expect(control).toBeTruthy();
    expect(row?.getAttribute("data-has-description")).toBe("true");
    expect(row?.getAttribute("data-has-note")).toBe("true");
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
    expect(css).toMatch(/\.yohu-form-row \{[\s\S]*?justify-content: flex-end/);
    expect(css).toContain("margin-inline-start: auto");
    expect(css).not.toContain("justify-content: space-between");
  });

  it("右槽 hug 贴尾，不 stretch；路径与按钮同簇", () => {
    expect(css).toContain("flex: 0 1 auto");
    expect(css).not.toContain("data-control-fill");
    expect(css).not.toMatch(/\.yohu-form-row__control[\s\S]*?flex:\s*1 1 auto/);
  });
});
