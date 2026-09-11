/**
 * 右键宿主（L4）。
 * 应用根只挂一份；只管开合与把会话交给 List。Portal 到 body，避免祖先 transform 打断 fixed。
 * 键盘与槽位在 YoContextMenu，不堆在本文件。
 */

import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { YoContextMenu } from "../components/ContextMenu";
import { contextMenu, type ContextMenuController, type ContextMenuHostController } from "./controller";

export interface YoContextMenuHostProps {
  controller?: ContextMenuController;
}

function asHost(ctl: ContextMenuController): ContextMenuHostController {
  return ctl as ContextMenuHostController;
}

export function YoContextMenuHost(props: YoContextMenuHostProps): JSX.Element {
  const ctl = (): ContextMenuHostController => asHost(props.controller ?? contextMenu);
  const session = () => ctl().session();

  return (
    <Portal mount={document.body}>
      <YoContextMenu
        open={session() !== null}
        x={session()?.x ?? 0}
        y={session()?.y ?? 0}
        items={[...(session()?.items ?? [])]}
        onClose={() => ctl().close()}
        onSelect={(id) => session()?.select(id)}
        onPlace={(size) => {
          const s = session();
          if (s) ctl().refine(s.id, size);
        }}
      />
    </Portal>
  );
}
