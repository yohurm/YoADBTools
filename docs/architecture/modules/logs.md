# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat（`-v long,uid,year` + 组装器：一条 logd 记录 = 一条 `LogLine`，`msg` 可含硬 `\n`）。头语法只认 AOSP `FORMAT_LONG`：`[ time uid pid:tid L/tag ]`（`uid` 是打印机的 `%5s:`/`%5d:`，与 `pid:tid` 连成 `uid:pid:tid`）。AS `LogcatHeaderParser` 只覆盖无 uid 的 `pid:tid`；本层扩展 `year`/`uid`/时区，TID 支持十六进制（`Integer.decode`）。组装对照 `LogcatMessageAssembler`：系统行不冲刷未闭合记录；仅在有正文时闭合上一条；正文经 `StackTraceExpander` 展开 `... N more`。槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- **时间戳：** 解析边界经 domain `canonicalize_datetime` 收到 `YYYY-MM-DD HH:mm:ss.SSS`（`LogLine.ts` 原文）。清单 / 复制按设置 `log_time_format` 投影（默认 `datetime_millis` = 完整墙钟；可选 `datetime` / `time_millis` / `time`）。导出仍用 `formatLogLine` testdata 原文。禁止再裁成 `MM-DD`
- 过滤：匹配内核在 domain `log_filter` + `@yohu/api` `log-filter`（`testdata/log_filter.json`）。模块 `filter.ts` 只做级别钮 / Tag Chip / 会话形状，并用 `sessionWire` 把会话字段送进 `@yohu/api` 的 `toWireFilter`；导出同一把，模块不再另算 `pidSet`。可见区逐行只走 `matchesWireFilter`，不另写一套级别、Tag 或范围判断。级别字母单源 `log_levels.json` ↔ `LEVELS`。CSS 键 `levelKey` 也在 `@yohu/api`，筛选钮与 Formatter 共用；Formatter 不 import `filter.ts`。`LogFilter.levels` 空 = 不限；非空 = 精确集合，禁止最低含以上。`tag_contains` 按逗号 / 分号 / `|` 拆多针，任一 OrdinalIgnoreCase **精确**命中（OR）；空或仅分隔符 = 不限。空白留在单个针内。无正则。逗号提交后前一针走 `YoChip`（写入盒 flex 行，关闭走库内 `DismissMark` / `.yohu-recipe-dismiss`；禁止 Tag 槽嵌套横条、禁止模块再画关钮）
- **级别钮：** 独立多选走 `YoSegmentedButton` `type=capsule` `multiple` `size=sm`。未选字色 `item.ink=var(--yohu-level-*)`；选中填 `item.fill=var(--yohu-level-*)`。模块禁止自造 Corner+flush Button，禁止点库内部 class。禁止 CSS 再列 V–F 映射
- **清单编辑器（三件套，对照 AS `logcat/messages/`）：** `formatMessages` 批内维护 `previousTag` / `previousPid`（`MessageFormatter`）；`formatMessage` 列序 `TimestampFormat` → `UidFormat`（扩展）→ `ProcessThreadFormat` → `TagFormat` → `AppNameFormat` → `LevelFormat` → 消息。`hideDuplicateTag` / `hideDuplicateApp` 对照 AS（STANDARD 默认关）。空 Tag = `<no-tag>`；FATAL（`F`）级别列显示 `A`。`softWrap` 对照 `MessageFormatter`：关 = `\\n` + headerWidth 空格；开 = 裸 `\\n`。`LogDocument` 的 `append` 延续 duplicate 状态；`reload` / `evict` / `setOptions` 不变。`editor/view` 1 可视行 = 1 文档行。禁止 CSS hang / 表头 `1fr`。Formatter ↛ 显示模块；Document → Formatter。panel 只喂 `ViewRow[]`
- **级别色：** Formatter 写入时只挂 range（`tone` / `box` / `style`），不是第二次 paint，也不是 View if/else。着色、选区、关键字、文档文本全量解耦：Document 每行一个文本节点；`editor/markup-model` 把 range 收成 ink/wash run；`markup-policy` 只命名 `::highlight`；`markup-registry` 把 run 登记到 `CSS.highlights`（无引擎则零操作，禁止 span 回退）；`editor/markup.css` 只给 `::highlight` 上字色。**BACKGROUND 几何**走 `editor/markup-wash`：对照 Logcat `LevelFormat.accumulate(" L ", key)` → `TextAccumulator` `[start,end)` → `DocumentAppender.markupModel.addRangeHighlighter(..., HighlighterTargetArea.EXACT_RANGE)`。Editor 用同一把 `charWidth` 画字和底；Yohu 把 `[from,to)` 写成该行文本节点的 `--yohu-wash-image/size/position`，CSS `1ch` 就是这个节点的字符格。`" L "` 三格等宽、字母在中间格。切窗口只换 Document 与本行 CSS 变量。禁止第二棵 `.yohu-logs__wash`、禁止表头 `chPx` 冒充文档格、禁止量 Range / `getBoundingClientRect`。Blink `::highlight { background }` 是墨水盒，不是编辑器 BACKGROUND，禁止用它冒充级别块。身份在 `@yohu/api` `log-color-scheme` 目录（`log_color_scheme`，立即，默认 `yohu`）。Yohu 色值在 `tokens/colors.ts`；官方 AS Logcat V2 在 `tokens/logcat.ts`。级别是官方 LevelFormat：`" L "`（3ch 着色）+ 1 个未着色空格。Yohu：tag / msg 共用 `--yohu-level-*` ink；**已知级别一律 wash**（对照 Logcat `TextAttributes.BACKGROUND`，字母 `--yohu-fg-on`、底 `--yohu-level-*`，与筛选格反色同一配方），`bar=level`。Logcat：各级 level 都是 wash 字母底；`bar=none`；时间/进程无色键；Tag `abs(Java hashCode) % 80`。禁止按 range 拆 span 盒、禁止 `display: contents` 冒充合并、禁止选区 abs 带 / 级别加粗冒充色块。清单行高 `dataRowHeight()` = `--yohu-row-height`。筛选钮仍走 `--yohu-level-*`。解析失败（`level=?`）整行只有消息。禁止 `--yohu-level-f-bg`、社区紫 Assert、模块再列 V–F hex、`data-tint-msg`
- **检索焦点：** 关键字走 `YoSearch` `inputRef`。禁止宿主 `querySelector("input")`。有查询即亮描边（库内 `active`）。禁止模块点 `.yohu-search` 改铬 token。命中是 `highlight.ts` 文档偏移，View 登记 `::highlight(yohu-log-mark)`。禁止 DOM `<mark>` / `.yohu-logs__mark` 拆盒
- **清单选字：** 手势与绘制都是原生 Selection。`YoVirtualList` `tone=document` 未开 listbox 走 `data-layout=flow`（行在文档流，簇钉 origin 行顶），`::selection` 只用 `--yohu-doc-sel` 铺底，不改字色。着色走 `::highlight`，禁止再叠 `.yohu-doc-sel` / `docSelBandStyle` ch 带，禁止透明 `::selection` 再另画一层。复制范围仍由 `editor/selection` `{seq,off}` 闭开读出。Ctrl+A = `selectAllChildren` + `pick === all` 整表文档，禁止 `.yohu-logs__row--picked` 整行洗底。禁止点 `__row`
- 窗口 = 会话订阅（serial / capturing / starting / fromSeq）。**hold** = `capturing || starting`（`hold.ts` 唯一计数，只服务 IPC 引用）。该 serial 上 `foreignHoldCount==0` 才 `log.capture.start`；关窗/停采先 `unsubscribeSession` 去掉本窗 hold（冻可见区），`holdCount==0` 才 `stop`。禁止只数 `capturing`。切焦点不停其他设备
- **采集槽位 ≠ 跟流工人：** core 槽位是采集意图（Empty/Starting/Live/Stopping + generation 令牌 + Batcher + 环 + 进程索引）。工人是一次 `adb logcat -v long,uid,year`（续流加 `-T <环末墙钟>`，AOSP 含该时刻）。工人退出 / IO 错误同世代重启，不清环、不发 Stopped。Stopped 只来自末 hold 的 `log.capture.stop`、设备掉线、Starting 放弃。对照 `LogCatReceiverTask`（shell 结束 ≠ 停采集）与 `LogcatCollector`（后台重连，掉线才停）
- **UI store 分层（ADR-v6-041）：** `workspace`（Tab/过滤定义/视口页；`unsubscribeSession` 退订）∥ `capture`（每设备启停/窗口 hold/世代对账/`log.window.bind`）。全文不进 JS。扇出只认 `capturing`。门面显式拼装；`closeSession` / `closeOthers` / `resumeFollow` 以 capture 为准。进程索引、世代、溢出按 serial 分桶。命中索引与信号计数在 Rust，视口只留约一屏（`LOG_VIEW_PAGE`）
- **新建窗口：** 包名检索走 `log.packageSnapshot`（`pm list packages` 已安装列表）；PID 检索走 `ps` 进程索引。进程索引仍只用于包名 PID 重绑，不是新建窗口的包名源。对话框 `YoDialog bodyOverflow="hidden"`，禁止点 `__body` / `:has`。设备与划分同一行：左 `YoSelect block`（主文案型号、次文案短号·连接），右 `YoSegmentedButton` hug（包名 / PID，轨 `YoCorner`）。禁止 `YoFormRow` 横排把 Select 收成胶囊，禁止再拆成两行。清单铬走 `YoCorner flex=fill`（槽 `flex-direction:column`），选中底由 `YoVirtualList` 默认 `tone=document` 单选 fill 自持。禁止模块再塞 `YoIndicator`，禁止 `tone=list`（不是文件表），禁止再 `border` + `overflow` 叠圆角。不走 `bodyLead`（确认句居中）。检索框同时是过滤和创建值：`YoSearch` Enter / 「创建」 / 行双击同一条 `create`。`workspace.createSession` 只加页签并激活，不自启采集；确认后 `onCreated` 走与页眉「开始采集」同一条 `beginCapture`（`processSnapshot` + `fromSeq=0` + 环补齐）。禁止只加页签不订窗。提交打 `YoLog`「新建窗口」，便于和 `log.capture.start` 对账
- **显示面板（窗口文档）：** 窗口私有。唯一游标 `fromSeq`：序号能进索引 ⟺ 已登记 && `seq >= fromSeq` && 过滤命中。界面 `visible` 是过滤后的文档，上限 `buffer_capacity`，不是一屏。`log/hits` 的 `tail` 追加进文档；离开底部仍写入，视口不动，`pendingCount` 记新增条数。改过滤走 `log.window.bind`（环上重建索引，一次装入过滤后的全部命中）。未跟滚时这次换文档保留已有 `pendingCount`。**清空可见区** `discardView`：把 `fromSeq` 推过已见序号并重新登记，旧行不得再进索引。**空面板不能冻结**（`canFreezeFollow`）：没有已画行就没有底部，`detachFollow` 空操作。点开始订阅时强制跟滚，`log.window.bind` 把命中装进文档，滑块钉在末端。暂停只挡入文档，不挡索引计数。拖动不调用 `log.page`
- **面板步骤：** 开始 = 跟尾闩上，把命中装进文档，滑块贴轨道末端，最后一行落在视口底。停止 = 采集停，文档留下，视口停在停止前的位置。再开始 = 新一代清环后文档从新命中长起，滑块仍钉在末端。拖动 = 拇指跟手，只改文档里的可见行，不向环要页。离开底部 = 只有手势松开跟尾；新行仍进入文档，条数记「条新日志」，视口不动；回到底部再闩上。测量到还没钉上不能松开跟尾。文档头被裁掉时，未跟尾的偏移退回同样的行。
- 环：`buffer_capacity` 默认 100000，是唯一全文；掉线清该 serial 的 core 环与窗口索引，**不清已画出的页**
- **导出（ADR-v6-021）：** `log.export` 扫该设备环：`seq >= fromSeq` 且 domain `log_filter_matches`。仅用户点导出时落盘。导出行文本走 domain `format_log_line` testdata，不驱动清单选区。默认目录：`export_default_path` 非空用设置值，否则 `paths.exports_dir()`；策略在 `capture_runs::export`，commands 只转发
- **清单列：** 官方 STANDARD 默认 `headerWidth=100`（时间 24 + BOTH 12 + Tag 24 + AppName 36 + Level 4）。列序时间 → UID（扩展，默认关）→ ProcessThread → Tag → AppName → Level → 消息。默认 PID+TID 开（`%5d-%-5d `）。显示列读 `log_display_columns`。消息是 `line.msg` 原文，不加 `: `。标题栏走 `YoColFrame tone=document cellPad=none` + `LogColumnHeader`（`YoColRow` / `YoColHeader pad=none tone=document`），轨道 `headerColumns` / `logDocTrackTemplate(chPx)` 是探针 px，与 Format 同尺。文案单源 `@yohu/api` `LOG_DISPLAY_COLUMN_CATALOG`（消息列 `LOG_MESSAGE_COLUMN`，不进开关）。PID+TID 开时文档仍是一段 ProcessThread，表头拆成 PID / TID 两格。可拖列把 px 收成 `colChars`（只加不减官方下限）；级别与消息不可拖，级别 `split` 出 mark 列缝。clip 横滑时标题 `translateX(-inline)` 跟内容（`onOffset` 的 inline，不是视口 `scrollLeft`）；侧轨 gutter 跟 `data-gutter` 对齐。wrap 时表头消息列 `minmax(0, 1fr)`；clip 时 `max-content`。表头禁止 CSS `ch` 冒充轨道；级别 BACKGROUND 用文档文本节点的 `1ch`。禁止把 `1fr` / 列垫写进 Document，禁止行走 `YoColTrack`。Tag 默认宽是官方 `TagFormat.maxLength` 常数（23），加宽只活在会话、不进设置。`measureChPx` 给 wrap 算视口列数，给 clip 把文档 ch 换成 VL `contentWidth`，给表头轨道和拖条把 ch 换成 px
- **长文本：** `log_line_layout` → `FormatOptions.softWrap`。`clip`（默认）= 官方 Soft-Wrap 关：hang 空格在 Document 里，无硬 `\n` 永不拆行，超宽底栏横滑。`wrap` = 官方 Soft-Wrap 开：文档零悬挂，续行第 0 列，视口软折。复制面 = Document.text（含 hang 空格）。禁止 CSS `--yohu-log-hang` / `--yohu-log-board`
- **复制是清单文档（Family A）：** 载荷是 Document `text`（各 Format 尾空格都在字符串里，全部可选）。选区范围由 `editor/selection` `readDocSel` 读出，`copy.ts` 只序列化。可视续行经 `data-doc-from` 映回逻辑偏移。未挂载中间行用同一 `text` 补齐。禁止 `Selection.toString()` 当跨行唯一载荷。Ctrl+A = 整表文档。折叠徽章 `data-log-chrome` 不进文档。选字底走原生 `::selection` / `--yohu-doc-sel`，不改 ink。输入框选字仍走 `--yohu-text-sel` / `--yohu-text-sel-fg`
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- **页壳：** `YoPage` + `YoChrome` + `YoTabs` + `YoPanel overflow="hidden"`。页眉走库 `leading` / `actions[{key,node}]`（身份表 `logs-chrome-actions`：暂停 / 滞后徽章随采集进出）；开始/停止同一钮走 `YoSwap`。禁止模块自挂 Presence 补页眉。清单 `YoVirtualList` 自持滚轴（`state=on`，侧轨常驻），行号驱动（`lineScale` = 命中总数 / 页起点；钉底时滑块贴轨道末端，最后一行落在视口底），禁止再外包 `YoScroller`，禁止用全文高垫片。重命名会话 Dialog children 保持 `YoScroller state=on`。新建窗口包名/PID 名单仍默认 Auto。过滤条只走 `YoSegmentedButton` / `YoSearch` / `YoTextField`（Tag Chip 写入）/ `YoChip` / `YoBadge`，禁止自造 input/select/checkbox。新建窗口包名/PID 列表过滤走 YoSearch `searchDocuments`。过滤定义在 `filter.ts`，命中在 Rust；页内折叠在 `stack.ts`。模块 CSS 禁止 `overflow: auto` 产品条，禁止点 `__body`
- **采集相只有一源：** Tab 圆点、状态行、空态只认窗口订阅 `capturing` / `starting`（`session-chrome` 只投影相；占流只认 `sessionHolds`）。`log/captureState` Stopped（`applyCaptureEvent` 只比 generation，只升不减）才 `unsubscribeSession` 该 serial 全部 hold 窗口——工人退出不发 Stopped。`confirmStart` 只退订本窗，禁止 `stopWindowsOn`。掉线置 generation=0，无 hold 则忽略过期事件。崩溃只要 `FATAL EXCEPTION`，ANR 只要 `ANR in` / `am_anr`（domain `log_signal` + `@yohu/api` `scanSignal`）；信号计数由可见面板 `ViewRow.signal` 派生，禁止改 Tab 色、禁止累计已裁掉的行
- 状态行设备：型号 + Android 版本 + API（`DeviceSession.devices` + `deviceStatuses`），不拼 serial
- 快捷键：Space / Ctrl+L / F / T / W / Tab

