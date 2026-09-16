/**
 * YoAddressField —— 地址铬（L4）。
 * 浏览态面包屑簇（含短热区）或编辑态 hug 输入盒。不是 YoTextField。
 * 打开手势 pointerup 后再 focus，避免 Chromium mouseup 全选。
 * 展开 / 收回只 clip 输入铬；面包屑在 held 期间退出文档流。
 * 输入不受控。展开不预选，光标在末尾。业务导航留在模块。
 */
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { motionSpecMs } from "../tokens";
import { YoTooltip } from "../overlay/Tooltip";
import {
  addressCrumbPath,
  addressDismissOutside,
  addressOpenCaret,
  addressScrollPin,
  isAddressVacantClick,
} from "./address-field-model";
import "./AddressField.css";

export type YoAddressFieldApi = {
  open: () => void;
  close: () => void;
};

export interface YoAddressFieldProps {
  path: string;
  segments: readonly string[];
  crumbsLabel?: string;
  inputLabel?: string;
  hitLabel?: string;
  onNavigate: (path: string) => void;
  onCommit: (value: string) => Promise<boolean>;
  api?: (slot: YoAddressFieldApi) => void;
}

const CLIP_MS = motionSpecMs("spatialLocal");

export function YoAddressField(props: YoAddressFieldProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [held, setHeld] = createSignal(false);
  const [seed, setSeed] = createSignal(props.path);
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
    setSeed(props.path);
    setInvalid(false);
    if (fromPointer) armPointerGate();
    else setPointerGate(false);
    setHeld(true);
    requestAnimationFrame(() => setOpen(true));
  };

  const onSlotPointerDown = (event: PointerEvent): void => {
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
    void props.onCommit(inputEl?.value ?? seed()).then((ok) => {
      if (ok) stopEdit();
      else setInvalid(true);
    });
  };

  onMount(() => {
    props.api?.({ open: () => startEdit(false), close: () => stopEdit() });
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
    <div class="yohu-address" data-address="slot" onPointerDown={onSlotPointerDown}>
      <nav
        class="yohu-address__crumbs"
        aria-label={props.crumbsLabel ?? "当前路径"}
        inert={held() || undefined}
      >
        <For each={[...props.segments]}>
          {(segment, index) => (
            <Crumb
              segment={segment}
              index={index()}
              last={index() === props.segments.length - 1}
              onNavigate={() => props.onNavigate(addressCrumbPath(props.segments, index()))}
            />
          )}
        </For>
        <YoTooltip content={props.hitLabel ?? "输入路径"} stretch>
          <button
            type="button"
            class="yohu-address__hit"
            data-address="hit"
            aria-label={props.hitLabel ?? "输入路径"}
            onPointerDown={(event) => event.preventDefault()}
          />
        </YoTooltip>
      </nav>
      <Show when={held()}>
        <div
          ref={(el) => {
            fieldEl = el;
          }}
          class="yohu-address__field"
          classList={{ "yohu-address__field--invalid": invalid() }}
          data-address="field"
          data-reveal={open() ? "1" : "0"}
          data-gate={pointerGate() ? "" : undefined}
          onTransitionEnd={(event) => {
            if (event.target !== fieldEl || event.propertyName !== "clip-path") return;
            if (!open()) finishClose();
          }}
        >
          <YoCorner role="control" class="yohu-address__field-chrome">
            <input
              ref={(el) => {
                inputEl = el;
                el.value = seed();
              }}
              class="yohu-address__field-input"
              spellcheck={false}
              autocomplete="off"
              aria-label={props.inputLabel ?? "路径"}
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
          </YoCorner>
        </div>
      </Show>
    </div>
  );
}

function Crumb(props: {
  segment: string;
  index: number;
  last: boolean;
  onNavigate: () => void;
}): JSX.Element {
  return (
    <>
      <Show when={props.index > 0}>
        <span class="yohu-address__crumb-sep" aria-hidden="true">
          ▸
        </span>
      </Show>
      <button
        type="button"
        class="yohu-address__crumb yohu-interactive yohu-focus-ring"
        classList={{ "yohu-address__crumb--current": props.last }}
        data-address="crumb"
        onClick={() => props.onNavigate()}
      >
        {props.segment}
      </button>
    </>
  );
}
