/**
 * YoSubheader —— 分组子标题（L4）。
 * HarmonyOS 对照：SubHeader 列表型（效率）/ 内容型。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { resolveSubheaderSpec, type YoSubheaderPad, type YoSubheaderTone } from "./subheader-model";
import "./Subheader.css";

export type { YoSubheaderPad, YoSubheaderTone };

export interface YoSubheaderProps {
  title: string;
  /** list=效率型小字；content=强调。默认 list */
  tone?: YoSubheaderTone;
  /** section=分组上下距；flush=工具栏行内。默认 section */
  pad?: YoSubheaderPad;
  class?: string;
  actions?: JSX.Element;
}

export function YoSubheader(props: YoSubheaderProps): JSX.Element {
  const spec = createMemo(() =>
    resolveSubheaderSpec({
      title: props.title,
      tone: props.tone,
      pad: props.pad,
      hasActions: props.actions != null,
    }),
  );
  return (
    <div
      class={`yohu-subheader${props.class ? ` ${props.class}` : ""}`}
      data-tone={spec().tone}
      data-pad={spec().pad}
      data-has-actions={spec().hasActions ? true : undefined}
    >
      <div class="yohu-subheader__title">{props.title}</div>
      <Show when={props.actions}>
        {(actions) => <div class="yohu-subheader__actions">{actions()}</div>}
      </Show>
    </div>
  );
}
