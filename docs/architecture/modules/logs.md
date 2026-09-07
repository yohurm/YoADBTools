# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat；槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- 过滤：UI `filter.ts` + domain `log_filter`（导出用）；共享 testdata
- 窗口 = 会话订阅（serial / capturing / fromSeq）；设备流按窗口引用计数启停；切焦点不停其他设备
- **UI store 分层：** `workspace`（Tab/过滤/面板）∥ `ingest`（批次按 serial 扇出）∥ `capture`（每设备启停/世代/溢出回补）。进程索引、世代、溢出按 serial 分桶
- **显示面板：** 窗口私有、append-only。只在本窗口重新开始采集（新流）或用户清空 / 清设备缓冲时 flush。用户改级别/Tag/关键字时从已有行筛选，再按 seq 从镜像补新命中。镜像只补洞，禁止整表替换。点开始才订阅：先 `log.processSnapshot` 绑 PID，`fromSeq=0`，按本窗口过滤从当前环补齐
- 环：`buffer_capacity` 默认 10000；掉线清该 serial 的 core 环与 UI 镜像，**不清面板**
- **导出（ADR-v6-021）：** `log.export` 扫该设备环：`seq >= fromSeq` 且 domain `log_filter_matches`。仅用户点导出时落盘。行文本与 UI 复制共用 `format_log_line` testdata
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- 快捷键：Space / Ctrl+L / F / T / W / Tab
