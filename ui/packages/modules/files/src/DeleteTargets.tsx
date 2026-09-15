/**
 * 确认删除对象列表：折叠预览 / YoChip 行列 / dismiss 移除。
 * 预览与其余是同一张网格：其余占满一行，折叠只长高，间距跟格子 gap 同一档。
 * 超出预览的项走 YoCollapse panel（高度 + 淡入上移），禁止瞬时切名单。
 */

import { For, Show, createMemo } from "solid-js";

import { Layout, YoButton, YoChip, YoCollapse, YoFileIcon, type YoFileIconProps } from "@yohu/ui";

import { DELETE_PREVIEW_LIMIT, visibleDeleteNames } from "./delete-targets";
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

export function DeleteTargets(props: DeleteTargetsProps) {
  const preview = createMemo(() => visibleDeleteNames(props.names, props.expanded));
  const head = createMemo(() => props.names.slice(0, DELETE_PREVIEW_LIMIT));
  const rest = createMemo(() => props.names.slice(DELETE_PREVIEW_LIMIT));
  const canToggle = createMemo(() => rest().length > 0);

  return (
    <div class="yohu-files__delete">
      <p class="yohu-files__confirm">
        确定删除以下 <strong>{props.names.length}</strong> 项吗？该操作不可恢复。
      </p>
      <ul class="yohu-files__delete-grid">
        <For each={head()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
        <Show when={canToggle()}>
          <li class="yohu-files__delete-more">
            <YoCollapse open={props.expanded} recipe="panel">
              <ul class="yohu-files__delete-grid">
                <For each={rest()}>{(name) => <DeleteChip name={name} onRemove={props.onRemove} />}</For>
              </ul>
            </YoCollapse>
          </li>
        </Show>
      </ul>
      <Show when={canToggle()}>
        <YoButton
          variant="ghost"
          tone="neutral"
          size="sm"
          aria-expanded={props.expanded}
          onClick={() => props.onExpandedChange(!props.expanded)}
        >
          {props.expanded ? "收起" : `展开其余 ${preview().hidden} 项`}
        </YoButton>
      </Show>
    </div>
  );
}
