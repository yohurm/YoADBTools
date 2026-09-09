# Yohu ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v1.95（2026-09-09，日志复制按 Logcat 重排）    
> **调研依据：** HarmonyOS 开发者文档设计规范（本地 `HarmonyOS-Developer-docs`：`设计/设计指南/针对多设备设计/电脑/{设计概述,应用设计,窗口框架}`、`通用设计基础/{布局,视觉风格/文本排版,间隔参数}`、`应用 UX 体验标准/电脑应用 UX 体验标准`，提炼见 `docs/architecture/harmonyos-design-notes.md`）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** `@yohu/ui`（YoUI；token 单源 + 组件）+ `@yohu/workbench`（壳）+ `@yohu/modules/*`。所有改动必须同步更新本文件。
>
> **v1.95 变更（日志复制）：** 对照 Logcat：剪贴板从 `LogLine` 经 `formatLogLine` 重排，禁止 `Selection.toString()`（Grid 列盒会把粘贴拆成乱码）。选区只解析起止 `seq`；跨行取窗口 `visible` 闭区间；Ctrl+A 整表可见区；`copy` 事件只写 `text/plain`。无选区右键仍复制该行。
> **v1.94 变更（空态跟随挤位）**：`inline-end` 补 `grid-template-rows` 0fr↔1fr，与宽度同一 `spatialPanel`。闭合不占列高，把手溢出。结果区居中空态靠 `flex:1` 跟随，禁止空态自写位移。`height:auto` / `max-height:none` 视为跳变。侧栏 `rail`、传输 `panel`、按钮 `swap` 同一条「造成挤位的配方插值、被挤兄弟跟随」纪律。
> **v1.93 变更（发送栏宽度裁切）**：`inline-end` 改为与 `YoSwap`/侧栏同构的 `width` 插值（compact 控制高 ↔ 100%），内容锁祖先 `cqi`、贴 end 裁切；把手绝对叠在裁切盒上，只描露出的上+起边。禁止两列 `0fr auto`↔`minmax 1fr 0fr`（不插值）。
> **v1.92 变更（发送栏横向开合）**：命令终端输入栏去掉向下 XOR `panel`。收起往右夹成把手（chevron-left），展开往左铺满（`yohu-recipe-inline-end`，宽度 spatial-panel）。
> **v1.91 变更（动效收口）**：设备插拔走 `YoListPresence`。`yohu-motion` 只导出 `MotionSpec`；`@yohu/ui` 不再导出配方内部时长表（模块只用 `Yo*` / `motionSpecMs` / `DISMISS_HOLD_DURATION`）。
> **v1.90 变更（进出场观感）**：list 高度与内容同时长（200ms），位移改 xs、改 transition 可打断。Dialog 从下方微移入场、出场原地淡出不回放。Toast/popover/rise 进场改 spatialLocal。发送栏 XOR 走 `yohu-recipe-xor` 同格叠放，避免两段高度相加。
> **v1.89 变更（MotionSpec 双端）**：`yohu-motion::MotionSpec` 与 `tokens/motion.ts` 同名同值。配方时长从 spec 派生；splash / occupancy 只点规格名。`motionSpecMs()` 公开。弹簧仍只在 CSS 采样。
> **v1.88 变更（命令终端收发动效）**：IO 块与排队卡片走 `YoListPresence` + 配方 `list`（高度 spatialLocal ∥ rise 进出场）。发送瞬间队列出场、结果区新 `>>>`/`<<<` 升起；清屏直切。发送栏收起条与输入栏 XOR `YoCollapse panel`，禁止 Show 直切。模块不写 `@keyframes`。
> **v1.87 变更（命令终端 IO 块）**：一次 `>>>` 对应一条多行 `<<<`（`dumpsys` 等整段 stdout 不再按物理行拆成多条输出）。标识与时间钉在首行，后续行只在内容列换行。结果流自上而下（去掉顶栏 spacer），不再把内容顶到视口底部。
> **v1.86 变更（命令终端排队发送）**：发送栏整栏收缩/展开（YoCollapse panel）。右侧水平纸飞机（Lucide send-horizontal）发送，空内容变灰仍显示。点命令库叶子在输入框上方排队。展示统一 `formatAdbLine`（始终 `adb [-s] 正文`）；exec 是否带 `adb` 仍走设置。
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
> **v1.73 变更（原生启动小窗）**：双击后先出 480×300 原生小窗（GDI，对齐 Android Studio / IntelliJ），主窗隐藏 hydrate 完成后再揭大窗并关掉小窗。禁止用 WebView 当启动小窗。
> **v1.72 变更（揭窗从可见起算）**：`boot.reveal` 在 `#yohu-boot` 入 DOM 后立刻 show，不等 JS 包 / PageLoad Finished。最短 400ms 从揭窗时刻起算，禁止把隐藏等待算进启动页。工作台 CSS 延后到 `</body>`。
> **v1.71 变更（同窗启动层）**：`#yohu-boot` 静态品牌页（Logo + 展示名，画布色）盖住 hydrate；PageLoad 揭窗；最短 400ms 后 200ms 加速淡出。禁止第二 WebView splash。禁止启动白/黑空白 >300ms。
> **v1.70 变更（启动揭窗）**：主窗隐藏到设置/目录首帧再 show，底色对齐 `--yohu-bg-base`。禁止启动白屏；不另开 splash 窗。纯空白仍须 ≤300ms（鸿蒙启动页），揭窗时已是工作台铬层。
> **v1.69 变更（占用 DComp clip）**：HWND 铺满 avail；可见卡片是 DirectComposition rectangle clip。fill↔contain 由 `IDCompositionAnimation` 在 DWM 刷新率上跑。禁止 `SetWindowPos` 改子窗尺寸冒充占用过渡。
> **v1.68 变更（占用 spatial-panel）**：HWND fill↔contain 曾走壳内 300ms 标准曲线。v1.69 改为 DComp clip 动画。禁止 CSS 占用过渡。
>
> **v1.67 变更（HWND 占用卡片）**：舞台列不再套 YoPanel。WebView 只留透明洞报 avail；可见卡片是 HWND（surface + hairline + radius）。会话中 HWND contain，左右边框贴合画面；idle 铺满 avail。禁止 CSS 占用过渡。
>
> **v1.66 变更（HWND contain，舞台面板稳定）**：曾用舞台 `YoPanel` 铺满列、HWND 在面板内 contain。实机：YoPanel 外框不跟画面走。v1.67 撤回舞台 YoPanel。
>
> **v1.65 变更（稳定舞台面板）**：内容区三栏都是 `YoPanel`。曾让 HWND 铺满面板、画面只在 HWND 内 contain；v1.66 撤回为 HWND contain，避免左右边框不再变化。
>
> **v1.64 变更（壳独占占用）**：UI 只报 `.yohu-mirror__avail` 客户区物理矩形 + 会话旗标。曾由壳把 HWND contain/fill；v1.65 改为 HWND 始终铺满面板。删除配方 `mirror-frame`。禁止 CSS 占用宽高过渡、禁止 HWND lerp、禁止运行时 UI `containInZone`。
>
> **v1.63 变更（占用盒 spatial-panel）**：avail↔hug 外框宽高曾走配方 `mirror-frame`（`var(--yohu-motion-spatial-panel)`，px↔px）。v1.64 撤回：占用瞬时由壳 contain/fill，禁止 CSS 占用过渡。
>
> **v1.62 变更（停止后外框回可用区）**：idle/failed 曾由 UI 把盒拉回可用区；starting/live 用上次编码尺寸 hug。v1.64 起 idle/failed/unbound 由壳铺满 avail，会话中壳 contain；UI 不再 hug。
>
> **v1.61 变更（投屏单 contain 盒）**：曾由 UI `containInZone` 写出 hug 盒、`mirror.layout` 报该盒、壳禁止再 contain。v1.64 撤回：avail 只从 UI 来，contain 在壳。面板内全屏只藏操作栏/功能栏，页眉可点，Esc 退出。禁止 `fixed inset 0`、禁止 HWND lerp。
>
> **v1.60 变更（投屏缩放 occupancy）**：曾禁止 hug、HWND 单独 contain；v1.61 撤回双头几何。
>
> **v1.59 变更（投屏外框与铬层）**：停/开保留上次编码尺寸，面板外框不拆。HWND 内缩 hairline，YoPanel 描边和 XS 阴影画在 WebView。禁止 transition 宽高。
>
> **v1.58 变更（投屏启动不闪）**：`mirror/state=live` 带上宽高后，加载态 HWND 与铬层 CSS 同时 contain；禁止 Loading 清零画面尺寸导致出画瞬间从铺满跳到贴合。
>
> **v1.57 变更（设备状态统一）**：目录与运行时状态分流（ADR-v6-025）。设备栏次行展示 Android 版本/电量；投屏深浅色读 `DeviceSession.deviceStatuses`，禁止页面 2s 轮询。
>
> **v1.56 变更（设备深浅色）**：月亮/太阳同一操作位读 **连接设备** 当前界面；点击 `device.setNightMode`。不是工作台 `theme`。亮度±仍走设备亮度键。v1.57 起数据源改为 Hub，不再 `device.nightMode`。
>
> **v1.55 变更（设备操作栏主题/亮度）**：月亮/太阳曾误接到工作台 theme；v1.56 改为设备 uimode。亮度±用控制中心太阳符号，走设备 `KEYCODE_BRIGHTNESS_*`。
>
> **v1.55 变更（YoUI 列拖拽）**：列宽升成三层：`col-model`（clamp/轨道）→ `col-resize`（startX 重算绝对宽）→ `YoColResizer`（`separator` + valuemin/now + 键盘）/ `YoColHeader` / `YoColRow`。模块只 `setColWidth(key, px)`。拖时 `html[data-yohu-col-resizing]` 锁光标并禁选区。禁止模块再累加 delta。

