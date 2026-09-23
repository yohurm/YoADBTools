/**
 * 把 TransferJob 同步进文件页 YoToaster。
 * 运行中常驻；关钮走 store.dismiss（运行中即取消）；终态由 store 停留后摘卡再播出场。
 */
import { createEffect, onCleanup } from "solid-js";

import type { Toaster, ToastInput } from "@yohu/ui";

import { formatSize } from "./model";
import {
  transferToastDetail,
  transferToastLeading,
  transferToastProgress,
  transferToastTone,
  type TransferJob,
} from "./transfer-model";
import { transferStore } from "./transfers";

function transferToastMeta(job: TransferJob): string {
  const bytes = formatSize(job.bytes);
  const total = job.total ? ` / ${formatSize(job.total)}` : "";
  const speed = job.speed !== undefined && job.state === "running" ? ` · ${formatSize(job.speed)}/s` : "";
  return `${bytes}${total}${speed}`;
}

function transferToastInput(job: TransferJob): ToastInput {
  return {
    text: job.name,
    tone: transferToastTone(job.state),
    leading: transferToastLeading(job.direction),
    detail: transferToastDetail(job),
    sticky: true,
    progress: transferToastProgress(job),
    meta: transferToastMeta(job),
  };
}

export function TransferToasts(props: { toaster: Toaster }) {
  const jobToToast = new Map<number, number>();

  createEffect(() => {
    const jobs = transferStore.transfers;
    const seen = new Set<number>();
    for (const job of jobs) {
      seen.add(job.id);
      const input = transferToastInput(job);
      const toastId = jobToToast.get(job.id);
      if (toastId === undefined) {
        const id = job.id;
        jobToToast.set(
          id,
          props.toaster.show({
            ...input,
            onDismiss: () => transferStore.dismiss(id),
          }),
        );
      } else {
        props.toaster.update(toastId, input);
      }
    }
    for (const [jobId, toastId] of [...jobToToast]) {
      if (!seen.has(jobId)) {
        props.toaster.dismiss(toastId);
        jobToToast.delete(jobId);
      }
    }
  });

  onCleanup(() => {
    for (const toastId of jobToToast.values()) {
      props.toaster.dismiss(toastId);
    }
    jobToToast.clear();
  });

  return null;
}
