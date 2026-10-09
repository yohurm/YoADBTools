# 调研 — Linux 投屏呈现与私有软解

- **日期：** 2026-10-09
- **用途：** 修订 [ADR-v6-042](adr/ADR-v6-042.md)。不是 ADR，不授权改 `linux.rs`。
- **结论先说：** 没有 `/dev/dri` 不应当永久停在失败句。VA-API H.264 VLD 能打开就用 libva。打不开时，Linux 后端自己的 CPU 解码仍把画面画进已记下的 `GtkWindow` 子控件。FFmpeg 继续不进这份草案。

核对机是 X11（`DISPLAY=:1`），没有 `/dev/dri`，壳是 GTK 3（`gtk = "0.18"`）加 WebKitGTK 4.1。Windows 的 Media Foundation、DXGI、DComp、HWND 搬不过来。Jessica 允许为这些能力做 Linux 自己的实现，不必把 Windows 栈镜像过来。

## 1. 已接受的 ADR 到底禁什么

| 条文 | 禁的 | 没有禁的 |
|------|------|----------|
| [028](adr/ADR-v6-028.md) §1、否决 | `ffmpeg.exe`、`libavcodec` / `ffmpeg-next`、用 FFmpeg 的 vaapi 封装假装原生 | Linux 用 VA-API。`Picture` 不得做成跨平台 packed NV12；**该后端自己的** CPU 回退是允许的（同一条写了 macOS：NV12 只作 VT 输出回退） |
| 028 §2 | 运行时按 GPU 品牌再装一套解码插件 | 编译期 `cfg(target_os = "linux")` 一个后端 |
| 028 §6 | 当时不交付 Linux 像素 | 占位要能收下 `Cmd`。像素留给后来的 ADR |
| [030](adr/ADR-v6-030.md) §1 | 用 FFmpeg 或 OpenH264 **充当原生后端** | 没有禁止 `linux/` 内部在硬解失败后私有回退，只要 `Caps.id` 仍不是 OpenH264 |
| 030 否决 | 本期（2026-09-05）交付 Linux 像素 | 041 已经把工作台交给 Linux。像素仍单独留着 |
| [032](adr/ADR-v6-032.md) 否决 | libplacebo、`libswscale`、libyuv、GStreamer、zimg 进直播路径 | Linux 自己的 Convert / Scale / Present 文件。面积核已经是 Windows 的政策，不必搬 HLSL |
| [041](adr/ADR-v6-041.md) §5 | 像素与拖出仍不交付；禁止 FFmpeg / libavcodec | 主窗 `GtkWindow` 指针就是留给以后的表面。接受 042 只改像素这一条，不改拖出，不改 FFmpeg 禁令 |

028 否决的是「默认 CPU packed NV12 当跨平台路径」。不是「Linux 没有 DRM 就永远不出画」。

## 2. scrcpy

来源：`app/src/decoder.c`（master，2026-10-09 读）、`doc/video.md` 的 Hardware decoding。

解码身份是 FFmpeg。`sc_decoder_create_context` 调 `avcodec_alloc_context3` / `avcodec_open2`。硬解走 `sc_hwdec_configure`。配置失败且没有强制硬解时，上下文保持软件解码，并写「hardware decoding unavailable, using software decoding」。首包送到硬解失败、还没有解出过帧、也没有强制硬解时，`sc_decoder_fallback_to_software` 用 `hwdec = NULL` 重开上下文，再送同一包。

`doc/video.md` 把策略写成两档：

- `--hwdec=auto`（默认）：能用硬解就用，不能解这路流就回到软件解码，画面继续。
- `--hwdec=vaapi`：点名硬解。VA-API 解不了就失败，不回软件。

VA-API 还绑在他们自己的渲染器上：Wayland 上 SDL 用 EGL；X11 上 SDL 默认 GLX，scrcpy 会改要 EGL，否则硬解不可用。预编译包用系统里的 libva，驱动是发行版的 `va-driver-all`。呈现是 SDL 自己的窗口，不是嵌进别人的 GTK 程序。

**借的是政策，不是库。** 「先硬解，硬解不可用就软件解码，并且仍然 Present」对得上 Jessica 拒绝的「没有 dri 就放弃」。**不借的是实现。** FFmpeg 是 scrcpy 的解码身份，直接撞 028。他们的 SDL/EGL 窗口也不是我们的 `GtkWindow` 子控件。`--hwdec=vaapi` 那种失败关闭，就是上一版 042 草案，这份修订不再采用。

AV1 上 scrcpy 会避开「默认解码器不吃硬解设备」的 libdav1d，改找能挂硬件设备的解码器。这说明他们已经区分「一个专用解码库」和「FFmpeg 的硬件封装」。H.264 的软件路径却仍是 `avcodec_find_decoder`。我们要的专用库是 OpenH264，不是把这条 FFmpeg 路径搬过来。

## 3. libva、DMA-BUF、GTK

来源：libva `vaExportSurfaceHandle`（`VA_SURFACE_ATTRIB_MEM_TYPE_DRM_PRIME_2`，读出、合成层）；mpv `video/out/vo_dmabuf_wayland.c` 用同一组标志把 VA 表面交给 Wayland dmabuf；GTK 4.14 的 Wayland dmabuf 下沉（Matthias Clasen，2024-04-14；Centricular 的 `gtk4paintablesink`，2024-04-20）。`vaPutSurface` 仍在 libva 后端表里，把表面画进窗口系统的 drawable。

能借的：

