/**
 * 路径行：上级 + 一条地址槽。
 * 展开 / 收回只动 clip-path。输入盒走 field-sizing:content（固有宽跟 value），
 * 禁止指定 width、禁止逐字改 style.width。槽是视野；光标在两端时只滚 field。
 * 输入不受控，避免父级重绘清掉全选。
 * 这是路径编辑（面包屑同格揭开），不是第二套输入皮；不能塞进 YoTextField。
 */

import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { YoIconButton, YoTooltip, motionSpecMs } from "@yohu/ui";

import { parentWithinSafety, splitPath } from "./model";
import { resolveRemotePath } from "./path-resolve";
import { fileStore } from "./store";

export type AddressSlotApi = {
  open: () => void;
};

const CLIP_MS = motionSpecMs("spatialLocal") + 50;

export function AddressSlot(props: { api?: (slot: AddressSlotApi) => void }) {
  const [open, setOpen] = createSignal(false);
  const [held, setHeld] = createSignal(false);
  const [seed, setSeed] = createSignal(fileStore.session.path);
  const [invalid, setInvalid] = createSignal(false);
  let slotEl: HTMLDivElement | undefined;
  let fieldEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;

  const pinFieldToCaret = (): void => {
    const field = fieldEl;
    const input = inputEl;
    if (!field || !input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const all = start === 0 && end === input.value.length && end > 0;
    if (all || start === 0 && end === 0) {
      field.scrollLeft = 0;
      return;
    }
    if (start === end && end >= input.value.length) {
      field.scrollLeft = Math.max(0, field.scrollWidth - field.clientWidth);
    }
  };

  const selectPath = (): void => {
    const el = inputEl;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, el.value.length);
    if (fieldEl) fieldEl.scrollLeft = 0;
  };

  const startEdit = (): void => {
    setSeed(fileStore.session.path);
    setInvalid(false);
    setHeld(true);
    requestAnimationFrame(() => setOpen(true));
  };

  const stopEdit = (): void => {
    if (!held() || !open()) return;
    setInvalid(false);
    setOpen(false);
  };

  const finishClose = (): void => {
    if (open()) return;
    setHeld(false);
  };

  const commit = (): void => {
    const resolved = resolveRemotePath(inputEl?.value ?? seed(), fileStore.session.path);
    if (!resolved.ok) {
      setInvalid(true);
      fileStore.notifyError(resolved.reason);
      return;
    }
    void fileStore.goTo(resolved.path).then((ok) => {
      if (ok) stopEdit();
      else setInvalid(true);
    });
  };

  onMount(() => {
    props.api?.({ open: startEdit });
  });

  createEffect(() => {
    const path = seed();
    if (inputEl) inputEl.value = path;
    if (!open()) return;
    const frame = requestAnimationFrame(selectPath);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  createEffect((wasOpen?: boolean) => {
    const now = open();
    if (wasOpen && !now) {
      const timer = window.setTimeout(finishClose, CLIP_MS);
      onCleanup(() => window.clearTimeout(timer));
    }
    return now;
  });

  createEffect(() => {
    if (!open()) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && slotEl?.contains(target)) return;
      stopEdit();
    };
    document.addEventListener("pointerdown", onPointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown));
  });

  return (
    <div class="yohu-files__path">
      <YoIconButton
        icon="chevron-up"
        title="上级目录"
        disabled={parentWithinSafety(fileStore.session.path) === null}
        onClick={() => {
          stopEdit();
          void fileStore.goUp();
        }}
      />
      <div
        ref={(el) => {
          slotEl = el;
        }}
        class="yohu-files__slot"
      >
        <nav class="yohu-files__crumbs" aria-label="当前路径" inert={held() || undefined}>
          <For each={splitPath(fileStore.session.path)}>
            {(segment, index) => <Crumb segment={segment} index={index()} />}
          </For>
          <YoTooltip content="输入路径" block>
            <button
              type="button"
              class="yohu-files__slot-hit"
              aria-label="输入路径"
              onPointerDown={(event) => event.preventDefault()}
              onClick={startEdit}
            />
          </YoTooltip>
        </nav>
        <Show when={held()}>
          <div
            ref={(el) => {
              fieldEl = el;
            }}
            class="yohu-files__field"
            classList={{ "yohu-files__field--invalid": invalid() }}
            data-reveal={open() ? "1" : "0"}
            onTransitionEnd={(event) => {
              if (event.target !== fieldEl || event.propertyName !== "clip-path") return;
              if (open()) selectPath();
              else finishClose();
            }}
          >
            <input
              ref={(el) => {
                inputEl = el;
              }}
              class="yohu-files__field-input"
              spellcheck={false}
              autocomplete="off"
              aria-label="设备路径"
              aria-invalid={invalid()}
              onInput={() => {
                setInvalid(false);
                pinFieldToCaret();
              }}
              onSelect={pinFieldToCaret}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  stopEdit();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
            />
          </div>
        </Show>
      </div>
    </div>
  );
}

function Crumb(props: { segment: string; index: number }) {
  const segments = () => splitPath(fileStore.session.path);
  const target = () => `/${segments().slice(0, props.index + 1).join("/")}`;
  return (
    <>
      <Show when={props.index > 0}>
        <span class="yohu-files__crumb-sep" aria-hidden="true">
          ▸
        </span>
      </Show>
      <YoTooltip content={target()}>
        <button
          type="button"
          class="yohu-files__crumb yohu-interactive yohu-focus-ring"
          classList={{ "yohu-files__crumb--current": props.index === segments().length - 1 }}
          onClick={() => void fileStore.goTo(target())}
        >
          {props.segment}
        </button>
      </YoTooltip>
    </>
  );
}