> **v1.54 变更（投屏 HWND 子窗）**：画面 HWND 改为主窗 `WS_CHILD`。JS 只报可用区客户区矩形（铬层 insets）；壳 contain。禁止 `screenX` 跟窗。
>
> **v1.53 变更（工作台主窗最小）**：`--yohu-layout-window-min-w/h` 改为 **1024×768**（`Layout.WindowMin*` 与 `tauri.conf.json` `minWidth`/`minHeight` 同值）。竖屏 contain 短边保 ≥280 CSS，避免 980×560 把画面挤成邮票。鸿蒙 **360×240 只用于独立子窗/对话框**，禁止套到主窗。
>
> **v1.53 变更（日志列宽与文本选区）**：日志表头改走 `YoColHeader`（元数据列可拖宽，消息列吃剩余）。清单关闭 VirtualList 行多选，`user-select: text`；复制优先原生选区，无选区时右键复制该行。Ctrl+A 选中当前渲染出行。

> **v1.52 变更（投屏 layout）**：contain 即时贴合，删除 `yohu-recipe-mirror-frame`（CSS 过渡宽高会把舞台塌成 1px）。可用区改 grid 定高。

> **v1.51 变更（投屏默认可操作）**：投屏默认打开控制通道。页眉最右「仅显示」切换只看/可操作。导航键从右侧设置栏挪到设置栏左侧设备操作栏（宽 `--yohu-layout-mirror-ops`，鸿蒙符号图标钮）。HWND 圆角走 DirectComposition（禁止 `SetWindowRgn` + flip）。切回投屏复用上次 contain，避免 100%→贴合挤压。
>
> **v1.49 变更（投屏协议与状态栏 fps）**：投屏「档位」改为「投屏协议」（USB / 无线），去掉自定义。实测 fps 进状态栏右槽（模块 `Status`），不盖画面。选项「原始」不加括号说明。
>
> **v1.48 变更（日志面板常驻）**：显示面板 append-only。只在重新开始采集或清空时冲刷。掉线 / 无输出 / 停采 / 包名 PID 重绑不得清空已画出的行。过滤走 rebuild（已画仍匹配 ∪ 镜像命中）；未跟滚只补到 `frozenThroughSeq`。
>
> **v1.47 变更（日志可见区不冲刷）**：跟滚恢复只按 seq 补洞，过滤变更才整表重建。System 无过滤时镜像为空不得清空已画出的行。同窗口 adopt 续采保留可见区。空闲后不得落到「等待设备输出」并把旧行冲掉。
>
> **v1.46 变更（日志级别色单源）**：logcat 色值只走 `--yohu-level-*`（`LogLevelLight/Dark`）。行 `data-level` 写入 `--yohu-log-ink`；左条、级别字、Tag 共用 ink。Error 消息同色；Fatal 字母反色块，Tag/左条用 `--yohu-level-f-bg`。删除 View `LEVEL_SUFFIX` 与 `--level/--bar` 双 class。`--yohu-tag` 仍是徽章语义色，不是 logcat Tag。
>
> **v1.45 变更（Select 触发钮 min-width）**：`YoSelect` 最小宽写在触发钮上，禁止写在根节点。短文案 hug 时根比按钮宽、按钮靠左，表单行右侧对不齐（设置「外观」主题/密度暴露）。文案 `flex: 1` 让箭头贴触发钮右缘。
>
> **v1.44 变更（表单行 YoFormRow）**：新增 `YoFormRow` 为设置/表单项默认排布。左侧标题信息（标题行：标题 + 备注水平相邻；副标题在下）与右侧控件两列垂直居中；说明不再独占下一行。设置页只填内容，禁止页面自写一行 flex。
>
> **v1.43 变更（投屏右侧功能栏）**：投屏页画面与控件分栏。质量 / 通道 / 导航从页眉 extra 挪到画面右侧功能栏（宽 `--yohu-layout-preview`）。页眉主行只留会话操作（开始/停止、暂停、截图、全屏）。禁止把应用模块导航做成右侧栏。
>
> **v1.42 变更（区域加载 YoLoading）**：新增 `YoLoading`（环 + 标题/描述，`role=status`）。控件内加载仍走 `YoButton` / `YoIconButton` 的 `loading`；区域/页面等待必须走 `YoLoading`，禁止模块自写 spinner。投屏启动与等待首帧由 HWND chrome 绘制（ADR-v6-026），不再用 `YoLoading` 盖舞台。
>
> **v1.41 变更（投屏页眉分组）**：投屏 `YoChrome` 主行只留开始/停止、暂停、截图、全屏。质量（长边/码率/帧率）、通道（只读/强制转发）、导航键进次行分组，禁止再把下拉和导航键平铺进 extra 一行。
>
> **v1.40 变更（设备栏选中滑块过冲）**：`YoIndicator` fill 宿主 `overflow-x: hidden`，裁切软弹簧宽过冲。设备列表宿主只 `overflow: hidden`；项滚动走内层 scroller（`overflow-x: hidden` + `overflow-y: auto`）。禁止在滑块宿主上写 `overflow: auto`——双轴 auto 会在 Windows 画出横竖条并互相锁死（同 v1.37）。
>
> **v1.39 变更（页眉选中设备名）**：终端 / 文件 / 日志 / 投屏 `YoChrome` 标题后统一展示选中设备名（`deviceLabel`，中性徽章）。数据链：`DeviceInfo.model` → domain `device_display_name` → `DeviceSession.selectedLabel`。一台用型号（无型号回退 serial）；终端多台「首台名 等 n 台」；无选中不显示。设置不展示。禁止模块自拼 serial 或再扫目录取型号。
>
> **v1.38 变更（应用身份与数据目录）**：展示名 / 版本 / 图标 / LocalAppData 目录走 `system.info.identity` + `paths`（protocol 常量单源）。标题栏用应用位图（`YoTitleBar.logoSrc`），不用终端字形冒充品牌。设置页新增「关于」。状态栏版本禁止写死。数据目录说明写清 `data/` 与固定的 `settings/`、`logs/` 分层。
>
> **v1.37 变更（Select 浮层 hug）**：下拉菜单铬层只负责落点（`popover-place`）；内容 hug。`min-width` = 触发钮，禁止锁死 `width`。默认 `overflow: hidden`；仅内容高于可用空间才 `overflow-y: auto`，横向永远 hidden——`overflow-y: auto` 会把 `overflow-x` 算成 auto，Windows 画出底部「宽度调整条」。选中/键盘索引在 `select-model.ts`。
>
> **v1.36 变更（设置项控件靠右）**：设置表单项统一「标签+生效徽章靠左、功能控件靠右 hug」。日志显示列的 `YoCheckbox` 组走同一控件槽，禁止整行左起铺开；说明文字仍独占下一行。
>
> **v1.35 变更（设置注入会话）**：应用设置与设备同一条链。`settingsStore` 是唯一 UI 投影；`AppLayout` 经 `DeviceSession.settings` 注入模块。日志显示列 / 导出走注入快照。`buffer_capacity` 仍由日志 store 投影（采集活过视图）；`settings/changed` 控制面必达。
>
> **v1.34 变更（日志显示列）**：设置项 `log_display_columns`（立即生效）控制清单表头与行显示哪些元数据列（时间 / UID / PID / TID / 级别 / Tag）。消息列始终在。缺字段视为开启。轨道按可见列内联写入，禁止在 CSS 写死七列。
>
> **v1.33 变更（日志固定表头）**：日志清单表头钉在 `YoVirtualList` 外（`flex-shrink: 0` + `--yohu-row-height-header`），与行共用 `.yohu-logs__cols` 定宽轨道。无排序/拖宽，不走 `YoColHeader`。级别列改为 `4ch` 以容纳「级别」文案。表头与清单背板 `--yohu-canvas`。
>
> **v1.32 变更（右键菜单宿主）**：菜单引擎收口到 `@yohu/ui` `context-menu/`（`defineContextMenu` / `openContextMenu` / `YoContextMenuHost`）。壳只挂一份 Host。模块场景表在各自 `menu.ts`。禁止 View 自挂 `YoContextMenu`。详见 `右键菜单-v6.md`。
>
> **v1.31 变更（多选选中片邻接圆角）**：连续选中行合成一块圆角矩形。代数 `adjacentJoin`（solo/start/middle/end）；class `--sel-start/mid/end` 削平邻接圆角，并用选中色补 hairline。`YoVirtualList` 行间 hairline 单源。禁止模块再写行分割线或选中圆角。日志列改为定宽 grid：`[时间 18ch] [UID 10ch] [PID 6ch] [TID 6ch] [级别 2ch] [Tag 24ch] [消息]`（禁止 max-width 导致消息错位）。`threadtime,uid` 的 UID 为数字或名；解析失败整行通栏，禁止画 `0 ?` 假列。
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
> **v1.20 变更（画布卡片单源）**：模块分区（终端库/结果、文件清单/预览/传输、日志会话、投屏占位、设置分组）一律 `YoPanel`。铬 = surface + radius-md + hairline 描边 + XS 阴影；pane 内部裁切、阴影留在外壳。禁止模块 CSS 再铺 `surface` + `radius-md`。
>
> **v1.19 变更（页眉与内容区同缘）**：模块必须单根页壳（禁止 fragment 把 `YoChrome` 与内容并列交给 presence）。效率型/占位模块页垫走 `YoPage`；设置页页眉不进滚动容器，标题与分组卡片共用 `--yohu-layout-page-margin`。
>
> **v1.18 变更（三键顺序）**：窗口三键从左到右为最小化、最大化（或还原）、关闭（跟 Windows 标题栏习惯，不跟鸿蒙 max-min-close）。
>
> **v1.17 变更（侧栏分割线）**：去掉标题栏底部分割线；侧栏展开时在导航与内容区之间拉 hairline（`--yohu-border`），收起侧栏时不画。
>
> **v1.16 变更（窗口铬贴合）**：侧栏钮与三键等宽 48vp、贴窗口右缘，热区铺满栏高（无内边距）。关闭悬停铺满该键。
>
> **v1.15 变更（窗口铬 Compact）**：标题栏只承担窗口铬后，高度走 HarmonyOS 电脑 Compact **40vp**（不再用 Default 56vp）。三键去圆形底板、键间距收进热区，竖条宽 **48vp**。侧栏钮为正方形（边长=标题栏高），不跟三键抢宽度。
>
> **v1.13 变更（通铺+分区）**：窗口 canvas 通铺（内容/状态栏不拉结构分割线）。模块分区恢复 `radius-md` 卡片，靠 surface 与 12vp 间距成组，不描外边框。分割线只留必要处：侧栏与内容区、页签指示轨、表头/列、路径栏对清单、数据行、对话框头尾、控件描边。文件预览为独立分区，不嵌在清单卡片内。
>
> **v1.12 变更（PC 通栏+贴边）**：模块工具栏经 `YoChrome` 传送到 `YoTitleBar` 中区（HarmonyOS 窗口框架：工具栏与标题栏结合）。侧栏可收起为抽屉。设置/投屏一级标题进标题栏。控件补 leading token。
>
> **v1.11 变更（PC 排版）**：根节点正文 14 / 行高 1.55（不再吃浏览器 16px）；补 Caption_M≥10、Subtitle_M、行高 tight/ui/data、字重 Light；排版工具类 `.yohu-type-*`。效率型内容区贴边（通栏下方不再套 12vp 页垫）。对话框 Title_S Bold + PC 小圆角，去掉误用的窗口最小 360×240。模块栏标题降为 Subtitle Bold。设置页 Title_S Bold + PC 40vp 边距。
>
> **v1.10 变更（分段按钮）**：新增 `YoSegmentedButton`（对齐 SegmentButtonV2）。默认 `tab`：灰背板 + **白选择块** + `radius-xl` 32vp + `--yohu-shadow-xs` + 主色 Medium 字；`capsule` 才是强调色块。选择块按 item 实测盒滑动。页签栏仍走 `YoTabs`。日志「划分」用默认 tab。
>
> **v1.9 变更（选中单源清扫）**：删除死 dual class（`*--selected` / 列表 `*--active`，Tabs 下划线 `--active` 除外）。语义色逃生统一 `.yohu-badge` / `.yohu-tone`。宿主禁止自绘底盖住选中片。面包屑祖先次要色、当前墨色（不是全段 accent）。范围芯片改 `YoBadge`。
>
> **v1.8 变更（选中单源）**：侧栏 / 命令树 / 命令管理 / 下拉 / 虚拟列表共用同一配方：`--yohu-state-selected` = 品牌实底，`--yohu-state-selected-fg` = 反白，`--yohu-ripple-inset: 0`。删除表面自写选中字色与侧栏特判、删除 `AccentSofter`。距背板只靠容器 padding。
>
> **v1.7 变更（鸿蒙 PC 默认）**：`:root` = comfortable（正文 14 / 控件 32 / 数据行 26）；`[data-density=compact]` 才是产线收敛。新安装与缺 `density` 字段均 `comfortable`。窗口默认 1200×800。对话框弱中性遮罩 + 获焦/失焦阴影，最小 360×240、最大宽 400；Toast ≤3s / 最大 400；按钮最大 448；菜单最小 224。动效补 150/200/400ms。
>
> **v1.6 变更（官方色板）**：`@yohu/ui` Primitive 层改为 HarmonyOS NEXT 系统 Token 原值（宇宙蓝 `#0A59F7` / `#317AF7`、雪域灰 `#F1F3F5`、文本四档 90/60/40/20%、warning/alert/confirm、interactive 5/10/20%）。不再为 WCAG 4.5 改写语义色；正文仍按鸿蒙 §1.6 门禁（浅 4.5:1 / 深 5:1）。布局补齐 PC 窗口默认 1200×800、页边距 40vp、断点 600/840。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。
>
> **v1.2 变更（底向上布局）**：设备数徽章紧跟「设备」标题；`YoIconButton.loading` 走 `--yohu-dur-loop` 旋转；设置页两列网格 + 页面滚动（面板不裁切）；文件管理改为资源管理器四列 + 可收起预览 + `YoContextMenu`/`YoFileIcon`；命令管理三栏；日志采集从开始时刻清空缓冲并出流。
>
> **v1.3 变更（交互态架构）**：公开组件统一 `Yo*` 标注（禁止 `Y*`）；CSS/token 命名空间保持 `yohu-*`。补齐交互态 / ripple / 焦点 / 布局 token；列表·树·菜单·导航·命令管理共用 `.yohu-interactive` 选中片（`radius-sm` + `inset space-xs`），禁止各表面自写选中底与裸圆角。圆角阶梯补 `2xs`/`full`/`pill`；间距补 `2xs`。纪律 lint 拦截裸 `border-radius`。
>
> **v1.4 变更（token 单源闭环）**：`theme.css` 由 `tokens/emit-theme.ts` 从 TS 常量排出（契约测试强制磁盘文件一致）；包导出 `@yohu/ui/theme.css` 绑定 `theme + states`。协议 `Theme` 增加 `system` 且默认跟随系统（P7）。选中填充只用 `.yohu-interactive--selected`（不用 `aria-selected`，以免 Tabs 下划线被画成实底）。焦点环补 `.yohu-focus-host`（焦点在内部控件时）。`YoCheckbox` 改原生 `input[type=checkbox]`。
>
> **v1.5 变更（选中片几何）**：`--yohu-ripple-inset` 从四边 `space-xs` 改为 `0 var(--yohu-space-xs)`。依据 Material 3 `DropdownMenuSelectableItemPadding = 4dp` 仅横向、纵向铺满 Surface；HarmonyOS「距背板 4vp」指容器边距而非行内再削一圈。矮行（下拉/菜单/日志）选中片与行高对齐。`YoSelect` 选项 `min-height: control-height`，与 `YoContextMenu` 一致。

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
Component（组件级：--yohu-state-* / --yohu-level-* / --yohu-ripple-* / --yohu-focus-*，唯一被组件消费）
```

- 组件与模块 CSS **只允许引用 Semantic/Component 层**；Primitive 仅在 tokens 内出现。
- 主题切换 = 切换 Semantic 层变量（`[data-theme=light|dark]`），零运行时成本。用户偏好 `data-theme-pref` 可为 `system`（跟随 `prefers-color-scheme`）。`theme.css` 由 `emit-theme.ts` 从 TS 常量生成，禁止手改。
- 纪律检查脚本（`scripts/check-ui-tokens.mjs`）强制：组件外零硬编码色值/字号/动效时长/裸圆角。

### 2.0 组件标注

- **公开组件名**一律 `Yo` 前缀：`YoButton`、`YoVirtualList`、`YoTabs`…。禁止 `YButton` 这类单字母前缀。
- **CSS 类与 CSS 变量**保持产品命名空间 `yohu-*`（`.yohu-button`、`--yohu-accent`）。组件名 ≠ 样式前缀。
- 新增组件必须同时：`YoXxx` 导出 + `.yohu-xxx` 样式 + 本文件登记。

### 2.1 色彩系统（HarmonyOS NEXT 官方 Token）

Primitive 层 = 鸿蒙系统 Token 原值（ARGB → CSS `#RRGGBB` / `#RRGGBBAA`），见 `tokens/colors.ts` 的 `Harmony`。深色 `background_primary` 以文档正文为准（黑），不用表内 `#E5E5E5`。

