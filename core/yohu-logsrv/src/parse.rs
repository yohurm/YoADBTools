//! `logcat -v long,uid,year` 头。语法只认 AOSP `liblog/logprint.cpp` 的 `FORMAT_LONG`。
//!
//! 打印机：
//! ```text
//! [ %s %s%5d:%5d %c/%-8s ]
//! ```
//!
//! - 时间 `%s`：`year` → `YYYY-MM-DD HH:MM:SS.mmm`；否则 `MM-DD HH:MM:SS.mmm`；`epoch` → `seconds.mmm`
//! - uid `%s`：开 `uid` 时是 `%5s:` / `%5d:`（` root:` / ` 1000:` / `shell:`）；否则一个空格
//! - 因此 ids 只有两种：`pid:tid` 或 `uid:pid:tid`（冒号旁可有空格）
//!
//! AS `LogcatHeaderParser` 只覆盖无 uid 的 `pid:tid`。本层把 `uid` 修饰按打印机补全，不是 threadtime 的空格分隔 uid。
//! 产品采集 `long,uid,year`。不是头返回 `None`（正文）。

use time::{Duration as TimeDuration, OffsetDateTime, UtcOffset};
use yohu_domain::{canonicalize_datetime, format_datetime, is_log_level_letter};
use yohu_protocol::LogLine;

const SYSTEM_LINE_PREFIX: &str = "--------- beginning of ";

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LogcatHeader {
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    pub uid: Option<String>,
    pub level: char,
    pub tag: String,
}

pub(crate) fn is_system_line(raw: &str) -> bool {
    raw.starts_with(SYSTEM_LINE_PREFIX) || raw.trim_start().starts_with(SYSTEM_LINE_PREFIX)
}

pub(crate) fn system_message(raw: &str) -> LogLine {
    LogLine {
        msg: raw.to_string(),
        ..LogLine::default()
    }
}

pub(crate) fn parse_long_header(raw: &str) -> Option<LogcatHeader> {
    let inner = strip_brackets(raw.trim())?;
    let (ts, rest) = take_timestamp(inner)?;
    let rest = skip_zone(rest).trim_start();
    let (ids, level, tag) = take_level_tag(rest)?;
    let (uid, pid, tid) = parse_process_ids(ids)?;
    Some(LogcatHeader {
        ts,
        pid,
        tid,
        uid,
        level,
        tag,
    })
}

fn strip_brackets(line: &str) -> Option<&str> {
    Some(line.strip_prefix('[')?.strip_suffix(']')?.trim()).filter(|inner| !inner.is_empty())
}

fn take_level_tag(rest: &str) -> Option<(&str, char, String)> {
    let slash = rest.rfind('/')?;
    let before = rest[..slash].trim_end();
    let tag = rest[slash + 1..].trim().to_string();
    let level_at = before.rfind(char::is_whitespace)? + 1;
    let level_tok = &before[level_at..];
    if level_tok.len() != 1 || !is_log_level_letter(level_tok) {
        return None;
    }
    Some((before[..level_at].trim(), level_tok.chars().next()?, tag))
}

/// `pid:tid` 或 `uid:pid:tid`。uid 是数字或短名（`root`/`shell`）。
fn parse_process_ids(ids: &str) -> Option<(Option<String>, u32, u32)> {
    let parts: Vec<&str> = ids.split(':').map(str::trim).collect();
    match parts.as_slice() {
        [pid, tid] if !pid.is_empty() && !tid.is_empty() => {
            Some((None, parse_u32(pid)?, parse_u32(tid)?))
        }
        [uid, pid, tid] if !uid.is_empty() && !pid.is_empty() && !tid.is_empty() => {
            Some((Some((*uid).to_string()), parse_u32(pid)?, parse_u32(tid)?))
        }
        _ => None,
    }
}

fn parse_u32(s: &str) -> Option<u32> {
    s.parse().ok()
}

fn take_timestamp(inner: &str) -> Option<(String, &str)> {
    take_ymd(inner)
        .or_else(|| take_md(inner))
        .or_else(|| take_epoch(inner))
}

