//! 对照 AS `LogcatMessageAssembler`：AOSP `FORMAT_LONG` 头 + 后续正文 → 一条 `LogLine`。
//!
//! AOSP 在消息后打印 `\n\n`。记录结束只由下一条头（或空闲 flush / 流结束）判定；
//! 中间空行算正文，`trim_end` 去掉记录尾部分隔空行。头之前的正文丢弃。
//! `--------- beginning of` 作为系统消息立即发出（不冲刷未闭合的上一条记录，与 AS 一致）。
//!
//! 栈展开只产出纯帧文本；「这一行是补出来的」不进正文（见 [`crate::stack_trace`]）。

use crate::parse::{is_system_line, parse_long_header, system_message, LogcatHeader};
use crate::record::LogRecord;
use crate::stack_trace::expand_stack_trace_lines;

pub(crate) struct MessageAssembler {
    header: Option<LogcatHeader>,
    body: Vec<String>,
}

impl MessageAssembler {
    pub(crate) fn new() -> Self {
        Self {
            header: None,
            body: Vec::new(),
        }
    }

    pub(crate) fn has_pending(&self) -> bool {
        self.header.is_some() && !self.body.is_empty()
    }

    pub(crate) fn ingest(&mut self, raw: &str) -> Vec<LogRecord> {
        // 绝大多数行不含 `\r`：借用原文，避免每行无条件新建 String（P1-2）。
        let line: std::borrow::Cow<'_, str> = if raw.contains('\r') {
            std::borrow::Cow::Owned(raw.replace('\r', ""))
        } else {
            std::borrow::Cow::Borrowed(raw)
        };
        if is_system_line(&line) {
            return vec![system_message(&line)];
        }
        if let Some(header) = parse_long_header(&line) {
            let mut out = Vec::new();
            if let Some(msg) = self.flush() {
                out.push(msg);
            }
            self.header = Some(header);
            return out;
        }
        if self.header.is_some() {
            self.body.push(line.into_owned());
        }
        Vec::new()
    }

    pub(crate) fn take(&mut self) -> Option<LogRecord> {
        self.flush()
    }

    fn flush(&mut self) -> Option<LogRecord> {
        if !self.has_pending() {
            return None;
        }
        let header = self.header.take()?;
        let expanded = expand_stack_trace_lines(&std::mem::take(&mut self.body));
        let msg = join_body(expanded);
        Some(LogRecord {
            ts: header.ts,
            pid: header.pid,
            tid: header.tid,
            uid: header.uid,
            level: header.level,
            tag: header.tag,
            msg,
        })
    }
}

