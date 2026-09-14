/**
 * 应用组合根：登记设置页、挂窗口铬、跑启动编排。
 * 窗口三键与模块身份在 store；本文件不直连 IPC。
 */

import { Component, onCleanup, onMount } from "solid-js";

import { systemReportError, YoLog } from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

import { runBootPipeline } from "./boot";
import "./register";
import { AppLayout } from "./shell/AppLayout";
import { deviceStore, settingsStore, taskStore, updateStore, windowStore } from "./stores";

export const App: Component = () => {
  onMount(() => {
    let disposed = false;
    setTheme(settingsStore.state.theme);
    setDensity(settingsStore.state.density);
    deviceStore.bindIpc();
    taskStore.bindIpc();
    updateStore.bindIpc();

    const detachWindow = windowStore.attach();

    void runBootPipeline({
      load: async () => {
        await Promise.all([settingsStore.load(), deviceStore.load()]);
        YoLog.info("shell", "设置已加载", { theme: settingsStore.state.theme });
      },
      refresh: () => {
        if (!disposed) {
          void deviceStore.refresh();
        }
      },
    });

    YoLog.info("shell", "UI 已挂载");
    const onError = (e: ErrorEvent): void => {
      YoLog.error("shell", `JS: ${e.message}`);
      void systemReportError(`JS: ${e.message}`);
    };
    window.addEventListener("error", onError);
    onCleanup(() => {
      disposed = true;
      detachWindow();
      window.removeEventListener("error", onError);
    });
  });

  return <AppLayout />;
};
