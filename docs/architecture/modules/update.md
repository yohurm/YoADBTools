# 模块：应用更新

- 能力：**`yohu-update`**（产品用例）+ **`yohu-download`**（HTTP 落盘，ADR-v6-034）+ **`yohu-textparsing`**（说明纯文本，ADR-v6-036）
- 固定 GitHub Releases（`yohurm/Windows-YoADBTools`）；无更新源切换
- **公开仓用户不必配置 token**；检查顺序见 ADR-v6-035（manifest → Atom → Web Latest → REST 兜底）
- 仓库覆盖：环境变量 + `config/update.json`（不要把 PAT 打进安装包）
- 安装包：打 `vX.Y.Z` 标签 → workflow 挂 NSIS / DMG 到 Release
- IPC：`update.check` / `update.info` / `update.download` / `update.install` / `update.cancel` / `update.open`
- 事件：`update/progress`（字节 200ms 可丢；**阶段切换必达**）
- 不使用 `tauri-plugin-updater`
- UI：设置「关于」→ `updateStore` → `@yohu/api`；YoUI 零 IPC

## 分层（YoAgentDocs 桌面栈）

```text
View（UpdateDialogs / SettingsForm）
  → store（updateStore：对话框阶段、invoke）
  → @yohu/api（update.check / update.download / onUpdateProgress）
  → commands/update（薄转发）
  → update_runs（任务中心、cancel 槽、AppEvent 映射）
  → yohu-update（GitHub、semver、cache、apply）
  → yohu-textparsing（to_plain + TextFormat；仅说明）
  → yohu-download（HTTP fetch，仅 update 编排调用）
```

**禁止：** UI / `update_runs` / commands 内 reqwest；`yohu-download` 内 GitHub / NSIS；`yohu-update` 内嵌 HTML/Markdown 解析。

## 子域职责（`yohu-update`）

| 子域 | 文件 | 职责 |
|------|------|------|
| check | `check.rs` | 编排 Provider |
| github | `github/` | 分层 Provider（manifest / atom / web / api） |
| release | `release.rs` | 选 asset、semver、`RemoteUpdate`；说明 `yohu_textparsing::to_plain(..., Markdown)` |
| credentials | `credentials.rs` | `update.json` / env |
| url_policy | `url_policy.rs` | http(s) + **GitHub 主机 Bearer 范围** |
| cache | `cache.rs` | `cache/update/` 路径、安装包形态校验 |
| apply | `apply/` | NSIS 助手 / DMG |
| fetch 编排 | `fetch.rs`（或 `lib` 内） | `DownloadSpec` + 调 `yohu_download::fetch` |

## 下载链路（设计后）

1. `update.download` → **`spawn_download` 立即返回**（与 `files.pull` 同纪律；禁止 invoke 内 await 整段 HTTP，否则 WebView 收不到进度）
2. 后台 `download_configured(request)` → `yohu_download::fetch`
3. `installer_dest(url)` → 绝对 `dest`；`load_github_source` + `url_policy` 拼 `DownloadSpec`
4. 回调：`DownloadProgress` → `UpdateProgress`（`downloading` / `verifying` / `ready`+`installer_path` / `failed`+`message`）
5. 壳 `update_runs` → `AppEvent::UpdateProgress` → `update/progress`；UI `updateStore` 等 `ready` 再切安装对话框

## 覆盖安装

1. 安装包已在 `cache/update/` 且通过 `assert_cached_installer`
2. Windows：`/S /UPDATE /NS` 助手（见 ADR-v6-022）
3. macOS：打开 DMG

## Token

见 ADR-v6-022 / 下文 Token 表（与 as-built 一致）。
