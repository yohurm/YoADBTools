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
    fireEvent.click(hit!);
    expect(document.querySelector(".yohu-files__field")).toBeTruthy();
    expect(document.querySelector(".yohu-files__field-input")).toBeTruthy();
  });

  it("展开后全选当前路径", async () => {
    render(() => <AddressSlot />);
    fireEvent.click(document.querySelector(".yohu-files__slot-hit")!);
    await nextFrames();
    const input = document.querySelector(".yohu-files__field-input") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input!.value.length).toBeGreaterThan(0);
    expect(input!.selectionStart).toBe(0);
    expect(input!.selectionEnd).toBe(input!.value.length);
  });

  it("Esc 倒放 clip：data-reveal 回到 0，输入仍在同一格", async () => {
    render(() => <AddressSlot />);
    fireEvent.click(document.querySelector(".yohu-files__slot-hit")!);
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

  it("输入不写 inline width", async () => {
    render(() => <AddressSlot />);
    fireEvent.click(document.querySelector(".yohu-files__slot-hit")!);
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
