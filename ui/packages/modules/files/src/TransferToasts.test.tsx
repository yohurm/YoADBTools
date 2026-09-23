import { render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YoToaster, createToaster } from "@yohu/ui";

import { transferFaultText, type TransferJob } from "./transfer-model";

const state = vi.hoisted(() => ({
  transfers: [] as TransferJob[],
}));

const dismiss = vi.hoisted(() => vi.fn((id: number) => {
  state.transfers = state.transfers.filter((job) => job.id !== id);
}));

vi.mock("./transfers", () => ({
  transferStore: {
    get transfers() {
      return state.transfers;
    },
    dismiss,
  },
}));

import { TransferToasts } from "./TransferToasts";

afterEach(() => {
  state.transfers = [];
  dismiss.mockClear();
});

describe("TransferToasts", () => {
  it("无任务时不画 toast", () => {
    const toaster = createToaster();
    render(() => (
      <>
        <TransferToasts toaster={toaster} />
        <YoToaster toaster={toaster} />
      </>
    ));
    expect(document.querySelector(".yohu-toast")).toBeNull();
  });

  it("运行中作业进 toast：文件名、方向、进度、常驻", () => {
    state.transfers = [
      {
        id: 1,
        direction: "push",
        name: "shot.bin",
        bytes: 10,
        total: 99,
        state: "running",
      },
    ];
    const toaster = createToaster();
    render(() => (
      <>
        <TransferToasts toaster={toaster} />
        <YoToaster toaster={toaster} />
      </>
    ));
    const toast = screen.getByText("shot.bin").closest(".yohu-toast");
    expect(toast?.getAttribute("data-leading")).toBe("");
    expect(toast?.getAttribute("data-progress")).toBe("");
    expect(toast?.getAttribute("data-sticky")).toBe("");
    expect(screen.getByText("传输中")).toBeTruthy();
    expect(toast?.querySelector(".yohu-recipe-dismiss")).toBeTruthy();
    expect(document.querySelector(".yohu-files__transfer-bar")).toBeNull();
  });

  it("失败明细走 transferFaultText，不写没有这个目录", () => {
    const job: TransferJob = {
      id: 8,
      direction: "pull",
      name: "a.bin",
      bytes: 0,
      total: 99,
      state: "failed",
      fault: { kind: "remote_not_found", path: "/sdcard/a.bin" },
    };
    state.transfers = [job];
    const toaster = createToaster();
    render(() => (
      <>
        <TransferToasts toaster={toaster} />
        <YoToaster toaster={toaster} />
      </>
    ));
    expect(screen.getByText(transferFaultText(job.fault))).toBeTruthy();
    expect(document.body.textContent).not.toContain("没有这个目录");
    expect(document.body.textContent).not.toContain("message");
  });
});
