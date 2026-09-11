/**
 * 命令管理右栏：恰好 1 条才出属性面板；多选只报条数。
 */

import { Show } from "solid-js";

import { COMMAND_BLOCK_GAPS_MS, commandBlockGapLabel } from "@yohu/api";
import { YoFormRow, YoPanel, YoSelect, YoTextField } from "@yohu/ui";

import { commandBody, formatAdbLine } from "../command-line";
import { BlockSteps } from "./BlockSteps";
import type { CommandManagerStore } from "./store";

const GAP_OPTIONS = COMMAND_BLOCK_GAPS_MS.map((ms) => ({
  value: String(ms),
  label: commandBlockGapLabel(ms),
}));

export function EditorColumn(props: { store: CommandManagerStore }) {
  return (
    <div class="yohu-cm__editor">
      <Show
        when={props.store.selectedEntry()}
        keyed
        fallback={
          <Show
            when={props.store.ui.selectedEntryIds.length > 1}
            fallback={
              <Show
                when={props.store.selectedGroup()}
                fallback={<p class="yohu-cm__empty">选择左侧命令组，或新建一组</p>}
              >
                {(group) => (
                  <YoPanel title="组属性">
                    <YoTextField
                      block
                      label="组名称"
                      value={group().name}
                      onInput={(v) => props.store.updateGroupName(group().id, v)}
                    />
                  </YoPanel>
                )}
              </Show>
            }
          >
            <p class="yohu-cm__empty">已选 {props.store.ui.selectedEntryIds.length} 条</p>
          </Show>
        }
      >
        {(entry) => (
          <Show
            when={entry.kind === "block" ? entry : undefined}
            keyed
            fallback={
              <YoPanel title={`命令属性 · ${props.store.selectedGroup()?.name || "未命名组"}`}>
                <YoTextField
                  block
                  label="命令名称"
                  value={entry.name}
                  onInput={(v) => props.store.updateEntry({ name: v })}
                />
                <YoTextField
                  block
                  label="具体命令"
                  value={formatAdbLine("-", entry.kind === "command" ? entry.template : "")}
                  onInput={(v) => props.store.updateEntry({ template: commandBody(v) })}
                />
              </YoPanel>
            }
          >
            {(block) => (
              <YoPanel title={`命令块 · ${props.store.selectedGroup()?.name || "未命名组"}`}>
                <YoTextField
                  block
                  label="命令块名称"
                  value={block.name}
                  onInput={(v) => props.store.updateEntry({ name: v })}
                />
                <YoFormRow title="间隔">
                  <YoSelect
                    block
                    options={GAP_OPTIONS}
                    value={String(block.gap_ms)}
                    onChange={(v) => props.store.updateEntry({ gap_ms: Number(v) })}
                  />
                </YoFormRow>
                <BlockSteps
                  steps={block.steps}
                  onTemplate={(stepId, template) => props.store.updateBlockStep(stepId, template)}
                  onAdd={() => props.store.addBlockStep()}
                  onRemove={(stepId) => props.store.removeBlockStep(stepId)}
                  onMoveTo={(from, to) => props.store.moveBlockStepTo(from, to)}
                  onShift={(index, delta) => props.store.shiftBlockStep(index, delta)}
                />
              </YoPanel>
            )}
          </Show>
        )}
      </Show>
    </div>
  );
}
