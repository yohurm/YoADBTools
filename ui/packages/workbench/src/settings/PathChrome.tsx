/**
 * 设置页路径铬：YoTextField 只读 + 动作钮。禁止自绘第二套 control 皮。
 */

import type { JSX } from "solid-js";

import { YoButton, YoTextField } from "@yohu/ui";

export function PathChrome(props: {
  label: string;
  path: string;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}): JSX.Element {
  return (
    <>
      <div class="yohu-settings__path-field">
        <YoTextField block readOnly value={props.path} ariaLabel={props.label} />
      </div>
      <YoButton
        variant="outlined"
        tone="neutral"
        disabled={props.disabled}
        onClick={() => props.onAction()}
      >
        {props.actionLabel}
      </YoButton>
    </>
  );
}
