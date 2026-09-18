//! 用户输入 → 设备绝对 POSIX 路径（只做句法，不管安全根）。
//! 不折叠 `.` / `..` / `//`；穿越只由 [`crate::path`] / [`crate::safety`] 判定。
//! UI `path-parse.ts` 镜像本层 + [`testdata/path_input.json`]。

use serde::{Deserialize, Serialize};

const PATH_ALIASES: &[(&str, &str)] = &[
    ("/mnt/shell/emulated/0", "/storage/emulated/0"),
    ("/storage/emulated/legacy", "/storage/emulated/0"),
    ("/storage/self/primary", "/sdcard"),
    ("/mnt/sdcard", "/sdcard"),
];

const BARE_ALIASES: &[(&str, &str)] = &[("~", "/sdcard"), ("sdcard", "/sdcard")];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PathStrategy {
    Unquote,
    FileUri,
    Separators,
    HostReject,
    Alias,
    Relative,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathParseOk {
    pub path: String,
    pub applied: Vec<PathStrategy>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathParseErr {
    pub reason: &'static str,
    pub applied: Vec<PathStrategy>,
}

pub type PathParseResult = Result<PathParseOk, PathParseErr>;

/// 句法解析。`current` 只在相对路径时拼接。
pub fn parse_remote_path(raw: &str, current: &str) -> PathParseResult {
    let mut applied = Vec::new();
    let mut text = raw.trim().to_string();
    if text.is_empty() {
        return Err(PathParseErr {
            reason: "路径为空",
            applied,
        });
    }
    if text.contains('\0') {
        return Err(PathParseErr {
            reason: "路径含非法字符",
            applied,
        });
    }

    let unquoted = unquote(&text);
    if unquoted != text {
        applied.push(PathStrategy::Unquote);
        text = unquoted;
        if text.is_empty() {
            return Err(PathParseErr {
                reason: "路径为空",
                applied,
            });
        }
    }

    let without_uri = strip_file_uri(&text);
    if without_uri != text {
        applied.push(PathStrategy::FileUri);
        text = without_uri;
    }

    let posix = text.replace('\\', "/");
    if posix != text {
        applied.push(PathStrategy::Separators);
        text = posix;
    }

    if is_host_path(&text) {
        applied.push(PathStrategy::HostReject);
        return Err(PathParseErr {
            reason: "不是设备路径",
            applied,
        });
    }

    let aliased = expand_aliases(&text);
    if aliased != text {
        applied.push(PathStrategy::Alias);
        text = aliased;
    }

    if !text.starts_with('/') {
        applied.push(PathStrategy::Relative);
        text = join_abs(current, &text);
    }

    Ok(PathParseOk { path: text, applied })
}

fn unquote(text: &str) -> String {
    let bytes = text.as_bytes();
    if bytes.len() >= 2 {
        let a = bytes[0];
        let b = bytes[bytes.len() - 1];
        if (a == b'"' && b == b'"') || (a == b'\'' && b == b'\'') {
            return text[1..text.len() - 1].trim().to_string();
        }
    }
    text.to_string()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn strip_file_uri(text: &str) -> String {
    if text.len() < 5 || !text[..5].eq_ignore_ascii_case("file:") {
        return text.to_string();
    }
    let rest = text[5..].trim_start_matches('/');
    if rest.is_empty() {
        return text.to_string();
    }
    let rest = rest
        .strip_prefix("localhost/")
        .or_else(|| (rest == "localhost").then_some(""))
        .unwrap_or(rest);
    if rest.len() >= 2 && rest.as_bytes()[1] == b':' {
        return percent_decode(rest);
    }
    format!("/{}", percent_decode(rest))
}

fn is_host_path(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return true;
    }
    text.starts_with("//")
}

fn expand_one(text: &str, from: &str, to: &str) -> Option<String> {
    if text == from {
        return Some(to.to_string());
    }
    let prefix = format!("{from}/");
    text.strip_prefix(&prefix)
        .map(|tail| format!("{to}/{tail}"))
}

fn expand_aliases(text: &str) -> String {
    for (from, to) in BARE_ALIASES {
        if let Some(next) = expand_one(text, from, to) {
            return next;
        }
    }
    for (from, to) in PATH_ALIASES {
        if let Some(next) = expand_one(text, from, to) {
            return next;
        }
    }
    text.to_string()
}

fn join_abs(base: &str, rel: &str) -> String {
    let root = if base.starts_with('/') {
        base.to_string()
    } else {
        format!("/{base}")
    };
    let root = root.trim_end_matches('/');
    format!("{root}/{rel}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Case {
        raw: String,
        current: String,
        ok: bool,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        reason: Option<String>,
        #[serde(default)]
        applied: Vec<PathStrategy>,
    }

    #[test]
    fn parse_shared_fixture() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/path_input.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            match parse_remote_path(&case.raw, &case.current) {
                Ok(ok) => {
                    assert!(case.ok, "case {i} expected err");
                    if let Some(path) = &case.path {
                        assert_eq!(&ok.path, path, "path {i}");
                    }
                    for step in &case.applied {
                        assert!(ok.applied.contains(step), "applied {i} {step:?}");
                    }
                }
                Err(err) => {
                    assert!(!case.ok, "case {i} expected ok");
                    if let Some(reason) = &case.reason {
                        assert_eq!(err.reason, reason, "reason {i}");
                    }
                }
            }
        }
    }
}
