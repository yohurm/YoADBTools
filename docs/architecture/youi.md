# YoUI（`@yohu/ui`）

对外名称 **YoUI**；包名 `@yohu/ui`。第一公民（ADR-v6-011）：界面元素来自本库；色值/字号/间距/圆角/动效时长走 token；lint 禁硬编码。

栈：SolidJS + CSS 变量。token 在 `packages/ui/src/tokens/`，`emit-theme.ts` 生成 `theme.css`。

公开组件一律 `Yo*`。清单与 token 细则见 [UI设计系统-v6.md](UI设计系统-v6.md)；动效见 [动画系统-v6.md](动画系统-v6.md)；右键见 [右键菜单-v6.md](右键菜单-v6.md)。

共享交互（不是业务模块）：

| 能力 | 位置 | 页面 | 壳 |
|------|------|------|-----|
| 快捷键 | `keymap/` | 绑定表 + `onAction` | `attachPanelKeys` |
| 右键 | `context-menu/`（Host 开合 + List 槽位 + `menu-key-policy`） | 模块 `menu.ts` + `openContextMenu` | 唯一 `YoContextMenuHost` |
| 提示 | `YoTooltip` 登记 Unique 槽 | 包一层即可 | 唯一 `YoTooltipHost`（与菜单 Host 并列） |
| 列宽 | `col-model` → `YoColFrame` → `YoColRow` / `YoColTrack` / `YoColCell` / `YoColHeader` / `YoColResizer` | 模块只存 `colWidths`，接绝对 px | — |

禁止模块自挂 `YoContextMenu`。YoUI **零 IPC、零产品业务**。

L5 `index.ts` 只转发 `Yo*` 与模块契约：`setColWidth` / `colTrackTemplate` / `defaultColWidths`、`moveItemTo` / `insertIndexFromPointerY` / `moveIndexFromInsert` / `dropIndexFromCenters` / `shiftForReorder`、keymap、菜单（`open` / `close` / `refine`）、`Toaster`（`show` / `dismiss` / `destroy`）、`shouldSkipMotion`、`DISMISS_HOLD_DURATION`。不导出 glyph / wipe 帧 / resize session / `ColResizePhase` / `ReorderBar` / `ReorderOverlay` / `ReorderSession` / 菜单 Session / `ToastItem` / Unique 工厂 / 分段上限常量。宿主只依赖组件、列宽写入与换位纯函数。

列拖拽不是 `YoTable`。清单体仍是 `YoVirtualList`。公共层：

1. `col-model`：`YoColSpec` / clamp / `colTrackTemplate`
2. `YoColFrame`：只写一次 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`；表头与滚动体预留同一条 `scrollbar-gutter`。默认 `cellPad=list`（左 md / 右 sm）。日志文档把同一左垫收进 `padLeftChars`，禁止 `cellPad=none` 把标题贴边。
3. `YoColRow` / `YoColHeader` / `YoColResizer`：表头行
4. `YoColTrack` / `YoColCell`：Family B 清单行（`span` 通栏，不改 template）
5. `YoVirtualList`：`tone` 默认 `document`（只虚拟化，不画行线）。Family B 文件清单显式 `tone="list"` 才有行间 hairline。命令管理中栏只借这条 hairline 画条目名之间的分割线，不是文件表。禁止默认画线再让日志去关。开启选择（`selectedKey` / `selectedKeys`）后宿主 `role=listbox`，`user-select: none`，禁止模块再自挂 `ul` 选区。禁止再为连续选中另画项间线。`onReorder` 开启整行按住拖动换位：过 `Spacing.Sm` 臂距后浮层跟指针、源行占位、邻行让位、缝上插条；松手提交 `from`/`to`。禁止模块再写第二套换位几何或常驻手柄。

`col-resize` 从 `startX` 重算绝对宽，禁止每帧累加 `dx`。模块只存 `colWidths` 并 `setColWidth(key, px)`，禁止再写 `grid-template-columns` 或第二份列垫。文件清单走 `YoColTrack` / `YoColCell`。日志表头走同一套 `YoColRow` / `YoColHeader`，轨道是 `logDocTrackTemplate` 的 `ch`，与 `formatLogDoc` 同一把尺；行是文档不是格子。拖时 `html[data-yohu-col-resizing]` 锁 `col-resize` 并禁选区。双击 `onFit` 只留钩子，YoUI 不测单元格。

`YoColHeader` 标题默认靠左（HarmonyOS PC / Finder 列表）。列垫 `--yohu-col-cell-pad: 0 space-sm 0 space-md` 由 Frame 写入；表头 `--yohu-col-header-content-pad` 继承它。`align` 只覆盖 center/end。库一律包 `__label`（无 `onSort` 的标题也有垫与对齐）。有 `onSort` 时库内渲染 `.yohu-interactive` + `__label` + chevron（`Icon` 单源）。排序字色走宿主 `aria-sort`（`ascending` / `descending` = `--yohu-fg` + semibold），CSS 留在库里。模块只传标题 / `onSort`；`__label` 不是模块 class，禁止再点 `.yohu-col-header` / `__label` 或自绘第二套排序钮。禁止给表头包 `YoTooltip`。`ColResizePhase` 在 L2 `col-model`，供 `onWidthChange` 回调使用，不进公开入口。`YoColResizer` 对照 AG Grid Quartz resize handle：热区透明，可见铬是居中短柄（宽 `--yohu-stroke-accent`、高 30%、空闲 `--yohu-border`）；悬停加长并改 accent；拖中铺满表头高。禁止把命中区整块涂 accent，禁止表头再画 `::after` 列分割线。

---

## 组件：YoButton（L0–L5）

HarmonyOS 对照：Button。外形与语义色是两轴，不是一套 `primary | danger`。色值只消费语义 token，禁止引进 `antd` / Arco / Polaris / Primer。

### 设计前链路

```
模块 props.variant: "primary" | "secondary" | "ghost" | "danger"
  → Button.tsx classList yohu-button--${variant|primary}
  → Button.css 每变体手写一套色
  → danger hover 在 CSS 写 color-mix(88% / 76%)（散落硬编码）
