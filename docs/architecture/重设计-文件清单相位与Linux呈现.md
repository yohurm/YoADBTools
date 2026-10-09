# 重设计 — 文件清单相位与 Linux 呈现

- **状态：** 重设计。不是 ADR，未改产品代码。投屏像素在新 ADR 接受之前不动解码器。
- **日期：** 2026-10-09
- **取代：** [设计简报-文件浏览与Linux投屏.md](设计简报-文件浏览与Linux投屏.md) 里的建议。那一页的实测因果仍然有效，实现以本页的状态机为准。
- **核对：** 同日 ATD（`yohu_atd34`，`sys.boot_completed=1`）全模块核对见 `docs/testing/Linux功能核对清单.md`。Live 720×1280、舞台纯色、拖出文案、`/data` 安全根拒绝，都与本页模型一致。

## 1. 现状怎么接上

两件事都已经有分层。缺的不是另一条管道，是把「成功的零」和「失败」，以及「会话头到了」和「表面画出了一帧」，写成不同的相位。

### 1.1 文件浏览

依赖方向仍是 ADR-v6-005 / 008 / 012 / 013 / 033：UI 不扫 `ls` stderr，core 不引用 Tauri，清单源不是 `sync:` LIST。

```text
FileView attachView
  → files.session.attach                         ADR-v6-033
       BrowseAttach { serial, generation, adopted }
       槽位 Empty / Starting / Live
  → files.list(serial, path, generation)
       browse_runs：世代不符 Cancelled；Starting 同代等待；Live 同代才列
  → FileBrowser.list
       SafetyRoot.check                          ADR-v6-013
       DeviceShell.exec（或握手 Unsupported 之后的 oneshot）
       build_list_script                          core/yohu-adb parse/browse.rs
            readlink -f 祖先 walk
            ls -lla "${path%/}/"
            exit 0                                ← 不看 ls 退出码
       parse_list_output
            脚本退出码 ≠ 0 才是 BrowseParseError::LsFailed
            退出码 0：parse_ls 丢掉 total / . / .. / 认不出的行
  → file_error_from_browse_parse                  core/yohu-files fault.rs
       LsFailed + stderr「No such file」→ FileError::RemoteNotFound
       ResolveFailed → RemoteNotFound
  → ipc_file：RemoteNotFound → not_found
  → fault.ts filesFaultText
       not_found → 「没有这个目录，请重新输入」
  → listing.ts loadListing
       成功 remember(serial, path, entries)
       失败 notifyCaught（Toast）
       无快照则 clearEntries + markWarm
  → listingPaint(count, loading, cold)           listing-paint.ts
       rows | empty | cold | pending
       count = 0 且 loading = false → empty → 「此文件夹为空」
```

`FileError` 已经能分 `RemoteNotFound` / `NotADirectory` / `PermissionDenied` / `ReadOnly` / `Adb(Timeout)`。单测锁的是「退出码 1 + No such file」。生产脚本在 `ls` 之后无条件 `exit 0`，这条分类走不到。

`readlink -f` 对「链接在、目标不在」仍打印绝对路径并退出 0。脚本就此停住，再 `ls` 原始路径。安全根复核只看拼接后的字符串（`guard.rs` `recheck_resolved`），不看目录在不在。所以「卷还没挂上」和「目录真是空的」都是 `Ok` 且零条目，并且 `remember` 进 `dirCache`。

超时是另一条已经分类的失败：`BROWSE_LIST_TIMEOUT_MS = 20_000`，`DeviceShellError::Timeout` 不进 `EXEC_ATTEMPTS` 重试。UI Toast「执行超时」之后仍 `markWarm` + `markIdle`，零行落到 `empty`。有快照时保留旧行，这一支是对的。

ADR-v6-033 禁止：用快照代替 `ls`、跳过 `readlink`、自写 `sync:`、把 Hub 的 `dumpsys` 接到浏览 shell。`DeviceShell` 是 008 的补偿（一条 `adb shell -T` 上多趟 `exec`），不是第二份 5037 客户端。

