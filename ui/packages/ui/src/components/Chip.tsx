/**
 * YoChip —— 可关闭气泡（L4 视图）。
 * 语义色 / leading / dismiss 由 chip-model + chip-policy 决定。
 * 删除钮流内右上，计入固有宽。禁止 absolute；禁止原生 title。
 * HarmonyOS 对照：Chip；禁止引进 antd Tag。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, isIconName, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import type { YoChipDismiss, YoChipTone } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";
import "./Chip.css";

export type { YoChipDismiss, YoChipTone };

export type YoChipLeading = IconName | JSX.Element;

export interface YoChipProps {
  text: string;
  tone?: YoChipTone;
  /** 流内前导槽（图标名或节点）。 */
  leading?: YoChipLeading;
  /**
   * 有 onDismiss 才画流内删除。
   * always = 常显；hover = 悬停/焦点内显（无悬停能力时仍显）。
   */
  dismiss?: YoChipDismiss;
  /** 有回调才画流内右上删除。mousedown 阻止默认以免抢走输入焦点。 */
  onDismiss?: () => void;
}

function ChipLeading(props: { value: YoChipLeading | undefined }): JSX.Element {
  const icon = createMemo(() => (isIconName(props.value) ? props.value : undefined));
  return (
    <Show when={icon()} fallback={props.value}>
      {(name) => <Icon name={name()} size={Layout.IconSm} />}
    </Show>
  );
}

export function YoChip(props: YoChipProps): JSX.Element {
  const host = createMemo(() =>
    chipHostAttrs({
      text: props.text,
      tone: props.tone,
      leading: props.leading,
      dismiss: props.dismiss,
      dismissible: Boolean(props.onDismiss),
    }),
  );
  return (
    <span
      class="yohu-chip"
      data-tone={host()["data-tone"]}
      data-dismiss={host()["data-dismiss"]}
      data-leading={host()["data-leading"]}
      aria-label={host()["aria-label"]}
    >
      <Show when={host()["data-leading"]}>
        <span class="yohu-chip__leading">
          <ChipLeading value={props.leading} />
        </span>
      </Show>
      <span class="yohu-chip__label">{props.text}</span>
      <Show when={host()["data-dismiss"]}>
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
