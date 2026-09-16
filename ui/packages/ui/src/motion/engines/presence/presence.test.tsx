import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoPresence } from "./index";

describe("YoPresence", () => {
  it("when 从 false 到 true 同拍挂载，data-state=open", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <YoPresence when={open()} recipe="dialog">
        <div role="dialog">面板</div>
      </YoPresence>
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
    setOpen(true);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector(".yohu-presence")?.getAttribute("data-state")).toBe("open");
  });

  it("when=true 渲染子节点并带 data-state=open", () => {
    render(() => (
      <YoPresence when recipe="dialog">
        <div role="dialog">面板</div>
      </YoPresence>
    ));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const host = document.querySelector(".yohu-presence");
    expect(host?.getAttribute("data-state")).toBe("open");
    expect(host?.getAttribute("data-recipe")).toBe("dialog");
  });

  it("when=false 在测试环境立刻卸载（skip motion）", () => {
    const [open, setOpen] = createSignal(true);
    const onExitComplete = vi.fn();
    render(() => (
      <YoPresence when={open()} recipe="fade" onExitComplete={onExitComplete}>
        <div>内容</div>
      </YoPresence>
    ));
    expect(screen.getByText("内容")).toBeTruthy();
    setOpen(false);
    expect(screen.queryByText("内容")).toBeNull();
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("recipe=chip 用 clip 包一层，横向配方", () => {
    render(() => (
      <YoPresence when recipe="chip">
        <span>HfLooper</span>
      </YoPresence>
    ));
    const host = document.querySelector(".yohu-presence");
    expect(host?.getAttribute("data-recipe")).toBe("chip");
    expect(host?.querySelector(".yohu-presence__clip")?.textContent).toBe("HfLooper");
  });

  it("recipe=list 用 clip 包一层，skip motion 时直接 open", () => {
    render(() => (
      <YoPresence when recipe="list">
        <div>行</div>
      </YoPresence>
    ));
    const host = document.querySelector(".yohu-presence");
    expect(host?.getAttribute("data-recipe")).toBe("list");
    expect(host?.getAttribute("data-state")).toBe("open");
    expect(host?.querySelector(".yohu-presence__clip")?.textContent).toBe("行");
  });

  it("first 写成宿主 data-first", () => {
    render(() => (
      <YoPresence when recipe="list" first>
        <div>行</div>
      </YoPresence>
    ));
    expect(document.querySelector(".yohu-presence")?.hasAttribute("data-first")).toBe(true);
  });

  it("未标 first 不写 data-first", () => {
    render(() => (
      <YoPresence when recipe="list">
        <div>行</div>
      </YoPresence>
    ));
    expect(document.querySelector(".yohu-presence")?.hasAttribute("data-first")).toBe(false);
  });
});
