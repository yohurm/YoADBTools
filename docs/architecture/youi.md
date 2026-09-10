# YoUI（`@yohu/ui`）

对外名称 **YoUI**；包名 `@yohu/ui`。第一公民（ADR-v6-011）：界面元素来自本库；色值/字号/间距/圆角/动效时长走 token；lint 禁硬编码。

栈：SolidJS + CSS 变量。token 在 `packages/ui/src/tokens/`，`emit-theme.ts` 生成 `theme.css`。

公开组件一律 `Yo*`。清单与 token 细则见 [UI设计系统-v6.md](UI设计系统-v6.md)；动效见 [动画系统-v6.md](动画系统-v6.md)；右键见 [右键菜单-v6.md](右键菜单-v6.md)。

共享交互（不是业务模块）：

| 能力 | 位置 | 页面 | 壳 |
|------|------|------|-----|
| 快捷键 | `keymap/` | 绑定表 + `onAction` | `attachPanelKeys` |
| 右键 | `context-menu/` | 模块 `menu.ts` + `openContextMenu` | 唯一 `YoContextMenuHost` |
| 列宽 | `col-model` → `YoColFrame` → `YoColRow` / `YoColTrack` / `YoColCell` / `YoColHeader` / `YoColResizer` | 模块只存 `colWidths`，接绝对 px | — |

禁止模块自挂 `YoContextMenu`。YoUI **零 IPC、零产品业务**。

列拖拽不是 `YoTable`。清单体仍是 `YoVirtualList`。公共层：

1. `col-model`：`YoColSpec` / clamp / `colTrackTemplate`
2. `YoColFrame`：只写一次 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`；表头与滚动体预留同一条 `scrollbar-gutter`
3. `YoColRow` / `YoColHeader` / `YoColResizer`：表头行
4. `YoColTrack` / `YoColCell`：清单行（`span` 通栏，不改 template）

`col-resize` 从 `startX` 重算绝对宽，禁止每帧累加 `dx`。模块只存 `colWidths` 并 `setColWidth(key, px)`，禁止再写 `grid-template-columns` 或第二份列垫。文件清单与日志分析同一套组件，差别只在单元格内容。拖时 `html[data-yohu-col-resizing]` 锁 `col-resize` 并禁选区。双击 `onFit` 只留钩子，YoUI 不测单元格。

`YoColHeader` 标题默认靠左（HarmonyOS PC / Finder 列表）。列垫 `--yohu-col-cell-pad: 0 space-sm 0 space-md` 由 Frame 写入；表头 `--yohu-col-header-content-pad` 继承它。`align` 只覆盖 center/end。`YoColResizer` 对照 AG Grid Quartz resize handle：热区透明，可见铬是居中短柄（宽 `--yohu-stroke-accent`、高 30%、空闲 `--yohu-border`）；悬停加长并改 accent；拖中铺满表头高。禁止把命中区整块涂 accent，禁止表头再画 `::after` 列分割线。
