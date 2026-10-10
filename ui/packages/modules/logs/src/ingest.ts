/**
 * 窗口命中入当前页。禁止在此持有全文。
 */

import type { LogHits } from "@yohu/api";

import type { WorkspaceApi } from "./workspace";

export type IngestApi = {
  onHits: (hits: LogHits) => void;
};

export function createIngest(workspace: WorkspaceApi): IngestApi {
  return {
    onHits(hits: LogHits): void {
      workspace.applyHits(hits);
    },
  };
}