| `--yohu-*` | 鸿蒙 Token | Light | Dark | 用途 |
|------------|------------|-------|------|------|
| `bg-base` | `background_secondary` / 深色 `background_primary` | `#F1F3F5` 雪域灰 | `#000000` | 窗口底色 |
| `surface` | `comp_background_primary` | `#FFFFFF` | `#202224` | 面板/卡片 |
| `surface-2` | `background_tertiary` / 深色 `background_fourth` | `#E5E5EA` | `#2E3033` | 次级表面（深色随层级抬升明度） |
| `fg` / `fg-2` / `fg-3` / `fg-4` | `font_primary`…`fourth` | 黑 90/60/40/20% | 白 90/60/40/20% | 文本四级 |
| `fg-on` | `font_on_primary` | `#FFFFFF` | `#FFFFFF` | 强调底上的反色字 |
| `border` | `comp_divider` | 黑 20% | 白 20% | 常规边框/分割 |
| `border-strong` | `font_tertiary` | 黑 40% | 白 40% | 强调边框 |
| `accent` | `brand` | `#0A59F7` | `#317AF7` | 宇宙蓝 |
| `accent-soft` | `comp_emphasize_secondary` / `interactive_select` | 宇宙蓝 20% | 宇宙蓝 20% | 选中实底 |
| `accent-hover` / `pressed` | brand + `interactive` 5% / 10% | 叠黑 | 叠白 | 实心主按钮 |
| `success` | `confirm` | `#64BB5C` | `#5BA854` | 在线/通过（填充优先） |
| `warn` | `alert` | `#ED6F21` | `#DB6B42` | 二级警示/执行中 |
| `error` | `warning` | `#E84026` | `#D94838` | 一级警示/失败 |
| `offline` | `font_tertiary` | 黑 40% | 白 40% | 离线点 |
| `focus-ring` | `icon_sub_emphasize` | 宇宙蓝 40% | 宇宙蓝 40% | 键盘焦点环 |
| `disabled` | `background_fourth` | `#D1D1D6` | `#2E3033` | 禁用底 |