```

问题：形（实心/描边/幽灵）与色（品牌/中性/警示）耦在同一枚举；模块用 `variant="danger"` 表达语义色；默认/按压/禁用的判定写在视图里。

### 设计后链路

```
模块 props.variant + props.tone + props.size + ink? + flush? + disabled + loading
  → L2 resolveButtonSpec / buttonPaintKind（15 格矩阵 → data-paint）
  → L3 buttonHostAttrs（disabled∨loading、aria-busy、data-*）
  → L4 Button.tsx 只绑属性；内容区 = spinner + 文案（纯文案走 YoSwap）
  → L4 Button.css 按 data-paint × data-tone 消费 --yohu-*；
    ink 消费父级 `--yohu-button-ink` / `--yohu-button-fill`；flush 铺交叉轴并自隐边框圆角
  → L0 Accent/Error/Success/Warn 的 hover·pressed（brandOverlay 5%/10%）
```

宿主只改 `YoButton` 公开 props。禁止 `variant="primary"` 别名，禁止模块自写第二套按钮皮，禁止点 `.yohu-button` / `[aria-pressed]`。日志级别钮走 `ink` + `flush`，不是 `YoSegmentedButton`。

### 分层与状态

| 层 | 文件 | 职责 | 不做什么 |
|----|------|------|----------|
| L0 | `tokens/colors.ts` → `emit-theme.ts` → `theme.css` | 语义色与实心叠色 | 不写按钮几何 |
| L1 | `motion/swap`、`.yohu-focus-ring`、`tokens/motion.css` `yohu-spin` | 换牌、焦点环、加载旋转 | 不复制进 Button |
| L2 | `button-model.ts` | `variant × tone × size` 不变式；`buttonPaintKind` | 不碰 DOM / disabled |
| L3 | `button-policy.ts` | 交互：`disabled \|\| loading`；组装 `data-*` | 不写色值、不画铬 |
| L4 | `Button.tsx` + `Button.css` | 铬 + 内容区（`overflow: hidden` 裁剪文案/spinner） | 不在 TSX 里 if-else 上色 |
| L5 | `index.ts` | `YoButton` + `YoButtonProps` / Variant / Tone / Size | 不导出 paint/policy |

运行时所有权：内容（children / 文案）在视图传入；外形与语义配置在 L2 解析后不可变；禁用/加载在 L3；按压 hover 是 CSS 瞬态，不进模型。无窗口监听；卸载即结束。`YoIconButton` 不是本控件的 variant。

### 公开 API（一次替换，无双轨）

```ts
variant?: "solid" | "outlined" | "ghost"   // 默认 solid
tone?: "accent" | "neutral" | "danger" | "success" | "warning"  // 默认 accent
size?: "sm" | "md"                         // 默认 md
```

无 props = 今日主按钮（`solid` + `accent` → `data-paint=solid-on`）。

旧调用一次迁完：

| 旧 | 新 |
|----|----|
| 无 / `primary` | 默认，或 `variant="solid"` |
| `secondary` | `variant="outlined" tone="neutral"` |
| `ghost` | `variant="ghost" tone="neutral"` |
| `danger` | `tone="danger"`（variant 默认 solid） |

`outlined` / `ghost` 不写 `tone` 会落到 `accent`（彩色描边/幽灵），不是旧 secondary/ghost。

### 涂装矩阵（L2，CSS 只消费 `data-paint`）

| paint | 何时 | 视觉 |
|-------|------|------|
| `solid-on` | solid × accent/danger | 语义实底 + `fg-on`；hover/pressed 走 `*-hover/pressed` |
| `solid-tone` | solid × success/warning | 软底 + 语义字。鸿蒙 confirm/alert 中明度，禁止反色字 |
| `solid-neutral` | solid × neutral | `surface-2` + `fg`，不是黑底胶囊 |
| `outlined-neutral` | outlined × neutral | 今日 secondary：`surface` + `border` + `fg` |
| `outlined-tone` | outlined × 其余 | 语义描边与字，hover 软底 |
| `ghost-neutral` | ghost × neutral | 今日 ghost：透明 + `fg-2` |
| `ghost-tone` | ghost × 其余 | 透明 + 语义字，hover 软底 |

### 不做

- 不留 `primary` / `secondary` / `danger` 别名或适配函数
- 不引进 Ant `generate()` 10 阶、Arco `lighten`、Polaris `--p-*`、Wave、中文插空格
- 不把 `size` 冒充 `data-density`；密度仍走工作台设置
- 不把揭示/滑动做成 Button variant

---

## 组件：YoTextField（L0–L5）

HarmonyOS 对照：TextInput。盒内缀与盒外缀两清，status 一等。禁止引进 `antd` Input / cssinjs。

### 设计前链路

```
模块 value / onInput / label / placeholder / clearable / disabled
  → TextField.tsx 自己算 showClear、classList --disabled
  → 只有清除，无 prefix/suffix/addon/status
