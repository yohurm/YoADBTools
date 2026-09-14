/**
 * YoChip —— 可关闭气泡（L4 视图）。
 * 语义色由 chip-model + chip-policy 决定；删除钮流内右上，计入固有宽。
 * HarmonyOS 对照：Chip；禁止引进 antd Tag。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";
import type { YoChipTone } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";
import "./Chip.css";

export type { YoChipTone };

export interface YoChipProps {
  text: string;
  tone?: YoChipTone;
  /** 有回调才画流内右上删除。mousedown 阻止默认以免抢走输入焦点。 */
  onDismiss?: () => void;
}

export function YoChip(props: YoChipProps): JSX.Element {
  const host = createMemo(() => chipHostAttrs({ text: props.text, tone: props.tone, dismissible: Boolean(props.onDismiss) }));
  return (
    <span class="yohu-chip" data-tone={host()["data-tone"]} data-dismiss={host()["data-dismiss"]} aria-label={host()["aria-label"]}>
      <span class="yohu-chip__label">{props.text}</span>
      <Show when={Boolean(props.onDismiss)}>
        <button
          type="button"
          class="yohu-chip__remove yohu-focus-ring"
          aria-label={`移除 ${props.text}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            props.onDismiss?.();
          }}
        >
          <Icon name="close" size={Layout.IconTiny} />
        </button>
      </Show>
    </span>
  );
}
