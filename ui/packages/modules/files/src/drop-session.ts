/**
 * 官方拖放会话：订事件、rAF 热态 dest、松手 commit。
 * dest 一律清单下标 destDirFromEntries；禁止扫行盒。
 * devicePixelRatio 只在此读，传给纯函数 scale。
 */

import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

import { onNativeDragDrop, YoLog } from "@yohu/api";

import {
  adoptDropSession,
  cssPointFromPhysical,
  destDirFromEntries,
  DROP_IDLE,
  dropCommit,
  dropSessionForEvent,
  dropSessionWithDir,
  readListHitSpace,
  type DropSession,
  type ListHitEntry,
} from "./drop";
import { controlRowHeight } from "./layout";

export interface DropSessionHost {
  listEl: () => Element | undefined;
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
    let stopDrag: (() => void) | undefined;
    let cancelled = false;
    let destFrame = 0;
    let destPoint = { x: 0, y: 0 };

    const stopDestFrame = (): void => {
      if (destFrame === 0) return;
      cancelAnimationFrame(destFrame);
      destFrame = 0;
    };

    const applyDest = (): void => {
      destFrame = 0;
      const list = host.listEl();
      if (!list) return;
      const dirName = destDirFromEntries(
        destPoint.x,
        destPoint.y,
        readListHitSpace(list, controlRowHeight()),
        host.entries(),
      );
      setSession((prev) => dropSessionWithDir(prev, dirName));
    };

    void onNativeDragDrop((event) => {
      const gate = {
        hasDevice: host.hasDevice(),
        blocked: host.blocked(),
      };
      setSession((prev) => adoptDropSession(prev, dropSessionForEvent(event, gate)));
      const intoFolder = host.intoFolder();
      const scale = window.devicePixelRatio;
      if (
        (event.type === "enter" || event.type === "over") &&
        intoFolder &&
        gate.hasDevice &&
        !gate.blocked
      ) {
        destPoint = cssPointFromPhysical(event.position.x, event.position.y, scale);
        if (destFrame === 0) {
          destFrame = requestAnimationFrame(applyDest);
        }
        return;
      }
      if (event.type !== "drop") {
        stopDestFrame();
        return;
      }
      stopDestFrame();
      const list = host.listEl();
      const commit = dropCommit(event, {
        ...gate,
        intoFolder,
        scale,
        space: list ? readListHitSpace(list, controlRowHeight()) : undefined,
        entries: host.entries(),
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
    }).then(
      (unlisten) => {
        if (cancelled) unlisten();
        else stopDrag = unlisten;
      },
      (error: unknown) => {
        YoLog.error("files", "订阅官方拖放失败", error);
      },
    );

    onCleanup(() => {
      cancelled = true;
      stopDestFrame();
      stopDrag?.();
    });
  });

  return { session };
}
