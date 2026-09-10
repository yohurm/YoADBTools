import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoToaster, YoToast, createToaster } from "./Toast";
import { toastHoldMs } from "./toast-policy";

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
    expect(screen.getByText("失败").getAttribute("data-tone")).toBe("danger");
  });

  it("show 默认 info → accent 涂装", () => {
    const toaster = createToaster();
    render(() => <YoToaster toaster={toaster} />);
    toaster.show("提示");
    expect(screen.getByText("提示").getAttribute("data-tone")).toBe("accent");
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

  it("toasts 访问器暴露当前消息", () => {
    const toaster = createToaster();
    expect(toaster.toasts()).toEqual([]);
    toaster.show("一条");
    expect(toaster.toasts()).toHaveLength(1);
    expect(toaster.toasts()[0]).toMatchObject({ text: "一条", tone: "info", open: true });
  });

  it("destroy 后 show 不再入队", () => {
    const toaster = createToaster();
    toaster.show("一条");
    toaster.destroy();
    expect(toaster.toasts()).toEqual([]);
    toaster.show("二条");
    expect(toaster.toasts()).toEqual([]);
  });
});

describe("YoToast", () => {
  it("渲染单条 toast，不使用旧 tone class", () => {
    render(() => <YoToast toast={{ id: 1, text: "单条", tone: "success", open: true }} />);
    const el = screen.getByText("单条");
    expect(el.className).toContain("yohu-toast");
    expect(el.className).not.toContain("yohu-toast--success");
    expect(el.getAttribute("data-tone")).toBe("success");
    expect(el.getAttribute("role")).toBe("status");
  });
});