`/data` 不进这一缺陷。`goTo` 在 `resolveRemotePath` 里就被安全根拒绝，路径不变，Toast「路径不在安全根内」。核对清单上这一条已经通过。

### 1.2 投屏：三套钟

| 钟 | 现在记在哪 | 什么时候为真 | Linux 上实际 |
|----|------------|--------------|--------------|
| 会话 | `MirrorSessionState`：`Starting` / `Live` / `Stopped` / `Failed`（`yohu-protocol`）。`emit_live` 在 `session.rs` 读完 scrcpy 会话头之后立刻发 | 隧道、codec、宽高到了。不等第一张图 | ATD 上约 12–16s 进入 Live，H.264 720×1280 |
| 面板 | `ui/.../mirror` 的 `phase`，加上 `control-ready.ts` | 「开始/停止」只看 `phase === live`。截图和设备键看 `mirrorPictureReady` = Live 且 `hasFrame`。暂停和全屏只看 Live | Live 后钮是「停止」，徽章 `720×1280`，没有 fps。截图和设备键保持禁用。暂停和全屏会亮 |
| 呈现 | `Stage.bound` 只在 Windows/macOS 的 `BindPipe` / `UnbindPipe` 写入。`stage_mode`：bound 且有帧 = Video；bound = Loading；否则 Empty。文案在 `stage_copy.rs` | `mirror/painted` 才把 `hasFrame` 设真，fps 才出现 | `linux.rs` `spawn_surface` → `spawn_unimplemented`。除截图（「当前平台没有投屏硬解」）和 Shutdown，其余 `Cmd` 丢掉。`bound` 永假，铬不画。洞是透明的，看到页面底色 |

管道仍是 ADR-v6-015 / 024 / 028 / 032：

```text
yohu-mirror
  probe Caps { id: vaapi, hevc: false } → 会话 H.264
  push scrcpy-server，reverse localabstract，app_process
  accept（ACCEPT = 15s）→ 会话头 → emit_live
  pump 解复用 Annex-B → FramePipe          与 OS 无关
壳 mirror_present
  attach → BindPipe + AdoptContent
  layout → ensure_surface + Layout
  Linux：命令被丢掉
  Windows：MF + DXGI，五层 Fit / Convert / Scale / Compose / Present
  macOS：VideoToolbox + NSView（ADR-v6-030）
```

`FramePipe`、Fit（`scale.rs` `present_dest`）、`Stage` 文案表已经与 OS 无关。Convert 以下在 Linux 不存在。ADR-v6-041 把 Linux 工作台交付了，像素和拖出仍预留，主窗记下 `GtkWindow` 给以后的表面。`spawn_surface` 仍是未实现。

面板不 Toast `state.error`。`showFailure` 只覆盖夜览、截图对话框和质量写入。所以「等待设备连接超时」、「从未开始」和「Live 但没有像素」在舞台上看起来都是同一块灰。核对清单把前一种标成舞台文案失败，把像素标成阻塞。

拖出不在本页重做。ADR-v6-041 / 030：Linux 返回「拖出仅支持 Windows 与 macOS」。核对已见到这句 Toast。

## 2. 对照之后借什么

### 2.1 空目录和列失败

| 来源 | 他们怎么分 | 借 | 不借 |
|------|------------|----|------|
| ddmlib `FileListingService` | `ls` 失败是异常或拒绝，不是空的 `FileEntry[]`。缓存只留下成功的孩子 | 退出码决定这一帧是不是清单。成功的零条目才缓存 | 不实现 `sync:` LIST。不在 Online 时预热。不抄根目录白名单把别的顶层目录静默丢掉 |
| Android Studio Device Explorer | 工具窗附着才列。壳命令失败进错误（「Error executing shell command」），不是把节点画成空文件夹 | 附着会话（033 已经这样）。错误留下，空文件夹另说 | 「Nothing to show」是解析失败时的坏结果，不抄。那和我们现在的「此文件夹为空」是同一类谎 |
| VS Code Explorer | 已解析目录可以先画旧子节点。解析失败是节点错误，不是空文件夹 | 有快照时失败仍画旧行，只 Toast。无快照时是错误相位 | 不把快照当成跳过 `ls` 的许可（033 已禁止） |
| Finder / 资源管理器 | 空文件夹、路径不存在、操作超时是三种界面。超时可重试 | 三种相位。超时的主动作是再列一次 | 不在路径栏上方再做一张错误卡片（文件模块现约：错误走 Toast，相位留在清单区） |

