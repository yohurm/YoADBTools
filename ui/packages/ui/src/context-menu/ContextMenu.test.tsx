import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoContextMenu } from "./ContextMenu";

const menuCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ContextMenu.css"), "utf-8");
const cornerCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../corner/Corner.css"), "utf-8");

describe("YoContextMenu", () => {
  it("打开时渲染条目，点击触发 onSelect 并关闭", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu
        open
        x={10}
        y={20}
        items={[{ id: "new-dir", label: "新建目录" }]}
        onSelect={onSelect}
        onClose={onClose}
      />
    ));
    fireEvent.click(screen.getByRole("menuitem", { name: "新建目录" }));
    expect(onSelect).toHaveBeenCalledWith("new-dir");
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc 关闭", () => {
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu open x={0} y={0} items={[{ id: "a", label: "A" }]} onSelect={() => undefined} onClose={onClose} />
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Tab 关闭", () => {
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu open x={0} y={0} items={[{ id: "a", label: "A" }]} onSelect={() => undefined} onClose={onClose} />
    ));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Arrow / Home / End 在可选项间移动焦点", () => {
    render(() => (
      <YoContextMenu
        open
        x={0}
        y={0}
        items={[
          { id: "copy", label: "复制" },
          { id: "rename", label: "重命名", disabled: true },
          { id: "export", label: "导出" },
        ]}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    ));
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
  });

  it("typeahead 跳到匹配项；Enter 选中", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu
        open
        x={0}
        y={0}
        items={[
          { id: "copy", label: "Copy" },
          { id: "delete", label: "Delete" },
          { id: "export", label: "Export" },
        ]}
        onSelect={onSelect}
        onClose={onClose}
      />
    ));
    fireEvent.keyDown(document, { key: "d" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("delete");
    expect(onClose).toHaveBeenCalled();
  });

  it("危险项走 data-tone，List 槽位是 label", () => {
    render(() => (
      <YoContextMenu
        open
        x={0}
        y={0}
        items={[{ id: "del", label: "删除", danger: true }]}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    ));
    const item = screen.getByRole("menuitem", { name: "删除" });
    expect(item.getAttribute("data-tone")).toBe("danger");
    expect(item.classList.contains("yohu-context-menu__item--danger")).toBe(false);
    expect(item.querySelector('[data-slot="label"]')?.textContent).toBe("删除");
  });

  it("菜单宽跟标签，帽在 token，标签单行省略", () => {
    expect(menuCss).toContain("border-radius: var(--yohu-radius-md)");
    expect(menuCss).toContain("width: max-content");
    expect(menuCss).toContain("min(var(--yohu-layout-menu-max)");
    expect(menuCss).toContain("white-space: nowrap");
    expect(menuCss).toContain("text-overflow: ellipsis");
    expect(menuCss).not.toContain("menu-min");
    expect(menuCss).toContain('[data-slot="trail"]');
    expect(menuCss).toMatch(/data-slot="label"\]\s*\{[^}]*flex:\s*1 1 auto/);
  });

  it("指针停在带子项的条目上展开二级菜单，点选子项", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <YoContextMenu
        open
        x={8}
        y={8}
        items={[
          { id: "copy", label: "复制" },
          {
            id: "move",
            label: "移到",
            children: [
              { id: "move:a", label: "设备信息" },
              { id: "move:b", label: "连接性" },
            ],
          },
          { id: "delete", label: "删除", danger: true },
        ]}
        onSelect={onSelect}
        onClose={onClose}
      />
    ));
    const move = screen.getByRole("menuitem", { name: "移到" });
    expect(move.getAttribute("aria-haspopup")).toBe("menu");
    expect(move.querySelector("[data-icon='chevron-right']")).not.toBeNull();
    fireEvent.pointerEnter(move);
    fireEvent.click(screen.getByRole("menuitem", { name: "连接性" }));
    expect(onSelect).toHaveBeenCalledWith("move:b");
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(move);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("菜单可滚，关系统条", () => {
    expect(menuCss).not.toContain(".yohu-corner__content");
    expect(cornerCss).toMatch(
      /\.yohu-corner__content\[data-overflow="auto"\]\s*\{[\s\S]*?overflow:\s*auto;/,
    );
    expect(cornerCss).toMatch(
      /\.yohu-corner__content\[data-overflow="auto"\]\s*\{[\s\S]*?scrollbar-width:\s*none;/,
    );
    expect(cornerCss).toContain('.yohu-corner__content[data-overflow="auto"]::-webkit-scrollbar');
  });

  it("文档监听经 listen 成对登记与摘除", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ContextMenu.tsx"), "utf-8");
    expect(source.split("add" + "EventListener").length - 1).toBe(1);
    expect(source.split("remove" + "EventListener").length - 1).toBe(1);
    expect(source).toContain('listen("mousedown", onDocMouse)');
    expect(source).toContain('listen("keydown", onDocKey)');
  });
});

describe("菜单选中并关闭", () => {
  it("启用项经 chooseItem 选中并关闭", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ContextMenu.tsx"), "utf-8");
    expect(source.split("if (!itemIsEnabled(item)) " + "return").length - 1).toBe(1);
    expect(source.split("props.onSelect(" + "item.id)").length - 1).toBe(1);
    expect(source.split("function chooseItem").length - 1).toBe(1);
    expect(source.split("export function chooseItem").length - 1).toBe(0);
    expect(source.split("chooseItem(item)").length - 1).toBe(1);
    expect(source.split("chooseItem(props.items[index])").length - 1).toBe(1);
    expect(source.split("props.onClose()").length - 1).toBe(3);
  });
});
