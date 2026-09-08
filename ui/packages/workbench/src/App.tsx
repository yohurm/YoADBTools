/**
 * 应用组合根：模块注册（静态组合）→ 布局渲染 → 启动任务。
 * 窗口三键在此接线 Tauri 2（YoTitleBar 只收回调）。
 */

import { Component, createSignal, onCleanup, onMount } from "solid-js";

import {
  ModuleId,
  ModuleTitle,
  listenWindowResize,
  systemReportError,
  windowClose,
  windowIsMaximized,
  windowMinimize,
  windowToggleMaximize,
  YoLog,
} from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

import { runBootPipeline } from "./boot";
import { registerModule } from "./registry";
import { SettingsView } from "./settings/SettingsView";
import { AppLayout } from "./shell/AppLayout";
import { deviceStore, settingsStore } from "./stores";

// 工作区模块由 apps/shell 注册。设置页是壳内建，不走 modules 包。

registerModule({
  id: ModuleId.Settings,
  title: ModuleTitle.Settings,
  icon: "settings",
  selectionMode: "none",
  kind: "system",
  Component: SettingsView,
});

export const App: Component = () => {
  const [activeModuleId, setActiveModuleId] = createSignal(ModuleId.Terminal);
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    let disposed = false;
    // 外观跟随设置（加载前先用当前快照兜底）
    setTheme(settingsStore.state.theme);
    setDensity(settingsStore.state.density);

    // 原生小窗已显示；此处加载工作台，就绪后揭主窗并关掉小窗。
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

    const syncMaximized = (): void => {
      void windowIsMaximized().then(setMaximized);
    };
    syncMaximized();
    // 退订竞态：监听可能在 cleanup 之后才 resolve，需在 resolve 时检查是否已卸载。
    let unlistenResize: (() => void) | undefined;
    void listenWindowResize(syncMaximized).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlistenResize = fn;
      }
    });
    onCleanup(() => {
      disposed = true;
      unlistenResize?.();
    });

    // 前端全局错误上报（应用操作日志，与设备日志分离）
    YoLog.info("shell", "UI 已挂载");
    window.addEventListener("error", (e) => {
      YoLog.error("shell", `JS: ${e.message}`);
      void systemReportError(`JS: ${e.message}`);
    });
  });

  return (
    <AppLayout
      activeModuleId={activeModuleId}
      onNavigate={setActiveModuleId}
      maximized={maximized()}
      onMinimize={() => void windowMinimize()}
      onToggleMaximize={() => {
        void windowToggleMaximize().then(() => void windowIsMaximized().then(setMaximized));
      }}
      onClose={() => void windowClose()}
      nativeCaptions={settingsStore.os() === "macos"}
    />
  );
};