**logcat 级别板（复用官方语义色，无独立鸿蒙级别 Token）：**

| 级别 | 引用 | Light | Dark |
|------|------|-------|------|
| `--yohu-level-v` | `font_tertiary` | 黑 40% | 白 40% |
| `--yohu-level-d` | `brand` | `#0A59F7` | `#317AF7` |
| `--yohu-level-i` | `confirm` | `#64BB5C` | `#5BA854` |
| `--yohu-level-w` | `alert` | `#ED6F21` | `#DB6B42` |
| `--yohu-level-e` | `warning` | `#E84026` | `#D94838` |
| `--yohu-level-f` | `font_on` on `warning` | `#FFFFFF` on `#E84026` | `#FFFFFF` on `#D94838` |

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif`
- 数据/等宽：`"Cascadia Mono", Consolas, "Courier New", monospace`（`font-variant-numeric: tabular-nums`）
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
| `--yohu-row-height-header` | 28 | 32 | 表头 |
| `--yohu-segment-single` | 28 | 40 | 分段按钮单行（V2 `singleline_background_height` / V1 最小 28） |
| `--yohu-segment-hybrid` | 44 | 56 | 分段按钮图文（V2 `doubleline_background_height`） |
| `--yohu-title-bar-height` | 40 | 40 | 窗口铬（页眉回内容区后走 HarmonyOS Compact；不再随内容密度抬到 56） |

布局常量（不随密度变）：`--yohu-layout-shell-nav: 232px`、`--yohu-layout-sidebar: 280px`、`--yohu-layout-preview: 240px`、`--yohu-layout-settings-max: 920px`、`--yohu-layout-output-max: 260px`、`--yohu-layout-hit-splitter: 6px`、`--yohu-layout-gutter: 16px`、`--yohu-layout-grid-max: 2220px`、`--yohu-layout-page-inset` / `--yohu-layout-page-gap`（数值 = `Spacing.Md` 12vp，经 `YoPage` 消费）、`--yohu-layout-chrome-pad`（数值 = `Spacing.Sm` 8vp，经 `YoChrome` 消费）。

HarmonyOS 电脑/大屏补齐：`--yohu-layout-window-default-w/h: 1200×800`、**工作台主窗** `--yohu-layout-window-min-w/h: 1024×768`（与 Tauri `minWidth`/`minHeight` 同值；保证投屏竖屏 contain 短边 ≥280 CSS。鸿蒙对话框/子窗最小 360×240 **不**套主窗）、`--yohu-layout-page-margin: 40px`（PC 左右边距，设置页用）、`--yohu-layout-breakpoint-split: 600`（分栏）、`--yohu-layout-breakpoint-side: 840`（侧边页签）、`--yohu-layout-button-max: 448`、`--yohu-layout-dialog-max: 400`。数量约束 `LayoutLimits`：标题栏右侧 ≤3 图标、C 栏工具栏 ≤6、侧栏 ≤窗口宽 40%。间距补 `space-2xl=32`、`space-3xl=40`（Padding_level16/20）。控件行高仍按 P1 产线密度收敛，不改用手机 48vp 列表行。

效率型工作台：内容区从窗口标题栏下方**贴边**排布（`.yohu-layout__content` padding 0）；模块页眉与分区的内边距由 `YoPage` 承担（`page-inset` / `page-gap`）。设置页才用 `page-margin` 40vp。

描边宽：`--yohu-stroke-hairline: 1px`、`--yohu-stroke-accent: 2px`（焦点/左边条/Tab 指示）、`--yohu-stroke-emphasis: 3px`（级别条/结果卡强调）。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yohu-dur-fast: 100ms`（hover/按下）、`--yohu-dur-small: 150ms`（小范围）、`--yohu-dur-normal: 160ms`（面板/下拉）、`--yohu-dur-local: 200ms`（局部删除）、`--yohu-dur-slow: 300ms`（页面级）、`--yohu-dur-enter: 350ms`（入场）、`--yohu-dur-progress: 400ms`（进度最短感知）、`--yohu-dur-toast: 3s`；循环指示：`--yohu-dur-loop: 800ms`、`--yohu-dur-loop-slow: 1.2s`
- 缓动：`--yohu-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yohu-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yohu-ease-loop: ease-in-out`（循环）；**出场加速曲线与语义 MotionSpec 见《动画系统-v6.md》**（ADR-v6-017）
- JS 消费侧经 `@yohu/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 完整行为（Presence / Collapse / 侧栏 `rail` / 配方目录 / 虚拟列表禁动）以 `docs/architecture/动画系统-v6.md` 为准，本节只登记 token 数字
- 用途克制：下拉展开/淡入淡出；**日志列表选中片无过渡**（性能优先，`.yohu-interactive` 默认无 transition）
- **加载循环**：控件内加载走 `YoButton.loading` / `YoIconButton.loading`（`--yohu-dur-loop` 线性旋转，期间 `disabled` + `aria-busy`）。区域/页面等待走 `YoLoading`（环 + 标题/描述，`role=status`；覆盖下层时加 `cover`）。设备栏刷新、文件刷新按钮等仍走 IconButton；目录首载、日志启动/等待出流走 `YoLoading`。投屏启动与等待首帧走 HWND chrome。禁止模块自写 spinner。

### 2.5 图标

- **应用品牌图标**：`app/yohu-adbtools/icons/icon.png`（1024，圆角矩形底板 + 透明四角，宇宙蓝）+ `icon.ico`。标题栏 / 关于 / favicon 走 `APP_ICON_SRC`（`/app-icon.png`），经 `YoTitleBar.logoSrc`；展示时不再二次裁圆角。禁止用模块字形（如 `terminal`）冒充应用图标。
- **唯一入口**：`@yohu/ui` 的 `<Icon name size>`；模块注册表 `icon: IconName`；工具栏用 `YoIconButton`（内部仍走 `Icon`）。
- **文件类型图标**：`<YoFileIcon name kind size>`（`file-icons.tsx` 工厂）。模块禁止内联文件 SVG；色值仅允许出现在该文件（纪律脚本豁免）。
- **禁止**：模块内再写一份 SVG、emoji 当图标、静态对象缓存 JSX 节点。
- **风格**：24×24 viewBox、描边 2、`currentColor`；`play`/`pause` 实心。新增通用图标只改 `icons.tsx` 的 `ICON_GLYPHS`。

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

`radius.ts` ↔ `theme.css` 契约测试强制一致。组件 CSS 禁止 `border-radius: <裸值>`。

### 2.7 交互态与选中 Ripple（单源）

列表行、树行、下拉选项、菜单项、导航项、命令管理项、表头排序 **共用同一配方**，禁止各文件再写 `background: accent-soft` / `nav-hover`。表头排序钮铺满 `YoColHeader` 内容区；悬浮片 `--yohu-col-header-overlay-inset: 0`、圆角 `none`（铺满矩形列格）；文案边距 `--yohu-col-header-content-pad` 只写在 `.yohu-col-header__label`，禁止写在 `.yohu-interactive` 宿主。禁止在 `.yohu-files__cols` 上用左右 padding 把首列轨道推离左缘。

**状态色（Component 层）**

| Token | 算法 | 用途 |
|-------|------|------|
| `--yohu-state-hover` | `interactive_hover`：中性 5%（浅黑/深白） | 悬浮 / 键盘活动 |
| `--yohu-state-pressed` | `interactive_pressed`：中性 10% | 按压 |
| `--yohu-state-selected` | `interactive_active` = `var(--yohu-accent)` | 选中实底（侧栏/树/命令/列表同一源） |
| `--yohu-state-selected-fg` | `font_on_primary` = `var(--yohu-fg-on)` | 选中行文字/图标 |
| `--yohu-accent-soft` | `comp_emphasize_secondary`（品牌 20%） | 徽章/范围芯片，禁止当选中底 |

**几何（可在子树覆盖，不可另起炉灶）**

| Token | 默认 | 含义 |
|-------|------|------|
| `--yohu-ripple-radius` | `var(--yohu-radius-sm)` | 选中片圆角 |
| `--yohu-ripple-inset` | `0` | 铺满行盒；距背板 = 容器 padding |

**载体**：`tokens/states.css` 的 `.yohu-interactive`。选中只用 `.yohu-interactive--selected`（**不要**用 `[aria-selected]` 上填充：`YoTabs` 的 `aria-selected` 表示下划线激活，不是实底选中）。键盘活动用 `.yohu-interactive--active`。禁止 Tree/Select/命令管理/壳再写选中字色。单选实底由 `YoIndicator` 在项之间滑动；虚拟列表与多选块仍是每项 `::before`。

- 实心底控件（`YoButton` / `YoCheckbox` / `YoSegmentedButton`）走变体色 + `--yohu-accent-hover/pressed`，不走列表 ripple。
- `YoSegmentedButton` 对齐 SegmentButtonV2：默认 tab 白选择块（`surface` + `shadow-xs` + `fg`），capsule 才用 accent + `fg-on`。背板/选择块 `radius-xl`（32vp）。不作一级导航、不承载删除/添加。
- `YoTabs` 激活指示是 `YoIndicator` underline（底边 `--yohu-stroke-accent` 滑块），hover 仍走 ripple；不要把 Tab 激活画成选中填充。
- 语义色逃生：`.yohu-badge`（徽章）与 `.yohu-tone`（日志级别 / 检索高亮等）在选中行内保持自身色。
- 选中宿主必须透明底：自绘 `background` 会盖住 `z-index: -1` 的选中片。
- 禁止再挂表面 dual class（`yohu-tree__row--selected` / `yohu-select__option--selected` / `yohu-*-item--active`）。键盘高亮仍用 `.yohu-interactive--active`。
- **多选邻接圆角（VirtualList / 文件清单 / 日志）**：`adjacentJoin` 判断上下行是否同属选中块。`--sel-start` 削底角、`--sel-mid` 四角皆直、`--sel-end` 削顶角；孤立选中仍四角 `--yohu-ripple-radius`。邻接缝的 hairline 用 `--yohu-state-selected` 补色。禁止模块再写一套选中圆角。

**焦点环（单源）**

- `.yohu-focus-ring`：`outline: var(--yohu-focus-width) solid var(--yohu-focus-ring)` + `outline-offset: var(--yohu-focus-offset)`
- `.yohu-focus-ring--inset`：offset 用 `--yohu-focus-offset-inset`
- `.yohu-focus-host` / `--inset`：焦点在内部控件时（`focus-within:has(:focus-visible)`），用于 `YoTextField` / `YoCheckbox`
- 禁止控件再写 `outline: 2px solid var(--yohu-accent)` 或手写同一套 outline

---

## 3. 壳（Shell）规范

```
┌────────────────────────────────────────────────────────────┐
│ TitleBar（应用图标+应用名 │ 留白 │ 侧栏钮 │ 三键）                   │
├──────────────────┬─────────────────────────────────────────┤
│ 设备栏            │  模块标题区        功能栏（执行/清屏/…） │
│ 在线设备          │ ───────────────────────────────────── │
│ 列表行            │  ┌ 圆角分区 ┐  ┌ 圆角分区 ┐             │
│ 型号/串号         │  │ surface  │  │ surface  │             │
│ 模块导航          │  └──────────┘  └──────────┘             │
│                   │           canvas 通铺                   │
│ 版本 · 设备 · 任务（状态栏，无顶线）                            │
└────────────────────────────────────────────────────────────┘
```

- **设备栏**：标题行 = 折叠钮 +「设备」+ 数量徽章（徽章紧跟标题，不推到最右）+ 刷新（`YoIconButton loading` 旋转）；设备行（型号一行 + serial 等宽一行 + 可选运行时次行 Android/电量，主次上下间隔 2vp + 在线点 + 未授权徽章，无白卡片）；空态给引导文案；选中只加 `.yohu-interactive--selected`（高亮 = 当前模块解析后的执行目标）。单选实底由 `YoIndicator` fill 在 list 宿主内滑动，宿主 `overflow: hidden` 裁切弹簧过冲；项滚动在 `__scroller`（横向 hidden、纵向 auto）。禁止把 `overflow: auto` 写在滑块宿主上。MultiOptional（终端）：单击替换勾选，Ctrl/Meta+click 加减选；未勾选回退全局焦点，不把全部在线设备当作已选。运行时字段只读壳 `deviceStore.statuses`，禁止栏内轮询。
- **导航**：图标 16px（`<Icon>` 单源，currentColor）+ 标题；激活只加 `.yohu-interactive--selected`；Planned 项「开发中」胶囊徽章。图标节点每次渲染新建。设备栏与导航共用 `--yohu-layout-rail-inset`。侧栏可整栏收起（标题栏 `sidebar` 抽屉钮）。
- **模块页眉**：在右侧内容区顶部（`YoChrome`）。左侧为功能标题区（Subtitle Bold）+ 选中设备名（`deviceLabel` 中性徽章，文案来自 `DeviceSession.selectedLabel`），右侧为功能栏；与窗口标题栏分离，不挤进中区。无操作的模块（设置）只显示标题，但标题行高度仍是 `--yohu-control-height`（与有按钮的页同一占位）。底垫 `--yohu-layout-chrome-pad`。页眉是页壳的第一子节点（`flex: 0 0 auto`），禁止与内容区作为 fragment 兄弟交给模块转场。
- **模块页壳**：效率型与占位模块（终端/文件/日志/投屏）根节点一律 `YoPage`（`.yohu-page`：`padding: page-inset`、`gap: page-gap`）。`YoChrome` 是第一子节点。内容进 `YoPanel`（`variant=pane` 撑满）。禁止模块再写一套页垫。空态文案不得复写页眉模块名。设置页分组走 `YoPanel` 默认 card，边距仍是 `page-margin`。
- **通铺与分区**：窗口 `--yohu-canvas` 通铺；标题栏与工作区、状态栏不拉结构分割线。侧栏展开时与内容区之间画 hairline。模块分区 = `YoPanel`（surface + radius-md + hairline 描边 + XS 阴影）。分割线还用于：页签指示、表头/列、数据行、对话框头尾、输入类控件。路径栏与清单靠 canvas 分层，不另拉线。
- **状态栏**：左「展示名 v版本」（`system.info.identity`）/ 中留白 / 右「设备 · 任务 · 状态」；任务悬停显示明细。状态槽由模块 `Status` 贡献（投屏出画后显示实测 fps）。透明贴合 canvas。Caption + leading-tight。
- **对话框**：Title_S Bold；PC 小圆角 `radius-sm`；宽 ≤400、高 ≤90%；**不要**把窗口最小 360×240 套到浮层确认框。
- **启动交接（Windows）**：用户看见的是原生 GDI 小窗，不是 `#yohu-boot`。hydrate 完成且双 rAF 之后卸掉 HTML 画布层，再 `boot.showMain`。主窗一次落到最终矩形但保持隐藏；同屏 Shared overlay 铺满之后才揭内容并淡出；异屏 Exit overlay 结束后才揭主窗。禁止插值 HWND 宽高、禁止 CSS 缩放主窗、禁止 HTML 启动层淡出、禁止第二 WebView splash。
- **快捷键统一表（v6.1 目标）**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 采集操作）→ 会话 Tab（canvas 上）→ `YoPanel` 会话分区（过滤 / **固定表头** + 虚拟列表 / 状态行）。
- 行结构（列对齐，等宽，**定宽 grid 轨道**）：默认 `[时间 144px] [UID 80px] [PID 48px] [TID 48px] [级别 48px] [Tag 192px] [消息 →]`（约原 18/10/6/6/4/24 ch）。UID 来自 `logcat -v threadtime,uid`（数字或 `root`/`shell`/`wifi` 名）。禁止 `max-width` / 不定宽 flex 让消息列左右错位。解析失败（level=`?`）整行消息通栏，禁止画 `0 ?` 假列。级别色：`pipeline.levelKey` → 行 `data-level` → `--yohu-log-ink`（绑定 `--yohu-level-*`）；左条 / 级别字 / Tag 共用 ink。Error 消息同色（`--yohu-level-e`）。Fatal 级别字母反色块（`radius-2xs`，`--yohu-level-f` on `--yohu-level-f-bg`），Tag 与左条用 f-bg。级别、Tag、Error 消息、检索高亮挂 `.yohu-tone`。禁止 View 再写 `LEVEL_SUFFIX` / `--level` / `--bar` class，禁止 Tag 走 `--yohu-accent` 或 `--yohu-tag`。清单关闭行多选，`user-select: text` 只作视觉选区；复制走 `copy.ts`（`data-seq` → `formatLogLine`）。行间 hairline 走 VirtualList 单源。
- **固定表头**：列名钉在滚动区外，与行共用 `.yohu-logs__cols`；高度 `--yohu-row-height-header`；背板 `--yohu-canvas`。表头走 `YoColRow` + `YoColHeader`（无排序；元数据列 `YoColResizer`；消息列 flex 不拖）。轨道字符串一律 `colTrackTemplate` / `logColTemplate`；模块只 `setColWidth(key, px)`，禁止累加 delta。禁止把表头放进虚拟列表行。显示列读壳注入的 `DeviceSession.settings.log_display_columns`（消息始终在）。禁止模块再拉设置命令或把显示列拷进 logStore。
- 信号行（崩溃/ANR）行底色 `--yohu-signal-bg` + 左侧 Error 条；选中时信号底让位给选中片，左条保留。
- 过滤栏：级别含以上 / Tag / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 用 `YoBadge tone=accent`；控件走 `--yohu-control-height`。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）走 `logs.tab` 场景。
- 日志行：右键走 `logs.row`（有选区则按 seq 闭区间复制 `formatLogLine`，否则复制该行）。与 Ctrl+C 同一 `serializeLogCopy`。禁止在本页再挂 `YoContextMenu`。禁止把 `Selection.toString()` 写入剪贴板。
- 新建窗口：设备走 `YoSelect block`（触发钮显示选中设备，菜单独立定位层 Portal；禁止芯片/空触发钮）；划分用 `YoSegmentedButton`（包名 / PID，无左侧标题；高度走 `--yohu-segment-single`）。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；启动采集 / 采集中空 → `YoLoading`；过滤无命中 → 「无匹配日志，调整过滤条件」。
- **采集可见性**：点「开始」新开流时清空 UI 镜像与本窗口面板，core 同步 `ring.clear()`，只展示本流 logcat。同窗口在 core 仍 Live 时点开始是 adopt 续采：保留已画出的行，从环补洞。**新窗口第一次点开始**：`fromSeq=0`，按窗口过滤从当前环补齐（包名窗口开始前打 `ps` 绑 PID），不要从尾 seq 空等下一次输出。失败 toast 出错误。显示面板常驻：设备无输出、掉线、停采都不冲刷。过滤走 rebuild（跟滚全量；未跟滚只到冻结 seq）；跟滚 / PID 重绑只按 seq 补洞。空闲后不得落到「等待设备输出」并把旧行冲掉。
- **导出**：设置项 `export.default_path` / `export.ask_every_time` / `export.write_mode`（覆盖|续写）。

