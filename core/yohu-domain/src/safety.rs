//! 设备路径安全（ADR-v6-013）：安全根校验。
//!
//! 删除/新建目录等危险操作由 **core 侧强制校验**，不信任 UI 传来的路径。
//! POSIX 代数在 [`crate::path`]。

use crate::path::{parent_of, PathError, RemotePath};

/// 安全根违反。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SafetyError {
    #[error(transparent)]
    Path(#[from] PathError),
    #[error("路径不在安全根内: {0}")]
    OutsideRoot(String),
}

fn listed_under_root(path: &str, root: &str) -> bool {
    path == root || path.starts_with(&format!("{root}/"))
}

/// 上级停在安全根上，不逃到 `/`。
pub fn parent_within_safety(path: &str, roots: &[&str]) -> Option<String> {
    let parent = parent_of(path)?;
    if parent == "/" {
        return None;
    }
    roots
        .iter()
        .any(|root| listed_under_root(&parent, root))
        .then_some(parent)
}

/// 校验单段条目名（禁止空、`.`/`..`、分隔符）。用于 UI 与 core 双侧。
pub fn validate_entry_name(name: &str) -> Result<(), PathError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(PathError::InvalidName("名称为空".into()));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(PathError::InvalidName(trimmed.into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(PathError::InvalidName("含路径分隔符".into()));
    }
    Ok(())
}

/// 安全根集合（默认 `/sdcard`、`/storage`）。
#[derive(Debug, Clone)]
pub struct SafetyRoot {
    roots: Vec<RemotePath>,
}

impl Default for SafetyRoot {
    fn default() -> Self {
        Self::new(yohu_protocol::safety_root::ALL).expect("内置安全根恒有效")
    }
}

impl SafetyRoot {
    pub fn new(roots: &[&str]) -> Result<Self, PathError> {
        let parsed = roots
            .iter()
            .map(|r| RemotePath::parse(r))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { roots: parsed })
    }

    /// 浏览范围：等于或位于安全根之下。
    pub fn check(&self, raw: &str) -> Result<RemotePath, SafetyError> {
        let path = RemotePath::parse(raw)?;
        if self.roots.iter().any(|r| path.is_under(r)) {
            Ok(path)
        } else {
            Err(SafetyError::OutsideRoot(path.as_str().to_string()))
        }
    }

    /// 删除/新建/传输：必须是安全根的**真子路径**，禁止对 `/sdcard` 等根本身动手。
    pub fn check_descendant(&self, raw: &str) -> Result<RemotePath, SafetyError> {
        let path = RemotePath::parse(raw)?;
        if self.roots.iter().any(|r| path.is_strictly_under(r)) {
            Ok(path)
        } else {
            Err(SafetyError::OutsideRoot(path.as_str().to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{join_path, parent_of, path_segments};

    #[test]
    fn safety_root_check_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            path: String,
            #[serde(default)]
            ok: bool,
            #[serde(default)]
            normalized: Option<String>,
            #[serde(default)]
            error: Option<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/safety_root.json")).expect("fixture");
        let safety = SafetyRoot::default();
        for (i, case) in cases.iter().enumerate() {
            match safety.check(&case.path) {
                Ok(path) => {
                    assert!(case.ok, "case {i} expected error");
                    if let Some(expected) = &case.normalized {
                        assert_eq!(path.as_str(), expected, "case {i}");
                    }
                }
                Err(SafetyError::OutsideRoot(_)) => {
                    assert_eq!(case.error.as_deref(), Some("outside_root"), "case {i}");
                }
                Err(SafetyError::Path(PathError::NotAbsolute(_))) => {
                    assert_eq!(case.error.as_deref(), Some("not_absolute"), "case {i}");
                }
                Err(SafetyError::Path(PathError::Traversal(_))) => {
                    assert_eq!(case.error.as_deref(), Some("traversal"), "case {i}");
                }
                Err(SafetyError::Path(PathError::InvalidName(_))) => {
                    assert_eq!(case.error.as_deref(), Some("invalid_name"), "case {i}");
                }
            }
        }
    }

    #[test]
    fn mutate_forbids_safety_root_itself() {
        let safety = SafetyRoot::default();
        assert!(safety.check_descendant("/sdcard/DCIM/a.jpg").is_ok());
        assert!(matches!(
            safety.check_descendant("/sdcard"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/sdcard/"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/storage"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/data/local/tmp/x"),
            Err(SafetyError::OutsideRoot(_))
        ));
    }

    #[test]
    fn validate_entry_name_rejects_separators() {
        assert!(validate_entry_name("ok.txt").is_ok());
        assert!(validate_entry_name("").is_err());
        assert!(validate_entry_name("..").is_err());
        assert!(validate_entry_name("a/b").is_err());
        assert!(validate_entry_name("a\\b").is_err());
    }

    #[test]
    fn path_algebra_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            op: String,
            #[serde(default)]
            dir: String,
            #[serde(default)]
            name: String,
            #[serde(default)]
            path: String,
            #[serde(default)]
            parent: Option<String>,
            #[serde(default)]
            segments: Vec<String>,
            #[serde(default)]
            ok: Option<bool>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/path_algebra.json")).expect("fixture");
        let safety = SafetyRoot::default();
        let roots: Vec<&str> = yohu_protocol::safety_root::ALL.to_vec();
        for (i, case) in cases.iter().enumerate() {
            match case.op.as_str() {
                "join" => assert_eq!(join_path(&case.dir, &case.name), case.path, "join {i}"),
                "parent" => assert_eq!(parent_of(&case.path), case.parent, "parent {i}"),
                "segments" => {
                    let got: Vec<&str> = path_segments(&case.path);
                    let expect: Vec<&str> = case.segments.iter().map(String::as_str).collect();
                    assert_eq!(got, expect, "segments {i}")
                }
                "parent_within" => {
                    assert_eq!(
                        parent_within_safety(&case.path, &roots),
                        case.parent,
                        "within {i}"
                    )
                }
                "descendant" => {
                    assert_eq!(
                        safety.check_descendant(&case.path).is_ok(),
                        case.ok.unwrap_or(false),
                        "desc {i}"
                    )
                }
                other => panic!("unknown op {other} at {i}"),
            }
        }
    }

    #[test]
    fn validate_entry_name_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            valid: bool,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/entry_name.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(
                validate_entry_name(&case.name).is_ok(),
                case.valid,
                "case {i}"
            );
        }
    }
}
