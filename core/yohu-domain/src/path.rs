//! 设备 POSIX 路径代数：规范化、拼接、上级。不含安全根。

/// 路径错误。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("路径必须是绝对路径: {0}")]
    NotAbsolute(String),
    #[error("路径含 .. 穿越: {0}")]
    Traversal(String),
    #[error("条目名非法: {0}")]
    InvalidName(String),
}

/// 规范化后的设备绝对路径（拒绝 `..` 与相对路径）。
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RemotePath {
    normalized: String,
}

impl RemotePath {
    /// 解析并规范化：反斜杠转斜杠、折叠 `.` 与空段、拒绝 `..`、必须绝对路径。
    pub fn parse(raw: &str) -> Result<Self, PathError> {
        let replaced = raw.replace('\\', "/");
        if !replaced.starts_with('/') {
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

    /// 本路径是否等于 `root` 或位于其子路径。
    pub fn is_under(&self, root: &RemotePath) -> bool {
        self.normalized == root.normalized
            || self
                .normalized
                .starts_with(&format!("{}/", root.normalized))
    }

    /// 位于 `root` 之下（不含 root 本身）。`/sdcard/a` 是，`/sdcard` 不是。
    pub fn is_strictly_under(&self, root: &RemotePath) -> bool {
        self.normalized
            .starts_with(&format!("{}/", root.normalized))
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
        format!("{}/{name}", dir.trim_end_matches('/'))
    }
}

/// 去掉尾斜杠后的上级。`/` 无上级。
pub fn parent_of(path: &str) -> Option<String> {
    let trimmed = path.trim_end_matches('/');
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
    fn is_under_semantics() {
        let root = RemotePath::parse("/sdcard").unwrap();
        assert!(RemotePath::parse("/sdcard").unwrap().is_under(&root));
        assert!(RemotePath::parse("/sdcard/DCIM/x.jpg")
            .unwrap()
            .is_under(&root));
        assert!(!RemotePath::parse("/sdcardevil").unwrap().is_under(&root));
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
}
