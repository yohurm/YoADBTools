/**
 * 非文档常数：对话框高、行高、measureChPx。
 * Format 尺只在 editor/format。禁止再写第二把尺，禁止转口表头规格。
 */

import { densityScale, getDensity } from "@yohu/ui";

import { logChUnit } from "./editor/format";

/**
 * 新建窗口高度：按密度派生（comfortable rowHeight 26 → 520；compact 22 → 440），不写裸 px。
 * 与 dataRowHeight() 同一密度纪律；设备行 + 分段 + 检索 + 列表。
 */
export function newSessionDialogHeight(): number {
  return densityScale(getDensity()).rowHeight * 20;
}

/** 日志数据行高 = `--yohu-row-height`。禁止吃 VirtualList 默认 22。控件行高不在这里。 */
export function dataRowHeight(): number {
  return densityScale(getDensity()).rowHeight;
}

/**
 * wrap 用它算 rowChars；clip 用它把文档 ch 换成 inner 宽；表头拖条把 px 收成 ch。
 * 禁止拿去改 Format.width()。
 * 行 class 是 display:block，会吃满宿主宽，chPx 变成整行/10。
 */
export function measureChPx(host: HTMLElement): number {
  const probe = document.createElement("span");
  probe.className = "yohu-logs__ch-probe";
  probe.textContent = "0000000000";
  host.append(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return logChUnit(width);
}

/**
 * 视口内容盒宽：与 VirtualList flow 行同盒（已扣侧轨 padding）。
 * 用一条已渲染日志行的 clientWidth 取内容宽，无行时回落宿主宽。全模块只有这一把内容尺。
 */
export function measureRowContentWidth(host: HTMLElement): number {
  const row = host.querySelector<HTMLElement>(".yohu-logs__row");
  return row ? row.clientWidth : host.clientWidth;
}

