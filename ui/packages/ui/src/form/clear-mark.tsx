/**
 * 写入盒内幽灵清除。
 * TextField / Search 共用；铬在 tokens/states.css `.yohu-recipe-clear`。
 * 不是产品 Yo*，不进 L5。Tabs 会话关闭与窗口三键不走本图元。
 */
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";

export interface ClearMarkProps {
  onClear: () => void;
}

export function ClearMark(props: ClearMarkProps): JSX.Element {
  return (
    <button type="button" class="yohu-recipe-clear yohu-focus-ring" aria-label="清除" onClick={props.onClear}>
      <Icon name="close" size={Layout.IconInline} />
    </button>
  );
}
