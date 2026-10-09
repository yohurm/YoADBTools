# 设计简报 — 文件浏览失败态与 Linux 投屏像素

- **状态：** 已被 [重设计-文件清单相位与Linux呈现.md](重设计-文件清单相位与Linux呈现.md) 取代。本页只留 2026-10-09 的因果记录，不再作为实现依据。
- **日期：** 2026-10-09
- **依据：** AVD `yohu_api34`（`google_apis`，TCG，首启未完成）与 `yohu_atd34`（`aosp_atd`，`sys.boot_completed=1`）上的实测；对照 ADR-v6-013 / 028 / 030 / 032 / 033 / 041。
- **不做：** 本简报不抬超时常数、不改脚本、不接解码器。实现按文末阶段，且先有接受过的 ADR 再动投屏像素。

## 1. 文件浏览

### 1.1 实测

| 条件 | 结果 |
|------|------|
| `google_apis` 首启未完成，`/sdcard` → `/storage/self/primary` 不存在 | 应用日志 `浏览 {"path":"/sdcard","count":0}`。面板「此文件夹为空」。`mkdir` 失败。 |
| 同一脚本在 adb 下重放 | `readlink -f` 打印目标且退出 0；`ls -lla /sdcard/` 退出 1（`No such file or directory`）；外层脚本退出 0。 |
| ATD 卷挂上之后，第一次进文件页 | `files.list` 03:16:54，20s 后 `浏览失败 {"error":"执行超时"}`。面板仍是「此文件夹为空」。 |
| 同一次会话里再刷新 | 03:20:08 `count:14`。右键新建目录后 adb 可见 `/sdcard/新建文件夹`，再列表 `count:15`。 |

两条失败不是同一个缺陷。卷没挂上时，core 把失败的 `ls` 当成空目录成功返回。卷挂上但客机很慢时，运输超时是真的失败，UI 把「没有快照的失败」画成空目录。

### 1.2 因果

```text
files.list
  → FileBrowser.list
       SafetyRoot.check
       DeviceShell.exec 或 oneshot（都是 build_list_script，预算 20s）
       readlink -f 祖先 walk
       ls -lla "${path%/}/"
       exit 0                          ← 不看 ls 的退出码
  → parse_list_output
       只有脚本退出码 ≠ 0 才算 LsFailed
       ls 段交给 parse_ls
       parse_ls 跳过 total / . / .. / 认不出的行（含写进 stdout 的 ls 报错）
  → 零条目 + Ok
  → UI remember(serial, path, [])
  → listingPaint(0, loading=false) = empty
  → 「此文件夹为空」
```

`readlink -f` 在 toybox 上对「链接本身存在、目标不存在」仍打印绝对路径并退出 0。脚本在第一次成功的 `readlink` 就停，`remainder` 为空，然后 `ls` 原始路径。安全根复核只查拼接后的字符串是否在根下，不查目录在不在。所以「目标还没挂上」和「目录真是空的」在协议上是同一种成功。

`FileError` 其实已经能分 `RemoteNotFound` / `NotADirectory` / `PermissionDenied`。`parse_list_output` 在退出码非 0 时会走 `LsFailed`，`fault.rs` 再按 stderr 分类。单测锁的是「退出码 1 + No such file」。生产脚本把这条路短路了。

超时是另一条路：

```text
DeviceShell.exec 满 20s
  → DeviceShellError::Timeout     （不进入 EXEC_ATTEMPTS 的 Failed 重试）
  → FileError::Adb(Timeout)
  → UI notifyCaught → errorTick → YoToast「执行超时」
  → 无快照则 clearEntries + markWarm + markIdle
  → listingPaint = empty
```

`listingPaint` 只有 `rows | empty | cold | pending`。`cold` 只在「无快照且仍在飞」时成立。失败处理先 `markWarm` 再 `markIdle`，冷启动标志被清掉，零行又不在加载，于是落到空目录。Toast 会消失，面板上的空态留下。有快照时失败会保留旧行，这条是对的，和 VS Code 的 stale-while-revalidate 一致。

缓存只在成功时 `remember`。超时不会把空列表写入 `dirCache`。但「假成功的零条目」会写入。下一次命中快照会先画出空目录，再等对账。ADR-v6-033 禁止用快照代替 `ls`，对账仍会跑；对账若再次假成功，空目录就停在那里。

20s 预算不是这次空目录的根因。ADR-v6-033 写的是 USB 上小目录 100–400ms，20s 是为慢传输留的。TCG 上 `DeviceStatusHub` 的 `dumpsys` 与浏览 shell 抢同一颗客机 CPU（033 已禁止把 dumpsys 接到浏览 shell，但没有禁止客机侧争用）。ATD 上第一次列表撞上这次争用而超时，客机闲下来之后同一次刷新约 10s 成功。把常数改成 60s 不能区分空目录和失败，也会把真死掉的 shell 钉在界面上更久。

### 1.3 别人怎么做

