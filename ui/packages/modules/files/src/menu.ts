/**
 * 文件页右键场景表。动作经 ctx 注入，本文件不碰 listing / transfers。
 */

import { defineContextMenu } from "@yohu/ui";

import { createKindTitle } from "./create-kind";
import { RENAME_TITLE } from "./rename";

export type FilesListMenuAction =
  | "new-file"
  | "new-dir"
  | "download"
  | "copy"
  | "rename"
  | "delete";

export interface FilesListMenuCtx {
  canDownload: boolean;
  canDelete: boolean;
  canCopy: boolean;
  canRename: boolean;
  newFile: () => void;
  newDir: () => void;
  download: () => void;
  copy: () => void;
  rename: () => void;
  remove: () => void;
}

export const filesListMenu = defineContextMenu<FilesListMenuCtx, FilesListMenuAction>({
  id: "files.list",
  items: (ctx) => [
    { id: "new-file", label: createKindTitle("file") },
    { id: "new-dir", label: createKindTitle("dir") },
    { id: "download", label: "下载", disabled: !ctx.canDownload },
    { id: "copy", label: "复制路径", disabled: !ctx.canCopy },
    { id: "rename", label: RENAME_TITLE, disabled: !ctx.canRename },
    { id: "delete", label: "删除", danger: true, disabled: !ctx.canDelete },
  ],
  onSelect: (id, ctx) => {
    switch (id) {
      case "new-file":
        ctx.newFile();
        return;
      case "new-dir":
        ctx.newDir();
        return;
      case "download":
        ctx.download();
        return;
      case "copy":
        ctx.copy();
        return;
      case "rename":
        ctx.rename();
        return;
      case "delete":
        ctx.remove();
        return;
      default: {
        const _gone: never = id;
        return _gone;
      }
    }
  },
});
