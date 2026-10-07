import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENTRY_NAME_EMPTY,
  CAPTURE_TRUNCATED,
  EXEC_TIMEOUT,
  PROGRESS_JOIN,
  PUMP_PANIC,
  SHELL_ENDED,
  SHELL_EXEC,
  SHELL_HANDSHAKE,
  SHELL_NO_STDIN,
  SHELL_NO_STDOUT,
  TOOL_UNAVAILABLE,
  invalidNameText,
  isTerminalTransfer,
  localFailedText,
  readlinkUnparseableText,
  remoteNotFoundText,
  transferIsDone,
  transferIsFailed,
  transferIsPush,
  transferIsRunning,
} from "@yohu/api";

import {
  applyProgressToJob,
  createTransferJob,
  resolveJobName,
  shouldAcceptProgress,
  transferFallbackName,
  transferFaultText,
  transferIndeterminate,
  transferKnownTotal,
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
    expect(transferIsRunning("running")).toBe(true);
    expect(transferIsRunning("done")).toBe(false);
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

  it("非正总量与缺省同一结果", () => {
    expect(transferKnownTotal(undefined)).toBeUndefined();
    expect(transferKnownTotal(0)).toBeUndefined();
    expect(transferKnownTotal(-3)).toBeUndefined();
    expect(transferKnownTotal(8)).toBe(8);
    expect(transferPercent(1, 0)).toBeUndefined();
    expect(transferIndeterminate("running", 0)).toBe(true);
    expect(transferIndeterminate("done", 0)).toBe(false);
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
    expect(transferFaultText(next.fault)).toBe(remoteNotFoundText("/sdcard/a.bin"));
  });
});

describe("transferFaultText", () => {
  it("缺省空串；分类+路径；运输无句子", () => {
    expect(transferFaultText(undefined)).toBe("");
    expect(transferFaultText({ kind: "local", path: "C:/tmp/a.bin" })).toBe(localFailedText("C:/tmp/a.bin"));
    expect(transferFaultText({ kind: "device_offline", serial: "S1" })).toBe("设备掉线: S1");
    expect(transferFaultText({ kind: "timeout" })).toBe(EXEC_TIMEOUT);
    expect(transferFaultText({ kind: "io" })).toBe("IO 错误");
    expect(transferFaultText({ kind: "truncated" })).toBe(CAPTURE_TRUNCATED);
    expect(transferFaultText({ kind: "pump_panic" })).toBe(PUMP_PANIC);
    expect(transferFaultText({ kind: "shell_no_stdin" })).toBe(SHELL_NO_STDIN);
    expect(transferFaultText({ kind: "shell_no_stdout" })).toBe(SHELL_NO_STDOUT);
    expect(transferFaultText({ kind: "shell_handshake" })).toBe(SHELL_HANDSHAKE);
    expect(transferFaultText({ kind: "shell_ended" })).toBe(SHELL_ENDED);
    expect(transferFaultText({ kind: "shell_exec" })).toBe(SHELL_EXEC);
    expect(transferFaultText({ kind: "tool_unavailable" })).toBe(TOOL_UNAVAILABLE);
    expect(transferFaultText({ kind: "readlink_unparseable", path: "/sdcard/a" })).toBe(
      readlinkUnparseableText("/sdcard/a"),
    );
    expect(transferFaultText({ kind: "progress_join" })).toBe(PROGRESS_JOIN);
    expect(transferFaultText({ kind: "invalid_name", detail: ENTRY_NAME_EMPTY })).toBe(
      invalidNameText(ENTRY_NAME_EMPTY),
    );
    expect(transferFaultText({ kind: "not_absolute", path: "sdcard/a" })).toBe("路径必须是绝对路径: sdcard/a");
    expect(transferFaultText({ kind: "traversal", path: "/sdcard/../etc" })).toBe(
      "路径含 .. 穿越: /sdcard/../etc",
    );
    expect(transferFaultText({ kind: "remote_not_found", path: "/sdcard/a" })).not.toContain(
      "没有这个目录",
    );
  });
});

describe("传输 toast 快照", () => {
  it("方向图标、失败文案、运行中才带进度", () => {
    expect(transferToastLeading("push")).toBe("arrow-up");
    expect(transferToastLeading("pull")).toBe("arrow-down");
    expect(transferIsPush("push")).toBe(true);
    expect(transferIsPush("pull")).toBe(false);
    expect(transferIsDone("done")).toBe(true);
    expect(transferIsDone("failed")).toBe(false);
    expect(transferIsFailed("failed")).toBe(true);
    expect(transferIsFailed("done")).toBe(false);
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
    expect(transferToastDetail(failed)).toBe(remoteNotFoundText("/sdcard/shot.png"));
    expect(transferToastProgress(failed)).toBeUndefined();
  });
});

describe("传输方向与提示色", () => {
  it("作业模型不再另写 push/pull 和提示色联合", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "transfer-model.ts"),
      "utf8",
    );
    expect(src).toContain("Direction");
    expect(src).toContain("ToastTone");
    expect(src).toContain("YoBadgeTone");
    expect(src).not.toContain('"push" | "pull"');
    expect(src).not.toContain('"success" | "error" | "info"');
    expect(src).not.toContain('"success" | "danger" | "accent" | "neutral"');
    expect(src).toContain("IconName");
    expect(src).not.toContain('"arrow-up" | "arrow-down"');
  });
});

describe("作业名裁空白只写一处", () => {
  it("trimmed_job_name_once", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "transfer-model.ts"),
      "utf8",
    );
    expect(src.match(/\?\.trim\(\)/g)?.length ?? 0).toBe(1);
  });
});

describe("进行中判定只写一处", () => {
  it("生产源里只有 transferIsRunning 比较 running", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."),
    );
    for (const name of sources) {
      const text = readFileSync(join(dir, name), "utf8");
      const body = name === "transfer-model.ts" ? text.replace('return state === "running"', "") : text;
      expect(body, name).not.toContain('=== "running"');
      expect(body, name).not.toContain('!== "running"');
      const pushBody = name === "transfer-model.ts" ? text.replace('return direction === "push"', "") : text;
      expect(pushBody, name).not.toContain('=== "push"');
      const doneBody =
        name === "transfer-model.ts" ? text.replace('return state === "done"', "") : text;
      const failedBody =
        name === "transfer-model.ts" ? text.replace('return state === "failed"', "") : text;
      expect(doneBody, name).not.toContain('=== "done"');
      expect(failedBody, name).not.toContain('=== "failed"');
      const totalBody = name === "transfer-model.ts" ? text.replace("total <= 0", "") : text;
      expect(totalBody, name).not.toContain("total <= 0");
      expect(text, name).not.toContain("expectedBytes > 0");
    }
  });
});