```

### 设计后链路

```
同一受控面 + prefix/suffix + addonBefore/addonAfter + status + block
  → L2 resolveTextFieldSpec / textFieldPaintKind / resolveTextFieldWidthKind
  → L3 textFieldHostAttrs（disabled 关输入与清除；error → aria-invalid；只写 data-width）
  → L4 只绑 data-*；内容区 = 盒内缀 + input + 清除（圆角内裁剪）；
    input size=1，宽度只听 data-width（hug | number | fill），禁止原生 size=20 漏进布局；
    hug 最小宽 space-xl*5；type=number 走 --yohu-layout-settings-number-w 且 text-align:end；
    block 映射 fill。fill 只铺父级宽（`width: 100%` + `flex: 0 1 auto`），禁止 `flex-grow` 在 pane 竖栏里吃栏高。
    写入盒 `--yohu-text-field-line` = control-height − 2×hairline（L2 `textFieldLineBoxPx`）。
    单行 input 高与行高等于写入盒，禁止 `height: 100%` + `leading-ui`（Chromium 会把字/caret 顶到盒顶）。
    复用 `__input` 的 textarea 行高仍走 leading-ui，用 `padding-block` 把第一行推到写入盒中线；模块禁止再锁 `height: control-height`。
    addon 在盒外。页面禁止再写 .yohu-text-field { width }
```

| 层 | 文件 | 职责 |
|----|------|------|
| L2 | `textfield-model.ts` | 槽位占有；status 归一；涂装；width；写入盒 `textFieldLineBoxPx` |
| L3 | `textfield-policy.ts` | 禁用与清除显隐；`data-*` |
| L4 | `TextField.tsx` + `TextField.css` | 铬 + 内容区 |
| L5 | `index.ts` | `YoTextField` + Props / Status / Affix |

```ts
prefix?: IconName | JSX.Element
suffix?: IconName | JSX.Element
addonBefore?: JSX.Element
addonAfter?: JSX.Element
status?: "none" | "error" | "warning"
```

保留 `value` / `onInput` / `label` / `placeholder` / `clearable` / `disabled` / `ariaLabel` / `type` / `block` / `inputRef`（转发内部 input）/ `active`（过滤生效描边，写 `data-active`，不与 status 混）。不做 YoForm、textarea、密码显隐、size 轴、status 别名。禁止模块 `querySelector("input")`，禁止点 `.yohu-text-field` 改 `--yohu-text-field-edge`。

---

## 组件：YoCheckbox（L0–L5）

多选/条件用本控件；启用类走 `YoSwitch`。公开 API 不变。

```
checked / onChange / label / disabled
  → L2 checkboxPaintKind（idle | checked）
  → L3 canCommitCheckboxChange + data-*
  → L4 只绑属性；按压走 :hover / :active
```

| 层 | 文件 |
|----|------|
| L2 | `checkbox-model.ts` |
| L3 | `checkbox-policy.ts` |
| L4 | `Checkbox.tsx` + `Checkbox.css`（内容区 `__box` 裁勾） |

不做 indeterminate。禁用走 `--yohu-disabled`，禁止只降透明度。

---

## 组件：YoSwitch（L0–L5）

HarmonyOS Toggle；默认 36×20vp。只点开关本身。公开 API 不变（`ariaLabel` 必填）。

```
checked / onChange / ariaLabel / disabled
  → L2 switchPaintKind（off | on）
  → L3 switchNextChecked（禁用返回 null）
  → L4 role=switch 只绑 data-*；滑块走 spatialSmall
```

关闭轨 hover/pressed 走 `--yohu-switch-off-hover/pressed`，禁止组件 CSS 再写 `color-mix`。不做整行点击。

---

## 组件：YoFormRow（L0–L5）

设置行壳：左标题栈、右控件 hug。不是 YoForm 引擎。公开 API 不变。

```
title / description / note / children
  → L2 hasFormRowSlot
  → L3 formRowHostAttrs（data-has-description / data-has-note）
  → L4 两列内容区；行主轴 flex-end；右槽始终 hug 贴尾（路径+浏览是同一簇）；行间 hairline
