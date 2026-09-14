//! 日志过滤匹配（ADR-v6-006）：wire [`LogFilter`] 的领域语义。
//!
//! protocol 只持有结构；导出与 UI `matchesWireFilter` 共用本层 + testdata/log_filter.json。回补读环不过滤。
//! Tag：`tag_contains` 按逗号 / 分号 / `|` 拆多针，任一 OrdinalIgnoreCase **精确**命中；空或仅分隔符 = 不限。

use yohu_protocol::{LogFilter, LogLine, LogScope};

/// 级别序：V < D < I < W < E < F；未知为 0（低于任意已知级别）。
pub fn level_rank(level: char) -> u8 {
    match level {
        'V' | 'v' => 1,
        'D' | 'd' => 2,
        'I' | 'i' => 3,
        'W' | 'w' => 4,
        'E' | 'e' => 5,
        'F' | 'f' => 6,
        _ => 0,
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
    levels.iter().any(|item| item.to_ascii_uppercase() == needle)
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
    fn level_rank_order() {
        assert!(level_rank('V') < level_rank('D'));
        assert!(level_rank('D') < level_rank('I'));
        assert!(level_rank('I') < level_rank('W'));
        assert!(level_rank('W') < level_rank('E'));
        assert!(level_rank('E') < level_rank('F'));
        assert_eq!(level_rank('?'), 0);
    }

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
    fn level_rank_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            level: char,
            rank: u8,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/level_rank.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(level_rank(case.level), case.rank, "case {i}");
        }
    }

    #[test]
    fn known_levels_shared_fixture() {
        let letters: Vec<char> =
            serde_json::from_str(include_str!("../testdata/log_levels.json")).expect("fixture");
        assert_eq!(letters, vec!['V', 'D', 'I', 'W', 'E', 'F']);
        for (i, letter) in letters.iter().enumerate() {
            assert_eq!(level_rank(*letter), (i + 1) as u8, "letter {letter}");
        }
    }
}
