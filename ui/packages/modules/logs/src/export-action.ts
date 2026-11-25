/**
 * 导出动作：判定窗口可导出 → 走设置决定是否弹保存框 → invoke 导出 → 打开目录。
 * 对话框/副作用在此收口；View 只把回调交进来，不重复写文案。
 * 导出条数回读（`ExportResult.lines`）进提示，用户能判断过滤后实际写了多少行。
 */

import {
  dialogFailureText,
  dialogPickAccepted,
  dialogSaveFile,
  systemOpenPath,
  type DeviceSession,
  type ExportResult,
} from "@yohu/api";

import { suggestedExportPath } from "./host-path";
import { sessionHasCapture, type LogSessionState } from "./workspace";

export type ExportAction = {
  doExport: () => Promise<void>;
};

/** 导出成功提示：路径 + 条数（条数来自 core 回读，不是本地估算）。 */
export function exportSuccessText(result: ExportResult): string {
  return `已导出 ${result.lines} 行: ${result.path}`;
}

export function createExportAction(opts: {
  settings: () => DeviceSession["settings"];
  /** 唯一解析的导出目录（core `system.info` 已解析；空则 core 用 `paths.exports_dir()`）。 */
  exportDefaultDir: () => string;
  active: () => LogSessionState | null;
  exportSession: (id: number, dest?: string) => Promise<ExportResult | null>;
  showFailure: (failure: string) => void;
  showErrorText: (e: unknown) => void;
  showExportNeedsCapture: () => void;
  showSuccess: (message: string) => void;
}): ExportAction {
  async function runExport(id: number, dest?: string): Promise<void> {
    try {
      const result = await opts.exportSession(id, dest);
      if (result) {
        opts.showSuccess(exportSuccessText(result));
        void systemOpenPath(result.path);
        return;
      }
      opts.showExportNeedsCapture();
    } catch (e) {
      opts.showErrorText(e);
    }
  }

  async function doExport(): Promise<void> {
    const session = opts.active();
    if (!sessionHasCapture(session)) {
      opts.showExportNeedsCapture();
      return;
    }
    const settings = opts.settings();
    if (settings.export_ask_every_time) {
      const picked = await dialogSaveFile({
        title: "导出日志",
        defaultPath: suggestedExportPath(opts.exportDefaultDir()),
        filters: [{ name: "文本", extensions: ["txt"] }],
      });
      const failure = dialogFailureText(picked);
      if (failure) opts.showFailure(failure);
      if (!dialogPickAccepted(picked)) return;
      await runExport(session.id, picked.path);
      return;
    }
    await runExport(session.id);
  }

  return { doExport };
}
