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
//! 级别与 Tag 之间的 `/` 只认第一个（`<ids> <LEVEL>/<tag>`）：Tag 本身可以含 `/`（`OkHttp/4.9.0`）。

use time::{Duration as TimeDuration, OffsetDateTime, UtcOffset};
use yohu_domain::{
    canonicalize_datetime, format_datetime, is_log_level_char, is_zone_token,
};

use crate::record::LogRecord;

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
    raw.trim_start().starts_with(SYSTEM_LINE_PREFIX)
}

pub(crate) fn system_message(raw: &str) -> LogRecord {
    LogRecord {
        msg: raw.to_string(),
        ..LogRecord::default()
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
    // 级别与 Tag 的分隔斜杠是 `rest` 里的**第一个** `/`：`rest = <ids> <LEVEL>/<tag>`，
    // 其中 ids 只含数字/短名/冒号/空白，不含 `/`；而 Tag 本身可以含 `/`（`OkHttp/4.9.0`、
    // `com.example/Foo`）。用 `rfind` 会把 Tag 内的 `/` 当分隔符，导致整个 header 解析失败，
    // 下一条 header 被当成正文塞进上一条消息尾部（时间卡在后面 / 格式错）。
    let slash = rest.find('/')?;
    let before = rest[..slash].trim_end();
    let tag = rest[slash + 1..].trim().to_string();
    let level_at = before.rfind(char::is_whitespace)? + 1;
    let level_tok = &before[level_at..];
    if level_tok.len() != 1 || !is_header_priority_letter(level_tok) {
        return None;
    }
    let raw = level_tok.chars().next()?;
    Some((
        before[..level_at].trim(),
        normalize_header_priority(raw),
        tag,
    ))
}

/// 头里的优先级是单字符 ASCII 字母（AOSP `filterPriToChar` 会产出 `S`/`?` 等）。
/// 级别表之外的字母归一为 `'?'`，但不得因此整头拒绝、吞掉整条记录。
fn is_header_priority_letter(token: &str) -> bool {
    let mut chars = token.chars();
    matches!((chars.next(), chars.next()), (Some(c), None) if c.is_ascii_alphabetic() || c == '?')
}

/// 把头里的单字符优先级归一为 [`yohu_domain::LOG_LEVEL_LETTERS`] 里的值。
///
/// Assert（`A`）是 AS 的显示别名，wire 上归一到 `F`：级别词汇表只有一份
/// （`V D I W E F`），不允许「解析层放行、过滤层不认」。其余未知字母（`S` 等）归一为 `'?'`，
/// 但仍保留整条记录。
fn normalize_header_priority(raw: char) -> char {
    let upper = raw.to_ascii_uppercase();
    if is_log_level_char(upper) {
        return upper;
    }
    if upper == 'A' {
        return 'F';
    }
    '?'
}

/// `pid:tid` 或 `uid:pid:tid`。每一段是单个记号（数字或 `root`/`shell`）。
/// 段内再出现空白是 threadtime 的空格分隔 uid，不是 FORMAT_LONG。
fn parse_process_ids(ids: &str) -> Option<(Option<String>, u32, u32)> {
    let parts: Vec<&str> = ids.split(':').map(str::trim).collect();
    match parts.as_slice() {
        [pid, tid] => Some((None, parse_pid(id_token(pid)?), parse_thread_id(id_token(tid)?))),
        [uid, pid, tid] => Some((
            Some(id_token(uid)?.to_string()),
            parse_pid(id_token(pid)?),
            parse_thread_id(id_token(tid)?),
        )),
        _ => None,
    }
}

fn id_token(part: &str) -> Option<&str> {
    if part.is_empty() || part.chars().any(char::is_whitespace) {
        None
    } else {
        Some(part)
    }
}

/// 对照 AS `parsePid`：过长/越界数字返回 -1（wire 用 `u32::MAX` 占位）。
fn parse_pid(s: &str) -> u32 {
    match s.parse::<i64>() {
        Ok(n) if (0..=u32::MAX as i64).contains(&n) => n as u32,
        Ok(_) => u32::MAX,
        Err(_) => u32::MAX,
    }
}

/// 对照 AS `parseThreadId` / ddmlib `Integer.decode`（十进制 / `0x` 十六进制）。
fn parse_thread_id(s: &str) -> u32 {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return u32::MAX;
    }
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return u32::from_str_radix(hex, 16).unwrap_or(u32::MAX);
    }
    trimmed.parse().unwrap_or(u32::MAX)
}

