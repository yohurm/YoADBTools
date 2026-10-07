/**
 * 日志清单标题栏：YoColRow + YoColHeader tone=document。
 * 轨道来自 format.logDocTrackTemplate（探针 px，不是 CSS ch）。
 * 列缝走 YoColResizer；可拖列 px→ch 回写 colChars。行仍是 Document。
 */

import { For, type JSX } from "solid-js";

import { YoColHead, YoColHeader, YoColRow } from "@yohu/ui";

import {
  headerColumns,
  logChUnit,
  logColPx,
  logFieldIsMessage,
  minColChars,
  type FormatOptions,
  type LogHeaderColumn,
  type LogMetaColKey,
} from "./editor";

function LogHeaderCell(props: {
  col: LogHeaderColumn;
  options: FormatOptions;
  chPx: number;
  onResize: (key: LogMetaColKey, chars: number) => void;
  onFit: (key: LogMetaColKey) => void;
}): JSX.Element {
  const widthPx = (): number | undefined =>
    props.col.width == null ? undefined : logColPx(props.col.width, props.chPx);
  const minPx = (): number =>
    logFieldIsMessage(props.col.key)
      ? 0
      : logColPx(minColChars(props.col.key, props.options), props.chPx);
  return (
    <YoColHeader
      tone="document"
      pad="none"
      split={!logFieldIsMessage(props.col.key)}
      resizable={props.col.resizable}
      resizeLabel={`调节${props.col.label}列宽`}
      width={widthPx()}
      minWidth={minPx()}
      onWidthChange={(next) => {
        if (logFieldIsMessage(props.col.key)) {
          return;
        }
        props.onResize(
          props.col.key,
          Math.max(minColChars(props.col.key, props.options), Math.round(next / logChUnit(props.chPx))),
        );
      }}
      onFit={() => {
        if (!logFieldIsMessage(props.col.key)) {
          props.onFit(props.col.key);
        }
      }}
    >
      {props.col.label}
    </YoColHeader>
  );
}

export function LogColumnHeader(props: {
  options: FormatOptions;
  chPx: number;
  shift: number;
  onResize: (key: LogMetaColKey, chars: number) => void;
  onFit: (key: LogMetaColKey) => void;
}): JSX.Element {
  const cols = () => headerColumns(props.options);
  return (
    <YoColHead class="yohu-logs__head">
      <YoColRow
        class="yohu-logs__cols"
        style={{ transform: props.shift ? `translateX(-${props.shift}px)` : undefined }}
      >
        <For each={cols()}>
          {(col) => (
            <LogHeaderCell
              col={col}
              options={props.options}
              chPx={props.chPx}
              onResize={props.onResize}
              onFit={props.onFit}
            />
          )}
        </For>
      </YoColRow>
    </YoColHead>
  );
}
