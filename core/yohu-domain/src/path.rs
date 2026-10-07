//! 设备 POSIX 路径代数：规范化、拼接、上级。不含安全根。

/// 路径错误。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("{}", not_absolute_text(.0))]
    NotAbsolute(String),
    #[error("{}", traversal_text(.0))]
    Traversal(String),
    #[error("{}", invalid_name_text(.0))]
    InvalidName(String),
}

/// 「路径必须是绝对路径」。界面预检与文件层同一事实引用这一句。
pub fn not_absolute_text(path: &str) -> String {
    format!("路径必须是绝对路径: {path}")
}

/// 「路径含 .. 穿越」。界面预检与文件层同一事实引用这一句。
pub fn traversal_text(path: &str) -> String {
    format!("路径含 .. 穿越: {path}")
}

/// 「条目名非法」。界面预检与文件层同一事实引用这一句。
pub fn invalid_name_text(detail: &str) -> String {
    format!("条目名非法: {detail}")
}

/// 反斜杠换成斜杠。句法解析和规范化都问这一次。
pub(crate) fn posix_slashes(path: &str) -> String {
    path.replace('\\', "/")
}

/// 以 `/` 开头才是设备绝对路径。
pub(crate) fn is_absolute(path: &str) -> bool {
    path.starts_with('/')
}

fn without_trailing_slash(path: &str) -> &str {
    path.trim_end_matches('/')
}

/// 规范化后的设备绝对路径（拒绝 `..` 与相对路径）。
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RemotePath {
    normalized: String,
}

impl RemotePath {
    /// 解析并规范化：反斜杠转斜杠、折叠 `.` 与空段、拒绝 `..`、必须绝对路径。
    pub fn parse(raw: &str) -> Result<Self, PathError> {
        let replaced = posix_slashes(raw);
        if !is_absolute(&replaced) {
            return Err(PathError::NotAbsolute(raw.to_string()));
        }
        let mut parts: Vec<&str> = Vec::new();
        for seg in replaced.split('/') {
            match seg {
                "" | "." => continue,
                ".." => return Err(PathError::Traversal(raw.to_string())),
                s => parts.push(s),
            }
        }
        Ok(Self {
            normalized: format!("/{}", parts.join("/")),
        })
    }

    pub fn as_str(&self) -> &str {
        &self.normalized
    }

    /// 位于 `root` 之下（不含 root 本身）。`/sdcard/a` 是，`/sdcard` 不是。前缀只写在这里。
    pub fn is_strictly_under(&self, root: &RemotePath) -> bool {
        self.normalized
            .starts_with(&format!("{}/", root.normalized))
    }

    /// 本路径是否等于 `root` 或位于其子路径。
    pub fn is_under(&self, root: &RemotePath) -> bool {
        self.normalized == root.normalized || self.is_strictly_under(root)
    }

    /// 规范化路径的最后一段。`/` 为空串。
    pub fn file_name(&self) -> &str {
        self.normalized.rsplit('/').next().unwrap_or("")
    }
}

/// 展示拼接，不折叠 `.` / `..`。
pub fn join_path(dir: &str, name: &str) -> String {
    if dir == "/" {
        format!("/{name}")
    } else {
        format!("{}/{name}", without_trailing_slash(dir))
    }
}

/// 去掉尾斜杠后的上级。`/` 无上级。
pub fn parent_of(path: &str) -> Option<String> {
    let trimmed = without_trailing_slash(path);
    if trimmed.is_empty() || trimmed == "/" {
        return None;
    }
    match trimmed.rfind('/') {
        None | Some(0) => Some("/".to_string()),
        Some(idx) => Some(trimmed[..idx].to_string()),
    }
}

/// 非空路径段。
pub fn path_segments(path: &str) -> Vec<&str> {
    path.split('/').filter(|part| !part.is_empty()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_normalizes() {
        let p = RemotePath::parse("/sdcard//a/./b/").unwrap();
        assert_eq!(p.as_str(), "/sdcard/a/b");
        let p = RemotePath::parse(r"\sdcard\a\b").unwrap();
        assert_eq!(p.as_str(), "/sdcard/a/b");
    }

    #[test]
    fn parse_rejects_traversal_and_relative() {
        assert!(matches!(
            RemotePath::parse("sdcard/a"),
            Err(PathError::NotAbsolute(_))
        ));
        assert!(matches!(
            RemotePath::parse("/sdcard/../etc"),
            Err(PathError::Traversal(_))
        ));
        assert!(matches!(
            RemotePath::parse("/a/../../b"),
            Err(PathError::Traversal(_))
        ));
    }

    #[test]
    fn invalid_name_text_is_the_display() {
        let err = PathError::InvalidName("x".into());
        assert_eq!(err.to_string(), invalid_name_text("x"));
    }

    #[test]
    fn path_algebra_text_is_the_display() {
        assert_eq!(
            PathError::NotAbsolute("sdcard/a".into()).to_string(),
            not_absolute_text("sdcard/a")
        );
        assert_eq!(
            PathError::Traversal("/sdcard/../etc".into()).to_string(),
            traversal_text("/sdcard/../etc")
        );
    }

    #[test]
    fn is_under_semantics() {
        let root = RemotePath::parse("/sdcard").unwrap();
        assert!(RemotePath::parse("/sdcard").unwrap().is_under(&root));
        assert!(RemotePath::parse("/sdcard/DCIM/x.jpg")
            .unwrap()
            .is_under(&root));
        assert!(!RemotePath::parse("/sdcardevil").unwrap().is_under(&root));
        let child = RemotePath::parse("/sdcard/a").unwrap();
        assert!(child.is_strictly_under(&root));
        assert!(!root.is_strictly_under(&root));
        let safety = include_str!("safety.rs");
        assert!(!safety.contains("listed_under_root"));
        assert!(!safety.contains("{root}/"));
    }

    #[test]
    fn parent_of_stops_at_root() {
        assert_eq!(
            parent_of("/sdcard/DCIM/a.jpg").as_deref(),
            Some("/sdcard/DCIM")
        );
        assert_eq!(parent_of("/sdcard").as_deref(), Some("/"));
        assert_eq!(parent_of("/"), None);
        assert_eq!(parent_of(""), None);
    }

    #[test]
    fn file_name_last_segment() {
        assert_eq!(
            RemotePath::parse("/sdcard/a.txt").unwrap().file_name(),
            "a.txt"
        );
        assert_eq!(RemotePath::parse("/sdcard").unwrap().file_name(), "sdcard");
        assert_eq!(RemotePath::parse("/").unwrap().file_name(), "");
    }

    fn production(src: &str) -> &str {
        src.split("\n#[cfg(test)]").next().unwrap_or(src)
    }

    #[test]
    fn empty_path_reason_once() {
        let input = production(include_str!("path_input.rs"));
        assert_eq!(input.matches("reason: \"路径为空\"").count(), 1);
    }
}
