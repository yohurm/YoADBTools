/**
 * 命令 / 命令块的独立 `{n}` 描述编辑。只展示模板里实际出现的槽位。
 */

import { For, Show } from "solid-js";

import type { CommandParamDto } from "@yohu/api";
import { YoTextField } from "@yohu/ui";

import { paramDescription, setParamDescription } from "../command-line";

export function ParamDescriptions(props: {
  slots: number[];
  params: CommandParamDto[];
  onChange: (params: CommandParamDto[]) => void;
}) {
  return (
    <Show when={props.slots.length > 0}>
      <div class="yohu-cm__param-descs" aria-label="参数描述">
        <For each={props.slots}>
          {(index) => (
            <YoTextField
              block
              label={`{${index}}`}
              placeholder="参数描述"
              value={paramDescription(props.params, index)}
              onInput={(value) => props.onChange(setParamDescription(props.params, index, value))}
            />
          )}
        </For>
      </div>
    </Show>
  );
}
