/**
 * 应用组合根：登记设置页、挂窗口铬、跑启动编排。
 * 窗口三键与模块身份在 store；本文件不直连 IPC。
 */

import { Component, onCleanup, onMount } from "solid-js";

import { systemReportError, YoLog } from "@yohu/api";

import { runBootPipeline } from "./boot";
import { formatWindowError } from "./js-error";
import { allowNativeContextMenu } from "./native-context-menu";
import "./register";
import { AppLayout } from "./shell/AppLayout";
import { deviceStore, settingsStore, taskStore, updateStore, windowStore } from "./stores";

export const App: Component = () => {
  onMount(() => {
    let disposed = false;
    deviceStore.bindIpc();
    taskStore.bindIpc();
    updateStore.bindIpc();

    const detachWindow = windowStore.attach();

    void runBootPipeline({
      load: async () => {
        await Promise.all([settingsStore.load(), deviceStore.load()]);
        YoLog.info(windowStore.shellChannel(), "设置已加载", { theme: settingsStore.state.theme });
      },
      refresh: () => {
        if (!disposed) {
          deviceStore.refreshNow();
        }
      },
    });

    YoLog.info(windowStore.shellChannel(), "UI 已挂载", { href: window.location.href, bundle: import.meta.url });
    const onError = (e: ErrorEvent): void => {
      const text = formatWindowError(e);
      YoLog.error(windowStore.shellChannel(), text);
      void systemReportError(text);
    };
    const onContextMenu = (event: MouseEvent): void => {
      if (!allowNativeContextMenu(event.target)) event.preventDefault();
    };
    function listen<K extends keyof WindowEventMap>(
      target: Window,
      type: K,
      handler: (this: Window, ev: WindowEventMap[K]) => void,
    ): () => void;
    function listen<K extends keyof DocumentEventMap>(
      target: Document,
      type: K,
      handler: (this: Document, ev: DocumentEventMap[K]) => void,
    ): () => void;
    function listen(
      target: Window | Document,
      type: string,
      handler: EventListenerOrEventListenerObject,
    ): () => void {
      target.addEventListener(type, handler);
      return () => target.removeEventListener(type, handler);
    }
    const stopError = listen(window, "error", onError);
    const stopContextMenu = listen(document, "contextmenu", onContextMenu);
    onCleanup(() => {
      disposed = true;
      detachWindow();
      stopError();
      stopContextMenu();
    });
  });

  return <AppLayout />;
};