fn take_timestamp(inner: &str) -> Option<(String, &str)> {
    take_ymd(inner).or_else(|| take_epoch(inner))
}

/// 墙钟头是日期、空白、时间、空白、其余。年月日形状和月日形状仍各问各的。
fn split_date_time(inner: &str) -> Option<(&str, &str, &str)> {
    let (date, rest) = inner.split_once(char::is_whitespace)?;
    let rest = rest.trim_start();
    let (time, rest) = rest.split_once(char::is_whitespace)?;
    Some((date, time, rest))
}

/// `YYYY-MM-DD HH:MM:SS.mmm`（产品 argv 固定 `long,uid,year`，这是唯一可达的墙钟形状）。
///
/// 先按形状预判长度再拼接：避免对每条正文都做一次 `format!`。
fn take_ymd(inner: &str) -> Option<(String, &str)> {
    let (date, time, rest) = split_date_time(inner)?;
    // `YYYY-MM-DD` 定长 10；时间 `HH:MM:SS.mmm` 定长 12。形状不符直接返回，不分配。
    if date.len() != 10 || time.len() != 12 {
        return None;
    }
    let mut stamp = String::with_capacity(23);
    stamp.push_str(date);
    stamp.push(' ');
    stamp.push_str(time);
    let ts = canonicalize_datetime(&stamp)?;
    Some((ts, rest))
}

fn all_ascii_digits(token: &str) -> bool {
    token.bytes().all(|b| b.is_ascii_digit())
}