### 4.2 命令终端

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 清屏 / 命令管理）→ 左侧命令库 `YoPanel` + 右侧结果 `YoPanel`（间距 12vp）。页眉不放执行/取消。
- 命令库树：组节点加命令数徽章；点击组行或展开箭头即选中该组；选中/hover 走 `.yohu-interactive`。命令 `title` 为 `adb <具体命令>`，不省略 `adb`。点击叶子命令加入发送队列（需占位符则先填值）。
- **命令管理**：`YoDialog` 定高三栏。列表项同样走 `.yohu-interactive`，禁止自写圆角底。具体命令编辑与展示同一 `formatAdbLine`（始终 `adb <正文>`；落盘仍存正文）。不提供成功/失败正则、输入提示、组内延时、失败中断。
- **结果区**：一次输入一条输出块。`>>>`/`<<<` + 时间钉在首行，多行内容只在内容列换行。流自上而下。新块走 `YoListPresence` 配方 `list` 升起；清屏直切（`exit=false`）。空态 `YoEmptyState` 铺满当前流并居中；出现/消失直切，发送栏开合时跟随 `inline-end` 的高度插值，禁止空态自写 motion。不展示通过/失败徽章。模块功能栏「清屏」只清 UI 结果，不影响命令库。
- **发送栏**：钉在结果面板底部，贴右双轴开合（`yohu-recipe-inline-end`：宽度 compact↔100%，高度 0fr↔1fr）。收起是右下角溢出把手（上+起边 hairline、起-起角 radius-sm）。展开：队列卡片在输入框上方（`YoListPresence` 进出场；名称 + `formatAdbLine` 完整命令 + 移除），输入框右侧水平纸飞机发送；无内容时按钮仍在，变灰禁用。Enter 发送队列与草稿。是否把 `adb` 写入 exec 载荷走设置 `terminal_prepend_adb`（默认关）；展示始终带 `adb`。

