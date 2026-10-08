//! IPC 错误模型：core 内部错误映射为 `{ code, message }`，前端按 code 处理。

use serde::{Deserialize, Serialize};

/// 稳定错误码（前端只依赖 code，不解析 message 文案）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcErrorCode {
    InvalidArgs,
    DeviceOffline,
    Unauthorized,
    AdbError,
    NotFound,
    Cancelled,
    Internal,
}

/// 跨 IPC 的通用错误。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
}

#[cfg(test)]
mod tests {
    fn production(src: &str) -> &str {
        src.split("\n#[cfg(test)]").next().unwrap_or(src)
    }

    /// 所有者那一行留着。先剥掉它，再扫其余生产代码。
    fn strip_owner_line(src: &str, needle: &str) -> String {
        let mut dropped = false;
        src.lines()
            .filter(|line| {
                if !dropped && line.contains(needle) {
                    dropped = true;
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn productions() -> [(&'static str, String); 13] {
        let raw = [
            ("lib", include_str!("lib.rs")),
            ("device", include_str!("device.rs")),
            ("error", include_str!("error.rs")),
            ("events", include_str!("events.rs")),
            ("identity", include_str!("identity.rs")),
            ("invoke", include_str!("invoke.rs")),
            ("library_dto", include_str!("library_dto.rs")),
            ("log", include_str!("log.rs")),
            ("mirror", include_str!("mirror.rs")),
            ("process", include_str!("process.rs")),
            ("settings", include_str!("settings.rs")),
            ("transfer", include_str!("transfer.rs")),
            ("update", include_str!("update.rs")),
        ];
        raw.map(|(name, src)| (name, production(src).to_string()))
    }

    #[test]
    fn default_shape_stays_with_owner() {
        let all = productions();
        let lib = all.iter().find(|(name, _)| *name == "lib").unwrap().1.as_str();
        assert!(lib.contains("fn default_true"), "bool-on owner missing");
        let lib_rest = strip_owner_line(lib, "    true");
        assert!(
            !lib_rest.contains("    true"),
            "default_true body restated in lib"
        );

        for (name, src) in &all {
            if *name == "lib" {
                continue;
            }
            assert!(
                !src.lines().any(|line| line == "    true"),
                "{name} restates default_true"
            );
            assert!(!src.contains("default_clear_device"), "{name}");
            assert!(!src.contains("default_export_ask"), "{name}");
            assert!(!src.contains(": true"), "{name} restates bool-on");
        }

        let settings = all
            .iter()
            .find(|(name, _)| *name == "settings")
            .unwrap()
            .1
            .as_str();
        let owners = [
            ("    System,", "Theme::System"),
            ("    Comfortable,", "Density::Comfortable"),
            ("    Yohu,", "LogColorScheme::Yohu"),
            ("    Clip,", "LogLineLayout::Clip"),
            ("    Usb,", "MirrorProtocol::Usb"),
            ("    TimeMillis,", "TerminalTimeFormat::TimeMillis"),
            ("    Collapsed,", "LibraryExpandMode::Collapsed"),
        ];
        for (owner, restated) in owners {
            assert!(settings.contains(owner), "missing owner {owner}");
            let rest = strip_owner_line(settings, owner);
            assert!(
                !rest.contains(restated),
                "{restated} remains after stripping the owner line"
            );
            for (name, src) in &all {
                if *name == "settings" {
                    continue;
                }
                assert!(!src.contains(restated), "{restated} in {name}");
            }
        }
    }
}
