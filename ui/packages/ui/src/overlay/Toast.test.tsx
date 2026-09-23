import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToaster, YoToast, createToaster, type ToasterHost } from "./Toast";
import { resolveToastSpec } from "./toast-model";
import { toastHoldMs } from "./toast-policy";
import * as reduced from "../motion/reduced";

const toastCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Toast.css"), "utf-8");

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function item(text: string, extra: Partial<ReturnType<typeof resolveToastSpec>> = {}) {
  return { id: 1, open: true, ...resolveToastSpec({ text, ...extra }) };
}

describe("createToaster + YoToaster", () => {
  it("show 后渲染 toast，且必须挂回 Host", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    toaster.show("操作成功", "success");
    expect(screen.getByText("操作成功")).toBeTruthy();
  });

  it("公开 tone 映射到 Button 涂装 data-tone", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    toaster.show("失败", "error");
    expect(screen.getByText("失败").closest(".yohu-toast")?.getAttribute("data-tone")).toBe("danger");
  });

  it("show 默认 info → accent 涂装", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    toaster.show("提示");
    expect(screen.getByText("提示").closest(".yohu-toast")?.getAttribute("data-tone")).toBe("accent");
  });

  it("多条消息堆叠渲染", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    toaster.show("第一条");
    toaster.show("第二条");
    expect(screen.getByText("第一条")).toBeTruthy();
    expect(screen.getByText("第二条")).toBeTruthy();
  });

  it("toast 时长后开始出场并卸节点", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const toaster = createToaster();
      render(() => <YoToaster toaster={toaster} />);
      toaster.show("临时消息");
      expect(screen.getByText("临时消息")).toBeTruthy();
      vi.advanceTimersByTime(toastHoldMs());
      expect(screen.queryByText("临时消息")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sticky 不走停留定时器", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const toaster = createToaster();
      render(() => <YoToaster toaster={toaster} />);
      toaster.show({ text: "传输中", sticky: true });
      vi.advanceTimersByTime(toastHoldMs());
      expect(screen.getByText("传输中")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("update 补进度与明细", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    const id = toaster.show({ text: "shot.png", sticky: true, detail: "传输中" });
    toaster.update(id, { detail: "完成", progress: null, tone: "success" });
    expect(screen.getByText("完成")).toBeTruthy();
    expect(screen.getByText("shot.png").closest(".yohu-toast")?.getAttribute("data-tone")).toBe("success");
  });

  it("dismiss 按 id 留下 Presence closed，倒放而不是直切卸节点", async () => {
    const skip = vi.spyOn(reduced, "shouldSkipMotion").mockReturnValue(false);
    try {
      const toaster = createToaster();
      render(() => <YoToaster toaster={toaster} />);
      toaster.show("临时消息");
      await nextPaint();
      expect(document.querySelector(".yohu-presence")?.getAttribute("data-state")).toBe("open");
      toaster.dismiss(toaster.toasts()[0]!.id);
      expect(screen.getByText("临时消息")).toBeTruthy();
      expect(document.querySelector(".yohu-presence")?.getAttribute("data-state")).toBe("closed");
    } finally {
      skip.mockRestore();
    }
  });

  it("Host 经内部队列读当前消息", () => {
    const toaster: ToasterHost = createToaster();
    expect(toaster.toasts()).toEqual([]);
    toaster.show("一条");
    expect(toaster.toasts()).toHaveLength(1);
    expect(toaster.toasts()[0]).toMatchObject({ text: "一条", tone: "info", open: true, sticky: false });
  });

  it("show 返回代际，destroy 后不再入队", () => {
    const toaster: ToasterHost = createToaster();
    expect(toaster.show("一条")).toBe(1);
    toaster.destroy();
    expect(toaster.toasts()).toEqual([]);
    expect(toaster.show("二条")).toBe(0);
    expect(toaster.toasts()).toEqual([]);
  });
});

describe("YoToast", () => {
  it("渲染单条 toast，不使用旧 tone class", () => {
    render(() => <YoToast toast={item("单条", { tone: "success" })} />);
    const el = screen.getByText("单条").closest(".yohu-toast");
    expect(el?.className).toContain("yohu-toast");
    expect(el?.className).not.toContain("yohu-toast--success");
    expect(el?.getAttribute("data-tone")).toBe("success");
    expect(el?.getAttribute("role")).toBe("status");
    expect(el?.querySelector(".yohu-toast__chrome")).toBeTruthy();
    expect(el?.querySelector(".yohu-recipe-dismiss")).toBeTruthy();
    expect(el?.querySelector(".yohu-recipe-dismiss")?.getAttribute("aria-label")).toBe("关闭 单条");
    expect(toastCss).not.toContain(".yohu-corner__content");
    expect(toastCss).not.toContain("position: absolute");
    expect(toastCss).not.toContain(".yohu-toast__close");
    expect(toastCss).not.toContain("background-color: var(--yohu-fg-2)");
  });

  it("前导、明细、进度与元数据按 data-* 开槽", () => {
    render(() => (
      <YoToast
        toast={item("shot.png", {
          leading: "arrow-up",
          detail: "传输中",
          meta: "10 / 99",
          progress: { value: 10 },
          sticky: true,
        })}
      />
    ));
    const el = screen.getByText("shot.png").closest(".yohu-toast");
    expect(el?.getAttribute("data-leading")).toBe("");
    expect(el?.getAttribute("data-detail")).toBe("");
    expect(el?.getAttribute("data-progress")).toBe("");
    expect(el?.getAttribute("data-meta")).toBe("");
    expect(el?.getAttribute("data-sticky")).toBe("");
    expect(screen.getByText("传输中")).toBeTruthy();
    expect(screen.getByText("10 / 99")).toBeTruthy();
    expect(el?.querySelector(".yohu-toast__progress")).toBeTruthy();
  });

  it("堆栈钉在窗口右下角，底边让过状态栏", () => {
    expect(toastCss).toContain("right: var(--yohu-space-md)");
    expect(toastCss).toContain("bottom: calc(var(--yohu-control-height-sm) + var(--yohu-space-md))");
    expect(toastCss).not.toContain("top: var(--yohu-space-md)");
  });
});