```

不做字段收集 / 校验 / 提交。行根禁止 `overflow: hidden`。页面禁止再自写一行 flex。

---

## 组件：YoIconButton（L0–L5）

透明底图标钮，不是 YoButton 的 variant。`size?: "sm" | "md"`（默认 md），禁止魔法 px。

```
size / icon|children / disabled / loading / pressed
  → L2 resolveIconButtonSpec
  → L3 iconButtonHostAttrs（loading⇒disabled+busy；pressed 与 aria-pressed 分轴）
  → L4 data-size / data-pressed / data-busy；`title` 只作 aria-label，可见提示走 YoTooltip
```

| 层 | 文件 |
|----|------|
| L2 | `icon-button-model.ts` |
| L3 | `icon-button-policy.ts` |
| L4 | `IconButton.tsx` + `IconButton.css` |

减动效钩子：`tokens/motion.css` 的 `.yohu-icon-button[data-busy] > .yohu-icon`。不做 solid、variant 轴、`size: number` 别名。禁止再写原生 `title` 属性。

---

## 组件：YoSegmentedButton（L0–L5）

HarmonyOS SegmentButtonV2。默认 tab 白选择块；capsule 才 accent。选择块只走 `YoIndicator` thumb。

```
type / size / items / value
  → L2 spec + paint（tab-surface | capsule-accent）
  → L3 host/item attrs + commit
  → L4 data-* + YoIndicator
```

上限 7 项写在 L2，不进公开面。选中只绑 `data-selected`；`YoIndicator` 跟 `.yohu-segmented__item[data-selected]`。不做一级导航、删除/添加、第二套滑动条、整组透明度冒充禁用。禁止 `yohu-segmented__item--selected`。

---

## 组件：YoThemeToggle（L0–L5）

只组合 `YoIconButton` + 主题能力。揭示走 `runThemeViewTransition`。

```
L1 主题订阅 / 圆形揭示
  → L2 标题与 dark 语义
  → L3 busy⇒disabled；aria-pressed=dark（无按下铬）
  → L4 YoIconButton children = 太阳/月亮叠层
```

不做复制 IconButton 铬、不把工作台 theme 写成设备深浅色。

---

## 组件：YoToast / YoToaster（L0–L5）

命令式 API 必须挂回树上的 `YoToaster`。禁止静态 `Toast.success`。停留 ≤ `MotionSpec.toast`。进出场走 `YoPresence` 配方 `toast`。

```
show(text, tone?)
  → L2 resolveToastSpec（error→danger，info→accent）
  → L3 队列 / 代际 / destroy 后拒写
  → L4 按快照画 + Presence
```

公开 `ToastTone` 仍是 `success | error | info`（调用方契约）。CSS 只消费 Button 涂装名。`createToaster` 增 `destroy()`。

---

## 组件：YoBadge（L0–L5）

语义色与 Button 同一枚举：`accent | neutral | danger | success | warning`，默认 `neutral`。

| 旧 | 新 |
|----|----|
| `warn` | `warning` |
| `error` | `danger` |

无兼容别名。不做 Button variant。

---

## 组件：YoProgressBar（L0–L5）

确定态 0–100；不定态扫动走 `[data-mode="indeterminate"]`。L2 夹取，L3 只有确定态写 width（不定态不再 inline width 压过扫动）。本波不加 tone 轴。禁止 `yohu-progress--indeterminate`。

---

## 组件：YoEmptyState（L0–L5）

插画 + 标题 + 描述 + 可选 `action`。不当 Dialog、不内嵌 Presence、不自写挤位 transition。

---

## 组件：YoLoading（L0–L5）

区域/页面等待。`role=status` + `aria-busy`。cover 走 `data-cover`。控件内加载仍走 Button / IconButton `loading`。禁止模块自写 spinner。

---

## 组件：YoSelect（L0–L5）

HarmonyOS 对照：Select。落点对齐 Tooltip：`select-place` → `popover-place`，禁止第二套 Trigger、禁止 L4 内嵌 `placePopover`。选中/按键解码在模型，开合/禁用/提交在政策。

```
props
  → L2 findOption / selectKeyIntent / optionDomId / SelectTriggerBox
  → L3 toggleSelect / applySelectKey / applySelectEscape / selectHostAttrs
  → L3 select-place：readSelectTrigger / layoutSelectMenu
  → L4 只绑 ref、调 L3、写 placement；一次绑 data-disabled / data-block；占位 data-placeholder
  → overlay token（`--yohu-z-overlay`）
```

| 层 | 文件 | 职责 |
|----|------|------|
| L0 | tokens | 控件高、间距、叠层 |
| L1 | popover-place、YoPresence、YoIndicator | 定位、进出场、选中片 |
| L2 | select-model.ts | 选项、id、步进、按键意图、落点盒类型 |
| L3 | select-policy.ts / select-place.ts | 开合、禁用、提交、Esc；菜单落点 |
| L4 | Select.tsx / Select.css | 内容区 = `.yohu-select__menu`；不写测量算法 |
| L5 | index.ts | YoSelect + YoSelectOption |

公开 API：`options` / `value` / `onChange` / `disabled` / `placeholder` / `block`。键盘 Arrow Home End Enter Space Esc Tab。宽 hug（min=触发钮）。

不做：不锁 `width` 为触发钮宽；不私写 z-index 魔法数；不引进 antd/arco Select。

---

## 组件：YoDialog（L0–L5）

HarmonyOS 对照：弹出框。开场 spatial，关闭淡出后卸节点。stack/focus 是策略，视图只 bind。

```
props
  → L2 dialogPanelPaint / resolveDialogBodySpec
  → L3 resolveDialogOpen / attachDialog / dialogLayerStyle / dialogBodyAttrs
  → attachDialog = 卸 Tooltip Unique + pushDialog + 首焦（dialog-stack / dialog-focus）
  → L4 只绑 Presence + data-sized + data-layout / data-overflow / data-pad + 标题 / 内容区 / 页脚
