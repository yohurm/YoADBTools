import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoVirtualList } from "./VirtualList";
import { opsListBindings } from "./ops-list-policy";

function ItemRow(props: { item: string; index: number }) {
  return <span>{props.item}</span>;
}

describe("opsListBindings", () => {
  it("未声明的回调不进入绑定", () => {
    const bindings = opsListBindings({
      features: ["reorder"],
      selectedKey: () => "a",
      onSelectRow: () => undefined,
      onReorder: () => undefined,
      onRowContextMenu: () => undefined,
    });
    expect(bindings.onReorder).toBeTypeOf("function");
    expect(bindings).not.toHaveProperty("onSelectRow");
    expect(bindings).not.toHaveProperty("selectedKey");
    expect(bindings).not.toHaveProperty("onRowContextMenu");
    expect(bindings).not.toHaveProperty("tone");
  });

  it("multi 只留多选键，rule 才写 tone", () => {
    const keys = () => new Set<string>(["a"]);
    const bindings = opsListBindings({
      features: ["multi", "rule"],
      selectedKey: () => "a",
      selectedKeys: keys,
      onSelectRow: () => undefined,
    });
    expect(bindings.tone).toBe("list");
    expect(bindings.rowRadius).toBe("ripple");
    expect(bindings.selectedKeys).toBe(keys);
    expect(bindings).not.toHaveProperty("selectedKey");
    expect(bindings.onSelectRow).toBeTypeOf("function");
  });

  it("未声明 select 时，摊到虚拟列表不打开 listbox", () => {
    const { container } = render(() => (
      <YoVirtualList
        items={() => ["a", "b"]}
        getItemKey={(item) => item}
        renderRow={ItemRow}
        {...opsListBindings({
          selectedKey: () => "a",
          onSelectRow: () => undefined,
        })}
      />
    ));
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("role")).not.toBe("listbox");
  });

  it("声明 select 才打开 listbox", () => {
    const { container } = render(() => (
      <YoVirtualList
        items={() => ["a", "b"]}
        getItemKey={(item) => item}
        ariaLabel="组"
        renderRow={ItemRow}
        {...opsListBindings({
          features: ["select"],
          selectedKey: () => "a",
          onSelectRow: () => undefined,
        })}
      />
    ));
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("role")).toBe("listbox");
  });
});
