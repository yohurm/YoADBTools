//! adb host stderr：掉线 / 无设备特征（短命令与 DeviceShell 共用）。

use crate::error::AdbError;

const OFFLINE_STDERR_NEEDLES: &[&str] = &[
    "device offline",
    "device not found",
    "no devices/emulators found",
    "device 'offline'",
];

pub fn stderr_is_device_offline(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    OFFLINE_STDERR_NEEDLES.iter().any(|k| lower.contains(k))
}

/// 命中掉线特征时组装运输错误。载荷是 serial，不是 stderr。
pub fn transport_offline(serial: &str, stderr: &str) -> Option<AdbError> {
    if !stderr_is_device_offline(stderr) {
        return None;
    }
    tracing::warn!(serial, stderr = %stderr.trim(), "设备掉线");
    Some(AdbError::DeviceOffline(serial.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_host_offline_needles() {
        assert!(stderr_is_device_offline("error: device offline"));
        assert!(stderr_is_device_offline("error: device not found"));
        assert!(stderr_is_device_offline(
            "error: no devices/emulators found"
        ));
        assert!(stderr_is_device_offline("error: device 'offline'"));
        assert!(!stderr_is_device_offline("unknown option -T"));
    }

    #[test]
    fn transport_offline_payload_is_serial() {
        let err = transport_offline("S1", "error: device offline").expect("offline");
        assert!(matches!(err, AdbError::DeviceOffline(ref serial) if serial == "S1"));
        assert_eq!(err.to_string(), "设备掉线: S1");
        assert!(transport_offline("S1", "unknown option -T").is_none());
    }
}
