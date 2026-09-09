# 模块：命令终端

- 领域：`yohu-domain` 命令库 / `GroupExecutor`（多设备并行、组内串行；不判定成败、不延时、不因失败中断）
- 运输：`yohu-adb` 实现 `Runner`
- UI：`@yohu/module-terminal`；选择模式 `multiOptional`
- 数据：`DataRoot/modules/adb-terminal/config/library.json`（schemaVersion 2；损坏 `.corrupt-<ts>` 后写默认库）
- 编辑即快照：深拷贝、全量提交、取消零污染。命令只存名称 + 具体命令行（可含 `{0}`）；不配置成功/失败正则、输入提示、组内延时、失败中断
- 结果：统一输入/输出块（一次 `>>>` + 一条多行 `<<<`，标识 + 时间 + 内容），自上而下；空态在视口正中。库命令与发送栏同一 `send` → `terminal.exec`
- 发送栏：整栏收缩/展开；点预设命令在输入框上方排队；纸飞机发送队列与草稿。设置 `terminal_prepend_adb`（默认关）决定是否在发送前加上 `adb`
- IPC：`terminal.exec` / `group.run` / `group.cancel` / `commandlib.*`；进度 `group/progress`。`terminal.eval` 仍可按库 id 填充执行，UI 不走这条