### 4.3 文件管理

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 上传/下载/刷新/预览）→ `YoPanel` 资源分区（路径栏 | 四列清单）与独立预览 `YoPanel` 并列 → 有任务时另起传输 `YoPanel`（Presence `rise` 升起；标题栏可点，列表 `YoCollapse recipe=panel`）。
- 四列清单：`YoVirtualList` 选择模式（含 ripple 与多选邻接圆角）。表头走 `YoColRow` + `YoColHeader`（轨道 + 分割线 + 前三列 `YoColResizer`）；排序钮铺满列格，走 `.yohu-interactive`（宿主 padding 0）。列宽走 YoUI `col-model` / `col-resize`，模块只 `setColWidth(key, px)`，禁止累加 delta。悬浮片铺满列矩形（inset 0 / radius-none）；「名称」左缘由首列 `--yohu-col-header-content-pad`（写在 `.yohu-col-header__label`）与行内 `.yohu-files__name` 左垫对齐，不靠行容器左右 padding，也不靠 button 宿主 padding。行间 hairline 走 VirtualList 单源（`--yohu-border`）；表头与清单背板 `--yohu-canvas`（与面板 surface 分层）；选中宿主保持透明。清单视口与日志相同：`overflow: hidden` 给虚拟列表确定高度。禁止模块再写 `.yohu-virtual-list__row` 分割线。
- 面包屑：祖先 `--yohu-fg-2`，当前段 `--yohu-fg` + semibold（不是全段 accent，也不是选中实底）；ripple 圆角覆盖为 `radius-xs`。路径栏与清单之间不拉分割线。
- 预览是独立 `YoPanel`（宽 `--yohu-layout-preview`），不嵌进清单卡片；右键走 `files.list` 场景（新建/下载/复制路径/删除），由壳 `YoContextMenuHost` 呈现。
- 目录首次加载（清单为空且正在读取）走 `YoLoading`；刷新按钮仍走 `YoIconButton.loading`。空目录才是 `YoEmptyState`。