/// 一次容量预留拼完全部正文，末尾裁掉记录分隔空行（不整串 `trim_end` 再拷一份）。
fn join_body(lines: Vec<String>) -> String {
    let total: usize = lines.iter().map(String::len).sum::<usize>() + lines.len().saturating_sub(1);
    let mut joined = String::with_capacity(total);
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            joined.push('\n');
        }
        joined.push_str(line);
    }
    let trimmed = joined.trim_end().len();
    joined.truncate(trimmed);
    joined
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_header_closes_previous_record() {
        let mut asm = MessageAssembler::new();
        assert!(asm
            .ingest("[ 2026-09-19 15:42:18.416  21503:21503 D/permissions_handler ]")
            .is_empty());
        assert!(asm.ingest("Unable to detect current Activity.").is_empty());
        assert!(asm.ingest("#0 MethodChannel.invokeMethod").is_empty());
        let done = asm.ingest("[ 2026-09-19 15:42:18.417  21503:21503 I/flutter ]");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].tag, "permissions_handler");
        assert_eq!(
            done[0].msg,
            "Unable to detect current Activity.\n#0 MethodChannel.invokeMethod"
        );
        assert_eq!(done[0].pid, 21503);
        assert_eq!(done[0].uid, None);
        assert!(asm.ingest("socket details").is_empty());
        let last = asm.take().expect("flush");
        assert_eq!(last.tag, "flutter");
        assert_eq!(last.msg, "socket details");
    }

    #[test]
    fn long_single_line_stays_one_record() {
        let mut asm = MessageAssembler::new();
        assert!(asm
            .ingest("[ 2026-09-19 15:42:18.574  1756:1763 I/pixel-thermal ]")
            .is_empty());
        assert!(asm
            .ingest("usb_pwr_therm@2:35,3560 raw_data: usb_pwr_therm@2:353556")
            .is_empty());
        let line = asm.take().expect("one");
        assert_eq!(line.tag, "pixel-thermal");
        assert!(!line.msg.contains('\n'));
        assert!(line.msg.contains("usb_pwr_therm"));
    }

    #[test]
    fn blank_inside_message_is_kept() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]");
        asm.ingest("one");
        asm.ingest("");
        asm.ingest("two");
        let line = asm.take().expect("msg");
        assert_eq!(line.msg, "one\n\ntwo");
    }

    #[test]
    fn trailing_record_separator_is_trimmed() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1000: 1: 2 I/T ]");
        asm.ingest("hello");
        asm.ingest("");
        let done = asm.ingest("[ 2026-01-02 03:04:05.679  1000: 1: 2 I/T ]");
        assert_eq!(done[0].msg, "hello");
    }

    #[test]
    fn lines_before_first_header_are_discarded() {
        let mut asm = MessageAssembler::new();
        assert!(asm.ingest("garbage").is_empty());
        assert!(asm
            .ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]")
            .is_empty());
        assert!(asm.ingest("ok").is_empty());
        assert_eq!(asm.take().expect("ok").msg, "ok");
    }

    #[test]
    fn system_line_does_not_flush_open_record() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]");
        asm.ingest("hello");
        let out = asm.ingest("--------- beginning of main");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].level, '?');
        assert_eq!(out[0].msg, "--------- beginning of main");
        assert!(asm.has_pending());
        let done = asm.ingest("[ 2026-01-02 03:04:05.679  1: 2 I/U ]");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].msg, "hello");
        assert_eq!(done[0].tag, "T");
    }

    #[test]
    fn header_without_body_is_not_flushed_on_next_header() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]");
        assert!(!asm.has_pending());
        let out = asm.ingest("[ 2026-01-02 03:04:05.679  1: 2 I/U ]");
        assert!(out.is_empty());
        asm.ingest("only-u");
        assert_eq!(asm.take().expect("u").tag, "U");
    }

    #[test]
    fn pending_requires_body() {
        let mut asm = MessageAssembler::new();
        assert!(!asm.has_pending());
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]");
        assert!(!asm.has_pending());
        asm.ingest("tick");
        assert!(asm.has_pending());
    }

    /// 折叠栈展开后，记录正文必须是纯帧文本：标记不进 `msg`，导出/复制/关键字匹配不受污染。
    #[test]
    fn expanded_stack_frames_keep_message_text_clean() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 E/AndroidRuntime ]");
        asm.ingest("FATAL EXCEPTION: main");
        asm.ingest("at com.foo.A.method(A.java:1)");
        asm.ingest("Caused by: java.lang.IllegalStateException");
        asm.ingest("... 1 more");
        let record = asm.take().expect("flush");

        assert!(!record.msg.contains('\u{00A0}'), "NBSP 不得进入正文");
        assert_eq!(
            record.msg,
            "FATAL EXCEPTION: main\nat com.foo.A.method(A.java:1)\nCaused by: java.lang.IllegalStateException\nat com.foo.A.method(A.java:1)"
        );
        // 关键字匹配必须能命中补出来的帧（NBSP 会让它失配）
        let probe = yohu_protocol::LogLine {
            msg: record.msg.clone(),
            ..yohu_protocol::LogLine::default()
        };
        let filter = yohu_protocol::LogFilter {
            message_contains: Some("com.foo.A.method".into()),
            ..Default::default()
        };
        assert!(yohu_domain::log_filter_matches(&filter, &probe));
    }

    #[test]
    fn as_fixture_multiple_complete_messages() {
        let mut asm = MessageAssembler::new();
        let block = "\
[          1619900000.101  1: 2000 D/Tag  ]
Message 1

[          1619900000.102  1: 2000 D/Tag  ]
Message 2

[          1619900000.103  1: 2000 D/Tag  ]
Message 3
";
        for line in block.lines() {
            asm.ingest(line);
        }
        let last = asm.take().expect("flush");
        assert_eq!(last.msg, "Message 3");
    }

    #[test]
    fn as_fixture_system_lines_order() {
        let mut asm = MessageAssembler::new();
        let lines = [
            "--------- beginning of crash",
            "[          1619900001.123  1:1000 I/Tag1  ]",
            "Message 1",
            "",
            "--------- beginning of system",
            "[          1619900001.123  1:1000 I/Tag2  ]",
            "Message 2",
        ];
        let mut out = Vec::new();
        for line in lines {
            out.extend(asm.ingest(line));
        }
        out.extend(asm.take());
        assert_eq!(out.len(), 4);
        assert_eq!(out[0].msg, "--------- beginning of crash");
        assert_eq!(out[1].msg, "--------- beginning of system");
        assert_eq!(out[2].msg, "Message 1");
        assert_eq!(out[3].msg, "Message 2");
    }

    #[test]
    fn as_fixture_lines_without_header_dropped() {
        let mut asm = MessageAssembler::new();
        assert!(asm.ingest("Message 1").is_empty());
        asm.ingest("[          1619900001.123  1:1000 I/Tag2  ]");
        asm.ingest("Message 2");
        let line = asm.take().expect("one");
        assert_eq!(line.msg, "Message 2");
    }

    #[test]
    fn pixel_uid_pid_tid_header_closes_record() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-09-19 16:09:33.046 shell: 4310: 4310 W/libbinder.BackendUnifiedServiceManager ]");
        asm.ingest("Thread Pool max thread count is 0.");
        let done = asm.ingest("[ 2026-09-19 16:09:33.187 10332:21503:21503 I/flutter  ]");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].tag, "libbinder.BackendUnifiedServiceManager");
        assert_eq!(done[0].uid.as_deref(), Some("shell"));
        assert_eq!(done[0].msg, "Thread Pool max thread count is 0.");
        assert!(asm
            .ingest("[2026-09-19T16:09:33.187210] INFO Luci: lifecycle")
            .is_empty());
        let flutter = asm.take().expect("flutter");
        assert_eq!(flutter.tag, "flutter");
        assert_eq!(flutter.pid, 21503);
        assert_eq!(flutter.uid.as_deref(), Some("10332"));
        assert_eq!(
            flutter.msg,
            "[2026-09-19T16:09:33.187210] INFO Luci: lifecycle"
        );
    }

    #[test]
    fn header_with_slash_tag_closes_previous_record() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-11-19 08:43:09.000  1000: 123: 456 I/First ]");
        asm.ingest("first body");
        let done = asm.ingest("[ 2026-11-19 08:43:09.100  1000: 123: 457 I/OkHttp/4.9.0 ]");
        assert_eq!(done.len(), 1, "带 / 的 Tag 头必须闭合上一条，不得被当正文");
        assert_eq!(done[0].tag, "First");
        assert_eq!(done[0].msg, "first body");
        assert!(!done[0].msg.contains("OkHttp"), "上一条正文不得吞下下一条头");
        asm.ingest("second body");
        let second = asm.take().expect("second");
        assert_eq!(second.tag, "OkHttp/4.9.0");
        assert_eq!(second.msg, "second body");
    }

    #[test]
    fn join_body_capacity_matches_actual_length() {
        for lines in [
            vec!["a".to_string()],
            vec!["a".to_string(), "bb".to_string()],
            vec!["a".to_string(), String::new(), "ccc".to_string()],
            vec!["trailing".to_string(), String::new(), String::new()],
        ] {
            let expected: String = lines.join("\n").trim_end().to_string();
            assert_eq!(join_body(lines), expected);
        }
    }
}
