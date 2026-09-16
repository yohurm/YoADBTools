/**
 * 命令块步骤：变高换位走 YoReorderList（与定高清单同一套 L2 行盒）。
 * 禁止常驻手柄、禁止自写第二套换位几何。
 */

import { createContext, useContext } from "solid-js";

import { YoIconButton, YoReorderList, YoSubheader } from "@yohu/ui";

import type { DraftStep } from "../draft";
import { TemplateField } from "./TemplateField";

type BlockStepActions = {
  onTemplate: (stepId: string, template: string) => void;
  onRemove: (stepId: string) => void;
  canRemove: () => boolean;
};

const BlockStepActions = createContext<BlockStepActions>();

function BlockStepRow(props: { item: DraftStep; index: number }) {
  const actions = useContext(BlockStepActions)!;
  return (
    <div class="yohu-cm__step">
      <div class="yohu-cm__step-editor">
        <TemplateField
          ariaLabel={`步骤 ${props.index + 1}`}
          value={props.item.template}
          onChange={(template) => actions.onTemplate(props.item.id, template)}
        />
      </div>
      <YoIconButton
        icon="trash"
        title="删除步骤"
        disabled={!actions.canRemove()}
        onClick={() => actions.onRemove(props.item.id)}
      />
    </div>
  );
}

export function BlockSteps(props: {
  steps: DraftStep[];
  onTemplate: (stepId: string, template: string) => void;
  onAdd: () => void;
  onRemove: (stepId: string) => void;
  onMoveTo: (from: number, to: number) => void;
}) {
  const actions: BlockStepActions = {
    onTemplate: (stepId, template) => props.onTemplate(stepId, template),
    onRemove: (stepId) => props.onRemove(stepId),
    canRemove: () => props.steps.length > 1,
  };

  return (
    <div class="yohu-cm__steps">
      <YoSubheader
        title="步骤"
        pad="flush"
        actions={<YoIconButton icon="plus" title="新增步骤" onClick={() => props.onAdd()} />}
      />
      <BlockStepActions.Provider value={actions}>
        <YoReorderList<DraftStep>
          items={() => props.steps}
          getItemKey={(step) => step.id}
          ariaLabel="步骤"
          onReorder={(from, to) => props.onMoveTo(from, to)}
          renderRow={BlockStepRow}
        />
      </BlockStepActions.Provider>
    </div>
  );
}
