//! 单次 shell 内 `readlink -f` 祖先复核 + `ls -lla` 输出切分。
//!
//! 祖先 walk 与 [`yohu_files::guard::resolve_and_recheck`] 同语义；拼接仍在 Rust
//! [`join_canonical`]，设备只回传 resolved 基与 remainder 段。

use yohu_protocol::RemoteEntry;

use super::ls;

pub const MARK_RESOLVED: &str = "__YOHU_BROWSE_RES__";
pub const MARK_REM: &str = "__YOHU_BROWSE_REM__";
pub const MARK_LS: &str = "__YOHU_BROWSE_LS__";
pub const MARK_FAIL: &str = "__YOHU_BROWSE_FAIL__";
pub const MARK_SHELL_READY: &str = "__YOHU_SHELL_READY__";

pub fn begin_line(nonce: u64) -> String {
    format!("__YOHU_BEGIN_{nonce}__")
}

pub fn end_prefix(nonce: u64) -> String {
    format!("__YOHU_END_{nonce}__")
}

pub fn handshake_script() -> String {
    format!(
        "export PS1=\nexport PS2=\nprintf '%s\\n' '{ready}'\n",
        ready = MARK_SHELL_READY
    )
}

/// 包进子 shell：内层 `exit` 不得打死长驻会话。BEGIN/END 用 printf 打出，避免回显命令行被当成帧。
pub fn wrap_session_script(nonce: u64, inner: &str) -> String {
    let begin = begin_line(nonce);
    let end = end_prefix(nonce);
    format!("printf '%s\\n' '{begin}'\n(\n{inner}\n)\nprintf '%s\\n' \"{end} $?\"\n")
}

pub fn parse_end_line(line: &str, nonce: u64) -> Option<i32> {
    let mut parts = line.split_whitespace();
    if parts.next()? != end_prefix(nonce) {
        return None;
    }
    parts.next()?.parse().ok()
}

/// 从可能夹杂回显的 stdout 切出一趟 body + 退出码。
pub fn parse_session_frame(stdout: &str, nonce: u64) -> Result<(String, i32), BrowseParseError> {
    let begin = begin_line(nonce);
    let mut seen_begin = false;
    let mut body = String::new();
    for line in stdout.lines() {
        let line = line.trim_end_matches('\r');
        if !seen_begin {
            if line == begin {
                seen_begin = true;
            }
            continue;
        }
        if let Some(code) = parse_end_line(line, nonce) {
            return Ok((body, code));
        }
        body.push_str(line);
        body.push('\n');
    }
    Err(BrowseParseError::Malformed)
}

/// 设备脚本 stdout 解析结果（尚未做 SafetyRoot 复核）。
#[derive(Debug, Clone, PartialEq)]
pub struct BrowseListRaw {
    /// `readlink -f` 成功时的规范前缀（不含 remainder 段）。
    pub resolved: String,
    /// 自底向上收集的未解析路径段，`/` 分隔，可为空。
    pub remainder: String,
    pub entries: Vec<RemoteEntry>,
}

