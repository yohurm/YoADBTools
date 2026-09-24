# 模块：`yohu-download`（HTTP 文件落盘原语）

> 分层依据：YoAgentDocs `windows-desktop`（副作用在 domain/服务 crate）+ ADR-v6-034。

## 定位

| 项 | 说明 |
|----|------|
| crate | `core/yohu-download` |
| 职责 | 单次或带重试的 HTTPS/HTTP 大文件下载：`.part` → 校验 → `rename` |
| 不做什么 | GitHub API、semver、产品路径、NSIS、IPC、Tauri、adb |

## 设计前链路（问题，已替换）

```text
yohu-update 内嵌 reqwest 流式下载，与 GitHub 鉴权、缓存路径耦合。
```

## 设计后链路

```text
yohu-update::download_configured
  → 拼 dest（cache/update + 文件名）
  → url_policy 决定是否 Bearer
  → yohu_download::fetch(DownloadSpec)
       → stream_attempt（reqwest）
       → 失败且可重试 → 退避 → 再 fetch
  → 映射 DownloadProgress → UpdateProgress（带 version）
```

## 公开 API（概念）

```rust
DownloadSpec {
  url, dest, user_agent,
  headers,           // 调用方注入；update 放 Authorization
  expected_size,
  expected_sha256,
}
DownloadPhase: Streaming | Verifying | Complete
DownloadProgress { received, total, phase }
fetch(spec, cancel, on_progress) -> Result<DownloadOutcome, DownloadError>
```

## 文件职责（SRP）

| 文件 | 职责 |
|------|------|
| `spec.rs` | DTO：Spec / Progress / Outcome |
| `error.rs` | 传输错误分类（Network / Http / Cancelled / Checksum / …） |
| `policy.rs` | 通用 http(s) URL 校验 |
| `verify.rs` | SHA-256、体积上限 |
| `stream.rs` | 单次 HTTP 流写 `.part` |
| `fetch.rs` | 重试编排、短路与退避常量 |
| `lib.rs` | 门面 `fetch` |

## 常量

重试次数、退避毫秒、进度节流间隔、连接/读超时 — **只在本 crate**，不散落在 update 或 app。

## 测试

- 单元：URL 策略、SHA 空期望、resume 分类（若后续加 Range）。
- 集成：`127.0.0.1` 临时 HTTP 服务（与现 `yohu-update` 夹具同思路，迁移后 primary 在 `yohu-download`）。

## 消费者

- **当前：** `yohu-update`（安装包下载）
- **未来：** 任意 core 能力需 HTTP 落盘时只依赖本 crate，不得复制 reqwest 流
