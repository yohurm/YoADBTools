# Linux 与 Windows 产品对齐

对照的是已经交付的 Windows 行为，不是把 Win32 调用原样搬过来。Linux 能走同一套 UI 和同一套舞台几何的，跟 Windows 对齐。Windows API 在 Linux 上不存在时，用已经接受的 Linux 替换（ADR-v6-043 / ADR-v6-042），不另起一套产品。

本轮在 `cursor/linux-support-c999` 上改代码，不新开 PR，不合入 `main`。

## 已经对齐

这些表面是同一套 Solid / YoUI，或本分支已经按 Windows 舞台几何改过。核对清单里的通过行仍然有效，这里不重写。

| 模块 | 对齐点 |
|------|--------|
| 投屏舞台（稳态） | 子窗口盖住 avail。可见卡片是 contain。卡片外是窗口 canvas `#F1F3F5` / `#191A1C`。圆角、内缩描边、暂停时的图标井和「已暂停」文案画在卡片上。画面画在最终 dest |
| 投屏出画 | 有 H.264 VLD 走 libva；没有则 dlopen Cisco OpenH264。`mirror/painted` 之后截图和设备键解锁。`probe().id` 仍是 `vaapi` |
| 投屏控制 | 指针穿透子窗口，仍走 `mirror.pointer`。暂停、面板内全屏、返回、音量、电源、亮度与 Windows 同一套按钮 |
| 文件 | 缺目录是「没有这个目录」加「重新读取」，不是空文件夹。已有行时刷新失败保留行并 toast。拖入走 `tauri://drag-*`。删除和新建走 SafetyRoot |
| 设备卡片 | `devices -l` 是目录源。型号、Android 版本、电量来自同一状态 Hub |
| 终端 | 统一 `>>>` / `<<<` 块、命令库、占位符、纸飞机发送。快捷键是 Ctrl，不是 Win 键 |
| 日志 | 每设备一路 logcat、过滤、暂停、溢出回补。消费端过滤在 UI |
| 设置 | 主题、密度、生效徽章、OpenH264 开关、关于页版本和日志路径 |
| Toast / 菜单 | `YoToast`。右键菜单在壳的 Host，页面 `contextmenu` 被吃掉 |
| 打包 | `.deb` 装到 `/usr/bin` 与 `/usr/lib/YohuAdbTools/tools/`。数据家园 `~/.local/share/YohuAdbTools`。检查更新认 `linux-x86_64`，安装用 `xdg-open` 打开 deb |

## 本轮补上的差距

Windows 占用卡片在 Fill→Dest 用 `MotionSpec::SpatialPanel`（300ms standard），Dest→Fill 用 `SpatialEnter`（350ms decel）。同 kind 且目标没变时，进行中的插值不被取消。画面始终画在最终 dest，描边和铬跟插值中的 clip。

Linux 在舞台铬对齐之后仍是一拍切到 contain。本轮让 GTK 子窗口按同一条 `ease_at` 采样卡片：Fill↔Dest 从当前看到的盒子起跳，Follow 且目标不变则留着原动画。重绘间隔复用 `PRESENT_SPIN_STEP`（50ms）。`gtk-enable-animations` 关掉时直接落在终点，对应 Windows 的 `motion_allowed()`。

单测锁住：Fill→Dest 从 settled 起跳且规格是 SpatialPanel；Dest→Fill 规格是 SpatialEnter；Follow 目标不变保留动画，目标变了则停；播完采样等于 dest。

ATD（`yohu_atd34`，`-accel off`，没有 `/dev/dri`）上两路会话都打出 `704×661 → 372×661`、300ms，以及停止时 `369×656 → 704×656`、350ms。稳态两侧仍是窗口 canvas `#F1F3F5`。停止后第一张白卡片约 383px 宽，角上仍是 canvas；随后洞高差了 5px，Follow 改目标，卡片铺满洞。这和 Windows「Follow 且目标变了就不插值」一致。出画仍是 OpenH264，`.deb` 里没有这份 `.so`。

## 有意保留的差异

这些不是漏改。改它们要么违反已接受的 ADR，要么 Windows API 在 Linux 上没有对应物，而产品已经选了替换。

| 项 | Linux 现状 | 为什么留着 |
|----|------------|------------|
| 拖出 | `DndError::Unsupported`，toast「拖出仅支持 Windows 与 macOS」 | ADR-v6-043 / 042 写明拖出仍不交付 |
| HEVC | `probe().hevc` 保持 `false`。USB 默认 `h265` 时，只发 HEVC 的手机会没有画面 | ADR-v6-042：查到 HEVC Main 也不提交，直到有能交画面的解码器。本机 ATD 会话是 H.264 |
| 解码库 | 不链 FFmpeg / libavcodec / GStreamer / libyuv。OpenH264 的 `.so` 不进 `.deb` | ADR-v6-042。缺文件时洞文案说明要单独下载 Cisco 二进制 |
| Wayland DMA-BUF | 呈现是 X11 GDK 子窗口 + cairo。有 VA 表面时 `vaPutSurface` 不吃 cairo 圆角裁剪 | ADR-v6-042 把 DMA-BUF 放在同一子控件之后，不作为这一步的前提 |
| 启动闪屏 | 没有 GDI / `native_splash`。主窗等到工作台 hydrate 再显示 | 闪屏是 Windows 窗口。Linux 用现有 `window_boot` |
| 安装根口径 | 目录函数 `app_install_root` 在 Linux 上是 `~/.local/opt/YohuAdbTools`。发出的 `.deb` 实际在 `/usr/bin` | ADR-v6-031。关于页各系统都不展示 `install_dir`。不在没有新 ADR 时改安装根 |
| 静默覆盖安装 | Linux 更新不跑 NSIS `/S`。打开 deb 交给用户 | 没有对应的 per-user 覆盖安装器 |
| 更新通道名 | 关于页是 `yohurm/Windows-YoADBTools` | 这是真实的 GitHub 仓库名，不是把 Linux 指去 Windows 安装包 |
| 动效开关 | 读 GTK `gtk-enable-animations`，不读 `SPI_GETCLIENTAREAANIMATION` | Windows SPI 在 Linux 上不存在 |

## 本轮没有改、也还没在这台机器上重新点过的

文件、终端、日志、设置、设备卡片的通过行以核对清单里已有的 ATD 记录为准。本轮没有为它们再走一遍无障碍树。WebKitGTK 标题栏拖动没有单独再测。
