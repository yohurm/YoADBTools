# 日志实时取数：现状架构梳理与 LogCat 对齐

- 日期：2026-11-20
- 目的：先如实梳理现有「实时取数」数据链路，再与 Android Studio Logcat 的取数模型逐条对照，找出模型级差异，给出对齐后的目标架构与分阶段改造。
- 证据等级（按 YoAgentDocs）：**已验证**＝代码位置＋可复现运行观察；**已读到**＝只有代码位置；**推断**＝由命名/相邻代码猜测（不作结论依据）。

---

## 1. 现有架构：实时取数逐节点

| # | 节点 | 代码位置 | 做什么 | 证据 |
|---|---|---|---|---|
| 1 | 采流 | `core/yohu-logsrv/src/follow.rs:133-148` `emit()` | 组装器产出记录 → `ring.push` → `book.commit` → `batcher.note(note).await` | 已验证（真机 `real_capture_stream_batch_and_ring`） |
| 2 | 环 | `core/yohu-logsrv/src/ring.rs:140` `push()` / `:161` `lines_by_seq` / `:246` `snapshot(from_seq,limit)` | 每设备唯一环形缓冲，seq 单调；`snapshot` 可按 seq 取原始行 | 已验证（`ring.rs` 单测 + 真机） |
| 3 | 窗口命中索引 | `core/yohu-logsrv/src/windows.rs` `commit()` | 按窗口 filter 维护命中 seq；`commit` 返回 `HitNote{window_id,total,line:Option<LogLine>}`（**带正文**） | 已读到 |
| 4 | 批量推送 | `core/yohu-logsrv/src/batch.rs:190-221` `push()` | `sink.try_send(event)`：**队列满即丢该批**，`dropped_batches++`，稍后补发 `log/overflow` | 已验证（`overflow_drops_push_but_reports`） |
| 5 | 事件分发 | `app/yohu-adbtools/src/events.rs:23,78` | `EventChannel`（`limits.rs:7` `EVENT_CHANNEL_CAP=8192`）逐条 `app.emit("log/hits", payload)` | 已读到 |
| 6 | UI 订阅 | `ui/.../capture-subscriptions.ts:106-109` | `onLogHits(e) → workspace.applyHits(e)`（直接把 `e.tail` 正文追加） | 已验证（`store.test.ts`） |
| 7 | 文档投影 | `ui/.../panel-projection.ts:158-211` `appendToSession/applyHits` | `applyAppend(visible, e.tail, …)` → `writePanel`；`noteSeq` 推进 `lastSeenSeq` | 已验证（`store.test.ts`） |
| 8 | 编辑器 | `ui/.../editor/{document,board,view}.ts(x)` | Document 文本 → VisualLine → 虚拟视口，只渲可见行 | 已验证（`editor/*.test.ts`） |
| 9 | 整页回补 | `ui/.../viewport-page.ts:29` `loadPage → logWindowBind`；`panel-projection.applyPage` | 溢出/换过滤/回前台时整页读环并替换文档 | 已验证（`store.test.ts`） |
| 10 | 前台/可见 | `ui/.../capture.ts:122` `catchUpAll`（`resumeVisible`） | 页面重新可见/聚焦时对所有在采窗口 `loadPage` | 已读到 |

**结论（现状）**：实时更新的**数据正文来自第 4/5/6/7 跳的批量推送**；环（第 2 跳）只在**第 9 跳（bind 整页）**被读。推送是 `try_send` 有界、满即丢（第 4 跳，设计如此：「丢推送不丢环」）。所以一旦某批推送被丢（后台 WebView 节流／事件队列满／切应用），这段正文就没进 UI 文档；只有等到下一次 bind（overflow 或回前台 `resumeVisible`）才可能从环补——而 bind 是整页替换，且环若已淘汰则补不回来。

## 2. LogCat（Android Studio）基准模型

来源：本库 `research/by-stack/client-runtime/JetBrains--android.md`（JetBrains/android `logcat/` 开源实现）与 `ADR-v6-041`（其中记载 AS Logcat 周期缓冲行为）。

- AS Logcat 的日志是**一份 Console `Document`**，其数据由 IDE 进程内的**消息环缓冲**持有，接收线程把解析后的 `LogcatMessage` **追加进这个内存环**；面板/编辑器**从环读、按可见行渲染**。环满时删**文档头**（cycle buffer），不是把整表重推一遍。
- 采集（`LogcatReceiverTask`）与视图之间**不是「带正文的批次事件」**；视图在需要时读缓冲/文档，因此**视图忙、后台、暂停渲染都不会让数据在传递环节丢失**——数据已经在环里，丢了只是没画，回头从环/文档补画即可（受环容量约束）。
- 暂停：AS 的 Pause 甚至停 logcat；Yohu 按 ADR-v6-006 只冻 UI、环继续写（这点我们与 AS 不同且更优，保留）。

