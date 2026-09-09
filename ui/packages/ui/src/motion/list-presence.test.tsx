import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { YoListPresence } from "./list-presence";

describe("YoListPresence", () => {
  it("按 each 挂载项", () => {
    render(() => (
      <YoListPresence
        each={[
          { id: 1, text: "alpha" },
          { id: 2, text: "beta" },
        ]}
        key={(item) => item.id}
      >
        {(item) => <div>{item.text}</div>}
      </YoListPresence>
    ));
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(document.querySelectorAll('.yohu-presence[data-recipe="list"]').length).toBe(2);
  });

  it("追加后新项出现", () => {
    const [items, setItems] = createSignal([{ id: 1, text: "one" }]);
    render(() => (
      <YoListPresence each={items()} key={(item) => item.id}>
        {(item) => <div>{item.text}</div>}
      </YoListPresence>
    ));
    setItems((list) => [...list, { id: 2, text: "two" }]);
    expect(screen.getByText("two")).toBeTruthy();
  });

  it("测试环境移除立刻卸载（skip motion）", () => {
    const [items, setItems] = createSignal([
      { id: 1, text: "keep" },
      { id: 2, text: "drop" },
    ]);
    render(() => (
      <YoListPresence each={items()} key={(item) => item.id}>
        {(item) => <div>{item.text}</div>}
      </YoListPresence>
    ));
    setItems([{ id: 1, text: "keep" }]);
    expect(screen.getByText("keep")).toBeTruthy();
    expect(screen.queryByText("drop")).toBeNull();
  });

  it("exit=false 整表清空直切", () => {
    const [items, setItems] = createSignal([{ id: 1, text: "gone" }]);
    render(() => (
      <YoListPresence each={items()} key={(item) => item.id} exit={false}>
        {(item) => <div>{item.text}</div>}
      </YoListPresence>
    ));
    setItems([]);
    expect(screen.queryByText("gone")).toBeNull();
  });
});