退出码是主判据。不用「stderr 非空就算失败」：警告和真失败会缠在一起。`parse_ls` 继续跳过认不出的行，但那只发生在退出码 0 的成功帧里。

### 2.2 会话活着、画面没有

| 来源 | 他们怎么分 | 借 | 不借 |
|------|------------|----|------|
| scrcpy（Genymobile，`doc/video.md`，demuxer / decoder） | 解复用收到 session 包只填宽高。解码器打不开就 `stream disabled` 并打错误日志，帧不再进显示 sink。`--hwdec=vaapi` 打不开时，显式指定就不回退；`auto` 才落软件 | 三拍：会话头、解码器打开、第一帧进 sink。打不开就明确失败，不把窗口当成已经在播 | 不借 FFmpeg / `libavcodec`，也不借它的 vaapi `hw_device_ctx`。028 / 030 / 032 / 041 禁止用它填 Linux。他们把硬解帧再 `av_hwframe_transfer_data` 回 CPU 再交 SDL，和我们要的零拷贝表面相反 |
| scrcpy 早期 VA-API PR（#1894） | 作者自己写明：经 FFmpeg 把 VA 表面下载到内存会增加几十毫秒，VLC 才是把 VA 表面直接交 OpenGL | 呈现要吃 DMA-BUF / 表面，不要先下载成 packed NV12 再当跨平台 `Picture` | 那条 PR 的实现本身是 FFmpeg，不移植 |
| 本仓库 Windows / macOS | `BindPipe` 才把 `Stage.bound` 设真。没绑定是 Empty（「未开始」或「启动失败」+ 原因）。绑定了没帧是 Loading（「启动中」或「等待画面」）。有帧才是 Video，暂停才写「已暂停」 | 铬的句子已经在 `stage_copy.rs`。Linux 不该再写一套文案 | 不在 Web 里用 CSS `contain` 冒充占用（027 / 032） |
| mpv / GStreamer / libplacebo | 硬解和显示拆开，VA-API 可以零拷贝进 GL | 只借「解码器失败是一等状态」 | 032 否决 libplacebo、FFmpeg、`libswscale`、GStreamer、libyuv 进直播路径 |
| Vulkan Video | 另一套硬解入口 | 不作为 Linux 身份。028 已拒绝用它替换 Windows。无渲染节点的机器上软光栅不解码 | |
| WebCodecs | 浏览器解码 | 023 已被 024 取代。不重新打开 | |
| OpenH264 | Cisco 的 BSD 源码，外加只覆盖「最终用户单独下载官方二进制」的 AVC 专利授权。打进 `.deb` 不满足「separate download」 | 不作为 `Caps.id`，不打进安装包。030 写明不用它冒充原生后端 | 若将来单独立项做「后端私有 CPU 回退」，再写 ADR，并单独过专利授权。本页不选它 |

028 第 4 条允许「该后端自己的」CPU NV12 软解回退，同时禁止把 packed NV12 做成默认跨平台 `Picture`。那是口子，不是本期交付。无 `/dev/dri` 的机器要先失败关闭，让用户看见原因。软解是下一次 ADR 的选择，不是这一次顺便接上。

## 3. 文件清单重设计

保持 008 / 013 / 033。补协议和绘制相位。

### 3.1 脚本契约

`ls` 的退出码成为这一帧的进程退出码。标记行仍然先打出，解析器才能切出 `resolved` / `remainder`。

```text
echo MARK_RESOLVED / resolved / MARK_REM / remainder / MARK_LS
ls -lla "${path%/}/"
ls_status=$?
if [ "$ls_status" -ne 0 ]; then
  exit "$ls_status"
fi
exit 0
```

