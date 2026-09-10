import { describe, expect, it } from "vitest";
import { motionDurationMs } from "../tokens/motion";
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
} from "./toast-policy";

describe("toast-policy", () => {
  it("入队递增代际，默认 info", () => {
    const first = enqueueToast(createToastQueue(), { text: "一条" });
    expect(first.generation).toBe(1);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ id: 1, text: "一条", tone: "info", open: true });

    const second = enqueueToast(first, { text: "两条", tone: "success" });
    expect(second.generation).toBe(2);
    expect(second.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it("beginDismiss 只关对应代际", () => {
    const queued = enqueueToast(enqueueToast(createToastQueue(), { text: "一" }), { text: "二" });
    const closing = beginDismissToast(queued, 1);
    expect(toastById(closing, 1)?.open).toBe(false);
    expect(toastById(closing, 2)?.open).toBe(true);
  });

  it("remove 按代际卸节点，错过的 id 不改队列", () => {
    const queued = enqueueToast(createToastQueue(), { text: "一" });
    expect(removeToast(queued, 99)).toBe(queued);
    expect(removeToast(queued, 1).items).toEqual([]);
  });

  it("destroy 后拒绝写入且幂等", () => {
    const queued = enqueueToast(createToastQueue(), { text: "一" });
    const dead = destroyToastQueue(queued);
    expect(dead.alive).toBe(false);
    expect(dead.items).toEqual([]);
    expect(enqueueToast(dead, { text: "二" })).toBe(dead);
    expect(beginDismissToast(dead, 1)).toBe(dead);
    expect(removeToast(dead, 1)).toBe(dead);
    expect(destroyToastQueue(dead)).toBe(dead);
  });

  it("停留时长走 MotionSpec toast，不另写毫秒", () => {
    expect(toastHoldMs()).toBe(motionDurationMs("toast"));
    expect(toastHoldMs()).toBeLessThanOrEqual(3000);
  });

  it("单条宿主属性用 Button 涂装名", () => {
    const attrs = toastHostAttrs({ id: 1, text: "失败", tone: "error", open: true });
    expect(attrs).toEqual({ "data-tone": "danger", role: "status" });
  });

  it("堆栈宿主是通知 region", () => {
    expect(toasterHostAttrs()).toEqual({ role: "region", "aria-label": "通知" });
  });
});
