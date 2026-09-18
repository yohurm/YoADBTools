# 模块：投屏

- 能力：`yohu-mirror` 解复用 + 槽位；壳 `mirror_present` 编译期系统硬解呈现（ADR-v6-024/026/027/028/032；Windows = MF）
- 官方未改 `scrcpy-server` 4.1 sidecar；禁止拉起 `scrcpy.exe`（ADR-v6-015）
- 槽位与采集同构：仅 Live adopt；`mirror/state` 必达；首帧 `mirror/painted`
- 长驻 `app_process` 的杀树走 `yohu_runtime::kill_tree`

## 管道

```text
设备 MediaCodec（协议：usb / wifi；USB 优先 HEVC）
  → ADB reverse 或 forward（可 warmup 预挂）
  → yohu-mirror 解复用 + FramePipe（sticky last config；8 帧，先丢 delta；呈现线程直取）
  → 壳 AnnexBDecoder（编译期后端；Windows = MF 硬件 MFT + DXGI）
  → 壳解码座（跟 start/stop；共享 D3D11 设备 + PictureBank）
  → 壳表面 Present（Windows = Fit dest + VP Convert 1:1 + 面积 Scale + DComp Compose + 交换链 Present）
```

core 零 Tauri：`FramePipe` 在 `yohu-mirror`；解码 / 窗体 / GPU 只在 `yohu-adbtools`（ADR-v6-028）。macOS VideoToolbox / Linux VA-API 预留，本期不交付像素。

### 设计前（切模块丢画面）

```text
mirror.start → PresentHost.attach → 呈现线程 DecodeBind + MF（跟 HWND）
离开模块 → setActive(false) → Shutdown → DestroyWindow → drop DecodeBind
回来 → View onMount invalidateLayout / rearm_config / last_layout 回放
```

问题：已声明两段寿命，实现把解码座放在 HWND 线程；补丁用一次性 pending + UI 去重清键盖时序。

### 设计后（切模块丢画面）

```text
mirror.start → DecodeSeat（共享 D3dDevice + FramePipe.sticky_config）→ PictureBank
离开模块 → DestroyWindow；座与槽留下
回来 → 身份变化同一拍 setActive(true) + 同一拍挂载 MirrorView，用上次可呈现 avail 建窗
  同一拍 Layout + Bind + Adopt 后才 flush 占用：bank 命中则 None→Dest = Follow
  Bind 若 PictureBank 已有同代画面：resume Video + 立刻 Present，禁止 Loading→Fill
  chrome / 描边画在当前可见 clip，不用 dest 终态
  隐藏 layout 不得覆盖可回放 avail
  View 卸载 leaveAvail（visible=false）；lastInsetKey 不去重清键当 HWND 修复
HEVC 同代回退 → FramePipe.reset_content（不清 close）→ 解码座按 codec 重建 MF
```

不做什么：不在 HWND 线程 `rearm_config`；不在 View 清 `lastInsetKey` 当修复；不把 VP 失败永久改成 YUV shader 一次缩放。

### 设计前（占用黑边与清晰度）

```text
yohu-mirror session 包 → EncodedFrame 1220×2712 → Live 事件（UI 只用状态）
DecodeTick.publish(MfDecoder.width)     # STREAM_CHANGE 后常是 1248×2720
PictureBank / Stage.set_video_size      # 占用 clip、描边、dest 跟解码器
Gpu.present_gpu_nv12                    # 再用纹理 desc 覆盖 video_w/h
Stage.dest = occupancy(contain) + fit_letterbox(纹理, 占用)   # 第二次 contain
VP 源矩形 = 整张纹理（含对齐填充）
1:1 RGB 建在 1248×2720，再 mip 到按 1220 或 1248 算的 dest
```

问题：内容 / 纹理 / 占用三套尺寸搅在一起。描边跟较胖的纹理走，框对不上手机；填充画进卡片变成框内黑边；再 contain 一次把比例拧歪，缩小更糊。

### 设计后（占用黑边与清晰度）

