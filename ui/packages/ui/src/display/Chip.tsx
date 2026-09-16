/**
 * YoChip —— 可关闭胶囊（L4 视图）。
 * 对齐 HarmonyOS Chip：28vp 高、前导 + 文案 + 16vp 关闭圆钮。
 * 宿主排版；YoCorner 只 paint 胶囊，与 YoButton 同构。
 * 圆钮是宿主子级，不进 Corner 裁切盒。有 onDismiss 才画，始终可见。
 * 禁止 hover 藏钮。禁止 absolute 关钮。禁止原生 title。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { CornerPillRadius, YoCorner } from "../corner";
import { Icon, isIconName, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import type { YoChipTone } from "./chip-model";
import { chipHostAttrs } from "./chip-policy";
import "./Chip.css";

export type { YoChipTone };

export type YoChipLeading = IconName | JSX.Element;

export interface YoChipProps {
  text: string;
  tone?: YoChipTone;
  /** 流内前导槽（图标名或节点）。 */
  leading?: YoChipLeading;
  /** 铺满父格（对话框名单网格）。默认 hug。 */
  block?: boolean;
  /** 有回调才画右侧关闭圆钮。 */
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
      block: props.block,
      dismissible: Boolean(props.onDismiss),
    }),
  );
  return (
    <div
      class="yohu-chip"
      data-tone={host()["data-tone"]}
      data-dismiss={host()["data-dismiss"]}
      data-leading={host()["data-leading"]}
      data-block={host()["data-block"]}
      aria-label={host()["aria-label"]}
    >
      <YoCorner
        mode="paint"
        role="control"
        radius={CornerPillRadius}
        class="yohu-chip__chrome"
      />
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
    </div>
  );
}
