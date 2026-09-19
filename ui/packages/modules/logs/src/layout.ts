/**
 * 非文档常数：对话框高、行高、measureChPx。
 * 列尺与 hang 只在 editor/format options。本文件只转口，禁止再写第二把尺。
 */

import { Density, getDensity, type DensityName } from "@yohu/ui";

import { DEFAULT_CH_PX } from "./editor/format";

export {
  ALL_LOG_DISPLAY_COLUMNS,
  DEFAULT_LOG_DISPLAY_COLUMNS,
  LOG_CH_PX,
  LOG_COLUMNS,
  LOG_FIELD_CHARS,
  LOG_LEVEL_TRACK_CHARS,
  LOG_PAD_LEFT_CHARS,
  defaultLogColWidths,
  headerLabelChars,
  logColResizable,
  logFieldText,
  logSlotChars,
  tsFieldPx,
  visibleLogColumns,
  type LogColAlign,
  type LogColKey,
  type LogColWidths,
  type LogColumnSpec,
  type LogMetaColKey,
} from "./editor/format";

/** 新建窗口：设备行 + 分段 + 检索 + 列表。 */
export const NEW_SESSION_DIALOG_HEIGHT = 520;

const CONTROL_HEIGHT: Record<DensityName, number> = {
  compact: Density.Compact.controlHeight,
  comfortable: Density.Comfortable.controlHeight,
};

const DATA_ROW_HEIGHT: Record<DensityName, number> = {
  compact: Density.Compact.rowHeight,
  comfortable: Density.Comfortable.rowHeight,
};

export function controlRowHeight(): number {
  return CONTROL_HEIGHT[getDensity()];
}

/** 日志数据行高 = `--yohu-row-height`。禁止吃 VirtualList 默认 22。 */
export function dataRowHeight(): number {
  return DATA_ROW_HEIGHT[getDensity()];
}

/**
 * 只换 px 地板。禁止改 padLeft 或字段字符。
 * 行 class 是 display:block，会吃满宿主宽，chPx 变成整行/10。
 */
export function measureChPx(host: HTMLElement): number {
  const probe = document.createElement("span");
  probe.className = "yohu-logs__ch-probe";
  probe.textContent = "0000000000";
  host.append(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  if (!(width > 0)) {
    return DEFAULT_CH_PX;
  }
  return width;
}
