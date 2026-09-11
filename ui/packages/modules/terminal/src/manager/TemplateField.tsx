/**
 * 具体命令/步骤编辑：展示始终 `adb <正文>`，光标处插入下一个 `{n}`。
 * 选区记在 input 上，不挖 querySelector。
 */

import { YoButton, YoTextField } from "@yohu/ui";

import { commandBody, formatAdbLine, insertPlaceholderAtDisplay } from "../command-line";

export function TemplateField(props: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (body: string) => void;
}) {
  let input: HTMLInputElement | undefined;
  let range = { start: 0, end: 0 };

  const display = (): string => formatAdbLine("-", props.value);

  const bind = (el: HTMLInputElement): void => {
    input = el;
    if (el.dataset.slotBound === "1") return;
    el.dataset.slotBound = "1";
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
  };

  const insert = (): void => {
    const el = input;
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
      <div class="yohu-cm__template-row">
        <div class="yohu-cm__template-field">
          <YoTextField
            block
            label={props.label}
            ariaLabel={props.ariaLabel}
            value={display()}
            onInput={(v) => props.onChange(commandBody(v))}
            inputRef={bind}
          />
        </div>
        <YoButton
          type="button"
          variant="outlined"
          tone="neutral"
          size="sm"
          aria-label="在光标处插入参数"
          onClick={insert}
        >
          插入参数
        </YoButton>
      </div>
    </div>
  );
}
