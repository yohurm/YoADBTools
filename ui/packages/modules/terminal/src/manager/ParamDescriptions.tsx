/**
 * 一条模板上的 `{n}` 描述。命令标签 `{n}`；步骤标签 `1-0`。
 * 增删走公开 YoListPresence（配方 list），禁止本模块自写进出场。
 */

import type { CommandParamDto } from "@yohu/api";
import { YoListPresence, YoPresence, YoSubheader, YoTextField } from "@yohu/ui";

import { paramDescription, setParamDescription } from "../command-line";

export function ParamDescriptions(props: {
  slots: number[];
  params: CommandParamDto[];
  labelOf?: (index: number) => string;
  title?: string;
  onChange: (params: CommandParamDto[]) => void;
}) {
  const labelOf = (index: number): string => props.labelOf?.(index) ?? `{${index}}`;
  return (
    <div class="yohu-cm__param-descs" aria-label="参数描述">
      <YoPresence when={props.slots.length > 0} recipe="list">
        <YoSubheader title={props.title ?? "参数描述"} pad="flush" />
      </YoPresence>
      <YoListPresence each={props.slots} key={(index) => index}>
        {(index) => (
          <YoTextField
            block
            label={labelOf(index)}
            placeholder="参数描述"
            value={paramDescription(props.params, index)}
            onInput={(value) => props.onChange(setParamDescription(props.params, index, value))}
          />
        )}
      </YoListPresence>
    </div>
  );
}
