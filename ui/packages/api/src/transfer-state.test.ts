import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isTerminalTransfer, transferIsCancelled, transferIsDone, transferIsFailed, transferIsPush, transferIsRunning } from "./transfer-state";

describe("传输槽位", () => {
  it("进行、完成、失败、取消和上传各判一次", () => {
    expect(transferIsRunning("running")).toBe(true);
    expect(transferIsRunning("done")).toBe(false);
    expect(isTerminalTransfer("running")).toBe(false);
    expect(isTerminalTransfer("cancelled")).toBe(true);
    expect(transferIsDone("done")).toBe(true);
    expect(transferIsFailed("failed")).toBe(true);
    expect(transferIsCancelled("cancelled")).toBe(true);
    expect(transferIsCancelled("failed")).toBe(false);
    expect(transferIsPush("push")).toBe(true);
    expect(transferIsPush("pull")).toBe(false);
  });

  it("作业模型不再自己比方向和槽位", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "transfer-state.ts"),
      resolve(here, "types.ts"),
      resolve(here, "../../modules/files/src/transfer-model.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("transfer-state.ts")) {
        body = body
          .replace('return state === "running"', "")
          .replace('return state === "done"', "")
          .replace('return state === "failed"', "")
          .replace('return state === "cancelled"', "")
          .replace('return direction === "push"', "");
      }
      if (path.endsWith("types.ts")) {
        body = body
          .replace('export type Direction = "push" | "pull";', "")
          .replace('export type TransferState = "running" | "done" | "failed" | "cancelled";', "");
      }
      expect(body, path).not.toContain('state === "running"');
      expect(body, path).not.toContain('state === "done"');
      expect(body, path).not.toContain('state === "failed"');
      expect(body, path).not.toContain('state === "cancelled"');
      expect(body, path).not.toContain('direction === "push"');
      if (!path.endsWith("types.ts")) {
        expect(body, path).not.toContain('"push" | "pull"');
        expect(body, path).not.toContain('"running" | "done" | "failed" | "cancelled"');
      }
    }
  });
});