`parse_list_output` 在见到 `MARK_LS` 且 `exit_code != 0` 时已经返回 `LsFailed`。不改这个分支的形状。要补的测试是整段脚本，不是手写一份退出码 1 的 stdout：

| 帧 | 结果 |
|----|------|
| 符号链接在、目标不在（`/sdcard` → 未挂载的 primary） | `LsFailed`，stderr 含 No such file → `FileError::RemoteNotFound`。不 `remember` |
| 目录在，且只有 `.` / `..` | 退出码 0，`entries` 为空，`Ok` |
| `readlink` 一直到 `/` 都失败 | 现有 `MARK_FAIL` / `ResolveFailed`，仍是 `RemoteNotFound` |
| 退出码 0，stdout 里夹一行认不出的警告 | 仍是成功；`parse_ls` 跳过该行。不用 stderr 非空推翻退出码 |

### 3.2 绘制相位

`listingPaint` 增加 `fault`。输入不再只有 `(count, loading, cold)`。失败是会话上的一位，和行数分开。

```text
有快照且 count > 0           → rows     刷新中也画旧行
无快照、在飞、cold           → cold     YoLoading「正在读取目录」
无快照、在飞、不是 cold      → pending  表头在，不铺空态
在飞结束、成功、count = 0    → empty    「此文件夹为空」
在飞结束、失败、没有可画快照 → fault    文案 = filesFaultText，主动作 = 再列一次
在飞结束、失败、仍有快照     → rows 或 empty（快照那一相），另 Toast
```

`loadListing` 的 `catch`：

- `notifyCaught` 仍走 Toast。Toast 会消失，相位留下。
- 无快照：不要 `clearEntries` 之后只 `markWarm`。置 `fault`，条目保持空，但不进入 `empty`。
- 有快照：继续画快照，不 `remember` 这次失败。
- 成功：清 `fault`，再 `remember`。成功的零条目可以进缓存。失败的零条目不能。

`goTo` 的安全根拒绝保持今天的行为：不改路径、不关输入、不发 `files.list`。那不是 `fault` 相位，因为清单没有被换掉。

超时维持 20s。`Timeout` 不进静默双倍重试。界面在飞时停在 `cold` / `pending`，结束后是 `fault`（「执行超时」），不是 `empty`。用户再点刷新才是重试。客机上 `dumpsys` 和浏览抢 CPU 仍记在 Hub，不靠加长预算区分空目录和失败。只有测量证明已启动完成的设备仍稳定超过 20s，才单独改预算，不和退出码捆在一起。

### 3.3 不改

不把 SYNC LIST 当清单。不在 UI 扫 stderr。不把 `LocalNotFound` 收成 `not_found`。不因进过父目录跳过 `readlink`。不在路径栏上加错误卡片。不把 `listingPaint` 的 `fault` 做成第二套 `FileError`。

### 3.4 阶段

1. 脚本退出码 + `parse_list_output` / `fault.rs` 单测（上表四行）。
2. `listingPaint` 的 `fault`，以及 store 测试：失败且无快照不得是 `empty`；失败且有快照不得清行、不得 `remember` 空列表。
3. 慢设备上再量 20s。不与第 1 步一起改常数。

这三步不依赖投屏 ADR。

## 4. 呈现诚实（仍不交像素）

041 说 Linux 不交像素、`spawn_surface` 仍未实现。它没有说 Live 之后舞台必须是一块没有句子的灰。灰是 `BindPipe` 被丢掉之后的后果：`Stage.bound` 永假，而铬只在原生表面的呈现线程里画。Linux 没有那条线程上的绘制。

这一节改的是绑定报告和面板闸门。不打开解码器，不链 `libva` 的 picture/slice。

### 4.1 呈现绑定

壳内增加与会话并列的绑定，不进 `yohu-mirror`，不进 UI 的 `phase`。

```text
PresentBind
  Idle       还没有 BindPipe
  Failed     BindPipe 到了，但这一平台画不了
  Loading    已绑定，还没有帧
  Video      已绑定，且有帧
  Paused     Video 之后用户暂停
```

