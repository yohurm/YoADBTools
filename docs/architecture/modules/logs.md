# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat（`-v threadtime,uid,year`）；槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- **时间戳：** 解析边界经 domain `canonicalize_datetime` 收到 `YYYY-MM-DD HH:mm:ss.SSS`（`LogLine.ts` 原文）。清单 / 复制按设置 `log_time_format` 投影（默认 `datetime_millis` = 完整墙钟；可选 `datetime` / `time_millis` / `time`）。导出仍用 `formatLogLine` testdata 原文。禁止再裁成 `MM-DD`
- 过滤：匹配内核在 domain `log_filter` + `@yohu/api` `log-filter`（`testdata/log_filter.json`）。模块 `filter.ts` 只做级别钮 / Tag Chip / 会话形状。级别字母单源 `log_levels.json` ↔ `LEVELS`。`LogFilter.levels` 空 = 不限；非空 = 精确集合，禁止最低含以上。`tag_contains` 按逗号 / 分号 / `|` 拆多针，任一 OrdinalIgnoreCase **精确**命中（OR）；空或仅分隔符 = 不限。空白留在单个针内。无正则。逗号提交后前一针走 `YoChip`（写入盒 flex 行，关闭流内；禁止 Tag 槽嵌套横条）
- **级别钮：** 独立多选走 `YoSegmentedButton` `type=capsule` `multiple` `size=sm`。未选字色 `item.ink=var(--yohu-level-*)`；选中填 `item.fill=var(--yohu-level-*)`。模块禁止自造 Corner+flush Button，禁止点库内部 class。行反色仍只有 Fatal（行上 `data-paint=invert`）。禁止 CSS 再列 V–F 映射
- **级别色：** `LogLevelLight/Dark` 只持 ink。V=`font_secondary`；D/I/W/E=brand/confirm/alert/warning；F=warning 压黑。paint 在 `level-paint.ts`：Fatal `invert`。已知级别的消息与级别字 / Tag 同 `--yohu-log-ink`（行上 `data-level`）。解析失败（`level=?`）消息走 `--yohu-fg`。反色字走 `--yohu-fg-on`。禁止 `--yohu-level-f-bg`、禁止社区紫、禁止再写 `data-tint-msg`
- **检索焦点：** 关键字走 `YoSearch` `inputRef`。禁止宿主 `querySelector("input")`。有查询即亮描边（库内 `active`）。禁止模块点 `.yohu-search` 改铬 token
- **清单选字：** `YoVirtualList` 默认 `tone=document` 承担 `user-select` / `cursor`。Ctrl+A 铺底只涂 `.yohu-logs__row--picked`。禁止点 `__row`
- 窗口 = 会话订阅（serial / capturing / starting / fromSeq）。**hold** = `capturing || starting`（`hold.ts` 唯一计数）。该 serial 上 `foreignHoldCount==0` 才 `log.capture.start`；关窗/停采先去掉本窗 hold，`holdCount==0` 才 `stop`。禁止只数 `capturing`。切焦点不停其他设备
- **新建窗口：** 包名检索走 `log.packageSnapshot`（`pm list packages` 已安装列表）；PID 检索走 `ps` 进程索引。进程索引仍只用于包名 PID 重绑，不是新建窗口的包名源。对话框 `YoDialog bodyOverflow="hidden"`，禁止点 `__body` / `:has`。设备与划分同一行：左 `YoSelect block`（主文案型号、次文案短号·连接），右 `YoSegmentedButton` hug（包名 / PID，轨 `YoCorner`）。禁止 `YoFormRow` 横排把 Select 收成胶囊，禁止再拆成两行。清单铬走 `YoCorner flex=fill`（槽 `flex-direction:column`），选中底由 `YoVirtualList` 默认 `tone=document` 单选 fill 自持。禁止模块再塞 `YoIndicator`，禁止 `tone=list`（不是文件表），禁止再 `border` + `overflow` 叠圆角。不走 `bodyLead`（确认句居中）
- **UI store 分层：** `workspace`（Tab/过滤/面板）∥ `ingest`（批次按 serial 扇出）∥ `capture`（每设备启停/窗口 hold/世代对账）。门面显式拼装；`closeSession` / `closeOthers` / `resumeFollow` 以 capture 为准。进程索引、世代、溢出按 serial 分桶
- **显示面板：** 窗口私有。唯一游标 `fromSeq`：一行能进面板 ⟺ 已订阅 && `seq >= fromSeq` &&（跟滚 || `seq ≤ frozenThroughSeq`）&& 过滤命中。入镜 / PID 重绑 / 跟滚走 `applyAppend`；改过滤走 `projectWindow`（镜像覆盖游标范围时镜像是唯一权威，否则只收窄已画行）。**清空可见区** `discardView`：把 `fromSeq` 推过已见与镜像末 seq，旧行不得再投影回来。**冻结与过滤解耦：** 离开底部记下 `frozenThroughSeq`；未跟滚只合并到该上限，其后计 pending。**空面板不能冻结**（`canFreezeFollow`）：没有已画行就没有底部，`detachFollow` 空操作；否则 `frozenThroughSeq=fromSeq-1`，新行全进 pending，空态仍显示「等待设备输出」。点开始订阅时强制跟滚。暂停只挡入镜/catchUp，不进 `patchFilter`。点开始才订阅：先 `log.processSnapshot` 绑 PID，`fromSeq=0`，按本窗口过滤从当前环补齐
- 环：`buffer_capacity` 默认 10000；掉线清该 serial 的 core 环与 UI 镜像，**不清面板**
- **导出（ADR-v6-021）：** `log.export` 扫该设备环：`seq >= fromSeq` 且 domain `log_filter_matches`。仅用户点导出时落盘。导出行文本走 domain `format_log_line` testdata，不驱动清单选区。默认目录：`export_default_path` 非空用设置值，否则 `paths.exports_dir()`；策略在 `capture_runs::export`，commands 只转发
- **清单列：** 表头与行共用 `logDocColumns` 一把尺。列序 `LOG_COLUMNS`：时间 / UID / PID / TID / Tag / 级别 / 消息（级别在 Tag 与消息之间）。`YoColFrame` 默认 `cellPad=list`（标题左 space-md，不贴格边）。轨道是 `(padLeft+chars+gutter)ch`（`logDocTrackTemplate`）；`padLeftChars` 与列垫同一 token（`Spacing.Md`）。行文档每字段先写这些空格再 `clipPad`，和标题同一起笔。列最小/默认字符 = `max(字段载荷, 表头全角)`（CJK 2ch；「级别」4ch，禁止只按一字母压成 1ch）。默认宽再 × `LOG_CH_PX`（时间墙钟、PID/TID 五位）。切 `log_time_format` 时时间列字段宽走 `tsFieldPx`（与 `clockDisplayLen` 同一公式），禁止只改 `LOG_COLUMNS.minWidth`。`fieldChars` 不跟 `measureChPx` 走。数字列 `align=end`：`YoColHeader.align` 与文档 `padStart` 同一 `LOG_COLUMNS.align`，禁止 View 漏传。消息是 `line.msg` 原文（对照 AS `MessageFormatter.accumulate(message)`），禁止再给消息加 `: `。导出 compact 的 `Tag: message` 只走 `formatLogLine`。禁止 `cellPad=none`。`measureChPx` 只用行内 `.yohu-logs__ch-probe`。`YoVirtualList` 默认 `tone=document`，不画行间线。store 只存 `colWidths` 并 `setColWidth`（字段 px，禁止把 `logDocTrackPx` 回写）。表头 `For` 只遍历 `visibleLogColumns`（`LOG_COLUMNS` 稳定引用），禁止 `For each={logDocColumns(...)}`（每次新对象会拆掉 `YoColResizer`，拖宽丢捕获）。显示列仍读 `log_display_columns`（默认 UID/TID 关）
- **复制是清单文档（Family A）：** 载荷是 `formatLogDoc`（pad 空格进文档）。禁止再按格命中、禁止 `selection.ts` / `DocRange` / Highlight overlay。解析失败（`level=?`）整行只有消息
- **选区与复制：** 行 `user-select: text`。原生 Selection 走文档 DOM（=== `formatLogDoc`）。选字底/字走 `--yohu-text-sel` / `--yohu-text-sel-fg`（强调实底 + 反白）。字段列垫在 DOM 里拆成 `data-log-pad` 且 `user-select: none`，双击只选正文，不带尾部空白；文档字符串仍含垫。禁止对 `pointerdown` `preventDefault`（否则没有 `dblclick`）。复制按选区偏移切文档；虚拟列表未挂载的中间行用同一 `formatLogDoc` 补齐。禁止 `Selection.toString()` 当跨行唯一载荷。Ctrl+A = 整表 visible（同色铺底）。无选区右键复制该行文档。折叠徽章 `data-log-chrome` 不进文档
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- **页壳：** `YoPage` + `YoChrome` + `YoTabs` + `YoPanel overflow="hidden"`。清单 `YoVirtualList` 自持滚轴，禁止再外包 `YoScroller`。重命名会话 Dialog children 保持 `YoScroller`。过滤条只走 `YoSegmentedButton` / `YoSearch` / `YoTextField`（Tag Chip 写入）/ `YoChip` / `YoBadge`，禁止自造 input/select/checkbox。新建窗口包名/PID 列表过滤走 YoSearch `searchDocuments`。`ingest.ts` 只写入环镜像；`mirror.ts` 是设备 logcat 环（不是投屏）。消费端 pipeline 在 `filter.ts` + `stack.ts` + `panel.ts`（无 `pipeline.ts`）。模块 CSS 禁止 `overflow: auto` 产品条，禁止点 `__body`
- **采集相只有一源：** Tab 圆点、状态行、空态只认窗口订阅 `capturing` / `starting`（`session-chrome`；`sessionIsLive` = `sessionHolds`）。设备流停靠 `log/captureState`（`applyCaptureEvent` 只比 generation，只升不减）停该 serial 全部 hold 窗口。`confirmStart` 只退订本窗，禁止 `stopWindowsOn`。掉线置 generation=0，无 hold 则忽略过期事件。崩溃只要 `FATAL EXCEPTION`，ANR 只要 `ANR in` / `am_anr`（domain `log_signal` + `@yohu/api` `scanSignal`）；信号计数由可见面板 `ViewRow.signal` 派生，禁止改 Tab 色、禁止累计已裁掉的行
- 状态行设备：型号 + Android 版本 + API（`DeviceSession.devices` + `deviceStatuses`），不拼 serial
- 快捷键：Space / Ctrl+L / F / T / W / Tab

### 设计后（export）

```text
模块点导出 → invoke log.export
  → commands/log 转发
  → capture_runs::export（default_export_dir）
  → CaptureService.export（环快照 + domain 过滤落盘）
```
