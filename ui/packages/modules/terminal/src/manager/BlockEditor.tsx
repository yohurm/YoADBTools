/**
 * 右栏：恰好一条命令块。名称 + 间隔 + 分步模板与 `1-0` 描述。
 */

import { COMMAND_BLOCK_GAPS_MS } from "@yohu/api";
import { YoFormRow, YoSelect, YoTextField } from "@yohu/ui";

import { commandBlockGapLabel } from "../block-gap";

import type { DraftBlock } from "../draft";
import { BlockSteps } from "./BlockSteps";
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
      <BlockSteps steps={props.block.steps} store={props.store} />
    </>
  );
}