- 硬解只调 libva 的 H.264 VLD，不经过 FFmpeg 的 vaapi 封装。028 允许这条，scrcpy 的 `--hwdec=vaapi` 不在此列。
- 有 DRM 设备时，表面用 `vaExportSurfaceHandle` 导出 DMA-BUF，或在 X11 上 `vaPutSurface` 进子窗口。缩放不在 Convert 里做。
- 驱动缺失是发行版的事（`va-driver-all` / 厂商包）。探针失败不等于产品放弃像素。

不能照搬的：

- GTK 4.14 的 dmabuf 下沉和 GStreamer 的 `gtk4paintablesink` 要求 GTK 4 和 Wayland。我们的壳是 GTK 3。为了这条下沉去换 Tauri 的 GTK 大版本，不是这一份像素 ADR 的范围。032 也已经否决用 GStreamer 当直播路径。
- mpv 的 `vo_dmabuf_wayland` 是 Wayland 呈现，解码身份仍是 FFmpeg。只借导出表面的方式。核对用的 VM 没有 Wayland，也没有 `/dev/dri`，这条在这台机器上没有设备可导出。
- 没有 `/dev/dri` 就没有 `VADisplay`。`vaPutSurface` 和 DMA-BUF 都没有表面可画。CPU 画面必须进同一个 GTK 子控件，而不是另开一条 Web 铬。

## 4. 谁把软解留在私有路径里

| 设计 | 软解是什么 | 对我们 |
|------|------------|--------|
| scrcpy `--hwdec=auto` | FFmpeg 软件解码，失败后仍推帧 | 借回退政策。不借 libavcodec |
| mpv `hwdec=vaapi` | 软件路径仍是 lavc；Wayland 上 VA 表面走 dmabuf | 借 DMA-BUF 呈现。不借解码身份 |
| GStreamer `vah264dec` | 硬解失败可以落到 `avdec_h264` / `openh264dec`，GTK4 sink 吃 dmabuf | 管道是运行时插件，撞 028 §2 和 032 |
| Firefox OpenH264 GMP | H.264 是单独下载的 Cisco 插件，不是 libvpx / ffvpx / dav1d 的身份 | 借打包方式。见下一节 |
| Fedora `fedora-cisco-openh264` | Fedora 签名、Cisco 发布二进制。Fedora 自己不托管这个 RPM | 同一条专利条件 |
| 自带一份 H.264 解码器源码打进 `.deb` | 版权可以是 BSD，专利授权不跟着走 | 不选。Cisco 的 MPEG LA 授权只覆盖 Cisco 提供的那份二进制 |

028 已经写了「CPU NV12 只作该后端自己的回退」。macOS 的 VT 请求 32BGRA，NV12 只是输出回退拷贝，并不把 NV12 放进 `yohu-mirror`。Linux 的 CPU 画面同样只活在 `linux/`。

## 5. OpenH264 的许可和 `.deb`

来源：<https://www.openh264.org/BINARY_LICENSE.txt>（v1.0）、Fedora Wiki「OpenH264」「Non-distributable-rpms」、Debian `openh264` 2.6.0 的 copyright 说明，以及 debian-legal 对 Bug#974678 的回复。

版权是 BSD-2-Clause。专利是另一件事。Cisco 从 MPEG LA 买了 AVC 组合授权，**只覆盖 Cisco 提供的那份二进制**，而且要同时满足：

1. 二进制单独下载到最终用户的设备上，下载之前不和第三方软件打在一起。
2. 最终用户能打开、关掉、再打开这份二进制。
3. 用户控制它的那个界面上显示：`OpenH264 Video Codec provided by Cisco Systems, Inc.`
4. 使用方在最终用户能看到许可的地方重现上述全文，包括这第 4 条。

组合授权本身还有范围：个人使用，或不因此取得报酬地解码消费者自己编码的 AVC，或解码已获授权的提供者提供的 AVC。不覆盖除此之外的用途。设备上的 MediaCodec 属于设备侧编码器；桌面侧解码仍要落在这条范围里。超出范围的部署得自备 MPEG LA 授权，或自行承担风险。BSD 版权不因这个选择消失，专利授权会消失。

因此：

- **可以：** `linux/` 在运行时 `dlopen` 系统里已经单独下载好的 Cisco `libopenh264`。`.deb` 只带调用代码和许可文本，不带那份 `.so`。
- **不可以：** 把 Cisco 的二进制或我们自己编译的 OpenH264 打进 `YohuAdbTools_*.deb`。那就违反第 1 条，030 所禁止的「打进包里冒充原生后端」也仍成立。
- **Debian 的做法：** 源码包可以在 main；真正的库是安装时另下的 cisco 包，放在 contrib，而不是把二进制编进 main。Fedora 连 RPM 都不自己发，交给 Cisco 的仓库。
- **`.so` 还不在机器上时：** 洞里说明缺的是这份可关闭的解码二进制，并给出启用方式。这是许可闸门，不是「没有 `/dev/dri` 所以没有产品」。二进制到位之后，这台没有 DRM 的 VM 仍走 CPU 路径出画。

## 6. 对这份修订的含义

硬解路径是 Linux 自己的：libva VLD，表面进 GTK 3 子控件（X11 上 `vaPutSurface`，以后在 Wayland 上再接 DMA-BUF）。不克隆 `windows/gpu.rs`。

软解路径也是 Linux 自己的：只在 VLD 打不开时启用，OpenH264 只在 `linux/` 里，`Caps.id` 仍是 `vaapi`，画面仍进同一个子控件。面积核沿用 032 的政策，不引入 libyuv。

FFmpeg 若要当这条 CPU 路径，必须另改 028 §1、030 §1、032 的否决和 041 §5。那是单独的接受项，这份草案不接受。

042 已接受。解码与呈现在 `mirror_present/linux/`，不在这份调研里改行为。
