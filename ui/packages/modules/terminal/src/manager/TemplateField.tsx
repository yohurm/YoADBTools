/**
 * 具体命令/步骤编辑：展示始终 `adb <正文>`，光标处插入本行下一个 `{n}`。
 * 选区记在 input 上，不挖 querySelector。
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

import { YoButton, YoTextField, type YoTextFieldControl } from "@yohu/ui";

import { commandBody, formatAdbLine, insertPlaceholderAtDisplay } from "../command-line";

export function TemplateField(props: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (body: string) => void;
}) {
  const [input, setInput] = createSignal<YoTextFieldControl | undefined>();
  let range = { start: 0, end: 0 };

  const display = (): string => formatAdbLine("-", props.value);

  createEffect(() => {
    const el = input();
    if (!el) return;
    const save = (): void => {
      range = {
        start: el.selectionStart ?? 0,
        end: el.selectionEnd ?? el.selectionStart ?? 0,
      };
    };
    el.addEventListener("select", save);
    el.addEventListener("keyup", save);
    el.addEventListener("mouseup", save);
    el.addEventListener("focus", save);
    el.addEventListener("input", save);
    onCleanup(() => {
      el.removeEventListener("select", save);
      el.removeEventListener("keyup", save);
      el.removeEventListener("mouseup", save);
      el.removeEventListener("focus", save);
      el.removeEventListener("input", save);
    });
  });

  const insert = (): void => {
    const el = input();
    const focused = el !== undefined && document.activeElement === el;
    const start = focused ? (el.selectionStart ?? range.start) : display().length;
    const end = focused ? (el.selectionEnd ?? range.end) : start;
    const next = insertPlaceholderAtDisplay(props.value, start, end);
    props.onChange(next.body);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
      range = { start: next.caret, end: next.caret };
    });
  };

  return (
    <div class="yohu-cm__template">
      <YoTextField
        block
        label={props.label}
        ariaLabel={props.ariaLabel}
        value={display()}
        onInput={(v) => props.onChange(commandBody(v))}
        inputRef={(el) => setInput(el)}
      />
      <div class="yohu-cm__template-actions">
        <YoButton type="button" aria-label="在光标处插入参数" onClick={insert}>
          插入参数
        </YoButton>
      </div>
    </div>
  );
}
