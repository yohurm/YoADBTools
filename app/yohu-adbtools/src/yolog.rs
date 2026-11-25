//! 应用操作日志入口：tracing（落盘 + 控制台）与内存环同步。

use yohu_domain::{AppLog, LogLevel};

pub fn write(log: &AppLog, level: LogLevel, module: &str, message: &str) {
    match level {
        LogLevel::Info => tracing::info!(module, "{message}"),
        LogLevel::Warn => tracing::warn!(module, "{message}"),
        LogLevel::Error => tracing::error!(module, "{message}"),
    }
    log.push(level, format!("[{module}] {message}"));
}

pub fn parse_level(level: &str) -> LogLevel {
    if level == LogLevel::Warn.as_str() {
        LogLevel::Warn
    } else if level == LogLevel::Error.as_str() {
        LogLevel::Error
    } else {
        LogLevel::Info
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_log_words_come_from_the_level() {
        assert_eq!(parse_level(LogLevel::Warn.as_str()), LogLevel::Warn);
        assert_eq!(parse_level(LogLevel::Error.as_str()), LogLevel::Error);
        assert_eq!(parse_level(LogLevel::Info.as_str()), LogLevel::Info);
        assert_eq!(parse_level("nope"), LogLevel::Info);
        let src = include_str!("yolog.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert!(!production.contains("\"warn\""));
        assert!(!production.contains("\"error\""));
        assert!(!production.contains("\"info\""));
    }
}
