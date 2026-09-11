/**
 * 路径行：上级 + 地址铬。
 * 铬 = 浏览态面包屑簇（含一小段空白热区）或编辑态输入盒。盒外不是路径栏。
 * 打开手势 pointerup 后再 focus，避免 Chromium mouseup 全选。
 * 展开 / 收回只 clip 输入铬；面包屑在 held 期间退出文档流。
 * 输入不受控。展开不预选，光标在末尾。
 */

import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { YoIconButton, YoTooltip, motionSpecMs } from "@yohu/ui";

import {
  addressDismissOutside,
  addressOpenCaret,
  addressScrollPin,
  isAddressVacantClick,
} from "./address-edit";
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
  const [pointerGate, setPointerGate] = createSignal(false);
  let fieldEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let releasePointer: (() => void) | undefined;

  const pinFieldToCaret = (): void => {
    const field = fieldEl;
    const input = inputEl;
    if (!field || !input) return;
    const pin = addressScrollPin(
      { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 },
      input.value.length,
    );
    if (pin === "start") {
      field.scrollLeft = 0;
      return;
    }
    if (pin === "end") {
      field.scrollLeft = Math.max(0, field.scrollWidth - field.clientWidth);
    }
  };

  const focusField = (placeOpenCaret: boolean): void => {
    const el = inputEl;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (placeOpenCaret) {
      const caret = addressOpenCaret(el.value);
      el.setSelectionRange(caret.start, caret.end);
    }
    pinFieldToCaret();
  };

  const clearPointerGate = (focus: boolean): void => {
    setPointerGate(false);
    releasePointer?.();
    releasePointer = undefined;
    if (focus) requestAnimationFrame(() => focusField(true));
  };

  const armPointerGate = (): void => {
    setPointerGate(true);
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      clearPointerGate(true);
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    releasePointer = () => {
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
    };
  };

  const startEdit = (fromPointer: boolean): void => {
    if (held()) return;
    setSeed(fileStore.session.path);
    setInvalid(false);
    if (fromPointer) armPointerGate();
    else setPointerGate(false);
    setHeld(true);
    requestAnimationFrame(() => setOpen(true));
  };

  const onPathPointerDown = (event: PointerEvent): void => {
    if (!isAddressVacantClick(event.target, event.currentTarget as Element)) return;
    event.preventDefault();
    startEdit(true);
  };

  const stopEdit = (): void => {
    if (!held() || !open()) return;
    setInvalid(false);
    clearPointerGate(false);
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
    props.api?.({ open: () => startEdit(false) });
    onCleanup(() => releasePointer?.());
  });

  createEffect(() => {
    const path = seed();
    if (!held()) return;
    if (inputEl) inputEl.value = path;
  });

  createEffect(() => {
    if (!open() || pointerGate()) return;
    const frame = requestAnimationFrame(() => focusField(true));
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
    if (!open() || pointerGate()) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!addressDismissOutside(event.target, fieldEl ?? null)) return;
      stopEdit();
    };
    document.addEventListener("pointerdown", onPointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown));
  });

  return (
    <div class="yohu-files__path" onPointerDown={onPathPointerDown}>
      <span data-address="up">
        <YoIconButton
          icon="chevron-up"
          title="上级目录"
          disabled={parentWithinSafety(fileStore.session.path) === null}
          onClick={() => {
            stopEdit();
            void fileStore.goUp();
          }}
        />
      </span>
      <div class="yohu-files__slot" data-address="slot">
        <nav class="yohu-files__crumbs" aria-label="当前路径" inert={held() || undefined}>
          <For each={splitPath(fileStore.session.path)}>
            {(segment, index) => <Crumb segment={segment} index={index()} />}
          </For>
          <YoTooltip content="输入路径" stretch>
            <button
              type="button"
              class="yohu-files__slot-hit"
              data-address="hit"
              aria-label="输入路径"
              onPointerDown={(event) => event.preventDefault()}
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
            data-address="field"
            data-reveal={open() ? "1" : "0"}
            data-gate={pointerGate() ? "" : undefined}
            onTransitionEnd={(event) => {
              if (event.target !== fieldEl || event.propertyName !== "clip-path") return;
              if (!open()) finishClose();
            }}
          >
            <input
              ref={(el) => {
                inputEl = el;
                el.value = seed();
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
          data-address="crumb"
          onClick={() => void fileStore.goTo(target())}
        >
          {props.segment}
        </button>
      </YoTooltip>
    </>
  );
}
