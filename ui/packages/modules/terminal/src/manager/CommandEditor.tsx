/**
 * 右栏：恰好一条命令。名称 + 具体命令 + `{n}` 描述。
 */

import { YoTextField } from "@yohu/ui";

import { commandTemplateLabel, placeholderSlots } from "../command-line";
import type { DraftCommand } from "../draft";
import { ParamDescriptions } from "./ParamDescriptions";
import { TemplateField } from "./TemplateField";
import type { CommandManagerStore } from "./store";

export function CommandEditor(props: { command: DraftCommand; store: CommandManagerStore }) {
  return (
    <>
      <YoTextField
        block
        label="命令名称"
        value={props.command.name}
        onInput={(v) => props.store.updateEntry({ name: v })}
      />
      <TemplateField
        label={commandTemplateLabel()}
        value={props.command.template}
        onChange={(template) => props.store.updateEntry({ template })}
      />
      <ParamDescriptions
        slots={placeholderSlots(props.command.template)}
        params={props.command.params}
        onChange={(params) => props.store.updateEntry({ params })}
      />
    </>
  );
}
