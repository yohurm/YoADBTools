/**
 * 具体命令/步骤编辑：展示始终 `adb <正文>`，光标处插入本行下一个 `{n}`。
 * 选区记在 input 上，不挖 querySelector。
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

import { commandBody } from "@yohu/api";
import { YoButton, YoTextField, type YoTextFieldControl } from "@yohu/ui";

import { commandCopyText, insertPlaceholderAtDisplay } from "../command-line";

function caretSpan(caret: number): { start: number; end: number } {
  return { start: caret, end: caret };
}

export function TemplateField(props: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (body: string) => void;
}) {
  const [input, setInput] = createSignal<YoTextFieldControl | undefined>();
  let range = { start: 0, end: 0 };

  const display = (): string => commandCopyText(props.value);

  function fieldEl(): YoTextFieldControl | undefined {
    return input();
  }

  createEffect(() => {
    const el = fieldEl();
    if (!el) return;
    const save = (): void => {
      range = {
        start: el.selectionStart ?? 0,
        end: el.selectionEnd ?? el.selectionStart ?? 0,
      };
    };
    const listen = (type: "select" | "keyup" | "mouseup" | "focus" | "input"): (() => void) => {
      el.addEventListener(type, save);
      return () => el.removeEventListener(type, save);
    };
    const stopSelect = listen("select");
    const stopKeyup = listen("keyup");
    const stopMouseup = listen("mouseup");
    const stopFocus = listen("focus");
    const stopInput = listen("input");
    onCleanup(() => {
      stopSelect();
      stopKeyup();
      stopMouseup();
      stopFocus();
      stopInput();
    });
  });

  const insert = (): void => {
    const el = fieldEl();
    const focused = el !== undefined && document.activeElement === el;
    const start = focused ? (el.selectionStart ?? range.start) : display().length;
    const end = focused ? (el.selectionEnd ?? range.end) : start;
    const next = insertPlaceholderAtDisplay(props.value, start, end);
    props.onChange(next.body);
    const span = caretSpan(next.caret);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(span.start, span.end);
      range = span;
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
