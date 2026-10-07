/**
 * HarmonyOS Chip 16vp 正圆关闭。
 * Chip / Toast 共用。圆和叠层在本钮的样式里，宿主不点该类。
 * 不是产品 Yo*，不进 L5。禁止 YoIconButton。
 */
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";
import "./dismiss-mark.css";

export interface DismissMarkProps {
  /** 无障碍名（移除 Chip 文案 / 关闭 Toast 文案）。 */
  label: string;
  onDismiss?: () => void;
}

export function DismissMark(props: DismissMarkProps): JSX.Element {
  return (
    <button
      type="button"
      class="yohu-recipe-dismiss yohu-focus-ring"
      aria-label={props.label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        props.onDismiss?.();
      }}
    >
      <Icon name="close" size={Layout.IconTiny} />
    </button>
  );
}
