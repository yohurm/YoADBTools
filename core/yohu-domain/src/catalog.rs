//! 设备目录：一次成功的 `adb devices -l` 就是存在性快照。
//! 展示名与选中切片是对这份目录的纯查询，不含选择会话。

use yohu_protocol::{DeviceInfo, DeviceState};

/// 人读设备名：型号去空白后非空则用之，否则 serial。
/// 设备栏 / 页眉 / 选择器同一规则；禁止 UI 再写 `model ?? serial`。
pub fn device_display_name(device: &DeviceInfo) -> &str {
    match device.model.as_deref() {
        Some(model) => {
            let name = model.trim();
            if name.is_empty() {
                device.serial.as_str()
            } else {
                name
            }
        }
        None => device.serial.as_str(),
    }
}

/// 按 serials 顺序从目录取出设备（缺条跳过，保序）。
/// 壳注入 `DeviceSession.selectedDevices` 与页眉同一切片。
pub fn lookup_selected_devices<'a>(
    serials: &[String],
    catalog: &'a [DeviceInfo],
) -> Vec<&'a DeviceInfo> {
    serials
        .iter()
        .filter_map(|serial| catalog.iter().find(|d| d.serial == *serial))
        .collect()
}

/// 一次成功的 `adb devices -l` 就是设备目录。
/// 空列表 = 当前没有设备；禁止用上次快照顶替（那会让已拔线的设备继续显示在线）。
/// 返回 (新目录, 先前 Online 且本次不再 Online 的 serial)。
/// 含名单消失，以及 Online → unauthorized/offline（条目还在，采集/投屏/状态采样同样收敛）。
pub fn device_is_online(state: DeviceState) -> bool {
    state == DeviceState::Online
}

pub fn device_is_unauthorized(state: DeviceState) -> bool {
    state == DeviceState::Unauthorized
}

pub fn catalog_after_scan(
    previous: &[DeviceInfo],
    scanned: Vec<DeviceInfo>,
) -> (Vec<DeviceInfo>, Vec<String>) {
    let online_now: std::collections::HashSet<&str> = scanned
        .iter()
        .filter(|d| device_is_online(d.state))
        .map(|d| d.serial.as_str())
        .collect();
    let went_offline = previous
        .iter()
        .filter(|d| device_is_online(d.state) && !online_now.contains(d.serial.as_str()))
        .map(|d| d.serial.clone())
        .collect();
    (scanned, went_offline)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(serial: &str, state: DeviceState) -> DeviceInfo {
        DeviceInfo {
            serial: serial.into(),
            model: None,
            state,
            connection: "usb".into(),
        }
    }

    fn device_with_model(serial: &str, model: Option<&str>) -> DeviceInfo {
        DeviceInfo {
            serial: serial.into(),
            model: model.map(str::to_string),
            state: DeviceState::Online,
            connection: "usb".into(),
        }
    }

    #[test]
    fn device_display_name_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            serial: String,
            model: Option<String>,
            expect: String,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/device_display_name.json"))
                .expect("fixture");
        for case in cases {
            let device = device_with_model(&case.serial, case.model.as_deref());
            assert_eq!(
                device_display_name(&device),
                case.expect,
                "serial={}",
                case.serial
            );
        }
    }

    #[test]
    fn lookup_selected_devices_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            serials: Vec<String>,
            catalog: Vec<DeviceInfo>,
            expect: Vec<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/lookup_selected_devices.json"))
                .expect("fixture");
        for case in cases {
            let found: Vec<&str> = lookup_selected_devices(&case.serials, &case.catalog)
                .iter()
                .map(|d| d.serial.as_str())
                .collect();
            assert_eq!(found, case.expect, "serials={:?}", case.serials);
        }
    }

    #[test]
    fn device_is_online_is_only_the_online_state() {
        assert!(device_is_online(DeviceState::Online));
        assert!(!device_is_online(DeviceState::Unauthorized));
        assert!(!device_is_online(DeviceState::Offline));
        assert!(device_is_unauthorized(DeviceState::Unauthorized));
        assert!(!device_is_unauthorized(DeviceState::Online));
        assert!(!device_is_unauthorized(DeviceState::Offline));
    }

    #[test]
    fn catalog_after_scan_empty_replaces_previous_online() {
        let previous = vec![device("A1", DeviceState::Online)];
        let (next, went_offline) = catalog_after_scan(&previous, Vec::new());
        assert!(next.is_empty());
        assert_eq!(went_offline, vec!["A1".to_string()]);
    }

    #[test]
    fn catalog_after_scan_keeps_present_online() {
        let previous = vec![device("A1", DeviceState::Online)];
        let scanned = vec![device("A1", DeviceState::Online)];
        let (next, went_offline) = catalog_after_scan(&previous, scanned);
        assert_eq!(next.len(), 1);
        assert!(went_offline.is_empty());
    }

    #[test]
    fn catalog_after_scan_offline_when_serial_missing() {
        let previous = vec![
            device("A1", DeviceState::Online),
            device("B2", DeviceState::Unauthorized),
        ];
        let scanned = vec![device("B2", DeviceState::Unauthorized)];
        let (next, went_offline) = catalog_after_scan(&previous, scanned);
        assert_eq!(next[0].serial, "B2");
        assert_eq!(went_offline, vec!["A1".to_string()]);
    }

    #[test]
    fn catalog_after_scan_offline_when_online_becomes_unauthorized() {
        let previous = vec![device("A1", DeviceState::Online)];
        let scanned = vec![device("A1", DeviceState::Unauthorized)];
        let (next, went_offline) = catalog_after_scan(&previous, scanned);
        assert_eq!(next[0].state, DeviceState::Unauthorized);
        assert_eq!(went_offline, vec!["A1".to_string()]);
    }

    #[test]
    fn applog_lock_sentence_once() {
        let src = include_str!("applog.rs");
        let stripped = src.replacen("self.inner.lock().expect(\"applog lock poisoned\")", "", 1);
        assert!(!stripped.contains("applog lock poisoned"));
    }
}