```text
内容尺寸（唯一）= session 包
  MediaLoop → EncodedFrame.width/height
  → Live 事件：events.rs → PresentHost.adopt_content（Loading 即可收 clip）
  → DecodeTick 发布 ReadyFrame.content_*（禁止发 MfDecoder / VT 输出尺寸）
Stage.occupancy = contain(avail, 内容)（尽量多像素；框跟 dest）
Stage.dest = 同一份 contain；crop = session 内容
Gpu：纹理 desc 只建资源；SourceRect 与 RGB = crop（1:1，无 mip）
     缩小：每个 dest 像素面积平均其源矩形（3×3）
     1:1 / 整数放大：点采样
触控仍映射到 session 内容
```

不做什么：不把 `even_px` / 纹理 desc 写回 Stage；不恢复 YUV shader dest-rect；不保留整数栅格 dest 与 contain 双轨；View 仍只报 avail；不为「清晰」再砍 `max_size`。

实现后（边框，真机 NEPI4E0106，avail 1008×991，2026-09-15）：

```text
Live 1220×2712 → adopt_content → clip 跟内容比
GPU texture=1248×2720 裁源；纹理填充不进卡片
```

### 设计前（清晰度 / 显示栅格）

```text
Stage.occupancy = contain(avail, 内容)     # 1008×991 → 446×991，比例 0.37
Gpu：1220×2712 1:1 RGB → GenerateMips → 线性采样到 dest
lod ≈ log2(2712/991) ≈ 1.45 → 混 610 与 305 两级
integer_fit 只在放大；缩小永远走 mip
```

问题：糊的是核，不是 contain。mip 把 2.73× 混到 1/4 级；整数 1/3 dest 少画像素。LOD bias / 最近邻都是补丁。

### 设计后（清晰度 / 缩小核）

```text
present_dest（OS 无关）
  dest = contain(avail, 内容)     # 1008×991 → 446×991
  crop = session 内容
Gpu：VP 裁到 crop，RGB = crop，无 mip
     缩小：面积核盖住每个 dest 像素的源矩形
     1:1 / 整数放大：点采样
触控仍映射到 session 内容
```

不做什么：不保留 mip / 整数栅格 / contain 多轨；不用 VP 一次双线性压到 dest；不改 `max_size=0`；View 仍只报 avail。

整数 1/3 dest（406×904 + 最近邻）已否决：少画显示器像素。`GenerateMips` 已否决：lod 混到 305。

实现后（清晰度，真机 NEPI4E0106，avail 1008×991，2026-09-15）：

```text
clip 446×991（contain，不是 406×904）
GPU 面积缩小 crop=1220×2712 dest=446×991 nearest=false 无 mip
纹理 1248×2720 只被裁；编码仍是 session 1220×2712
```

`mirror.start` 只传 `serial/control/connection/session_quality_touched`；编码参数由壳从 `yohu-domain` 解析。

### 设计前（呈现分层）

```text
View 只报 avail → store → IPC → commands → PresentHost
Stage.dest = present_dest                    # Fit 已独立
Gpu（windows/gpu.rs 神文件）
  VP YUV→RGB 1:1                             # Convert
  内联 PS_RGB 3×3 面积核                     # Scale
  DComp clip + 描边                          # Compose
  swapchain Present                          # Present
macOS view.rs：kCAFilterLinear 当缩小核
```

问题：核与 HWND/D3D 同文件；改清晰度必须碰交换链主人。十份源码（libplacebo / mpv / moonlight / OBS / Magpie / zimg / libyuv / swscale / GStreamer / MiniEngine）都把 dest 与核拆开。

### 设计后（呈现分层，ADR-v6-032）

```text
View → store → IPC → commands
  Stage          占用 / 模式 / chrome
  Fit            present_dest → Letterbox     # scale.rs，已有
  Convert        YUV crop → RGB crop 1:1      # 独立文件；VP 不缩放
  Scale          kernel(src, dest)            # 独立文件 + HLSL；不改 dest
  Compose        clip / 卡片 = dest
  Present        交换链 / NSView contents
```

Fit 不选核。Convert 不改 dest。Scale 看不到垫过的纹理。Compose 不再 contain。一次替换神文件职责，无 mip / 整数栅格 / 面积 双轨。

实现后（Windows，2026-09-15）：

```text
Fit      mirror_present/scale.rs          present_dest + scale_kernel
Convert  windows/convert.rs               VP YUV→RGB 1:1 + SourceRect
Scale    windows/scale.rs                 PS_RGB 3×3 面积 / nearest
Compose  windows/occupancy.rs + chrome    clip / 描边 = dest
Present  windows/present.rs               ResizeBuffers / Present
装配     windows/gpu.rs                   不含 HLSL、不含 VP
macOS    macos/scale.rs                   按 Letterbox 设 CA 核
```