fn take_ymd(inner: &str) -> Option<(String, &str)> {
    let (date, rest) = inner.split_once(char::is_whitespace)?;
    if !is_ymd(date) {
        return None;
    }
    let rest = rest.trim_start();
    let (time, rest) = rest.split_once(char::is_whitespace)?;
    let ts = canonicalize_datetime(&format!("{date} {time}"))?;
    Some((ts, rest))
}

fn take_md(inner: &str) -> Option<(String, &str)> {
    let (date, rest) = inner.split_once(char::is_whitespace)?;
    if !is_md(date) {
        return None;
    }
    let rest = rest.trim_start();
    let (time, rest) = rest.split_once(char::is_whitespace)?;
    let year = local_now().year();
    let ts = canonicalize_datetime(&format!("{year:04}-{date} {time}"))?;
    Some((ts, rest))
}

fn take_epoch(inner: &str) -> Option<(String, &str)> {
    let (token, rest) = inner.split_once(char::is_whitespace)?;
    let (sec, milli) = token.split_once('.')?;
    if sec.is_empty() || !sec.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if milli.len() < 3 || !milli.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let seconds: i64 = sec.parse().ok()?;
    let millis: u32 = milli[..3].parse().ok()?;
    let ts = epoch_to_wall(seconds, millis)?;
    Some((ts, rest))
}

fn skip_zone(rest: &str) -> &str {
    let rest = rest.trim_start();
    let Some((token, tail)) = rest.split_once(char::is_whitespace) else {
        return rest;
    };
    if is_zone_token(token) {
        tail
    } else {
        rest
    }
}

fn is_zone_token(token: &str) -> bool {
    matches!(token.as_bytes().first(), Some(b'+' | b'-'))
        && token.chars().filter(|c| c.is_ascii_digit()).count() >= 4
}

fn is_ymd(date: &str) -> bool {
    let mut parts = date.split('-');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some(y), Some(m), Some(d), None) if y.len() == 4 && m.len() == 2 && d.len() == 2
    )
}

fn is_md(date: &str) -> bool {
    let mut parts = date.split('-');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(m), Some(d), None) if m.len() == 2 && d.len() == 2
    )
}

fn local_now() -> OffsetDateTime {
    OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc())
}