### 4.4 投屏显示

- 与效率型模块同一 `YoPage` + `YoChrome title="投屏显示"` + `deviceLabel`。内容区操作栏 / 质量是 `YoPanel`；舞台列是 `.yohu-mirror__avail` 透明洞（不是 YoPanel）。HWND 按 FramePipe 编码尺寸 contain 并画占用卡片（ADR-v6-027）；idle 铺满 avail。不是编码器 `max_size`，也不是 UI `containInZone`。
- 舞台像素由 HWND 独占（空态/加载/暂停/视频都画在 HWND 上，ADR-v6-026/027）；WebView 只留透明占位上报 avail。禁止 WebView overlay 与 HWND XOR。空态/加载/暂停的文案与颜色在壳内绘制，填充色走 surface token。空态只写终态（未选择设备 / 未开始 / 启动失败），不把模块名再写一遍。Live 不等于已出画：首帧 Present 前舞台保持加载，避免黑屏空等。上次编码尺寸留在 present，`stop` 不清零。占用 fill↔contain 走 DComp clip 动画。禁止 CSS 占用宽高过渡、禁止 UI 运行时 contain。
- 页眉主行 ≤6：开始/停止、暂停画面、截图、面板内全屏、**仅显示**（按下=只看；默认未按=可操作）。**面板内全屏**只藏操作栏与功能栏，舞台吃满页眉以下；页眉「退出全屏」与 Esc 始终可点。禁止 `position:fixed; inset:0` 盖住工作台。**设备操作栏**（宽 `--yohu-layout-mirror-ops`，在画面与设置栏之间，非常驻于全屏）：返回 / Home / 多任务 / 音量± / 电源 / **设备深浅色（月亮=设备当前深色、太阳=浅色，同一钮，读 `deviceStatuses.night`）** / 亮度±，鸿蒙符号 `YoIconButton`。非全屏时导航/音量/电源/亮度在不可操作时禁用，不把栏藏起来以免布局跳动；深浅色钮跟连接设备，不跟工作台 theme，禁止本页轮询 dumpsys。**右侧功能栏**（宽 `--yohu-layout-preview`，`YoPanel`）：**质量**（投屏协议 USB/无线 / 长边 / 码率 / 帧率上限，**下次开始生效**）。禁止再把这些控件放进页眉 extra、设置页或通道开关。禁止把导航键放回设置栏。
- 实测 fps 在状态栏右下角（1s 窗口已 Present 帧），不是画面角标，也不是质量栏的编码器上限。
- 面板贴合：`mirror.layout` 报 `.yohu-mirror__avail` 客户区物理矩形 + 会话旗标。舞台透明洞稳定；HWND 铺满 avail；可见卡片 DComp clip contain。fill↔contain 走 `IDCompositionAnimation`。禁止 `screenX` 跟窗。主窗不得小于 `Layout.WindowMin*`（1024×768），否则竖屏画面会塌成不可读的窄条。

