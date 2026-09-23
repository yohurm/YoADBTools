/**
 * Toast 交互策略（L3）。
 * 队列与代际是唯一写入口；宿主 data-* 从快照组装。
 * 不写色值、不画铬、不挂定时器。
 */

import { motionDurationMs } from "../tokens/motion";
import {
  applyToastPatch,
  hasToastDetail,
  hasToastLeading,
  hasToastMeta,
  hasToastProgress,
  resolveToastSpec,
  toastPaintTone,
  type ToastInput,
  type ToastItem,
  type ToastPaintTone,
  type ToastPatch,
} from "./toast-model";

export interface ToastQueue {
  generation: number;
  items: readonly ToastItem[];
  alive: boolean;
}

export function createToastQueue(): ToastQueue {
  return { generation: 0, items: [], alive: true };
}

/** 入队并递增代际。destroy 后拒绝写入。 */
export function enqueueToast(queue: ToastQueue, input: ToastInput): ToastQueue {
  if (!queue.alive) return queue;
  const spec = resolveToastSpec(input);
  const id = queue.generation + 1;
  const item: ToastItem = {
    id,
    ...spec,
    open: true,
    onDismiss: input.onDismiss,
  };
  return { generation: id, items: [...queue.items, item], alive: true };
}

/** 按代际补快照。不改 open / id / onDismiss。 */
export function updateToast(queue: ToastQueue, id: number, patch: ToastPatch): ToastQueue {
  if (!queue.alive) return queue;
  let changed = false;
  const items = queue.items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return applyToastPatch(item, patch);
  });
  return changed ? { ...queue, items } : queue;
}

/** 开始出场：只把对应代际标成 open=false。 */
export function beginDismissToast(queue: ToastQueue, id: number): ToastQueue {
  if (!queue.alive) return queue;
  let changed = false;
  const items = queue.items.map((item) => {
    if (item.id !== id || !item.open) return item;
    changed = true;
    return { ...item, open: false };
  });
  return changed ? { ...queue, items } : queue;
}

/** 出场结束卸节点。代际不匹配则原样返回。 */
export function removeToast(queue: ToastQueue, id: number): ToastQueue {
  if (!queue.alive) return queue;
  if (!queue.items.some((item) => item.id === id)) return queue;
  return { ...queue, items: queue.items.filter((item) => item.id !== id) };
}

/** 永久释放。之后 enqueue / beginDismiss / remove 都是空操作。 */
export function destroyToastQueue(queue: ToastQueue): ToastQueue {
  if (!queue.alive && queue.items.length === 0) return queue;
  return { generation: queue.generation, items: [], alive: false };
}

export function toastById(queue: ToastQueue, id: number): ToastItem | undefined {
  return queue.items.find((item) => item.id === id);
}

/** 停留时长对齐 MotionDuration toast，不含 Presence 出场。 */
export function toastHoldMs(): number {
  return motionDurationMs("toast");
}

export interface ToastHostAttrs {
  "data-tone": ToastPaintTone;
  "data-leading"?: "";
  "data-detail"?: "";
  "data-progress"?: "";
  "data-meta"?: "";
  "data-sticky"?: "";
  role: "status";
}

export function toastHostAttrs(item: ToastItem): ToastHostAttrs {
  return {
    "data-tone": toastPaintTone(item.tone),
    "data-leading": hasToastLeading(item.leading) ? "" : undefined,
    "data-detail": hasToastDetail(item.detail) ? "" : undefined,
    "data-progress": hasToastProgress(item.progress) ? "" : undefined,
    "data-meta": hasToastMeta(item.meta) ? "" : undefined,
    "data-sticky": item.sticky ? "" : undefined,
    role: "status",
  };
}

export interface ToasterHostAttrs {
  role: "region";
  "aria-label": "通知";
}

export function toasterHostAttrs(): ToasterHostAttrs {
  return {
    role: "region",
    "aria-label": "通知",
  };
}
