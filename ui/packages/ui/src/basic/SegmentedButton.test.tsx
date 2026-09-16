import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoSegmentedButton } from "./SegmentedButton";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "SegmentedButton.css"), "utf8");

const ITEMS = [
  { value: "package", label: "包名" },
  { value: "pid", label: "PID" },
];

describe("YoSegmentedButton", () => {
  it("渲染 radiogroup，默认 tab 白选择块", () => {
    const { container } = render(() => (
      <YoSegmentedButton items={ITEMS} value="package" ariaLabel="划分方式" />
    ));
    const group = screen.getByRole("radiogroup", { name: "划分方式" });
    expect(group).toBeTruthy();
    expect(group.getAttribute("data-type")).toBe("tab");
    expect(group.getAttribute("data-paint")).toBe("tab-surface");
    expect(group.getAttribute("data-fill-owner")).toBe("thumb");
    expect(group.getAttribute("data-size")).toBe("md");
    expect(group.className).not.toContain("yohu-segmented--tab");
    const thumb = container.querySelector(".yohu-recipe-indicator--thumb");
    const item = container.querySelector(".yohu-segmented__item");
    expect(thumb?.parentElement).toBe(group);
    expect(item?.parentElement).toBe(group);
    expect(group.querySelector(":scope > .yohu-corner")?.getAttribute("data-mode")).toBe("paint");
    expect(screen.getByRole("radio", { name: "包名" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "包名" }).hasAttribute("data-selected")).toBe(true);
    expect(screen.getByRole("radio", { name: "PID" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "PID" }).hasAttribute("data-selected")).toBe(false);
    expect(screen.getByRole("radio", { name: "包名" }).classList.contains("yohu-segmented__item--selected")).toBe(false);
  });

  it("点击未选项触发 onChange 与 onItemClick", () => {
    const onChange = vi.fn();
    const onItemClick = vi.fn();
    render(() => (
      <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} onItemClick={onItemClick} />
    ));
    fireEvent.click(screen.getByRole("radio", { name: "PID" }));
    expect(onChange).toHaveBeenCalledWith("pid");
    expect(onItemClick).toHaveBeenCalledWith(1);
  });

  it("再次点击当前项只打 onItemClick（对齐鸿蒙 onItemClicked）", () => {
    const onChange = vi.fn();
    const onItemClick = vi.fn();
    render(() => (
      <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} onItemClick={onItemClick} />
    ));
    fireEvent.click(screen.getByRole("radio", { name: "包名" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onItemClick).toHaveBeenCalledWith(0);
  });

  it("方向键循环切换", () => {
    const onChange = vi.fn();
    render(() => <YoSegmentedButton items={ITEMS} value="package" onChange={onChange} ariaLabel="划分" />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("pid");
  });

  it("Home/End 跳到首尾", () => {
    const onChange = vi.fn();
    render(() => (
      <YoSegmentedButton
        items={[...ITEMS, { value: "all", label: "全部" }]}
        value="pid"
        onChange={onChange}
        ariaLabel="划分"
      />
    ));
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("package");
    fireEvent.keyDown(group, { key: "End" });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("图文混合挂 hybrid 高度", () => {
    const { container } = render(() => (
      <YoSegmentedButton
        items={[
          { value: "package", label: "包名", icon: "search" },
          { value: "pid", label: "PID", icon: "log" },
        ]}
        value="package"
      />
    ));
    const group = container.querySelector(".yohu-segmented");
    expect(group?.getAttribute("data-hybrid")).toBe("");
    expect(group?.className).not.toContain("yohu-segmented--hybrid");
  });

  it("capsule 类型挂强调色选择块", () => {
    const { container } = render(() => (
      <YoSegmentedButton items={ITEMS} value="package" type="capsule" />
    ));
    const group = container.querySelector(".yohu-segmented");
    expect(group?.getAttribute("data-paint")).toBe("capsule-accent");
    expect(group?.getAttribute("data-fill-owner")).toBe("thumb");
    expect(group?.getAttribute("data-type")).toBe("capsule");
    expect(group?.className).not.toContain("yohu-segmented--capsule");
  });

  it("轨走 YoCorner paint，宿主不再叠 CSS 圆角底", () => {
    const { container } = render(() => <YoSegmentedButton items={ITEMS} value="package" />);
    const hostEl = container.querySelector(".yohu-segmented");
    const corner = hostEl?.querySelector(":scope > .yohu-corner");
    expect(corner?.getAttribute("data-role")).toBe("control");
    expect(corner?.getAttribute("data-mode")).toBe("paint");
    expect(hostEl?.querySelector(".yohu-segmented__chrome")).toBeNull();
    const host = css.match(/^\.yohu-segmented\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(host).toContain("--yohu-corner-fill: var(--yohu-surface-2)");
    expect(host).toContain("padding: var(--yohu-space-xs)");
    expect(host).not.toContain("border-radius:");
    expect(host).not.toContain("background:");
  });

  it("disabled 时不触发 onChange", () => {
    const onChange = vi.fn();
    render(() => <YoSegmentedButton items={ITEMS} value="package" disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "PID" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("胶囊多选是 group，再点取消，不画单选滑块", () => {
    const onChangeValues = vi.fn();
    const { container } = render(() => (
      <YoSegmentedButton
        type="capsule"
        multiple
        items={[
          { value: "bold", label: "粗体" },
          { value: "italic", label: "斜体" },
        ]}
        values={["bold"]}
        onChangeValues={onChangeValues}
        ariaLabel="文本样式"
      />
    ));
    const group = screen.getByRole("group", { name: "文本样式" });
    expect(group.getAttribute("data-paint")).toBe("capsule-multi");
    expect(group.getAttribute("data-fill-owner")).toBe("item");
    expect(group.getAttribute("aria-multiselectable")).toBe("true");
    expect(container.querySelector(".yohu-recipe-indicator")).toBeNull();
    expect(css).toContain("padding: var(--yohu-space-xs)");
    expect(css).not.toContain("column-gap: var(--yohu-stroke-hairline)");
    expect(screen.getByRole("button", { name: "粗体" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "粗体" }).getAttribute("data-join")).toBe("only");
    fireEvent.click(screen.getByRole("button", { name: "斜体" }));
    expect(onChangeValues).toHaveBeenCalledWith(["bold", "italic"]);
  });

  it("胶囊多选再点已选项取消", () => {
    const onChangeValues = vi.fn();
    render(() => (
      <YoSegmentedButton
        type="capsule"
        multiple
        items={[
          { value: "bold", label: "粗体" },
          { value: "italic", label: "斜体" },
        ]}
        values={["bold", "italic"]}
        onChangeValues={onChangeValues}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "粗体" }));
    expect(onChangeValues).toHaveBeenCalledWith(["italic"]);
  });

  it("tab 上的 multiple 仍是单选 radiogroup", () => {
    render(() => (
      <YoSegmentedButton items={ITEMS} value="package" type="tab" multiple ariaLabel="划分" />
    ));
    expect(screen.getByRole("radiogroup", { name: "划分" }).hasAttribute("data-multiple")).toBe(false);
    expect(screen.getByRole("radio", { name: "包名" })).toBeTruthy();
  });

  it("纯图标用 ariaLabel，图文项挂 data-content=hybrid", () => {
    const { container } = render(() => (
      <YoSegmentedButton
        items={[
          { value: "search", icon: "search", ariaLabel: "检索" },
          { value: "log", label: "日志", icon: "log" },
        ]}
        value="search"
      />
    ));
    expect(screen.getByRole("radio", { name: "检索" })).toBeTruthy();
    expect(container.querySelector('[data-content="hybrid"]')).toBeTruthy();
    expect(container.querySelector('[data-content="icon"]')).toBeTruthy();
  });

  it("图片项挂 data-content=image，选中图切换", () => {
    const { container } = render(() => (
      <YoSegmentedButton
        items={[
          { value: "face", image: "off.png", selectedImage: "on.png", ariaLabel: "头像" },
          { value: "other", image: "off.png", selectedImage: "on.png", ariaLabel: "其它" },
        ]}
        value="face"
      />
    ));
    const selected = screen.getByRole("radio", { name: "头像" });
    expect(selected.getAttribute("data-content")).toBe("image");
    expect(selected.querySelector("img")?.getAttribute("src")).toBe("on.png");
    expect(screen.getByRole("radio", { name: "其它" }).querySelector("img")?.getAttribute("src")).toBe("off.png");
  });

  it("单项 disabled 不提交", () => {
    const onChange = vi.fn();
    render(() => (
      <YoSegmentedButton
        items={[
          { value: "package", label: "包名" },
          { value: "pid", label: "PID", disabled: true },
        ]}
        value="package"
        onChange={onChange}
      />
    ));
    fireEvent.click(screen.getByRole("radio", { name: "PID" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("无障碍说明写在项上", () => {
    render(() => (
      <YoSegmentedButton
        items={[{ value: "package", label: "包名", ariaDescription: "按包名划分" }]}
        value="package"
      />
    ));
    expect(screen.getByRole("radio", { name: "包名" }).getAttribute("aria-description")).toBe("按包名划分");
  });

  it("默认 hug，block 才铺满；悬浮走 state-hover 填", () => {
    const { container } = render(() => (
      <YoSegmentedButton items={ITEMS} value="package" block ariaLabel="划分" />
    ));
    expect(container.querySelector(".yohu-segmented")?.hasAttribute("data-block")).toBe(true);
    const host = css.match(/^\.yohu-segmented\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(host).toContain("width: max-content");
    expect(css).toContain(".yohu-segmented[data-block]");
    expect(css).toContain("background: var(--yohu-state-hover)");
    expect(css).toContain("box-shadow: inset 0 0 0 9999px var(--yohu-state-hover)");
    expect(css).not.toContain("--yohu-segmented-item-fill-hover");
    expect(css).not.toContain("--yohu-segmented-item-fill-pressed");
    expect(css).toContain('[data-join="mid"]');
    expect(css).toContain('data-fill-owner="thumb"');
    expect(css).toContain('data-fill-owner="item"');
    expect(css).not.toMatch(/\.yohu-segmented__item\s*\{[^}]*overflow:\s*hidden/);
    expect(css).not.toMatch(/\[data-selected\][^{]*:hover[^{]*\{[^}]*background:\s*transparent/);
  });

  it("胶囊多选相邻选中写 join start/end", () => {
    render(() => (
      <YoSegmentedButton
        type="capsule"
        multiple
        items={[
          { value: "bold", label: "粗体" },
          { value: "italic", label: "斜体" },
          { value: "under", label: "下划线" },
        ]}
        values={["bold", "italic"]}
      />
    ));
    expect(screen.getByRole("button", { name: "粗体" }).getAttribute("data-join")).toBe("start");
    expect(screen.getByRole("button", { name: "斜体" }).getAttribute("data-join")).toBe("end");
    expect(screen.getByRole("button", { name: "下划线" }).getAttribute("data-join")).toBe("none");
  });

  it("项 ink / fill 只绑 CSS 变量，未选 hover 不洗成 fg", () => {
    const tsx = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "SegmentedButton.tsx"), "utf8");
    render(() => (
      <YoSegmentedButton
        items={[
          { value: "v", label: "V", ink: "var(--yohu-level-v)", fill: "var(--yohu-level-v)" },
          { value: "d", label: "D" },
        ]}
        value="d"
      />
    ));
    expect(screen.getByRole("radio", { name: "V" }).style.getPropertyValue("--yohu-segmented-ink")).toBe(
      "var(--yohu-level-v)",
    );
    expect(screen.getByRole("radio", { name: "V" }).style.getPropertyValue("--yohu-segmented-item-fill")).toBe(
      "var(--yohu-level-v)",
    );
    expect(css).not.toMatch(/\.yohu-segmented__item:not\(:disabled\):hover\s*\{[^}]*color:\s*var\(--yohu-fg\)/);
    expect(tsx).not.toContain("resolveKeyIndex");
    expect(tsx).not.toContain("commitIndex");
    expect(tsx).not.toContain("日志");
    expect(tsx).toContain('mode="paint"');
  });
});
