/**
 * 日志清单标题栏：YoColRow + YoColHeader tone=document。
 * 轨道来自 format.logDocTrackTemplate（探针 px，不是 CSS ch）。
 * 列缝走 YoColResizer；可拖列 px→ch 回写 colChars。行仍是 Document。
 */

import { For, type JSX } from "solid-js";

import { YoColHeader, YoColRow } from "@yohu/ui";

import {
  DEFAULT_CH_PX,
  headerColumns,
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
  const px = (): number => (props.chPx > 0 ? props.chPx : DEFAULT_CH_PX);
  const widthPx = (): number | undefined =>
    props.col.width == null ? undefined : Math.max(1, Math.round(props.col.width * px()));
  const minPx = (): number =>
    props.col.key === "msg"
      ? 0
      : Math.max(1, Math.round(minColChars(props.col.key, props.options) * px()));
  return (
    <YoColHeader
      tone="document"
      pad="none"
      split={props.col.key !== "msg"}
      resizable={props.col.resizable}
      resizeLabel={`调节${props.col.label}列宽`}
      width={widthPx()}
      minWidth={minPx()}
      onWidthChange={(next) => {
        if (props.col.key === "msg") {
          return;
        }
        props.onResize(
          props.col.key,
          Math.max(minColChars(props.col.key, props.options), Math.round(next / px())),
        );
      }}
      onFit={() => {
        if (props.col.key !== "msg") {
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
    <div class="yohu-logs__head">
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
    </div>
  );
}
