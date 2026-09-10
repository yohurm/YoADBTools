# 设备：WiFi 无线调试（方案，未落地）

> **状态：** 架构方案。2026-09-10。不改业务代码。  
> **范围：** Android 11+「无线调试」（配对 + 连接）+ 设备栏/状态栏区分 USB / WiFi。  
> **非本期：** 经典 `adb tcpip 5555` 向导、二维码配对、Miracast、厂商管家、自研 APK。  
> **依据：** [device.md](device.md)、[ADR-v6-025](../adr/ADR-v6-025.md)、[layers.md](../layers.md)、[ipc.md](../ipc.md)；开源对照见 YoAgentDocs `research/by-stack/client-runtime/android--wireless-connect-paths.md`。

不是新 `registerModule`，也不是新 capability crate。无线调试是 **ADB 运输编排**：让一台设备出现在现有目录里。一旦 `adb devices -l` 有 Online 条目，文件 / 日志 / 终端 / 投屏沿用现状，不另开模块。

## 设计前：现状链路

主用户路径：插 USB → 扫描 → 设备栏出卡片 → 模块用该 serial。

```text
sidecar adb devices -l
  → yohu-adb::parse::devices::parse_devices_list
        serial / state / model / connection
  → device_catalog::refresh
        catalog_after_scan（整表替换；算出 went_offline）
        last_devices + devices-catalog.json
        DeviceStatusHub.sync_online(Online serials)
        AppEvent::DevicesChanged
        Online → mirror.warmup（connection 决定是否 force forward）
        went_offline → capture.detach + mirror.stop
  → commands device.list / device.refresh（薄转发）
  → @yohu/api deviceList / deviceRefresh / onDevicesChanged
  → workbench deviceStore.applyDevices
  → DeviceRail 卡片
  → AppLayout 注入 DeviceSession
        selectedDevices / devices / deviceStatuses
  → 模块（只读 session；require_online 只信 last_devices）
```

运行时状态是另一条写路径（ADR-v6-025）：

```text
DeviceStatusHub（每 Online serial 一路，2s）
  → getprop / dumpsys → DeviceStatus
  → device/status（内容变才发）
  → deviceStore.statuses
  → DeviceRail 次行 formatDeviceStatusMeta(status)
        只有 Android 版本 · 电量
  → 状态栏「设备: 在线 n 台」（deviceStore.statusText）
```

`DeviceStatus` **没有** 连接方式。`DeviceInfo.connection` 已在目录里，但设备栏次行、title、状态栏都不读它。空态文案写死「请用 USB 连接」。

### 连接字段今天怎么来

AOSP `transport.cpp` `append_transport`（`devices -l`）：

```text
serial  state  [devpath]  product:  model:  device:  transport_id:
```

`devpath` 无 key。USB 时是 `usb:1-1`；无线 / `adb connect` 时 **devpath 常为空**，文本里 **没有** `tcp:`。

Yohu 解析（`core/yohu-adb/src/parse/devices.rs`）：

```text
connection 默认 "usb"
有 usb:… → "usb:…"
有 tcp:… → "tcp:…"
```

因此无线条目会被标成 **USB**。后果：

| 下游 | 现状 |
|------|------|
| 设备栏 | 看不出 USB / WiFi |
| `is_tcp_connection` / 投屏编码 | 当 USB：高码率 HEVC + 先 reverse |
| `start_force_forward` | 不因无线强制 forward（scrcpy 已写明 `adb connect` 上 reverse 常失败） |
| 状态栏 | 只有「在线 n 台」 |

`devices -l` 的 proto 形态有 `ConnectionType::USB | SOCKET`，Yohu 走的是文本，没用 proto。

### 身份：一台手机两个 serial

无线调试连上后，目录里的 serial **不是** USB 那个：

| 运输 | 典型 serial | 文本里有没有 `usb:` / `tcp:` |
|------|-------------|------------------------------|
| USB | `R58M…` | 常有 `usb:1-1` |
| 遗产 tcpip | `192.168.1.8:5555` | 通常没有 `tcp:` |
| 无线调试 TLS | `adb-…._adb-tls-connect._tcp` | 没有 `tcp:`，serial 自带服务类型 |

