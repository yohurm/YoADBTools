//! 日志信号：崩溃 / ANR。只认明确正文，不把 has died / not responding 当信号。

use yohu_protocol::LogLine;

use crate::log_filter::contains_ascii_ignore_case;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignalKind {
    Crash,
    Anr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SignalHit {
    pub pid: u32,
    pub kind: SignalKind,
}

/// 崩溃只要 `FATAL EXCEPTION`；ANR 只要 `ANR in` / `am_anr`。
pub fn scan_signal(line: &LogLine) -> Option<SignalHit> {
    let text = format!("{}: {}", line.tag, line.msg);
    if contains_ascii_ignore_case(&text, "FATAL EXCEPTION") {
        return Some(SignalHit {
            pid: line.pid,
            kind: SignalKind::Crash,
        });
    }
    if contains_ascii_ignore_case(&text, "ANR in") || contains_ascii_ignore_case(&text, "am_anr") {
        return Some(SignalHit {
            pid: line.pid,
            kind: SignalKind::Anr,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogLine;

    #[test]
    fn scan_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            line: LogLine,
            kind: Option<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/log_signal.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            let got = scan_signal(&case.line).map(|hit| match hit.kind {
                SignalKind::Crash => "crash",
                SignalKind::Anr => "anr",
            });
            assert_eq!(got.as_deref(), case.kind.as_deref(), "case {i}");
            if let Some(hit) = scan_signal(&case.line) {
                assert_eq!(hit.pid, case.line.pid, "pid {i}");
            }
        }
    }
}