```

| 层 | 文件 | 职责 |
|----|------|------|
| L2 | dialog-model.ts | 面板尺寸、内容区排列/溢出/垫 |
| L3 | dialog-stack.ts、dialog-focus.ts、dialog-policy.ts | 单栈 Esc/Tab、可聚焦集合、attach/detach、body data-* |
| L4 | Dialog.tsx / Dialog.css | 内容区 = `.yohu-dialog__body`，只认 data |
| L5 | index.ts | YoDialog |

公开 API：`open` / `title` / `width` / `height` / `bodyLayout` / `bodyOverflow` / `bodyPad` / `onClose` / `footer` / `children`。默认 stack + auto + lg。新建会话 `bodyOverflow="hidden"`；命令管理再加 `bodyPad="none"`。遮罩不关，只消费 `--yohu-scrim`。禁止模块点 `__body` / `:has`。禁止 `Modal.confirm`、Wave、中文插空格。叠层走 `--yohu-z-dialog`。入栈必须 `dismissTooltipOverlay`：气泡 z 高于对话框，残留 Unique 会压在模态上。

---

## 组件：YoTooltip（L0–L5）

对照 Ant UniqueProvider：密集提示共享一个 popup。命令式必须挂回 `YoTooltipHost`。

```
YoTooltip(content, children, delay?: MotionSpecName)
  → L2 tooltipIsEmpty / DEFAULT_TOOLTIP_DELAY=effectsEnter
  → L3 tooltipCanShow / tooltipNoteInput / tooltipCanShowOnFocus / createTooltipUnique / dismissTooltipOverlay
  → L3 placeTooltip → popover-place(prefer=top, align=center, hug 内容)
  → L4 Host 唯一 Portal + YoPresence(popover)；内容区 = `.yohu-tooltip__content`
```

| 层 | 文件 | 职责 |
|----|------|------|
| L1 | popover-place、YoPresence | 定位、进出场 |
| L2 | tooltip-model.ts | 空文案、id、delay 名 |
| L3 | tooltip-policy.ts、tooltip-place.ts | Unique 槽、延迟、输入模态、模态卸槽、destroy；测量接到 popover-place |
| L4 | Tooltip.tsx / Tooltip.css | 只绑 Presence + 内容区 `.yohu-tooltip__content` |
| L5 | index.ts | YoTooltip、YoTooltipHost（不导出 Unique 工厂） |

公开 API：`content` / `children` / `delay?: MotionSpecName`（缺省 `effectsEnter`）/ `disabled` / `block`（无文案铬铺满主轴）/ `stretch`（无文案铬铺交叉轴）。无 `Tooltip.show`。无 Host 不画。壳根与 `YoContextMenuHost` 并列挂一份 `YoTooltipHost`。只给无可见文案的铬：`YoIconButton.title`、标题栏窗控、方向图标、空热区。已画出的字（表格格、路径、树标签、Select 值、设备卡、表头）禁止包本组件，省略号不靠气泡复述；多出来的信息画在界面上或只走 `aria-label`。禁止模块再写原生 `title` 冒充提示，禁止点 `__anchor`。`Tree` / `Select` / `ColHeader` 不内包本组件。

出示：悬停，或键盘模态下的焦点（Host 记 pointerdown / keydown）。禁止把点击后的程序 `.focus()`（对话框首焦）当悬停。按下锚点与模态 `attachDialog` 立即卸 Unique，不跟隐藏延迟。L5 不导出 Unique / 模态 / `dismissTooltipOverlay`。

---

## 组件：YoPanel（L0–L5）

画布分区唯一容器。铬 = surface + radius-md + hairline + XS 阴影，禁止模块自画。

```
variant / padding / header|title|actions / align / gap / overflow / overflowX / paddingBlock
  → L2 resolvePanelSpec（card 默认 md，pane 默认 none；pane overflow 默认 auto）
  → L3 顶栏形态 + data-variant / data-padding / data-header / data-align / data-gap / data-overflow
  → L4 铬在外壳，pane 裁切在 __clip；内容区只认 data-*
