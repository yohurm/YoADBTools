/**
 * 命令块步骤：每步自己的 `{n}` 与 `1-0` 描述。
 * 变高换位走 YoReorderList；增删走行内 Presence list。
 */

import { createContext, useContext } from "solid-js";

import { YoIconButton, YoReorderList, YoSubheader } from "@yohu/ui";

import { placeholderSlots } from "@yohu/api";
import { stepParamLabel } from "../command-line";
import type { DraftStep } from "../draft";
import { ParamDescriptions } from "./ParamDescriptions";
import { TemplateField } from "./TemplateField";
import type { CommandManagerStore } from "./store";

function stepListLabel(): string {
  return "步骤";
}

const BlockStore = createContext<CommandManagerStore>();

function BlockStepRow(props: { item: DraftStep; index: number }) {
  const store = useContext(BlockStore)!;
  const stepNo = (): number => props.index + 1;
  return (
    <div class="yohu-cm__step">
      <div class="yohu-cm__step-editor">
        <TemplateField
          label={`步骤 ${stepNo()}`}
          value={props.item.template}
          onChange={(template) => store.updateBlockStep(props.item.id, template)}
        />
        <ParamDescriptions
          slots={placeholderSlots(props.item.template)}
          params={props.item.params}
          title="参数"
          labelOf={(index) => stepParamLabel({ step: stepNo(), index })}
          onChange={(params) => store.updateBlockStepParams(props.item.id, params)}
        />
      </div>
      <YoIconButton
        icon="trash"
        title="删除步骤"
        disabled={!store.canRemoveBlockStep()}
        onClick={() => store.removeBlockStep(props.item.id)}
      />
    </div>
  );
}

export function BlockSteps(props: { steps: DraftStep[]; store: CommandManagerStore }) {
  return (
    <div class="yohu-cm__steps">
      <YoSubheader
        title={stepListLabel()}
        pad="flush"
        actions={<YoIconButton icon="plus" title="新增步骤" onClick={() => props.store.addBlockStep()} />}
      />
      <BlockStore.Provider value={props.store}>
        <YoReorderList<DraftStep>
          items={() => props.steps}
          getItemKey={(step) => step.id}
          ariaLabel={stepListLabel()}
          onReorder={(from, to) => props.store.moveBlockStepTo(from, to)}
          renderRow={BlockStepRow}
        />
      </BlockStore.Provider>
    </div>
  );
}