`spawn_unimplemented` 在 `BindPipe` 时把绑定写成 `Failed(PresentError::Unimplemented)`，句子用已经存在的「当前平台没有投屏硬解」。`Layout` 仍不创建表面。截图请求继续回同一个错误。Windows / macOS 的 `BindPipe` 成功才进入 `Loading`，第一帧进 `Video`。`stage_mode` 继续由 `bound` 与 `has_frame` 推出；Linux 的 `Failed` 对应「有设备的 Empty，且 `error` 非空」——`stage_copy` 里就是「启动失败」或带原因的空态。这里用「启动失败」不准确，因为会话已经 Live。文案改成呈现失败自己的标题，例如「没有画面」，正文用 `PresentError` 的 Display。标题进 `stage_copy`，不在 Vue/Solid 里再写一遍。

`hasFrame` 仍只来自 `mirror/painted`。失败绑定不把它设真。

### 4.2 谁来画这句

026 规定空态、加载、暂停的像素属于嵌入表面。Linux 没有表面时，洞是透明的，句子没有地方画。

在 Gtk 子表面落地之前，允许 WebView 在 `.yohu-mirror__hole` 里画同一份 `stage_copy`：仅当 `PresentBind = Failed` 或会话 `Failed`。有原生表面的平台（Windows / macOS）洞保持透明，铬仍由呈现线程画。Linux 一旦有了子表面，删掉洞里的这份 Web 铬，回到 026。

不在洞上铺一张「未开始」来掩盖 Live。未开始只在 `PresentBind = Idle` 且会话不是 Live / Failed 时出现。Live + Failed 绑定必须看见原因。

会话 `Failed`（例如「等待设备连接超时」）同样进这句，不再只留在 `mirror/state` 里。面板可以继续不 Toast；相位本身留在舞台上。Toast 只留给夜览、截图保存、质量写入这些本来就有的路径。

### 4.3 面板闸门

| 控件 | 今天 | 重设计 |
|------|------|--------|
| 开始 / 停止 | `phase === live` | 不变。Live 仍表示会话头到了，钮是「停止」 |
| 分辨率徽章 | Live 且宽高 > 0；fps 仅 `painted_fps > 0` | 不变。没有帧就没有 fps |
| 截图、设备键 | `mirrorPictureReady`（Live 且 `hasFrame`）且控制通道 | 不变。失败绑定下保持禁用 |
| 暂停、面板内全屏 | 只看 Live | 改为呈现已绑定且不是 `Failed`。没有表面时这两个钮不亮，避免切到一个永远画不出的「已暂停」 |
| 仅显示、质量栏 | 设备已选且不在启动中 | 不变。质量仍是「下次开始生效」 |
| 指针 | `mirrorSessionAddressable` 不看 `hasFrame`，壳再把 `Cmd::Pointer` 丢掉 | 失败绑定时 UI 不再发 `mirror.pointer`。设备收不到触摸这一点要和钮一致 |

### 4.4 阶段

1. `PresentBind` 与 `spawn_unimplemented` 在 `BindPipe` 上报失败。单测锁：截图仍是「当前平台没有投屏硬解」；`BindPipe` 之后绑定是 `Failed`，不是永远 `Idle`。
2. 洞内只在无原生表面时画 `stage_copy`。Live + 失败绑定的文案测试：看得见原因，看不见「未开始」，也看不见一块没有字的底色当成完成。
3. 暂停 / 全屏 / 指针的闸门改到「已绑定且未失败」。截图和设备键继续等 `hasFrame`。

这三步不引入解码库。若要改 041 的措辞，只补一句：占位必须把「没有硬解」显示出来，而不是只在截图 API 里返回。像素仍不交付。可以写成 041 的补记，不必等到像素 ADR。

15s accept 仍不是灰舞台的原因。未完成首启的客机可以晚于 15s 才连上；已完成首启的 ATD 在 15s 内到了会话头。常数留到「已启动完成的设备仍稳定超过 15s」再改，不与本节捆在一起。

## 5. Linux 像素（先有 ADR）