```

投屏 ops/func 与终端结果区走这些 prop。禁止模块点 `__body`。自定义 `header` 是块级槽（`display: block`），路径**行**铺满主轴，地址**铬** hug；不要把顶栏剩余当成路径栏，也不要用 title+actions 那条 flex 行去 hug 整行。

---

## 组件：YoPage（L0–L5）

效率型模块页壳。`YoChrome` 必须是第一子节点。页垫走 layout token。设置页不用本组件。

---

## 组件：YoChrome（L0–L5）

模块页眉，不进窗口标题栏。标题行高 `--yohu-control-height`，底垫 `chrome-pad`。无按钮页同一占位。`extra` 只走次行。

---

## 组件：YoTitleBar（L0–L5）

窗口铬。三键贴边满高；关闭例外色走 `--yohu-error` / `--yohu-error-pressed`。禁止 WinUI 红、禁止 padding 缩进关闭钮。macOS Overlay：`nativeCaptions`。

---

## 组件：YoStatusBar（L0–L5）

窗口底栏，左右只读槽。不要塞命令带。

---

## 组件：YoTabs（L0–L5）

激活是 `YoIndicator` underline，**不挂** `yohu-interactive--selected`。hover 只走 interactive，没有第二套 hover class。

```
tabs / activeId
  → L2 tabsActiveIndex / tabsKeyIntent
  → L3 tabsTabAttrs / resolveTabsKeyAction
  → L4 只绑 aria + data-active + underline + 内容区（圆点 + 标题 + ×）
```

公开 API：`onActivate` / `onClose` / `onNew` / `onContextMenu`。圆点 `YoTabDotTone` 与 Badge 对齐：`neutral | accent | success | warning | danger`。CSS 只消费 `data-tone` / `data-active`。`YoIndicator` 跟 `.yohu-tabs__tab[data-active]`。禁止 `yohu-tabs__tab--active`、禁止 `yohu-tabs__dot--warn/--error`。

---

## 组件：YoTree（L0–L5）

选中只挂 `yohu-interactive--selected` + `YoIndicator` fill。缺省行高 `--yohu-row-height-nav`（命令库是层级导航，不是日志/文件数据行）。禁止套 `--yohu-row-height`，禁止写死 px。可选 `rowHeight` 只写 `--yohu-tree-row-height`，用 `min-height`，不锁 `height`。`YoCollapse` 默认只裁切高度，禁止给 `inner > *` 写 `min-height`（会盖掉树行导航尺）。`recipe=fill`（DeviceRail）才在库内给直接子级 `flex:1; min-height:0`；壳只排折叠根，禁止再点 `__inner`。

```
data / expandedKeys
  → L2 flattenVisible / treeKeyIntent
  → L3 isTreeExpanded / treeRowAttrs
  → L4 内容区 = chevron + 图标 + 标签 + badge
```

公开 API 不变。没有 `yohu-tree__row--selected`。

---

## 组件：YoCol* 列架（L0–L5）

清单列宽与表头铬。不是 YoTable：清单体仍是 `YoVirtualList`。模块只存 `colWidths` 并 `setColWidth(key, px)`，接绝对 px。

### 设计前链路

```
模块各自写 grid-template-columns
  → 表头与行两套轨道 / 两份列垫
  → 拖宽每帧累加 dx
  → 日志另做适配层或 cellPad=none 把标题贴边
```

问题：轨道与列垫双源；拖宽漂移；文档列表标题贴格边。

### 设计后链路

```
模块 colWidths + setColWidth(key, px)
  → L2 col-model：YoColSpec / clamp / colTrackTemplate / defaultColWidths
  → L3 col-resize：从 startX 重算绝对宽
  → L4 YoColFrame 只写 --yohu-col-tracks 与 --yohu-col-cell-pad
  → L4 YoColRow / YoColHeader / YoColResizer 表头行（对齐/拖中/排序字色只写 data-align / data-active / data-resizing / aria-sort；有 onSort 时库内渲染 interactive + __label + chevron）
  → L4 YoColTrack / YoColCell Family B 清单行（通栏 data-span）
```

宿主只改公开组件与 `setColWidth`。禁止模块再写 `grid-template-columns` 或第二份列垫。

### 分层与状态

| 层 | 文件 | 职责 | 不做什么 |
|----|------|------|----------|
| L0 | `tokens/spacing`、`Stroke` | 列垫 md/sm、短柄描边 | 不写列几何 |
| L1 | `.yohu-interactive` | 表头排序片 | 不进列宽代数 |
| L2 | `col-model.ts` | `YoColSpec` / clamp / 轨道字符串 / `ColResizePhase` | 不碰 DOM / 指针 |
| L3 | `col-resize.ts` | 会话；`startX` 重算绝对宽 | 不累加 `dx`、不画铬 |
| L4 | `ColFrame` / `ColRow` / `ColHeader` / `ColResizer` / `ColTrack` / `ColCell` | 写 CSS 变量 + 表头/行铬；Header 包 `__label` 与排序钮 | 不在 TSX 里算宽 |
| L5 | `index.ts` | YoCol* + `setColWidth` / `colTrackTemplate` / `defaultColWidths` / `YoColSpec` | 不导出 `beginColResize` / `ColResizePhase` / resize session |

运行时所有权：列宽快照在模块；clamp 与轨道在 L2；拖拽会话在 L3（`YoColResizer` 消费，不进公开面）；铬在 L4。拖时 `html[data-yohu-col-resizing]` 锁光标并禁选区。双击 `onFit` 只留钩子，YoUI 不测单元格。

### 公开 API

```ts
// 模块契约
setColWidth(widths, spec, px): YoColWidths
colTrackTemplate(specs, widths): string
defaultColWidths(specs): YoColWidths

