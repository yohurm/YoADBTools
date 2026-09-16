/**
 * 确认删除对象：确认文案 / Chip 网格 / 展开钮。
 * 预览格与其余格是兄弟：其余走 YoReveal（绘制轴始终绝对定位），高度交给祖先 YoTravel。
 * 禁止把 Reveal 嵌进预览网格当一格。禁止套 Collapse / panel 淡入去冒充实收。
 * 三截分别进 YoDialog bodyLead / children / bodyTail，Reveal 只住 YoScroller 视口。
 */

import { For, Show } from "solid-js";

import { Layout, YoButton, YoChip, YoFileIcon, YoReveal, type YoFileIconProps } from "@yohu/ui";

import { DELETE_PREVIEW_LIMIT, canToggleDelete } from "./delete-targets";
import { fileStore } from "./store";

export interface DeleteTargetsProps {
  names: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRemove: (name: string) => void;
}

function entryKind(name: string): YoFileIconProps["kind"] {
  return fileStore.entries.find((entry) => entry.name === name)?.kind ?? "file";
}

function DeleteChip(props: { name: string; onRemove: (name: string) => void }) {
  return (
    <li class="yohu-files__delete-item">
      <YoChip
        tone="neutral"
        block
        text={props.name}
        leading={<YoFileIcon name={props.name} kind={entryKind(props.name)} size={Layout.IconSm} />}
        onDismiss={() => props.onRemove(props.name)}
      />
    </li>
  );
}

export function DeleteConfirm(props: { count: number }) {
  return (
    <p class="yohu-files__confirm">
      确定删除以下 <strong>{props.count}</strong> 项吗？该操作不可恢复。
    </p>
  );
}

export function DeleteTargetList(props: {
  names: string[];
  expanded: boolean;
  onRemove: (name: string) => void;
}) {
  const head = () => props.names.slice(0, DELETE_PREVIEW_LIMIT);
  const rest = () => props.names.slice(DELETE_PREVIEW_LIMIT);

  return (
    <div class="yohu-files__delete-list">
      <ul class="yohu-files__delete-grid">
        <For each={head()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
      </ul>
      <Show when={rest().length > 0}>
        <YoReveal open={props.expanded}>
          <ul class="yohu-files__delete-grid yohu-files__delete-rest">
            <For each={rest()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
          </ul>
        </YoReveal>
      </Show>
    </div>
  );
}

export function DeleteExpand(props: {
  names: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <Show when={canToggleDelete(props.names)}>
      <YoButton
        variant="ghost"
        tone="neutral"
        size="sm"
        aria-expanded={props.expanded}
        onClick={() => props.onExpandedChange(!props.expanded)}
      >
        {props.expanded ? "收起" : `展开其余 ${props.names.length - DELETE_PREVIEW_LIMIT} 项`}
      </YoButton>
    </Show>
  );
}

/** 单测用整块；产品接线走 Dialog lead / main / tail。 */
export function DeleteTargets(props: DeleteTargetsProps) {
  return (
    <>
      <DeleteConfirm count={props.names.length} />
      <DeleteTargetList names={props.names} expanded={props.expanded} onRemove={props.onRemove} />
      <DeleteExpand
        names={props.names}
        expanded={props.expanded}
        onExpandedChange={props.onExpandedChange}
      />
    </>
  );
}
