//! 设置键校验与应用（贴 protocol 模型；落盘与副作用仍在壳）。

use yohu_protocol::{AppSettings, MirrorProtocol, SettingKey, TerminalTimeFormat};

use crate::mirror::apply_protocol;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SettingError {
    #[error("{0} 必须是字符串")]
    ExpectString(&'static str),
    #[error("{0} 必须是非负整数")]
    ExpectInteger(&'static str),
    #[error("{0} 必须是布尔值")]
    ExpectBool(&'static str),
    #[error("{0} 必须是 time_millis、time、datetime_millis 或 datetime")]
    ExpectClockFormat(&'static str),
    #[error("{0} 必须大于 0")]
    MustPositive(&'static str),
    #[error("数值过大")]
    TooLarge,
    #[error("{0} 必须是 light、dark 或 system")]
    ExpectTheme(&'static str),
    #[error("{0} 必须是 compact 或 comfortable")]
    ExpectDensity(&'static str),
    #[error("{0} 必须是列开关对象（ts/uid/pid/tid/level/tag）")]
    ExpectLogColumns(&'static str),
    #[error("{0} 必须是 usb 或 wifi")]
    ExpectMirrorProtocol(&'static str),
    #[error("{0} 必须是 yohu 或 logcat")]
    ExpectLogColorScheme(&'static str),
}

fn must_str(key: SettingKey, value: &serde_json::Value) -> Result<String, SettingError> {
    value
        .as_str()
        .map(str::to_string)
        .ok_or(SettingError::ExpectString(key.as_str()))
}

fn must_u64(key: SettingKey, value: &serde_json::Value) -> Result<u64, SettingError> {
    value
        .as_u64()
        .ok_or(SettingError::ExpectInteger(key.as_str()))
}

fn must_bool(key: SettingKey, value: &serde_json::Value) -> Result<bool, SettingError> {
    value
        .as_bool()
        .ok_or(SettingError::ExpectBool(key.as_str()))
}

fn must_clock_format(
    key: SettingKey,
    value: &serde_json::Value,
) -> Result<TerminalTimeFormat, SettingError> {
    serde_json::from_value(value.clone()).map_err(|_| SettingError::ExpectClockFormat(key.as_str()))
}

/// 把单键 JSON 写入快照。不落盘、不触发 sidecar / 采集副作用。
pub fn apply_setting(
    settings: &mut AppSettings,
    key: SettingKey,
    value: &serde_json::Value,
) -> Result<(), SettingError> {
    match key {
        SettingKey::AdbPath => {
            settings.adb_path = must_str(key, value)?;
        }
        SettingKey::DataRoot => {
            settings.data_root = must_str(key, value)?;
        }
        SettingKey::DevicesAutoRefresh => {
            settings.devices_auto_refresh = must_bool(key, value)?;
        }
        SettingKey::BufferCapacity => {
            let n = must_u64(key, value)?;
            if n == 0 {
                return Err(SettingError::MustPositive(key.as_str()));
            }
            settings.buffer_capacity = n as usize;
        }
        SettingKey::ClearDeviceOnStart => {
            settings.clear_device_on_start = must_bool(key, value)?;
        }
        SettingKey::Theme => {
            settings.theme = serde_json::from_value(value.clone())
                .map_err(|_| SettingError::ExpectTheme(key.as_str()))?;
        }
        SettingKey::Density => {
            settings.density = serde_json::from_value(value.clone())
                .map_err(|_| SettingError::ExpectDensity(key.as_str()))?;
        }
        SettingKey::ExportDefaultPath => {
            settings.export_default_path = must_str(key, value)?;
        }
        SettingKey::ExportAskEveryTime => {
            settings.export_ask_every_time = must_bool(key, value)?;
        }
        SettingKey::LogDisplayColumns => {
            settings.log_display_columns = serde_json::from_value(value.clone())
                .map_err(|_| SettingError::ExpectLogColumns(key.as_str()))?;
        }
        SettingKey::LogTimeFormat => {
            settings.log_time_format = must_clock_format(key, value)?;
        }
        SettingKey::LogColorScheme => {
            settings.log_color_scheme = serde_json::from_value(value.clone())
                .map_err(|_| SettingError::ExpectLogColorScheme(key.as_str()))?;
        }
        SettingKey::MirrorMaxSize => {
            let n = must_u64(key, value)?;
            settings.mirror_max_size = u32::try_from(n).map_err(|_| SettingError::TooLarge)?;
        }
        SettingKey::MirrorVideoBitRate => {
            let n = must_u64(key, value)?;
            if n == 0 {
                return Err(SettingError::MustPositive(key.as_str()));
            }
            settings.mirror_video_bit_rate =
                u32::try_from(n).map_err(|_| SettingError::TooLarge)?;
        }
        SettingKey::MirrorMaxFps => {
            let n = must_u64(key, value)?;
            settings.mirror_max_fps = u32::try_from(n).map_err(|_| SettingError::TooLarge)?;
        }
        SettingKey::MirrorProtocol => {
            let protocol: MirrorProtocol = serde_json::from_value(value.clone())
                .map_err(|_| SettingError::ExpectMirrorProtocol(key.as_str()))?;
            apply_protocol(settings, protocol);
        }
        SettingKey::MirrorForceForward => {
            settings.mirror_force_forward = must_bool(key, value)?;
        }
        SettingKey::TerminalPrependAdb => {
            settings.terminal_prepend_adb = must_bool(key, value)?;
        }
        SettingKey::FilesDropIntoFolder => {
            settings.files_drop_into_folder = must_bool(key, value)?;
        }
        SettingKey::TerminalTimeFormat => {
            settings.terminal_time_format = must_clock_format(key, value)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use yohu_protocol::LogColorScheme;

    #[test]
    fn buffer_capacity_rejects_zero() {
        let mut s = AppSettings::default();
        let err = apply_setting(&mut s, SettingKey::BufferCapacity, &json!(0)).unwrap_err();
        assert!(matches!(err, SettingError::MustPositive(_)));
        assert!(err.to_string().contains("必须大于 0"));
    }

    #[test]
    fn theme_and_density_apply() {
        let mut s = AppSettings::default();
        apply_setting(&mut s, SettingKey::Theme, &json!("dark")).unwrap();
        apply_setting(&mut s, SettingKey::Density, &json!("compact")).unwrap();
        assert_eq!(s.theme, yohu_protocol::Theme::Dark);
        assert_eq!(s.density, yohu_protocol::Density::Compact);
    }

    #[test]
    fn mirror_protocol_fills_encode_params_without_inventing_custom() {
        let mut s = AppSettings::default();
        apply_setting(&mut s, SettingKey::MirrorProtocol, &json!("wifi")).unwrap();
        assert_eq!(s.mirror_max_size, 1280);
        assert_eq!(s.mirror_video_bit_rate, 4_000_000);
        assert_eq!(s.mirror_max_fps, 30);
        assert_eq!(s.mirror_protocol, yohu_protocol::MirrorProtocol::Wifi);
        apply_setting(&mut s, SettingKey::MirrorMaxFps, &json!(15)).unwrap();
        assert_eq!(s.mirror_max_fps, 15);
        assert_eq!(s.mirror_protocol, yohu_protocol::MirrorProtocol::Wifi);
    }

    #[test]
    fn devices_auto_refresh_applies_bool() {
        let mut s = AppSettings::default();
        assert!(s.devices_auto_refresh);
        apply_setting(&mut s, SettingKey::DevicesAutoRefresh, &json!(false)).unwrap();
        assert!(!s.devices_auto_refresh);
        apply_setting(&mut s, SettingKey::DevicesAutoRefresh, &json!(true)).unwrap();
        assert!(s.devices_auto_refresh);
        let err = apply_setting(&mut s, SettingKey::DevicesAutoRefresh, &json!(30)).unwrap_err();
        assert!(matches!(err, SettingError::ExpectBool(_)));
    }

    #[test]
    fn terminal_prepend_adb_applies() {
        let mut s = AppSettings::default();
        assert!(!s.terminal_prepend_adb);
        apply_setting(&mut s, SettingKey::TerminalPrependAdb, &json!(true)).unwrap();
        assert!(s.terminal_prepend_adb);
        apply_setting(&mut s, SettingKey::FilesDropIntoFolder, &json!(true)).unwrap();
        assert!(s.files_drop_into_folder);
    }

    #[test]
    fn terminal_time_format_applies() {
        let mut s = AppSettings::default();
        assert_eq!(s.terminal_time_format, TerminalTimeFormat::TimeMillis);
        apply_setting(
            &mut s,
            SettingKey::TerminalTimeFormat,
            &json!("datetime_millis"),
        )
        .unwrap();
        assert_eq!(s.terminal_time_format, TerminalTimeFormat::DatetimeMillis);
        let err =
            apply_setting(&mut s, SettingKey::TerminalTimeFormat, &json!("iso8601")).unwrap_err();
        assert!(matches!(err, SettingError::ExpectClockFormat(_)));
        assert!(err.to_string().contains("time_millis"));
    }

    #[test]
    fn log_time_format_applies_default_datetime_millis() {
        let mut s = AppSettings::default();
        assert_eq!(s.log_time_format, TerminalTimeFormat::DatetimeMillis);
        apply_setting(&mut s, SettingKey::LogTimeFormat, &json!("time_millis")).unwrap();
        assert_eq!(s.log_time_format, TerminalTimeFormat::TimeMillis);
    }

    #[test]
    fn log_color_scheme_applies() {
        let mut s = AppSettings::default();
        assert_eq!(s.log_color_scheme, LogColorScheme::Yohu);
        apply_setting(&mut s, SettingKey::LogColorScheme, &json!("logcat")).unwrap();
        assert_eq!(s.log_color_scheme, LogColorScheme::Logcat);
        let err = apply_setting(&mut s, SettingKey::LogColorScheme, &json!("darcula")).unwrap_err();
        assert!(matches!(err, SettingError::ExpectLogColorScheme(_)));
    }
}
