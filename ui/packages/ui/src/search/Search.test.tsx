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
    expect(screen.getByRole("button", { name: "搜索命令" }).getAttribute("data-pressed")).toBe("");
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
    expect(css).not.toContain(".yohu-icon");
  });

  it("查询非空只判一次", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const policy = readFileSync(resolve(dir, "search-policy.ts"), "utf8").replace(
      'return (value ?? "").length > 0',
      "",
    );
    const view = readFileSync(resolve(dir, "Search.tsx"), "utf8");
    for (const [name, body] of [
      ["search-policy.ts", policy],
      ["Search.tsx", view],
    ] as const) {
      expect(body, name).not.toContain('(value ?? "").length > 0');
      expect(body, name).not.toContain("value.length > 0");
    }
  });

  it("当前检索文本只写一处", () => {
    const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Search.tsx"), "utf8");
    const needle = "props.value ?? inputEl?.value " + "?? \"\"";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("props.onSubmit?.(fieldValue())");
    expect(view).toContain("const value = fieldValue()");
    expect(view).toContain('props.title ?? ""');
    expect(view).toContain('props.value ?? ""');
  });
});

describe("搜索读事件文本", () => {
  it("两处从事件读当前文本", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Search.tsx"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("event.currentTarget as " + "HTMLInputElement")).toBe(1);
    expect(times("function searchEventValue")).toBe(1);
    expect(times("export function searchEventValue")).toBe(0);
    expect(times("searchEventValue(event)")).toBe(2);
    expect(times("emit(searchEventValue(event), event)")).toBe(1);
    expect(times("event as InputEvent")).toBe(1);
    expect(src).toContain("const fieldValue");
  });
});

function searchSource(): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Search.tsx"), "utf8");
}

describe("搜索禁用", () => {
  it("清空、开关和三处宿主都问同一把禁用", () => {
    const src = searchSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("host()." + "disabled")).toBe(1);
    expect(times("function searchDisabled")).toBe(1);
    expect(times("export function searchDisabled")).toBe(0);
    expect(times("searchDisabled()")).toBe(6);
    expect(times("if (searchDisabled()) return")).toBe(2);
    expect(times("disabled={searchDisabled()}")).toBe(3);
  });
});

describe("搜索展开", () => {
  it("栏、入口和折叠都问同一把展开", () => {
    const src = searchSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('flagIsOn(host()["' + 'data-open"])')).toBe(1);
    expect(times("function searchOpened")).toBe(1);
    expect(times("export function searchOpened")).toBe(0);
    expect(times("searchOpened()")).toBe(5);
  });
});

describe("搜索栏槽", () => {
  it("聚焦和绘制都问栏在不在", () => {
    const src = searchSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("searchShowsBar(" + "slot())")).toBe(1);
    expect(times("function searchBarOn")).toBe(1);
    expect(times("export function searchBarOn")).toBe(0);
    expect(times("searchBarOn()")).toBe(3);
  });
});

describe("搜索缺省名", () => {
  it("入口和输入框都用同一句搜索", () => {
    const src = searchSource();
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('?? "' + '搜索"')).toBe(0);
    expect(times('return "' + '搜索"')).toBe(1);
    expect(times("function searchFallbackName")).toBe(1);
    expect(times("export function searchFallbackName")).toBe(0);
    expect(times("searchFallbackName()")).toBe(3);
    expect(times("props.title ?? props.ariaLabel ?? searchFallbackName()")).toBe(1);
    expect(times("props.ariaLabel ?? props.title ?? searchFallbackName()")).toBe(1);
  });
});
