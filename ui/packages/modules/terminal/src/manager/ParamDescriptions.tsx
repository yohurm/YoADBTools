/**
 * 命令 / 命令块的独立 `{n}` 描述编辑。只展示模板里实际出现的槽位。
 * 增删走公开 YoListPresence（配方 list），禁止本模块自写进出场。
 */

import type { CommandParamDto } from "@yohu/api";
import { YoListPresence, YoPresence, YoSubheader, YoTextField } from "@yohu/ui";

import { paramDescription, setParamDescription } from "../command-line";

export function ParamDescriptions(props: {
  slots: number[];
  params: CommandParamDto[];
  onChange: (params: CommandParamDto[]) => void;
}) {
  return (
    <div class="yohu-cm__param-descs" aria-label="参数描述">
      <YoPresence when={props.slots.length > 0} recipe="list">
        <YoSubheader title="参数描述" pad="flush" />
      </YoPresence>
      <YoListPresence each={props.slots} key={(index) => index}>
        {(index) => (
          <YoTextField
            block
            label={`{${index}}`}
            placeholder="参数描述"
            value={paramDescription(props.params, index)}
            onInput={(value) => props.onChange(setParamDescription(props.params, index, value))}
          />
        )}
      </YoListPresence>
    </div>
  );
}
