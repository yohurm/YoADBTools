//! 日志过滤匹配（ADR-v6-006）：wire [`LogFilter`] 的领域语义。
//!
//! protocol 只持有结构；导出与 UI `matchesWireFilter` 共用本层 + testdata/log_filter.json。回补读环不过滤。
//! Tag：`tag_contains` 按逗号 / 分号 / `|` 拆多针，任一 OrdinalIgnoreCase **精确**命中；空或仅分隔符 = 不限。

use yohu_protocol::{LogFilter, LogLine, LogScope};

/// 级别字母表（V→F）。与 testdata/log_levels.json、UI `LEVELS` 同一份；禁止再写第三份。
pub const LOG_LEVEL_LETTERS: [char; 6] = ['V', 'D', 'I', 'W', 'E', 'F'];

/// 单字符级别 token（大小写不敏感）是否属于 [`LOG_LEVEL_LETTERS`]。
pub fn is_log_level_letter(token: &str) -> bool {
    let mut chars = token.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) => LOG_LEVEL_LETTERS.contains(&c.to_ascii_uppercase()),
        _ => false,
    }
}

/// ASCII 忽略大小写的子串匹配（ADR-v6-006：关键字 = OrdinalIgnoreCase 包含）。
/// 用字节级 `eq_ignore_ascii_case`，避免 Unicode `to_lowercase()` 对非 ASCII 的语义偏差。
fn contains_ascii_ignore_case(haystack: &str, needle: &str) -> bool {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() {
        return true;
    }
    if n.len() > h.len() {
        return false;
    }
    h.windows(n.len())
        .any(|w| w.iter().zip(n).all(|(a, b)| a.eq_ignore_ascii_case(b)))
}

fn level_in_set(levels: &[char], line: char) -> bool {
    if levels.is_empty() {
        return true;
    }
    let needle = line.to_ascii_uppercase();
    levels
        .iter()
        .any(|item| item.to_ascii_uppercase() == needle)
}

fn is_tag_needle_sep(c: char) -> bool {
    matches!(c, ',' | '，' | '、' | ';' | '；' | '|')
}

/// 拆 `tag_contains`；空段丢掉。空结果 = 不限 Tag。空白留在针内。
fn tag_needles(spec: &str) -> impl Iterator<Item = &str> {
    spec.split(is_tag_needle_sep)
        .map(str::trim)
        .filter(|part| !part.is_empty())
}

fn equals_ascii_ignore_case(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.as_bytes()
            .iter()
            .zip(b.as_bytes())
            .all(|(x, y)| x.eq_ignore_ascii_case(y))
}

fn tag_allowed(line_tag: &str, spec: &str) -> bool {
    let mut needles = tag_needles(spec).peekable();
    if needles.peek().is_none() {
        return true;
    }
    needles.any(|needle| equals_ascii_ignore_case(line_tag, needle))
}

/// 单行匹配。`Package { pids: [] }` 不命中任何行。
/// 级别：`levels` 空则不限；非空则精确属于该集合（不是最低含以上）。
/// Tag：多针 OR；关键字仍是整段包含。
pub fn log_filter_matches(filter: &LogFilter, line: &LogLine) -> bool {
    if !level_in_set(&filter.levels, line.level) {
        return false;
    }
    if let Some(tag) = &filter.tag_contains {
        if !tag_allowed(&line.tag, tag) {
            return false;
        }
    }
    if let Some(msg) = &filter.message_contains {
        if !contains_ascii_ignore_case(&line.msg, msg) {
            return false;
        }
    }
    match &filter.scope {
        LogScope::All => true,
        LogScope::Pid { pid } => line.pid == *pid,
        LogScope::Package { pids } => pids.contains(&line.pid),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogLine;

    #[test]
    fn matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            line: LogLine,
            filter: LogFilter,
            expect: bool,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/log_filter.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(
                log_filter_matches(&case.filter, &case.line),
                case.expect,
                "case {i}"
            );
        }
    }

    #[test]
    fn known_levels_shared_fixture() {
        let letters: Vec<char> =
            serde_json::from_str(include_str!("../testdata/log_levels.json")).expect("fixture");
        assert_eq!(letters.as_slice(), LOG_LEVEL_LETTERS.as_slice());
        for letter in &letters {
            assert!(is_log_level_letter(&letter.to_string()));
            assert!(is_log_level_letter(
                &letter.to_ascii_lowercase().to_string()
            ));
        }
        assert!(!is_log_level_letter(""));
        assert!(!is_log_level_letter("VV"));
        assert!(!is_log_level_letter("?"));
    }
}
