/**
 * 库命令占位符填值。列出原始命令与每个独立 `{n}`（有描述则跟在标签后）。
 * 只读受控 values()，与槽位顺序对齐；禁止挖 input。
 */

import { For, createEffect, createSignal } from "solid-js";

import type { CommandParamDto } from "@yohu/api";
import { YoButton, YoDialog, YoScroller, YoSubheader, YoTextField } from "@yohu/ui";

import { formatAdbLine, paramDescription } from "./command-line";
import { PARAM_DIALOG_WIDTH } from "./layout";

export function ParameterDialog(props: {
  title: string;
  templates: readonly string[];
  params: readonly CommandParamDto[];
  slots: readonly number[];
  open: () => boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  onSubmit: (values: string[]) => void;
}) {
  const [values, setValues] = createSignal<string[]>([]);

  createEffect((wasOpen?: boolean) => {
    const now = props.open();
    if (!wasOpen && now) {
      setValues(props.slots.map(() => ""));
    }
    return now;
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
      width={PARAM_DIALOG_WIDTH}
      onClose={props.onClose}
      onExitComplete={props.onExitComplete}
      footer={
        <>
          <YoButton buttonStyle="normal" tone="accent" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={submit}>加入队列</YoButton>
        </>
      }
    >
      <YoScroller>
        <div class="yohu-terminal__params">
          <section class="yohu-terminal__params-section">
            <YoSubheader title="原始命令" pad="flush" />
            <YoTextField
              block
              readOnly
              multiline
              font="mono"
              ariaLabel="原始命令"
              rows={Math.max(1, originals().length)}
              value={originals().join("\n")}
            />
          </section>
          <section class="yohu-terminal__params-section">
            <YoSubheader title="填写参数" pad="flush" />
            <For each={props.slots}>
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
      </YoScroller>
    </YoDialog>
  );
}
