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
    expect(box.closest(".yohu-checkbox")?.getAttribute("data-disabled")).toBe("true");
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
    expect(css).toContain("stroke-dashoffset var(--yohu-motion-spatial-tick)");
    expect(css).toContain('.yohu-checkbox[data-checked="true"]');
  });
});
