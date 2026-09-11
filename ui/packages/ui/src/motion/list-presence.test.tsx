import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { firstPresentSlotKey } from "./list-presence-model";
import { listPresenceHostAttrs } from "./list-presence-policy";
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

  it("卸掉首项后 data-first 落到新的第一项", () => {
    const [items, setItems] = createSignal([
      { id: 1, text: "first" },
      { id: 2, text: "second" },
    ]);
    render(() => (
      <YoListPresence each={items()} key={(item) => item.id} exit={false}>
        {(item) => <div>{item.text}</div>}
      </YoListPresence>
    ));
    setItems([{ id: 2, text: "second" }]);
    const hosts = document.querySelectorAll(".yohu-presence");
    expect(hosts.length).toBe(1);
    expect(hosts[0]?.hasAttribute("data-first")).toBe(true);
    expect(screen.getByText("second")).toBeTruthy();
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

  it("当前可见第一项写 data-first，其余不写", () => {
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
    const hosts = document.querySelectorAll(".yohu-presence");
    expect(hosts[0]?.hasAttribute("data-first")).toBe(true);
    expect(hosts[1]?.hasAttribute("data-first")).toBe(false);
  });

  it("第一个 present slot 含出场中的项", () => {
    expect(
      firstPresentSlotKey([
        { key: "a", item: 1, present: false },
        { key: "b", item: 2, present: true },
      ]),
    ).toBe("a");
    expect(listPresenceHostAttrs("a", "a").first).toBe(true);
    expect(listPresenceHostAttrs("a", "b").first).toBe(false);
    expect(firstPresentSlotKey([])).toBeUndefined();
  });
});
