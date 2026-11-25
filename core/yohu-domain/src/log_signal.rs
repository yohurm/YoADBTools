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
///
/// 在 Tag 与正文上分别匹配，不拼 `"tag: msg"` 中间串：这是每行都跑的热路径，
/// 拼接会给每条日志一次无谓的全量分配。针本身不含 `": "`，故两段分别匹配与
/// 拼接后匹配等价（唯一的跨段命中是「针跨 tag/msg 边界」，针里没有该边界字符，不可能发生）。
pub fn scan_signal(line: &LogLine) -> Option<SignalHit> {
    let crash = matches_any(&line.tag, &line.msg, &["FATAL EXCEPTION"]);
    if crash {
        return Some(SignalHit {
            pid: line.pid,
            kind: SignalKind::Crash,
        });
    }
    let anr = matches_any(&line.tag, &line.msg, &["ANR in", "am_anr"]);
    if anr {
        return Some(SignalHit {
            pid: line.pid,
            kind: SignalKind::Anr,
        });
    }
    None
}

/// 任一段（Tag / 正文）命中任一针即算命中；空针由 `contains_ascii_ignore_case` 视为包含。
fn matches_any(tag: &str, msg: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| {
        contains_ascii_ignore_case(tag, needle) || contains_ascii_ignore_case(msg, needle)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogLine;

    fn line(tag: &str, msg: &str) -> LogLine {
        LogLine {
            tag: tag.into(),
            msg: msg.into(),
            pid: 7,
            ..LogLine::default()
        }
    }

    /// 信号可以在 Tag 或正文任一处命中（不拼中间串）。
    #[test]
    fn signal_matches_in_either_tag_or_message() {
        assert_eq!(
            scan_signal(&line("AndroidRuntime", "FATAL EXCEPTION: main")).map(|h| h.kind),
            Some(SignalKind::Crash)
        );
        assert_eq!(
            scan_signal(&line("FATAL EXCEPTION", "no body")).map(|h| h.kind),
            Some(SignalKind::Crash),
            "Tag 命中也要算"
        );
        assert_eq!(
            scan_signal(&line("ActivityManager", "ANR in com.foo")).map(|h| h.kind),
            Some(SignalKind::Anr)
        );
        assert_eq!(
            scan_signal(&line("am_anr", "")).map(|h| h.kind),
            Some(SignalKind::Anr)
        );
        assert!(scan_signal(&line("T", "ordinary line")).is_none());
        assert!(scan_signal(&line("", "")).is_none());
    }

    /// 大小写不敏感，且非信号词不得误判。
    #[test]
    fn signal_matching_is_case_insensitive_without_false_positives() {
        assert_eq!(
            scan_signal(&line("T", "fatal exception: main")).map(|h| h.kind),
            Some(SignalKind::Crash)
        );
        // 「has died」「not responding」不是信号
        assert!(scan_signal(&line("T", "Process com.foo has died")).is_none());
        assert!(scan_signal(&line("T", "Application not responding")).is_none());
    }

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
            assert_eq!(got, case.kind.as_deref(), "case {i}");
            if let Some(hit) = scan_signal(&case.line) {
                assert_eq!(hit.pid, case.line.pid, "pid {i}");
            }
        }
    }
}