同一物理机可同时占两行。目录身份仍是 **adb serial**，不合并。采集 / 投屏 / 焦点按 serial 各算一路；USB 拔掉只停 USB 那行。

### 连接编排：今天没有

`AdbClient` 只有带设备的短命令 / 长驻 / 流。`argv_with_serial` 在 serial 为空时不加 `-s`，但没有任何 `pair` / `connect` / `mdns` 封装。`commands/device.rs` 只有 list / refresh / status / setNightMode。`device.pair` 若误走 `require_online` 会失败：配对时设备还不在目录里。

## 目标分层

层名跟本仓：View → store → `@yohu/api` → commands → 壳编排 → `yohu-adb` → sidecar。判定在 `yohu-domain`。

```text
DeviceRail / 配对对话框（View）
  → deviceStore（投影：目录 + statuses + link 会话）
  → @yohu/api  device.pair / connect / disconnect / mdnsServices
  → commands/device.rs  薄转发（配对/连接 禁止 require_online）
  → device_catalog（或同文件内的 link 编排，不新建 crate）
        sidecar：adb pair / connect / disconnect / mdns
        成功 → 现有 refresh()（catalog_gate 单飞）
  → parse_devices_list 补全 connection
  → yohu-domain::transport_kind(serial, connection) → Usb | Wifi
  → DeviceRail 次行 / 徽章 / 状态栏读 kind
```

| 层 | 放什么 | 不放什么 |
|----|--------|----------|
| `yohu-protocol` | `DeviceInfo.connection` 仍是目录字段；可选 `MdnsService` DTO | 不把 USB/WiFi 写进 `DeviceStatus` |
| `yohu-domain` | `transport_kind`；`is_tcp_connection` 跟 kind 对齐 | 不跑 adb、不持 pairing 状态机 |
| `yohu-adb` | 解析补全 connection；`pair` / `connect` / `disconnect` / `mdns check|services`（空 serial） | 不写目录、不弹对话框 |
| `device_catalog` | 连接编排 + 现有扫描 | 不采 dumpsys |
| commands | 转发 | 不判定、不拼配对码 |
| `@yohu/api` | 命令 + 类型；`transportKind` 与 domain testdata 孪生 | 不写次行文案 |
| workbench | 次行/徽章/空态；`link` 会话（Idle/Busy/Failed） | 不扫 adb、不猜 IP |

`DeviceStatusHub` 不改契约。运输不是夜览/电量。

## 设计后：两条写路径

### 1. 连接（新，只写运输）

用户路径：手机打开「无线调试」→ 配对码屏上的 `IP:配对口` + 6 位码 → Yohu 配对 → 用主屏上的 `IP:连接口` 连接（或 mDNS 自动看见 `_adb-tls-connect`）→ 扫描进目录。

```text
View 提交 { pairHost, pairCode } 与可选 { connectHost }
  → device.pair          无 require_online
        AdbClient.run("", ["pair", host, code], timeout)
        解析 stdout / 非零退出
  → device.connect       无 require_online
        AdbClient.run("", ["connect", host], timeout)
        已连接 / 未授权 / 网络失败 分错误（对标 ya-webadb WirelessCommands）
  → device_catalog::refresh   与预热/手动刷新同一趟
  → devices/changed
  → 新 serial 进目录（TLS 名或 IP:port）
  → Hub 开采样；mirror.warmup 走 tcp 规则
```

可选：`device.mdnsServices` → `adb mdns services`。失败（`unknown host service`）不挡手动输入。先 `adb mdns check` / 将来 `adb server-status`，不要假设 Windows 局域网一定能发现。

`device.disconnect` 只对 **tcp/wifi** serial；USB 不断开。之后仍走 refresh。

连接会话（store，不是目录）：

```text
Idle → Pairing → Connecting → Idle（目录已有新行）
                 ↘ Failed（文案可展示，不写进 DeviceInfo）
```

同一时刻一对 pair/connect。与 `catalog_gate` 错开：连接命令结束后再 refresh，避免和 `devices -l` 抢同一趟观感（adb server 本身可并发，UI 不要两套「刷新中」）。

