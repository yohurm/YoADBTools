//! adb host stderr：掉线 / 无设备特征（短命令与 DeviceShell 共用）。

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
}
