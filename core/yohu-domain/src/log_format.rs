//! 日志行文本格式（复制与导出共用）。protocol 只持有结构，排版在本层。

use yohu_protocol::LogLine;

/// 还原为 logcat threadtime 风格的一行文本。
pub fn format_log_line(line: &LogLine) -> String {
    match &line.uid {
        Some(uid) => format!(
            "{} {:>8} {:>5} {:>5} {} {}: {}",
            line.ts, uid, line.pid, line.tid, line.level, line.tag, line.msg
        ),
        None => format!(
            "{} {:>5} {:>5} {} {}: {}",
            line.ts, line.pid, line.tid, line.level, line.tag, line.msg
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogLine;

    #[test]
    fn format_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            line: LogLine,
            expect: String,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/format_log_line.json"))
                .expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(format_log_line(&case.line), case.expect, "case {i}");
        }
    }
}