配对信任在 adbd 密钥库。Yohu **不**再存一份私钥。可记「上次连接地址」方便重连；连接口会变，不能写死 5555。

成功后：refresh，若能认出新 wifi 行则把焦点切过去。不把 USB 行和 wifi 行合成一张卡。

### 2. 目录 + 展示（修现有一跳）

解析补全（`parse_devices_list`，单测锁样例）：

```text
有 usb:…                     → connection = "usb:…"
有 tcp:…                     → connection = "tcp:…"
serial 含 _adb-tls-connect._tcp 或 _adb._tcp
                             → connection = "tcp:" + serial
serial 形如 host:port（含 IPv4）
                             → connection = "tcp:" + serial
否则                         → "usb"（含无属性的 USB 行、emulator-5554）
```

`emulator-*` 保持 USB/本地，不标 WiFi。

domain 纯函数（与 TS 孪生、testdata）：

```text
transport_kind(serial, connection) -> "usb" | "wifi"
is_tcp_connection = kind == wifi
```

投屏 `start_encode` / `start_force_forward` 继续只问 `is_tcp_connection`，不再在 UI 里认 serial。

设备栏次行（壳展示，可读 `DeviceInfo` + `DeviceStatus`）：

```text
Wi-Fi · Android 15 · 87% 充电
USB · Android 15 · 87% 充电
```

无运行时字段时仍要出运输：`Wi-Fi` / `USB`。title 同样带上。不要把运输做成第二套在线点颜色。

状态栏：一台在线时 `设备: 在线 1 台 · Wi-Fi`；多台只保留台数，运输看卡片。`statusText` 的计算留在 deviceStore，读目录 kind，不打 dumpsys。

空态：USB **或** 无线调试配对，不要只写插线。

## IPC（目标）

| 命令 | 作用 | 鉴权 |
|------|------|------|
| `device.pair` | `adb pair HOST[:PORT] CODE` | 无 online |
| `device.connect` | `adb connect HOST[:PORT]` | 无 online |
| `device.disconnect` | `adb disconnect HOST[:PORT]` | 目标须是 wifi 行，不是 USB |
| `device.mdnsServices` | `adb mdns services`（可选 check） | 无 online |
| 现有 list / refresh / status / setNightMode | 不变 | 不变 |

不新增事件。连上后仍只发 `devices/changed`。禁止 `device/status` 冒充运输变更。

## UI 落点（壳，不是模块）

- 设备栏标题行：刷新旁增加「无线调试」入口（`YoIconButton`），打开 `YoDialog`：配对地址 + 配对码 + 连接地址（可从配对屏抄，或 mDNS 填）。
- 卡片次行 / 徽章：USB | Wi-Fi。serial 行仍是 adb serial（TLS 名很长，完整放 title，行内可省略中间）。
- 不新增侧栏 Tab，不进设置页当主路径。

官方没有「桌面设备栏运输徽章」规范。交互对标 Android Studio Device Manager 的 pair/connect；视觉走 Yohu / 鸿蒙 PC token。

## 不做什么

- 不把 `connection` / `transport_kind` 写进 `DeviceStatus`（双源，违反 ADR-v6-025）。
- 不合并 USB serial 与 wifi serial。
- 不重实现 ADB / SPAKE2 / A_STLS（ADR-v6-008）。
- 不新建 `yohu-wireless` crate、不 `registerModule("wireless")`。
- 不把 Miracast / 电脑管家接到 `yohu-mirror`。
- 不在本期做 `adb tcpip` 向导（目录里已经是 `tcp:` 的行仍按 WiFi 展示）。
- 不承诺重启后免开「无线调试」、不承诺 Windows 上 mDNS 必成。
- 不为「保险」在 UI 再写一套 serial 形态判断；只信 domain testdata。

## 与旧代码的关系

一次替换解析默认「无属性 = USB」。`is_tcp_connection` 改为跟 `transport_kind`，投屏/warmup 自动跟。设备栏次行函数签名从「只收 DeviceStatus」改为「目录 + 状态」；不是兼容包装，是展示层读对源。

落地时改：`modules/device.md`、`ipc.md`、`UI设计系统-v6.md` §3 设备栏次行。本文件在落地后改为 as-built 或并入 `device.md`。
