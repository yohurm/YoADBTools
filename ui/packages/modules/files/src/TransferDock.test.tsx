import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { transferFaultText, type TransferJob } from "./transfer-model";

function loadTransferDock(): string {
  const candidates = [
    resolve(process.cwd(), "src/TransferDock.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/TransferDock.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

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

  it("方向图标无原生 title，文件名不进气泡锚", () => {
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
    render(() => <TransferDock />);
    const dir = document.querySelector(".yohu-files__transfer-dir");
    expect(dir).not.toBeNull();
    expect(dir?.getAttribute("title")).toBeNull();
    expect(dir?.getAttribute("tabindex")).toBe("0");
    const name = document.querySelector(".yohu-files__transfer-name");
    expect(name?.textContent).toBe("shot.bin");
    const src = loadTransferDock();
    const tooltip = src.match(/<YoTooltip[\s\S]*?<\/YoTooltip>/)?.[0] ?? "";
    expect(tooltip).toContain("yohu-files__transfer-dir");
    expect(tooltip).not.toContain("yohu-files__transfer-name");
    expect(src.indexOf("yohu-files__transfer-name")).toBeGreaterThan(src.indexOf("</YoTooltip>"));
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
