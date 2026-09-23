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
    expect(input.closest(".yohu-text-field__chrome")).toBeTruthy();
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
    expect(clear.classList.contains("yohu-recipe-clear")).toBe(true);
    fireEvent.click(clear);
    expect(onInput).toHaveBeenCalledWith("", expect.anything());
  });

  it("disabled 时禁用输入框且不显示清除", () => {
    render(() => <YoTextField label="禁用" value="x" disabled clearable />);
    const host = screen.getByLabelText("禁用").closest(".yohu-text-field");
    expect((screen.getByLabelText("禁用") as HTMLInputElement).disabled).toBe(true);
    expect(host?.getAttribute("data-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("readOnly 可点选、不灰、不显示清除", () => {
    render(() => <YoTextField label="路径" value="C:\\adb.exe" readOnly clearable />);
    const input = screen.getByLabelText("路径") as HTMLInputElement;
    const host = input.closest(".yohu-text-field");
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    expect(host?.getAttribute("data-readonly")).toBe("true");
    expect(host?.getAttribute("data-disabled")).toBeNull();
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
    expect(css).not.toContain("textarea.yohu-text-field__input");
    const areaRule = css.slice(css.indexOf("[data-multiline] .yohu-text-field__input"));
    expect(areaRule).toContain("line-height: var(--yohu-font-leading-ui)");
    expect(areaRule).toContain("padding-block:");
    expect(areaRule).toContain("resize: none");
  });

  it("内容区重置 UA 盒模型，数字去掉原生步进、自绘右柱", () => {
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?box-sizing: border-box/);
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?padding: 0/);
    expect(css).toMatch(/\.yohu-text-field__input \{[\s\S]*?appearance: none/);
    expect(css).toContain('appearance: textfield');
    expect(css).toContain("text-align: start");
    expect(css).not.toContain("text-align: end");
    expect(css).toContain("::-webkit-inner-spin-button");
    expect(css).toContain('[data-width="number"]');
    expect(css).toContain('[data-width="fill"]');
    expect(css).toContain('[data-width="control"]');
    expect(css).toContain("--yohu-layout-text-field-stepper");
    expect(css).not.toContain("[data-block]");
    render(() => <YoTextField ariaLabel="缓冲最大行数" type="number" value="10000" />);
    const input = screen.getByLabelText("缓冲最大行数") as HTMLInputElement;
    const host = input.closest(".yohu-text-field");
    expect(input.type).toBe("number");
    expect(input.size).toBe(1);
    expect(host?.getAttribute("data-width")).toBe("number");
    expect(host?.getAttribute("data-stepper")).toBe("true");
    expect(host?.querySelector(".yohu-text-field__stepper")).toBeTruthy();
    expect(screen.getByRole("button", { name: "增加" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "减少" })).toBeTruthy();
  });

  it("数字步进钮增减并夹取", () => {
    const onInput = vi.fn();
    const [value, setValue] = createSignal("0");
    render(() => (
      <YoTextField
        ariaLabel="间隔"
        type="number"
        min={0}
        max={2}
        value={value()}
        onInput={(next) => {
          setValue(next);
          onInput(next);
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "增加" }));
    expect(onInput).toHaveBeenCalledWith("1");
    fireEvent.click(screen.getByRole("button", { name: "增加" }));
    expect(onInput).toHaveBeenCalledWith("2");
    expect((screen.getByRole("button", { name: "增加" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "减少" }));
    expect(onInput).toHaveBeenLastCalledWith("1");
  });

  it("数字步进在禁用或只读时不可点", () => {
    const { unmount } = render(() => (
      <YoTextField ariaLabel="禁用数字" type="number" value="3" disabled />
    ));
    expect((screen.getByRole("button", { name: "增加" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "减少" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(() => <YoTextField ariaLabel="只读数字" type="number" value="3" readOnly />);
    expect((screen.getByRole("button", { name: "增加" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("只读数字").closest(".yohu-text-field")?.getAttribute("data-stepper")).toBe(
      "true",
    );
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

  it("block 铺满父级定宽，压过 number 宽，不沿栏高 stretch", () => {
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

  it("control 定宽路径槽，不吃百分比", () => {
    render(() => <YoTextField width="control" readOnly value="C:\\adb.exe" ariaLabel="ADB 路径" />);
    const host = screen.getByLabelText("ADB 路径").closest(".yohu-text-field");
    expect(host?.getAttribute("data-width")).toBe("control");
    const control = css.slice(css.indexOf('[data-width="control"]'));
    const rule = control.slice(0, control.indexOf("}") + 1);
    expect(rule).toContain("width: var(--yohu-layout-settings-control-max)");
    expect(rule).toContain("flex: 0 0 auto");
    expect(rule).toContain("max-width: 100%");
    expect(rule).not.toMatch(/^\s*width:\s*100%/m);
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

  it("tokens 写 data-tokens；槽无盒，不嵌套滚动口", () => {
    const { container } = render(() => (
      <YoTextField ariaLabel="Tag" tokens={<span data-testid="chip">HfLooper</span>} />
    ));
    const host = container.querySelector(".yohu-text-field");
    const control = host?.querySelector(".yohu-text-field__control");
    const tokens = host?.querySelector(".yohu-text-field__tokens");
    expect(host?.getAttribute("data-tokens")).toBe("true");
    expect(tokens).toBeTruthy();
    expect(control?.contains(screen.getByTestId("chip"))).toBe(true);

    const tokensBlock = css.slice(css.indexOf(".yohu-text-field__tokens {"));
    const tokensRule = tokensBlock.slice(0, tokensBlock.indexOf("}") + 1);
    expect(tokensRule).toContain("display: contents");
    expect(tokensRule).not.toContain("overflow");

    const controlBlock = css.slice(css.indexOf(".yohu-text-field__control {"));
    const controlRule = controlBlock.slice(0, controlBlock.indexOf("}") + 1);
    expect(controlRule).toContain("overflow: visible");
    expect(controlRule).not.toContain("overflow: hidden");
    expect(controlRule).not.toContain("overflow: auto");
    expect(host?.querySelector(".yohu-text-field__chrome")).toBeTruthy();
    expect(css).not.toContain(".yohu-corner__content");
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    const multilineInput = css.slice(css.indexOf(".yohu-text-field[data-multiline] .yohu-text-field__input"));
    expect(multilineInput).toContain("overflow: auto");
    expect(multilineInput).toContain("scrollbar-width: none");
    expect(multilineInput).toContain("::-webkit-scrollbar");

    const tokensMin = css.slice(css.indexOf(".yohu-text-field[data-tokens] .yohu-text-field__input"));
    const tokensMinRule = tokensMin.slice(0, tokensMin.indexOf("}") + 1);
    expect(tokensMinRule).toContain("min-width: calc(var(--yohu-space-xl) * 2)");
    expect(tokensMinRule).not.toContain("width: 100%");

    const inputBlock = css.slice(css.indexOf(".yohu-text-field__input {"));
    const inputRule = inputBlock.slice(0, inputBlock.indexOf("}") + 1);
    expect(inputRule).toContain("flex: 1 1 0%");
    expect(inputRule).toContain("width: auto");
    expect(inputRule).not.toContain("width: 100%");
  });

  it("点写入盒空白聚焦 input，不点按钮", () => {
    const { container } = render(() => <YoTextField ariaLabel="Tag" tokens={<span>HfLooper</span>} />);
    const input = screen.getByLabelText("Tag") as HTMLInputElement;
    const control = container.querySelector(".yohu-text-field__control");
    expect(control).toBeTruthy();
    fireEvent.mouseDown(control as HTMLElement, { button: 0 });
    expect(document.activeElement).toBe(input);
  });

  it("multiline 画 textarea，不走元素选择器后门", () => {
    const onInput = vi.fn();
    let forwarded: HTMLTextAreaElement | undefined;
    render(() => (
      <YoTextField
        ariaLabel="命令"
        multiline
        rows={1}
        value="adb"
        onInput={onInput}
        inputRef={(el) => {
          if (el instanceof HTMLTextAreaElement) forwarded = el;
        }}
      />
    ));
    const area = screen.getByLabelText("命令") as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.rows).toBe(1);
    expect(area.closest(".yohu-text-field")?.getAttribute("data-multiline")).toBe("true");
    expect(forwarded).toBe(area);
    fireEvent.input(area, { target: { value: "shell" } });
    expect(onInput).toHaveBeenCalledWith("shell", expect.anything());
  });

  it("font=mono 只绑 policy 的 data-font", () => {
    const { container, unmount } = render(() => <YoTextField ariaLabel="命令" font="mono" />);
    expect(container.querySelector(".yohu-text-field")?.getAttribute("data-font")).toBe("mono");
    unmount();
    const idle = render(() => <YoTextField ariaLabel="名称" />);
    expect(idle.container.querySelector(".yohu-text-field")?.hasAttribute("data-font")).toBe(false);
  });

  it("写入盒 Corner 走公开 prop；L4 不手写 font、不点 __content", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "TextField.tsx"), "utf8");
    expect(src).toMatch(/overflow="hidden"/);
    expect(src).toMatch(/direction="row"/);
    expect(src).toMatch(/align=\{props\.host\["data-multiline"\] \? undefined : "center"\}/);
    expect(src).toMatch(/pad="inline-sm"/);
    expect(src).toMatch(/gap="xs"/);
    expect(src).toMatch(/host\(\)\["data-font"\]/);
    expect(src).not.toMatch(/props\.font\s*===/);
    expect(src).not.toContain("yohu-corner__content");
    expect(css).not.toContain("yohu-corner__content");
  });

  it("弱多行用后高走 field-sizing，盒高交给 YoGrow，rows 只是下限", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "TextField.tsx"), "utf8");
    const grow = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "textfield-grow.ts"), "utf8");
    const { unmount } = render(() => (
      <YoTextField ariaLabel="命令" multiline rows={1} value={"a\nb\nc"} />
    ));
    const host = screen.getByLabelText("命令").closest(".yohu-text-field");
    expect((screen.getByLabelText("命令") as HTMLTextAreaElement).rows).toBe(1);
    expect(host?.style.getPropertyValue("--yohu-text-field-max-rows")).toBe("6");
    expect(host?.querySelector(".yohu-grow")).toBeTruthy();
    expect(host?.querySelector(".yohu-text-field__body")).toBeTruthy();
    expect(host?.querySelector(".yohu-text-field__body")?.hasAttribute("data-grow-used")).toBe(true);
    unmount();
    render(() => (
      <YoTextField
        ariaLabel="长命令"
        multiline
        rows={1}
        maxRows={4}
        value={"1\n2\n3\n4\n5\n6\n7\n8"}
      />
    ));
    expect((screen.getByLabelText("长命令") as HTMLTextAreaElement).rows).toBe(1);
    expect(
      screen.getByLabelText("长命令").closest(".yohu-text-field")?.style.getPropertyValue("--yohu-text-field-max-rows"),
    ).toBe("4");
    expect(src).toContain("YoGrow");
    expect(src).toContain("growUsedAttrs");
    expect(src).toContain("yohu-text-field__body");
    expect(src).not.toContain("YoTravel");
    expect(src).not.toContain("fit=");
    expect(src).toContain("growQueued");
    expect(src).toContain("domIntent");
    expect(src).not.toContain(".scrollHeight");
    expect(src).not.toContain("--yohu-text-field-rows");
    expect(grow).toContain("ResizeObserver");
    expect(grow).not.toContain(".scrollHeight");
    expect(css).toContain("field-sizing: content");
    expect(css).toContain("contain: inline-size");
    expect(css).toContain("--yohu-text-field-max-rows");
    expect(css).not.toContain("min-height: min-content");
    expect(css).toContain(".yohu-grow");
    expect(css).toContain("flex: 1 1 0%");
    expect(css).toContain("align-self: flex-start");
    expect(css).toContain("align-items: flex-start");
    expect(css).toContain("min-height: 0");
    expect(css).toContain("yohu-text-field__body");
    expect(css).toContain("justify-content: flex-end");
    expect(css).toContain("position: absolute");
    expect(css).toContain("inset: 0");
    expect(css).not.toContain("transition: height var(--yohu-motion-spatial-small)");
    expect(css).not.toContain("--yohu-text-field-rows");
  });
});
