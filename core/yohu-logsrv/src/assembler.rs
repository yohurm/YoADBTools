//! 对照 AS `LogcatMessageAssembler`：AOSP `FORMAT_LONG` 头 + 后续正文 → 一条 `LogLine`。
//!
//! AOSP 在消息后打印 `\n\n`。记录结束只由下一条头（或空闲 flush / 流结束）判定；
//! 中间空行算正文，`trim_end` 去掉记录尾部分隔空行。头之前的正文丢弃。
//! `--------- beginning of` 作为系统消息立即发出。

use yohu_protocol::LogLine;

use crate::parse::{is_system_line, parse_long_header, system_message, LogcatHeader};

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

    pub(crate) fn ingest(&mut self, raw: &str) -> Vec<LogLine> {
        let line = raw.replace('\r', "");
        if is_system_line(&line) {
            let mut out = Vec::new();
            if let Some(msg) = self.take() {
                out.push(msg);
            }
            out.push(system_message(&line));
            return out;
        }
        if let Some(header) = parse_long_header(&line) {
            let mut out = Vec::new();
            if let Some(msg) = self.take() {
                out.push(msg);
            }
            self.header = Some(header);
            return out;
        }
        if self.header.is_some() {
            self.body.push(line);
        }
        Vec::new()
    }

    pub(crate) fn take(&mut self) -> Option<LogLine> {
        let header = self.header.take()?;
        let msg = join_body(std::mem::take(&mut self.body));
        Some(LogLine {
            ts: header.ts,
            pid: header.pid,
            tid: header.tid,
            uid: header.uid,
            level: header.level,
            tag: header.tag,
            msg,
            ..LogLine::default()
        })
    }
}

fn join_body(lines: Vec<String>) -> String {
    let joined = lines.join("\n");
    joined.trim_end().to_string()
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
    fn system_line_flushes_and_emits() {
        let mut asm = MessageAssembler::new();
        asm.ingest("[ 2026-01-02 03:04:05.678  1: 2 I/T ]");
        asm.ingest("hello");
        let out = asm.ingest("--------- beginning of main");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].msg, "hello");
        assert_eq!(out[0].level, 'I');
        assert_eq!(out[1].level, '?');
        assert_eq!(out[1].msg, "--------- beginning of main");
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
}
