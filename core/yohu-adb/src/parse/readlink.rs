//! `adb shell readlink -f` 输出解析。

/// `readlink -f` 的结构化结果。运输错误（超时/取消/掉线）不在此枚举。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadlinkF {
    /// 退出码 0 且 stdout 为规范绝对路径。
    Canonical(String),
    /// 目标不存在（stderr 可识别）。
    Missing,
    /// 空输出、非绝对路径、命令不可用或未能识别的失败。
    Unparseable,
}

/// 从 `readlink -f` 的退出码与输出判定结果。不 fail-open。
pub fn interpret_readlink_f(exit_code: i32, stdout: &str, stderr: &str) -> ReadlinkF {
    if exit_code == 0 {
        return match parse_canonical(stdout) {
            Some(path) => ReadlinkF::Canonical(path),
            None => ReadlinkF::Unparseable,
        };
    }
    if stderr_missing(stderr) {
        ReadlinkF::Missing
    } else {
        ReadlinkF::Unparseable
    }
}

fn parse_canonical(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && l.starts_with('/'))
        .map(str::to_string)
}

fn stderr_missing(stderr: &str) -> bool {
    let text = stderr.to_ascii_lowercase();
    text.contains("no such file") || text.contains("does not exist")
}

#[cfg(test)]
mod tests {
    use super::{interpret_readlink_f, ReadlinkF};

    #[test]
    fn readlink_f_parses_canonical_absolute_path() {
        assert_eq!(
            interpret_readlink_f(0, "/storage/emulated/0/DCIM\n", ""),
            ReadlinkF::Canonical("/storage/emulated/0/DCIM".into())
        );
        assert_eq!(
            interpret_readlink_f(0, "/storage/self/primary/DCIM\n", ""),
            ReadlinkF::Canonical("/storage/self/primary/DCIM".into())
        );
    }

    #[test]
    fn readlink_f_empty_or_relative_stdout_is_unparseable() {
        assert_eq!(interpret_readlink_f(0, "", ""), ReadlinkF::Unparseable);
        assert_eq!(interpret_readlink_f(0, "\n\n", ""), ReadlinkF::Unparseable);
        assert_eq!(
            interpret_readlink_f(0, "relative/path\n", ""),
            ReadlinkF::Unparseable
        );
    }

    #[test]
    fn readlink_f_skips_leading_blank_lines() {
        assert_eq!(
            interpret_readlink_f(0, "\n/data/local/tmp/foo\n", ""),
            ReadlinkF::Canonical("/data/local/tmp/foo".into())
        );
    }

    #[test]
    fn readlink_f_nonzero_no_such_file_is_missing() {
        assert_eq!(
            interpret_readlink_f(1, "", "readlink: No such file or directory"),
            ReadlinkF::Missing
        );
        assert_eq!(
            interpret_readlink_f(1, "", "readlink: path does not exist"),
            ReadlinkF::Missing
        );
    }

    #[test]
    fn readlink_f_unknown_failure_is_unparseable() {
        assert_eq!(
            interpret_readlink_f(127, "", "toybox: unknown"),
            ReadlinkF::Unparseable
        );
        assert_eq!(
            interpret_readlink_f(1, "", "readlink: Permission denied"),
            ReadlinkF::Unparseable
        );
        assert_eq!(interpret_readlink_f(1, "", ""), ReadlinkF::Unparseable);
    }
}
