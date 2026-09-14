/**
 * 结果流：IO 行 + 钉底。清屏直切；新块 Presence 升起。
 */

import { Show, createEffect, onCleanup } from "solid-js";

import { YoEmptyState, YoListPresence, motionSpecMs, shouldSkipMotion } from "@yohu/ui";
import type { TerminalTimeFormat } from "@yohu/api";
import { formatClockFromMs } from "@yohu/api";

import { terminalStore, type IoLine } from "./store";

function IoRow(props: { line: IoLine; format: TerminalTimeFormat }) {
  return (
    <div class="yohu-terminal__line" data-kind={props.line.kind}>
      <span
        class="yohu-terminal__mark"
        classList={{
          "yohu-terminal__mark--in": props.line.kind === "in",
          "yohu-terminal__mark--out": props.line.kind === "out",
        }}
      >
        {props.line.kind === "in" ? ">>>" : "<<<"}
      </span>
      <time class="yohu-terminal__line-time">{formatClockFromMs(props.line.at, props.format)}</time>
      <span class="yohu-terminal__line-text">{props.line.text}</span>
    </div>
  );
}

export function ResultStream(props: { format: TerminalTimeFormat }) {
  let resultBox: HTMLDivElement | undefined;
  const hasLines = (): boolean => terminalStore.lines.length > 0;

  createEffect(() => {
    const count = terminalStore.lines.length;
    void count;
    const box = resultBox;
    if (!box) return;
    const pin = (): void => {
      box.scrollTop = box.scrollHeight;
    };
    pin();
    if (shouldSkipMotion()) return;
    const started = performance.now();
    const hold = motionSpecMs("spatialLocal");
    let frame = 0;
    const tick = (now: number): void => {
      pin();
      if (now - started < hold) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    onCleanup(() => window.cancelAnimationFrame(frame));
  });

  return (
    <div
      class="yohu-terminal__stream"
      classList={{ "yohu-terminal__stream--empty": !hasLines() }}
      ref={(el) => {
        resultBox = el;
      }}
    >
      <Show
        when={hasLines()}
        fallback={
          <YoEmptyState
            icon="terminal"
            title="暂无执行结果"
            description="点左侧命令加入队列，或在下方输入后发送"
          />
        }
      >
        <YoListPresence each={terminalStore.lines} key={(line) => line.id} exit={false}>
          {(line) => <IoRow line={line} format={props.format} />}
        </YoListPresence>
      </Show>
    </div>
  );
}
