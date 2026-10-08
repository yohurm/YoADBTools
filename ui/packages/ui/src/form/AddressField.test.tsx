import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { YoAddressField, type YoAddressFieldApi } from "./AddressField";
import { addressCrumbPath, addressOpenCaret } from "./address-field-model";

function load(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

async function nextFrames(count = 4): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => resolveFrame());
    });
  }
}

const SEGMENTS = ["sdcard", "DCIM"];

describe("YoAddressField", () => {
  it("浏览态没有输入；点槽内热区才挂上同一格输入", () => {
    render(() => (
      <YoAddressField
        path="/sdcard/DCIM"
        segments={SEGMENTS}
        onNavigate={() => undefined}
        onCommit={async () => true}
      />
    ));
    expect(document.querySelector(".yohu-address__field")).toBeNull();
    const hit = document.querySelector(".yohu-address__hit");
    expect(hit).toBeTruthy();
    fireEvent.pointerDown(hit!, { button: 0 });
    fireEvent.click(hit!);
    expect(document.querySelector(".yohu-address__field")).toBeTruthy();
    expect(document.querySelector(".yohu-address__field-input")).toBeTruthy();
  });

  it("指针打开：mouseup 前不 focus，松开后光标在末尾不预选", async () => {
    render(() => (
      <YoAddressField
        path="/sdcard/DCIM"
        segments={SEGMENTS}
        onNavigate={() => undefined}
        onCommit={async () => true}
      />
    ));
    const hit = document.querySelector(".yohu-address__hit")!;
    fireEvent.pointerDown(hit, { button: 0 });
    fireEvent.click(hit);
    const input = document.querySelector(".yohu-address__field-input") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(document.querySelector(".yohu-address__field")?.hasAttribute("data-gate")).toBe(true);
    fireEvent.pointerUp(document);
    await nextFrames();
    expect(input!.selectionStart).toBe(input!.value.length);
    expect(input!.selectionEnd).toBe(input!.value.length);
  });

  it("点分段不打开输入", () => {
    const onNavigate = vi.fn();
    render(() => (
      <YoAddressField
        path="/sdcard/DCIM"
        segments={SEGMENTS}
        onNavigate={onNavigate}
        onCommit={async () => true}
      />
    ));
    fireEvent.click(document.querySelector(".yohu-address__crumb")!);
    expect(document.querySelector(".yohu-address__field")).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith("/sdcard");
  });

  it("Enter 只打一次 onCommit，参数是原文", async () => {
    const onCommit = vi.fn(async () => false);
    render(() => (
      <YoAddressField
        path="/sdcard"
        segments={["sdcard"]}
        onNavigate={() => undefined}
        onCommit={onCommit}
      />
    ));
    fireEvent.pointerDown(document.querySelector(".yohu-address__hit")!);
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = document.querySelector(".yohu-address__field-input") as HTMLInputElement;
    input.value = "/sdcard/../data/x";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("/sdcard/../data/x");
  });

  it("api.open 打开同一格输入", () => {
    let api: YoAddressFieldApi | undefined;
    render(() => (
      <YoAddressField
        path="/sdcard"
        segments={["sdcard"]}
        onNavigate={() => undefined}
        onCommit={async () => true}
        api={(slot) => {
          api = slot;
        }}
      />
    ));
    api!.open();
    expect(document.querySelector(".yohu-address__field-input")).toBeTruthy();
  });

  it("铬 hug，不铺满、不套 YoTextField", () => {
    const css = load("src/form/AddressField.css");
    expect(css).toMatch(/\.yohu-address\s*\{[^}]*width:\s*max-content/);
    expect(css).toMatch(/\.yohu-address\s*\{[^}]*flex:\s*0 1 auto/);
    expect(css).toMatch(/\.yohu-address__crumbs\[inert\]\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.yohu-address__field\[data-gate\]\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toContain("clip-path: inset(0 100% 0 0)");
    expect(css).toContain("field-sizing: content");
    expect(css).not.toContain("yohu-text-field");
    expect(css).not.toContain("yohu-corner__content");
    expect(css).not.toContain("data-mode");
    expect(css).not.toContain("__content");
    expect(css).toMatch(/\.yohu-address__field-chrome\s*\{[^}]*height:\s*100%/);
    expect(css).not.toMatch(/overflow-x:/);
    expect(css).not.toMatch(/overflow-y:/);
    const tsx = load("src/form/AddressField.tsx");
    expect(tsx).toMatch(/flex="hug"/);
    expect(tsx).not.toContain("data-mode");
    expect(tsx).not.toContain("yohu-corner__content");
    expect(addressOpenCaret("/a")).toEqual({ start: 2, end: 2 });
    expect(addressCrumbPath(["sdcard", "DCIM"], 1)).toBe("/sdcard/DCIM");
  });

  it("指针门的松开与取消共用一对登记", () => {
    const tsx = load("src/form/AddressField.tsx");
    const times = (needle: string): number => tsx.split(needle).length - 1;
    expect(times("add" + "EventListener")).toBe(1);
    expect(times("remove" + "EventListener")).toBe(1);
    expect(times("addEventListener(\"pointer" + "up\"")).toBe(0);
    expect(times("addEventListener(\"pointer" + "cancel\"")).toBe(0);
    expect(times("removeEventListener(\"pointer" + "up\"")).toBe(0);
    expect(times("removeEventListener(\"pointer" + "cancel\"")).toBe(0);
    expect(tsx).toContain('listen("pointerup", release)');
    expect(tsx).toContain('listen("pointercancel", release)');
    expect(tsx).toContain('listen("pointerdown", onPointerDown)');
  });
});

describe("地址栏编辑被挡", () => {
  it("条件只留在函数体，聚焦与外部按下仍分开", () => {
    const tsx = load("src/form/AddressField.tsx");
    const times = (needle: string): number => tsx.split(needle).length - 1;
    expect(times("!open() || " + "pointerGate()")).toBe(1);
    expect(times("function addressEditBlocked")).toBe(1);
    expect(times("export function addressEditBlocked")).toBe(0);
    expect(times("addressEditBlocked()")).toBe(3);
    expect(tsx).toContain("requestAnimationFrame");
    expect(tsx).toContain('listen("pointerdown"');
  });
});
