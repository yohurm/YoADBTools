/**
 * 窗口铬 store：最大化快照与三键 IPC。View 只交事件。
 */

import { createSignal } from "solid-js";

import {
  listenWindowResize,
  windowClose,
  windowIsMaximized,
  windowMinimize,
  windowToggleMaximize,
} from "@yohu/api";

export function createWindowStore() {
  const [maximized, setMaximized] = createSignal(false);

  async function syncMaximized(): Promise<void> {
    setMaximized(await windowIsMaximized());
  }

  async function minimize(): Promise<void> {
    await windowMinimize();
  }

  async function toggleMaximize(): Promise<void> {
    await windowToggleMaximize();
    await syncMaximized();
  }

  async function close(): Promise<void> {
    await windowClose();
  }

  /** 订阅尺寸变化。返回退订。 */
  function attach(): () => void {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void syncMaximized();
    void listenWindowResize(() => {
      void syncMaximized();
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }

  return { maximized, minimize, toggleMaximize, close, attach };
}

export type WindowStoreApi = ReturnType<typeof createWindowStore>;
