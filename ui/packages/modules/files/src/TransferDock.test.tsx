import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { transferFaultText, type TransferJob } from "./transfer-model";

const state = vi.hoisted(() => ({
  transfers: [] as TransferJob[],
  transfersOpen: true,
}));

vi.mock("./transfers", () => ({
  transferStore: {
    get transfers() {
      return state.transfers;
    },
    ui: {
      get transfersOpen() {
        return state.transfersOpen;
      },
    },
    toggleTransfers() {
      state.transfersOpen = !state.transfersOpen;
    },
    cancel: async () => {},
  },
}));

import { TransferDock } from "./TransferDock";
import { transferStore } from "./transfers";

afterEach(() => {
  state.transfers = [];
  state.transfersOpen = true;
});

describe("TransferDock", () => {
  it("无任务时 Presence 不挂载进度框", () => {
    render(() => <TransferDock />);
    expect(document.querySelector(".yohu-files__transfer-bar")).toBeNull();
    expect(document.querySelector(".yohu-collapse")).toBeNull();
  });

  it("toggleTransfers 仍翻转 store", () => {
    const start = transferStore.ui.transfersOpen;
    transferStore.toggleTransfers();
    expect(transferStore.ui.transfersOpen).toBe(!start);
    transferStore.toggleTransfers();
    expect(transferStore.ui.transfersOpen).toBe(start);
  });

  it("失败行只渲染 transferFaultText(job.fault)", () => {
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
    render(() => <TransferDock />);
    const msg = document.querySelector(".yohu-files__transfer-msg");
    expect(msg?.textContent).toBe(transferFaultText(job.fault));
    expect(msg?.textContent).toBe("远端不存在: /sdcard/a.bin");
    expect(msg?.textContent).not.toContain("没有这个目录");
    expect(document.body.textContent).not.toContain("message");
  });
});
