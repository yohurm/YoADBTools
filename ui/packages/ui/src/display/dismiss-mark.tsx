/**
 * HarmonyOS Chip 16vp 正圆关闭。
 * Chip / Toast 共用；铬在 tokens/states.css `.yohu-recipe-dismiss`。
 * 不是产品 Yo*，不进 L5。禁止 YoIconButton。
 */
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";

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