## 投屏协议

| 协议 | 长边 | 码率 | max_fps | 编码 | 何时 |
|------|------|------|---------|------|------|
| usb | 0（原始） | 16 Mbps | 0（不限） | h265（失败 h264） | USB 默认 |
| wifi | 1280 | 4 Mbps | 30 | h264 | `connection` 以 `tcp:` 开头且本会话未改质量 |

选协议写入上表。改长边 / 码率 / 帧率不另立协议。`max_size=0` 表示设备原始，**不再封顶 1920**。`max_fps=0` 不向 server 传帧率上限。server 传 `ignore_video_encoder_constraints=true`（scrcpy 4.1），避免 MediaCodec 上报上限把原始尺寸裁掉。

## 呈现

- 占用：舞台是透明洞。Windows：HWND 铺满主窗客户区且不参与命中（创建即 `WS_DISABLED`）；可见占用卡片是 DComp clip（Fill=avail，Dest=contain）。操作走 `mirror.pointer`（与 layout 同一主窗客户区坐标）。Fill→Dest 走 `SpatialPanel`，Dest→Fill 走 `SpatialEnter`（ADR-v6-027）。呈现五层见 [ADR-v6-032](../adr/ADR-v6-032.md)。内容尺寸只来自 scrcpy session 包。框跟 dest。HWND 是主窗 **WS_CHILD**。UI 只报 `.yohu-mirror__avail`。Live 即 `adopt_content`。硬解纹理可更大：VP 裁到内容，RGB=内容，**禁止 GenerateMips**；缩小用面积核，禁止整数缩小 dest。禁止运行时 UI `containInZone`、禁止 CSS 占用过渡、禁止侧栏 `SetWindowPos`
- `mirror.present.setActive`：工作台拥有舞台开关。`false` 立刻 `DestroyWindow`。未激活时 `mirror.layout` 不得建窗。
- `mirror.layout`：客户区物理像素 `{x,y,w,h,visible,…}` + 会话旗标 `{dpr,fullscreen,paused,control,has_device,failed,error,dark}`。`dark` 跟工作台 `data-theme`。报稳定 avail 格子，不是 contain 目标，不是视觉插值盒。禁止 `video_width` / `stroke_px` / `epoch`。编码尺寸只来自 FramePipe；present 在 stop 后保留上次尺寸
- `mirror.pointer`：avail 上报 down/move/up/leave + 主窗客户区物理坐标。UI 不算 dest；Stage `dest()` 映射后 `inject`
- 显示矩形在 `present_dest`：contain 一次算完。VP 只做 1:1 YUV→RGB（内容）。缩小是面积核。禁止 mip 链、禁止整数缩小 dest、禁止 VP 一次双线性压到 clip、禁止 YUV shader dest-rect。离开投屏页 `DestroyWindow`。解码座与 `PictureBank` 跟 start/stop。`setActive(true)` 用上次 avail 建窗。`FramePipe.sticky_config()` 会话级 SPS/PPS；同代 HEVC→H.264 先 `reset_content`。禁止 `rearm_config` / View `invalidateLayout`
- 拖拽主窗：子窗自动跟；改尺寸在 owner `WM_WINDOWPOSCHANGING` 瞬时把 HWND 铺满主窗客户区并 `ResizeBuffers`。侧栏改 avail：只改 DComp clip 与回缓冲，禁止 `SetWindowPos`。面板内全屏只藏操作栏/功能栏，页眉可点，Esc 退出。`SetWindowPos` 禁止 `SWP_NOCOPYBITS`
- **舞台占用（ADR-v6-026）：** HWND 生命周期跟「当前模块是不是投屏」走（`mirror.present.setActive`），解码管道跟 start/stop 走。`Stage.mode` 决定回缓冲主人：Empty/Loading/Paused 每拍 Present 铬（文案、surface、描边）；Video 每拍 Present 帧。描边与铬画在当前可见 DComp clip 内侧，色走 `--yohu-border-strong`。呈现线程一拍 Cmd 排空后再 `flush_occupancy` 一次。禁止 dirty 一次画铬、禁止动画期跳过描边后不再 Present。浅色空态图标走 `fg` + `surface-2` 井。WebView 舞台是透明洞，不是 YoPanel。停止投屏不解 HWND，`unbind` 后 Dest→Fill 走 `OccupancyMotion::DestToFill`（`SpatialEnter`）。离开投屏页由工作台在淡出**之前**关舞台；进出投屏同一拍挂载/卸载 `MirrorView`。禁止 View 观察 Presence / 用 layout 代际补丁挡在途包
- **呈现类型（两段寿命）：** `Stage`（OS 无关）是占用/模式/chrome 的唯一开关，`bound` 只在 BindPipe/UnbindPipe 写入。Windows 上 `Host` 持交换链+Stage+输入（跟 HWND）；`DecodeSeat` 持 FramePipe+MF+共享 `D3dDevice`（跟 start/stop）。呈现线程只调度 `Cmd` 并从 `PictureBank` 取帧，禁止在 HWND 线程重建解码器，禁止 `rearm` / layout 代际补丁
- 截图：`mirror.screenshot` 按视频分辨率从 last NV12 纹理导出（不是交换链 letterbox）
- 实测 fps：1s 窗口已 Present 帧，进状态栏右槽，不盖画面

