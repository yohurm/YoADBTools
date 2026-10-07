/**
 * 官方拖放会话：订事件、rAF 热态 dest、松手 commit。
 * dest 一律清单下标 destDirFromEntries；禁止扫行盒。
 * 比例经 hostPixelRatio() 读取，传给纯函数 scale。
 */

import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

import { bindNativeDragDrop, dragEventIsDrop, NATIVE_DRAG_SUBSCRIBE_FAILED, YoLog } from "@yohu/api";
import { controlRowHeight, cssPointFromPhysical, hostPixelRatio } from "@yohu/ui";

import {
  adoptDropSession,
  destDirFromEntries,
  DROP_IDLE,
  dropCommit,
  dropSessionForEvent,
  dropSessionWithDir,
  readListHitSpace,
  type DropSession,
  type ListHitEntry,
} from "./drop";

export interface DropSessionHost {
  listEl: () => Element | undefined;
  listOffset: () => number;
  hasDevice: () => boolean;
  blocked: () => boolean;
  intoFolder: () => boolean;
  entries: () => readonly ListHitEntry[];
  onCommit: (paths: string[], dirName: string | null) => void;
}

export function createDropSession(host: DropSessionHost): {
  session: Accessor<DropSession>;
} {
  const [session, setSession] = createSignal<DropSession>(DROP_IDLE);

  onMount(() => {
    let destFrame: number;
    let destPoint = { x: 0, y: 0 };

    const clearDestFrame = (): void => {
      destFrame = 0;
    };
    const destFrameIdle = (): boolean => destFrame === 0;
    const clearDropDir = (): void => {
      setSession((prev) => dropSessionWithDir(prev, null));
    };
    const currentList = (): Element | undefined => host.listEl();
    const dropEntries = (): readonly ListHitEntry[] => host.entries();
    const listHitSpace = (list: Element) => readListHitSpace(list, controlRowHeight(), host.listOffset());
    clearDestFrame();

    const stopDestFrame = (): void => {
      if (destFrameIdle()) return;
      cancelAnimationFrame(destFrame);
      clearDestFrame();
    };

    const applyDest = (): void => {
      clearDestFrame();
      if (!host.intoFolder()) {
        clearDropDir();
        return;
      }
      const list = currentList();
      if (!list) return;
      const dirName = destDirFromEntries(
        destPoint.x,
        destPoint.y,
        listHitSpace(list),
        dropEntries(),
      );
      setSession((prev) => dropSessionWithDir(prev, dirName));
    };

    const stopDrag = bindNativeDragDrop(
      (event) => {
        const gate = {
          hasDevice: host.hasDevice(),
          blocked: host.blocked(),
        };
        const admitted = dropSessionForEvent(event, gate);
        setSession((prev) => adoptDropSession(prev, admitted));
        const intoFolder = host.intoFolder();
        const scale = hostPixelRatio();
        if (admitted.hot && intoFolder) {
          destPoint = cssPointFromPhysical(event.position.x, event.position.y, scale);
          if (destFrameIdle()) {
            destFrame = requestAnimationFrame(applyDest);
          }
          return;
        }
        if (admitted.hot) {
          stopDestFrame();
          clearDropDir();
          return;
        }
        if (!dragEventIsDrop(event)) {
          stopDestFrame();
          return;
        }
        stopDestFrame();
        const list = currentList();
        const commit = dropCommit(event, {
          ...gate,
          intoFolder,
          scale,
          space: list ? listHitSpace(list) : undefined,
          entries: dropEntries(),
        });
        if (!commit) {
          YoLog.info("files", "投放未提交", {
            x: event.position.x,
            y: event.position.y,
            paths: event.paths.length,
          });
          return;
        }
        host.onCommit(commit.paths, commit.dirName);
      },
      (error) => {
        YoLog.error("files", NATIVE_DRAG_SUBSCRIBE_FAILED, error);
      },
    );

    onCleanup(() => {
      stopDestFrame();
      stopDrag();
    });
  });

  return { session };
}
