import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoDialog } from "../overlay/Dialog";
import { YoSelect } from "./Select";

const OPTIONS = [
  { value: "a", label: "选项A" },
  { value: "b", label: "选项B" },
  { value: "c", label: "选项C" },
];

describe("YoSelect", () => {
  it("点击展开并选择选项（onChange + 关闭）", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByText("选项B"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("显示当前选中值", () => {
    render(() => <YoSelect options={OPTIONS} value="c" />);
    expect(screen.getByText("选项C")).toBeTruthy();
  });

  it("Esc 关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("点击外部关闭下拉", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：Enter 展开，↓ 移动活动项，Enter 提交", () => {
    const onChange = vi.fn();
    render(() => <YoSelect options={OPTIONS} value="a" placeholder="请选择" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    // 初始活动项 = 当前选中 a；↓ 到 b
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-b");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘：闭合态 ↓ 直接展开；Esc 关闭并回焦触发钮", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("展开后选中项标签可见且带 selected 态（含空字符串 value）", () => {
    const levels = [
      { value: "", label: "全部" },
      { value: "V", label: "V" },
      { value: "E", label: "E" },
    ];
    render(() => <YoSelect options={levels} value="" />);
    fireEvent.click(screen.getByRole("button", { name: /全部/ }));
    const selected = screen.getByRole("option", { name: "全部" });
    expect(selected.textContent).toBe("全部");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.hasAttribute("data-selected")).toBe(true);
    expect(selected.hasAttribute("data-rule")).toBe(true);
    expect(selected.classList.contains("yohu-interactive--active")).toBe(false);
    expect(selected.classList.contains("yohu-interactive--selected")).toBe(false);
    expect(screen.getByRole("option", { name: "E" }).hasAttribute("data-rule")).toBe(false);
    expect(screen.getByRole("option", { name: "V" }).hasAttribute("data-selected")).toBe(false);
    expect(selected.querySelector(".yohu-select__option-label")?.textContent).toBe("全部");
    expect(screen.getByRole("button").getAttribute("aria-activedescendant")).toBe("yohu-option-empty");
  });

  it("菜单 Portal 到 body，定位写在独立 layer 上", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    const layer = listbox.parentElement;
    expect(listbox.closest(".yohu-select")).toBeNull();
    expect(layer?.classList.contains("yohu-select__layer")).toBe(true);
    expect(layer?.getAttribute("data-placement")).toMatch(/^(top|bottom)$/);
    expect(layer?.getAttribute("data-placed")).toBe("");
    expect(layer?.style.position).toBe("fixed");
    expect(layer?.style.width).toBe(layer?.style.minWidth);
    expect(layer?.style.minWidth).not.toBe("");
    expect(layer?.hasAttribute("data-overflow-y")).toBe(false);
  });

  it("触发钮贴视口底时向上展开，不往下撑", () => {
    const viewport = {
      width: 800,
      height: 600,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 600);
    vi.stubGlobal("innerWidth", 800);
    try {
      render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
      const trigger = screen.getByRole("button");
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
        x: 100,
        y: 560,
        top: 560,
        left: 100,
        bottom: 592,
        right: 220,
        width: 120,
        height: 32,
        toJSON: () => ({}),
      } as DOMRect);
      fireEvent.click(trigger);
      const listbox = screen.getByRole("listbox");
      const layer = listbox.parentElement;
      expect(listbox.getAttribute("data-placement")).toBe("top");
      expect(layer?.style.top).toBe("auto");
      expect(Number.parseFloat(layer?.style.bottom ?? "")).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("非空 value 的选中项同样标签可见且带 selected 态", () => {
    render(() => <YoSelect options={OPTIONS} value="c" />);
    fireEvent.click(screen.getByRole("button", { name: /选项C/ }));
    const selected = screen.getByRole("option", { name: "选项C" });
    expect(selected.textContent).toBe("选项C");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.hasAttribute("data-selected")).toBe(true);
    expect(selected.querySelector("[data-icon='check']")).not.toBeNull();
    expect(selected.classList.contains("yohu-interactive--selected")).toBe(false);
    expect(selected.classList.contains("yohu-interactive--active")).toBe(false);
  });

  it("打开时选中项没有悬停洗；指针移入后才有", () => {
    render(() => <YoSelect options={OPTIONS} value="a" />);
    fireEvent.click(screen.getByRole("button", { name: /选项A/ }));
    const selected = screen.getByRole("option", { name: "选项A" });
    expect(selected.classList.contains("yohu-interactive--active")).toBe(false);
    fireEvent.mouseEnter(screen.getByRole("option", { name: "选项B" }));
    expect(screen.getByRole("option", { name: "选项B" }).classList.contains("yohu-interactive--active")).toBe(true);
    expect(selected.classList.contains("yohu-interactive--active")).toBe(false);
    expect(selected.hasAttribute("data-selected")).toBe(true);
  });

  it("键盘：Home/End 跳到首尾活动项", () => {
    render(() => <YoSelect options={OPTIONS} placeholder="请选择" />);
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-c");
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-a");
  });

  it("展开时 Esc 只关下拉，不关闭外层 Dialog", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open title="弹窗" onClose={onClose}>
        <YoSelect options={OPTIONS} placeholder="请选择" />
      </YoDialog>
    ));
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("逐层退出：菜单关闭后下一次 Esc 才关闭外层 Dialog", () => {
    const onClose = vi.fn();
    render(() => (
      <YoDialog open title="弹窗" onClose={onClose}>
        <YoSelect options={OPTIONS} placeholder="请选择" />
      </YoDialog>
    ));
    // 第 1 次 Esc：只关最内浮层（Select），Dialog 保持打开
    fireEvent.click(screen.getByRole("button", { name: /请选择/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // 第 2 次 Esc：现在 Select 已关，事件到达 Dialog，逐层退出
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("键盘：展开态 Tab 提交活动选项并关闭，不依赖浏览器默认迁移", () => {
    const onChange = vi.fn();
    render(() => (
      <YoSelect options={OPTIONS} value="a" placeholder="请选择" onChange={onChange} />
    ));
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe("yohu-option-b");
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("触发钮可访问名是选中文案，不是空盒子", () => {
    render(() => (
      <YoSelect
        options={[{ value: "s", label: "Nori Family Hub · 5c62" }]}
        value="s"
      />
    ));
    const trigger = screen.getByRole("button", { name: "Nori Family Hub · 5c62" });
    expect(trigger.querySelector(".yohu-select__value")?.textContent).toBe("Nori Family Hub · 5c62");
    expect(trigger.classList.contains("yohu-select__trigger")).toBe(true);
    expect(trigger.querySelector(":scope > .yohu-select__chevron [data-icon='chevron-down']")).not.toBeNull();
    expect(trigger.querySelector(".yohu-select__chrome .yohu-select__chevron")).toBeNull();
  });

  it("block 拉满父级", () => {
    const { container } = render(() => <YoSelect block options={OPTIONS} value="a" />);
    expect(container.querySelector(".yohu-select")?.hasAttribute("data-block")).toBe(true);
  });

  it("block 触发钮主文案吃剩余，次文案贴箭头", () => {
    render(() => (
      <YoSelect
        block
        options={[{ value: "s", label: "edge 60 pro", description: "0106 · USB" }]}
        value="s"
      />
    ));
    const trigger = screen.getByRole("button", { name: "edge 60 pro 0106 · USB" });
    expect(trigger.querySelector(".yohu-select__value")?.textContent).toBe("edge 60 pro");
    expect(trigger.querySelector(".yohu-select__description")?.textContent).toBe("0106 · USB");
  });

  it("hug 触发钮不画次文案，菜单项才画", () => {
    render(() => (
      <YoSelect
        options={[{ value: "s", label: "edge 60 pro", description: "0106 · USB" }]}
        value="s"
      />
    ));
    const trigger = screen.getByRole("button", { name: "edge 60 pro" });
    expect(trigger.querySelector(".yohu-select__description")).toBeNull();
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "edge 60 pro 0106 · USB" });
    expect(option.querySelector(".yohu-select__description")?.textContent).toBe("0106 · USB");
  });
});

describe("YoSelect 分层契约", () => {
  it("视图不内嵌 placePopover / 测量算法，也不留 layoutMenu 包装", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/Select.tsx"),
      resolve(process.cwd(), "packages/ui/src/form/Select.tsx"),
    ];
    const src = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/\bplacePopover\b/);
    expect(src).not.toMatch(/\bestimateMenuHeight\b/);
    expect(src).not.toMatch(/\bapplyPopoverBox\b/);
    expect(src).not.toMatch(/\bapplySelectHover\b/);
    expect(src).not.toMatch(/\bgetBoundingClientRect\b/);
    expect(src).not.toMatch(/\blayoutMenu\b/);
    expect(src).toMatch(/\blayoutSelectMenu\b/);
    expect(src).toMatch(/\breadAnchorBox\b/);
    expect(src).toMatch(/data-placed=/);
    expect(src).toMatch(/mode="paint"/);
    expect(src).toMatch(/radius=\{Radius\.Xl\}/);
    expect(src).toMatch(/role="card"/);
    expect(src).toMatch(/class="yohu-select__chevron"/);
    expect(src).toMatch(/name="check"/);
    expect(src).not.toMatch(/yohu-recipe-selected/);
    expect(src).not.toMatch(/yohu-interactive--selected/);
  });

  it("重排监听经 listen 成对登记与摘掉", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/Select.tsx"),
      resolve(process.cwd(), "packages/ui/src/form/Select.tsx"),
    ];
    const src = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    const count = (needle: string): number => src.split(needle).length - 1;
    expect(count("add" + "EventListener")).toBe(1);
    expect(count("remove" + "EventListener")).toBe(1);
    expect(count(", true)")).toBe(2);
    expect(src).toContain('listen(window, "resize", onRelayout)');
    expect(src).toContain('listen(window, "scroll", onRelayout, true)');
    expect(src).toContain('listen(window.visualViewport, "resize", onRelayout)');
    expect(src).toContain('listen(window.visualViewport, "scroll", onRelayout)');
    expect(src).toContain('listen(document, "mousedown", handleDocPointerDown)');
    expect(src).toContain('listen(document, "keydown", handleDocKeyDown, true)');
  });
});

describe("YoSelect 触发布局契约", () => {
  it("hug 跟文案簇，不写 min-width；block 才让文案吃剩余、箭头贴尾", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/Select.css"),
      resolve(process.cwd(), "packages/ui/src/form/Select.css"),
    ];
    const css = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(css.length).toBeGreaterThan(0);
    const root = css.match(/^\.yohu-select\s*\{([^}]*)\}/m)?.[1] ?? "";
    const trigger = css.match(/^\.yohu-select__trigger\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(root).not.toMatch(/min-width/);
    expect(trigger).not.toMatch(/min-width/);
    expect(trigger).toMatch(/gap:\s*var\(--yohu-space-sm\)/);
    expect(trigger).toMatch(/--yohu-corner-fill:\s*var\(--yohu-comp-gray\)/);
    expect(trigger).not.toMatch(/--yohu-corner-stroke/);
    expect(trigger).toMatch(/border-radius:\s*var\(--yohu-radius-xl\)/);
    expect(trigger).not.toMatch(/box-shadow/);
    expect(css).toMatch(/\.yohu-select__menu\s*\{[^}]*border-radius:\s*var\(--yohu-radius-md\)/);
    const menuRow = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../menu/menu-row.css"), "utf-8");
    expect(menuRow).toMatch(/\.yohu-menu-well\s*\{[^}]*padding:\s*var\(--yohu-space-sm\)/);
    expect(menuRow).toMatch(/padding:\s*0 var\(--yohu-space-sm\)/);
    expect(menuRow).toMatch(/gap:\s*var\(--yohu-space-sm\)/);
    expect(menuRow).not.toMatch(/--yohu-ripple-/);
    expect(menuRow).toMatch(/\[data-rule\]::after\s*\{[^}]*height:\s*var\(--yohu-stroke-hairline\)/);
    expect(css).toMatch(/\.yohu-select__option\[data-selected\] \.yohu-select__mark\s*\{[^}]*visibility:\s*visible/);
    expect(css).not.toContain(".yohu-select__rule");
    const value = css.match(/^\.yohu-select__value\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(value).toMatch(/flex:\s*0 1 auto/);
    expect(css).toMatch(
      /\.yohu-select\[data-block\] \.yohu-select__value\s*\{[^}]*flex:\s*1 1 auto/,
    );
    expect(css).toMatch(
      /\.yohu-select\[data-block\] \.yohu-select__description\s*\{[^}]*flex:\s*0 0 auto/,
    );
    const chevron = css.match(/^\.yohu-select__chevron\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(chevron).toMatch(/flex:\s*0 0 auto/);
    expect(css).not.toContain(".yohu-select__chrome .yohu-corner__content");
    expect(css).not.toContain(".yohu-corner__content");
  });

  it("下拉纵滚关系统条，不引进 YoScroller", () => {
    const candidates = [
      resolve(process.cwd(), "src/corner/Corner.css"),
      resolve(process.cwd(), "packages/ui/src/corner/Corner.css"),
    ];
    const css = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    const overflow = css.slice(css.indexOf('.yohu-corner__content[data-overflow="auto"]'));
    expect(overflow).toContain("overflow: auto");
    expect(overflow).toContain("scrollbar-width: none");
    expect(overflow).toContain("::-webkit-scrollbar");
    expect(overflow).toMatch(/width:\s*0/);
    expect(overflow).toMatch(/height:\s*0/);
  });
});

describe("选择框回到空闲", () => {
  it("空闲会话只写在 selectIdle，两处调用不并 onChange 与 focus", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/Select.tsx"),
      resolve(process.cwd(), "packages/ui/src/form/Select.tsx"),
    ];
    const src = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    const count = (needle: string): number => src.split(needle).length - 1;
    expect(count("setSession(" + "idleSelectSession())")).toBe(1);
    expect(count("function selectIdle")).toBe(1);
    expect(count("export function selectIdle")).toBe(0);
    expect(count("selectIdle()")).toBe(3);
    expect(count("idleSelectSession()")).toBe(2);
    expect(count("triggerRef?." + "focus()")).toBe(1);
    expect(count("props.onChange?.(value)")).toBe(1);
  });
});

