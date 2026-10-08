/**
 * 设置页路径铬：YoTextField 只读 + 动作钮。禁止自绘第二套 control 皮。
 */

import type { JSX } from "solid-js";

import { YoButton, YoTextField } from "@yohu/ui";

import { settingsStore } from "../stores";

export function PathChrome(props: {
  label: string;
  path: string;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}): JSX.Element {
  return (
    <>
      <YoTextField width="control" readOnly value={props.path} ariaLabel={props.label} />
      <YoButton
        buttonStyle={settingsStore.normalStyle()}
        tone={settingsStore.neutralTone()}
        disabled={props.disabled}
        onClick={() => props.onAction()}
      >
        {props.actionLabel}
      </YoButton>
    </>
  );
}