fn take_epoch(inner: &str) -> Option<(String, &str)> {
    let (token, rest) = inner.split_once(char::is_whitespace)?;
    let (sec, milli) = token.split_once('.')?;
    if sec.is_empty() || !all_ascii_digits(sec) {
        return None;
    }
    if milli.len() < 3 || !all_ascii_digits(milli) {
        return None;
    }
    // 秒数超出 i64 或非法时拒绝该头，不得静默造 1970 时间戳。
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

/// epoch 头（`logcat -v long` 的 `epoch` 变体，`seconds.mmm`）→ 本地墙钟。
///
/// 这是**换算**，不是造值：秒数由设备给出，缺的只是时区。时区取不到时回落 UTC 并保留原时刻。
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
        let header = parse_long_header("[ 2026-08-18 16:39:11.760 2977: 2988 D/PhoneInterfaceManager ]")
            .expect("header");
        assert_eq!(header.pid, 2977);
        assert_eq!(header.tid, 2988);
        assert_eq!(header.level, 'D');
        assert_eq!(header.tag, "PhoneInterfaceManager");
        assert_eq!(header.ts, "2026-08-18 16:39:11.760");
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
            parse_long_header("[ 2026-08-18 16:39:11.760   123:   45 D/Tag      ]").expect("pad");
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
    fn tag_can_contain_slash() {
        let header =
            parse_long_header("[ 2026-11-19 08:43:09.100  1000: 123: 457 I/OkHttp/4.9.0 ]")
                .expect("slash tag");
        assert_eq!(header.level, 'I');
        assert_eq!(header.tag, "OkHttp/4.9.0");
        assert_eq!(header.pid, 123);
        assert_eq!(header.tid, 457);
        assert_eq!(header.uid.as_deref(), Some("1000"));

        let composed =
            parse_long_header("[ 2026-11-19 08:43:09.100  1000: 123: 457 I/com.example/Foo ]")
                .expect("composed tag");
        assert_eq!(composed.tag, "com.example/Foo");
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
    fn parses_hex_thread_id() {
        let header =
            parse_long_header("[ 2026-01-02 03:04:05.678  1234: 0x2a I/TestTag ]").expect("hex");
        assert_eq!(header.tid, 42);
        let tight = parse_long_header("[ 1517266949.472 5755:0x100 I/Tag ]").expect("as fixture");
        assert_eq!(tight.pid, 5755);
        assert_eq!(tight.tid, 256);
    }

    #[test]
    fn invalid_pid_still_parses_header() {
        let header = parse_long_header(
            "[ 1517266949.472 1234567890123456789012345678901234567890:601 I/Tag ]",
        )
        .expect("header");
        assert_eq!(header.pid, u32::MAX);
        assert_eq!(header.tid, 601);
        assert_eq!(header.tag, "Tag");
    }

    #[test]
    fn invalid_epoch_seconds_rejects_header() {
        // 秒数溢出不静默造 1970，整头拒绝（当正文处理），不伪造时间。
        assert!(parse_long_header(
            "[ 1234567890123456789012345678901234567890.472 5755:601 I/Tag ]"
        )
        .is_none());
    }

    /// `A`（Assert）在 wire 上归一为 `F`：级别词汇表只有一份，不得「放行但不认」。
    #[test]
    fn assert_priority_normalizes_to_fatal() {
        let header =
            parse_long_header("[ 2026-01-02 03:04:05.678  1: 2 A/MyTag ]").expect("assert");
        assert_eq!(header.level, 'F');
        assert_eq!(header.tag, "MyTag");
        assert!(
            yohu_domain::is_log_level_char(header.level),
            "归一后必须属于级别词汇表"
        );

        // 小写 a 同样归一
        let lower =
            parse_long_header("[ 2026-01-02 03:04:05.678  1: 2 a/MyTag ]").expect("assert lower");
        assert_eq!(lower.level, 'F');

        // 归一后的级别可以被过滤层精确选中
        let line = yohu_protocol::LogLine {
            level: header.level,
            tag: header.tag.clone(),
            ..yohu_protocol::LogLine::default()
        };
        let filter = yohu_protocol::LogFilter {
            levels: vec!['F'],
            ..Default::default()
        };
        assert!(
            yohu_domain::log_filter_matches(&filter, &line),
            "Assert 归一为 F 后必须能按级别过滤"
        );
    }

    /// 无年份的 `MM-DD` 头不补年份：解析层不得静默造值，按正文处理。
    #[test]
    fn month_day_header_without_year_is_rejected() {
        // 产品 argv 固定 `long,uid,year`；无年份形状（`08-18 16:39:11.760`）不得被当墙钟头
        assert!(parse_long_header("[ 08-18 16:39:11.760 2977: 2988 D/PhoneInterfaceManager ]").is_none());
        assert!(parse_long_header("[ 08-18 16:39:11.760   123:   45 D/Tag      ]").is_none());
    }

    #[test]
    fn unknown_priority_normalizes_to_question_without_dropping() {
        // AOSP filterPriToChar 可产 S（SILENT）/ ?（DEFAULT/UNKNOWN）：整头不得被拒。
        let silent = parse_long_header("[ 2026-11-19 08:43:09.100  1000: 123: 457 S/SomeTag ]")
            .expect("S 头不得被拒");
        assert_eq!(silent.level, '?');
        assert_eq!(silent.tag, "SomeTag");

        let unknown = parse_long_header("[ 2026-11-19 08:43:09.100  1000: 123: 457 ?/SomeTag ]")
            .expect("? 头不得被拒");
        assert_eq!(unknown.level, '?');

        // [VDIWEFA] 结果不得改变
        let info = parse_long_header("[ 2026-11-19 08:43:09.100  1000: 123: 457 I/SomeTag ]")
            .expect("I 头");
        assert_eq!(info.level, 'I');
    }

    #[test]
    fn negative_pid_other_than_minus_one_is_max() {
        let header =
            parse_long_header("[ 2026-01-02 03:04:05.678  -5: 601 I/Tag ]").expect("header");
        assert_eq!(header.pid, u32::MAX);
        assert_eq!(header.tid, 601);
    }

    #[test]
    fn system_and_buffer_headers() {
        assert!(is_system_line("--------- beginning of main"));
        assert!(is_system_line("--------- beginning of system"));
        assert!(!is_system_line("hello"));
    }
}
