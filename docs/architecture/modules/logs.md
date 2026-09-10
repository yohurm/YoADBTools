# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat；槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- 过滤：UI `filter.ts` + domain `log_filter`（导出用）；共享 `core/yohu-domain/testdata/log_filter.json`
- 窗口 = 会话订阅（serial / capturing / fromSeq）；设备流按窗口引用计数启停；切焦点不停其他设备
- **新建窗口：** 包名检索走 `log.packageSnapshot`（`pm list packages` 已安装列表）；PID 检索走 `ps` 进程索引。进程索引仍只用于包名 PID 重绑，不是新建窗口的包名源
- **UI store 分层：** `workspace`（Tab/过滤/面板）∥ `ingest`（批次按 serial 扇出）∥ `capture`（每设备启停/世代/溢出回补）。门面显式拼装；`closeSession` / `closeOthers` / `resumeFollow` 以 capture 为准。进程索引、世代、溢出按 serial 分桶
- **显示面板：** 窗口私有。入镜 / 跟滚 / PID 重绑只按末行 seq 追加（`isFreshLine`）。用户改级别/Tag/关键字走 `rebuildFiltered`（已画出仍匹配 ∪ 镜像命中，按 seq 合并；镜像为空时只可能变少，禁止整表替换成空）。**冻结与过滤解耦：** 离开底部记下 `frozenThroughSeq`；跟滚中过滤从 `fromSeq` 全量合并、pending=0；未跟滚只合并 `seq ≤ frozenThroughSeq`，其后计 pending。暂停只挡入镜/catchUp，不进 `patchFilter`。点开始才订阅：先 `log.processSnapshot` 绑 PID，`fromSeq=0`，按本窗口过滤从当前环补齐
- 环：`buffer_capacity` 默认 10000；掉线清该 serial 的 core 环与 UI 镜像，**不清面板**
- **导出（ADR-v6-021）：** `log.export` 扫该设备环：`seq >= fromSeq` 且 domain `log_filter_matches`。仅用户点导出时落盘。行文本与 UI 复制共用 `format_log_line` testdata
- **清单列：** 与文件清单同一套 YoUI 列架：`YoColFrame` 写 `--yohu-col-tracks`，表头 `YoColRow` + `YoColHeader`，行 `YoColTrack` + `YoColCell`。模块只提供 `logColTemplate` / `logLineCellText` 与单元格着色。store 只存 `colWidths` 并 `setColWidth`，不进设置。显示列仍读 `log_display_columns`
- **复制仍是文档（Family A）：** 载荷是 `formatLogLine`。选区偏移从单元格文案映射回文档（补列间空格）。禁止把 Grid 碎片 `Selection.toString()` 当跨列载荷。解析失败（`level=?`）整行通栏
- **选区与复制：** 只有一套字符选区。单行局部与跨行同一机制；列间空白可被选中。复制按选区重建：单行切片；跨行 = 首行切片 + 中间 `format_log_line`（含虚拟列表未挂载行）+ 末行切片。Ctrl+A = 整表 visible。无选区右键复制该行。铬层（表头、折叠钮）`user-select: none`。禁止把 Grid 碎片 `Selection.toString()` 当载荷；文档行上的选区文本与 `format_log_line` 对齐
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- 状态行设备：型号 + Android 版本 + API（`DeviceSession.devices` + `deviceStatuses`），不拼 serial
- 快捷键：Space / Ctrl+L / F / T / W / Tab
