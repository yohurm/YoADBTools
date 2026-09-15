/**
 * 确认删除对象：确认文案 / Chip 网格 / 展开钮。
 * 预览与其余是同一张网格：其余占满一行，折叠只长高，间距跟格子 gap 同一档。
 * 超出预览的项走 YoCollapse panel（高度 + 淡入上移），禁止瞬时切名单。
 * 三截分别进 YoDialog bodyLead / children / bodyTail，Collapse 只住滚槽。
 */

import { For, Show } from "solid-js";

import { Layout, YoButton, YoChip, YoCollapse, YoFileIcon, type YoFileIconProps } from "@yohu/ui";

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
        dismiss="hover"
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
    <ul class="yohu-files__delete-grid">
      <For each={head()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
      <Show when={rest().length > 0}>
        <li class="yohu-files__delete-more">
          <YoCollapse open={props.expanded} recipe="panel">
            <ul class="yohu-files__delete-grid">
              <For each={rest()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
            </ul>
          </YoCollapse>
        </li>
      </Show>
    </ul>
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
