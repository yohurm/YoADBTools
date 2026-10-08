import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoRail } from "../motion/engines/rail";
import { YoListItem } from "./ListItem";

describe("YoListItem", () => {
  it("默认 option 行，选中写 aria-selected", () => {
    const { container } = render(() => (
      <YoListItem title="edge 60" description="SERIAL" selected />
    ));
    const row = container.querySelector(".yohu-list-item");
    expect(row?.getAttribute("role")).toBe("option");
    expect(row?.getAttribute("aria-selected")).toBe("true");
    expect(row?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(row?.classList.contains("yohu-recipe-selected")).toBe(true);
    expect(container.querySelector(".yohu-list-item__mark")).toBeTruthy();
    expect(container.querySelector(".yohu-list-item__mark-fill")?.getAttribute("data-part")).toBe(
      "bar",
    );
    expect(container.querySelector(".yohu-list-item__title")?.getAttribute("data-part")).toBe("title");
    expect(container.querySelector(".yohu-list-item__description")?.getAttribute("data-part")).toBe(
      "sub",
    );
    expect(screen.getByText("SERIAL")).toBeTruthy();
    expect(container.querySelector(".yohu-list-item__info")?.getAttribute("data-part")).toBe("rail");
    expect(container.querySelector(".yohu-list-item__extra")?.getAttribute("data-part")).toBe("rail");
    expect(container.querySelector(".yohu-list-item__description")?.textContent).toBe("SERIAL");
  });

  it("槽位走节点，host 不写 data-has-*", () => {
    const { container } = render(() => (
      <YoListItem
        title="edge 60"
        description="SERIAL"
        meta="USB"
        leading={<span>点</span>}
        trailing={<span>徽</span>}
      />
    ));
    const host = container.querySelector(".yohu-list-item") as HTMLElement;
    expect(host.querySelector(".yohu-list-item__leading")?.textContent).toBe("点");
    expect(host.querySelector(".yohu-list-item__description")?.textContent).toBe("SERIAL");
    expect(host.querySelector(".yohu-list-item__meta")?.textContent).toBe("USB");
    expect(host.querySelector(".yohu-list-item__trailing")?.textContent).toBe("徽");
    expect(host.hasAttribute("data-has-actions")).toBe(false);
    expect(host.hasAttribute("data-has-leading")).toBe(false);
    expect(host.hasAttribute("data-has-description")).toBe(false);
    expect(host.hasAttribute("data-has-trailing")).toBe(false);
    expect(host.hasAttribute("data-has-meta")).toBe(false);
  });

  it("导航钮走 aria-current，不写 aria-selected", () => {
    const onClick = vi.fn();
    render(() => (
      <YoListItem role="button" title="终端" current selected ring="inset" onClick={onClick} />
    ));
    const btn = screen.getByRole("button", { name: "终端" });
    expect(btn.getAttribute("aria-current")).toBe("page");
    expect(btn.hasAttribute("aria-selected")).toBe(false);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("轨外不写 data-stream", () => {
    const { container } = render(() => <YoListItem title="终端" />);
    expect(container.querySelector(".yohu-list-item")?.hasAttribute("data-stream")).toBe(false);
  });

  it("轨内写 data-stream，跟相位", () => {
    const expanded = render(() => (
      <YoRail intent="expanded">
        <YoListItem title="终端" />
      </YoRail>
    ));
    expect(expanded.container.querySelector(".yohu-list-item")?.getAttribute("data-stream")).toBe(
      "open",
    );
    expanded.unmount();

    const icons = render(() => (
      <YoRail intent="icons">
        <YoListItem title="终端" />
      </YoRail>
    ));
    expect(icons.container.querySelector(".yohu-list-item")?.getAttribute("data-stream")).toBe(
      "closed",
    );
  });

  it("关流样式认自身 data-stream，时长 spatial-rail", () => {
    const candidates = [
      resolve(process.cwd(), "src/list/ListItem.css"),
      resolve(process.cwd(), "packages/ui/src/list/ListItem.css"),
    ];
    let css = "";
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        css = readFileSync(candidate, "utf-8");
        break;
      }
    }
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain(".yohu-list-item[data-stream]");
    expect(css).toContain(':not([data-stream="open"])');
    expect(css).toContain("min-height var(--yohu-motion-spatial-rail)");
    expect(css).toContain("max-width var(--yohu-motion-spatial-rail)");
    expect(css).not.toContain(".yohu-list-item__mark");
    expect(css).toContain("color var(--yohu-motion-effects-fast)");
    expect(css).not.toContain("[aria-current] .yohu-list-item__title");
    expect(css).not.toContain(".yohu-recipe-rail");
  });

  it("导航首次选中不弹，换项后 leading 才 bounce", () => {
    const first = render(() => (
      <YoListItem
        role="button"
        size="nav"
        title="终端"
        selected
        leading={<span>i</span>}
      />
    ));
    expect(first.container.querySelector(".yohu-list-item__leading")?.hasAttribute("data-bounce")).toBe(
      false,
    );
    first.unmount();

    const Harness = () => {
      const [selected, setSelected] = createSignal(false);
      return (
        <>
          <button type="button" onClick={() => setSelected(true)}>
            pick
          </button>
          <YoListItem
            role="button"
            size="nav"
            title="终端"
            selected={selected()}
            leading={<span>i</span>}
          />
        </>
      );
    };
    const { container } = render(() => <Harness />);
    expect(container.querySelector(".yohu-list-item__leading")?.hasAttribute("data-bounce")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(container.querySelector(".yohu-list-item__leading")?.hasAttribute("data-bounce")).toBe(true);
  });
});

function listItemSource(): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ListItem.tsx"), "utf8");
}

describe("列表行选中", () => {
  it("选项行和按钮行都问同一把选中", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("presenceIsOn(host()[" + '"data-selected"])')).toBe(1);
    expect(times("function selectedNow")).toBe(1);
    expect(times("export function selectedNow")).toBe(0);
    expect(times("selectedNow()")).toBe(3);
    expect(times('"yohu-interactive' + '--selected"')).toBe(1);
    expect(times("function selectedClass")).toBe(1);
    expect(times("export function selectedClass")).toBe(0);
    expect(times("selectedClass()")).toBe(3);
    expect(times("classList={selectedClass()}")).toBe(2);
  });
});