function selectSource(): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Select.tsx"), "utf8");
}

describe("下拉焦点", () => {
  it("提交和退出都把焦点交回触发钮", () => {
    const src = selectSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("triggerRef?." + "focus()")).toBe(1);
    expect(times("function selectFocusTrigger")).toBe(1);
    expect(times("export function selectFocusTrigger")).toBe(0);
    expect(times("selectFocusTrigger()")).toBe(3);
    expect(times("props.onChange?.(" + "value)")).toBe(1);
  });
});

describe("下拉落点", () => {
  it("层和菜单都写同一落点", () => {
    const src = selectSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("data-placement={" + "placement()}")).toBe(0);
    expect(times("return " + "placement()")).toBe(1);
    expect(times("function selectPlacement")).toBe(1);
    expect(times("export function selectPlacement")).toBe(0);
    expect(times("selectPlacement()")).toBe(3);
    expect(times("data-placement={selectPlacement()}")).toBe(2);
  });
});

describe("下拉挂上再量", () => {
  it("层和菜单挂上后都再量一次", () => {
    const src = selectSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("if (el) " + "syncMenuPlace()")).toBe(1);
    expect(times("function placeIfMounted")).toBe(1);
    expect(times("export function placeIfMounted")).toBe(0);
    expect(times("placeIfMounted(el)")).toBe(2);
  });
});

describe("下拉次文案", () => {
  it("触发钮和选项都画同一条次文案", () => {
    const src = selectSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("{(meta) => " + '<span class="yohu-select__description">{meta()}</span>}')).toBe(0);
    expect(times("yohu-select__" + "description")).toBe(1);
    expect(times("function selectDescription")).toBe(1);
    expect(times("export function selectDescription")).toBe(0);
    expect(times("selectDescription(meta)")).toBe(2);
  });
});
