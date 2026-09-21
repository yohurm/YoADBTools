# Yohu ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v3.101（2026-09-21，滚动会话偏移 / 平面 transform）

> **调研依据：** HarmonyOS 开发者文档设计规范（本地 `HarmonyOS-Developer-docs`：`设计/设计指南/针对多设备设计/电脑/{设计概述,应用设计,窗口框架}`、`通用设计基础/{布局,视觉风格/文本排版,间隔参数}`、`应用 UX 体验标准/电脑应用 UX 体验标准`，提炼见 `docs/architecture/harmonyos-design-notes.md`）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志/控制台/表格面板（Android Studio Logcat、VS Code Output/Debug Console、Chrome DevTools Console、lnav、PostHog 日志、AG Grid / MUI Data Grid）、路径栏对照 Windows 资源管理器地址栏（分段 hug，空白槽不是展示）、Files App Omnibar + Chromium 输入选区（见 YoAgentDocs `desktop--address-edit-focus`；实现单源 `@yohu/ui` `address-field-model` / `YoAddressField`）。  
> **执行载体：** `@yohu/ui`（YoUI；token 单源 + 组件）+ `@yohu/workbench`（壳）+ `@yohu/modules/*`。所有改动必须同步更新本文件。
>
> **v3.101 变更（滚动会话偏移）：** 声明 `extent` 时偏移数字在 `scroller-session`，视口 `scrollTop` 恒 0；内容平面 `translate3d`（`transform-origin: 0 0`）。拖滑块 / 滚轮不再写超高 inner 的 DOM 滚动。无 `extent` 的短名单仍写 `scrollTop`。日志表头 inline 走 `onOffset`，文件投放命中走同一会话偏移。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)。
> **v3.100 变更（滚动三拍）：** `YoScroller` 可声明 `extent`；虚拟列表传入总高 / 行宽，滚轮不再量 in-flow 子盒、不再 `getComputedStyle`。条铬 rAF 一拍。`YoVirtualList` 像素滚动不进 Solid；原点过行高才换窗。pool 环形绑数，origin 步进只换一条。flow `For` 按可视下标，簇钉 origin 行顶，删除 lead/tail gap。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)。
> **v3.99 变更（日志清单滚条常显）：** 日志分析清单 `YoVirtualList state=on` 转给内嵌 `YoScroller`（对照 ArkUI `BarState.On`：溢出常显，无法滚动仍不画条）。库默认仍是 Auto。重命名会话 Dialog 同。新建窗口包名/PID 名单仍 Auto。见 [modules/logs.md](modules/logs.md)、[youi.md](youi.md)。
> **v3.98 变更（级别 BACKGROUND 收口文档文本格）：** Logcat 链路是 `LevelFormat` → `TextAccumulator` `[start,end)` → `Document.insertString` → `DocumentAppender.addRangeHighlighter(..., EXACT_RANGE)`；Editor 用同一把 `charWidth` 画字和 BACKGROUND，没有第二棵 overlay。Yohu 删 `.yohu-logs__wash` / `bindWashCells`（回收行子节点 + 表头 `chPx` 是第二套几何，字母不居中、切进程串列）。`markup-wash` 只把 `[from,to)` 写成文本节点的 `--yohu-wash-*`，CSS `1ch` 就是该节点的字符格。表头轨道仍走 `measureChPx`，禁止拿 CSS `ch` 冒充表头。见 [modules/logs.md](modules/logs.md)。
> **v3.97 变更（级别 BACKGROUND 字符格）：** 当时用文档偏移 × 表头 `chPx` 铺绝对定位色块。v3.98 删掉这条双几何。见 [modules/logs.md](modules/logs.md)。
> **v3.96 变更（级别 BACKGROUND 行盒）：** WebView2 `::highlight { background }` 只裹字母墨水。当时用 caret 量宽；v3.97 改字符格。`::highlight` wash 只上 `--yohu-fg-on`。禁止再拆 span / FieldSpan。见 [modules/logs.md](modules/logs.md)。
> **v3.95 变更（Yohu 级别块对齐 Logcat BACKGROUND）：** 选区已与着色解耦。Yohu 已知级别（V–F）与 Logcat 一样在 `" L "` 三格上 wash：字母 `--yohu-fg-on`、底 `--yohu-level-*`。v3.96 起底不再走 `::highlight`。Tag / 消息仍是 ink。禁止再把 V–E 收成只上字色。见 [modules/logs.md](modules/logs.md)。
> **v3.94 变更（日志着色 / 选区 / 关键字全量解耦）：** 对照 Logcat Editor Document + MarkupModel：一行一个文本节点。着色走 `CSS.highlights` / `::highlight`（ink = FOREGROUND，wash = BACKGROUND）。选区只铺 `::selection` 底，不改字色。关键字是文档偏移，不是 `<mark>`。删除按 FormatRange 拆 span、`display: contents`、`.yohu-logs__mark`。无 Highlight 引擎时零操作，禁止 span 回退。见 [modules/logs.md](modules/logs.md)。
> **v3.93 变更（级别着色不参与几何）：** 当时用 `display: contents` 去盒。v3.94 起不再拆 span。见 [modules/logs.md](modules/logs.md)。
> **v3.92 变更（日志文档划选收口原生 Selection）：** abspos 槽把 Range 拆成消息碎片，ch 带与 WebView2 `::selection` 两套几何。未开 listbox 的 document VL 改 `data-layout=flow`（行在文档流 + gap）。选区只走 `::selection`（`--yohu-doc-sel`）。删除 `docSelBandStyle` / `.yohu-doc-sel` / `visualLineBoxes`。Ctrl+A = `selectAllChildren` + 整表 Document。输入框仍走 `--yohu-text-sel`。见 [modules/logs.md](modules/logs.md)、[youi.md](youi.md)。
> **v3.91 变更（YoChrome 分层收口）：** L2 `ChromeSpec` 收齐 leading/bar/extra；L4 只读 L3 槽位。功能栏 `YoListPresence` 常挂，清空走 `each=[]` 播出场，禁止 `Show` 门闩卸树。日志页眉身份表改名 `logs-chrome-actions`（不再叫 chrome-bar）。见 [youi.md](youi.md)。
> **v3.90 变更（YoChrome 页眉 chip 进出）：** 模块页眉左右槽收口 `@yohu/ui`：`leading` 走 `YoPresence recipe=chip`，功能栏改 `actions[{key,node}]` + `YoListPresence recipe=chip`。终端取消 / 日志暂停与滞后徽章随身份进出。禁止模块自挂 Presence 或碎片 `children` 补页眉。文案换牌仍走按钮 `YoSwap`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.89 变更（设置阅读列 + 路径定宽）：** 全屏适配是居中阅读列，不是把表单拉满栅格。`YoPage role=settings` 列帽恢复 `SettingsMax` 920（`data-column=measure`）。路径槽 `YoTextField width=control` 定宽 `settings-control-max`，禁止 `block`/`width:100%` 套进 YoFormRow hug 簇（`size=1` + `overflow:hidden` 会裁成空铬）。右槽 `flex: 0 0 auto`，空间不够折行。见 [youi.md](youi.md)、[workbench.md](workbench.md)。
> **v3.88 变更（设置页壳收口 YoPage）：** 设置页根走 `YoPage role=settings`：左右 `page-margin` 40vp。当时列帽误用 `grid-max`、删 `SettingsMax`；v3.89 改回阅读列。页眉是第一子节点，页面级一根 `YoScroller`。禁止再在 settings.css 铺一套页垫。见 [youi.md](youi.md)、[workbench.md](workbench.md)。
> **v3.87 变更（日志页眉左右操作栏进出）：** 当时日志模块自挂 `YoPresence` / `YoListPresence` 补页眉。v3.90 已收口 `@yohu/ui` `YoChrome`（`leading` / `actions[{key,node}]`）。见 [youi.md](youi.md)。
> **v3.86 变更（文档表头跟 Document 同尺）：** `YoColFrame tone=document` 用等宽 caption；轨道 `charsTrack` / `logDocTrackTemplate(chPx)` 是探针 px，禁止 CSS `ch` 冒充文档格。`YoColHeader split` 出 mark 列缝（级别|消息不再粘成一词）。拖条仍是 `YoColResizer`。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)。
> **v3.85 变更（日志表头 YoCol 列架）：** 清单标题栏改 `YoColFrame cellPad=none` + `YoColHeader pad=none`，轨道 `headerColumns` / `logDocTrackTemplate` 的官方 Format `ch`。拖宽 `px→round(ch)` 回写 `FormatOptions.colChars`，文档即时重排；级别与消息不可拖。PID+TID 开时文档仍是一段 ProcessThread，表头两格。clip 横滑 `translateX(-scrollLeft)`。设置项仍只认 7 个 wire 开关，文案单源 `LOG_DISPLAY_COLUMN_CATALOG`。行仍是 Document.text，禁止 `YoColTrack`。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)。
> **v3.84 变更（官方 Document 模型）：** 采集改 `logcat -v long,uid,year` + 组装器（一条 logd 记录）。Formatter 写入官方 hang 空格（Soft-Wrap 关）或裸 `\n`（开）；默认 STANDARD = BOTH + AppName，`headerWidth=100`。清单去掉表格表头 / CSS hang / VisualBoard 视口预切。View 1 文档行 = 1 可视行。见 [modules/logs.md](modules/logs.md)。
> **v3.83 变更（clip 对齐 LogCat Soft-Wrap 关）：** 当时 hang 仍走 CSS、表头跟滚。v3.84 已按官方写入 Document。
> **v3.82 变更（长文本 clip / wrap）：** 设置 `log_line_layout`（立即，默认 `clip`）。当时 `clip` 右侧裁切。v3.83 起按官方 Soft-Wrap 关：硬 `\n` 仍切行，超宽底栏横滑。身份在 `@yohu/api` `log-line-layout`。当时画法只在 EditorView、禁止进 Formatter；现 `softWrap` 进 `FormatOptions`，hang 空格由 Formatter 写入 Document（v3.84）。见 [modules/logs.md](modules/logs.md)。
> **v3.81 变更（官方 Format 分段）：** 对照 AS `TimestampFormat` / `ProcessThreadFormat` / `TagFormat` / `LevelFormat`：每段自带 `width()` 与尾空格，删除表格 `padLeft` / `gutter` / `data-log-pad` / `LOG_PAD_LEFT_CHARS`。当时默认轨道 `24ch 6ch 24ch 4ch 1fr`，只有 Tag 可拖。现无表格表头，Tag 宽是官方常数（v3.84）。PID+TID 合成 BOTH（12ch）。选区空格全部进文档。见 [modules/logs.md](modules/logs.md)。
> **v3.80 变更（文档选区带）：** 当时手势是原生 Selection，绘制是 ch 带。v3.92 起未开 listbox 的 document 清单改流式行，选区只走 `::selection`。
> **v3.79 变更（文档选区对齐 Logcat）：** 当时用 `*::selection` + `--picked` 整行底。WebView2 对 `[data-tone=ink]` 只在行尾画出一条并洗字色；v3.80 改为选区带。
> **v3.78 变更（清单三件套编辑器）：** 抛弃 `layout→doc→wrap→color→projector→LogList→Row`。对照 AS `logcat/messages/` 只留 Formatter / Document / EditorView。着色写入时挂 range；软折行只在 View；复制面是 Document.text。见 [modules/logs.md](modules/logs.md)。
> **v3.76 变更（Logcat 软折行）：** 当时软折行在 `wrap.ts`。v3.78 起折行只在 EditorView，逻辑文档是 Document.text。见 [modules/logs.md](modules/logs.md)。
> **v3.75 变更（LevelFormat 文档流）：** 对照官方 `TagFormat` → `LevelFormat` → 消息：级别不是带左右垫的表格列。文档是 `" L "` + 1 空格；Tag 在级别可见时 gutter=0；消息 padLeft=0。默认轨道 `26ch 8ch 26ch 4ch 1fr`。表头「级别」贴 4ch（去列垫），禁止拖开。见 [modules/logs.md](modules/logs.md)。
> **v3.74 变更（LevelFormat 行盒）：** 对照编辑器 `TextAttributes.BACKGROUND`：级别段是行盒洗色，不是圆角徽章。L2 增加 `box=line|glyph`；`wash` 取代 `badge`。CSS `[data-box=line]` 铺满 `--yohu-row-height`，邻行相贴；禁止 `border-radius` / padding。行 `line-height` 跟行高，不再用 caption leading 把洗色收成芯片。见 [modules/logs.md](modules/logs.md)。
> **v3.73 变更（清单着色收口）：** 铬层色由引擎下发，不再写 `.yohu-logs__row-ts/pid` 这类字段色。Yohu：ts/uid=`--yohu-fg-3`，pid/tid=`--yohu-fg-2`。Logcat：时间/PID 对照官方 `TimestampFormat` / `ProcessThreadFormat` 无色键，继承行 `--yohu-fg`，禁止自造官方 hex。Tag 一律 `--yohu-log-ink`。当时 `padLeft` 固定 `LOG_PAD_LEFT_CHARS`；现尾空格在 Format `width()` 里（v3.81 / v3.84）。见 [modules/logs.md](modules/logs.md)。
> **v3.72 变更（清单文档 Accumulator）：** 对照官方 Logcat `MessageFormatter` / `LevelFormat`。当时 `formatLogDocTokens` 产出 pad / field；级别 field 是 `" L "`（3ch），着色铺在这三个字符格上。当时 `color/` 只查 `token` / `bar` / `barInk`。当时 View 入口是 `paintLogLine`（取代 v3.71 的 `contentColor`）。CSS 只认 `data-tone=ink|badge` / `data-bar`。删除行 style 袋、`invert`、`data-scheme`、`color/logcat.css`、0.5ch 借 pad。见 [modules/logs.md](modules/logs.md)。
> **v3.71 变更（日志内容配色分层）：** 方案身份在 `@yohu/api` `LOG_COLOR_SCHEME_CATALOG`；Yohu 级别板留 `colors.ts`；官方 Logcat V2 RGB 与 `--yohu-logcat-*` 排出在 `tokens/logcat.ts`；当时模块 `color/` 每方案一引擎，View 只调 `contentColor(id)`。设置项不自写 id/文案。筛选钮不换板。禁止社区紫 Assert。见 [modules/logs.md](modules/logs.md)。
> **v3.70 变更（日志 LogCat 配色）：** 设置 `log_color_scheme`（立即，默认 `yohu`）。`yohu` 仍是鸿蒙语义板：已知级别消息 / 左条 / 级别字 / Tag 共用 `--yohu-log-ink`。`logcat` 对照官方 Android Studio Logcat V2。色值分层见 v3.71。筛选钮不换板。禁止社区紫 Assert。见 [modules/logs.md](modules/logs.md)。
> **v3.69 变更（新建窗清单选中底归 VL）：** 包名/PID 清单不再模块自挂 `YoIndicator`，也不走 `tone=list`。选中底由 `YoVirtualList` 默认 document 单选 fill 自持；铬 `YoCorner flex=fill`，列表槽纵向吃剩余。过滤变短后 VL 再量滚轴，收回 16vp 侧轨，禁止选中条右侧留空。禁止 `bodyLead`（确认句居中）。见 [modules/logs.md](modules/logs.md)、[youi.md](youi.md)。
> **v3.68 变更（新建窗设备与划分左右排）：** 设备 `YoSelect block` 与包名/PID 分段同一行：左槽吃剩余，分段 hug 贴尾。禁止再拆成两行，禁止 `YoFormRow` 横排把 Select 收成胶囊。`YoSelectOption.description` 仍是次文案。见 [modules/logs.md](modules/logs.md)。
> **v3.67 变更（新建窗设备行 stacked Select）：** 当时用 `YoFormRow stacked` 让 Select 铺满。v3.68 起设备与划分共一行，不再单独占一行。`description` 次文案仍有效。见 [youi.md](youi.md)。
> **v3.66 变更（等宽走 Consolas）：** `--yohu-font-mono` 只走系统字体。对照 AS Logcat 默认 JetBrains Mono，Win10/11 收件箱最接近的是 Consolas（Vista 起）。禁止内嵌 JetBrains Mono。Cascadia Mono 不是 Win10 默认收件箱，不作首项。macOS 回退 Menlo。见 §2.2。
> **v3.65 变更（日志消息同 ink）：** 已知级别的消息与左条 / 级别字 / Tag 共用 `--yohu-log-ink`（行上 `data-level`）。解析失败仍走 `--yohu-fg`。paint 只留 Fatal `invert`。删除 `tintMessage` / `data-tint-msg`。见 [modules/logs.md](modules/logs.md)。
> **v3.64 变更（YoSearch 拼音）：** 检索引擎对汉字走全拼 / 音节前缀 / 首字母（`ü`→`v`）。权威在 `yohu-search` `data/pinyin.tsv`；YoUI 镜像同一份。高亮回标汉字区间。禁止模块自写拼音。见 [youi.md](youi.md)。
> **v3.63 变更（YoSearch 独立模块）：** 检索引擎从 form / domain / api 单文件拆出。权威在 `core/yohu-search`；YoUI `search/` 自持引擎分层 + 铬 + 模块 API。产品模块只接线。见 [youi.md](youi.md)。
> **v3.62 变更（Yo 搜索引擎）：** 当时 `@yohu/ui` 把引擎塞进 `form/search-model`。现收进独立 `search/` 模块，见 v3.63。
> **v3.61 变更（命令库折叠搜索）：** 当时命令库栏标题右侧搜索钮走 HarmonyOS Symbol `hm-search`。现收进 `YoSearch` 入口槽，见 v3.62。
> **v3.60 变更（命令块按步填参 1-0）：** `{n}` 只活在一条模板上。命令填参标签 `{n}`；块按步展开 `1-0` / `2-0`（步从 1 计、本步下标从 0 计），描述跟步骤走。落盘仍是 schema 3 的 `{n}`，不存 `{1-0}`。填值仍是按槽顺序的 `string[]`。旧块级 `params` 忽略。见 [modules/terminal.md](modules/terminal.md)。
> **v3.59 变更（命令块占位符作用域）：** 已废。条目级 `PlaceholderScope` / `entrySlots` / 「插入参数位置」不再使用。
> **v3.58 变更（命令块步骤进出场）：** 新增/删除步骤与参数描述同一套 Presence 配方 `list`（`YoReorderList` 行内播出，让位 `translateY` 留在行宿主）。短列表身份槽 `useListPresenceSlots` 由 YoListPresence 与 YoReorderList 共用。全步 `{n}` 并集已废，见 v3.60。见 [modules/terminal.md](modules/terminal.md)、[youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.57 变更（命令块图标）：** `block` 改与 `terminal` 同族：同一只提示符 + 右侧三行。禁止清单点 `list`，禁止 Lucide `square-stack` 碎角落。新增命令块钮、命令库树叶子、发送队列 Chip 同一字形。见 [modules/terminal.md](modules/terminal.md)。
> **v3.56 变更（滚动条侧轨按官方 hoverWidth）：** 对照 ArkUI `SetHoverWidth`：热区 / 内容让位 = `activeWidth + margin×2` = 16vp，不再用空闲条 4vp + 边 4vp = 8vp（那会让滑块贴死日期列）。静置 [8vp 空][4vp 条][4vp 边]；Hover GROW 8vp 仍落在槽内。`YoColFrame` 表头跟 16vp gutter 对齐。清单 fill / 投放框宽走视口内容盒，不进侧轨。见 [youi.md](youi.md)。
> **v3.55 变更（滚动条 Hover GROW / List Auto）：** 对照 ArkUI 内置条：unset 宽 Hover/Press `PlayScrollBarGrowAnimation` 4vp→8vp；短轨（<240vp）最短 `max(轨×20%, 8vp)`；点轨道先翻一页，500ms 后再 100ms 连翻。官方 List/Grid/Scroll 默认 `BarState.Auto`，`YoVirtualList` 不再强制 On。色仍走 40% `--yohu-fg-3`（官方默认 `#182431` @ 40%）。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.54 变更（命令块图标）：** 命令块身份从通用 `list`（清单点）换成 `block`（叠方块，Lucide `square-stack`）。新增命令块钮、命令库树叶子、发送队列 Chip 同一字形。禁止再用 `list` 冒充命令块。见 [modules/terminal.md](modules/terminal.md)。
> **v3.53 变更（数字框左值右步进）：** `YoTextField type=number` 左侧写数字、右侧叠上下箭。默认槽宽 96→80（5 位 tabular + `--yohu-layout-text-field-stepper`）。值 `text-align:start`。增减走 L2，触边/禁用/只读关对应钮。禁止再露 UA 步进、禁止模块自绘第二套数字皮。见 [youi.md](youi.md)。
> **v3.52 变更（Select 触发钮 hug 文案簇）：** `YoSelect` 默认跟选中字 + 箭头 hug，字箭 gap=`space-xs`。禁止 hug 写 `min-width`（v1.45 的 `space-xl*5` 会把「浅色」拉开，箭头贴虚拟右缘）。`block` 才让文案 `flex:1`、箭头贴尾。底板走 `--yohu-comp-gray`（v3.50 Container 洗），展开箭头翻转。见 [youi.md](youi.md)。
> **v3.51 变更（投屏 HWND 铺满主窗客户区）：** Windows 合成目标是主窗客户区，不是 avail/dest 卡片。占用 Fill=avail、Dest=contain，只走 DComp clip + 回缓冲绘制；侧栏改 avail 禁止 `SetWindowPos`。卡片外像素预乘透明；HWND 创建即 `WS_DISABLED`，不参与命中。出处：`CreateTargetForHwnd` 裁在窗口可见区；官方初始化用 Visual `SetOffsetX/Y`，不靠移窗。见 [ADR-v6-024](adr/ADR-v6-024.md)、[ADR-v6-026](adr/ADR-v6-026.md)、[ADR-v6-027](adr/ADR-v6-027.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.50 变更（展示类底板走 Container 洗）：** 色彩.md：普通按钮/搜索框底是基础色 Container（默认与 Primary 同级：浅黑/深白），不是 `comp_background_gray` 实灰。Theme Colors：Button / Chip / Select / TextInput / Search 走 `compBackgroundTertiary`；API 26 浅 = Container 5%、深 = Container 10%。`--yohu-comp-gray` 浅 `#0000000C` / 深 `#FFFFFF19`。Chip / Segmented 轨 / Progress 轨跟这条。`comp_background_gray` Dark `#E5E5EA` 仍记在 primitive，组件不消费。见 [youi.md](youi.md)、[harmonyos-design-notes.md](harmonyos-design-notes.md)。
> **v3.49 变更（壳侧栏展开收窄）：** `--yohu-layout-shell-nav` 232→200（与质量栏 / 命令组上限同档，8vp 栅格）。收起仍是 48 图标轨。禁止再写裸 232。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.48 变更（终端命令库栏标题 + 收窄）：** 左右分栏都走 `YoPanel title`（命令库 / 执行结果），对照鸿蒙电脑标题栏 Compact + `titleStyle` 一级字，禁止左栏无标题。`--yohu-layout-sidebar` 280→240（与预览同档，效率型 B 栏 ≤ 窗口 40%）。命令管理三栏仍是 Toolbar + Subheader（有图标钮）。见 [youi.md](youi.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.47 变更（标题文本色自底而上）：** 对照鸿蒙 `titleStyle`：主标题 / Dialog / 内容型 SubHeader = `font_primary`；列表型 SubHeader / 副标题 = `font_secondary`。`YoSubheader tone=list` 从 `--yohu-fg-3` 改 `--yohu-fg-2`（白底标题 ≥3:1，与图标钮同级）。`YoDialog` 标题显式一级字。禁止三级字当标题。见 [youi.md](youi.md)。
> **v3.46 变更（命令管理栏标题贴栏素底）：** `YoToolbar pad=xs` 不再嵌套 `surface-2` + control 8vp 灰带。卡片内栏标题对照鸿蒙 SubHeader：与清单文本同缘（行内 12vp），圆角只走面板 `role=card`。独立命令带仍是 `pad=band`。见 [youi.md](youi.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.45 变更（页眉 NORMAL 与画布分色）：** 浅色官方 `comp_background_gray` 与画布 `background_secondary` 同值 `#F1F3F5`，页眉贴画布时底板消失。桌面 `--yohu-comp-gray` 浅色改官方下一档 `background_tertiary` `#E5E5EA`；深色仍走官方 `comp_background_gray`。页眉次要（含文件「预览」）一律 `normal+neutral`，禁止再把页眉做成 TEXTUAL。CSS 仍只点 `--yohu-comp-gray`，禁止写 `--yohu-surface-2`。见 [youi.md](youi.md)。
> **v3.44 变更（圆角绘制铺满 CSS 盒）：** 锁行 WAAPI 插高时，YoCorner 量出来的 px `viewBox` 冻在起点，默认 `meet` 把描边 letterbox，发送栏左右抖。绘制空间改成 CSS 盒：`viewBox="0 0 1 1"` + `preserveAspectRatio="none"`，路径在单位方，半径按轴换成分数；内容裁切走 CSS `inset()`。量盒只换算 token，不再当第二套世界。Grow 行轴 `flex: 1 1 0%` 吃父级定宽。`YoScroller` 订 `useGrow()` traveling，插值中不新出侧轨。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.43 变更（YoButton 官方灰底 / 清涂装债）：** NORMAL 底改走 `--yohu-comp-gray`，hover/pressed 叠在灰底上，禁止整块换成 `--yohu-state-hover`。删除 `data-paint` / Button `success|warning`。浅色当时仍用 `#F1F3F5`；现以 v3.44 为准。见 [youi.md](youi.md)。
> **v3.42 变更（YoButton 对照鸿蒙 ButtonStyleMode）：** 公开轴从 Material 外形 `solid/outlined/ghost` 换成 ArkUI `buttonStyle`：EMPHASIZED / NORMAL / TEXTUAL。页眉次要与脚钮取消/破坏都走 `normal`，建设确认默认强调；内容区弱操作才 `textual`。废除 `outlined` 与 `YoButtonVariant`。灰底当时仍吃 `surface-2`；现以 v3.43 为准。见 [youi.md](youi.md)。
> **v3.41 变更（弱多行抬高逐帧）：** `spatialGrow` 改感知 300ms + 32 停长尾弹簧（response 0.36 / ζ≈0.80）。文字贴锁行底，顶边裁切揭开上一行，光标与发送钮同一基线；禁止顶对齐把末行裁进 overflow。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.40 变更（Dialog 出树 / Corner 布局盒 / 命令管理薄 Dialog）：** `YoDialog` Portal 到 `body`，与菜单 / 气泡同一条「祖先 overflow / transform 不得裁 fixed」。hug 才外包 `YoTravel`；fill 定高（命令管理）不套 Travel、不开 `data-clip`。`YoCorner` 量盒改 `offsetWidth` / `offsetHeight`，禁止 `getBoundingClientRect`（会吃 Presence `scale-in`，裁切盒冻在 96%）。命令管理 Dialog 只留开窗 / 保存 / 菜单；三栏 + 键位收进 `manager/Workspace`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.38 变更（document 单选片圆角单源）：** 命令管理组栏等 `tone=document` 单选：选中走 `YoIndicator` fill（`--yohu-ripple-radius`），悬浮曾画在 `list-row` 直角盒上，两态圆角分叉。L2 `resolveListRowRadius` 按谁画选中底定族：滑块族写 `data-radius=chip`，与 fill 同一 token；`tone=list` / document 多选块仍直角通栏。禁止再给悬浮另写一套半径。见 [youi.md](youi.md)。
> **v3.39 变更（内容用后高弹簧 / 铬跟锁行）：** 抖动来自铬跟 textarea 瞬切、锁行在插值。现铬绝对铺满 `YoGrow` 锁行，`body` 标 `data-grow-used` 才是量子盒。缺省 spec 从折叠用的 `spatialLocal` 换成 `spatialGrow`（感知 200ms + `springGrow` 微过冲）。输入任务 WAAPI 当拍绑 `document.timeline`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.37 变更（YoGrow 途中改目标 / WAAPI）：** 连续输入曾等结束用旧 from 重开。现 from 读宿主当前锁行，同拍改 to；DOM 意图与受控 value 只走一程。multiline 组禁止 stretch / `min-height:auto`。内容定高链里 CSS / `grid-template-rows` 的 used 不下行，升降同一 `element.animate` 写死 `height` from/to。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.36 变更（弱多行 YoGrow）：** 内容用后高与 Dialog 解锁量盒不是同一引擎。废除 `YoTravel fit=hug` 双轨（第二写属性、降程 snap、inline token）。公开 `YoGrow`：量槽内子盒，只插值 `grid-template-rows` px，`spatialLocal`，升降同一通路，`finish` 锁 command 目标。`YoTravel` 只保留 Dialog fill（`height`/`width`）。发送栏开行仍禁止 `min-content` / stretch。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.35 变更（弱多行高度单一权威）：** 发送栏上下抖：`inline-end` 开行 `min-content` / pane stretch 跟内容抢高；`height`/`min-height` 在 1fr/clip 里降程不起；`spatialSmall` 弹簧 `linear()` 过冲让降程卡在 from。当时仍把 hug 塞进 Travel。v3.36 拆出 `YoGrow`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.34 变更（弱多行 Travel hug 锁盒）：** hug 不再用 `min-content` 顶祖先（会和锁盒抢高，发送栏上下抖）。量盒读子盒 `offsetHeight`，锁盒不解。当时 `snapshot` 先挂 `data-travel`、抬高用 `min-height` 抗 clip；v3.35 改为只插值 `height`。同拍意图合并一次 `command`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.33 变更（弱多行用后高 / field-sizing）：** 废除 `\n` 计数 + calc 定值行高。`YoTextField multiline` 用后高走 UA `field-sizing: content` + `contain: inline-size`（粘贴 / 软折行 / 硬换行同一条排版；行宽钉在槽上，对照 AddressField 与 Chrome *form fields fit contents*）。`rows` 下限、`maxRows` 帽。盒高外包 `YoTravel axes={["block"]} spec="spatialSmall" fit="hug"`。当时 hug 误用 min-content 贡献，v3.34 改锁盒独占布局高。意图当拍。禁止 `scrollHeight` 量高、禁止控件自写 height 过渡、禁止模块再包 Travel。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.32 变更（滚条让出内容）：** 对照 ArkUI 内置条 overlay + 官方 ScrollBar 示例给内容右边距。溢出且未 Off 时 `data-gutter=on`，视口 `padding-inline-end` 让出 8vp，条 overlay 叠在槽里，内容回流不坐到滑块下。禁止侧轨当 flex 兄弟夺滚动口宽。Auto 隐条也留槽，避免跳布局。`YoColFrame` 表头跟 gutter 对齐。禁止 `scrollbar-gutter`。见 [youi.md](youi.md)。
> **v3.31 变更（命令库树目录不入队）：** `YoTree` 目录行 / 箭头 / Enter / 空格只开合，不 `onSelect`。命令终端点组不入队，只点叶子入队。缺省行高改 `--yohu-row-height-header`（紧凑 28 / 舒适 32），仍禁止套数据行。见 [youi.md](youi.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.30 变更（透明图标钮禁用四级字）：** `YoIconButton` 禁用油墨改 `--yohu-fg-4`。透明底没有禁用填，三级字与失焦描边/缀标同级会过跳；四级字仍能从深色 `surface-2` 分开。禁止再跟实心 `YoButton` 的 `--yohu-fg-3` 对齐。见 [youi.md](youi.md)。
> **v3.29 变更（禁用油墨 / 弱多行抬高）：** `--yohu-disabled` 只作禁用底（深色 = `surface-2` = `#2E3033`）。透明图标钮禁用油墨禁止走禁用底（发送栏空态纸飞机会隐没）。当时弱多行按硬换行 calc 抬高；现用后高走 field-sizing + YoTravel（v3.33）。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/terminal.md](modules/terminal.md)。
> **v3.28 变更（滚轴贴底 / Port 几何 / barHide）：** `YoVirtualList` 贴底用 `virtualTotalHeight` + `handle.scrollToEnd()`，禁止读 `scrollHeight`。`YoReorderList` 行盒与指针坐标用 `port.scrollTop()`。`useScrollerPort` 只在 `scroller-port.ts`，L4 不二次导出。Auto 隐藏走 `MotionDuration.barHide`（2s）。贴底阈值走 `Spacing.TwoXl`。见 [youi.md](youi.md)。
> **v3.27 变更（Dialog data-clip / Corner 公开槽 / RailIntent）：** `YoDialog` panel 自写 `data-clip`（=`fit∧open` 或 `traveling()`，DialogChrome 订），禁止 CSS `:has(.yohu-travel)` / 点 `__view` / `__content`；`data-travel` 只属 `YoTravel`。`YoCorner` 公开 `flex` / `overflow`（含 `auto` 藏条）/ `pad` / `direction` / `align` / `justify` / `gap`，禁止消费方点 `__content`。`YoRail` 只留 `RailIntent`，禁止 `RailPresentation`。`YoSubheader.meta` 贴标题、`actions` 行尾；`YoScroller` 视口 `flex: 1 1 auto`，禁止 `1 1 0`。见 [youi.md](youi.md)。
> **v3.26 变更（Subheader meta / Scroller hug 视口）：** `YoSubheader.meta` 贴标题，`actions` 只走行尾。设备栏徽章走 meta，刷新是标题行兄弟；展开时 heading 槽吃剩余宽，图标轨关流刷新留起边。`YoScroller` 视口 `flex: 1 1 auto`，禁止 `1 1 0` 把 hug 列表压成 0。Dialog 只订自己的 flex 子项，禁止点 `__view`。见 [youi.md](youi.md)。
> **v3.25 变更（YoScroller 对齐鸿蒙 ScrollBar）：** `BarState` Auto/On/Off；Auto 停滚 2s 淡出；滑块 4vp、距边 4vp 叠层，不预留侧轨；电脑轨道翻页/100ms 连翻；Hover/Press；`handle` 对齐 `scrollTo`/`scrollBy`/`scrollEdge`/`scrollPage`。`YoVirtualList` 长列表 `state=on`。`YoColFrame` 去掉 lane 垫。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.24 变更（虚拟列表接回产品条）：** `YoVirtualList` 内组合 `YoScroller`；宿主只裁切。见 [youi.md](youi.md)。
> **v3.23 变更（窗口去掉系统条）：** `YoScroller` 订 `railTraveling`，侧栏展开行程中不新出条。当时兼容层压残留 `overflow-y: auto`；现视口只 `overflow: hidden`，禁止残留 `overflow-y: auto`。`YoVirtualList` / `YoReorderList` 宿主只裁切、内组合 `YoScroller`（v3.24），滚轮改 `scrollTop`，禁止再藏系统条。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.22 变更（YoScroller 去掉系统条）：** 视口 `overflow: hidden`，禁止 `overflow-y: auto` 再藏系统条。滚轮改 `scrollTop`，产品条只有滑块。折叠开闭订 `YoCollapse.traveling()`，展开行程中不新出条。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v3.21 变更（侧栏一拍软弹簧）：** `YoRail` 宽、槽、卡高、文案流同一拍 `spatialRail`（300ms 软弹簧）。文案 nowrap + 位移淡出，禁止锁 232 硬裁，禁止先水平再垂直。v3.19 裁切轨撤回。见 [动画系统-v6.md](动画系统-v6.md)、[youi.md](youi.md)。
> **v3.20 变更（面板/弹窗去掉系统条）：** `YoPanel overflow` 只剩 `hidden` / `visible`（pane 默认 hidden）。`YoDialog bodyOverflow=auto` 只裁切。滚轴一律调用方组合 `YoScroller`。禁止容器 `overflow-y: auto`。见 [youi.md](youi.md)。
> **v3.19 变更（YoUI 族谱与容器独立）：** 源码按 HarmonyOS ArkTS 分类分族（`basic/` `form/` `display/` `container/` `scroll/` `overlay/` 等），拆除扁平 `components/`。容器只开槽：Toolbar 不嵌 Subheader、Dialog 不嵌 Scroller、Chrome 不嵌 Badge、Tree 用 `renderBadge`、TitleBar 三键只走 aria-label。模块组合 Yo*。预览区 `YoPanel overflow=hidden` + `YoScroller`。见 [youi.md](youi.md)。
> **v3.18 变更（旧组件耦合清理）：** 设备栏去掉 `__scroller` 包装，项滚动只挂 `YoScroller`。`YoCorner` 公开 `flex` / `overflow` / `pad`，模块禁止再点 `__content`。`YoToolbar title`、`YoTextField font=mono`、`YoVirtualList hostRef`、`YoScroller class` 收口栏标题 / 等宽输入 / 投放命中。地址策略测试收回 `@yohu/ui`，删除 files `address-edit` shim。投屏主题走 `getTheme` / `onResolvedThemeChange`。见 [youi.md](youi.md)。
> **v3.19 变更（侧栏裁切）：** 联调截图证明淡出/0fr/改卡高仍会看见字和高度在变。当时锁 232 硬裁，只过渡列宽，overflow 裁出图标列；已被 v3.21 撤回，现一拍软弹簧、禁止锁 232。当时刷新钮排在裁切可见区；现刷新是标题行兄弟（开流行尾，图标轨关流留起边，v3.26）。见 [动画系统-v6.md](动画系统-v6.md)、[youi.md](youi.md)。
> **v3.18 变更（侧栏顺序拍）：** 已被 v3.19 撤回。见 [动画系统-v6.md](动画系统-v6.md)、[youi.md](youi.md)。
> **v3.17 变更（侧栏槽位插值）：** 收起不再 `display:none`。已被 v3.18 撤回「槽高跟宽同拍」。见 [动画系统-v6.md](动画系统-v6.md)、[youi.md](youi.md)。
> **v3.16 变更（侧栏共享容器）：** 公开 `YoRail`。当时 `data-rail` 是宽度意图、`data-phase` 单属性编排；现意图/宽度拍走 `data-rail`，文案走 `data-stream`，`data-phase` 只记行程。行标题与列宽同一拍淡入淡出（鸿蒙四类元素 + 不新建容器）；关流强制列表开，开流跟用户折叠，与文案流同一拍。撤回「等 width 再 display」与 `spatialPanelSoft`。见 [动画系统-v6.md](动画系统-v6.md)、[youi.md](youi.md)、[workbench.md](workbench.md)。
> **v3.15 变更（效率列表 + 地址铬升库）：** 新增 `YoStatusDot` / `YoDivider` / `YoSubheader` / `YoListItem` / `YoDescriptionList` / `YoAddressField`。侧栏导航/设备行走 ListItem，状态点走 StatusDot，分组走 Subheader + Divider。设置/终端/设备列表滚轴走 `YoScroller`（钉底 `handle.scrollToEnd`，禁止 `scrollHeight`）。文件地址铬升到 `.yohu-address*`，模块只留路径行+上级。预览元数据走 DescriptionList。见 [youi.md](youi.md)。
> **v3.14 变更（侧栏 width 轨）：** 图标轨仍是 232↔48 双态。空间行程改到轨自己的 `width`（配方 `rail`）；工作行 flex（轨不收缩，主列吃剩余）。禁止再插值带 `minmax` 的页栅列。当时 `data-rail` 是宽度意图、`data-presentation` 是文案相位；现页栅/轨 `data-rail`=宽度意图，文案走 `data-stream`。文件预览另走配方 `preview`。见 [动画系统-v6.md](动画系统-v6.md)、[workbench.md](workbench.md)。
> **v3.13 变更（清单行盒 / 投放框解耦）：** 行盒 `list-row/` 只画格子。投放框独立为 `list-frame/` 叠加层（Explorer/Finder/VS Code：框不是行描边），`YoCorner` 直角环，缩进躲开面板 clip。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[文件传输-v6.md](文件传输-v6.md)。
> **v3.12 变更（侧栏图标轨）：** 壳侧栏是常驻双态轨，不是抽屉。展开 `--yohu-layout-shell-nav`（232，设备卡 + 图标与标题）；收起 `--yohu-layout-shell-nav-icons`（48，与标题栏三键同一热区）。当时文案离散切态，顺序拍（展开先宽、落地再出文案）；现宽/槽/卡高/文案同一拍 `spatialRail`（v3.21），禁止先水平再垂直。图标留在起边槽。禁止把展开内容锁 232 再裁到 0，禁止 `inert` 整栏。列插值已由 v3.14 改为轨 `width`。见 [动画系统-v6.md](动画系统-v6.md)、[workbench.md](workbench.md)。
> **v3.11 变更（清单行铬独立模块）：** Family B 行盒从 VirtualList/chip 拆出 `list-row/`（直角通栏 hairline、选中底）。投放框已由 v3.13 拆到 `list-frame/`。`YoVirtualList` 只组合行盒与 `hotKey`，不再挂 `yohu-interactive` / `focus-ring`。禁止模块 `--drop`。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[文件传输-v6.md](文件传输-v6.md)。
> **v3.10 变更（YoScroller + 同拍进场）：** 公开 `YoScroller`（对照 ArkUI ScrollBar：无法滚动不显示，滑块可拖）。`YoPresence` 进场 `when \|\| present` 同拍挂载。`YoReveal` 禁止 JSX 先写布局轴；落定后 Travel 祖先 `overflow: clip`，折叠不再被 abspos 撑出滚条。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.09 变更（公共 YoTravel）：** L2 Travel 替换 Dialog 私有 hug-travel。公开 API 只留 `YoTravel` / `YoReveal` / `YoSwap` 等 Yo*。意图当拍量 `offset*` 写 used px，无 hold / rAF / MutationObserver。Dialog / 删除名单只消费。滚条已由 v3.10 收进 `YoScroller`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.08 变更（Dialog hug 同步行程 + Reveal 父级裁切）：** YoReveal 绘制轴始终绝对定位，出流不自裁；行程中主槽 clip。已被 v3.09 公共 Travel 收口。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.07 变更（Dialog hug 滚条侧轨）：** 滚条不再叠在 Chip 上。当时侧轨 8vp（内容边 4 + 滑块 4）进布局，`data-lane` 开合；现叠层 4vp、不预留侧轨（v3.25）。当时滑块只画在轨里；现叠层不占布局（v3.25）。轨宽过渡已由 v3.08 去掉。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.06 变更（Dialog hug 叠层滚条）：** 滚条不再是 `overflow` 硬切。叠层 4vp 滑块，相位 `in/on/out`，显隐走 effects 透明度；收回用上一拍滑块淡出。已被 v3.07 侧轨收口。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.05 变更（Dialog hug 意图行程）：** hug-travel 只认名单开合 / 子节点增删，量 `offsetHeight`，不再 ResizeObserver 盯盒。binder 跟 Presence 寿命；关窗冻锁，exit 不把内容区改成 fill-flex。取消未展开不再折内容。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.04 变更（Dialog Reveal + hug 锁高）：** 名单不再走 Collapse `clip`。当时 `YoReveal` 当布局轴（开进流、关出流仍绘制）；现绘制轴始终绝对定位，布局/盒高交给 `YoTravel`（v3.09）。fit 盒高锁在用后 px，目标高是解开后的用后高。行程中主槽 clip。当时滚条是溢出结果不是动画；现调用方组合 `YoScroller`（v3.20）。传输列表仍 `panel`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.03 变更（Dialog used-clip）：** fit 弹出框一条行程：盒高 hug-travel、名单留在 `YoCollapse clip` 槽里由主槽裁、滚条只走效果淡出。已被 v3.04 Reveal 收口。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.02 变更（Dialog 边框 hug-travel）：** fit 弹出框的可见盒高插帽内用后高（`spatial-panel`），不再跟 Collapse `0fr/1fr` 去插整份名单固有高。已被 v3.03 used-clip 收口。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.01 变更（组件解耦 + Collapse 自持）：** Chip 不再写 `data-dialog-skip`。Dialog 脚钮只数 `button` 槽，CSS 不点 `.yohu-button`。YoCollapse 补 L2/L3，`panel`/`fill` 只打自己的 `__content`。删除其余名单是预览格的兄弟，不再嵌进网格。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)、[modules/files.md](modules/files.md)。
> **v3.00 变更（YoChip 与按钮同构）：** 宿主排版，`YoCorner` 只 `paint` 胶囊。圆钮是宿主子级，不再进 Corner 裁切盒，也不再 `clip=false` / overflow 补丁。见 [youi.md](youi.md)。
> **v2.99 变更（YoChip 推倒重做）：** 对齐鸿蒙 Chip：高 `control-height-sm`，关闭是 16vp 正圆（`fg-2` 底 + `surface` 叉），不再嵌套 YoCorner 测宽。去掉 `dismiss` / `YoChipDismiss` / hover 藏钮。见 [youi.md](youi.md)。
> **v2.98 变更（脚钮灰底 + Chip 圆钮）：** 弹出框脚钮对照鸿蒙 NORMAL：`ghost-tone` 走 `--yohu-surface-2` 灰底 + 语义字，不再 TEXTUAL 透明。YoChip 关闭是自绘圆形底。圆钮始终可见。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)。
> **v2.97 变更（焦点/分段填色收口）：** `bindFocusModality` 只在 L1 token 入口绑一次，壳不再二次 bind/unbind。分段选中 hover 叠 `--yohu-state-*`，L2 不再列 `--yohu-accent-hover/pressed`。去掉未用的 `.yohu-focus-host--inset`。见 [youi.md](youi.md)。
> **v2.96 变更（胶囊多选级填 + 焦点框）：** 级别筛选选中填恢复 `item.fill=var(--yohu-level-*)`（鸿蒙 `selectedBackgroundColor` 项覆盖）；缺省胶囊多选仍是强调色。焦点框只在 Tab 激活（`bindFocusModality` / `html[data-yohu-focus=keyboard]`），指针卸掉；环走 `::after` + `border-radius: inherit`，禁止 CSS `outline` 直角。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)。
> **v2.95 变更（弹出框脚钮现行段收口）：** §2.7 不再写取消 `ghost+neutral`。脚钮只留一套：取消 TEXTUAL=`ghost+accent`，破坏 TEXTUAL=`ghost+danger`，建设确认 EMPHASIZED=`solid+accent`。与 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[harmonyos-design-notes.md](harmonyos-design-notes.md) 及落地一致。v2.90 changelog 仍是历史。
> **v2.94 变更（级别筛选走分段、去掉 ink+flush）：** 级别独立多选只走 `YoSegmentedButton` `type=capsule` `multiple` `size=sm`。未选字色用公开 `item.ink=var(--yohu-level-*)`；当时选中走胶囊强调底；现级别筛选 `item.fill=var(--yohu-level-*)`（v2.96）。`YoIndicator` 在轨内与项同父。禁止自造 `YoCorner`+flush Button、禁止 `.yohu-ink` 桥、禁止点库内部 class。行反色仍只有 Fatal。删除名单网格间距 ChipGroup `itemSpace` 8vp = `--yohu-space-sm`。见 [youi.md](youi.md)、[modules/logs.md](modules/logs.md)、[modules/files.md](modules/files.md)。
> **v2.93 变更（分段按钮三种）：** `YoSegmentedButton` 对齐官方页签单选 / 胶囊单选 / 胶囊多选。`multiple` 仅 `capsule` 生效。多选 `values` + 再点取消，与单选共轨、相邻选中连成一块，不画单选滑块。内容含图片与 `selectedIcon`。图文上下排。电脑小圆角 `role=control`。见 [youi.md](youi.md)、[harmonyos-design-notes.md](harmonyos-design-notes.md)。
> **v2.92 变更（设置去行线 + 分段/开关/模块铬）：** `YoFormRow` 与设置关于块不再画 hairline。`YoSegmentedButton` / `YoSwitch` 轨走 `YoCorner`。L5 导出 `YoCorner` / `CornerPillRadius`（仍不导出路径函数）。日志级别格与新建清单、文件路径编辑盒 / 校验条 / 传输卡改走算法圆角；级别槽间不画分割线。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[modules/logs.md](modules/logs.md)。
> **v2.91 变更（选中软底 + 剩余矩形铬）：** `--yohu-state-selected` 改走官方 `interactive_select`（品牌 20%），字走 `font_primary`，不再用 `interactive_active` 实底洗白。选中悬停/按压叠中性 5%/10%，禁止跳回 accent-hover 实底。YoChip / YoBadge / YoToolbar / YoProgressBar / TextField addon 改走 `YoCorner`。见 [youi.md](youi.md)、[harmonyos-design-notes.md](harmonyos-design-notes.md)。
> **v2.90 变更（真机对照）：** 弹出框脚钮当时 TEXTUAL 透明；现取消 `ghost+accent`、破坏 `ghost+danger`、建设确认 `solid+accent`（v2.95）。空名创建钮置灰。YoTextField / YoToast / YoCheckbox 改走 `YoCorner`，去掉 Toast Fluent 左边条。壳层挡住 WebView 原生右键（写入控件除外）。见 [youi.md](youi.md)。
> **v2.89 变更（算法圆角）：** 新增 `corner/`（L2 四分之一圆路径 + evenodd 内侧描边环，L4 `YoCorner`）。禁止铬面再用 CSS `border` + `overflow:hidden` 叠圆角（WebView 毛边）。PC：按钮/菜单/气泡 `control`=8，卡片/弹出框 `card`/`dialog`=16（手机 20/32 的电脑收敛）。YoDialog 三区仍不画分割线。见 [youi.md](youi.md)。
> **v2.88 变更（弹出框铬对照 HarmonyOS）：** YoDialog 标题居中、三区不画分割线；操作区 AUTO（1 居中 / 2 铺满 / ≥3 从下至上）。YoButton 字重 Medium。整页 `data-sized` 仍按窗口铬。脚钮配方当时以 v2.90 为准；现以 v2.95 / §2.7 为准。见 [youi.md](youi.md)。
> **v2.87 变更（YoDialog 盒模型）：** 对照 Fluent Dialog（钉铬、只滚 Body）+ 鸿蒙 `FIT_CONTENT`（内容帽不是 90% 视口）。`data-box` = fit / fill / exit。hug 滚槽预算 `--yohu-layout-dialog-body-max`。`bodyLead` / `bodyTail` 钉住确认文案与展开钮；当时 Collapse 只进 `__scroller`；现 fit Dialog 走 YoTravel，视口槽由调用方组合 YoScroller，其余名单 YoReveal，禁止再套 Collapse / 点 `__scroller`。删除确认不再把整块 body（含收起）滚走，收回不再把盒归零。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.86 变更（气泡落点离散 + 主题抬升铬）：** 落点不是滑块。`tooltipPlaceDiscrete`；层未 `data-placed` 先透明；禁止 `top/left` transition（首帧 `auto→px` 与 Unique 换到关闭键会横滑，有时又没有）。进场 `yohu-tip-*` 只在落点后播。铬跟主题：浅色 `Surface`、深色 `Surface2`，不再反色白块。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.85 变更（指向气泡反色 + 箭头）：** `YoTooltip` 不再套 Select 的 `placePopover` / `--yohu-surface`。L0 排出 `TooltipBg/Fg/Border`、`Layout.Tooltip*`、`--yohu-shadow-overlay-drop`。L3 `tooltip-place` hug 内容、贴边 6vp、箭头对锚点。标题栏贴顶翻下。进出场 `yohu-tip-*`。v2.86 撤回 Unique 滑位与反色对。见 [youi.md](youi.md)。
> **v2.84 变更（YoChip block 关闭贴盒尾）：** `block` 是填格行：`__label` `flex: 1 1 auto` 吃中间，关闭流内贴盒 inline-end。hug（过滤 Token）仍跟文案。禁止 absolute。见 [youi.md](youi.md)。
> **v2.83 变更（YoSwap 先换目标字再插宽）：** 换牌一律先换目标文案，再把槽宽从旧固有宽插到新固有宽。目标宽只认 `__inner`。禁止「先裁旧字、收完再换字」（展开/收起最后一帧残字闪一下）。见 [动画系统-v6.md](动画系统-v6.md)。
> **v2.82 变更（删除名单同一网格 + Dialog 出场锁盒）：** 删除确认预览/其余是同一张网格，其余占满一行，间距只认格子 `space-xs`。`YoDialog` `open` 只是 Presence 开关；出场锁最后一次打开盒，hug 不随 Collapse/名单折高。载荷走 `onExitComplete`。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.81 变更（弹窗唯一滚轴 + Chip 交叉轴 + panel 不变换裁切盒）：** 当时 `YoDialog` `overflow=auto` 是弹窗唯一滚轴（横 hidden、纵 auto）；现 `bodyOverflow=auto` 只裁切，条由调用方组合 `YoScroller`（v3.20）。文件删除确认当时撤掉模块内 scroller；现删除名单 children 内再组合 `YoScroller`（v3.20）。当时 `YoCollapse recipe=panel` 淡入上移打 `__inner` 的直接子级；现打自己的 `__content`，`__inner` 只裁切高度。禁止变换裁切盒。YoChip 单行，交叉轴由宿主 `align-items: center` 统一，关闭钮不写 `align-self`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.80 变更（YoDialog 首焦与 Chip 填格）：** 有标题走 `aria-labelledby`。`initial=footer` 入场落页脚第一钮（文件删除确认）。当时 Chip 写 `data-dialog-skip`，不抢首焦；现禁止代写（v3.01）。`block` 铺满父格。显式高度才 `data-fill`，hug 弹窗内容区不吃 90% 高。见 [youi.md](youi.md)。
> **v2.79 变更（选中块仍画清单 hairline）：** `tone=list` 行底不再在 `--selected` 时改透明。v2.54 已撤第二套选中项间线，再藏清单线会让多选中间分不清行。邻接圆角照旧。见 [youi.md](youi.md)。
> **v2.78 变更（无设备栏 hug）：** 设备栏无设备时 `data-empty` + `YoCollapse` 默认 collapse + `YoEmptyState size=sm`，栏不把 42% 帽当目标高度。引导改短句；有 `lastError` 才出明细和重试。有列表仍 `recipe=fill`。`YoEmptyState` 基态 hug，只有 `fill` 才 `flex:1`。见 [youi.md](youi.md)。
> **v2.77 变更（级别筛选选中只认 aria-pressed）：** 槽不再写 `data-paint` / `data-level`，也不再设 `--yohu-button-*`。当时 ink 桥；现禁止 `.yohu-ink`（v2.94）。当时 inherit 按下字走 `fg-on`；现 `item.ink` / `item.fill=var(--yohu-level-*)`（v2.94 / v2.96）。行 Fatal 反色仍用 `data-paint=invert`。见 [modules/logs.md](modules/logs.md)、[youi.md](youi.md)。
> **v2.76 变更（级别筛选一律反色，去掉 ink 洗度双底）：** 筛选格选中不再分软底/反色。删除 `InkWash` / `--yohu-ink-wash-*`。V–F 按下同一配方。已被 v2.77 收到 inherit `aria-pressed`。
> **v2.75 变更（级别筛选 ink 洗度收口）：** 选中不再走 `--yohu-state-hover`（六格同灰）。L0 `InkWash` 排出 `--yohu-ink-wash-selected` 20% / `--yohu-ink-wash-hover` 10%。L1 `.yohu-ink-wash` 从 `--yohu-log-ink` 派生 fill/soft。已被 v2.76 删除。
> **v2.74 变更（HTML 首帧画布跟 token）：** `#yohu-boot` / `html,body,#root` 深色不再铺 OLED `#000000`。内联只写 `background-color: var(--yohu-canvas, Colors.BgBase | DarkColors.BgBase)`，与 `window_boot::CANVAS_DARK` `#191A1C` 同值。选择器不得压过 token。`boot-theme.js` 去掉空 catch。Vite 端口读 `tauri.conf.json` `devUrl`。boot z-index 由契约锁死。见 [workbench.md](workbench.md)。
> **v2.73 变更（启动 overlay 铺满不挖透明角）：** 同屏 Shared overlay clip 从 splash `Radius.Md` 收到 **0**，铺满后目标 HWND 每个像素都是不透明画布。`host_radius`（`Radius.Sm`）只描述主窗 DWM 圆角，揭窗后才出现，不进 overlay clip。overlay HWND `DWMWCP_DONOTROUND` + 整窗 `DwmExtendFrameIntoClientArea`；小窗 RGN 同样 DONOTROUND。禁止铺满时 clip 出透明四角（Win11 会合成黑）。见 [workbench.md](workbench.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.72 变更（虚拟列表槽位几何 inline）：** 槽位行 `position:absolute` + `translate3d` 由 L2 `virtualRowBoxStyle` 写进 inline。壳最后载入 `states.css`，`.yohu-interactive { position: relative }` 会盖掉等特异的 CSS absolute，行高与位移叠成双倍间距。listbox 行 CSS 同样写出 `position: absolute`。见 [youi.md](youi.md)。
> **v2.71 变更（虚拟列表槽位就地换绑）：** `YoVirtualList` 只按槽位 `0..poolSize-1` 做 `For` 身份。行 Y 走 `translate3d`，禁止 `top` 跳动。`renderRow` 是 `Component<{item, index}>`，槽位回收只换 props，禁止函数快照返回新 JSX。listbox 行关掉 `isolation` / `::before`，多选底画在行上。document 槽位回收后原生 Selection 不跨原点保留。见 [youi.md](youi.md)。
> **v2.70 变更（启动表面矩形像素 + clip 圆角）：** 交接不再从 HWND DC 抓像素。`BootFrame` 是 paint 画出的不透明矩形（四角即画布色）。`BootSurface` 锁定 canvas + splash/host 半径。小窗 `SetWindowRgn` 与 overlay `IDCompositionRectangleClip` 只做外形 clip。overlay HWND `DWMWCP_DONOTROUND`（`NOREDIRECTIONBITMAP` 再交给 DWM 圆角会出黑角）。禁止抓窗后补洞，禁止把 RGB=0 当成圆角外（浅色标题就是黑）。见 [workbench.md](workbench.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.69 变更（选字强调对 + Token chip 配方）：** `--yohu-text-sel` 改为 `background_emphasize` 实底，新增 `--yohu-text-sel-fg` = `font_on_primary`。45% 品牌叠白底约 2:1，级别 ink 更不可读。当时全局 `::selection` 与日志拖选/Ctrl+A 同一对；现输入框仍走这一对，文档选区走选区带 / `--yohu-doc-sel`（v3.80）。Tag 气泡入场走 `YoListPresence recipe=chip`（横向裁宽，禁止套纵向 `list` 撑铬高）。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.68 变更（虚拟列表槽位池）：** `YoVirtualList` 当时回到单滚轴（自己 `overflow-x: hidden` + `overflow-y: auto`），与 `YoColFrame` 表头共用 `scrollbar-gutter`；现宿主只裁切、内组合 `YoScroller`，禁止 `scrollbar-gutter`（v3.24）。撤回 v2.66 `__scroll` 拆层。选择模式 `For` 按稳定槽位回收行节点；document 仍按 item key 保原生划选。fill 滑块 `decorate={false}`，`top`/`left` 落在 `__inner`；禁止 `yohu-indicator-host` 打在滚轴或超高 inner。多选 roving 只有活动行 tabindex 0。见 [youi.md](youi.md)。
> **v2.67 变更（YoTextField Token 入写盒主轴）：** Token 槽 `display: contents`，气泡与 input 同属写入盒 flex 行。写入盒只 `overflow: hidden`，禁止槽内 `overflow-x: auto`（铬高弹出 Windows 横条）。input `flex: 1 1 0%` + `width: auto`，禁止 `width: 100%`。L4 必须绑 `data-tokens`。`YoChip` 关闭钮流内右上，过长省略。见 [youi.md](youi.md)。
> **v2.66 变更（虚拟列表视口滑块）：** `YoVirtualList` 当时拆 `__scroll`；已被 v2.68 撤回，现宿主只裁切、内组合 `YoScroller`（v3.24）。fill 滑块挂视口宿主，不再把 `overflow: hidden` 打在超高 `__inner` 上（多选上滑空白）。多选 ≥2 不挂滑块。窗口按滚动方向加厚 overscan。当时删除超出预览走 Collapse panel；现其余名单 YoReveal + children 内 YoScroller，禁止再套 Collapse panel。见 [youi.md](youi.md)。
> **v2.65 变更（日志 Tag 精确多针 + 气泡 + 选区正文）：** Tag 针改为 OrdinalIgnoreCase **精确**命中（`libc` 不命中 `libcomposer_ext`）。逗号提交后前一针变成 `YoChip`（右上角删除）。当时清单字段 pad 空格 `data-log-pad` + `user-select: none`；现尾空格在 Document 里、全部可选（v3.81 / v3.84）。见 [modules/logs.md](modules/logs.md)、[youi.md](youi.md)。
> **v2.64 变更（日志 Tag 多针筛选）：** Tag 框逗号 / 分号 / `|` 分隔多个针（OR），当时子串；现精确命中（v2.65，libc 不命中 libcomposer_ext）。空白留在针内。空或仅分隔符 = 不限。过滤生效走公开 `active`。导出与 UI 同一套 `log_filter.json`。禁止正则。见 [modules/logs.md](modules/logs.md)。
> **v2.63 变更（命令参数插入与填参弹窗）：** 命令管理具体命令标签为 `具体命令（{n}代表使用命令时需要填入的独立参数）`，按钮「插入参数」。每个实际出现的 `{n}` 是独立参数（`{13}` 不带出 `{0}`…`{12}`），可编描述（`params`，空不落盘）。填参弹窗列出原始命令与带描述的实际 `{n}`，不展示预览。见 [modules/terminal.md](modules/terminal.md)。
> **v2.62 变更（换位浮层 + 让位 + 插缝）：** 对标鸿蒙 List 浮起占位、Apple 水平插缝、dnd-kit overlay。过臂距后：浮层跟指针、源行淡占位、邻行让位、插入条只出现在行缝（最近中线）。Escape 取消。禁止只画一条钉在行顶的线当换位。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.62 变更（占用卡片是 HWND）：** Dest 落地后 HWND=contain dest，clip 铺满客户区。Fill↔Dest 才 DComp clip。侧栏只 `SetWindowPos` 卡片，禁止槽 HWND + clip.left 双轨。见 [ADR-v6-027](adr/ADR-v6-027.md)。
> **v2.61 变更（VirtualList 统一换位）：** `onReorder` 收口几何；v2.62 补齐浮层与让位。撤回 v2.60 常驻手柄。
> **v2.60 变更（已撤回）：** 曾用模块内 `ReorderGrip` 常驻手柄；v2.61 升到 VirtualList。
> **v2.59 变更（fill 滑块宿主两轴 hidden）：** `YoIndicator` fill 宿主必须 `overflow: hidden`（两轴裁切、不画条）。禁止只写 `overflow-x: hidden`——CSS Overflow 会把另一轴 `visible` 算成 `auto`，弹簧过冲在 Windows 弹出右侧纵条（命令管理组切换同症）。`YoVirtualList` 当时宿主滚轴 `overflow-x: hidden` + `overflow-y: auto`（与 `YoColFrame` `scrollbar-gutter` 同契约）；现已撤回，内组合 `YoScroller`。设备栏 / 导航 / 设置 / 终端名单纵滚走 `YoScroller`（v3.10 / v3.15 / v3.18）；list 宿主只 `overflow: hidden`。禁止在滑块宿主上写 `overflow: auto`。见 [youi.md](youi.md)、[动画系统-v6.md](动画系统-v6.md)。
> **v2.58 变更（深色遮罩与阴影）：** `--yohu-scrim` 浅 10% 黑 / 深 40% 黑。`YoDialog` 遮罩只消费它，禁止 `fg` 10%（深色会洗成白雾）。深色阴影按抬升后的画布重校准，不再按纯黑页用 55% 黑。命令管理等全部 `YoDialog` 同一条链路。
> **v2.57 变更（日志级别色单源收口）：** `--yohu-level-*` 只有 V–F 六枚 ink。V 用 `font_secondary`；D/I/W/E 仍是 brand/confirm/alert/warning；F 是 warning 压黑（对照 AS Assert，禁止社区紫、禁止 f-bg）。View 写 `--yohu-log-ink: var(--yohu-level-${key})`；Fatal 反色走 `data-paint=invert` + `fg-on`；Error/Fatal 消息走 `data-tint-msg`。CSS 禁止再列六条 `[data-level]`。见 [modules/logs.md](modules/logs.md)。
> **v2.56 变更（深色画布凹槽）：** `--yohu-bg-base` 深色改映射 `background_secondary` `#191A1C`，与浅色雪域灰同构。卡片仍 `#202224`，次级仍 `#2E3033`。禁止再把桌面页铺成 OLED `#000000`。`window_boot::CANVAS_DARK` 必须同值。见 [harmonyos-design-notes.md](harmonyos-design-notes.md) §1.4 / §1.6。
> **v2.55 变更（YoTextField 写入盒）：** 字/caret 落在 `--yohu-text-field-line`（铬高 − 两侧 hairline）。单行 input 高与行高等于写入盒，禁止 `height: 100%` 配 `leading-ui`。复用壳类的 textarea 用 `padding-block` 居中第一行。发送栏不再锁 `height: control-height`。见 [youi.md](youi.md) YoTextField。
> **v2.54 变更（撤回选中邻接分割线）：** 删掉 `StateFill.SelectedRule` 与 start/mid `::after`。连续选中只保留邻接圆角。命令管理中栏只参考文件清单：条目名之间走 `YoVirtualList tone=list` hairline，清单背板 `--yohu-canvas`。不是文件表，不走 `YoColFrame`。禁止再为选中块另画项间线。见 [youi.md](youi.md)、[modules/terminal.md](modules/terminal.md)。
> **v2.53 变更（多选项间分割线）：** 曾用 `--yohu-state-selected-rule` 画连续选中项间线；v2.54 撤回。
> **v2.52 变更（同屏 fill 跟启动画布）：** Shared overlay 2×2 fill 只消费 `window_boot::canvas_bgra(boot_dark())`，对齐 `--yohu-bg-base`。`SplashPlacement` 锁定几何 + dark。`prepare_main_window` 的 System 探针跟这份 `boot_dark()`，禁止再采 `win.theme()`。capture 客户区 DC，DIB 先铺画布色再 BitBlt。禁止从 Snapshot 角点猜色，禁止 `yohu-motion` 持画布色。见 [workbench.md](workbench.md)。
> **v2.51 变更（气泡只给无文案铬）：** `YoTooltip` Unique 槽只服务图标钮 / 窗控 / 空热区。`Tree` / `Select` / `ColHeader` 不再内包气泡。可见文案（设备卡、表格格、路径、任务名、级别字母）不弹气泡；多出来的信息画在界面或只走 `aria-label`。禁止用气泡复述已画出的字，禁止原生 `title` 顶替。见 [youi.md](youi.md)。
> **v2.50 变更（主窗跟启动工作区）：** 小窗锁定主屏工作区；主窗创建与揭窗前都 `set_position` 到同一块。禁止 `tauri.conf` `center`、禁止交接只 `SetWindowPos` 不写 Tao。见 [workbench.md](workbench.md)。
> **v2.49 变更（启动小窗落主屏）：** 原生小窗在主屏工作区居中，不跟光标所在屏。尺寸用主屏 `GetDpiForMonitor`。禁止 `GetCursorPos` 选屏，禁止 `SM_CXSCREEN`。见 [workbench.md](workbench.md)。
> **v2.48 变更（投屏铬拥有回缓冲）：** Empty/Loading/Paused 每拍 Present 铬（填充+文案+描边）。描边画在当前可见 clip（`clip_now`），完整落在内侧。禁止 dirty 一次画完，禁止动画期跳过描边后再也不画。色板：surface 填、`--yohu-border-strong` 边、空态图标 `fg` + `surface-2` 井。见 [modules/mirror.md](modules/mirror.md)。
> **v2.47 变更（投屏舞台由工作台开关）：** HWND 显隐跟 `ModuleId.Mirror`，走 `mirror.present.setActive`。离开投屏同一拍拆窗，再淡出网页。`MirrorView` 只报 avail。删除 Presence 观察与 layout `epoch`。铬 `dark` 仍跟 `data-theme`。见 [modules/mirror.md](modules/mirror.md)、[ipc.md](ipc.md)。
> **v2.46 变更（投屏 HWND 离场 + 铬跟主题）：** 曾用 Presence `data-state` + `epoch` 挡在途包；v2.47 撤回，改由工作台拥有开关。
> **v2.45 变更（路径铬 hug + 指针门闩）：** 路径**行**铺满顶栏，**铬**只 hug 可见盒（浏览=面包屑+短热区，编辑=输入盒）。盒外（含顶栏剩余）不是路径栏：不进编辑、取消只认输入铬。编辑时面包屑 `display: none` 退出文档流，收回只 clip 输入铬，文字与边框同一盒。打开手势 `pointerdown` `preventDefault`，`pointerup` 后再 focus，避免 Chromium mouseup 全选；`Ctrl+L` 无门闩。见 [modules/files.md](modules/files.md)。
> **v2.44 变更（投屏质量栏收窄）：** 右侧功能栏宽改走 `--yohu-layout-mirror-func`（200px），不再共用文件预览 `--yohu-layout-preview`（240px）。操作栏仍是 `--yohu-layout-mirror-ops`。
> **v2.43 变更（路径展开不预选）：** 点空白 / `Ctrl+L` 展开后光标落在末尾，不预选全文。选区与槽滚动规则在 `@yohu/ui` `address-field-model`（`addressOpenCaret` / `addressScrollPin`）；揭开结束只保焦，不再二次改选区。见 [modules/files.md](modules/files.md)。
> **v2.42 变更（路径输入 hug 文字）：** 点空白展开的是输入盒，不是整栏铺满。盒 `width: max-content` + `field-sizing: content`，`max-width: 100%` 只当槽视野；短路径不再 `min-width: 100%`。当时 inert；现 `display: none` 退出文档流（v2.45），避免旁侧再露一段路径。见 [modules/files.md](modules/files.md)。
> **v2.41 变更（路径栏点空白进编辑）：** YoPanel 自定义顶栏是块级槽（不是 title+actions 那条 flex 行），路径行铺满主轴。点分段右侧剩余 / 分隔符 / 行内边距进入同一格输入；点分段仍跳转。当时 Tooltip 吃剩余；现禁止热区 flex:1，禁止把顶栏剩余当路径栏（v2.45）。见 [youi.md](youi.md)、[modules/files.md](modules/files.md)。
> **v2.40 变更（输入宽度单属性）：** `YoTextField` 宽度只写 `data-width`（`hug` / `number` / `fill`）。公开仍用 `block` 表示铺满（与 `YoSelect` 同名）。禁止再并列 `data-block`。见 [youi.md](youi.md)。
> **v2.39 变更（设置行右槽簇）：** `YoFormRow` 右槽只 hug 贴尾。路径框 + 浏览是同一簇，禁止 `controlFill` / Tooltip `block` 把槽拉满后让固定宽输入悬在中间。对照 WinUI SettingsCard `HorizontalContentAlignment=Right`（内容列 Auto）。见 [youi.md](youi.md)。
> **v2.38 变更（发送图标朝上）：** 命令终端纸飞机空内容水平向右；草稿或队列有内容时挂 `yohu-recipe-send-aim`，`spatialSmall` 转到朝上。清空转回。模块禁止自写 rotate。见 [动画系统-v6.md](动画系统-v6.md)。
> **v2.37 变更（输入宽度契约）：** `YoTextField` L2 定 `hug | fill | number`。`input size=1` 中性化 UA 固有宽。数字槽宽只走 `--yohu-layout-settings-number-w`（`data-width=number`）；对话框/编辑栏走 `block`。禁止页面再写 `.yohu-text-field { width }` 或叠一层搜图标。见 [youi.md](youi.md)。
> **v2.36 变更（YoTextField 内容区）：** 输入重置 UA `padding` / `box-sizing` / `appearance`，高度锁在 `--yohu-control-height` 内。`type=number` 去掉原生步进钮，值 `text-align: end` 贴尾，避免短数字在 96vp 槽里居中。`YoFormRow` 改 `justify-content: flex-end`，折行后控件仍贴行尾。禁止再靠页面 CSS 改 `__input` 盒模型。见 [youi.md](youi.md) YoTextField。
> **v2.35 变更（日志级别按下填充）：** 当时格内 ink 软底；现胶囊分段 `item.fill=var(--yohu-level-*)`（v2.94 / v2.96）。禁止底条 / inset shadow 冒充选中。
> **v2.34 变更（日志级别筛选铬）：** 当时六格一体 surface+hairline；现 `YoSegmentedButton` type=capsule multiple（v2.94）。全名走 `aria-label`，不画悬停气泡。禁止再拆成 outlined 按钮带 gap。
> **v2.33 变更（日志级别独立筛选）：** 过滤栏不再用「最低含以上」下拉。`LEVELS`（`log_levels.json`）是选项与匹配的唯一字母表。按下的级别是精确集合：选 W 只留 W，可再按下 E 同时留 W+E；全部弹起 = 不限（含 `?`）。wire `LogFilter.levels` 空则不限。禁止再写 `min_level` / 按 `levelRank` 筛选。
> **v2.32 变更（折叠不盖子项行高）：** `YoCollapse` 只靠 `inner` 的 `overflow: hidden` 裁切 0fr/1fr。禁止 `inner > * { min-height: min-content }`：选择器压过 `YoTree` 的 `--yohu-row-height-nav`，展开后的命令行变成内容高（约 18px），组行仍是 36px。需要收缩的消费者（设备栏列表）自己写 `min-height: 0`。见 [动画系统-v6.md](动画系统-v6.md) §5.1、[youi.md](youi.md) YoTree。
> **v2.31 变更（气泡与模态分层）：** `YoTooltip` 出示只走悬停或键盘模态下的焦点（Host 记 pointerdown / keydown）。点击「命令管理」后对话框程序首焦「新增组」仍是 pointer，不得弹出描述气泡。按下锚点与模态入栈立即 `dismissTooltipOverlay`（Unique 槽 z 高于 dialog）。禁止在命令管理里摘掉 IconButton title 来藏现象。见 [youi.md](youi.md) YoTooltip / YoDialog。
> **v2.30 变更（命令库树行高）：** `YoTree` 缺省行高改 `--yohu-row-height-nav`（紧凑 32 / 舒适 36），行内 gap 走 `space-sm`。禁止再套数据行 `--yohu-row-height`（紧凑 22 / 舒适 26）：徽章高 20vp，数据行会把图标和数字挤死。可选 `rowHeight` 只写 `--yohu-tree-row-height`，不锁 `height`。见 [youi.md](youi.md) YoTree。
> **v2.29 变更（列架 / 虚拟列表 / 文件图标分层收口）：** `YoVirtualList` 拆 L3（L2 窗口+选择代数，L3 键盘/贴底/行 attrs，L4 只绑滚动与 Indicator）。`YoFileIcon` 去 Material hex、去 lint 豁免；色只走 `FileIconLight/Dark`（Harmony → Component → `emit-theme.ts` → `--yohu-file-icon-{glyph}` / `-mark`），L4 SVG 只标 `data-fill`。禁止 antd generate / 自造 10 阶。`YoColFrame` 注释与默认 `cellPad=list` 对齐（日志左垫进 `padLeftChars`，禁止 `cellPad=none`）。[youi.md](youi.md) 补 YoCol* / YoVirtualList / YoFileIcon 专节。
> **v2.28 变更（架构审查收口）：** 当时日志列宽不再经 `applyLogColWidth`，store 对 `LOG_COLUMNS` 直接 `setColWidth`。现无表格列宽，Tag 宽是官方常数（v3.84）。字段原文当时 `logFieldText`。Tabs / Segmented / Select 占位 / Dialog 定宽 / Tree 叶子 / 日志检索只走 `data-*`，Indicator selector 对齐。L5 不再导出 `fileGlyphFor`、wipe 帧、`beginColResize`、`YO_SEGMENTED_MAX_ITEMS`、`createTooltipUnique`。见 [youi.md](youi.md)。
> **v2.27 变更（原生 title 与 BEM 双轨清干净）：** 可见提示一律 `YoTooltip`（`YoIconButton.title` 只作 aria-label 并内包 Tooltip）。Select / Panel 去掉 `--block/--disabled/--pane/--padding-*`，模块 CSS 只挂钩 `data-*`。状态栏任务、设置路径、设备卡、面包屑、传输/文件格不再写原生 `title`。`YoTooltip` 增 `block` 给铺满锚点。见 [youi.md](youi.md)。
> **v2.26 变更（浮层叠层与调用方清理）：** Select / Dialog / Tooltip 共用 `popover-place` + `overlayLayerStyle`。叠层收进 `ZIndex`：`--yohu-z-dialog` 1000、`--yohu-z-overlay` 1050、`--yohu-z-toast` 1100；CSS/JS 禁止回退魔法数。新增 `YoTooltip` / `YoTooltipHost`（无 Host 不画；壳根与菜单 Host 并列）。Badge / Tabs 圆点旧 `warn`/`error` 一律改 `warning`/`danger`。IconButton 禁止 `size={Layout.IconMd}`。ProgressBar 不定态只走 `[data-mode="indeterminate"]`。分层见 [youi.md](youi.md)。
> **v2.25 变更（导航与右键键盘）：** Tabs 激活只走 underline，禁止 selected 实底。Tree 选中只挂 `yohu-interactive`，行高当时改 `--yohu-row-height`（后改 nav）。Toolbar 是命令带壳，当时溢出横向滚；现两轴 `overflow: hidden`，消费 `data-overflow`，禁止只写 `overflow-x`。禁止第二套 ActionMenu。右键键盘进 `menu-key-policy`（Arrow / Home / End / Esc / Tab / typeahead）。见 [youi.md](youi.md) 与 [右键菜单-v6.md](右键菜单-v6.md)。
> **v2.24 变更（反馈 / 图标分段 / 页铬）：** Toast 队列进 L3，必须挂 `YoToaster`，禁止静态 API。Badge tone 与 Button 对齐（`warning`/`danger`，无 `warn`/`error` 别名）。IconButton `size` 改为 `sm|md`，减动效钩子改 `[data-busy]`。分段默认 tab 白块，选择块只走 `YoIndicator`。ThemeToggle 只组合 IconButton。Panel/Page/Chrome/TitleBar/StatusBar 拆 L2/L3；关闭键按下走 `--yohu-error-pressed`。分层见 [youi.md](youi.md)。
> **v2.23 变更（表单输入族）：** `YoTextField` 盒内 `prefix/suffix`、盒外 `addonBefore/addonAfter`、`status` 一等（`none|error|warning`）。Checkbox / Switch / FormRow 拆 L2/L3，视图只绑 `data-*`。Switch 关闭轨叠态收进 `--yohu-switch-off-hover/pressed`。禁止 YoForm 引擎。分层见 [youi.md](youi.md)。
> **v2.22 变更（YoButton 两轴）：** `variant` 只表示外形 `solid | outlined | ghost`，语义色另轴 `tone`：`accent | neutral | danger | success | warning`。默认 `solid+accent` 即原主按钮。删除 `primary | secondary | danger` 变体与 `yohu-button--*` 类。涂装由 L2 `buttonPaintKind` 写成 `data-paint`，CSS 不写 88%/76%。confirm/alert 中明度：`solid+success/warning` 走软底+语义字，禁止 `fg-on`。实心叠色收进 `--yohu-{success,warn,error}-{hover,pressed}`。分层与调用对照见 [youi.md](youi.md)「YoButton」。
> **v2.21 变更（日志单尺）：** 表头与行禁止两套几何。当时 `logDocColumns` 是唯一尺：文档与表头轨道都是 `(padLeft+chars+gutter)ch`。列垫 `padLeftChars` 与 `cellPad=list` 同一 `Spacing.Md`，禁止 `cellPad=none` 把标题贴边。`YoVirtualList` 默认 `tone=document`（不画行线）；文件清单显式 `tone=list`。Fatal/检索高亮禁止加 padding 挪进宽。禁止再把 `colTrackTemplate` 的 px 格子套到日志行上。
> **v2.20 变更（日志文档行）：** 对照 AS Logcat 完整链（`MessageFormatter` → `TextAccumulator` → `Document`）。行不再用 `YoColTrack`/`YoColCell`。当时列间/字段后空白是 `formatLogDoc` 的 pad 空格，不是 CSS 格子剩余。选区恢复原生 `::selection`；当时成对 `--yohu-text-sel` + `--yohu-text-sel-fg`（v2.69）；现手势仍是原生 Selection，绘制是选区带（v3.80）。当时清单复制切这份文档；现 Document.text（v3.78）。`formatLogLine` 只给导出 testdata。当时删除 `selection.ts`；现 `editor/selection.ts` 只读文档范围，不接 Highlight。禁止 `pointerdown.detail`、禁止对 `pointerdown` `preventDefault`、禁止 Highlight/overlay 按格描选区。
> **v2.19 变更（日志选字色）：** 当时文档选区用 `--yohu-text-sel`（品牌 45%）；当时改为强调实底 + 反白（v2.69）；现文档选区带 `--yohu-doc-sel`（v3.80），输入框仍走强调对。禁止 `accent-soft` / `state-selected` 冒充选字。
> **v2.18 变更（日志文档选区）：** 曾自管 `DocRange` + 整表 `user-select: none` + `::highlight`。v2.20 撤回：格子模型选不中空白，且 `pointerdown.detail` 规范为 0 导致双击失效。
> **v2.17 变更（路径错误走 YoToast）：** 路径/浏览失败不再在路径栏上方挂错误卡片。统一 `YoToaster`（`toast` 进出场，≤ `--yohu-dur-toast`）。目录不存在文案：没有这个目录，请重新输入。
> **v2.16 变更（路径异常不跳转）：** 路径提交先 `files.list`，失败不改当前目录、不关输入。禁止 `ls` 退出码原文。v2.17 撤回页内错误条。
> **v2.15 变更（路径输入跟内容固有宽）：** 当时 `min-width: 100%`；现 `field-sizing: content` + `width: max-content` + `max-width: 100%`（v2.42）。去掉 `flex: 1` / `min-width: 0`（flex 会把盒缩回槽宽）。禁止 JS 测宽。槽是视野。当时全选看开头；现展开不预选、光标在末尾（v2.43）。揭开/收回仍只动 `clip-path`。
> **v2.14 变更（路径输入不抖）：** 曾锁死槽宽、只靠 input 内滑。长路径看起来像挤在槽里。v2.15 改走固有宽。
> **v2.13 变更（清单列架收口 YoUI）：** 表头与行不再各写一套 `grid-template-columns`。`YoColFrame` 只写 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`；当时日志也走格子；现只有文件清单走 `YoColTrack`/`YoColCell`，当时日志行是 pre 文档 `formatLogDoc`，禁止格子（v2.20）；现 Document.text（v3.78）。禁止模块再做 LogColFrame 一类适配层，禁止再写第二份列垫。PID/TID/级别默认宽要放下标题与六位数字。
> **v2.12 变更（路径输入伸长）：** 曾按文字宽伸长输入盒；会抖。v2.13 撤回。
> **v2.11 变更（路径槽 clip 倒放）：** 收回按展开倒放同一条 `clip-path`（`spatial-local`）。去掉 leaving / 淡出分轨。当时展开全选；现光标在末尾、不预选（v2.43）。
> **v2.10 变更（路径槽收回淡出）：** 曾把收回改成满尺寸淡出。v2.11 按倒放撤回。
> **v2.09 变更（路径槽淡入淡出）：** 曾把展开也改成淡入，进场变差。v2.10 撤回展开侧。
> **v2.08 变更（路径槽全选与收回）：** 曾用 `clip-path` 往返；收回不好看，全选在 WebView 里仍丢。v2.09 撤回。
> **v2.07 变更（路径槽重做）：** 废弃 PathBar / address / editor-clip / 常驻隐藏 input。新 `AddressSlot`：一条槽一格。浏览态只有面包屑 + 流内热区按钮（不是第二栏）。当时热区吃剩余、点槽外退出；现短热区 `--yohu-space-lg`（禁止 flex:1），取消认输入铬外（v2.45）。输入关闭时不在 DOM；打开后叠在同一 `grid-area`，`clip-path` 从左向右揭开。点热区或 `Ctrl+L` 进入。禁止再叠一层常驻 input。
> **v2.06 变更（路径栏单击展开）：** 曾靠关闭态 `pointer-events` 与去掉 `blur` 补丁；热区仍不是流内控件。v2.07 撤回。
> **v2.05 变更（路径栏同槽 clip-path）：** 撤回 `container-type` + `100cqi` 裁宽（WebView 里地址槽会塌成 0，面包屑和输入都看不见）。当时输入层铺满同一槽，用 `clip-path: inset(0 100% 0 0)` → `inset(0)` 从左向右揭开；现输入盒 hug 文字（v2.42 `field-sizing` + `max-content`），不是整栏铺满。
> **v2.04 变更（路径栏同槽展开）：** 撤回右侧另起输入栏。只保留一条地址槽：面包屑 hug 在槽内；当时单击空白后 clip 从槽左向右铺满同一槽；现点空白展开的是 hug 输入盒，不是整栏铺满（v2.42）。禁止第二路径栏、禁止 vacant 列。
> **v2.03 变更（路径栏向右展开）：** 曾把输入放在面包屑右侧独立列；看起来像两条路径栏。v2.04 撤回。
> **v2.02 变更（路径栏单击淡入）：** 曾用 `YoPresence fade` 铺满整条地址区；目录名会位移。v2.03 撤回。
> **v2.01 变更（文件路径栏分区）：** 路径行四区：上级 | 面包屑 hug | 空白槽吃剩余 | 输入层。曾用双击 + 从右 `spatial-panel` 抹开；v2.02 撤回。
> **v2.00 变更（文件路径栏对照资源管理器）：** 撤回 v1.99 的放大镜、建议列表与 `path-suggest`。曾把整条地址槽当 XOR；v2.01 改为分区。
> **v1.99 变更（文件路径栏）：** 曾加放大镜与前缀补全；v2.00 撤回。解析策略（引号 / `file:` URI / 反斜杠 / 别名 / 相对 / `.` `..` + 安全根）仍留给提交。
>
> **v1.98 变更（日志文档行）：** 展示面板分两族。Family A（日志/控制台/终端 IO）是一份格式化文档，选区只有字符 Range；Family B（文件清单 / AG Grid）才是单元格/行块，且与选字互斥、不中途换挡。当时日志行 DOM 文本 === `formatLogLine`（空格是字符，对照 Logcat Formatter）；当时 `formatLogDoc`（v2.20）；现 Document.text（v3.78）。禁止 Grid 列盒 + 拖选切行块。当时表头是铬层可拖宽、不驱动行几何；现无表格表头（v3.84）。
> **v1.97 变更（日志选区双模式）：** 曾对照 Logcat 做 `text`/`rows` 中途切换；v1.98 撤回。该做法不属于成熟日志面板。
> **v1.96 变更（日志行块选区）：** 对照 Logcat：当时行块闭区间 + `user-select: none`；已被 v1.98 撤回，现文档字符 Range + 行 `user-select: text`（v2.20）。
> **v1.95 变更（日志复制）：** 对照 Logcat：当时剪贴板从 `LogLine` 经 `formatLogLine` 重排；当时 `formatLogDoc`（v2.20），`formatLogLine` 只给导出 testdata；现 Document.text（v3.78）。禁止 `Selection.toString()`（Grid 列盒会把粘贴拆成乱码）。选区只解析起止 `seq`；跨行取窗口 `visible` 闭区间；Ctrl+A 整表可见区；`copy` 事件只写 `text/plain`。无选区右键仍复制该行。
> **v1.94 变更（空态跟随挤位）**：`inline-end` 补 `grid-template-rows` 0fr↔1fr，与宽度同一 `spatialPanel`。闭合不占列高，把手溢出。结果区居中空态靠 `flex:1` 跟随，禁止空态自写位移。`height:auto` / `max-height:none` 视为跳变。侧栏 `rail`、传输 `panel`、按钮 `swap` 同一条「造成挤位的配方插值、被挤兄弟跟随」纪律。
> **v1.93 变更（发送栏宽度裁切）**：`inline-end` 改为与 `YoSwap`/侧栏同构的 `width` 插值（compact 控制高 ↔ 100%），内容锁祖先 `cqi`、贴 end 裁切；把手绝对叠在裁切盒上，只描露出的上+起边。禁止两列 `0fr auto`↔`minmax 1fr 0fr`（不插值）。
> **v1.92 变更（发送栏横向开合）**：命令终端输入栏去掉向下 XOR `panel`。收起往右夹成把手（chevron-left），展开往左铺满（`yohu-recipe-inline-end`，宽度 spatial-panel）。
> **v1.91 变更（动效收口）**：设备插拔走 `YoListPresence`。`yohu-motion` 只导出 `MotionSpec`；`@yohu/ui` 不再导出配方内部时长表（模块只用 `Yo*` / `motionSpecMs` / `DISMISS_HOLD_DURATION`）。
> **v1.90 变更（进出场观感）**：list 高度与内容同时长（200ms），位移改 xs、改 transition 可打断。Dialog 从下方微移入场、出场原地淡出不回放。Toast/popover/rise 进场改 spatialLocal。当时发送栏 XOR 走 `yohu-recipe-xor` 同格叠放，避免两段高度相加；已被 v1.92 撤回，现 `inline-end`。
> **v1.89 变更（MotionSpec 双端）**：`yohu-motion::MotionSpec` 与 `tokens/motion.ts` 同名同值。配方时长从 spec 派生；splash / occupancy 只点规格名。`motionSpecMs()` 公开。弹簧仍只在 CSS 采样。
> **v1.88 变更（命令终端收发动效）**：IO 块与排队卡片走 `YoListPresence` + 配方 `list`（当时内容轨套 rise；现 list 高度 spatialLocal ∥ 内容入 spatialLocal / 出 effectsExit）。发送瞬间队列出场、结果区新 `>>>`/`<<<` 升起；清屏直切。当时发送栏收起条与输入栏 XOR `YoCollapse panel`；现 `inline-end`（v1.92），禁止 Show 直切。模块不写 `@keyframes`。
> **v1.87 变更（命令终端 IO 块）**：一次 `>>>` 对应一条多行 `<<<`（`dumpsys` 等整段 stdout 不再按物理行拆成多条输出）。标识与时间钉在首行，后续行只在内容列换行。结果流自上而下（去掉顶栏 spacer），不再把内容顶到视口底部。
> **v1.86 变更（命令终端排队发送）**：当时发送栏整栏收缩/展开（YoCollapse panel）；现贴右双轴 `yohu-recipe-inline-end`（v1.92）。右侧水平纸飞机（Lucide send-horizontal）发送，空内容变灰仍显示。点命令库叶子在输入框上方排队。展示统一 `formatAdbLine`（始终 `adb [-s] 正文`）；exec 是否带 `adb` 仍走设置。
> **v1.85 变更（命令终端 IO 行）**：抛弃会话卡片。结果区 = 输入/输出标识 + 时间 + 内容；空态在视口正中。发送栏去掉「自定义输入」与 `adb` 文案。库命令与发送栏同一 `terminal.exec`。设置「输入命令默认加上 adb」默认关、无副标题。v1.87 起流改为自上而下，一次输入一条输出块。
> **v1.84 变更（命令终端会话块）**：执行结果曾改为终端会话块 + 自定义输入栏；v1.85 已替换为统一 IO 行。命令管理只留名称与具体命令；去掉成功/失败正则、输入提示、组内延时、失败中断。
> **v1.83 变更（原生动效 crate）**：时钟 / 曲线 / 时长 / `IDCompositionAnimation` 采样进 `core/yohu-motion`。禁止再把公共层放在 `app/yohu-adbtools`。启动 overlay 仍在 `native_splash`，投屏 clip 仍在 `mirror_present`。二者不互引，也不进 `yohu-motion`。
> **v1.82 变更（原生动效解耦）**：壳内曾有 `native_motion`；v1.83 已迁出为独立 crate。启动 overlay 留在 `native_splash`，投屏 clip 留在 `mirror_present`。二者不互引。禁止壳内第三套贝塞尔。
> **v1.81 变更（启动交接时序）**：主窗 HWND 可先落到最终矩形，但 `ShowWindow` 推迟到 overlay 铺满（同屏）或出场结束（异屏）。禁止 morph 期间工作台从 `NOREDIRECTIONBITMAP` 空洞透出。
> **v1.80 变更（启动交接单通路）**：overlay 按配方建树（同屏 Shared 才有 fill，异屏 Exit 只有品牌层）。HTML `#yohu-boot` 揭窗前直接卸节点，不做 CSS 淡出。最小化只靠 Tao 可见性同步，不再 `ExitRequested` 拦截。
> **v1.79 变更（启动交接 DComp）**：L2 改为 `IDCompositionVisual` 的 Offset / Scale / Opacity（`IDCompositionAnimation`）。禁止 `UpdateLayeredWindow` 逐帧画 dest。
> **v1.78 变更（启动交接重构）**：抛弃 HWND 尺寸插值。主窗一次落到最终矩形；冻结小窗快照做 scale/opacity（同屏共享容器 300ms + 100ms 淡出；异屏出场 200ms）。与鸿蒙 starting surface / Apple zoom 容器同构。禁止再 `SetWindowPos` 补间启动窗。
> **v1.77 变更（启动展开不抖）**：旧路径曾用 `SWP_NOCOPYBITS` 补丁修抖动；v1.78 删除该布局动画。
> **v1.76 变更（启动交接）**：工作台 hydrate 之后才交接。同屏共享容器、异屏出场的数值仍用 `spatialPanel` / `spatialExit`。v1.78 起引擎改为分层快照，不再拉 HWND。品牌 Logo 按创建 DPI 冻结。系统关闭窗口动画则瞬时揭窗。禁止 WebView CSS 冒充启动过场。
> **v1.75 变更（命令终端）**：导航与页眉展示名改为「命令终端」；常量在 `yohu-protocol::module_title` / `@yohu/api` `ModuleTitle`。目录 id 仍是 `adb-terminal`。
> **v1.74 变更（启动数据单源）**：用户可见品牌只在原生小窗。HTML `#yohu-boot` 只铺画布。主窗居中读小窗锁定的工作区，不再二次 `GetCursorPos`。删除空命令 `boot.reveal` 与 `boot-reveal.js`。揭窗只走 `boot.showMain`。
> **v1.76 变更（日志行跟表头轨道）**：当时行跟表头网格、格内文案、选区从单元格映射；当时一份 pre 文档 === `formatLogDoc`，禁止 YoColTrack/YoColCell（v2.20）；现 Document.text（v3.78）。解析失败行仍通栏。

> **v1.75 变更（表头靠左+列垫）**：标题改回默认靠左。`--yohu-col-header-content-pad` 左 `space-md`、右 `space-sm`（鸿蒙 PC / Finder：不贴格边，左缘与文件名起笔对齐）。

> **v1.74 变更（表头铬重写）**：列缝重写成 AG Grid 短柄（热区透明、可见 2×30% border 柄；悬停 accent；拖中铺满）。删除表头 `::after` 分割线与模块首列 content-pad 覆盖。禁止再把 6px 热区当色块。

> **v1.73 变更（原生启动小窗）**：双击后先出 480×300 原生小窗（GDI，对齐 Android Studio / IntelliJ），主窗隐藏 hydrate 完成后再揭大窗并关掉小窗。禁止用 WebView 当启动小窗。
> **v1.72 变更（揭窗从可见起算）**：当时 `boot.reveal`；已被 v1.74 删除，现揭窗只走 `boot.showMain`。最短 400ms 从揭窗时刻起算，禁止把隐藏等待算进启动页。工作台 CSS 延后到 `</body>`。
> **v1.71 变更（同窗启动层）**：当时 HTML 品牌页；现用户只见原生 GDI 小窗，`#yohu-boot` 只铺画布（v1.74）。当时 HTML 启动层 200ms 淡出；现 overlay 100ms，禁止 HTML 启动层淡出（boot-handover / v1.74）。禁止第二 WebView splash。禁止启动白/黑空白 >300ms。
> **v1.70 变更（启动揭窗）**：主窗隐藏到设置/目录首帧再 show，底色对齐 `--yohu-bg-base`。当时不另开 splash；现双击先出 480×300 原生小窗（v1.73），禁止 WebView 当启动小窗。纯空白仍须 ≤300ms（鸿蒙启动页），揭窗时已是工作台铬层。
> **v1.69 变更（占用 DComp clip）**：HWND 铺满 avail；可见卡片是 DirectComposition rectangle clip。fill↔contain 由 `IDCompositionAnimation` 在 DWM 刷新率上跑。禁止 `SetWindowPos` 改子窗尺寸冒充占用过渡。
> **v1.68 变更（占用 spatial-panel）**：HWND fill↔contain 曾走壳内 300ms 标准曲线。v1.69 改为 DComp clip 动画。禁止 CSS 占用过渡。
>
> **v1.67 变更（HWND 占用卡片）**：舞台列不再套 YoPanel。WebView 只留透明洞报 avail；可见卡片是 HWND（surface + hairline + radius）。当时会话 HWND contain、idle 铺满；现 HWND 始终铺满 avail，可见卡片 DComp clip = contain dest（v1.69）。禁止 CSS 占用过渡。
>
> **v1.66 变更（HWND contain，舞台面板稳定）**：曾用舞台 `YoPanel` 铺满列、HWND 在面板内 contain。实机：YoPanel 外框不跟画面走。v1.67 撤回舞台 YoPanel。
>
> **v1.65 变更（稳定舞台面板）**：当时内容区三栏都是 `YoPanel`；现舞台列是 `.yohu-mirror__avail` 透明洞，不是 YoPanel（v1.67）。操作栏/功能栏仍 YoPanel。曾让 HWND 铺满面板、画面只在 HWND 内 contain；v1.66 撤回为 HWND contain，避免左右边框不再变化。
>
> **v1.64 变更（壳独占占用）**：UI 只报 `.yohu-mirror__avail` 客户区物理矩形 + 会话旗标。曾由壳把 HWND contain/fill；v1.65 改为 HWND 始终铺满面板。删除配方 `mirror-frame`。禁止 CSS 占用宽高过渡、禁止 HWND lerp、禁止运行时 UI `containInZone`。
>
> **v1.63 变更（占用盒 spatial-panel）**：avail↔hug 外框宽高曾走配方 `mirror-frame`（`var(--yohu-motion-spatial-panel)`，px↔px）。v1.64 撤回：占用瞬时由壳 contain/fill，禁止 CSS 占用过渡。
>
> **v1.62 变更（停止后外框回可用区）**：idle/failed 曾由 UI 把盒拉回可用区；starting/live 用上次编码尺寸 hug。当时会话中壳 contain；现 HWND 始终铺满 avail，可见卡片 DComp clip（v1.69）。idle/failed/unbound 由壳铺满 avail；UI 不再 hug。
>
> **v1.61 变更（投屏单 contain 盒）**：曾由 UI `containInZone` 写出 hug 盒、`mirror.layout` 报该盒、壳禁止再 contain。v1.64 撤回：avail 只从 UI 来，contain 在壳。面板内全屏只藏操作栏/功能栏，页眉可点，Esc 退出。禁止 `fixed inset 0`、禁止 HWND lerp。
>
> **v1.60 变更（投屏缩放 occupancy）**：曾禁止 hug、HWND 单独 contain；v1.61 撤回双头几何。
>
> **v1.59 变更（投屏外框与铬层）**：停/开保留上次编码尺寸，面板外框不拆。当时 WebView YoPanel 外框；现舞台列不再套 YoPanel，卡片由壳内 Present（v1.67）。禁止 transition 宽高。
>
> **v1.59 变更（列拖 sash）**：`YoColResizer` 热区与指示铬分权。6px 命中区透明；可见的是居中 hairline + 中段握柄。悬停/焦点走 `--yohu-stroke-accent`；拖中铺满表头高。可拖列隐藏 `YoColHeader` 静态分割线。禁止把热区整块涂 accent。

> **v1.58 变更（投屏启动不闪）**：`mirror/state=live` 带上宽高后，当时加载态 HWND 与铬层 CSS 同时 contain；现 Empty/Loading/Paused 铬由 HWND Present 每拍绘制，禁止 WebView CSS contain（v2.48）。禁止 Loading 清零画面尺寸导致出画瞬间从铺满跳到贴合。
>
> **v1.57 变更（设备状态统一）**：目录与运行时状态分流（ADR-v6-025）。设备栏次行展示 Android 版本/电量；投屏深浅色读 `DeviceSession.deviceStatuses`，禁止页面 2s 轮询。
>
> **v1.56 变更（设备深浅色）**：月亮/太阳同一操作位读 **连接设备** 当前界面；点击 `device.setNightMode`。不是工作台 `theme`。亮度±仍走设备亮度键。v1.57 起数据源改为 Hub，不再 `device.nightMode`。
>
> **v1.55 变更（设备操作栏主题/亮度）**：月亮/太阳曾误接到工作台 theme；v1.56 改为设备 uimode。亮度±用控制中心太阳符号，走设备 `KEYCODE_BRIGHTNESS_*`。
>
> **v1.55 变更（YoUI 列拖拽）**：列宽升成三层：`col-model`（clamp/轨道）→ `col-resize`（startX 重算绝对宽）→ `YoColResizer`（`separator` + valuemin/now + 键盘）/ `YoColHeader` / `YoColRow`。模块只 `setColWidth(key, px)`。拖时 `html[data-yohu-col-resizing]` 锁光标并禁选区。禁止模块再累加 delta。

> **v1.54 变更（投屏 HWND 子窗）**：画面 HWND 改为主窗 `WS_CHILD`。JS 只报可用区客户区矩形（铬层 insets）。当时壳按 contain 改 HWND 尺寸；现 HWND 铺满 avail，contain 只在 DComp clip（v1.69）。禁止 `screenX` 跟窗。
>
> **v1.53 变更（工作台主窗最小）**：`--yohu-layout-window-min-w/h` 改为 **1024×768**（`Layout.WindowMin*` 与 `tauri.conf.json` `minWidth`/`minHeight` 同值）。竖屏 contain 短边保 ≥280 CSS，避免 980×560 把画面挤成邮票。鸿蒙 **360×240** 当时也写对话框；现仅独立子窗，浮层 Dialog 不用（§3 / §4.5）。禁止套到主窗。
>
> **v1.53 变更（日志列宽与文本选区）**：日志表头改走 `YoColHeader`（元数据列可拖宽，消息列吃剩余）。清单关闭 VirtualList 行多选，`user-select: text`；复制优先原生选区，无选区时右键复制该行。当时 Ctrl+A 选中当前渲染出行；现整表 visible（v1.95 / §4.1）。

> **v1.55 变更（日志格内选区）**：当时格内选区；已被 v2.20 撤回，现行 `user-select: text` + 原生文档选区。

> **v1.54 变更（日志可见区单游标）**：清空 / 入镜 / 过滤 / PID 重绑 / 跟滚共用 `fromSeq`。清空推进游标，禁止把镜像旧行再投影回面板。列表空态叠在虚拟列表上，不得卸载列表以免误报离开底部。

> **v1.53 变更（日志显示列默认）**：新安装默认不显示 UID、TID；时间 / PID / 级别 / Tag 默认开。消息列始终在。缺字段：UID/TID 视为关，其余视为开。

> **v1.52 变更（投屏 layout）**：当时 contain 即时贴合；现 fill↔dest 走 IDCompositionAnimation（v1.69）。删除 `yohu-recipe-mirror-frame`（CSS 过渡宽高会把舞台塌成 1px）。可用区改 grid 定高。

> **v1.51 变更（投屏默认可操作）**：投屏默认打开控制通道。页眉最右「仅显示」切换只看/可操作。导航键从右侧设置栏挪到设置栏左侧设备操作栏（宽 `--yohu-layout-mirror-ops`，鸿蒙符号图标钮）。HWND 圆角走 DirectComposition（禁止 `SetWindowRgn` + flip）。切回投屏复用上次 contain，避免 100%→贴合挤压。
>
> **v1.49 变更（投屏协议与状态栏 fps）**：投屏「档位」改为「投屏协议」（USB / 无线），去掉自定义。实测 fps 进状态栏右槽（模块 `Status`），不盖画面。选项「原始」不加括号说明。
>
> **v1.48 变更（日志面板常驻）**：显示面板 append-only。只在重新开始采集或清空时冲刷。掉线 / 无输出 / 停采 / 包名 PID 重绑不得清空已画出的行。过滤走 rebuild（已画仍匹配 ∪ 镜像命中）；未跟滚只补到 `frozenThroughSeq`。
>
> **v1.47 变更（日志可见区不冲刷）**：跟滚恢复只按 seq 补洞，过滤变更才整表重建。System 无过滤时镜像为空不得清空已画出的行。同窗口 adopt 续采保留可见区。空闲后不得落到「等待设备输出」并把旧行冲掉。
>
> **v1.46 变更（日志级别色单源）**：logcat 色值只走 `--yohu-level-*`（`LogLevelLight/Dark`）。行 `data-level` 写入 `--yohu-log-ink`；左条、级别字、Tag 共用 ink。Error 消息同色；Fatal 字母反色块当时用 `--yohu-level-f-bg`；现 `data-paint=invert`，禁止 `--yohu-level-f-bg`（v2.57）。删除 View `LEVEL_SUFFIX` 与 `--level/--bar` 双 class。`--yohu-tag` 仍是徽章语义色，不是 logcat Tag。
>
> **v1.45 变更（Select 触发钮 min-width）**：当时把最小宽从根挪到触发钮，避免短文案按钮靠左。v3.52 撤回 hug 的 `min-width` 与文案 `flex:1`：短文案跟字箭簇，不再被 `space-xl*5` 拉开。
>
> **v1.44 变更（表单行 YoFormRow）**：新增 `YoFormRow` 为设置/表单项默认排布。左侧标题信息（标题行：标题 + 备注水平相邻；副标题在下）与右侧控件两列垂直居中；说明不再独占下一行。设置页只填内容，禁止页面自写一行 flex。
>
> **v1.43 变更（投屏右侧功能栏）**：投屏页画面与控件分栏。当时宽走 preview、含导航；现功能栏 `--yohu-layout-mirror-func`（v2.44），导航走操作栏 `--yohu-layout-mirror-ops`（v1.51）。页眉主行只留会话操作（开始/停止、暂停、截图、全屏）。禁止把应用模块导航做成右侧栏。
>
> **v1.42 变更（区域加载 YoLoading）**：新增 `YoLoading`（环 + 标题/描述，`role=status`）。控件内加载仍走 `YoButton` / `YoIconButton` 的 `loading`；区域/页面等待必须走 `YoLoading`，禁止模块自写 spinner。投屏启动与等待首帧由 HWND chrome 绘制（ADR-v6-026），不再用 `YoLoading` 盖舞台。
>
> **v1.41 变更（投屏页眉分组）**：投屏 `YoChrome` 主行只留开始/停止、暂停、截图、全屏。当时次行分组；现质量/通道在右侧功能栏（v1.43 / v2.44 `--yohu-layout-mirror-func`），导航在操作栏（v1.51）。禁止再把下拉和导航键平铺进 extra 一行。
>
> **v1.40 变更（设备栏选中滑块过冲）**：曾只给 fill 宿主写 `overflow-x: hidden`；v2.59 改为两轴 `overflow: hidden`。设备列表宿主只 `overflow: hidden`；项滚动走内层公开 `YoScroller`（视口关系统条）；当时侧轨 + 可拖滑块；现叠层 4vp、不预留侧轨（v3.25）。禁止在 list 宿主或滑块宿主上写 `overflow: auto`——双轴 auto 会在 Windows 画出横竖条并互相锁死（同 v1.37）。
>
> **v1.39 变更（页眉选中设备名）**：终端 / 文件 / 日志 / 投屏 `YoChrome` 标题后统一展示选中设备名（`leading={<YoBadge text={selectedLabel} tone="neutral" />}`）。数据链：`DeviceInfo.model` → domain `device_display_name` → `DeviceSession.selectedLabel`。一台用型号（无型号回退 serial）；终端多台「首台名 等 n 台」；无选中不显示。设置不展示。禁止模块自拼 serial 或再扫目录取型号。禁止 Chrome 内嵌 Badge。
>
> **v1.38 变更（应用身份与数据目录）**：展示名 / 版本 / 图标 / LocalAppData 目录走 `system.info.identity` + `paths`（protocol 常量单源）。标题栏用应用位图（`YoTitleBar.logoSrc`），不用终端字形冒充品牌。设置页新增「关于」。状态栏版本禁止写死。数据目录说明写清 `data/` 与固定的 `config/`、`cache/`、`logs/` 分层。
>
> **v1.37 变更（Select 浮层 hug）**：下拉菜单铬层只负责落点（`popover-place`）；内容 hug。`min-width` = 触发钮，禁止锁死 `width`。默认 `overflow: hidden`；仅内容高于可用空间才 `overflow-y: auto`，横向永远 hidden——`overflow-y: auto` 会把 `overflow-x` 算成 auto，Windows 画出底部「宽度调整条」。选中/键盘索引在 `select-model.ts`。
>
> **v1.36 变更（设置项控件靠右）**：设置表单项统一「标签+生效徽章靠左、功能控件靠右 hug」。日志显示列的 `YoCheckbox` 组走同一控件槽，禁止整行左起铺开。当时说明独占下一行；现说明是副标题，禁止再独占下一行（v1.44 / §4.5）。
>
> **v1.35 变更（设置注入会话）**：应用设置与设备同一条链。`settingsStore` 是唯一 UI 投影；`AppLayout` 经 `DeviceSession.settings` 注入模块。日志显示列 / 导出走注入快照。`buffer_capacity` 仍由日志 store 投影（采集活过视图）；`settings/changed` 控制面必达。
>
> **v1.34 变更（日志显示列）**：设置项 `log_display_columns`（立即生效）控制文档写哪些元数据段（时间 / UID / PID / TID / Tag / App / 级别）。消息始终在。当时还驱动表头轨道；现无表格表头（v3.84）。缺字段回落 STANDARD。禁止在 CSS 写死列轨。
>
> **v1.33 变更（日志固定表头）**：日志清单表头钉在 `YoVirtualList` 外（`flex-shrink: 0` + `--yohu-row-height-header`），当时共用 `.yohu-logs__cols` 定宽轨道；当时尺是 `logDocTrackTemplate` + `formatLogDoc`（v2.20 / §4.1）；现 Document.text（v3.78）。当时不走 `YoColHeader`；其后表头 `YoColRow` + `YoColHeader` + 可拖宽（v1.55）；现无表格表头（v3.84 / §4.1）。级别列改为 `4ch` 以容纳「级别」文案。当时表头与清单背板 `--yohu-canvas`。
>
> **v1.32 变更（右键菜单宿主）**：菜单引擎收口到 `@yohu/ui` `context-menu/`（`defineContextMenu` / `openContextMenu` / `YoContextMenuHost`）。壳只挂一份 Host。模块场景表在各自 `menu.ts`。禁止 View 自挂 `YoContextMenu`。详见 `右键菜单-v6.md`。
>
> **v1.31 变更（多选选中片邻接圆角）**：连续选中行合成一块圆角矩形。代数 `adjacentJoin`（solo/start/middle/end）；class `--sel-start/mid/end` 削平邻接圆角，并用选中色补 hairline。`YoVirtualList` 行间 hairline 单源。禁止模块再写行分割线或选中圆角。当时日志定宽 grid、级别 2ch；当时 `formatLogDoc` 连续文档，禁止格子，级别 4ch（v2.20 / v1.33）；现 Document.text（v3.78）。当时采集 `threadtime,uid`；现 `long,uid,year`，UID 为数字或短名。解析失败整行通栏，禁止画 `0 ?` 假列。
>
> **v1.30 变更（表头悬浮片铺满列格）**：`--yohu-col-header-content-pad` 只写在 `.yohu-col-header__label`。排序钮 `.yohu-interactive` 宿主 `padding: 0`。禁止把文案边距写在 `<button>` 上（绝对定位 `::before` 按内容盒计算，宿主 padding 会把悬浮片缩成文案胶囊）。
>
> **v1.29 变更（表头轨道贴格）**：清单行不再用左右 padding 冒充首列边距（那会把悬浮片整列推离左缘）。首列文案/文件名走 content-pad / name padding；`YoColHeader` 悬浮片 `inset 0` + `radius-none`，铺满矩形列格。
>
> **v1.28 变更（表头悬浮片与文案解耦）**：`YoColHeader` 上 `--yohu-col-header-overlay-inset` 与 `--yohu-col-header-content-pad` 分权。禁止用内容 padding 去挤悬浮片，也禁止用 ripple-inset 去推文案。
>
> **v1.27 变更（表头排序铺满内容区）**：排序钮铺满 `YoColHeader` 内容区（列宽 × 表头高），不 hug 文案。分割线仍在轨道铬上。
>
> **v1.26 变更（表头轨道与文本分权）**：新增 `YoColHeader`。列轨道拥有宽度、hairline 分割线、`YoColResizer`；排序走 `.yohu-interactive`。未激活的排序图标不占位。模块不再自绘列分割线。
>
> **v1.25 变更（页眉行高单源）**：`YoChrome` 标题行 `min-height` 走 `--yohu-control-height`（密度 token）；底垫 `--yohu-layout-chrome-pad`（`Spacing.Sm`）。禁止把 min-height 写在外壳上（border-box 会把无按钮页的标题抬高）。
>
> **v1.24 变更（文件清单行分割）**：文件四列清单行间画 hairline；表头与清单背板改 `--yohu-canvas`，与面板 `surface` 分层。路径栏不再对清单拉分割线。表头排序走 `.yohu-interactive`（禁止自写 hover 底）。选中宿主仍透明，不盖住 ripple。
>
> **v1.23 变更（Select 自适应展开）**：`YoSelect` 菜单默认 Portal 出滚动容器，按视口剩余空间向下或向上展开。v1.37 起高度 hug 内容、宽度不锁死。
>
> **v1.22 变更（设置路径项）**：ADB 路径 / 数据目录 / 默认导出路径统一为只读展示框（绝对路径）+ 「浏览」。展示框宽 ≤ `--yohu-layout-settings-control-max`，超长折叠中间并保留末段。空值显示 `system.info` 解析出的绝对路径。
>
> **v1.21 变更（页壳单源）**：效率型/占位模块（终端/文件/日志/投屏）根节点一律 `YoPage`。页垫 `--yohu-layout-page-inset` / 间距 `--yohu-layout-page-gap`，数值单源 `Spacing.Md`（12vp）。禁止模块 CSS 再铺一套 `height:100%` + `padding: space-md`。功能标题只出现在 `YoChrome`，空态不得复写模块名。设置页仍走 `--yohu-layout-page-margin`。
>
> **v1.20 变更（画布卡片单源）**：当时投屏占位也走 `YoPanel`；现舞台列是 `.yohu-mirror__avail` 透明洞，不是 YoPanel（v1.67）。终端/文件/日志/设置分组仍 YoPanel。铬 = surface + radius + hairline + XS；pane 内部裁切、阴影留在外壳。禁止模块 CSS 再铺 `surface` + `radius-md`。
>
> **v1.19 变更（页眉与内容区同缘）**：模块必须单根页壳（禁止 fragment 把 `YoChrome` 与内容并列交给 presence）。效率型/占位模块页垫走 `YoPage`；设置页页眉不进滚动容器，标题与分组卡片共用 `--yohu-layout-page-margin`。
>
> **v1.18 变更（三键顺序）**：窗口三键从左到右为最小化、最大化（或还原）、关闭（跟 Windows 标题栏习惯，不跟鸿蒙 max-min-close）。
>
> **v1.17 变更（侧栏分割线）**：去掉标题栏底部分割线；侧栏展开时在导航与内容区之间拉 hairline（`--yohu-border`），收起侧栏时不画。
>
> **v1.16 变更（窗口铬贴合）**：侧栏钮与三键等宽 48vp、贴窗口右缘，热区铺满栏高（无内边距）。关闭悬停铺满该键。
>
> **v1.15 变更（窗口铬 Compact）**：标题栏只承担窗口铬后，高度走 HarmonyOS 电脑 Compact **40vp**（不再用 Default 56vp）。三键去圆形底板、键间距收进热区，竖条宽 **48vp**。当时侧栏钮边长=标题栏高；现与三键等宽 48vp（v1.16）。
>
> **v1.13 变更（通铺+分区）**：窗口 canvas 通铺（内容/状态栏不拉结构分割线）。模块分区恢复 `radius-md` 卡片，靠 surface 与 12vp 间距成组，不描外边框。分割线只留必要处：侧栏与内容区、页签指示轨、表头/列、数据行、对话框头尾、控件描边。当时路径栏对清单拉线；现靠 canvas 分层、不另拉线（v1.24）。文件预览为独立分区，不嵌在清单卡片内。
>
> **v1.12 变更（PC 通栏+贴边）**：模块工具栏经 `YoChrome` 传送到 `YoTitleBar` 中区（HarmonyOS 窗口框架：工具栏与标题栏结合）。当时侧栏可收起为抽屉；现常驻双态轨，不是抽屉（v3.12）。设置/投屏一级标题进标题栏。控件补 leading token。
>
> **v1.11 变更（PC 排版）**：根节点正文 14 / 行高 1.55（不再吃浏览器 16px）；补 Caption_M≥10、Subtitle_M、行高 tight/ui/data、字重 Light；排版工具类 `.yohu-type-*`。当时内容区不套页垫；现效率型根节点 `YoPage`，页垫 `page-inset=12vp`（v1.21）。对话框 Title_S Bold + PC 小圆角，去掉误用的窗口最小 360×240。模块栏标题降为 Subtitle Bold。设置页 Title_S Bold + PC 40vp 边距。
>
> **v1.10 变更（分段按钮）**：新增 `YoSegmentedButton`（对齐 SegmentButtonV2）。默认 `tab`：灰背板 + **白选择块** + `radius-xl` 32vp + `--yohu-shadow-xs` + 主色 Medium 字；`capsule` 才是强调色块。选择块按 item 实测盒滑动。页签栏仍走 `YoTabs`。日志「划分」用默认 tab。
>
> **v1.9 变更（选中单源清扫）**：删除死 dual class（`*--selected` / 列表 `*--active`，Tabs 下划线 `--active` 除外）。语义色逃生统一 `.yohu-badge` / `.yohu-tone`。宿主禁止自绘底盖住选中片。面包屑祖先次要色、当前墨色（不是全段 accent）。范围芯片改 `YoBadge`。
>
> **v1.8 变更（选中单源）**：侧栏 / 命令树 / 命令管理 / 下拉 / 虚拟列表共用同一配方：当时实底反白；现 `interactive_select` 20% 软底 + `font_primary`（v2.91）。`--yohu-ripple-inset: 0`。删除表面自写选中字色与侧栏特判、删除 `AccentSofter`。距背板只靠容器 padding。
>
> **v1.7 变更（鸿蒙 PC 默认）**：`:root` = comfortable（正文 14 / 控件 32 / 数据行 26）；`[data-density=compact]` 才是产线收敛。新安装与缺 `density` 字段均 `comfortable`。窗口默认 1200×800。对话框弱中性遮罩 + 获焦/失焦阴影。当时 Dialog 也套 360×240；现 360×240 只用于独立子窗，浮层确认框不用（v1.11 / §3）。Toast ≤3s / 最大 400；按钮最大 448；菜单最小 224。动效补 150/200/400ms。
>
> **v1.6 变更（官方色板）**：`@yohu/ui` Primitive 层改为 HarmonyOS NEXT 系统 Token 原值（宇宙蓝 `#0A59F7` / `#317AF7`、雪域灰 `#F1F3F5`、文本四档 90/60/40/20%、warning/alert/confirm、interactive 5/10/20%）。不再为 WCAG 4.5 改写语义色；正文仍按鸿蒙 §1.6 门禁（浅 4.5:1 / 深 5:1）。布局补齐 PC 窗口默认 1200×800、页边距 40vp、断点 600/840。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。
>
> **v1.2 变更（底向上布局）**：设备数徽章紧跟「设备」标题；`YoIconButton.loading` 走 `--yohu-dur-loop` 旋转；设置页两列网格 + 页面滚动（面板不裁切）；文件管理改为资源管理器四列 + 可收起预览 + `YoContextMenu`/`YoFileIcon`；命令管理三栏；日志采集从开始时刻清空缓冲并出流。
>
> **v1.3 变更（交互态架构）**：公开组件统一 `Yo*` 标注（禁止 `Y*`）；CSS/token 命名空间保持 `yohu-*`。补齐交互态 / ripple / 焦点 / 布局 token；列表·树·菜单·导航·命令管理共用 `.yohu-interactive` 选中片。当时四边 inset `space-xs`；现 `ripple-inset: 0`（v1.8）。禁止各表面自写选中底与裸圆角。圆角阶梯补 `2xs`/`full`/`pill`；间距补 `2xs`。纪律 lint 拦截裸 `border-radius`。
>
> **v1.4 变更（token 单源闭环）**：`theme.css` 由 `tokens/emit-theme.ts` 从 TS 常量排出（契约测试强制磁盘文件一致）；包导出 `@yohu/ui/theme.css` 绑定 `theme + states`。协议 `Theme` 增加 `system` 且默认跟随系统（P7）。选中填充只用 `.yohu-interactive--selected`（不用 `aria-selected`，以免 Tabs 下划线被画成实底）。焦点环补 `.yohu-focus-host`（焦点在内部控件时）。`YoCheckbox` 改原生 `input[type=checkbox]`。
>
> **v1.5 变更（选中片几何）**：当时 `--yohu-ripple-inset` 横向 inset；现 `0`（v1.8）。矮行（下拉/菜单/日志）选中片与行高对齐。`YoSelect` 选项 `min-height: control-height`，与 `YoContextMenu` 一致。

---

## 1. 设计原则（8 条，评估一切 UI 决策的标尺）

| # | 原则 | 落地含义 |
|---|------|----------|
| P1 | **为产线密度而设计** | 默认 comfortable（鸿蒙 PC 正文 14vp）；compact 仍可选作产线收敛，日志行不拉到手机 48vp |
| P2 | **键盘优先** | 所有高频操作有快捷键；组件完整键盘可达（Tab 导航 + 方向键 + Esc 层级退出） |
| P3 | **数据用等宽字体** | serial/PID/时间/日志正文/文件大小一律等宽 + `tabular-nums` 列对齐 |
| P4 | **语义色先行** | 颜色只表达语义（在线/通过/失败/警告/级别），装饰色不喧宾夺主 |
| P5 | **对比度达标** | 正文按鸿蒙 §1.6：浅色 ≥4.5:1、深色 ≥5:1；图标/标题 ≥3:1。语义色（confirm/warning/alert）用官方原值，优先作填充而非浅底正文 |
| P6 | **即时反馈** | 操作 200ms 内有反馈（按钮态/行高亮/toast）；长任务有进度与可取消 |
| P7 | **深色为一等公民** | 深浅主题同权维护（token 双板），默认跟随系统，可手动切换 |
| P8 | **零意外** | 危险操作必确认；关闭窗口有脏检查；破坏性动作不可逆时明确标注 |

---

## 2. Token 三层架构

```
Primitive（原始值：色板/字号/间距，不直接消费）
   ↓
Semantic（语义别名：--yohu-fg / --yohu-surface / --yohu-accent / --yohu-success…，主题相关）
   ↓
Component（组件级：--yohu-state-* / --yohu-level-* / --yohu-logcat-* / --yohu-file-icon-* / --yohu-ripple-* / --yohu-focus-*，唯一被组件消费）
```

- 组件与模块 CSS **只允许引用 Semantic/Component 层**；Primitive 仅在 tokens 内出现。
- 主题切换 = 切换 Semantic 层变量（`[data-theme=light|dark]`），零运行时成本。用户偏好 `data-theme-pref` 可为 `system`（跟随 `prefers-color-scheme`）。`theme.css` 由 `emit-theme.ts` 从 TS 常量生成，禁止手改。
- 纪律检查脚本（`scripts/check-ui-tokens.mjs`）强制：组件外零硬编码色值/字号/动效时长/裸圆角。

### 2.0 组件标注

- **公开组件名**一律 `Yo` 前缀：`YoButton`、`YoVirtualList`、`YoTabs`…。禁止 `YButton` 这类单字母前缀。
- **CSS 类与 CSS 变量**保持产品命名空间 `yohu-*`（`.yohu-button`、`--yohu-accent`）。组件名 ≠ 样式前缀。
- 新增组件必须同时：`YoXxx` 导出 + `.yohu-xxx` 样式 + 本文件登记。

### 2.1 色彩系统（HarmonyOS NEXT 官方 Token）

Primitive 层 = 鸿蒙系统 Token 原值（ARGB → CSS `#RRGGBB` / `#RRGGBBAA`），见 `tokens/colors.ts` 的 `Harmony`。深色 `background_primary` primitive 以文档正文为准（黑），不用表内 `#E5E5E5`。桌面 `--yohu-bg-base` 不消费该纯黑，浅/深都走 `background_secondary`。

| `--yohu-*` | 鸿蒙 Token | Light | Dark | 用途 |
|------------|------------|-------|------|------|
| `bg-base` | `background_secondary` | `#F1F3F5` 雪域灰 | `#191A1C` | 窗口底色（浅/深同构凹槽） |
| `surface` | `comp_background_primary` | `#FFFFFF` | `#202224` | 面板/卡片 |
| `surface-2` | `background_tertiary` / 深色 `background_fourth` | `#E5E5EA` | `#2E3033` | 次级表面（深色随层级抬升明度）；禁止冒充普通按钮底 |
| `comp-gray` / `-hover` / `-pressed` | Container 洗 `comp_background_tertiary` + `interactive` 5%/10% | 黑 5% | 白 10% | 展示类底板（按钮/搜索/分段轨）；浅深都从 Container 推，不是实灰 |
| `fg` / `fg-2` / `fg-3` / `fg-4` | `font_primary`…`fourth` | 黑 90/60/40/20% | 白 90/60/40/20% | 文本四级 |
| `fg-on` | `font_on_primary` | `#FFFFFF` | `#FFFFFF` | 强调底上的反色字 |
| `border` | `comp_divider` | 黑 20% | 白 20% | 常规边框/分割 |
| `border-strong` | `font_tertiary` | 黑 40% | 白 40% | 强调边框 |
| `accent` | `brand` | `#0A59F7` | `#317AF7` | 宇宙蓝 |
| `accent-soft` | `comp_emphasize_secondary` / `interactive_select` | 宇宙蓝 20% | 宇宙蓝 20% | 选中软底 / 徽章 / 芯片；禁止当文档选字 |
| `text-sel` | `background_emphasize` | `#0A59F7` | `#317AF7` | 输入框选字底（实底；禁止 20%/45% 品牌） |
| `text-sel-fg` | `font_on_primary` | `#FFFFFF` | `#FFFFFF` | 输入选字反白；与底成对 |
| `doc-sel` | 画布混品牌 | 浅 32% | 深 55% | Family A 文档选区底；不改字色 |
| `accent-hover` / `pressed` | brand + `interactive` 5% / 10% | 叠黑 | 叠白 | 实心主按钮 |
| `success` | `confirm` | `#64BB5C` | `#5BA854` | 在线/通过（填充优先；不作反色字底） |
| `success-hover` / `pressed` | confirm + `interactive` 5% / 10% | 叠黑 | 叠白 | 成功实心叠态 |
| `warn` | `alert` | `#ED6F21` | `#DB6B42` | 二级警示/执行中 |
| `warn-hover` / `pressed` | alert + `interactive` 5% / 10% | 叠黑 | 叠白 | 警告实心叠态 |
| `error` | `warning` | `#E84026` | `#D94838` | 一级警示/失败 |
| `error-hover` / `pressed` | warning + `interactive` 5% / 10% | 叠黑 | 叠白 | 危险实心叠态；禁止 CSS 再写 88%/76% |
| `offline` | `font_tertiary` | 黑 40% | 白 40% | 离线点 |
| `focus-ring` | `icon_sub_emphasize` | 宇宙蓝 40% | 宇宙蓝 40% | 键盘焦点环 |
| `disabled` | `background_fourth` | `#D1D1D6` | `#2E3033` | 禁用底（不是禁用字；深色与 `surface-2` 同值） |
| `switch-off` | `comp_background_secondary` | 黑 10% | 白 10% | Switch 关闭轨 |
| `switch-off-hover` / `pressed` | 关闭轨 + `font_primary` 5% / 10% | 叠字色 | 叠字色 | Switch 关闭叠态；禁止组件再写 color-mix |
| `scrim` | 黑 10% / 黑 40% | `#00000019` | `#00000066` | 对话框压暗；禁止用 `fg`（深色会变白雾） |

**Yohu 级别板（复用官方语义色，无独立鸿蒙级别 Token）：**

| 级别 | 引用 | Light | Dark |
|------|------|-------|------|
| `--yohu-level-v` | `font_secondary` | 黑 60% | 白 60% |
| `--yohu-level-d` | `brand` | `#0A59F7` | `#317AF7` |
| `--yohu-level-i` | `confirm` | `#64BB5C` | `#5BA854` |
| `--yohu-level-w` | `alert` | `#ED6F21` | `#DB6B42` |
| `--yohu-level-e` | `warning` | `#E84026` | `#D94838` |
| `--yohu-level-f` | `warning` 压黑 52% | 深于 Error；反色字走 `--yohu-fg-on` | 同构 |

**LogCat 内容板（官方 Android Studio Logcat V2，设置 `log_color_scheme=logcat`）：** 消息 `--yohu-logcat-msg-*`；级别徽章 `--yohu-logcat-level-*` + `-bg`；Tag `--yohu-logcat-tag-0`…`79`。色值锁在 `tokens/logcat.ts`（`LogcatColorSchemeDefault.xml` / `Darcula.xml` + `logcat/resources/palette/logcat-tags-palette.json`），由 `logcatThemeVars` 排出。Assert 与 Error 同消息色，徽章更深，禁止社区紫。模块只写 token 名。

**文件图标板（复用官方语义色，无 Material / 无自造 10 阶）：**

| Token | 引用 | 语义 |
|-------|------|------|
| `--yohu-file-icon-folder` / `-mark` | `brand` + `icon_sub_emphasize` | 目录=品牌；折页次强调蓝 |
| `--yohu-file-icon-file` / `-mark` | `font_tertiary` + `background_fourth` | 通用稿；折角四级表面 |
| `--yohu-file-icon-text` / `-mark` | `font_tertiary` + `font_fourth` | 文本行条 |
| `--yohu-file-icon-apk` / `-mark` | `confirm` + `font_on_primary` | 安装包绿；细节反色（soft 叠同色不可见） |
| `--yohu-file-icon-image` / `-mark` | `brand` + `font_on_primary` | 图像 |
| `--yohu-file-icon-video` / `-mark` | `brand` + `font_on_primary` | 视频播放三角 |
| `--yohu-file-icon-audio` / `-mark` | `alert` + `font_on_primary` | 音频注意 |
| `--yohu-file-icon-archive` / `-mark` | `alert` + `font_on_primary` | 压缩包注意 |
| `--yohu-file-icon-xml` / `-mark` | `warning` + `font_on_primary` | 标记语言 |
| `--yohu-file-icon-pdf` / `-mark` | `warning` + `font_on_primary` | 文档红 |
| `--yohu-file-icon-json` / `-mark` | `alert` + `font_primary` | 数据橙；花括号走主题正文色 |

浅色写进 `:root`，深色写进 `[data-theme="dark"]`。`theme.css` 必须与 `emitThemeCss()` 字节一致。

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif`
- 数据/等宽：`"Consolas", Menlo, "Courier New", monospace`（只走系统字体；对照 AS Logcat / JetBrains Mono 的收件箱近似。`font-variant-numeric: tabular-nums`）
- 字号阶梯（默认 = 鸿蒙 PC）：Caption_M 10 / Caption 12 / Body 14 / BodyStrong 14 / Subtitle_M 14 / Subtitle 16 / Title_S 18；**compact 覆盖** 10 / 11 / 12.5 / 13.5 / 13 / 15 / 18
- 字重：Light 300 / Regular 400 / Medium 500 / Semibold 600 / Bold 700（Title Bold、Subtitle Medium、Body Regular）
- 行高：`--yohu-font-leading-tight: 1.25`（铬条/标题）/ `ui: 1.55`（正文）/ `data: 1.4`（日志/serial）
- 根节点：`html,body,#root` 使用 Body + leading-ui + `line-break: strict`（行首标点禁则）
- 工具类：`.yohu-type-title|subtitle|body|caption|data`（模块优先复用，禁止另起字号）

### 2.3 密度与布局

控件/行高走密度变量，布局宽走 `--yohu-layout-*`，禁止在组件或模块里写第二套数字。

| Token | compact | comfortable（默认） | 用途 |
|-------|---------|---------------------|------|
| `--yohu-control-height` | 26 | 32 | 按钮/输入/图标钮/路径栏 |
| `--yohu-control-height-sm` | 24 | 28 | 小按钮 |
| `--yohu-row-height` | 22 | 26 | 日志/文件数据行 |
| `--yohu-row-height-device` | 34 | 40 | 设备卡片 |
| `--yohu-row-height-nav` | 32 | 36 | 导航项 |
| `--yohu-row-height-header` | 28 | 32 | 表头、命令库树 |
| `--yohu-segment-single` | 28 | 40 | 分段按钮单行（V2 `singleline_background_height` / V1 最小 28） |
| `--yohu-segment-hybrid` | 44 | 56 | 分段按钮图文（V2 `doubleline_background_height`） |
| `--yohu-title-bar-height` | 40 | 40 | 窗口铬（页眉回内容区后走 HarmonyOS Compact；不再随内容密度抬到 56） |

布局常量（不随密度变）：`--yohu-layout-shell-nav: 200px`、`--yohu-layout-shell-nav-icons: 48px`（收起图标轨，与 `TitlebarCaption` 同档）、`--yohu-layout-sidebar: 240px`、`--yohu-layout-preview: 240px`、`--yohu-layout-mirror-ops: 48px`、`--yohu-layout-mirror-func: 200px`、`--yohu-layout-output-max: 260px`、`--yohu-layout-hit-splitter: 6px`、`--yohu-layout-gutter: 16px`、`--yohu-layout-settings-max: 920px`（设置页阅读列帽，超出居中留白）、`--yohu-layout-grid-max: 2220px`（窗口 12 列帽，不是设置阅读列）、`--yohu-layout-page-inset` / `--yohu-layout-page-gap`（数值 = `Spacing.Md` 12vp，经 `YoPage` 消费）、`--yohu-layout-chrome-pad`（数值 = `Spacing.Sm` 8vp，经 `YoChrome` 消费）。

HarmonyOS 电脑/大屏补齐：`--yohu-layout-window-default-w/h: 1200×800`、**工作台主窗** `--yohu-layout-window-min-w/h: 1024×768`（与 Tauri `minWidth`/`minHeight` 同值；保证投屏竖屏 contain 短边 ≥280 CSS。鸿蒙对话框/子窗最小 360×240 **不**套主窗）、`--yohu-layout-page-margin: 40px`（PC 左右边距，设置页用）、`--yohu-layout-breakpoint-split: 600`（分栏）、`--yohu-layout-breakpoint-side: 840`（侧边页签）、`--yohu-layout-button-max: 448`、`--yohu-layout-dialog-max: 400`、`--yohu-layout-dialog-body-max: 260`（hug 滚槽预算）。数量约束 `LayoutLimits`：标题栏右侧 ≤3 图标、C 栏工具栏 ≤6、侧栏 ≤窗口宽 40%。间距补 `space-2xl=32`、`space-3xl=40`（Padding_level16/20）。控件行高仍按 P1 产线密度收敛，不改用手机 48vp 列表行。

效率型工作台：内容区从窗口标题栏下方**贴边**排布（`.yohu-layout__content` padding 0）；模块页眉与分区的内边距由 `YoPage` 承担。效率型 `role=module` 用 `page-inset` / `page-gap`；设置页 `role=settings` 左右 `page-margin` 40vp，列帽 `settings-max` 居中。

描边宽：`--yohu-stroke-hairline: 1px`、`--yohu-stroke-accent: 2px`（焦点/左边条/Tab 指示）、`--yohu-stroke-emphasis: 3px`（级别条/结果卡强调）。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yohu-dur-fast: 100ms`（hover/按下）、`--yohu-dur-small: 150ms`（小范围）、`--yohu-dur-normal: 160ms`（面板/下拉）、`--yohu-dur-local: 200ms`（局部删除）、`--yohu-dur-slow: 300ms`（页面级）、`--yohu-dur-enter: 350ms`（入场）、`--yohu-dur-progress: 400ms`（进度最短感知）、`--yohu-dur-bar-hide: 2s`（滚动条 Auto 停滚隐藏）、`--yohu-dur-toast: 3s`；循环指示：`--yohu-dur-loop: 800ms`、`--yohu-dur-loop-slow: 1.2s`
- 缓动：`--yohu-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yohu-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yohu-ease-loop: ease-in-out`（循环）；**出场加速曲线与语义 MotionSpec 见《动画系统-v6.md》**（ADR-v6-017）
- JS 消费侧经 `@yohu/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 完整行为（Presence / Collapse / 侧栏 `rail` / 配方目录 / 虚拟列表禁动）以 `docs/architecture/动画系统-v6.md` 为准，本节只登记 token 数字
- 用途克制：下拉展开/淡入淡出；**日志列表选中片无过渡**（性能优先，`.yohu-interactive` 默认无 transition）
- **加载循环**：控件内加载走 `YoButton.loading` / `YoIconButton.loading`（`--yohu-dur-loop` 线性旋转，期间 `disabled` + `aria-busy`）。区域/页面等待走 `YoLoading`（环 + 标题/描述，`role=status`；覆盖下层时加 `cover`）。设备栏刷新、文件刷新按钮等仍走 IconButton；目录首载、日志启动/等待出流走 `YoLoading`。投屏启动与等待首帧走 HWND chrome。禁止模块自写 spinner。

### 2.5 图标

- **应用品牌图标**：`app/yohu-adbtools/icons/icon.png`（1024，圆角矩形底板 + 透明四角，宇宙蓝）+ `icon.ico`。标题栏 / 关于 / favicon 走 `APP_ICON_SRC`（`/app-icon.png`），经 `YoTitleBar.logoSrc`；展示时不再二次裁圆角。禁止用模块字形（如 `terminal`）冒充应用图标。
- **唯一入口**：`@yohu/ui` 的 `<Icon name size>`；模块注册表 `icon: IconName`；工具栏用 `YoIconButton`（内部仍走 `Icon`）。
- **文件类型图标**：`<YoFileIcon name kind size>`。L2 `fileGlyphFor` 选字形；L4 SVG 只绑 `data-fill`，色走 Harmony FileIcon 板 token。模块禁止内联文件 SVG。禁止 Material hex，禁止纪律脚本豁免。分层见 [youi.md](youi.md)。
- **禁止**：模块内再写一份 SVG、emoji 当图标、静态对象缓存 JSX 节点。
- **风格**：24×24 viewBox、描边 2、`currentColor`；`play`/`pause` 实心。新增通用图标只改 `icons.tsx` 的 `ICON_GLYPHS`。
- **命令块**：身份字形是 `block`（提示符 + 三行，与 `terminal` 同族）。新增命令块钮、命令库树叶子、发送队列 Chip 共用。禁止 `list`、禁止碎角叠方块。

### 2.6 圆角阶梯

| Token | 值 | 用途 |
|-------|----|------|
| `--yohu-radius-2xs` | 2px | 微标（Fatal 块、检索高亮） |
| `--yohu-radius-xs` | 4px | 面包屑级小控件 |
| `--yohu-radius-sm` | 8px | 按钮/输入/列表 ripple / 导航片 |
| `--yohu-radius-md` | 16px | 卡片/面板/对话框 |
| `--yohu-radius-lg` | 20px | 大卡片 |
| `--yohu-radius-xl` | 32px | 顶层浮层 |
| `--yohu-radius-full` | 50% | 正圆（状态点/spinner） |
| `--yohu-radius-pill` | 999px | 胶囊（徽章） |

`radius.ts` ↔ `theme.css` 契约测试强制一致。组件 CSS 禁止 `border-radius: <裸值>`。矩形铬（对话框/按钮/卡片/菜单/选择/气泡）的可见圆弧由 `corner/` 算法绘制，不靠 CSS `border` + `overflow:hidden` 叠圆角。`YoCorner` 公开 `flex` / `overflow`（含 `auto` 藏条）/ `pad` / `direction` / `align` / `justify` / `gap`。禁止消费方点 `__content`。

### 2.7 交互态与选中 Ripple（单源）

列表行、树行、下拉选项、菜单项、导航项、命令管理项、表头排序 **共用同一配方**，禁止各文件再写 `background: accent-soft` / `nav-hover`。表头排序钮由 `YoColHeader` 在有 `onSort` 时自绘并铺满内容区；模块不挂 `__label`、不自绘第二套排序钮。悬浮片 `--yohu-col-header-overlay-inset: 0`、圆角 `none`（铺满矩形列格）；文案边距 `--yohu-col-header-content-pad` 只写在 `.yohu-col-header__label`，禁止写在 `.yohu-interactive` 宿主。禁止在 `.yohu-files__cols` 上用左右 padding 把首列轨道推离左缘。

**状态色（Component 层）**

| Token | 算法 | 用途 |
|-------|------|------|
| `--yohu-state-hover` | `interactive_hover`：中性 5%（浅黑/深白） | 悬浮 / 键盘活动 |
| `--yohu-state-pressed` | `interactive_pressed`：中性 10% | 按压 |
| `--yohu-state-selected` | `interactive_select` = `var(--yohu-accent-soft)` | 选中软底（侧栏/树/命令/列表同一源） |
| `--yohu-state-selected-fg` | `font_primary` = `var(--yohu-fg)` | 选中行文字/图标；次行保持 `fg-2`/`fg-3` |
| `--yohu-accent-soft` | `comp_emphasize_secondary`（品牌 20%） | 选中底 / 徽章 / 芯片；禁止当文档选字 |
| `--yohu-text-sel` | `background_emphasize` = 品牌实底 | 输入框 / 表单选字底 |
| `--yohu-text-sel-fg` | `font_on_primary` | 输入选字反白 |
| `--yohu-doc-sel` | 画布混品牌（浅 32% / 深 55%） | Family A 文档选区底；不改字色 |

**几何（可在子树覆盖，不可另起炉灶）**

| Token | 默认 | 含义 |
|-------|------|------|
| `--yohu-ripple-radius` | `var(--yohu-radius-sm)` | 选中片圆角 |
| `--yohu-ripple-inset` | `0` | 铺满行盒；距背板 = 容器 padding |

**载体**：`tokens/states.css` 的 `.yohu-interactive`。选中只用 `.yohu-interactive--selected`（**不要**用 `[aria-selected]` 上填充：`YoTabs` 的 `aria-selected` 表示下划线激活，不是选中填充）。键盘活动用 `.yohu-interactive--active`。禁止 Tree/Select/命令管理/壳再写选中字色。短列表单选软底由 `YoIndicator` 在项之间滑动。`YoVirtualList` listbox 行关掉 `isolation` / `::before`，多选底画在行上；单选 fill 仍由滑块画片。禁止虚拟列表再给每行开合成层。选中悬停/按压在软底上叠 `--yohu-state-hover` / `--yohu-state-pressed`，禁止改走 `--yohu-accent-hover`。

- 实心底控件不走列表 ripple。`YoButton` 只认 `data-style` × `data-tone`：EMPHASIZED 用 `accent`/`error` 实底 + `fg-on`，hover/pressed 走对应 `*-hover/pressed`；NORMAL 用 `--yohu-comp-gray`，hover 叠在灰底上，禁止换成 `state-hover`。`YoCheckbox` 选中走 `--yohu-accent-hover/pressed`。`YoSegmentedButton` 选中 hover/pressed 叠 `--yohu-state-*`，不换 accent-hover 实底。
- **YoButton 三档：** 公开 `buttonStyle` 对照鸿蒙 EMPHASIZED / NORMAL / TEXTUAL。`tone` 只有 `accent | neutral | danger`（danger = ButtonRole.ERROR）。页眉主操作默认无 props。次要操作 `normal+neutral`。弹出框脚钮：取消 `normal+accent`、破坏 `normal+danger`，建设确认默认强调。禁止脚钮再走 TEXTUAL。禁止再写 `variant` / `outlined` / `data-paint` / Button `success|warning`。禁用背板不变、字 `--yohu-fg-3`。
- `YoSegmentedButton` 对齐官方三种：页签单选（tab 白选择块 + `shadow-xs` + `fg`）、胶囊单选（accent + `fg-on`）、胶囊多选（`multiple`，共轨连选，再点取消）。选中填缺省强调色，项 `fill` 可覆盖（级别 V–F）。默认 hug，`block` 铺满。`YoIndicator` 在轨内与项同父。电脑小圆角走 `YoCorner` paint。内容：文本 / 图标 / 图片 / 图文（图标在上）。不作一级导航、不承载删除/添加。级别筛选走胶囊多选，见 §4.1。
- `YoTabs` 激活指示是 `YoIndicator` underline（底边 `--yohu-stroke-accent` 滑块），hover 仍走 ripple；不要把 Tab 激活画成选中填充。
- 语义色逃生：`.yohu-badge`（徽章）与 `.yohu-tone`（日志级别 / 检索高亮等）在选中行内保持自身色。行级 `--yohu-log-ink` 只给清单左条 / 级别字 / Tag / 已知级别消息，不桥到按钮 inherit。禁止再叠 ink 软底，禁止筛选槽写 `data-paint`。
- 选中宿主必须透明底：自绘 `background` 会盖住 `z-index: -1` 的选中片。
- 禁止再挂表面 dual class（`yohu-tree__row--selected` / `yohu-select__option--selected` / `yohu-*-item--active`）。键盘高亮仍用 `.yohu-interactive--active`。
- **多选邻接圆角（Tree / Nav）**：`adjacentJoin` 判断上下行是否同属选中块。`--sel-start` 削底角、`--sel-mid` 四角皆直、`--sel-end` 削顶角；孤立选中仍四角 `--yohu-ripple-radius`。`YoVirtualList` `tone=list`（文件清单 / 命令管理中栏）行盒走 `list-row/`：直角通栏，hairline 贴齐左右。`tone=document` 单选（命令管理组栏）选中走 fill 滑块，行上悬浮写 `data-radius=chip`，与滑块同一 `--yohu-ripple-radius`。禁止在 Family B 行盒上叠圆角 / `yohu-focus-ring`。选中行同样画 hairline，禁止再藏成透明。禁止模块再写一套选中圆角或行间线。

**焦点环（单源）**

- 只在 `html[data-yohu-focus=keyboard]` 下画（L1 `bindFocusModality`：Tab 激活，指针卸；token 入口绑一次，壳不必再绑）。对齐鸿蒙「Tab 激活焦点框，方向键不激活」。
- `.yohu-focus-ring` / `--inset` / `.yohu-focus-host`：`::after` 描边 `var(--yohu-focus-ring)`，`border-radius: inherit` 跟宿主边缘。外环 inset 用 `--yohu-focus-width` + `--yohu-focus-offset`；内环用 `--yohu-focus-offset-inset`。
- 禁止 CSS `outline` 直角环。禁止控件再写 `outline: 2px solid var(--yohu-accent)` 或手写同一套描边。

---

## 3. 壳（Shell）规范

```
展开（200）                                      收起图标轨（48）
┌────────────────────────────────────────┐       ┌──────────────────────────┐
│ TitleBar（图标+名 │ 留白 │ 侧栏钮 │ 三键）│       │ TitleBar … 侧栏钮 │ 三键 │
├────────────┬───────────────────────────┤       ├──┬───────────────────────┤
│ 设备卡      │  模块标题区    功能栏      │       │● │  模块标题区  功能栏    │
│ 模块 图标+名│  ┌ surface ┐ ┌ surface ┐  │       │▣ │  ┌ surface ┐          │
│ 设置        │  └─────────┘ └─────────┘  │       │⚙ │  └─────────┘          │
│ 版本 · 设备 · 任务                       │       │ 版本 · 设备 · 任务        │
└────────────────────────────────────────┘       └──────────────────────────┘
```

- **设备栏**：标题行 = 折叠钮（`YoRailSlot`）+ `YoSubheader`「设备」`meta` 数量徽章 + 刷新（标题行兄弟，`YoIconButton loading`）。禁止把徽章放进 `actions`。开流 `data-stream=open` 时 heading 槽吃剩余宽，刷新贴行尾；图标轨 heading 关流，刷新与导航图标同槽起边。设备行走 `YoListItem`（型号 / serial / 可选运行时次行 + `YoStatusDot` + 未授权 `YoBadge`）。图标轨只留与导航同槽的状态点 + 刷新，文案走 `YoTooltip`；无设备时栏 hug（`data-empty`，折叠走默认 `collapse`，空态 `YoEmptyState size=sm` 短引导；有错误才出明细和重试），不占满 `--yohu-layout-device-rail-max`；有列表才 `recipe=fill` 在帽下纵滚。选中只加 `.yohu-interactive--selected`（高亮 = 当前模块解析后的执行目标）。单选实底由 `YoIndicator` fill 在 list 宿主内滑动，宿主 `overflow: hidden` 裁切弹簧过冲；项滚动走公开 `YoScroller`。禁止把 `overflow: auto` 写在滑块宿主或模块 CSS。禁止壳点 Subheader / Scroller 内部 class。MultiOptional（终端）：单击替换勾选，Ctrl/Meta+click 加减选；未勾选回退全局焦点，不把全部在线设备当作已选。运行时字段只读壳 `deviceStore.statuses`，禁止栏内轮询。
- **导航**：行走 `YoListItem`（`role=button` + `Layout.IconSm` + 标题）；分组 `YoSubheader`；系统区 `YoDivider`。激活只加 `.yohu-interactive--selected`；Planned 项「开发中」走 `YoBadge`。图标节点每次渲染新建。设备栏与导航共用 `--yohu-layout-rail-inset`。侧栏是常驻双态轨（标题栏 `sidebar` 钮）：意图只走 `RailIntent`（页栅 / 轨 `data-rail`），禁止 `RailPresentation`。`data-stream` 是文案流（展开/展开行程开流，收起当拍关流）；`YoListItem` 轨内自写 `data-stream`，`rail.css` 不点 list-item。宽、槽、卡高、字同一拍软弹簧，禁止先水平再垂直。图标轨只留模块图标与设备状态点（与导航图标同槽）；悬停走 `YoTooltip`，禁止原生 `title`。禁止整栏收到 0 或 `inert`。设备栏高度帽 `--yohu-layout-device-rail-max`（`LayoutLimits.DeviceRailMaxPercent`）。模块名单纵滚走 `YoScroller`（视口 `flex: 1 1 auto`，禁止 `1 1 0`）。
- **模块页眉**：在右侧内容区顶部（`YoChrome`）。左侧为功能标题区（Subtitle Bold）+ 选中设备名（`leading` 组合中性 `YoBadge`，文案来自 `DeviceSession.selectedLabel`），右侧为功能栏 `actions[{key,node}]`；与窗口标题栏分离，不挤进中区。leading / 功能栏进出走库 Presence chip。无操作的模块（设置）栏宿主空挂、不画钮，可见只是标题；标题行高度仍是 `--yohu-control-height`（与有按钮的页同一占位）。底垫 `--yohu-layout-chrome-pad`。页眉是页壳的第一子节点（`flex: 0 0 auto`），禁止与内容区作为 fragment 兄弟交给模块转场。禁止模块自挂 Presence 补页眉。
- **模块页壳**：效率型与占位模块（终端/文件/日志/投屏）根节点 `YoPage`（缺省 `role=module`：`padding: page-inset`、`gap: page-gap`）。设置页同一组件 `role=settings`（左右 `page-margin`，列帽 `settings-max` 居中）。`YoChrome` 是第一子节点。内容进 `YoPanel`（效率型 `variant=pane` 撑满；设置分组默认 card）。禁止模块再写一套页垫。空态文案不得复写页眉模块名。
- **通铺与分区**：窗口 `--yohu-canvas` 通铺；标题栏与工作区、状态栏不拉结构分割线。侧栏（展开与图标轨）与内容区之间画 hairline。模块分区 = `YoPanel`（surface + `YoCorner role=card` + 描边 + XS 阴影）。分割线还用于：页签指示、表头/列、数据行（`tone=list`）。对话框三区、设置行、日志级别槽不画分割线。路径栏与清单靠 canvas 分层，不另拉线。
- **状态栏**：左「展示名 v版本」（`system.info.identity`）/ 中留白 / 右「设备 · 任务 · 状态」；任务悬停显示明细。状态槽由模块 `Status` 贡献（投屏出画后显示实测 fps）。透明贴合 canvas。Caption + leading-tight。
- **对话框**：Title_S Bold；PC 圆角走 `YoCorner role=dialog`（`radius-md` 16）；宽 ≤400、高 ≤90%；**不要**把窗口最小 360×240 套到浮层确认框。三区不画分割线。层 Portal 到 `body`。panel 自写 `data-clip`（=`hug∧open` 或 `traveling()`，DialogChrome 订）；fill 定高不套 Travel、不开 clip。禁止 CSS `:has(.yohu-travel)` / 点 `__view` / `__content`。`data-travel` 只属 `YoTravel`。
- **启动交接（Windows）**：用户看见的是原生 GDI 小窗，不是 `#yohu-boot`。小窗与主窗共用锁定的主屏工作区，不跟光标屏。画布色出口是 `window_boot::canvas_color` / `canvas_bgra`，对齐 `--yohu-bg-base`。`SplashPlacement` 锁定几何 + dark + corner；`BootSurface` 锁定 canvas 与 splash 半径（同屏 clip 终点 0）。paint 写入矩形 `BootFrame`（四角画布色）。小窗 RGN 只裁显示外形并 `DWMWCP_DONOTROUND`。同屏 overlay clip 从 Md 收到 0，铺满后目标 HWND 不透明；主窗 `host_corner`（`Radius.Sm`）揭窗后才出现，不进 overlay clip。overlay HWND `DWMWCP_DONOTROUND` + 整窗 extend frame。`Theme::System` 禁止再采 `win.theme()`。禁止从 HWND DC 抓像素，禁止把 RGB=0 补成画布（浅色标题就是黑），禁止铺满时 clip 出透明四角。hydrate 完成且双 rAF 之后卸掉 HTML 画布层，再 `boot.showMain`。主窗一次落到最终矩形但保持隐藏；同屏 Shared overlay 铺满之后才揭内容并淡出；异屏 Exit overlay 结束后才揭主窗。禁止 `center` 与光标屏第二套选屏。禁止插值 HWND 宽高、禁止 CSS 缩放主窗、禁止 HTML 启动层淡出、禁止第二 WebView splash。禁止 `yohu-motion` 持画布色。
- **快捷键统一表（v6.1 目标）**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 采集操作；进出走 `YoChrome` chip）→ 会话 Tab（canvas 上）→ `YoPanel` 会话分区（过滤 / 虚拟列表 / 状态行）。
- **面板家族：** 日志分析对齐 Family A（Android Studio Logcat Editor Document）：清单载荷是 Document.text。行是连续文档，不是文件清单那种格子。标题栏走 `YoColFrame tone=document cellPad=none` + `YoColHeader pad=none`，轨道是 `logDocTrackTemplate(chPx)` 探针 px；禁止把 Family B 的行（`YoColTrack` / 行块拖选）套到日志上，禁止再画字符串头行。表头禁止 CSS `ch` 冒充轨道；级别 BACKGROUND 用的是文档文本节点自己的 `1ch`（对照编辑器 `charWidth`），不是表头第二把尺。
- 行结构（**一份 pre 文档** + 等宽）：`editor/format`（官方 Timestamp / ProcessThread / Tag / AppName / Level，一条 accumulate）→ `editor/document`（尾部追加/环裁/改选项重载）→ `editor/markup-*`（着色 run / `::highlight` 字色 / `markup-wash` 把 EXACT_RANGE 写成文本节点 `1ch` BACKGROUND）∥ 原生 `::selection` ∥ `highlight.ts` 关键字偏移 → `editor/view`（1 文档行 = 1 可视行，一个文本节点）。文档行关闭 `kern` / `liga` / `tnum`，对照 Logcat 编辑器纯等宽 `charWidth`，让 `1ch` 与每个字符同一格。`headerWidth` 与各 Format `width()` 同一把尺。Soft-Wrap 关把 hang 空格写入 Document。默认 STANDARD `headerWidth=100`。禁止 CSS hang。View 禁止回调 Formatter。CSS 行铬只认 `data-bar`。`YoVirtualList` 行高 `dataRowHeight()`，滚条 `state=on`（溢出常显）。复制切 Document.text。导出仍走 `formatLogLine` testdata。`tone=document` 不画行间线。选区手势与绘制都是原生 `::selection`（`--yohu-doc-sel`），不改字色。
- **显示列：** 读壳注入的 `DeviceSession.settings.log_display_columns`（消息始终在；关列则文档省略该段）。默认 STANDARD：时间 / BOTH / Tag / AppName / 级别。设置项与标题栏文案单源 `LOG_DISPLAY_COLUMN_CATALOG`。表头可拖列（时间 / UID / PID / TID / Tag / 应用）把 px 收成 `colChars`，只加不减官方 Format `width()`；级别与消息不可拖。Tag 默认仍是官方 `TagFormat.maxLength` 常数（23），加宽不进设置。禁止模块再拉设置命令或把显示列拷进 logStore，禁止行走 `YoColTrack`。
- 信号行（崩溃/ANR）行底色 `--yohu-signal-bg` + 左侧 Error 条；选区叠在行底之上，左条与级别 ink 保留。
- 过滤栏：级别独立切换（V–F 精确集合，可多选；全部弹起不限）走 `YoSegmentedButton` `type=capsule` `multiple` `size=sm`；未选字色 `item.ink=var(--yohu-level-*)`；选中填 `item.fill=var(--yohu-level-*)`。禁止自造 `YoCorner`+flush Button、禁止 `.yohu-ink`、禁止点库内部 class。 / Tag（逗号分隔多针，精确命中；提交后 `YoChip` 走 `YoListPresence recipe=chip` 丝滑入场，流内右侧垂直居中删除；过滤生效走 `active`） / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 用 `YoBadge tone=accent`；控件走 `--yohu-control-height`。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）走 `logs.tab` 场景。
- 日志行：原生选区走文档字符。Format 尾空格都在 Document.text 里，从 Tag 左缘拖过尾空格只选 Tag 段。三击选行交给浏览器；禁止对 `pointerdown` `preventDefault`。Ctrl+A 整表 `visible`。右键走 `logs.row`（有选区复制切片，否则该行文档）。与 Ctrl+C 同一 `serializeLogCopy`。折叠徽章 `data-log-chrome` 不进文档。禁止在本页再挂 `YoContextMenu`。禁止 `Selection.toString()` 当跨行唯一载荷。
- 新建窗口：设备与划分同一行（`yohu-logs__new-bar`）。左 `YoSelect block`（型号吃剩余，次文案短号·连接贴箭头；菜单 Portal）；右 `YoSegmentedButton` hug（包名 / PID，无左侧标题，高度 `--yohu-segment-single`）。禁止芯片/空触发钮，禁止 `YoFormRow` 横排把 Select 收成胶囊，禁止再拆成两行。清单铬 `YoCorner flex=fill`；选中底只走 `YoVirtualList` document 单选 fill。禁止模块 `YoIndicator`，禁止 `tone=list`。检索 Enter 与「创建」、行双击同一提交；确认后走页眉「开始采集」订本窗，禁止只加页签。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；启动采集 / 采集中空 → `YoLoading`；过滤无命中 → 「无匹配日志，调整过滤条件」。采集中空态与 pending 互斥：空面板保持跟滚，禁止「等待设备输出」和「N 条新日志」同时出现。
- **采集可见性**：点「开始」新开流时清空 UI 镜像与本窗口面板，core 同步 `ring.clear()`，只展示本流 logcat。同窗口在 core 仍 Live 时点开始是 adopt 续采：保留已画出的行，从环补洞。**新窗口第一次点开始**：`fromSeq=0`，按窗口过滤从当前环补齐（包名窗口开始前打 `ps` 绑 PID），不要从尾 seq 空等下一次输出。失败 toast 出错误。显示面板常驻：设备无输出、掉线、停采都不冲刷。过滤 / 入镜 / 重绑共用 `fromSeq`；清空推进游标，禁止镜像旧行回填。空闲后不得落到「等待设备输出」并把旧行冲掉。
- **导出：** `log.export` 扫环（ADR-v6-021）。目录用 `export_default_path`（空则 `paths.exports_dir()`）；`export_ask_every_time` 控制是否每次选路径。导出行文本走 `formatLogLine` testdata，不驱动清单。禁止 `export.write_mode` / 采集中落盘。

### 4.2 命令终端

- 结果区对齐 Family A（文档）：`>>>` / `<<<` 是格式化文本块，不是网格行块。选区与复制跟日志同一思路。
- 布局：内容区顶部模块页眉（标题 + 选中设备名 + `actions[{key,node}]`：清屏 / 取消（有在途组时）/ 命令管理；进出走库 chip）→ 左侧命令库 `YoPanel title="命令库"`（宽 `--yohu-layout-sidebar` 240vp）+ 右侧结果 `YoPanel title="执行结果"`（间距 12vp）。两栏标题走面板 `title`（鸿蒙 Compact 栏 + 一级字），禁止左栏无标题、禁止再套 Toolbar 灰带。页眉不放发送/执行。
- 命令库树：组节点加条目数徽章；行高 `--yohu-row-height-header`，禁止套数据行 `--yohu-row-height`。栏标题右侧 `YoSearch slot=entry`，栏下 `slot=bar` 折叠；过滤走 YoSearch 引擎（组名命中保留整组）。点击组行或展开箭头只开合该组，不选中、不入队。选中/hover 走 `.yohu-interactive`（只有叶子选中）。命令与命令块同级：命令图标 `terminal`，命令块图标 `block`；命令 `title` 为 `adb <具体命令>`（`aria-label`，不画气泡），不省略 `adb`；命令块 `title` 为条数与间隔。点击叶子入队（命令一行、块整块；需占位符则先填值）。
- **命令管理**：`YoDialog` 定高三栏（组 | 条目 | 编辑），三栏都是 `YoPanel variant=pane`，高度与圆角对齐。栏标题 `YoToolbar pad=xs` 贴栏素底，与清单名 12vp 同缘，禁止再嵌 control 灰带。`YoTextField block` 只铺宽，不沿栏高 stretch。中栏比组栏窄（`--yohu-layout-cm-cmd-*`）。清单行走 `YoVirtualList`，禁止自写圆角底或 `focus-ring`。中栏条目仍是名称行（块带徽章）；名称之间的分割线走 `tone=list`，清单背板 `--yohu-canvas`。不走文件表列架。中栏可新增命令（`plus`）或命令块（`block`，禁止 `list`）。具体命令/步骤编辑与展示同一 `formatAdbLine`（始终 `adb <正文>`；落盘仍存正文）。`{n}` 只活在一条模板上；按钮「插入参数」在本行光标写入下一个未用下标。命令描述标签 `{n}`；块描述与填参标签 `1-0` / `2-0`，跟步骤走，换位带着描述。禁止条目级并集。每个实际出现的 `{n}` 可编参数描述，紧跟具体命令/该步（具体命令槽只铺宽，不沿栏高 stretch）。命令块另编名称、步间间隔（常量集）、步骤拖动排序；增删步骤走 `YoReorderList` 行内 Presence `list`（与参数描述同一 `useListPresenceSlots`）；删除与命令输入同一行。命令组与中栏条目整行按住拖动换位（`YoVirtualList.onReorder`：浮层、占位、让位、缝间插条；一项禁用；点行不换序；`Ctrl/Meta+↑/↓` 换位）。命令块步骤另用手感 grip。中栏条目 Ctrl 点选 / Shift 范围选；右键复制所选具体命令、删除所选。填参弹窗列出原始命令与填参栏（命令 `{n}`，块 `1-0`；有描述则跟在标签后），不展示预览；命令块一次按步序填多格。不提供成功/失败正则、输入提示、组条目间隔、失败中断。文件职责与设计前/后链路见 [modules/terminal.md](modules/terminal.md)。
- **结果区**：一次输入一条输出块。`>>>`/`<<<` + 时间钉在首行，多行内容只在内容列换行。流自上而下。时间默认 `HH:mm:ss.SSS`（设置 `terminal_time_format`，立即投影已画出的行）。新块走 `YoListPresence` 配方 `list` 升起；清屏直切（`exit=false`）。空态 `YoEmptyState` 铺满当前流并居中；出现/消失直切，发送栏开合时跟随 `inline-end` 的高度插值，禁止空态自写 motion。不展示通过/失败徽章。模块功能栏「清屏」只清 UI 结果，不影响命令库。
- **发送栏**：钉在结果面板底部，贴右双轴开合（`yohu-recipe-inline-end`：宽度 compact↔100%，高度 0fr↔1fr）。收起是右下角溢出把手（上+起边 hairline、起-起角 radius-sm）。展开：队列卡片在输入框上方（`YoListPresence` 进出场；Chip leading 命令 `terminal` / 块 `block` / 组 `folder`；名称 + `formatAdbLine` 完整命令 + 移除），输入框右侧水平纸飞机发送；无内容时按钮仍在，变灰禁用、机头向右；草稿或队列有内容时 `yohu-recipe-send-aim` 转到朝上。Enter 发送队列与草稿。是否把 `adb` 写入 exec 载荷走设置 `terminal_prepend_adb`（默认关）；展示始终带 `adb`。

### 4.3 文件管理

- 清单对齐 Family B（数据网格）：行/单元格选择 + 列宽轨道，不是日志那种文档选区。禁止把日志的字符 Range 模型套过来。
- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 上传/下载/刷新/预览，`actions[{key,node}]`，进出走库 chip）→ `YoPanel` 资源分区（路径栏 | 四列清单）与独立预览 `YoPanel` 并列 → 有任务时另起传输 `YoPanel`（Presence `rise` 升起；标题栏可点，列表 `YoCollapse recipe=panel`）。
- 四列清单：`YoVirtualList` 选择模式。行盒走 `list-row/`（`YoListRow`），投放框走 `list-frame/`（`YoListFrame`）。Family B 清单显式 `tone=list`，行间 hairline 在 list-row（直角通栏）。禁止 `yohu-interactive` / `focus-ring`，禁止 ripple / 邻接圆角 / VirtualList 自绘 hairline。文件走 `YoColFrame` + `YoColRow` / `YoColHeader` + `YoColTrack` / `YoColCell`（标题默认靠左，列垫左 md / 右 sm；前三列 `YoColResizer` 短柄）。日志表头也走 `YoColFrame` / `YoColHeader`，但 `cellPad=none`、轨道是 `ch`、行仍是文档。排序钮铺满列格，走 `.yohu-interactive`（宿主 padding 0）。列宽走 YoUI `col-model` / `col-resize`，文件模块只 `setColWidth(key, px)`，禁止累加 delta，禁止再写 `grid-template-columns`。拖条热区透明，可见铬是居中短柄，禁止整块涂 accent。悬浮片铺满列矩形（inset 0 / radius-none）。名称列不再自写左右 padding，与表头同一 `--yohu-col-cell-pad`。表头与清单背板 `--yohu-canvas`（与面板 surface 分层）。清单视口与日志相同：`overflow: hidden` 给虚拟列表确定高度。禁止模块再写 `.yohu-virtual-list__row` 分割线。
- 路径行：上级钮 + **地址铬**（`AddressSlot`）。行铺满顶栏，铬 hug：浏览=面包屑簇 + 短热区（`--yohu-space-lg`，不 stretch）；编辑=输入盒（`YoCorner` 描边）。盒外不是路径栏。点铬内热区 / 分隔符 / `Ctrl+L` 后，输入同格 `clip-path` 从左向右揭开（`spatial-local`），打开手势松开后再 focus，光标在末尾、不预选；收回倒放同一条 clip（只打输入铬），播完再卸。编辑时面包屑 `display: none`，不占位。输入盒 `field-sizing: content`，`width: max-content`，跟文字 hug，`max-width: 100%` 超出才当铬视野滚动。禁止把顶栏剩余当路径栏，禁止热区 `flex: 1`，禁止面包屑 `visibility: hidden` 占满槽。禁止指定 `width`、禁止逐字改 `style.width`、禁止 `width` 走 `spatial-local`。Enter 提交：解析/安全根/设备浏览任一步失败则保持编辑态并标 invalid，清单停在原目录，`YoToast` 提示（目录不存在为「没有这个目录，请重新输入」）；成功才收回。禁止再在路径栏上方挂错误卡片。Esc / 点输入铬外取消。禁止第二栏、禁止常驻隐藏 input、禁止 `100cqi` / `container-type`。路径栏与清单之间不拉分割线。
- 预览是独立 `YoPanel`（宽 `--yohu-layout-preview`），不嵌进清单卡片；右键走 `files.list` 场景（新建/下载/复制路径/删除），由壳 `YoContextMenuHost` 呈现。
- 目录首次加载（清单为空且正在读取）走 `YoLoading`；刷新按钮仍走 `YoIconButton.loading`。空目录才是 `YoEmptyState`。

### 4.4 投屏显示

- 与效率型模块同一 `YoPage` + `YoChrome title="投屏显示"` + `leading` 组合设备徽章 + `actions[{key,node}]`（开始/停止、暂停、截图、全屏、仅显示；进出走库 chip）。内容区操作栏 / 质量是 `YoPanel`；舞台列是 `.yohu-mirror__avail` 透明洞（不是 YoPanel）。HWND 按 FramePipe 编码尺寸 contain dest 并画占用卡片（ADR-v6-027）；idle 铺满 avail。缩小走面积核。不是编码器 `max_size`，也不是 UI `containInZone`。
- 舞台像素由 HWND 独占（空态/加载/暂停/视频都画在 HWND 上，ADR-v6-026/027）；WebView 只留透明占位上报 avail。禁止 WebView overlay 与 HWND XOR。`Stage.mode` 决定回缓冲主人：铬模式每拍画填充+文案+描边，视频模式每拍画帧+描边。填充走工作台 surface（`dark` = `data-theme`，不是设备夜览）。描边走 `--yohu-border-strong`，画在当前可见 clip 内侧。空态图标 `fg` + `surface-2` 井。禁止 dirty 一次画完、禁止动画期跳过描边。空态只写终态（未选择设备 / 未开始 / 启动失败），不把模块名再写一遍。Live 不等于已出画：首帧 Present 前舞台保持加载，避免黑屏空等。上次编码尺寸留在 present，`stop` 不清零。占用 fill↔dest 走 DComp clip 动画。禁止 CSS 占用宽高过渡、禁止 UI 运行时 contain。切走投屏由工作台先关舞台再淡出网页；禁止 View 观察 Presence。按下后指针离开占用面立刻抬起（`TOUCH_UP`），禁止拖出画面后设备仍按着。
- 页眉主行 ≤6：开始/停止、暂停画面、截图、面板内全屏、**仅显示**（按下=只看；默认未按=可操作）。**面板内全屏**只藏操作栏与功能栏，舞台吃满页眉以下；页眉「退出全屏」与 Esc 始终可点。禁止 `position:fixed; inset:0` 盖住工作台。**设备操作栏**（宽 `--yohu-layout-mirror-ops`，在画面与设置栏之间，非常驻于全屏）：返回 / Home / 多任务 / 音量± / 电源 / **设备深浅色（月亮=设备当前深色、太阳=浅色，同一钮，读 `deviceStatuses.night`）** / 亮度±，鸿蒙符号 `YoIconButton`。非全屏时导航/音量/电源/亮度在不可操作时禁用，不把栏藏起来以免布局跳动；深浅色钮跟连接设备，不跟工作台 theme，禁止本页轮询 dumpsys。**右侧功能栏**（宽 `--yohu-layout-mirror-func`，`YoPanel`）：**质量**（投屏协议 USB/无线 / 长边 / 码率 / 帧率上限，**下次开始生效**）。禁止再把这些控件放进页眉 extra、设置页或通道开关。禁止把导航键放回设置栏。
- 实测 fps 在状态栏右下角（1s 窗口已 Present 帧），不是画面角标，也不是质量栏的编码器上限。
- 面板贴合：`mirror.layout` 报 `.yohu-mirror__avail` 客户区物理矩形 + 会话旗标。舞台透明洞稳定。Windows：HWND 铺满主窗客户区；可见卡片是 DComp clip（Fill=avail，Dest=contain）。Fill↔Dest 才走 `IDCompositionAnimation`。侧栏只改 clip，禁止 `SetWindowPos` 跟弹簧。禁止 `screenX` 跟窗。主窗不得小于 `Layout.WindowMin*`（1024×768），否则竖屏画面会塌成不可读的窄条。

### 4.5 设置

- 页壳不滚动；根节点 `YoPage role=settings`，`YoChrome` 钉在内容区顶部。分组卡片放进页面级 `YoScroller`；`YoPanel` 不裁切表单项。
- 页眉与卡片左缘共用 `--yohu-layout-page-margin`（PC 40vp）；列宽帽 `--yohu-layout-settings-max` 920，超出居中留白。全屏适配是居中阅读列，禁止拉满 `grid-max`。
- 表单项走 `YoFormRow`：左侧标题行（标题 + 备注水平相邻，生效徽章进 `note` 槽）+ 其下副标题，右侧功能控件 hug 贴尾且不收缩；两列 `align-items: center`。行间不画分割线，分组靠卡片与间距。开关 / 数字 / 下拉 / 多选复选进右侧槽。路径框与「浏览」同一右簇、中间只有行内 gap，禁止把右槽 stretch 出空档。说明文字是副标题，禁止再独占下一行，禁止设置页自写一行 flex 或给 `YoTextField` 写 CSS width。
- 文件位置项（ADB 路径 / 数据目录 / 默认导出路径）统一：`YoTextField width=control readOnly` 显示绝对路径 + 「浏览」；定宽 `--yohu-layout-settings-control-max`。空值显示 `system.info` 解析路径。禁止 `block` 套 hug 簇，禁止自绘第二套 control 皮。数字走 `YoTextField type=number`（左值右步进，槽宽 `--yohu-layout-settings-number-w`），下拉走 `YoSelect`。非法数字不在 View 吞掉，走 `settingsStore` → `settings.set` → domain。
- 投屏协议 / 长边 / 码率 / 帧率只在投屏显示页。设置页「投屏显示」仅保留强制 ADB forward。
- 命令终端：「输入命令默认加上 adb」仅标题 + 开关，无副标题；默认关；立即生效。
- **关于**：末张分组卡片。应用图标（与安装包同源）+ 展示名 + 定位，块下不画分割线；版本（右侧版本号后跟「检查更新」，无单独更新卡片）/ 标识 / 版权；数据根、安装目录、配置目录、缓存、应用日志只读路径 + 「打开」（`system.openPath`）。禁止再写死版本号。发现新版本后先下载，完成后再确认覆盖安装。
- 日志显示列：多选走 `YoCheckbox`（不是启用开关），进 `YoFormRow` 右侧槽、过窄时组内折行；消息列始终显示、不提供开关。立即生效。
- `YoDialog`：`--yohu-scrim` 压暗 + `--yohu-shadow-dialog`（失焦 `-unfocused`）；最大宽 400；面板安全顶 90%；hug 滚槽预算 `--yohu-layout-dialog-body-max`。标题 Title_S Bold；电脑圆角 `YoCorner role=dialog`（16）。三区不画分割线。层 Portal 到 `body`。panel 自写 `data-clip`（=`hug∧open` 或 `traveling()`，DialogChrome 订）；fill 定高不套 Travel。禁止 CSS `:has(.yohu-travel)` / 点 `__view` / `__content`。`data-travel` 只属 `YoTravel`。最小 360×240 仅适用于独立子窗口，不套浮层。禁止遮罩再写 `fg` 10%。
- `YoToast`：描边；最大宽 400；展示 ≤ `--yohu-dur-toast`（3s）。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YoDialog | Esc 关；焦点陷阱；打开后 `dialogInitialFocus`；关闭后还原焦点 | `role=dialog aria-modal`；标题 `aria-labelledby` |
| YoTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YoSelect | 展开后 ↑/↓ 选项；Enter 选；Esc 关；Portal 上下展开；触发钮 hug 文案簇；`block` 主文案吃剩余、次文案贴尾；菜单宽 hug（min=触发钮）；仅超出才纵向滚动 | `aria-haspopup=listbox aria-expanded aria-activedescendant` |
| YoTree | ↑/↓ 移动；→ 展开/← 收起；Enter / 空格：目录开合、叶子选中 | `role=tree/treeitem aria-expanded` |
| YoVirtualList | 选择模式：roving tabindex + ↑/↓/Home/End/Enter/Space | 选择模式 `role=listbox/option` + `aria-selected` |
| YoContextMenuHost | 应用根唯一实例；Portal 到 body；同时只开一个场景。模块禁止自挂 List | `role=menu/menuitem`（Host 内 List） |
| YoTooltip / YoTooltipHost | 只给无可见文案的铬；主题抬升指向气泡 + 箭头；落点离散；悬停或键盘焦点出示；指针点击后的程序移焦 / 按下 / 模态入栈立即卸；密集提示共一个 popup；无 Host 不画 | `role=tooltip` + `aria-describedby` |
| YoIconButton | 激活执行；`loading` 时不可激活；可见提示走 YoTooltip | `aria-label`（title）+ `aria-busy` |
| YoSearch | 栏可输入；Enter 提交；Esc 先清再关折叠；入口切换折叠 | 栏 `role=search` + `searchbox`；入口 `aria-expanded` / `aria-controls` |
| YoLoading | 非交互；减动效时环静止 | `role=status aria-busy aria-live=polite` |
| YoFormRow | 非交互容器；默认左标题右控件 hug；`stacked` 纵排铺满 | 无；控件自带 ARIA |
| YoSegmentedButton | 单选：←/→/↑/↓ 循环选中，Home/End 首尾。多选：方向键只移焦，空格/点击切换 | 单选 `radiogroup/radio` + `aria-checked`；多选 `group` + `aria-pressed` + `aria-multiselectable` |

---

## 6. 实施顺序（与代码质量门禁绑定）

| 阶段 | 内容 | 门禁 |
|------|------|------|
| **A. Token 升级** | 三层 token + 双主题语义板 + 密度/布局 + 级别板 + 动效 + 交互态 | token 单测 + 纪律 lint + 两主题对比度抽查 |
| **B. 组件打磨** | Yo 标注；`.yohu-interactive` 选中片；焦点环单源 | 组件测试全覆盖 |
| **C. 壳重绘** | 设备卡片/导航/状态栏/设置页按 §3/§4.5 | Vitest + 冒烟脚本 |
| **D. 三模块重绘** | 按 §4.1–4.3 逐模块重绘 | 模块单测 + 真机联调 |
| **E. 交互态收敛** | 全表面消费 ripple 原语；Y* 清零 | lint 圆角门禁 + 契约测试 |

每阶段独立提交；文档与实现同步更新。

---

**本文件为主规范；冲突时以本文件为准（并修订本文件）。**
