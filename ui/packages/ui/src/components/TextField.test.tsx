import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoTextField } from "./TextField";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "TextField.css"), "utf8");

describe("YoTextField", () => {
  it("渲染标签与输入框", () => {
    render(() => <YoTextField label="名称" placeholder="请输入" />);
    const input = screen.getByLabelText("名称") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("placeholder")).toBe("请输入");
    expect(input.closest(".yohu-text-field")?.getAttribute("data-paint")).toBe("neutral");
  });

  it("change 事件也触发 onInput（UIA SetValue）", () => {
    const onInput = vi.fn();
    render(() => <YoTextField label="关键字" value="" onInput={onInput} />);
    fireEvent.change(screen.getByLabelText("关键字"), { target: { value: "uia" } });
    expect(onInput).toHaveBeenCalledWith("uia", expect.anything());
  });

  it("clearable 且有值时显示清除按钮，点击清空", () => {
    const onInput = vi.fn();
    const [value, setValue] = createSignal("abc");
    render(() => (
      <YoTextField
        label="搜索"
        value={value()}
        clearable
        onInput={(v, e) => {
          setValue(v);
          onInput(v, e);
        }}
      />
    ));
    const clear = screen.getByRole("button", { name: "清除" });
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(onInput).toHaveBeenCalledWith("", expect.anything());
  });

  it("disabled 时禁用输入框且不显示清除", () => {
    render(() => <YoTextField label="只读" value="x" disabled clearable />);
    const host = screen.getByLabelText("只读").closest(".yohu-text-field");
    expect((screen.getByLabelText("只读") as HTMLInputElement).disabled).toBe(true);
    expect(host?.getAttribute("data-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("无 label 时使用 ariaLabel 作为无障碍名称", () => {
    render(() => <YoTextField ariaLabel="新目录名" placeholder="新目录名" />);
    expect(screen.getByLabelText("新目录名")).toBeTruthy();
  });

  it("盒内 prefix 图标名渲染到 control 内", () => {
    const { container } = render(() => <YoTextField label="检索" prefix="search" />);
    const host = container.querySelector(".yohu-text-field");
    expect(host?.getAttribute("data-prefix")).toBe("true");
    expect(host?.querySelector(".yohu-text-field__control [data-icon='search']")).toBeTruthy();
    expect(host?.querySelector(".yohu-text-field__addon")).toBeNull();
  });

  it("盒内 suffix 节点落在 input 之后、盒外", () => {
    const { container } = render(() => (
      <YoTextField label="单位" suffix={<span data-testid="unit">vp</span>} />
    ));
    const control = container.querySelector(".yohu-text-field__control");
    const input = control?.querySelector(".yohu-text-field__input");
    const affix = control?.querySelector(".yohu-text-field__affix[data-edge='end']");
    expect(affix?.contains(screen.getByTestId("unit"))).toBe(true);
    expect(input?.nextElementSibling).toBe(affix);
  });

  it("盒外 addon 在 control 两侧，不进内容区", () => {
    const { container } = render(() => (
      <YoTextField label="地址" addonBefore="https://" addonAfter=".apk" />
    ));
    const host = container.querySelector(".yohu-text-field");
    expect(host?.getAttribute("data-addon-before")).toBe("true");
    expect(host?.getAttribute("data-addon-after")).toBe("true");
    const group = host?.querySelector(".yohu-text-field__group");
    const before = group?.querySelector("[data-edge='before']");
    const after = group?.querySelector("[data-edge='after']");
    const control = group?.querySelector(".yohu-text-field__control");
    expect(before?.textContent).toBe("https://");
    expect(after?.textContent).toBe(".apk");
    expect(control?.contains(before as Node)).toBe(false);
    expect(control?.contains(after as Node)).toBe(false);
  });

  it("status=error 写 data-paint 与 aria-invalid，不用旧 BEM 色 class", () => {
    render(() => <YoTextField label="路径" status="error" />);
    const input = screen.getByLabelText("路径");
    const host = input.closest(".yohu-text-field");
    expect(host?.getAttribute("data-status")).toBe("error");
    expect(host?.getAttribute("data-paint")).toBe("error");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(host?.className).not.toContain("yohu-text-field--error");
  });

  it("status=warning 不报 aria-invalid", () => {
    render(() => <YoTextField label="容量" status="warning" />);
    const input = screen.getByLabelText("容量");
    expect(input.closest(".yohu-text-field")?.getAttribute("data-paint")).toBe("warning");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("写入盒锁行高，不用 leading-ui，也不沿栏高 100%", () => {
    expect(css).toContain("--yohu-text-field-line:");
    expect(css).toContain("calc(var(--yohu-control-height) - 2 * var(--yohu-stroke-hairline))");
    const inputBlock = css.slice(css.indexOf(".yohu-text-field__input {"));
    const inputRule = inputBlock.slice(0, inputBlock.indexOf("}") + 1);
    expect(inputRule).toContain("height: var(--yohu-text-field-line)");
    expect(inputRule).toContain("line-height: var(--yohu-text-field-line)");
    expect(inputRule).not.toContain("height: 100%");
    expect(inputRule).not.toContain("--yohu-font-leading-ui");
    const areaRule = css.slice(css.indexOf("textarea.yohu-text-field__input"));
    expect(areaRule).toContain("line-height: var(--yohu-font-leading-ui)");
    expect(areaRule).toContain("padding-block:");
  });

  it("内容区重置 UA 盒模型，数字去掉原生步进", () => {
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?box-sizing: border-box/);
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?padding: 0/);
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?appearance: none/);
    expect(css).toContain('appearance: textfield');
    expect(css).toContain("text-align: end");
    expect(css).toContain("::-webkit-inner-spin-button");
    expect(css).toContain('[data-width="number"]');
    expect(css).toContain('[data-width="fill"]');
    expect(css).not.toContain("[data-block]");
    render(() => <YoTextField ariaLabel="缓冲最大行数" type="number" value="10000" />);
    const input = screen.getByLabelText("缓冲最大行数") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.size).toBe(1);
    expect(input.closest(".yohu-text-field")?.getAttribute("data-width")).toBe("number");
  });

  it("inputRef 转发内部 input，不挖宿主 DOM", () => {
    let forwarded: HTMLInputElement | undefined;
    render(() => (
      <YoTextField
        ariaLabel="关键字"
        inputRef={(el) => {
          forwarded = el;
        }}
      />
    ));
    const input = screen.getByLabelText("关键字") as HTMLInputElement;
    expect(forwarded).toBe(input);
    expect(input.tagName).toBe("INPUT");
  });

  it("block 铺满父级宽，压过 number 宽，不沿栏高 stretch", () => {
    render(() => <YoTextField block type="number" ariaLabel="全宽数字" />);
    const host = screen.getByLabelText("全宽数字").closest(".yohu-text-field");
    expect(host?.getAttribute("data-width")).toBe("fill");
    expect(host?.hasAttribute("data-block")).toBe(false);
    const fill = css.slice(css.indexOf('[data-width="fill"]'));
    const rule = fill.slice(0, fill.indexOf("}") + 1);
    expect(rule).toContain("width: 100%");
    expect(rule).toContain("flex: 0 1 auto");
    expect(rule).not.toContain("flex: 1");
  });

  it("active 写 data-active，描边走 accent；默认不加", () => {
    const { container, unmount } = render(() => <YoTextField ariaLabel="关键字" active />);
    const host = container.querySelector(".yohu-text-field");
    expect(host?.getAttribute("data-active")).toBe("true");
    expect(host?.getAttribute("data-paint")).toBe("neutral");
    expect(css).toMatch(
      /\.yohu-text-field\[data-active\]\s*\{[^}]*--yohu-text-field-edge:\s*var\(--yohu-accent\)/,
    );
    unmount();
    const idle = render(() => <YoTextField ariaLabel="Tag" />);
    expect(idle.container.querySelector(".yohu-text-field")?.hasAttribute("data-active")).toBe(false);
  });
});
