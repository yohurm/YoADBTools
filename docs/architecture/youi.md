# YoUI（`@yohu/ui`）

对外名称 **YoUI**；包名 `@yohu/ui`。第一公民（ADR-v6-011）：界面元素来自本库；色值/字号/间距/圆角/动效时长走 token；lint 禁硬编码。

栈：SolidJS + CSS 变量。token 在 `packages/ui/src/tokens/`，`emit-theme.ts` 生成 `theme.css`。

公开组件一律 `Yo*`。清单与 token 细则见 [UI设计系统-v6.md](UI设计系统-v6.md)；动效见 [动画系统-v6.md](动画系统-v6.md)；右键见 [右键菜单-v6.md](右键菜单-v6.md)。

共享交互（不是业务模块）：

| 能力 | 位置 | 页面 | 壳 |
|------|------|------|-----|
| 快捷键 | `keymap/` | 绑定表 + `onAction` | `attachPanelKeys` |
| 右键 | `context-menu/` | 模块 `menu.ts` + `openContextMenu` | 唯一 `YoContextMenuHost` |
| 列宽 | `col-model.ts` / `col-resize.ts` + `YoColRow` / `YoColHeader` / `YoColResizer` | 模块只存 `colWidths`，接绝对 px | — |

禁止模块自挂 `YoContextMenu`。YoUI **零 IPC、零产品业务**。

列拖拽不是 `YoTable`。清单体仍是 `YoVirtualList`。YoUI 只提供轨道铬与宽度代数：`col-model`（`YoColSpec` / clamp / `colTrackTemplate`）→ `col-resize`（从 `startX` 重算绝对宽，禁止每帧累加 `dx`）→ `YoColResizer`（`separator` + valuemin/now/max + 键盘）/ `YoColHeader` / `YoColRow`。模块只存 `colWidths` 并 `setColWidth(key, px)`。拖时 `html[data-yohu-col-resizing]` 锁 `col-resize` 并禁选区。双击 `onFit` 只留钩子，YoUI 不测单元格。
