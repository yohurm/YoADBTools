/**
 * 组/块等待谓词：只认 TaskInfo.run_id。
 * 快照没有该项继续等；有该项且 !active 才结束。
 */

import type { TaskInfo } from "@yohu/api";

export type RunWait = {
  generation: number;
  runId: number;
  resolve: () => void;
};

export function isRunFinished(runId: number, tasks: readonly TaskInfo[]): boolean {
  const task = tasks.find((item) => item.run_id === runId);
  return task !== undefined && !task.active;
}
