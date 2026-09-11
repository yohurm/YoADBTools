/**
 * 右栏：恰好一条命令块。名称 + 间隔 + 步骤 + 全步共享 `{n}` 描述。
 */

import { COMMAND_BLOCK_GAPS_MS, commandBlockGapLabel } from "@yohu/api";
import { YoFormRow, YoSelect, YoTextField } from "@yohu/ui";

import { templatesSlots } from "../command-line";
import type { DraftBlock } from "../draft";
import { BlockSteps } from "./BlockSteps";
import { ParamDescriptions } from "./ParamDescriptions";
import type { CommandManagerStore } from "./store";

const GAP_OPTIONS = COMMAND_BLOCK_GAPS_MS.map((ms) => ({
  value: String(ms),
  label: commandBlockGapLabel(ms),
}));

export function BlockEditor(props: { block: DraftBlock; store: CommandManagerStore }) {
  return (
    <>
      <YoTextField
        block
        label="命令块名称"
        value={props.block.name}
        onInput={(v) => props.store.updateEntry({ name: v })}
      />
      <YoFormRow title="间隔">
        <YoSelect
          block
          options={GAP_OPTIONS}
          value={String(props.block.gap_ms)}
          onChange={(v) => props.store.updateEntry({ gap_ms: Number(v) })}
        />
      </YoFormRow>
      <BlockSteps
        steps={props.block.steps}
        onTemplate={(stepId, template) => props.store.updateBlockStep(stepId, template)}
        onAdd={() => props.store.addBlockStep()}
        onRemove={(stepId) => props.store.removeBlockStep(stepId)}
        onMoveTo={(from, to) => props.store.moveBlockStepTo(from, to)}
        onShift={(index, delta) => props.store.shiftBlockStep(index, delta)}
      />
      <ParamDescriptions
        slots={templatesSlots(props.block.steps.map((step) => step.template))}
        params={props.block.params}
        onChange={(params) => props.store.updateEntry({ params })}
      />
    </>
  );
}