describe("列表行尺寸", () => {
  it("弹跳和两处宿主都读同一档尺寸", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('host()["' + 'data-size"]')).toBe(1);
    expect(times("function itemSize")).toBe(1);
    expect(times("export function itemSize")).toBe(0);
    expect(times("itemSize()")).toBe(4);
    expect(times("data-size={itemSize()}")).toBe(2);
    expect(times("listItemSizeIsNav(itemSize())")).toBe(1);
  });
});

describe("列表行无障碍名", () => {
  it("选项行和按钮行都用同一标签", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("aria-label={" + "props.label}")).toBe(0);
    expect(times("return " + "props.label")).toBe(1);
    expect(times("function itemLabel")).toBe(1);
    expect(times("export function itemLabel")).toBe(0);
    expect(times("itemLabel()")).toBe(3);
    expect(times("aria-label={itemLabel()}")).toBe(2);
  });
});

describe("列表行序号", () => {
  it("选项行和按钮行都用同一 tabindex", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("tabIndex={" + "props.tabIndex}")).toBe(0);
    expect(times("return " + "props.tabIndex")).toBe(1);
    expect(times("function itemTabIndex")).toBe(1);
    expect(times("export function itemTabIndex")).toBe(0);
    expect(times("itemTabIndex()")).toBe(3);
    expect(times("tabIndex={itemTabIndex()}")).toBe(2);
  });
});

describe("列表行点击", () => {
  it("选项行和按钮行都把点击转出去", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("onClick={" + "props.onClick}")).toBe(0);
    expect(times("props.onClick?.(" + "event)")).toBe(1);
    expect(times("function forwardItemClick")).toBe(1);
    expect(times("export function forwardItemClick")).toBe(0);
    expect(times("onClick={forwardItemClick}")).toBe(2);
  });
});

describe("列表行按键", () => {
  it("选项行和按钮行都把按键转出去", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("onKeyDown={" + "props.onKeyDown}")).toBe(0);
    expect(times("props.onKeyDown?.(" + "event)")).toBe(1);
    expect(times("function forwardItemKey")).toBe(1);
    expect(times("export function forwardItemKey")).toBe(0);
    expect(times("onKeyDown={forwardItemKey}")).toBe(2);
  });
});

describe("列表行轨槽", () => {
  it("信息、附加和尾槽都标同一轨", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('data-part="' + 'rail"')).toBe(0);
    expect(times('return "' + 'rail"')).toBe(1);
    expect(times("function itemRailPart")).toBe(1);
    expect(times("export function itemRailPart")).toBe(0);
    expect(times("itemRailPart()")).toBe(4);
    expect(times("data-part={itemRailPart()}")).toBe(3);
  });
});

describe("列表行次文案", () => {
  it("说明和元数据都标同一子槽", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('data-part="' + 'sub"')).toBe(0);
    expect(times('return "' + 'sub"')).toBe(1);
    expect(times("function itemSubPart")).toBe(1);
    expect(times("export function itemSubPart")).toBe(0);
    expect(times("itemSubPart()")).toBe(3);
    expect(times("data-part={itemSubPart()}")).toBe(2);
  });
});

describe("列表行弹跳复位", () => {
  it("非导航和动画结束都清掉弹跳", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("setIconBounce(" + "false)")).toBe(1);
    expect(times("function clearIconBounce")).toBe(1);
    expect(times("export function clearIconBounce")).toBe(0);
    expect(times("clearIconBounce()")).toBe(3);
  });
});

describe("列表行弹跳已见", () => {
  it("两处都记下弹跳已经绑过", () => {
    const src = listItemSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("bounceBound " + "= true")).toBe(1);
    expect(times("function markBounceBound")).toBe(1);
    expect(times("export function markBounceBound")).toBe(0);
    expect(times("markBounceBound()")).toBe(3);
  });
});
