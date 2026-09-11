/**
 * YoToast / YoToaster（L4 视图）。
 * 队列 / 代际由 toast-policy 决定；本文件只绑定时器与快照。
 * 进出场走 YoPresence 配方 toast，禁止自写 @keyframes。
 */
import { For, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { YoPresence } from "../motion/presence";
import type { ToastItem, ToastTone } from "./toast-model";
import {
  beginDismissToast,
  createToastQueue,
  destroyToastQueue,
  enqueueToast,
  removeToast,
  toastHoldMs,
  toastHostAttrs,
  toasterHostAttrs,
} from "./toast-policy";
import "./Toast.css";

export type { ToastItem, ToastTone };

/** 模块契约：只发、撤、毁。队列快照留给 YoToaster。 */
export interface Toaster {
  show: (text: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  destroy: () => void;
}

/** YoToaster 专用。不进 `@yohu/ui` 包入口。 */
export interface ToasterHost extends Toaster {
  toasts: () => readonly ToastItem[];
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

  const dismiss = (id: number): void => {
    clearTimer(id);
    commit(removeToast(queue, id));
  };

  const show = (text: string, tone?: ToastTone): void => {
    const next = enqueueToast(queue, { text, tone });
    if (next === queue) return;
    const id = next.generation;
    commit(next);
    const timer = setTimeout(() => {
      timers.delete(id);
      commit(beginDismissToast(queue, id));
    }, toastHoldMs());
    timers.set(id, timer);
  };

  const destroy = (): void => {
    for (const id of timers.keys()) {
      clearTimer(id);
    }
    commit(destroyToastQueue(queue));
  };

  return { toasts, show, dismiss, destroy };
}

export interface YoToastProps {
  /** 单条消息数据 */
  toast: ToastItem;
}

/** 渲染单条 toast。内容区 = 文案，圆角内裁剪。 */
export function YoToast(props: YoToastProps): JSX.Element {
  const host = () => toastHostAttrs(props.toast);
  return (
    <div class="yohu-toast" data-tone={host()["data-tone"]} role={host().role}>
      {props.toast.text}
    </div>
  );
}

export interface YoToasterProps {
  toaster: Toaster;
}

function asToasterHost(toaster: Toaster): ToasterHost {
  return toaster as ToasterHost;
}

/** 渲染 toaster 消息堆栈（右上角）。只按快照画。 */
export function YoToaster(props: YoToasterProps): JSX.Element {
  const host = toasterHostAttrs();
  const queue = (): ToasterHost => asToasterHost(props.toaster);
  return (
    <div class="yohu-toaster" role={host.role} aria-label={host["aria-label"]}>
      <For each={queue().toasts()}>
        {(toast) => (
          <YoPresence when={toast.open} recipe="toast" onExitComplete={() => queue().dismiss(toast.id)}>
            <YoToast toast={toast} />
          </YoPresence>
        )}
      </For>
    </div>
  );
}