### 4.5 设置

- 页壳不滚动；`YoChrome` 钉在内容区顶部。分组卡片放进 `.yohu-settings__body` 滚动；`YoPanel` 不裁切表单项。
- 页眉与卡片左缘共用 `--yohu-layout-page-margin`（PC 40vp）；页宽 `--yohu-layout-settings-max` 只约束滚动列，不把标题挤进 920 列。
- 表单项走 `YoFormRow`：左侧标题行（标题 + 备注水平相邻，生效徽章进 `note` 槽）+ 其下副标题，右侧功能控件 hug；两列 `align-items: center`。开关 / 数字 / 下拉 / 多选复选进右侧槽。说明文字是副标题，禁止再独占下一行，禁止设置页自写一行 flex。
- 文件位置项（ADB 路径 / 数据目录 / 默认导出路径）统一：只读展示框显示绝对路径 + 「浏览」；展示框宽 ≤ `--yohu-layout-settings-control-max`，超长折叠中间（目录头 ellipsis、末段完整）。空值显示 `system.info` 解析路径。数字/下拉仍走 `YoTextField`/`YoSelect`。
- 投屏协议 / 长边 / 码率 / 帧率只在投屏显示页。设置页「投屏显示」仅保留强制 ADB forward。
- 命令终端：「输入命令默认加上 adb」仅标题 + 开关，无副标题；默认关；立即生效。
- **关于**：末张分组卡片。应用图标（与安装包同源）+ 展示名 + 定位；版本（右侧版本号后跟「检查更新」，无单独更新卡片）/ 标识 / 版权；数据根、设置目录、应用日志只读路径 + 「打开」（`system.openPath`）。禁止再写死版本号。发现新版本后先下载，完成后再确认覆盖安装。
- 日志显示列：多选走 `YoCheckbox`（不是启用开关），进 `YoFormRow` 右侧槽、过窄时组内折行；消息列始终显示、不提供开关。立即生效。
- `YoDialog`：中性 10% 遮罩 + `--yohu-shadow-dialog`（失焦 `-unfocused`）；最大宽 400、高 90%；标题 Title_S Bold；电脑小圆角 `radius-sm`。最小 360×240 仅适用于独立子窗口，不套浮层。
- `YoToast`：描边；最大宽 400；展示 ≤ `--yohu-dur-toast`（3s）。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YoDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `role=dialog aria-modal` |
| YoTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YoSelect | 展开后 ↑/↓ 选项；Enter 选；Esc 关；Portal 上下展开；宽 hug（min=触发钮）；仅超出才纵向滚动 | `aria-haspopup=listbox aria-expanded aria-activedescendant` |
| YoTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中 | `role=tree/treeitem aria-expanded` |
| YoVirtualList | 选择模式：roving tabindex + ↑/↓/Home/End/Enter/Space | 选择模式 `role=listbox/option` + `aria-selected` |
| YoContextMenu | Esc 关闭；点击项执行；点击外部关闭 | `role=menu/menuitem` |
| YoContextMenuHost | 应用根唯一实例；Portal 到 body；同时只开一个场景 | 同 YoContextMenu |
| YoIconButton | 激活执行；`loading` 时不可激活 | `aria-label`（title）+ `aria-busy` |
| YoLoading | 非交互；减动效时环静止 | `role=status aria-busy aria-live=polite` |
| YoFormRow | 非交互容器；左侧标题栈与右侧控件垂直居中 | 无；控件自带 ARIA |
| YoSegmentedButton | ←/→/↑/↓ 循环选中；Home/End 首尾 | `role=radiogroup/radio` + `aria-checked` |

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
