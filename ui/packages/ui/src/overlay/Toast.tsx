/**
 * YoToast / YoToaster（L4 视图）。
 * 队列 / 代际由 toast-policy 决定；本文件只绑定时器与快照。
 * 进出场走 YoPresence 配方 toast，禁止自写 @keyframes。
 * 容器视图：铬走 YoCorner paint；关闭走 DismissMark；进度走 progress-policy，不跨族嵌产品视图。
 */
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { DismissMark } from "../display/dismiss-mark";
import { progressFillWidth, progressHostAttrs } from "../display/progress-policy";
import { Icon, isIconName } from "../icons";
import { YoPresence } from "../motion/engines/presence";
import { Layout } from "../tokens/layout";
import type { ToastInput, ToastItem, ToastPatch, ToastTone } from "./toast-model";
import {
  beginDismissToast,
  createToastQueue,
  destroyToastQueue,
  enqueueToast,
  removeToast,
  toastById,
  toastHoldMs,
  toastHostAttrs,
  toasterHostAttrs,
  updateToast,
} from "./toast-policy";
import "./Toast.css";

export type { ToastInput, ToastItem, ToastPatch, ToastTone };

/** 模块契约：发、改、撤、毁。队列快照留给 YoToaster。 */
export interface Toaster {
  show: {
    (text: string, tone?: ToastTone): number;
    (input: ToastInput): number;
  };
  update: (id: number, patch: ToastPatch) => void;
  dismiss: (id: number) => void;
  destroy: () => void;
}

/** YoToaster 专用。不进 `@yohu/ui` 包入口。 */
export interface ToasterHost extends Toaster {
  toasts: () => readonly ToastItem[];
  forget: (id: number) => void;
}

function resolveShowInput(textOrInput: string | ToastInput, tone?: ToastTone): ToastInput {
  return typeof textOrInput === "string" ? { text: textOrInput, tone } : textOrInput;
}

/**
 * 创建一个 toaster 实例（每个实例独立维护自己的消息列表）。
 * 必须挂回树上的 YoToaster，禁止静态 Toast.success。
 */
export function createToaster(): ToasterHost {
  let queue = createToastQueue();
  const [toasts, setToasts] = createSignal<readonly ToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const commit = (next: typeof queue): void => {
    queue = next;
    setToasts(next.items);
  };

  const clearTimer = (id: number): void => {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  const armHold = (id: number): void => {
    clearTimer(id);
    const item = toastById(queue, id);
    if (!item || !item.open || item.sticky) return;
    const timer = setTimeout(() => {
      timers.delete(id);
      commit(beginDismissToast(queue, id));
    }, toastHoldMs());
    timers.set(id, timer);
  };

  const show = (textOrInput: string | ToastInput, tone?: ToastTone): number => {
    const next = enqueueToast(queue, resolveShowInput(textOrInput, tone));
    if (next === queue) return 0;
    const id = next.generation;
    commit(next);
    armHold(id);
    return id;
  };

  const update = (id: number, patch: ToastPatch): void => {
    const next = updateToast(queue, id, patch);
    if (next === queue) return;
    commit(next);
    armHold(id);
  };

  const dismiss = (id: number): void => {
    clearTimer(id);
    commit(beginDismissToast(queue, id));
  };

  const forget = (id: number): void => {
    clearTimer(id);
    commit(removeToast(queue, id));
  };

  const destroy = (): void => {
    for (const id of timers.keys()) {
      clearTimer(id);
    }
    commit(destroyToastQueue(queue));
  };

  return { toasts, show, update, dismiss, forget, destroy };
}

export interface YoToastProps {
  /** 单条消息数据 */
  toast: ToastItem;
  /** 右上角关闭。YoToaster 必传。 */
  onDismiss?: () => void;
}

function ToastLeading(props: { name: string }): JSX.Element {
  const icon = createMemo(() => (isIconName(props.name) ? props.name : undefined));
  return (
    <Show when={icon()}>
      {(name) => <Icon name={name()} size={Layout.IconSm} />}
    </Show>
  );
}

function ToastProgress(props: { toast: ToastItem }): JSX.Element {
  const input = () => ({
    value: props.toast.progress?.value,
    indeterminate: props.toast.progress?.indeterminate,
  });
  const host = createMemo(() => progressHostAttrs(input()));
  const width = createMemo(() => progressFillWidth(input()));
  return (
    <div
      class="yohu-toast__progress"
      data-mode={host()["data-mode"]}
      role={host().role}
      aria-valuemin={host()["aria-valuemin"]}
      aria-valuemax={host()["aria-valuemax"]}
      aria-valuenow={host()["aria-valuenow"]}
    >
      <YoCorner role="control" class="yohu-toast__progress-chrome" overflow="hidden">
        <div class="yohu-toast__progress-bar" style={width() ? { width: width() } : undefined} />
      </YoCorner>
    </div>
  );
}

/** 渲染单条 toast。宿主排版；圆角走 YoCorner paint；关闭走 DismissMark。 */
export function YoToast(props: YoToastProps): JSX.Element {
  const host = () => toastHostAttrs(props.toast);
  return (
    <div
      class="yohu-toast"
      data-tone={host()["data-tone"]}
      data-leading={host()["data-leading"]}
      data-detail={host()["data-detail"]}
      data-progress={host()["data-progress"]}
      data-meta={host()["data-meta"]}
      data-sticky={host()["data-sticky"]}
      role={host().role}
    >
      <YoCorner mode="paint" role="control" class="yohu-toast__chrome" />
      <Show when={props.toast.leading}>
        <span class="yohu-toast__leading" aria-hidden="true">
          <ToastLeading name={props.toast.leading} />
        </span>
      </Show>
      <div class="yohu-toast__body">
        <div class="yohu-toast__title">{props.toast.text}</div>
        <Show when={props.toast.detail}>
          <div class="yohu-toast__detail">{props.toast.detail}</div>
        </Show>
        <Show when={props.toast.progress}>
          <ToastProgress toast={props.toast} />
        </Show>
        <Show when={props.toast.meta}>
          <div class="yohu-toast__meta">{props.toast.meta}</div>
        </Show>
      </div>
      <DismissMark label={`关闭 ${props.toast.text}`} onDismiss={props.onDismiss} />
    </div>
  );
}

export interface YoToasterProps {
  toaster: Toaster;
}

function asToasterHost(toaster: Toaster): ToasterHost {
  return toaster as ToasterHost;
}

/** 渲染 toaster 消息堆栈（右下角，让过状态栏）。只按快照画。
 * For 按代际 id 排，不按对象身份：beginDismiss 换新快照时同一 Presence 从 open→closed 倒放，禁止卸了重挂导致直切。 */
export function YoToaster(props: YoToasterProps): JSX.Element {
  const host = toasterHostAttrs();
  const queue = (): ToasterHost => asToasterHost(props.toaster);
  const ids = () => queue().toasts().map((toast) => toast.id);
  return (
    <div class="yohu-toaster" role={host.role} aria-label={host["aria-label"]}>
      <For each={ids()}>
        {(id) => {
          const toast = (): ToastItem => queue().toasts().find((item) => item.id === id)!;
          return (
            <YoPresence when={toast().open} recipe="toast" onExitComplete={() => queue().forget(id)}>
              <YoToast
                toast={toast()}
                onDismiss={() => {
                  toast().onDismiss?.();
                  queue().dismiss(id);
                }}
              />
            </YoPresence>
          );
        }}
      </For>
    </div>
  );
}
