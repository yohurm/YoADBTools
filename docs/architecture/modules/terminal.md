# 模块：命令终端

- 领域：`yohu-domain` 命令库 / `GroupExecutor`（多设备并行、组内串行；不判定成败、不延时、不因失败中断）
- 运输：`yohu-adb` 实现 `Runner`
- UI：`@yohu/module-terminal`；选择模式 `multiOptional`
- 数据：`DataRoot/modules/adb-terminal/config/library.json`（schemaVersion 2；损坏 `.corrupt-<ts>` 后写默认库）
- 编辑即快照：深拷贝、全量提交、取消零污染。组只存名称；命令只存名称 + 具体命令行（可含 `{0}`）；不配置标签、成功/失败正则、输入提示、组内延时、失败中断
- 结果：统一输入/输出块（一次 `>>>` + 一条多行 `<<<`，标识 + 时间 + 内容），自上而下；空态在视口正中。库命令与发送栏同一 `send` → `terminal.exec`。IO 行时间走 `@yohu/api` `formatDateTimeFromMs`（本地墙钟 `YYYY-MM-DD HH:mm:ss.SSS`），与日志同一形状；文件日期只到秒
- 发送栏：贴右双轴开合（`yohu-recipe-inline-end`：宽 compact↔100%，高 0fr↔1fr；空态跟随挤位）；点预设命令在输入框上方排队（`YoListPresence`）；纸飞机发送队列与草稿（空内容向右，有内容 `yohu-recipe-send-aim` 朝上）。composer 弱多行仍是 textarea（不做 YoTextArea）；DOM 复用 TextField 壳类（`yohu-text-field` / `__control` / `__input` + `yohu-focus-host`），模块 CSS 只留 resize / overflow / mono / 行高锁。结果区新 IO 块升起，清屏直切。流/排队首项身份走 Presence 宿主 `data-first`（含出场中），禁止点 `.yohu-presence`。设置 `terminal_prepend_adb`（默认关）决定是否在发送前加上 `adb`
- 占位符：单条命令 UI `fillTemplate` 后 `terminal.exec`；组与 `terminal.eval` 走 domain `CommandDefinition::fill`。两边共用 `core/yohu-domain/testdata/command_fill.json`（元数不一致则拒绝，值内 `{n}` 样文本按字面量）
- 命令管理：`YoDialog bodyOverflow="hidden" bodyPad="none"`。两栏 `YoToolbar pad="xs"`，禁止点 `.yohu-toolbar`。结果区 `YoPanel overflow="hidden"`。参数对话框只读受控 `values()`。禁止点 `__body` / `:has`，禁止 `querySelectorAll("input")`
- IPC：`terminal.exec` / `group.run` / `group.cancel` / `commandlib.*`；进度 `group/progress`。`terminal.eval` 仍可按库 id 填充执行，UI 不走这条