建议新 ADR（编号等接受时再写入 `adr/README.md`）。未接受前不改 `linux.rs` 的解码行为，不链 `libva` 的 VLD。

### 5.1 要决定的事

Linux 的 Convert / Present 只活在 `mirror_present/linux/`。`FramePipe`、`Cmd`、`Stage`、Fit 不动。`Picture` 仍是该后端的关联类型，不提升成跨平台 packed NV12。

```text
有 VA-API 设备且 H.264 VLD 能打开
  → libva 直接解码（不经 FFmpeg 的 vaapi 封装）
  → DMA-BUF 或 VA 表面进入 GtkWindow 的子表面
  → 子表面铺满 avail，可见卡片 = contain dest
  → PresentBind：Loading → Video
没有设备，或 vaInitialize / 入口失败
  → PresentBind = Failed，正文说明没有解码设备
  → 不软件解码，不假装 vaapi id 已经出画
probe
  → id 保持 vaapi
  → hevc 改为打开设备之后的真实能力；打不开设备时仍是 false
```

五层在 Linux 上的归属：

| 层 | 归属 |
|----|------|
| Fit | 现成 `present_dest`。不选核 |
| Convert | `linux/` 里 libva H.264 VLD，1:1 到该后端的表面。不缩放 |
| Scale | 只在 `linux/`。缩小用面积核或 GPU 对已导入表面的缩放。不引入 libplacebo / libswscale / libyuv |
| Compose | 子表面里的卡片 = dest。不再算一遍 contain |
| Present | GTK 子表面翻页。父级用 041 已记下的 `GtkWindow` |

无 `/dev/dri` 的机器、以及只有 SwiftShader 没有 VA 入口的机器，停在第 4 节的失败绑定。这是本 ADR 的产品行为，不是缺测。

### 5.2 明确不选

| 方案 | 为何不在这一 ADR |
|------|------------------|
| FFmpeg / libavcodec / ffmpeg vaapi | 028、030、032、041 禁止。scrcpy 的 `--hwdec=vaapi` 走的就是这条，不移植 |
| 把 OpenH264 打进 `.deb` 当 Linux 后端 | 030 禁止用它冒充原生后端。Cisco 的专利授权还要求最终用户单独下载官方二进制，不能事先打进安装包 |
| Vulkan Video 作为 Linux 身份 | 覆盖更窄；无 GPU 时软光栅不解码。028 已拒绝用它替换 Windows 路径 |
| GStreamer、libplacebo、WebCodecs | 032 / 024 已否决 |
| 仅因为这台 VM 没有 DRM 就改用软件解码当默认 | 把「无设备」和「交付像素」缠在一起。无设备先失败关闭 |

后端私有的 CPU NV12 回退如果以后要做，另写 ADR：只在 VA-API 打开失败时走，不改变 `Caps.id`，不进 Windows / macOS，不把 NV12 缓冲放进 `yohu-mirror`。库的专利和再分发在那份 ADR 里单独写。本页不预先选 OpenH264。

### 5.3 阶段（ADR 接受之后）

1. `vaInitialize` 探针。有设备才把 `hevc` 从常量改成查询。无设备保持第 4 节的失败绑定。
2. H.264 VLD Convert + GTK 子表面 Present。占用仍是 avail 铺满、dest = contain。`mirror/painted` 从这条 Present 发出，`hasFrame` 和 fps 才开始为真。截图从最后一帧表面导出，不再走「未实现」。
3. 删掉洞里的 Web 铬。空态 / 失败 / 暂停回到原生表面，与 Windows / macOS 同一 `stage_copy`。

## 6. 顺序

1. 文件清单的退出码和 `fault` 相位。不依赖投屏。
2. 呈现绑定与洞内失败文案，暂停 / 全屏闸门。不交像素。需要的话给 041 补一句「占位必须可见」。
3. 新 ADR 接受或拒绝「Linux 用 libva 出像素，无设备则失败关闭」。
4. 只有 ADR 接受之后才做第 5.3 节。

不把「超时改大」「空目录文案改一个字」「灰底上盖一句 CSS」当成上述分界的替代。
