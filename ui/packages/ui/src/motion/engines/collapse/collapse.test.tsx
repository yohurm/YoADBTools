import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoCollapse } from "./collapse";

describe("YoCollapse", () => {
  it("data-open 跟随 open，子节点始终挂载", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <YoCollapse open={open()}>
        <div>折叠内容</div>
      </YoCollapse>
    ));
    const root = document.querySelector(".yohu-collapse");
    expect(root?.getAttribute("data-open")).toBe("false");
    expect(root?.querySelector(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.querySelector(".yohu-collapse__content")?.textContent).toBe("折叠内容");
    setOpen(true);
    expect(root?.getAttribute("data-open")).toBe("true");
    expect(root?.querySelector(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByText("折叠内容")).toBeTruthy();
  });

  it("recipe=panel 写入 data-recipe", () => {
    render(() => (
      <YoCollapse open recipe="panel">
        <div>面板</div>
      </YoCollapse>
    ));
    expect(document.querySelector(".yohu-collapse")?.getAttribute("data-recipe")).toBe("panel");
  });

  it("recipe=fill 写入 data-recipe", () => {
    render(() => (
      <YoCollapse open={false} recipe="fill">
        <div>填满</div>
      </YoCollapse>
    ));
    const root = document.querySelector(".yohu-collapse");
    expect(root?.getAttribute("data-recipe")).toBe("fill");
    expect(root?.getAttribute("data-open")).toBe("false");
    expect(root?.querySelector(".yohu-collapse__inner")?.getAttribute("aria-hidden")).toBe("true");
  });
});
