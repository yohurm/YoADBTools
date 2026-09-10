import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoContextMenu } from "./ContextMenu";

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
});