### 设计后（清单文档）

```text
adb logcat -v long,uid,year
  → MessageAssembler（一条 logd 记录）
  → LogLine.msg（可含 \\n）
  → Timestamp / Uid / ProcessThread / Tag / AppName / Level / message
  → TextAccumulator（Soft-Wrap 关写入 hang 空格）
  → Document.append
  → EditorView（1 文档行 = 1 可视行）
  → serializeLogCopy(Document.text)
```

禁止表格列垫、禁止 View 再调 formatMessage。

### 设计后（采集槽位）

```text
窗口 hold 0→1 → log.capture.start
  → CaptureSlot Starting→Live（generation 令牌）
  → Batcher + ProcessIndex（代际资源，不随工人重建）
  → supervise_follow
       attempt 子令牌 + adb logcat [-T last_ts]
       FollowEnd::Exited / Error → 同世代重启（不清环、不 Stopped）
       FollowEnd::Offline → release 槽位 Stopped
       FollowEnd::Cancelled → stop() 收槽位 Stopped
窗口 hold 1→0 → unsubscribeSession（capturing=false + 冻可见区）
  → log.capture.stop → Stopping → 代际令牌 cancel → Stopped
扇出：窗口索引追加序号 → `log/hits`（带新增正文）→ 写入 capturing 窗口的文档；跟尾才移动视口
```

### 设计后（export）

```text
模块点导出 → invoke log.export
  → commands/log 转发
  → capture_runs::export（default_export_dir）
  → CaptureService.export（环快照 + domain 过滤落盘）
```
