/**
 * 本机文件选择器（Tauri dialog 插件的唯一入口）。
 * 模块与设置页禁止直接 import `@tauri-apps/plugin-dialog`。
 * 取消与打不开是两种结果，不是 IPC 错误。
 */

import { open, save } from "@tauri-apps/plugin-dialog";

export interface DialogFilter {
  name: string;
  extensions: string[];
}

/** 选择器打不开。不是用户取消，也不是 IPC。 */
export const DIALOG_FAILED = "无法打开文件选择器";

export type DialogPick =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "failed" };

/** 选择器交出了路径。打不开和取消都不是。 */
export function dialogPickAccepted(pick: DialogPick): pick is { ok: true; path: string } {
  return pick.ok;
}

/** 选择器打不开。取消仍是另一种结果。 */
export function dialogPickFailed(pick: DialogPick): boolean {
  return !pick.ok && pick.reason === "failed";
}

export function dialogFailureText(pick: DialogPick): string | undefined {
  return dialogPickFailed(pick) ? DIALOG_FAILED : undefined;
}

function dialogTitle(options?: { title?: string }): string | undefined {
  return options?.title;
}

function dialogFilters(options?: { filters?: DialogFilter[] }): DialogFilter[] | undefined {
  return options?.filters;
}

function pickOne(): false {
  return false;
}

export async function dialogOpenFile(options?: {
  title?: string;
  filters?: DialogFilter[];
}): Promise<DialogPick> {
  return settle(() =>
    open({
      title: dialogTitle(options),
      multiple: pickOne(),
      filters: dialogFilters(options),
    }),
  );
}

export async function dialogOpenDirectory(options?: { title?: string }): Promise<DialogPick> {
  return settle(() =>
    open({
      title: dialogTitle(options),
      directory: true,
      multiple: pickOne(),
    }),
  );
}

export async function dialogSaveFile(options?: {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}): Promise<DialogPick> {
  return settle(() =>
    save({
      title: dialogTitle(options),
      defaultPath: options?.defaultPath,
      filters: dialogFilters(options),
    }),
  );
}

async function settle(run: () => Promise<unknown>): Promise<DialogPick> {
  try {
    const selected = await run();
    return typeof selected === "string" ? { ok: true, path: selected } : { ok: false, reason: "cancelled" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
