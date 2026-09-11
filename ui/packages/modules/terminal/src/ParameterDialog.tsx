/**
 * 库命令占位符填值。列出原始命令与每个独立 `{n}`（有描述则跟在标签后）。
 * 只读受控 values()，与槽位顺序对齐；禁止挖 input。
 */

import { For, createEffect, createSignal } from "solid-js";

import type { CommandParamDto } from "@yohu/api";
import { YoButton, YoDialog, YoTextField } from "@yohu/ui";

import { formatAdbLine, paramDescription } from "./command-line";

export function ParameterDialog(props: {
  title: string;
  templates: readonly string[];
  params: readonly CommandParamDto[];
  slots: readonly number[];
  open: () => boolean;
  onClose: () => void;
  onSubmit: (values: string[]) => void;
}) {
  const [values, setValues] = createSignal<string[]>([]);

  createEffect(() => {
    if (props.open()) {
      setValues(props.slots.map(() => ""));
    }
  });

  const originals = (): string[] => props.templates.map((template) => formatAdbLine("-", template));

  const fieldLabel = (index: number): string => {
    const description = paramDescription(props.params, index).trim();
    return description ? `{${index}} ${description}` : `{${index}}`;
  };

  const submit = (): void => {
    props.onSubmit(values());
    props.onClose();
  };

  return (
    <YoDialog
      open={props.open}
      title={`填写参数: ${props.title}`}
      width={480}
      onClose={props.onClose}
      footer={
        <>
          <YoButton variant="ghost" tone="neutral" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={submit}>加入队列</YoButton>
        </>
      }
    >
      <div class="yohu-terminal__params">
        <section class="yohu-terminal__params-section">
          <p class="yohu-terminal__params-caption">原始命令</p>
          <For each={originals()}>{(line) => <p class="yohu-terminal__params-line">{line}</p>}</For>
        </section>
        <section class="yohu-terminal__params-section">
          <p class="yohu-terminal__params-caption">填写参数</p>
          <For each={() => props.slots}>
            {(index, position) => (
              <YoTextField
                block
                label={fieldLabel(index)}
                value={values()[position()] ?? ""}
                onInput={(v) =>
                  setValues((vs) => vs.map((old, i) => (i === position() ? v : old)))
                }
              />
            )}
          </For>
        </section>
      </div>
    </YoDialog>
  );
}
