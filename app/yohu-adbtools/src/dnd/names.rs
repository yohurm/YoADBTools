//! Windows 文件名过滤：非法字符、尾空格/点、保留设备名不进 FILEDESCRIPTOR。
#![cfg_attr(not(windows), allow(dead_code))]

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Explorer / FILEDESCRIPTOR 相对路径的分段符。单段名里它非法。
pub const RELATIVE_SEP: char = '\\';

/// `FILEDESCRIPTORW.cFileName` 的 UTF-16 槽数（MAX_PATH）。内容必须更短，留出结尾 0。
pub const FILE_NAME_UNITS: usize = 260;

/// 单段名是否可写入 Windows 文件系统。
pub fn windows_file_name_ok(name: &str) -> bool {
    if name.is_empty() || name.encode_utf16().count() > 255 {
        return false;
    }
    if name == "." || name == ".." {
        return false;
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return false;
    }
    if name.chars().any(|c| {
        matches!(
            c,
            '<' | '>' | ':' | '"' | '/' | RELATIVE_SEP | '|' | '?' | '*'
        ) || c.is_ascii_control()
    }) {
        return false;
    }
    let stem = name.split('.').next().unwrap_or(name);
    !RESERVED.iter().any(|r| stem.eq_ignore_ascii_case(r))
}

/// Explorer 相对路径整条合法，且 UTF-16 可放进 `cFileName`（[`FILE_NAME_UNITS`] 减 1）。
pub fn windows_relative_ok(relative: &str) -> bool {
    if relative.is_empty() {
        return false;
    }
    let utf16 = relative.encode_utf16().count();
    utf16 < FILE_NAME_UNITS && relative.split(RELATIVE_SEP).all(windows_file_name_ok)
}

#[cfg(not(windows))]
fn unix_file_name_ok(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('\0') && !name.contains('/')
}

/// POSIX 相对路径（files 树展开）→ Explorer FILEDESCRIPTOR 分段。
pub fn posix_to_win_relative(relative: &str) -> String {
    relative
        .chars()
        .map(|c| if c == '/' { RELATIVE_SEP } else { c })
        .collect()
}

/// 拖出相对路径落到本机：分段符换成当前 OS 的分隔符。
pub fn host_relative(relative: &str) -> String {
    relative.replace(RELATIVE_SEP, std::path::MAIN_SEPARATOR_STR)
}

/// 拖出相对路径（`\` 分段）在当前 OS 可落盘。
pub fn relative_ok(relative: &str) -> bool {
    #[cfg(windows)]
    {
        windows_relative_ok(relative)
    }
    #[cfg(not(windows))]
    {
        !relative.is_empty() && relative.split(RELATIVE_SEP).all(unix_file_name_ok)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_illegal_chars_trailing_and_reserved() {
        assert!(windows_file_name_ok("photo.png"));
        assert!(!windows_file_name_ok("a<b.txt"));
        assert!(!windows_file_name_ok("a:b"));
        assert!(!windows_file_name_ok("ends "));
        assert!(!windows_file_name_ok("ends."));
        assert!(!windows_file_name_ok("CON"));
        assert!(!windows_file_name_ok("con.txt"));
        assert!(!windows_file_name_ok("NUL.log"));
        assert!(!windows_file_name_ok(".."));
    }

    #[test]
    fn relative_rejects_long_or_bad_segment() {
        assert!(windows_relative_ok("DCIM\\a.jpg"));
        assert!(!windows_relative_ok("DCIM\\con.txt"));
        assert!(!windows_relative_ok(&"a".repeat(FILE_NAME_UNITS)));
        assert!(windows_relative_ok(&"测".repeat(80)));
    }

    #[test]
    fn posix_to_win_relative_joins_backslash() {
        assert_eq!(posix_to_win_relative("DCIM"), "DCIM");
        assert_eq!(posix_to_win_relative("DCIM/a.jpg"), "DCIM\\a.jpg");
        assert_eq!(
            posix_to_win_relative("DCIM/Camera/x.png"),
            "DCIM\\Camera\\x.png"
        );
    }

    #[test]
    fn host_join_and_name_slots_are_decided_once() {
        let ole = include_str!("ole.rs");
        let root = include_str!("mod.rs");
        assert!(!ole.contains("replace("));
        assert!(!root.contains("replace("));
        assert!(!root.contains("split('\\\\'"));
        assert!(!ole.contains("260"));
        assert_eq!(FILE_NAME_UNITS, 260);
        let fit = format!("{}\\{}", "a".repeat(200), "b".repeat(58));
        let over = format!("{}\\{}", "a".repeat(200), "b".repeat(59));
        assert_eq!(fit.encode_utf16().count(), FILE_NAME_UNITS - 1);
        assert_eq!(over.encode_utf16().count(), FILE_NAME_UNITS);
        assert!(windows_relative_ok(&fit));
        assert!(!windows_relative_ok(&over));
        assert_eq!(
            host_relative("DCIM\\Camera\\x.png"),
            format!(
                "DCIM{sep}Camera{sep}x.png",
                sep = std::path::MAIN_SEPARATOR
            )
        );
    }

    #[test]
    fn relative_ok_matches_host() {
        assert!(relative_ok("DCIM\\a.jpg"));
        assert!(!relative_ok(""));
        assert!(!relative_ok("a\\.."));
        #[cfg(windows)]
        assert!(!relative_ok("DCIM\\con.txt"));
        #[cfg(not(windows))]
        assert!(relative_ok("DCIM\\con.txt"));
    }

    #[test]
    fn dnd_live_lock_sentence_once() {
        let owner = "self.items.lock().expect(\"dnd live\")";
        let needle = "dnd live";
        let root = include_str!("mod.rs");
        let ole = include_str!("ole.rs");
        let scanned = format!("{root}{ole}").replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }

    #[test]
    fn dnd_inner_lock_sentence_once() {
        let owner = "self.inner.lock().expect(\"dnd lock\")";
        let needle = "dnd lock";
        let ole = include_str!("ole.rs");
        let scanned = ole.replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }

    #[test]
    fn geom_lock_sentence_once() {
        let owner = "self.inner.lock().expect(\"geom lock poisoned\")";
        let needle = "geom lock poisoned";
        let src = include_str!("../mirror_present/windows/follow.rs");
        let scanned = src.replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }

    #[test]
    fn picture_bank_lock_sentence_once() {
        let src = include_str!("../mirror_present/windows/slot.rs");
        let owner = "self.slot.lock().expect(\"picture bank lock poisoned\")";
        let needle = "picture bank lock poisoned";
        let scanned = src.replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }

    #[test]
    fn tasks_lock_sentence_once() {
        let owner = "self.inner.lock().expect(\"tasks lock poisoned\")";
        let needle = "tasks lock poisoned";
        let src = include_str!("../tasks.rs");
        let scanned = src.replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }
}
