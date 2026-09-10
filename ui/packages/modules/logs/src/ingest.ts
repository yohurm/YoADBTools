/**
 * 设备批次入镜像。面板写入一律交给 workspace.onDeviceLines，禁止在此改 visible。
 */

import type { LogBatch } from "@yohu/api";

import type { MirrorBank } from "./mirror";
import type { WorkspaceApi } from "./workspace";

export type IngestApi = {
  onBatch: (batch: LogBatch) => void;
};

export function createIngest(mirrors: MirrorBank, workspace: WorkspaceApi): IngestApi {
  return {
    onBatch(batch: LogBatch): void {
      mirrors.of(batch.serial).pushBatch(batch);
      workspace.onDeviceLines(batch.serial, batch.lines);
    },
  };
}