### 设计前（舞台铬）

```text
Win chrome.rs / mac view.rs 各写
  gap = (title * 0.75).max(8)
  block = icon + gap + title + gap * 0.5 + body
  行盒 title*1.4 / body*2.6 / gap*0.35
  inset 16 / 24
Gpu::new letterbox_argb = 0xFFFFFFFF
tokens::STAGE_LIGHT_SURFACE = 0xFFFFFFFF
```

问题：同一公式两份；行盒与 inset 仍在各端；浅色 letterbox 与 token 双写。

### 设计后（舞台铬）

```text
Stage.chrome_stack(icon, title, body)
  gap = (title * 0.75).max(Spacing.Sm)
  title_box = title * 1.4
  body_box = body * 2.6
  after_title = gap * 0.35
  title_inset = Spacing.Lg
  body_inset = Spacing.Xl
  block = icon + gap + title + gap * 0.5 + body
Win chrome.rs / mac view.rs 只消费栈字段
  D2D 画框 / AppKit setFrame 不写 16/24/1.4/2.6/0.35

Gpu::new letterbox = tokens::STAGE_LIGHT_SURFACE
Host 运行时写入 stage.letterbox_argb()（浅色即同一 token）
```

不做什么：不在 gpu 再写一份 ARGB；不在各端复制行盒。

### 设计前（截图 PNG）

```text
windows/host.rs screenshot：BGRA→RGBA + png::Encoder
macos/host.rs write_bgra_png：同一套 BGRA→RGBA + png::Encoder
```

问题：编码各写一份。

### 设计后（截图 PNG）

```text
Host 只提供 BGRA + 路径
  Win：Gpu.screenshot_bgra
  mac：Picture.copy_bgra
  → mirror_present::png::write_bgra_png
    BGRA→RGBA + png::Encoder
```

不做什么：不在 windows/host 与 macos/host 各写一份编码器。

## UI

`@yohu/module-mirror`；默认可操作；页眉「仅显示」关控制通道。指针按下后离开占用面（或拆舞台）立刻 `TOUCH_UP`，禁止设备停在按下。离开检测走 `TrackMouseEvent`，禁止在持 Host 锁时 `SetCapture`（会同步派 `WM_CAPTURECHANGED` 再抢同一把锁，卡死呈现泵）。质量参数下次 `mirror.start` 生效。页眉与画面都不放实测 fps；实测走 `Status.tsx` 的 `YoBadge` 进状态栏右槽。导航/音量/电源/亮度在画面与设置栏之间的设备操作栏；月亮/太阳同一钮读 **`DeviceSession.deviceStatuses`** 的 `night` 并 `device.setNightMode`（不是工作台 theme，禁止本页轮询）。页眉 `YoChrome.leading` 组合 `YoBadge`，禁止 `deviceLabel`。舞台 `.yohu-mirror__avail` 是透明洞，禁止套 `YoScroller`。操作栏 / 质量是 `YoPanel` pane + `YoScroller`；模块 CSS 只锁栏宽，禁止 `overflow: auto`。状态采样见 [device.md](device.md)。
