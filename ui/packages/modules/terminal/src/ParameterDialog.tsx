/**
 * 库命令占位符填值。原文 + 填参栏。
 * 命令标签 `{n}`；块标签 `1-0`。只读受控 values()，与 FillField 顺序对齐。
 */

import { For, createEffect, createMemo, createSignal } from "solid-js";

import type { LibraryEntryDto } from "@yohu/api";
import { YoButton, YoDialog, YoScroller, YoSubheader, YoTextField } from "@yohu/ui";

import { entryFillFields, entryTemplates, formatAdbLine, type FillField } from "./command-line";
import { PARAM_DIALOG_WIDTH } from "./layout";

function fieldLabel(field: FillField): string {
  return field.description ? `${field.label} ${field.description}` : field.label;
}

export function ParameterDialog(props: {
  title: string;
  entry: LibraryEntryDto | null;
  open: () => boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  onSubmit: (values: string[]) => void;
}) {
  const [values, setValues] = createSignal<string[]>([]);
  const fields = createMemo(() => (props.entry ? entryFillFields(props.entry) : []));

  createEffect((wasOpen?: boolean) => {
    const now = props.open();
    if (!wasOpen && now) {
      setValues(fields().map(() => ""));
    }
    return now;
  });

  const originals = (): string[] =>
    props.entry ? entryTemplates(props.entry).map((template) => formatAdbLine("-", template)) : [];

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
            <For each={fields()}>
              {(field, position) => (
                <YoTextField
                  block
                  label={fieldLabel(field)}
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
