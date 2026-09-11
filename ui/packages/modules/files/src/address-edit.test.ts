import { describe, expect, it } from "vitest";

import {
  addressClickKind,
  addressDismissOutside,
  addressOpenCaret,
  addressScrollPin,
  isAddressVacantClick,
} from "./address-edit";

function el(tag: string, attrs: Record<string, string> = {}, children: HTMLElement[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.appendChild(child);
  return node;
}

function pathTree(): {
  path: HTMLElement;
  up: HTMLElement;
  crumb: HTMLElement;
  sep: HTMLElement;
  hit: HTMLElement;
  field: HTMLElement;
  pad: HTMLElement;
} {
  const upBtn = el("button", { "aria-label": "上级目录" });
  const up = el("span", { "data-address": "up" }, [upBtn]);
  const crumb = el("button", { "data-address": "crumb", class: "yohu-files__crumb" });
  const sep = el("span", { class: "yohu-files__crumb-sep" });
  const hit = el("button", { "data-address": "hit", class: "yohu-files__slot-hit" });
  const crumbs = el("nav", { class: "yohu-files__crumbs" }, [crumb, sep, hit]);
  const input = el("input", { class: "yohu-files__field-input" });
  const field = el("div", { "data-address": "field", class: "yohu-files__field" }, [input]);
  const slot = el("div", { class: "yohu-files__slot", "data-address": "slot" }, [crumbs, field]);
  const pad = el("div", { class: "yohu-files__path-pad" });
  const path = el("div", { class: "yohu-files__path" }, [up, slot, pad]);
  return { path, up: upBtn, crumb, sep, hit, field, pad };
}

describe("addressClickKind", () => {
  it("分段是 crumb，铬内空白/分隔/热区是 vacant，行垫与上级与输入不是", () => {
    const tree = pathTree();
    expect(addressClickKind(tree.crumb, tree.path)).toBe("crumb");
    expect(addressClickKind(tree.sep, tree.path)).toBe("vacant");
    expect(addressClickKind(tree.hit, tree.path)).toBe("vacant");
    expect(addressClickKind(tree.pad, tree.path)).toBeNull();
    expect(addressClickKind(tree.up, tree.path)).toBe("up");
    expect(addressClickKind(tree.field, tree.path)).toBe("field");
    expect(addressClickKind(tree.field.firstElementChild, tree.path)).toBe("field");
    expect(addressClickKind(tree.path, tree.path)).toBeNull();
    expect(addressClickKind(tree.crumb, null)).toBeNull();
    expect(addressClickKind(null, tree.path)).toBeNull();
  });

  it("展开光标在末尾，不预选", () => {
    const path = "/sdcard/DCIM";
    expect(addressOpenCaret(path)).toEqual({ start: path.length, end: path.length });
    expect(addressOpenCaret("")).toEqual({ start: 0, end: 0 });
  });

  it("槽滚动：开头或全选看头，光标在末尾看尾", () => {
    expect(addressScrollPin({ start: 0, end: 0 }, 12)).toBe("start");
    expect(addressScrollPin({ start: 0, end: 12 }, 12)).toBe("start");
    expect(addressScrollPin({ start: 12, end: 12 }, 12)).toBe("end");
    expect(addressScrollPin({ start: 3, end: 3 }, 12)).toBe("keep");
    expect(addressScrollPin({ start: 2, end: 5 }, 12)).toBe("keep");
  });

  it("取消只看输入铬，槽剩余不是路径栏", () => {
    const tree = pathTree();
    expect(addressDismissOutside(tree.pad, tree.field)).toBe(true);
    expect(addressDismissOutside(tree.hit, tree.field)).toBe(true);
    expect(addressDismissOutside(tree.field, tree.field)).toBe(false);
    expect(addressDismissOutside(tree.field.firstElementChild, tree.field)).toBe(false);
    expect(addressDismissOutside(tree.pad, null)).toBe(false);
  });

  it("只有 vacant 打开输入", () => {
    const tree = pathTree();
    expect(isAddressVacantClick(tree.sep, tree.path)).toBe(true);
    expect(isAddressVacantClick(tree.hit, tree.path)).toBe(true);
    expect(isAddressVacantClick(tree.crumb, tree.path)).toBe(false);
    expect(isAddressVacantClick(tree.up, tree.path)).toBe(false);
    expect(isAddressVacantClick(tree.field, tree.path)).toBe(false);
  });
});
