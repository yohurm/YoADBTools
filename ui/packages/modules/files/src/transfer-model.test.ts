import { describe, expect, it } from "vitest";

import {
  applyProgressToJob,
  createTransferJob,
  isTerminalTransfer,
  resolveJobName,
  shouldAcceptProgress,
  transferFallbackName,
  transferFaultText,
  transferIndeterminate,
  transferLabel,
  transferPercent,
  transferToastDetail,
  transferToastLeading,
  transferToastProgress,
  transferToastTone,
  transferTone,
} from "./transfer-model";

describe("shouldAcceptProgress", () => {
  it("无现态时接受 running / 终态", () => {
    expect(shouldAcceptProgress(undefined, "running")).toBe(true);
    expect(shouldAcceptProgress(undefined, "done")).toBe(true);
    expect(shouldAcceptProgress(undefined, "failed")).toBe(true);
  });

  it("running 可被进度或终态更新", () => {
    expect(shouldAcceptProgress("running", "running")).toBe(true);
    expect(shouldAcceptProgress("running", "done")).toBe(true);
    expect(shouldAcceptProgress("running", "cancelled")).toBe(true);
    expect(shouldAcceptProgress("running", "failed")).toBe(true);
  });

  it("终态之后拒绝迟到的 running", () => {
    expect(shouldAcceptProgress("done", "running")).toBe(false);
    expect(shouldAcceptProgress("failed", "running")).toBe(false);
    expect(shouldAcceptProgress("cancelled", "running")).toBe(false);
  });

  it("终态可被同卡后续终态覆盖", () => {
    expect(shouldAcceptProgress("done", "failed")).toBe(true);
    expect(shouldAcceptProgress("cancelled", "cancelled")).toBe(true);
  });
});

describe("isTerminalTransfer", () => {
  it("仅 running 非终态", () => {
    expect(isTerminalTransfer("running")).toBe(false);
    expect(isTerminalTransfer("done")).toBe(true);
  });
});

describe("transferPercent / indeterminate", () => {
  it("无总量不定态", () => {
    expect(transferPercent(10, undefined)).toBeUndefined();
    expect(transferIndeterminate("running", undefined)).toBe(true);
    expect(transferIndeterminate("done", undefined)).toBe(false);
  });

  it("有总量夹到 0–100", () => {
    expect(transferPercent(50, 200)).toBe(25);
    expect(transferPercent(300, 200)).toBe(100);
    expect(transferIndeterminate("running", 200)).toBe(false);
  });
});

describe("transferTone / label / name", () => {
  it("态 → 色与文案", () => {
    expect(transferTone("done")).toBe("success");
    expect(transferTone("failed")).toBe("danger");
    expect(transferLabel("cancelled")).toBe("已取消");
  });

  it("回退名", () => {
    expect(transferFallbackName("push", 3)).toBe("上传 #3");
  });

  it("作业名：进度名优先，其次已有名，最后回退", () => {
    expect(resolveJobName("a.bin", "旧名", "上传 #1")).toBe("a.bin");
    expect(resolveJobName("  ", "旧名", "上传 #1")).toBe("旧名");
    expect(resolveJobName(undefined, undefined, "上传 #1")).toBe("上传 #1");
  });

  it("发号即出生；进度只补字节，不把已有名打成回退", () => {
    const job = createTransferJob({ id: 4, direction: "push", name: "shot.png" });
    expect(job).toMatchObject({ id: 4, name: "shot.png", bytes: 0, state: "running" });
    const next = applyProgressToJob(job, {
      id: 4,
      direction: "push",
      bytes: 10,
      total: 20,
      state: "running",
    });
    expect(next.name).toBe("shot.png");
    expect(next.bytes).toBe(10);
    expect(next.total).toBe(20);
    expect(next).not.toHaveProperty("message");
  });

  it("失败只拷观测字节与 fault，不发明字节、无 message", () => {
    const job = createTransferJob({ id: 4, direction: "pull", name: "a.bin", total: 99 });
    const next = applyProgressToJob(job, {
      id: 4,
      direction: "pull",
      bytes: 0,
      total: 99,
      state: "failed",
      fault: { kind: "remote_not_found", path: "/sdcard/a.bin" },
    });
    expect(next.bytes).toBe(0);
    expect(next.total).toBe(99);
    expect(next.state).toBe("failed");
    expect(next.fault).toEqual({ kind: "remote_not_found", path: "/sdcard/a.bin" });
    expect(next).not.toHaveProperty("message");
    expect(transferFaultText(next.fault)).toBe("远端不存在: /sdcard/a.bin");
  });
});

describe("transferFaultText", () => {
  it("缺省空串；分类+路径；运输无句子", () => {
    expect(transferFaultText(undefined)).toBe("");
    expect(transferFaultText({ kind: "local", path: "C:/tmp/a.bin" })).toBe("本地操作失败: C:/tmp/a.bin");
    expect(transferFaultText({ kind: "device_offline", serial: "S1" })).toBe("设备掉线: S1");
    expect(transferFaultText({ kind: "timeout" })).toBe("执行超时");
    expect(transferFaultText({ kind: "io" })).toBe("IO 错误");
    expect(transferFaultText({ kind: "tool_unavailable" })).toBe("ADB 不可用");
    expect(transferFaultText({ kind: "progress_join" })).toBe("传输进度任务已中断");
    expect(transferFaultText({ kind: "remote_not_found", path: "/sdcard/a" })).not.toContain(
      "没有这个目录",
    );
  });
});

describe("传输 toast 快照", () => {
  it("方向图标、失败文案、运行中才带进度", () => {
    expect(transferToastLeading("push")).toBe("arrow-up");
    expect(transferToastLeading("pull")).toBe("arrow-down");
    expect(transferToastTone("done")).toBe("success");
    expect(transferToastTone("failed")).toBe("error");
    expect(transferToastTone("running")).toBe("info");
    const running = createTransferJob({ id: 1, direction: "push", name: "shot.png", total: 100 });
    expect(transferToastDetail(running)).toBe("传输中");
    expect(transferToastProgress(running)).toEqual({ value: 0, indeterminate: false });
    const failed = applyProgressToJob(running, {
      id: 1,
      direction: "push",
      bytes: 0,
      total: 100,
      state: "failed",
      fault: { kind: "remote_not_found", path: "/sdcard/shot.png" },
    });
    expect(transferToastDetail(failed)).toBe("远端不存在: /sdcard/shot.png");
    expect(transferToastProgress(failed)).toBeUndefined();
  });
});
