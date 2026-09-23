import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { YoSearch } from "./Search";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Search.css"), "utf8");

describe("YoSearch", () => {
  it("栏是 search 地标，左图标右清除", () => {
    const [value, setValue] = createSignal("adb");
    render(() => (
      <YoSearch ariaLabel="搜索命令" placeholder="搜索命令" value={value()} onInput={setValue} />
    ));
    const input = screen.getByRole("searchbox", { name: "搜索命令" }) as HTMLInputElement;
    expect(input.type).toBe("search");
    expect(input.closest("[role='search']")).toBeTruthy();
    expect(input.closest(".yohu-search")?.querySelector("[data-icon='search']")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清除" }).classList.contains("yohu-recipe-clear")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(value()).toBe("");
  });

  it("Enter 提交，Esc 先清再关", () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    const [value, setValue] = createSignal("ping");
    render(() => (
      <YoSearch
        ariaLabel="检索"
        value={value()}
        onInput={setValue}
        onSubmit={onSubmit}
        collapsible
        open
        onOpenChange={onOpenChange}
      />
    ));
    const input = screen.getByRole("searchbox", { name: "检索" });
    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith("ping");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(value()).toBe("");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("入口钮切换折叠，栏在 Collapse 里", () => {
    const onOpenChange = vi.fn();
    render(() => (
      <YoSearch
        id="lib-search"
        slot="entry"
        collapsible
        open={false}
        onOpenChange={onOpenChange}
        title="搜索命令"
      />
    ));
    const entry = screen.getByRole("button", { name: "搜索命令" });
    expect(entry.getAttribute("aria-expanded")).toBe("false");
    expect(entry.getAttribute("aria-controls")).toBe("lib-search");
    fireEvent.click(entry);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("收起后仍有查询时入口保持按下", () => {
    render(() => <YoSearch slot="entry" collapsible open={false} value="ping" title="搜索命令" />);
    expect(screen.getByRole("button", { name: "搜索命令" }).getAttribute("data-pressed")).toBe("true");
  });

  it("error 写 aria-invalid，禁用无清除", () => {
    render(() => <YoSearch ariaLabel="包名" value="x" status="error" disabled />);
    const input = screen.getByRole("searchbox", { name: "包名" }) as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("铬走 token，禁止硬编码色值", () => {
    expect(css).toContain("var(--yohu-comp-gray)");
    expect(css).toContain("var(--yohu-control-height)");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).not.toContain(".yohu-search__clear");
  });
});