| 来源 | 做法 | 不抄什么 |
|------|------|----------|
| ddmlib `FileListingService` | `ls` 失败是 `ShellCommandUnresponsiveException` / 拒绝，不是空 `FileEntry[]`。条目树缓存成功结果。 | 不实现 `sync:` LIST。033 已否决。不在 Online 时预热。 |
| Android Studio Device Explorer | 工具窗附着才列目录；错误进通知；空目录与「列不出来」分开。 | 不自写 5037 客户端（008）。 |
| VS Code Explorer | 已解析目录可先画旧子节点；解析失败是节点错误，不是空文件夹。 | 不把快照当成跳过 `ls` 的许可。 |
| Finder / 资源管理器 | 空文件夹、路径不存在、操作超时是三种状态。超时可重试，不把文件夹标成空。 | 不在路径栏上再做一张错误卡片（文件模块现约）。 |

### 1.4 建议架构

保持 ADR-v6-008 / 033：官方 adb、`DeviceShell`、`ls -lla`、每次仍复核 `readlink`。补的是协议和绘制相位，不是另一套清单源。

**脚本契约。** `ls` 的退出码成为这一帧的退出码。`MARK_LS` 之后如果退出码非 0，现有 `LsFailed` → stderr 分类 → `RemoteNotFound` 等已经能走到 UI 的「没有这个目录，请重新输入」。合法空目录仍是退出码 0，且 `parse_ls` 丢掉 `.` / `..` 之后零条目。不要用「stderr 非空就失败」当主判据：警告行和真失败会缠在一起。退出码是主判据；单测要锁「目标不存在的符号链接」这一帧，不能只锁手写的 stdout。

**绘制相位。** `listingPaint` 增加 `fault`。无快照且这次 list 失败：停在 `fault`，文案用已经分类的 `filesFaultText`，主动作是再列一次。有快照且失败：继续 `rows`，Toast 保留。成功的零条目才是 `empty`。失败不 `remember`。假成功修掉之后，空目录缓存才是真的空目录。

**超时。** 单次预算维持 20s。`Timeout` 不进静默的双倍阻塞重试。界面停在 `cold` / `pending` 直到这一次结束，结束后是 `fault` 而不是 `empty`。用户再点刷新是重试。客机 CPU 争用记在 Hub 一侧，另案：状态采样在 shell RTT 变长时退让。那不是文件清单的错误分类。

**不改。** 不把 SYNC LIST 当清单。不在 UI 扫 `ls` stderr。不把 `LocalNotFound` 收成 `not_found`。不因进过父目录跳过 `readlink`。

### 1.5 实现阶段

1. 脚本退出码 + `parse_list_output` 单测（符号链接目标缺失 → `LsFailed` / `RemoteNotFound`；真的空目录 → `Ok` 且零条目）。
2. `listingPaint` 的 `fault`，以及「失败且无快照不得画空目录」的 store 测试。Toast 与相位同时存在：相位是留下的事实，Toast 只是提醒。
3. 慢设备上再看 20s。只有测量证明已启动完成的设备仍稳定超过 20s，才单独改预算。不与第 1 步捆在一起。

## 2. Linux 投屏

### 2.1 管道（现况）

```text
mirror.start
  → probe：Linux Caps { id: vaapi, hevc: false } → 会话用 H.264
  → push scrcpy-server，reverse localabstract，app_process
  → accept（ACCEPT = 15s）→ 设备名 / codec / 宽高
  → pump 解复用 Annex-B → FramePipe          ← 与 OS 无关，yohu-mirror
  → 壳 send BindPipe / AdoptContent / Layout
  → linux::spawn_surface
       spawn_unimplemented("vaapi")
       只回答 Screenshot = 当前平台没有投屏硬解
       其余 Cmd 丢掉
  → VaapiDecoder::open / feed 未调用（dead_code）
  → 舞台是一块纯色，没有 Present
```

会话 `Live` 在泵读到 session 头时发出，不等第一张图。Windows / macOS 随后在 `BindPipe` 里把同一条 `FramePipe` 交给硬解。Linux 把 `BindPipe` 丢掉，所以日志可以是 `投屏 Live codec=h264 width=720 height=1280`，舞台仍然没有像素。这是设计中的占位，不是握手失败。

### 2.2 实测

| 客机 | 握手 | 呈现 |
|------|------|------|
| `google_apis` 未完成首启 | 约 15.0s `等待设备连接超时`。隔离的 reverse 在 21.7s 才 accept。 | 未到解码。 |
| `aosp_atd` 已启动完成 | 服务端约 12.0s 打出设备行；`elapsed_ms=16140` 进入 Live；泵读到媒体包。 | 探针 `backend=vaapi hevc_ok=false`。进程内线程名 `mirror-present-…`。舞台采样是均匀灰，不是画面。 |

本机有 `libva.so.2`，没有 `/dev/dri`，没有 `vainfo`。只把占位换成 VA-API 硬解，在这台 VM 上仍然没有解码设备。

### 2.3 为什么是占位

ADR-v6-028：没有跨 OS 的硬解 ABI；禁止 FFmpeg / libavcodec / ffmpeg 的 vaapi 封装；Linux 本期不交像素；占位必须 `probe().id = vaapi`、`hevc = false`、截图错误可读。028 允许「该后端自己的」CPU NV12 软解回退，禁止把 packed NV12 做成默认跨平台路径。