/// 构造 `sh -c` 脚本：`path` 必须是 [`crate::shell_quote`] 后的单引号串。
pub fn build_list_script(quoted_path: &str) -> String {
    format!(
        r#"path={path}
current="$path"
remainder=""
while :; do
  if resolved=$(readlink -f "$current" 2>/dev/null); then
    case "$resolved" in
      /*)
        echo '{mark_res}'
        printf '%s\n' "$resolved"
        echo '{mark_rem}'
        printf '%s\n' "$remainder"
        echo '{mark_ls}'
        ls -lla "${{path%/}}/"
        exit 0
        ;;
    esac
  fi
  if [ "$current" = "/" ]; then
    echo '{mark_fail}'
    exit 1
  fi
  parent=$(dirname "$current")
  name=$(basename "$current")
  if [ -z "$name" ] || [ "$parent" = "$current" ]; then
    echo '{mark_fail}'
    exit 1
  fi
  if [ -n "$remainder" ]; then
    remainder="$name/$remainder"
  else
    remainder="$name"
  fi
  current="$parent"
done"#,
        path = quoted_path,
        mark_res = MARK_RESOLVED,
        mark_rem = MARK_REM,
        mark_ls = MARK_LS,
        mark_fail = MARK_FAIL,
    )
}

/// 从合并 stdout 切分；`ls` 区交给 [`ls::parse_ls`]。
pub fn parse_list_output(
    stdout: &str,
    exit_code: i32,
    stderr: &str,
) -> Result<BrowseListRaw, BrowseParseError> {
    if stdout.contains(MARK_FAIL) || (exit_code != 0 && !stdout.contains(MARK_LS)) {
        return Err(BrowseParseError::ResolveFailed);
    }
    let res_idx = stdout
        .find(MARK_RESOLVED)
        .ok_or(BrowseParseError::Malformed)?;
    let rem_idx = stdout.find(MARK_REM).ok_or(BrowseParseError::Malformed)?;
    let ls_idx = stdout.find(MARK_LS).ok_or(BrowseParseError::Malformed)?;
    if !(res_idx < rem_idx && rem_idx < ls_idx) {
        return Err(BrowseParseError::Malformed);
    }
    let resolved = section_body(stdout, res_idx + MARK_RESOLVED.len(), rem_idx);
    let remainder = section_body(stdout, rem_idx + MARK_REM.len(), ls_idx);
    let ls_body = stdout[ls_idx + MARK_LS.len()..].trim_start_matches('\n');
    if resolved.is_empty() || !resolved.starts_with('/') {
        return Err(BrowseParseError::Malformed);
    }
    if exit_code != 0 {
        return Err(BrowseParseError::LsFailed {
            exit_code,
            stderr: stderr.to_string(),
        });
    }
    Ok(BrowseListRaw {
        resolved,
        remainder,
        entries: ls::parse_ls(ls_body),
    })
}

fn section_body(text: &str, start: usize, end: usize) -> String {
    text[start..end].trim().trim_end_matches('\n').to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrowseParseError {
    ResolveFailed,
    Malformed,
    LsFailed { exit_code: i32, stderr: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::EntryKind;

    #[test]
    fn build_script_quotes_path_placeholder() {
        let script = build_list_script("'/sdcard/DCIM'");
        assert!(script.contains("path='/sdcard/DCIM'"));
        assert!(script.contains(MARK_LS));
    }

    #[test]
    fn parse_happy_path() {
        let stdout = format!(
            "{MARK_RESOLVED}\n/storage/emulated/0\n{MARK_REM}\n\n{MARK_LS}\ndrwxr-xr-x 2 root root 4096 2026-01-01 12:00:53.000000000 +0800 Alarms\n"
        );
        let raw = parse_list_output(&stdout, 0, "").unwrap();
        assert_eq!(raw.resolved, "/storage/emulated/0");
        assert_eq!(raw.remainder, "");
        assert_eq!(raw.entries.len(), 1);
        assert_eq!(raw.entries[0].name, "Alarms");
        assert_eq!(raw.entries[0].kind, EntryKind::Dir);
    }

    #[test]
    fn parse_with_remainder() {
        let stdout =
            format!("{MARK_RESOLVED}\n/storage/emulated/0\n{MARK_REM}\nnewdir\n{MARK_LS}\n");
        let raw = parse_list_output(&stdout, 0, "").unwrap();
        assert_eq!(raw.remainder, "newdir");
    }

    #[test]
    fn parse_fail_marker() {
        assert_eq!(
            parse_list_output(&format!("{MARK_FAIL}\n"), 1, ""),
            Err(BrowseParseError::ResolveFailed)
        );
    }

    #[test]
    fn parse_ls_nonzero() {
        let stdout = format!("{MARK_RESOLVED}\n/sdcard\n{MARK_REM}\n\n{MARK_LS}\n");
        assert!(matches!(
            parse_list_output(&stdout, 1, "No such file"),
            Err(BrowseParseError::LsFailed { .. })
        ));
    }

    #[test]
    fn session_wrap_keeps_inner_in_subshell() {
        let wrapped = wrap_session_script(3, "exit 1");
        assert!(wrapped.contains("(\nexit 1\n)"));
        assert!(wrapped.contains(&begin_line(3)));
        assert!(wrapped.contains(&end_prefix(3)));
    }

    #[test]
    fn session_frame_skips_echo_and_keeps_body() {
        let nonce = 7;
        let begin = begin_line(nonce);
        let end = format!("{} 0", end_prefix(nonce));
        let stdout = format!(
            "printf '%s\\n' '{begin}'\n{begin}\n{MARK_RESOLVED}\n/sdcard\n{MARK_REM}\n\n{MARK_LS}\nok\n{end}\n"
        );
        let (body, code) = parse_session_frame(&stdout, nonce).unwrap();
        assert_eq!(code, 0);
        assert!(body.contains(MARK_RESOLVED));
        assert!(body.contains("ok"));
        assert!(!body.contains("printf"));
    }

    #[test]
    fn session_frame_missing_begin_is_malformed() {
        assert_eq!(
            parse_session_frame("__YOHU_END_1__ 0\n", 1),
            Err(BrowseParseError::Malformed)
        );
    }
}
