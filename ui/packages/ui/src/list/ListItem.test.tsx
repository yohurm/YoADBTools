import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    expect(container.querySelector(".yohu-list-item__mark-fill")).toBeTruthy();
    expect(screen.getByText("SERIAL")).toBeTruthy();
    expect(container.querySelector(".yohu-list-item__extra")).toBeTruthy();
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