// YoColFrame
template: string
cellPad?: "list" | "none"   // 默认 list

// YoColHeader
align?: "start" | "end" | "center"
ariaSort?: "ascending" | "descending" | "none"
onSort?: () => void
children                     // 标题文案；库包 __label
onWidthChange?: (width, phase) // phase 类型在 col-model，不从包入口再导出
```

无 `cellPad` = `list`（左 md / 右 sm）。日志文档把同一左垫收进 `padLeftChars`，禁止 `cellPad=none`。文件清单走 `YoColTrack` / `YoColCell`；日志行是文档不是格子。

### 不做

- 不做成 YoTable，不把清单体收进列架
- 不导出 `beginColResize` / resize session / `ColResizePhase`
- 不让模块累加 delta 或自写第二份列垫
- 不把命中区整块涂 accent，不在表头再画 `::after` 列分割线
- 不让模块点 `.yohu-col-header` / `__label` 或自绘排序钮；字色只听 `aria-sort` + token

---

## 组件：YoVirtualList（L0–L5）

定高行虚拟列表。HarmonyOS 对照：长列表虚拟化。

### 设计前链路

```
VirtualList.tsx 自己算窗口、键盘、贴底、行 class
  → 选择代数与滚动绑在同一文件
  → 模块自写 ReorderGrip / 换位几何
```

问题：窗口/选择与按键/贴底耦在视图；换位散落在模块，常驻手柄、无统一拖拽条。

### 设计后链路

```
items / selectedKey|selectedKeys / onSelectRow / onReorder / tone
  → L2 virtualRange / 选择代数 + reorder-model（moveItemTo / 臂距 / 插缝 / 让位）
  → L3 键盘步进、贴底、行 attrs + reorder-policy（开合/提交/Ctrl+↑↓）
  → L4 只绑滚动、YoIndicator、ReorderOverlay / ReorderBar（内部）
```

`tone` 默认 `document`（只虚拟化，不画行线）。Family B 文件清单显式 `tone="list"` 才有行间 hairline。禁止默认画线再让日志去关。`role=listbox` 关原生划选（`user-select: none`）；未开选择的 document 清单仍可选字。滚轴与设备栏 scroller 同契约：`overflow-x: hidden` + `overflow-y: auto`。fill 滑块挂在 `__inner`，由 `YoIndicator` 宿主 `overflow: hidden` 裁切弹簧过冲，禁止只写 `overflow-x` 把纵轴算成 auto。

`onReorder` 对标鸿蒙 List `onMove` + Apple 列表插缝 + dnd-kit overlay：整行按下过 `Spacing.Sm` 后，滚动容器内抬起配方 `reorder-overlay`（跟指针，阴影浮起，`top` 不过渡）；源行 `data-reorder=source` 占位变淡；邻行 `translateY` 让位（`spatial-small`）；缝上配方 `reorder-bar` 只在离开原槽时展开。松手提交 `from`/`to`，Escape 取消。拖动中不改数组。一项不能拖。键盘 `Ctrl/Meta+↑/↓` 同一入口。变高步骤列表只复用 L2 纯函数。

### 分层与状态

| 层 | 文件 | 职责 | 不做什么 |
|----|------|------|----------|
| L0 | `--yohu-row-height` / `--yohu-border` / `--yohu-state-*` / `--yohu-stroke-accent` / `--yohu-accent` | 行高、行铬、条色宽 | 不算窗口 |
| L1 | `YoIndicator`、`keymap/selection`、`.yohu-interactive` | 选中片、邻接圆角 | 不虚拟化 |
| L2 | `virtuallist-model.ts` + `reorder-model.ts` | 窗口 + 选择代数 + 换位几何 | 不碰 DOM / 键盘 |
| L3 | `virtuallist-policy.ts` + `reorder-policy.ts` | 键盘 / 贴底 / 行 attrs / 换位开合 | 不写色值、不绑滚动 |
| L4 | `VirtualList.tsx` + `VirtualList.css` + 内部 `ReorderOverlay` / `ReorderBar` | 只绑滚动、Indicator、浮层、条 | 不在 TSX 里算窗口或按键意图 |
| L5 | `index.ts` | `YoVirtualList` + Props / Tone + 换位纯函数 | 不导出 `ReorderBar` / `ReorderOverlay` |

运行时所有权：数据与选中 key 在调用方；窗口与选择代数在 L2；键盘/贴底/行 attrs 在 L3；滚动度量与 Indicator 跟标在 L4。`For` 按 `getItemKey` 的原始值做身份，不把每次新建的窗口包装对象交给 `For`（否则行重挂、原生 Selection 被清掉）。未开选择模式时行不进焦点序列。单选高亮走 `YoIndicator` fill；多选 ≥2 退回每项 `::before`，邻接缝分割线走 `.yohu-interactive` 的 `::after`。选中片行级禁动。换位时邻行 `transform` 让位；浮层与插入条是独立绝对定位层。

### 公开 API

```ts
items: Accessor<T[]>
itemHeight?: number          // 默认 22；功能性配置，非 token
overscan?: number            // 默认 10
getItemKey?: (item, index) => string | number
renderRow: (item, index) => JSX.Element
autoScrollToBottom?: Accessor<boolean>
onAtBottomChange?: (atBottom: boolean) => void
selectedKey?: Accessor<string | number | null>
selectedKeys?: Accessor<ReadonlySet<string | number>>
onSelectRow?: (item, key, event?) => void
onRowContextMenu?: (item, key, event) => void
ariaLabel?: string
tone?: "document" | "list"   // 默认 document
onReorder?: (from: number, to: number) => void  // 可选；浮层+让位+插缝，几何纯函数另导出
```

选择模式：传入 `selectedKey`/`selectedKeys` + `onSelectRow` 即开。键盘 ↑/↓/Home/End/Enter/Space；`role=listbox/option` + `aria-selected`。换位：`onReorder` 可选；几何纯函数另从 `@yohu/ui` 导出。

### 不做

- 不默认画行线
- 不把表头放进虚拟行
- 选中片无过渡；换位让位只动 `transform`
- 不导出 `ReorderBar` / `ReorderOverlay`；不 live-reorder
- 不让模块再写第二套 `moveItemTo` / 常驻手柄

---

## 组件：YoFileIcon（L0–L5）

文件类型图标。HarmonyOS 对照：无系统文件图标控件；色来自 Harmony FileIcon 板。模块只消费 `YoFileIcon`。

### 设计前链路

```
file-icons.tsx 内联 Material hex fill
  → lint 豁免该文件
  → 字形与色耦在同一份 JSX
