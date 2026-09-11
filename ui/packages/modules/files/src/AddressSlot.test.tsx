import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { AddressSlot, type AddressSlotApi } from "./AddressSlot";

async function nextFrames(count = 4): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

describe("AddressSlot", () => {
  it("浏览态没有输入；点槽内热区才挂上同一格输入", () => {
    render(() => <AddressSlot />);
    expect(document.querySelector(".yohu-files__field")).toBeNull();
    const hit = document.querySelector(".yohu-files__slot-hit");
    expect(hit).toBeTruthy();
    fireEvent.pointerDown(hit!, { button: 0 });
    fireEvent.click(hit!);
    expect(document.querySelector(".yohu-files__field")).toBeTruthy();
    expect(document.querySelector(".yohu-files__field-input")).toBeTruthy();
  });

  it("指针打开：mouseup 前不 focus，松开后光标在末尾不预选", async () => {
    render(() => <AddressSlot />);
    const hit = document.querySelector(".yohu-files__slot-hit")!;
    fireEvent.pointerDown(hit, { button: 0 });
    fireEvent.click(hit);
    const input = document.querySelector(".yohu-files__field-input") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(document.querySelector(".yohu-files__field")?.hasAttribute("data-gate")).toBe(true);
    fireEvent.pointerUp(document);
    await nextFrames();
    expect(input!.value.length).toBeGreaterThan(0);
    expect(input!.selectionStart).toBe(input!.value.length);
    expect(input!.selectionEnd).toBe(input!.value.length);
    expect(input!.selectionStart).toBe(input!.selectionEnd);
  });

  it("Esc 倒放 clip：data-reveal 回到 0，输入仍在同一格", async () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(document.querySelector(".yohu-files__slot-hit")!);
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = document.querySelector(".yohu-files__field-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    const field = document.querySelector(".yohu-files__field") as HTMLElement | null;
    expect(field).toBeTruthy();
    expect(field!.dataset.reveal).toBe("0");
  });

  it("点分段不打开输入", () => {
    render(() => <AddressSlot />);
    const crumb = document.querySelector(".yohu-files__crumb");
    expect(crumb).toBeTruthy();
    fireEvent.click(crumb!);
    expect(document.querySelector(".yohu-files__field")).toBeNull();
  });

  it("点面包屑铬内空白打开输入；路径行盒外不打开", () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(document.querySelector(".yohu-files__path")!);
    expect(document.querySelector(".yohu-files__field")).toBeNull();
    fireEvent.pointerDown(document.querySelector(".yohu-files__crumbs")!);
    expect(document.querySelector(".yohu-files__field-input")).toBeTruthy();
  });

  it("点输入铬外取消", async () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(document.querySelector(".yohu-files__slot-hit")!);
    fireEvent.pointerUp(document);
    await nextFrames();
    expect(document.querySelector(".yohu-files__field")?.getAttribute("data-reveal")).toBe("1");
    fireEvent.pointerDown(document.body);
    expect(document.querySelector(".yohu-files__field")?.getAttribute("data-reveal")).toBe("0");
  });

  it("点上级钮不打开输入", () => {
    render(() => <AddressSlot />);
    fireEvent.click(document.querySelector("[data-address='up'] button")!);
    expect(document.querySelector(".yohu-files__field")).toBeNull();
  });

  it("输入不写 inline width", async () => {
    render(() => <AddressSlot />);
    fireEvent.pointerDown(document.querySelector(".yohu-files__slot-hit")!);
    fireEvent.click(document.querySelector(".yohu-files__slot-hit")!);
    fireEvent.pointerUp(document);
    await nextFrames();
    const input = document.querySelector(".yohu-files__field-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: `${input.value}${"/seg".repeat(40)}` } });
    expect(input.style.width).toBe("");
  });

  it("api.open 打开同一格输入", () => {
    let api: AddressSlotApi | undefined;
    render(() => <AddressSlot api={(slot) => { api = slot; }} />);
    expect(api).toBeTruthy();
    api!.open();
    expect(document.querySelector(".yohu-files__field-input")).toBeTruthy();
  });
});