> 关键模型差异一句话：**AS 是「环/文档是数据源，视图去读」；我们当前是「core 把正文批次推给视图，视图是被动拷贝」**。

## 3. 差异矩阵

| 维度 | Android Studio Logcat | 现状 Yohu | 影响 |
|---|---|---|---|
| 实时数据源 | IDE 内消息环缓冲 / Document | **core 批量推送的 `LogHits.tail` 正文** | 传递环节可有损 |
| 丢一次批次的后果 | 无（视图下次从环/文档读） | UI 文档缺一段，只能等整页 bind | **切应用/后台=丢日志** |
| 补数方式 | 读环/文档续读 | 整页 `log.window.bind` 替换 | 粗暴、且环淘汰后补不回 |
| 过滤位置 | 渲染时按 filter | UI 消费端 filter（ADR-006，一致） | 一致 |
| 容量边界 | 消息环条数 | 设备环条数 | 一致（ADR-021：超环容量不可导出/不可补） |
| 暂停 | 停采集（AS） | 只冻 UI、环继续（更优） | 保留 |

**根因（模型级，非容量/清缓冲）**：我们把「批量推送正文」当成了实时数据源，环只在整页 bind 时被读；而 `try_send` 满即丢。于是**任何使事件队列满/页面节流的操作（切应用、后台）都会在「推送→UI」这一跳丢正文**，且没有「按 seq 从环续读」的实时通路。

## 4. 目标架构（对齐 LogCat：环是数据源，视图按游标读环）

1. **环是唯一实时数据源**；每窗口维护一个**全局 seq 游标** `lastPulledSeq`。
2. **`log/hits` 退化为水位信号**：只告「该窗口有新命中，到 seq=X」，**不再携带正文**（或正文仅作可选加速提示，正确性不依赖它）。
3. **新增 `log.window.range` / `log.range`**：从环按 `(from_seq, to_seq]` 读原始行；UI 用游标拉取，**过滤仍在 UI**（ADR-006 不变）。
4. **切应用/丢信号自愈**：下一次信号或 100–150ms 兜底 tick 从游标继续拉；seq 连续，**天然无空洞**，唯一丢的可能只剩「环已淘汰」。
5. **暂停**：只停「推进视口/游标」的渲染侧；环继续写（保持现状语义：恢复时按游标续读）。
6. **打开/换过滤**：以游标重新读环构建文档；文档 = 环的一段视图。
7. 删除：`LogHits.tail` 正文推送、`batcher` 的「丢推送」作为正常路径、`applyPage` 整页替换作为唯一补数手段、`bumpPage/pageGen` 等临时对账。

## 5. 分阶段改造（每刀干净、可门禁）

- **Stage A（契约与能力，不改变 UI 行为）**：`yohu-protocol` 增 `LogRangeRequest{serial,from_seq,limit}`；`commands/log` 暴露 `log.range`（读 `CaptureService::snapshot`，离线可用，纯内存）；`@yohu/api` 增 `logRange`。测试：range 读环 seq 连续、越界/空环返回空。
- **Stage B（UI 消费改为「推送信号 + 游标拉环」）**：`capture-subscriptions` 的 `onLogHits` 不再用 `tail` 正文，改为触发 `reconcile(window_id)`：从 `lastPulledSeq+1` 拉 `log.range` 直到追平；补 150ms 兜底 tick（仅浏览器环境）。`panel-projection` 增 `applyRingLines`。删除 `LogHits.tail` 正文（core 侧只发水位）。重写受影响的 store 用例（从「同步推送」改为「拉取后断言」）。
- **Stage C（清理）**：删 `applyPage` 整页替换补数路径、`LogHits.tail`、`batcher` 超预算切分正文逻辑（只留信号）；保留 `log.window.bind` 仅作换过滤/初始页。
- 验收：`cargo build/test/clippy`；`pnpm typecheck/test/lint`；真机：连续采集→切应用多分钟→回前台，UI 行数与环对齐；暂停/换过滤/掉线/容量淘汰边界各有用例。

## 6. 风险与未决
- 事件契约从「带正文批次」改为「水位信号」，影响 `core/yohu-logsrv` + `app` + `@yohu/api` + UI store 与大量用例，属**跨层契约重构**，需按 Stage B 一起改、不能双轨。
- 过滤在 UI 后，`log.range` 返回原始行（比命中行多）；拉取量按「新行数」计，配合 150ms tick 仍可接受。
- 是否保留 core `WindowBook` 命中索引：改为纯 UI 过滤后可简化；但 `log/hits` 水位可由 ring `last_seq` 产生，WindowBook 可能退化为仅导出用。此点 Stage B 一并定夺。

---

**一句话结论**：当前「实时」是推送正文、环只做整页回补，这与 AS Logcat「环/文档为源、视图读环」不同，是切应用丢日志的模型根因。对齐做法是：**推送只做水位信号，UI 以全局 seq 游标从环实时拉取、过滤在 UI**。
