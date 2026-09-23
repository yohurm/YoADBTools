//! adb host stderr：拒绝 `shell -T` / 未知选项（与 [`super::offline`] 分表）。

const OPTION_REJECT_NEEDLES: &[&str] = &["unknown option", "unrecognized option", "invalid option"];

pub fn stderr_rejects_shell_option(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    OPTION_REJECT_NEEDLES.iter().any(|k| lower.contains(k))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_option_reject_needles() {
        assert!(stderr_rejects_shell_option("unknown option -T"));
        assert!(stderr_rejects_shell_option("adb: unrecognized option `-T'"));
        assert!(stderr_rejects_shell_option("invalid option -- T"));
        assert!(!stderr_rejects_shell_option("error: device offline"));
        assert!(!stderr_rejects_shell_option("error: device not found"));
        assert!(!stderr_rejects_shell_option("__YOHU_SHELL_READY__"));
        assert!(!stderr_rejects_shell_option(
            "export PS1=\nprintf '%s\\n' '__YOHU_SHELL_READY__'"
        ));
    }
}
