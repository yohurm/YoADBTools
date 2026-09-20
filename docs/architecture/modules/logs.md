# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat（`-v long,uid,year` + 组装器：一条 logd 记录 = 一条 `LogLine`，`msg` 可含硬 `\n`）。头语法只认 AOSP `FORMAT_LONG`：`[ time uid pid:tid L/tag ]`（`uid` 是打印机的 `%5s:`/`%5d:`，与 `pid:tid` 连成 `uid:pid:tid`）。AS `LogcatHeaderParser` 只覆盖无 uid 的 `pid:tid`。禁止按 threadtime 空格分隔 uid 去认 long 头。槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- **时间戳：** 解析边界经 domain `canonicalize_datetime` 收到 `YYYY-MM-DD HH:mm:ss.SSS`（`LogLine.ts` 原文）。清单 / 复制按设置 `log_time_format` 投影（默认 `datetime_millis` = 完整墙钟；可选 `datetime` / `time_millis` / `time`）。导出仍用 `formatLogLine` testdata 原文。禁止再裁成 `MM-DD`
- 过滤：匹配内核在 domain `log_filter` + `@yohu/api` `log-filter`（`testdata/log_filter.json`）。模块 `filter.ts` 只做级别钮 / Tag Chip / 会话形状。级别字母单源 `log_levels.json` ↔ `LEVELS`。`LogFilter.levels` 空 = 不限；非空 = 精确集合，禁止最低含以上。`tag_contains` 按逗号 / 分号 / `|` 拆多针，任一 OrdinalIgnoreCase **精确**命中（OR）；空或仅分隔符 = 不限。空白留在单个针内。无正则。逗号提交后前一针走 `YoChip`（写入盒 flex 行，关闭流内；禁止 Tag 槽嵌套横条）
- **级别钮：** 独立多选走 `YoSegmentedButton` `type=capsule` `multiple` `size=sm`。未选字色 `item.ink=var(--yohu-level-*)`；选中填 `item.fill=var(--yohu-level-*)`。模块禁止自造 Corner+flush Button，禁止点库内部 class。禁止 CSS 再列 V–F 映射
- **清单编辑器（三件套，对照 AS `logcat/messages/`）：** `editor/format` 一条记录一次 `formatMessage`（`TimestampFormat` → `UidFormat`（扩展）→ `ProcessThreadFormat` → `TagFormat` → `AppNameFormat` → `LevelFormat` → 消息）。`FormatOptions.softWrap` 对照 `MessageFormatter.setSoftWrapEnabled`：关则 `msg.replace("\\n", "\\n" + headerWidth 空格)` 写入文档；开则裸 `\\n`。`editor/document` 只 `append` / `evict` / `reload` / `setOptions`。`editor/view` 1 可视行 = 1 条文档行（只认硬 `\\n`）；wrap 再按视口切到第 0 列。禁止回调 `formatMessage`。禁止 CSS hang / 表头 `1fr`。依赖：Formatter ↛ 任何显示模块；Document → Formatter；EditorView → Document。panel 只喂 `ViewRow[]`（逻辑记录 + 折叠/信号）
- **级别色：** 着色在 Formatter 写入时挂 range，不是第二次 paint，也不是 View if/else。身份在 `@yohu/api` `log-color-scheme` 目录（`log_color_scheme`，立即，默认 `yohu`）。Yohu 色值在 `tokens/colors.ts`；官方 AS Logcat V2 在 `tokens/logcat.ts`。级别是官方 LevelFormat：`" L "`（3ch 着色）+ 1 个未着色空格。Yohu：tag / level / msg 共用 `--yohu-level-*`，Fatal level 是 `wash`（行盒），`bar=level`。Logcat：`bar=none`；时间/进程无色键；Tag `abs(Java hashCode) % 80`。CSS 只认 `data-tone=ink|wash`、`data-box=line` 与 `data-bar`。清单行高 `dataRowHeight()` = `--yohu-row-height`。筛选钮仍走 `--yohu-level-*`。解析失败（`level=?`）整行只有消息。禁止 `--yohu-level-f-bg`、社区紫 Assert、模块再列 V–F hex、`data-tint-msg`
- **检索焦点：** 关键字走 `YoSearch` `inputRef`。禁止宿主 `querySelector("input")`。有查询即亮描边（库内 `active`）。禁止模块点 `.yohu-search` 改铬 token
- **清单选字：** 手势仍是原生 Selection（`YoVirtualList` `tone=document` 承担 `user-select` / `cursor`）。绘制是四层：`--yohu-doc-sel` → YoUI `docSelBandStyle` / `.yohu-doc-sel` → `editor/selection`（`{seq,off}` 闭开）→ EditorView 按可视行 `selSlice` 铺 ch 带。原生 `::selection` 在 `.yohu-logs__view` 透明，禁止再靠它给 `[data-tone=ink]` 铺色。Ctrl+A = `sel === "all"` 整条可视行带，禁止 `.yohu-logs__row--picked` 整行洗底。禁止点 `__row`
- 窗口 = 会话订阅（serial / capturing / starting / fromSeq）。**hold** = `capturing || starting`（`hold.ts` 唯一计数）。该 serial 上 `foreignHoldCount==0` 才 `log.capture.start`；关窗/停采先去掉本窗 hold，`holdCount==0` 才 `stop`。禁止只数 `capturing`。切焦点不停其他设备
- **新建窗口：** 包名检索走 `log.packageSnapshot`（`pm list packages` 已安装列表）；PID 检索走 `ps` 进程索引。进程索引仍只用于包名 PID 重绑，不是新建窗口的包名源。对话框 `YoDialog bodyOverflow="hidden"`，禁止点 `__body` / `:has`。设备与划分同一行：左 `YoSelect block`（主文案型号、次文案短号·连接），右 `YoSegmentedButton` hug（包名 / PID，轨 `YoCorner`）。禁止 `YoFormRow` 横排把 Select 收成胶囊，禁止再拆成两行。清单铬走 `YoCorner flex=fill`（槽 `flex-direction:column`），选中底由 `YoVirtualList` 默认 `tone=document` 单选 fill 自持。禁止模块再塞 `YoIndicator`，禁止 `tone=list`（不是文件表），禁止再 `border` + `overflow` 叠圆角。不走 `bodyLead`（确认句居中）。检索框同时是过滤和创建值：`YoSearch` Enter / 「创建」 / 行双击同一条 `create`。`workspace.createSession` 只加页签并激活，不自启采集；确认后 `onCreated` 走与页眉「开始采集」同一条 `beginCapture`（`processSnapshot` + `fromSeq=0` + 环补齐）。禁止只加页签不订窗。提交打 `YoLog`「新建窗口」，便于和 `log.capture.start` 对账
- **UI store 分层：** `workspace`（Tab/过滤/面板）∥ `ingest`（批次按 serial 扇出）∥ `capture`（每设备启停/窗口 hold/世代对账）。门面显式拼装；`closeSession` / `closeOthers` / `resumeFollow` 以 capture 为准。进程索引、世代、溢出按 serial 分桶
- **显示面板：** 窗口私有。唯一游标 `fromSeq`：一行能进面板 ⟺ 已订阅 && `seq >= fromSeq` &&（跟滚 || `seq ≤ frozenThroughSeq`）&& 过滤命中。入镜 / PID 重绑 / 跟滚走 `applyAppend`；改过滤走 `projectWindow`（镜像覆盖游标范围时镜像是唯一权威，否则只收窄已画行）。**清空可见区** `discardView`：把 `fromSeq` 推过已见与镜像末 seq，旧行不得再投影回来。**冻结与过滤解耦：** 离开底部记下 `frozenThroughSeq`；未跟滚只合并到该上限，其后计 pending。**空面板不能冻结**（`canFreezeFollow`）：没有已画行就没有底部，`detachFollow` 空操作；否则 `frozenThroughSeq=fromSeq-1`，新行全进 pending，空态仍显示「等待设备输出」。点开始订阅时强制跟滚。暂停只挡入镜/catchUp，不进 `patchFilter`。点开始才订阅：先 `log.processSnapshot` 绑 PID，`fromSeq=0`，按本窗口过滤从当前环补齐
- 环：`buffer_capacity` 默认 10000；掉线清该 serial 的 core 环与 UI 镜像，**不清面板**
- **导出（ADR-v6-021）：** `log.export` 扫该设备环：`seq >= fromSeq` 且 domain `log_filter_matches`。仅用户点导出时落盘。导出行文本走 domain `format_log_line` testdata，不驱动清单选区。默认目录：`export_default_path` 非空用设置值，否则 `paths.exports_dir()`；策略在 `capture_runs::export`，commands 只转发
- **清单列：** 官方 STANDARD 默认 `headerWidth=100`（时间 24 + BOTH 12 + Tag 24 + AppName 36 + Level 4）。列序时间 → UID（扩展，默认关）→ ProcessThread → Tag → AppName → Level → 消息。默认 PID+TID 开（`%5d-%-5d `）。显示列读 `log_display_columns`。消息是 `line.msg` 原文，不加 `: `。标题栏走 `YoColFrame tone=document cellPad=none` + `LogColumnHeader`（`YoColRow` / `YoColHeader pad=none tone=document`），轨道 `headerColumns` / `logDocTrackTemplate(chPx)` 是探针 px，与 Format 同尺。文案单源 `@yohu/api` `LOG_DISPLAY_COLUMN_CATALOG`（消息列 `LOG_MESSAGE_COLUMN`，不进开关）。PID+TID 开时文档仍是一段 ProcessThread，表头拆成 PID / TID 两格。可拖列把 px 收成 `colChars`（只加不减官方下限）；级别与消息不可拖，级别 `split` 出 mark 列缝。clip 横滑时标题 `translateX(-scrollLeft)` 跟内容；侧轨 gutter 跟 `data-gutter` 对齐。wrap 时表头消息列 `minmax(0, 1fr)`；clip 时 `max-content`。禁止 CSS `ch` 冒充文档格，禁止把 `1fr` / 列垫写进 Document，禁止行走 `YoColTrack`。Tag 默认宽是官方 `TagFormat.maxLength` 常数（23），加宽只活在会话、不进设置。`measureChPx` 给 wrap 算视口列数，给 clip 把文档 ch 换成 VL `contentWidth`，给表头轨道和拖条把 ch 换成 px
- **长文本：** `log_line_layout` → `FormatOptions.softWrap`。`clip`（默认）= 官方 Soft-Wrap 关：hang 空格在 Document 里，无硬 `\n` 永不拆行，超宽底栏横滑。`wrap` = 官方 Soft-Wrap 开：文档零悬挂，续行第 0 列，视口软折。复制面 = Document.text（含 hang 空格）。禁止 CSS `--yohu-log-hang` / `--yohu-log-board`
- **复制是清单文档（Family A）：** 载荷是 Document `text`（各 Format 尾空格都在字符串里，全部可选）。选区范围由 `editor/selection` `readDocSel` 读出，`copy.ts` 只序列化。可视续行经 `data-doc-from` 映回逻辑偏移。未挂载中间行用同一 `text` 补齐。禁止 `Selection.toString()` 当跨行唯一载荷。Ctrl+A = 整表文档。折叠徽章与选区带 `data-log-chrome` 不进文档。选字底走 `.yohu-doc-sel` / `--yohu-doc-sel`，不改 ink。输入框选字仍走 `--yohu-text-sel` / `--yohu-text-sel-fg`
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- **页壳：** `YoPage` + `YoChrome` + `YoTabs` + `YoPanel overflow="hidden"`。清单 `YoVirtualList` 自持滚轴，禁止再外包 `YoScroller`。重命名会话 Dialog children 保持 `YoScroller`。过滤条只走 `YoSegmentedButton` / `YoSearch` / `YoTextField`（Tag Chip 写入）/ `YoChip` / `YoBadge`，禁止自造 input/select/checkbox。新建窗口包名/PID 列表过滤走 YoSearch `searchDocuments`。`ingest.ts` 只写入环镜像；`mirror.ts` 是设备 logcat 环（不是投屏）。消费端过滤在 `filter.ts` + `stack.ts` + `panel.ts`。模块 CSS 禁止 `overflow: auto` 产品条，禁止点 `__body`
- **采集相只有一源：** Tab 圆点、状态行、空态只认窗口订阅 `capturing` / `starting`（`session-chrome`；`sessionIsLive` = `sessionHolds`）。设备流停靠 `log/captureState`（`applyCaptureEvent` 只比 generation，只升不减）停该 serial 全部 hold 窗口。`confirmStart` 只退订本窗，禁止 `stopWindowsOn`。掉线置 generation=0，无 hold 则忽略过期事件。崩溃只要 `FATAL EXCEPTION`，ANR 只要 `ANR in` / `am_anr`（domain `log_signal` + `@yohu/api` `scanSignal`）；信号计数由可见面板 `ViewRow.signal` 派生，禁止改 Tab 色、禁止累计已裁掉的行
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

### 设计后（export）

```text
模块点导出 → invoke log.export
  → commands/log 转发
  → capture_runs::export（default_export_dir）
  → CaptureService.export（环快照 + domain 过滤落盘）
```
