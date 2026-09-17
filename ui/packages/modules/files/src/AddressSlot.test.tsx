import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { AddressSlot, type AddressSlotApi } from "./AddressSlot";
import { listingStore } from "./listing";

async function nextFrames(count = 4): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function hit(): HTMLElement {
  return screen.getByRole("button", { name: "输入路径" });
}

function fieldHost(): HTMLElement | null {
  return document.querySelector('[data-address="field"]');
}

describe("AddressSlot", () => {
  it("浏览态没有输入；点槽内热区才挂上同一格输入", () => {
    render(() => <AddressSlot />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(fieldHost()).toBeNull();
    const zone = hit();
    expect(zone).toBeTruthy();
    fireEvent.pointerDown(zone, { button: 0 });
    fireEvent.click(zone);
    expect(fieldHost()).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("指针打开：mouseup 前不 focus，松开后光标在末尾不预选", async () => {
    render(() => <AddressSlot />);
    const zone = hit();
    fireEvent.pointerDown(zone, { button: 0 });
    fireEvent.click(zone);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(fieldHost()?.hasAttribute("data-gate")).toBe(true);
    fireEvent.pointerUp(document);
    await nextFrames();
    expect(input.value.length).toBeGreaterThan(0);
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it("Esc 倒放 clip：data-reveal 回到 0，输入仍在同一格", async () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(hit());
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    const field = fieldHost();
    expect(field).toBeTruthy();
    expect(field!.dataset.reveal).toBe("0");
  });

  it("点分段不打开输入", () => {
    render(() => <AddressSlot />);
    const crumb = document.querySelector('[data-address="crumb"]');
    expect(crumb).toBeTruthy();
    fireEvent.click(crumb!);
    expect(fieldHost()).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("点面包屑铬内空白打开输入；路径行盒外不打开", () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(document.querySelector(".yohu-files__path")!);
    expect(fieldHost()).toBeNull();
    fireEvent.pointerDown(screen.getByLabelText("当前路径"));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("点输入铬外取消", async () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(hit());
    fireEvent.pointerUp(document);
    await nextFrames();
    expect(fieldHost()?.getAttribute("data-reveal")).toBe("1");
    fireEvent.pointerDown(document.body);
    expect(fieldHost()?.getAttribute("data-reveal")).toBe("0");
  });

  it("点上级钮不打开输入", () => {
    render(() => <AddressSlot />);
    fireEvent.click(document.querySelector("[data-address='up'] button")!);
    expect(fieldHost()).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("输入不写 inline width", async () => {
    render(() => <AddressSlot />);
    const zone = hit();
    fireEvent.pointerDown(zone);
    fireEvent.click(zone);
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.input(input, { target: { value: `${input.value}${"/seg".repeat(40)}` } });
    expect(input.style.width).toBe("");
  });

  it("Enter 只打一次 goTo，参数是原文", async () => {
    const goTo = vi.spyOn(listingStore, "goTo").mockResolvedValue(false);
    render(() => <AddressSlot />);
    fireEvent.pointerDown(hit());
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.value = "/sdcard/../data/x";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledWith("/sdcard/../data/x");
    goTo.mockRestore();
  });

  it("api.open 打开同一格输入", () => {
    let api: AddressSlotApi | undefined;
    render(() => <AddressSlot api={(slot) => { api = slot; }} />);
    expect(api).toBeTruthy();
    api!.open();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
