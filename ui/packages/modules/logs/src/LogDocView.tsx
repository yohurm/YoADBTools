/**
 * 清单行文档：formatLogDoc 字段着色。表头铬层在页壳。
 */

import { For, Show, createContext, createMemo, useContext, type Accessor, type JSX } from "solid-js";

import { formatLogDocParts, joinLogDoc, splitDocField, splitLevelGlyph, type LogDocLayout } from "./doc";
import { levelKey } from "./filter";
import { highlightMessage } from "./highlight";
import { levelInkStyle, levelPaint } from "./level-paint";
import type { ViewRow } from "./stack";

export const rowKey = (row: ViewRow): string => `${row.line.seq}-${row.line.pid}`;

export const LogListBind = createContext<{
  keyword: Accessor<string>;
  layout: Accessor<LogDocLayout>;
  pickAll: Accessor<boolean>;
}>();

function LogLineDoc(props: { row: ViewRow; keyword: string; layout: Accessor<LogDocLayout> }) {
  const line = (): ViewRow["line"] => props.row.line;
  const parts = createMemo(
    () => formatLogDocParts(line(), props.layout()),
    [],
    { equals: (prev, next) => joinLogDoc(prev) === joinLogDoc(next) },
  );
  return (
    <>
      <For each={parts()}>
        {(part) => {
          if (part.kind === "level") {
            const glyph = splitLevelGlyph(part.text);
            return (
              <>
                <Show when={glyph.lead}>
                  <span data-log-pad>{glyph.lead}</span>
                </Show>
                <span class="yohu-logs__row-level yohu-tone">{glyph.letter}</span>
                <Show when={glyph.pad}>
                  <span data-log-pad>{glyph.pad}</span>
                </Show>
              </>
            );
          }
          if (part.kind === "msg") {
            const key = levelKey(line().level);
            return (
              <span
                class="yohu-logs__row-msg"
                classList={{ "yohu-tone": Boolean(key) }}
              >
                <Show when={props.keyword} keyed fallback={part.text}>
                  {(keyword) => (
                    <For each={highlightMessage(part.text, keyword)}>
                      {(chunk) =>
                        typeof chunk === "string" ? chunk : <mark class="yohu-logs__mark yohu-tone">{chunk.mark}</mark>
                      }
                    </For>
                  )}
                </Show>
              </span>
            );
          }
          const field = splitDocField(part.text);
          return (
            <span
              class={`yohu-logs__row-${part.kind}`}
              classList={{ "yohu-tone": part.kind === "tag" }}
            >
              <Show when={field.lead}>
                <span data-log-pad>{field.lead}</span>
              </Show>
              {field.body}
              <Show when={field.trail}>
                <span data-log-pad>{field.trail}</span>
              </Show>
            </span>
          );
        }}
      </For>
      <Show when={props.row.collapsedAfter}>
        <span class="yohu-logs__row-fold" data-log-chrome>
          …{props.row.collapsedAfter} 帧折叠
        </span>
      </Show>
    </>
  );
}

export function LogRow(props: { item: ViewRow; index: number }) {
  const bind = useContext(LogListBind)!;
  const key = (): ReturnType<typeof levelKey> => levelKey(props.item.line.level);
  const paint = () => {
    const letter = key();
    return letter ? levelPaint(letter) : null;
  };
  return (
    <div
      class="yohu-logs__cols yohu-logs__row"
      data-seq={String(props.item.line.seq)}
      data-level={key() ?? undefined}
      data-paint={paint()?.invert ? "invert" : undefined}
      style={key() ? (levelInkStyle(key()!) as JSX.CSSProperties) : undefined}
      classList={{
        "yohu-logs__row--signal": props.item.signal !== undefined,
        "yohu-logs__row--picked": bind.pickAll(),
      }}
    >
      <LogLineDoc row={props.item} keyword={bind.keyword()} layout={bind.layout} />
    </div>
  );
}
