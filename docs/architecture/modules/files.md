# 模块：文件管理

- 能力 crate：`yohu-files`（browse / transfer / mutate）
- 安全根：`yohu-domain::SafetyRoot`（ADR-v6-013）；浏览 `check`；突变与传输 `check_descendant` + `validate_entry_name`；符号链接 `readlink -f` 复核
- UI：`@yohu/module-files`；`singleRequired`
- **路径槽：** `AddressSlot`。上级 + 一条槽。浏览态：面包屑 + 流内热区。点热区 / `Ctrl+L` 后输入同格从左向右揭开并全选；收回倒放同一条 clip，播完再卸。输入盒 `field-sizing: content`，短路径铺满槽，长路径按固有宽超出槽（槽当视野）。禁止 JS 测宽。提交走 `path-parse` → `path-guard` → `path-resolve` → `files.list`。解析/安全根失败或设备上不存在/不是目录/无权限：不改当前路径、不关输入，`YoToast` 提示（目录不存在为「没有这个目录，请重新输入」）。禁止路径栏上方错误卡片，禁止把 `ls` 退出码原文甩到 UI。core `FileError` + `classify_remote_stderr` 分类，壳 `ipc_file` 映射 `not_found` / `invalid_args`。`SafetyRoot` 仍强制校验
- **清单列：** 与日志同一套 YoUI 列架：`YoColFrame` + `YoColRow` / `YoColHeader` + `YoColTrack` / `YoColCell`。列宽走 `col-model` / `col-resize`，模块只 `setColWidth`，不进设置
- 传输：壳发号；Running 200ms `try_send`；终态必达；取消杀进程树；pull 失败删本机目标
- 拖拽：[文件拖拽-v6.md](../文件拖拽-v6.md)；IPC `files.dragOut`
- 右键：`files/src/menu.ts` → `openContextMenu`