fn epoch_to_wall(seconds: i64, millis: u32) -> Option<String> {
    let instant = OffsetDateTime::from_unix_timestamp(seconds).ok()?
        + TimeDuration::milliseconds(i64::from(millis));
    let offset = UtcOffset::current_local_offset().unwrap_or(UtcOffset::UTC);
    let local = instant.to_offset(offset);
    format_datetime(
        u32::try_from(local.year()).ok()?,
        u32::from(u8::from(local.month())),
        u32::from(local.day()),
        u32::from(local.hour()),
        u32::from(local.minute()),
        u32::from(local.second()),
        u32::from(local.millisecond()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_official_standard_header() {
        let header = parse_long_header("[ 08-18 16:39:11.760 2977: 2988 D/PhoneInterfaceManager ]")
            .expect("header");
        assert_eq!(header.pid, 2977);
        assert_eq!(header.tid, 2988);
        assert_eq!(header.level, 'D');
        assert_eq!(header.tag, "PhoneInterfaceManager");
        assert!(header.ts.ends_with("16:39:11.760"));
        assert_eq!(header.uid, None);
    }

    #[test]
    fn parses_official_epoch_header() {
        let header =
            parse_long_header("[ 1650901603.644 1505: 1539 W/BroadcastQueue ]").expect("epoch");
        assert_eq!(header.pid, 1505);
        assert_eq!(header.tid, 1539);
        assert_eq!(header.level, 'W');
        assert_eq!(header.tag, "BroadcastQueue");
        assert_eq!(header.ts.len(), 23);
    }

    #[test]
    fn parses_year_pid_tid() {
        let header =
            parse_long_header("[ 2026-01-02 03:04:05.678  1234: 5678 I/TestTag ]").expect("year");
        assert_eq!(header.ts, "2026-01-02 03:04:05.678");
        assert_eq!(header.uid, None);
        assert_eq!(header.pid, 1234);
        assert_eq!(header.tid, 5678);
        assert_eq!(header.level, 'I');
        assert_eq!(header.tag, "TestTag");
    }

    #[test]
    fn parses_aosp_uid_pid_tid() {
        let spaced = parse_long_header(
            "[ 2026-09-19 16:08:39.206  1000: 1585: 9014 D/StorageStatsService ]",
        )
        .expect("spaced");
        assert_eq!(spaced.uid.as_deref(), Some("1000"));
        assert_eq!(spaced.pid, 1585);
        assert_eq!(spaced.tid, 9014);
        assert_eq!(spaced.tag, "StorageStatsService");

        let tight = parse_long_header("[ 2026-09-19 16:09:33.187 10332:21503:21503 I/flutter  ]")
            .expect("tight");
        assert_eq!(tight.uid.as_deref(), Some("10332"));
        assert_eq!(tight.pid, 21503);
        assert_eq!(tight.tid, 21503);
        assert_eq!(tight.tag, "flutter");

        let named = parse_long_header("[ 2026-09-19 16:08:39.277 shell:31942:31942 I/adbd     ]")
            .expect("named");
        assert_eq!(named.uid.as_deref(), Some("shell"));
        assert_eq!(named.pid, 31942);
        assert_eq!(named.tag, "adbd");

        let root = parse_long_header("[ 2026-09-19 16:09:32.849  root: 1212: 1212 D/AOC      ]")
            .expect("root");
        assert_eq!(root.uid.as_deref(), Some("root"));
        assert_eq!(root.pid, 1212);
    }

    #[test]
    fn threadtime_uid_is_not_a_long_header() {
        assert!(
            parse_long_header("[ 2026-01-02 03:04:05.678  1000  1234: 5678 I/TestTag ]").is_none()
        );
        assert!(parse_long_header("2026-01-02 03:04:05.678  1234  5678 I T: hello").is_none());
    }

    #[test]
    fn parses_tight_pid_tid() {
        let header =
            parse_long_header("[ 2026-09-19 15:42:18.416  21503:21503 D/permissions_handler ]")
                .expect("tight");
        assert_eq!(header.pid, 21503);
        assert_eq!(header.tid, 21503);
        assert_eq!(header.uid, None);
        assert_eq!(header.tag, "permissions_handler");
    }

    #[test]
    fn parses_printer_padded_pid_tid() {
        let header =
            parse_long_header("[ 08-18 16:39:11.760   123:   45 D/Tag      ]").expect("pad");
        assert_eq!(header.pid, 123);
        assert_eq!(header.tid, 45);
        assert_eq!(header.uid, None);
        assert_eq!(header.tag, "Tag");
    }

    #[test]
    fn tag_can_contain_brackets() {
        let header =
            parse_long_header("[ 1619728495.554  2848: 2848 I/DisplayPowerController[0] ]")
                .expect("tag");
        assert_eq!(header.tag, "DisplayPowerController[0]");
    }

    #[test]
    fn skips_optional_zone() {
        let header = parse_long_header(
            "[ 2026-09-19 16:08:39.206 +0800  1000: 1585: 9014 D/StorageStatsService ]",
        )
        .expect("zone");
        assert_eq!(header.ts, "2026-09-19 16:08:39.206");
        assert_eq!(header.pid, 1585);
        assert_eq!(header.uid.as_deref(), Some("1000"));
    }

    #[test]
    fn body_line_is_not_header() {
        assert!(parse_long_header("Unable to detect current Activity.").is_none());
        assert!(parse_long_header("[2026-09-19T16:09:33.187210] INFO Luci: x").is_none());
    }

    #[test]
    fn system_and_buffer_headers() {
        assert!(is_system_line("--------- beginning of main"));
        assert!(is_system_line("--------- beginning of system"));
        assert!(!is_system_line("hello"));
    }
}