```

问题：组件层写死 hex；纪律脚本开口；与 token 单源冲突。

### 设计后链路

```
Harmony primitive
  → L0 FileIconLight/Dark（每字形 body + mark）
  → emit-theme.ts → --yohu-file-icon-{glyph} / -mark
  → theme.css（与 emitThemeCss() 字节一致）
name / kind / size
  → L2 fileGlyphFor（kind + 扩展名 → FileGlyph）
  → L4 SVG data-fill + file-icons.css 消费 token
```

宿主只改 `YoFileIcon` 公开 props。禁止模块内联文件 SVG。

### 分层与状态

| 层 | 文件 | 职责 | 不做什么 |
|----|------|------|----------|
| L0 | `tokens/colors.ts` FileIcon 板 → `emit-theme.ts` → `theme.css` | `--yohu-file-icon-{glyph}` / `-mark` | 不写 SVG |
| L2 | `file-glyph.ts` | `fileGlyphFor` | 不碰 DOM / 色 |
| L4 | `file-icons.tsx` + `file-icons.css` | SVG 几何 + `data-fill` 消费 token | 不写 Material hex |
| L5 | `index.ts` | `YoFileIcon` + `YoFileIconProps` | 不导出 `fileGlyphFor` |

无 L3：无开合、无键盘、无会话。字形是展示分组，不是 `@yohu/modules/files` 的 `fileCategory`；两轴不共享扩展名表。

### 公开 API

```ts
name: string
kind: "dir" | "file" | "symlink" | "other"
size?: number   // 默认 16
```

### 不做

- 不把 `fileGlyphFor` 送进 L5
- 不写 Material hex，不给该文件 lint 豁免
- 不与模块业务分类共用扩展名表
- 模块禁止再内联一份文件 SVG

---

## 组件：YoToolbar（L0–L5）

命令带壳：`data-chrome=band`、`data-overflow=scroll`、`role=toolbar`。溢出是横向滚动。公开 `pad`：`band`（默认，底距 sm / 行内 xs）| `xs`（无外距，贴栏；命令管理两栏）。禁止模块再点 `.yohu-toolbar`。若以后要菜单溢出，走 `openContextMenu` + 同一套 List，禁止第二套 ActionMenu。

## 原语：YoListPresence

短列表 insert/remove。当前树上第一槽（含出场中）在 Presence 宿主写 `data-first`。模块用 `[data-first]` 消首距，禁止点 `.yohu-presence`。清屏 `exit={false}` 直切。

---

## 引擎：右键菜单（L0–L5）

工作台菜单看 Primer ActionList，不看 Ant Dropdown。Host 管开合，List 管槽位。模块只交 `menu.ts`。细则见 [右键菜单-v6.md](右键菜单-v6.md)。

```
openContextMenu(scene, {x,y,ctx})
  → L3 controller 唯一 session + place 夹紧（本目录 place.ts，不走 popover-place）
  → L4 Host Portal
  → L4 List：data-slot=item/label；危险项 data-tone=danger
  → L3 menu-key-policy：Arrow / Home / End / Esc / Tab / Enter / Space / typeahead
```

typeahead 窗口 = `MotionDuration.loop`，禁止自写 ms。公开面无双轨：仍是 `openContextMenu` + 壳唯一 Host。禁止每处自挂菜单、禁止第二套 Trigger。
