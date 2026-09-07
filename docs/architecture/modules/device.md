# 设备：目录 + 运行时状态

不是 `registerModule` 工作区页。壳侧栏 `DeviceRail` 是唯一设备 UI；数据在 core。

## 两层

```text
adb devices -l
  → device_catalog.last_devices          存在性（DeviceInfo）
  → 对 Online serial：DeviceStatusHub    运行时（DeviceStatus）
        2s 采样 dumpsys/getprop，变更才推 device/status

UI：deviceStore 投影目录 + statuses
  → DeviceRail
  → DeviceSession.{devices, deviceStatuses, selected*}
```

模块禁止再扫 `adb devices`、禁止自己轮询夜览/电量。读注入的 session；写深浅色只经 `device.setNightMode`。

## 目录

成功扫描（含空列表）整表替换。扫描失败不改目录。`require_online` 只信这份快照。`devices/changed` 在 `devices -l` 解析后立刻发，掉线采集/投屏收敛不挡目录。

启动：`settings/devices-catalog.json` 恢复上次成功目录，UI `device.list` 先画卡片；随后一趟 `start-server` + `devices -l` 对账。预热与 UI `device.refresh` 单飞。运行时 adb 只走 DataRoot 解压副本（或用户设置），安装包旁原件不解压成功后不再调用。恢复只用于冷启动首屏，成功空扫描仍整表清空。

先前 Online 且本次不再 Online 的 serial：停采集/投屏/状态采样，推 `device/offline`。目录里仍可留下 unauthorized/offline 条目。

## 运行时状态

`DeviceStatusHub`：每 Online serial 一路 `CancellationToken`。首采先 `getprop`（SDK/版本/品牌）推 `device/status`，再跑 dumpsys 补电量/深浅色/亮屏；周期仍 2s 整包。`None` 保留上次字段。采样脚本常量、无用户拼接。

| 字段 | 来源 |
|------|------|
| `night` | `dumpsys uimode`（`mCurUiMode` night 位）→ `cmd uimode night` |
| `battery_pct` / `charging` | `dumpsys battery` |
| `screen_on` | `mWakefulness` / `mScreenState` |
| `sdk` / `release` / `brand` | `getprop` |

`device.setNightMode`：`cmd uimode night yes\|no`（回落 `settings put secure ui_night_mode`）→ 立即再采 → 写缓存 → `device/status`。

## IPC

- 读目录：`device.list` / `device.refresh`
- 读状态：`device.status`（可选 `serial`）
- 写夜览：`device.setNightMode` → `DeviceStatus`
- 事件：`devices/changed`、`device/offline`、`device/status`（内容变才发，可丢）

详见 [ADR-v6-025](../adr/ADR-v6-025.md)、[ipc.md](../ipc.md)。