ADR-v6-030：macOS 改为 VideoToolbox 出画时写明，不为 Linux 用 FFmpeg 或 OpenH264 冒充原生后端。

ADR-v6-032：Fit / Convert / Scale / Compose / Present。Fit 与 Stage 已与 OS 无关。Convert 以下在 Windows 是 Media Foundation + DComp，在 macOS 是 VideoToolbox + NSView。Linux 没有这四层。

ADR-v6-041：Linux 工作台交付；投屏像素仍不交付；主窗记下 `GtkWindow`，留给以后的表面。`spawn_surface` 仍是未实现。

### 2.4 方案与取舍

| 方案 | 能在这台无 DRM 的 VM 上出画 | 与现行 ADR | 代价 |
|------|------------------------------|------------|------|
| A. 维持占位，只把灰舞台改成明确失败 | 否 | 符合 028 / 041 | 不交像素。用户能看见「没有硬解」，而不是一块灰。 |
| B. libva VA-API + DMA-BUF，GTK 子表面铺满 avail | 否（无 `/dev/dri`） | 就是 028 预留的那条路；要新 ADR 才算「本期交付」 | H.264 VLD 要自己组 VA 的 picture/slice 参数。Intel/AMD 有渲染节点时零拷贝最好。NVIDIA 依赖不完整的 nvidia-vaapi。无设备时必须失败关闭，不能假装。 |
| C. Vulkan Video | 否 | 028 已拒绝用它替换 Windows 路径 | 覆盖比 VA-API 更窄，软光栅（SwiftShader）不解码。 |
| D. FFmpeg / libavcodec（vaapi hwaccel 或软解） | 是（软解） | 违反 028 / 030 / 032 / 041 | scrcpy、mpv 的实际做法。一个解码器覆盖硬解和软解。引入第二套媒体栈、包体积和许可证。 |
| E. Linux 后端自己的软解（OpenH264 或等价物），VA-API 只是快路径 | 是 | 擦过 028 第 4 条的「后端自己的 CPU 回退」，撞上 030「不用 OpenH264 冒充原生后端」 | 能在无 GPU 的 Linux 上出画。专利/再分发要单独看。不能把软解结果当成跨平台的 `Picture`。 |

WebCodecs 已由 028 否决（023 被 024 取代）。不重新打开。

### 2.5 建议

像素目标不要绑死在「这台 VM 的 VA-API」上。这台机器没有解码设备。建议分成两步决策，先写进新的 ADR，再写代码。

1. **会话与呈现分开报告。** `Live` 只表示 scrcpy 会话头到了。呈现未绑定、或绑定后解码器打开失败，舞台用失败态，文案走现成的 `当前平台没有投屏硬解` 或「没有可用的视频解码设备」。灰舞台不再是默认。这一步不引入解码库，但要改 041 里「占位可以静默」的后果。它不交付像素。
2. **Linux 像素的目标形状与 Windows / macOS 相同的五层。** `FramePipe`、`Cmd`、`Stage`、Fit 不动。Convert / Present 只在 `mirror_present/linux/`：
   - 有 VA-API H.264 VLD 入口：libva 直接解码，DMA-BUF 进 GTK 子表面。表面父级用 041 已记下的 `GtkWindow`。占用仍是 avail 铺满、dest = contain。禁止 FFmpeg 的 vaapi 封装。
   - 没有入口：按 ADR 的选择要么失败关闭，要么走该后端私有的 CPU NV12 软解再上传纹理。建议选软解，否则「Linux 是交付平台」在无 GPU 的桌面和这台 VM 上仍然没有画面。软解库如果是 OpenH264，必须在 ADR 里写明它不是原生后端的身份，只是 VA-API 缺失时的回退，并单独过许可证。不选 FFmpeg。
3. **15s accept 不是灰舞台的原因。** 未完成首启的客机上，服务端可以晚于 15s 才连上；已完成首启的 ATD 在 15s 内完成了会话头。超时常数留在健壮性附录：只有在「已启动完成的设备仍稳定超过 15s」时再改。不与解码 ADR 捆在一起。

### 2.6 实现阶段

1. 新 ADR（建议 v6-042）接受或拒绝「Linux 交像素」，并写明无 VA-API 时是失败关闭还是私有软解。未接受前不改 `linux.rs` 的解码行为。
2. ADR 接受「先可见的失败」之后：`spawn_unimplemented` 在 `BindPipe` 时把呈现失败送进现有镜像状态，UI 不再只剩一块灰。仍然没有像素。
3. VA-API Convert + GTK Present。探针从「常量 hevc=false」改成「打开设备之后的真实能力」。无设备保持失败关闭。
4. 仅当 ADR 选择了软解：在同一个 Linux 后端里，VA-API 打开失败时走 CPU NV12，再进入同一条 Scale / Compose / Present。不把这条路径接到 Windows / macOS。

## 3. 顺序

文件浏览的脚本契约和 `fault` 相位不依赖投屏 ADR，可以先做。投屏在 ADR 接受之前停在本简报。两件事都不要用「把超时调大」或「空目录文案改一句」代替上面的分界。
