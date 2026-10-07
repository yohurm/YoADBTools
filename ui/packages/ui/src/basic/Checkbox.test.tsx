import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoCheckbox } from "./Checkbox";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Checkbox.css"), "utf-8");

describe("YoCheckbox", () => {
  it("渲染标签与未勾选状态", () => {
    render(() => <YoCheckbox label="包含子进程" checked={false} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText("包含子进程")).toBeTruthy();
    const host = box.closest(".yohu-checkbox");
    expect(host?.getAttribute("data-checked")).toBe("false");
    expect(host?.getAttribute("data-paint")).toBe("idle");
  });

  it("点击触发 onChange（取反）", () => {
    const onChange = vi.fn();
    render(() => <YoCheckbox label="开关" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled 时不可点击", () => {
    const onChange = vi.fn();
    render(() => <YoCheckbox label="禁用" checked={false} disabled onChange={onChange} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.closest(".yohu-checkbox")?.getAttribute("data-disabled")).toBe("");
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("勾选走 data-paint=checked，不用旧 BEM 色 class", () => {
    render(() => <YoCheckbox label="已选" checked />);
    const host = screen.getByRole("checkbox").closest(".yohu-checkbox");
    expect(host?.getAttribute("data-paint")).toBe("checked");
    expect(host?.className).not.toContain("yohu-checkbox--disabled");
    expect(host?.querySelector(".yohu-checkbox__box")?.className).not.toContain(
      "yohu-checkbox__box--checked",
    );
    expect(host?.querySelector(".yohu-checkbox__chrome")).toBeTruthy();
    const slot = host?.querySelector(".yohu-corner__content");
    expect(slot?.getAttribute("data-align")).toBe("center");
    expect(slot?.getAttribute("data-justify")).toBe("center");
    expect(css).not.toContain(".yohu-corner__content");
  });

  it("勾选符常挂：成形走 spatialTick 描边过渡，不靠挂载直切", () => {
    render(() => <YoCheckbox label="描边" checked={false} />);
    const host = screen.getByRole("checkbox").closest(".yohu-checkbox");
    const check = host?.querySelector(".yohu-checkbox__check");
    expect(check).toBeTruthy();
    expect(check?.querySelector("polyline")?.getAttribute("pathLength")).toBe("1");
    expect(check?.querySelector("polyline")?.getAttribute("points")).toBe("4 12 9 17 20 6");
    expect(css).toContain("stroke-dashoffset var(--yohu-motion-spatial-tick)");
    expect(css).toContain('.yohu-checkbox[data-checked="true"]');
  });

  it("种类图标在盒与标签之间", () => {
    render(() => <YoCheckbox label="命令" icon="terminal" checked />);
    const host = screen.getByRole("checkbox").closest(".yohu-checkbox");
    const box = host?.querySelector(".yohu-checkbox__box");
    const mark = host?.querySelector(".yohu-checkbox__mark");
    const label = host?.querySelector(".yohu-checkbox__label");
    expect(mark?.querySelector("[data-icon='terminal']")).toBeTruthy();
    expect(box && mark && (box.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(mark && label && (mark.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  });

  it("分组墨水走 data-tone=section", () => {
    render(() => <YoCheckbox label="组" tone="section" checked />);
    const host = screen.getByRole("checkbox").closest(".yohu-checkbox");
    expect(host?.getAttribute("data-tone")).toBe("section");
    expect(css).toContain('.yohu-checkbox[data-tone="section"] .yohu-checkbox__label');
  });
});

function checkboxSource(): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Checkbox.tsx"), "utf8");
}

describe("复选框涂装", () => {
  it("标签和盒都读同一涂装", () => {
    const src = checkboxSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('host()["' + 'data-paint"]')).toBe(1);
    expect(times("function checkboxPaint")).toBe(1);
    expect(times("export function checkboxPaint")).toBe(0);
    expect(times("checkboxPaint()")).toBe(3);
    expect(times("data-paint={checkboxPaint()}")).toBe(2);
  });
});

describe("复选框禁用", () => {
  it("提交和输入都问同一把禁用", () => {
    const src = checkboxSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("host()." + "disabled")).toBe(1);
    expect(times("function checkboxDisabled")).toBe(1);
    expect(times("export function checkboxDisabled")).toBe(0);
    expect(times("checkboxDisabled()")).toBe(3);
    expect(times("canCommitCheckboxChange(checkboxDisabled())")).toBe(1);
    expect(times("disabled={checkboxDisabled()}")).toBe(1);
  });
});
