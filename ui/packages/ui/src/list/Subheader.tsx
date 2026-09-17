/**
 * YoSubheader —— 分组子标题（L4）。
 * HarmonyOS 对照：SubHeader 列表型（效率）/ 内容型。
 * meta 贴标题；actions 行尾。禁止把计数徽章放进 actions。
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
  /** 贴标题（计数徽章）。不是行尾。 */
  meta?: JSX.Element;
  /** 行尾操作（工具栏加号等）。 */
  actions?: JSX.Element;
}

export function YoSubheader(props: YoSubheaderProps): JSX.Element {
  const spec = createMemo(() =>
    resolveSubheaderSpec({
      title: props.title,
      tone: props.tone,
      pad: props.pad,
      hasMeta: props.meta != null,
    }),
  );
  return (
    <div
      class={`yohu-subheader${props.class ? ` ${props.class}` : ""}`}
      data-tone={spec().tone}
      data-pad={spec().pad}
      data-has-meta={spec().hasMeta ? true : undefined}
    >
      <div class="yohu-subheader__title">{props.title}</div>
      <Show when={props.meta}>{(meta) => <div class="yohu-subheader__meta">{meta()}</div>}</Show>
      <Show when={props.actions}>
        {(actions) => <div class="yohu-subheader__actions">{actions()}</div>}
      </Show>
    </div>
  );
}
