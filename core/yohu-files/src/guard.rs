//! 路径守卫：词典 SafetyRoot + 设备端 realpath 复核。
//!
//! 运输错误（取消/掉线/超时）一律失败，禁止 fail-open。
//! 目标不存在时解析最近已存在祖先，再对拼接后的规范路径做安全根校验。

use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use yohu_adb::{AdbClient, ReadlinkF};
use yohu_domain::{validate_entry_name, PathError, RemotePath, SafetyError, SafetyRoot};

/// 浏览允许安全根本身；突变/传输/拖出必须是真子路径。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RecheckKind {
    Inclusive,
    Descendant,
}

pub(crate) fn outside_root(err: SafetyError) -> FileError {
    match err {
        SafetyError::OutsideRoot(path) => FileError::OutsideRoot(path),
        SafetyError::Path(
            PathError::NotAbsolute(path)
            | PathError::Traversal(path)
            | PathError::InvalidName(path),
        ) => FileError::Path(path),
    }
}

/// 浏览：等于或位于安全根之下。
pub(crate) fn normalize_browse(safety: &SafetyRoot, path: &str) -> Result<RemotePath, FileError> {
    safety.check(path).map_err(outside_root)
}

/// 突变/传输：真子路径 + 末段名合法。
pub(crate) fn normalize_mut(safety: &SafetyRoot, path: &str) -> Result<RemotePath, FileError> {
    let normalized = safety.check_descendant(path).map_err(outside_root)?;
    validate_entry_name(normalized.file_name()).map_err(|_| FileError::Path(path.to_string()))?;
    Ok(normalized)
}

/// 对规范路径做安全根复核。
pub(crate) fn recheck_resolved(
    safety: &SafetyRoot,
    resolved: &str,
    kind: RecheckKind,
) -> Result<RemotePath, FileError> {
    match kind {
        RecheckKind::Inclusive => safety.check(resolved),
        RecheckKind::Descendant => safety.check_descendant(resolved),
    }
    .map_err(outside_root)
}

pub(crate) fn parent_remote(path: &str) -> Option<&str> {
    let trimmed = path.trim_end_matches('/');
    let idx = trimmed.rfind('/')?;
    if idx == 0 {
        Some("/")
    } else {
        Some(&trimmed[..idx])
    }
}

pub(crate) fn last_segment(path: &str) -> &str {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or("")
}

/// 已解析祖先 + 尚未存在的后缀 → 规范候选路径。
pub(crate) fn join_canonical(resolved: &str, remainder: &[String]) -> Result<String, FileError> {
    for name in remainder {
        validate_entry_name(name).map_err(|_| FileError::Path(name.clone()))?;
    }
    if remainder.is_empty() {
        return Ok(if resolved.is_empty() {
            "/".into()
        } else {
            resolved.to_string()
        });
    }
    let base = if resolved == "/" {
        String::new()
    } else {
        resolved.trim_end_matches('/').to_string()
    };
    Ok(format!("{base}/{}", remainder.join("/")))
}

/// 设备端 realpath 复核。运输错误 / 无法解析失败；不存在则走最近已存在祖先。
pub(crate) async fn resolve_and_recheck(
    adb: &AdbClient,
    safety: &SafetyRoot,
    serial: &str,
    path: &RemotePath,
    kind: RecheckKind,
    cancel: CancellationToken,
) -> Result<RemotePath, FileError> {
    let mut current = path.as_str().to_string();
    let mut remainder: Vec<String> = Vec::new();
    loop {
        if cancel.is_cancelled() {
            return Err(FileError::Adb(yohu_adb::AdbError::Cancelled));
        }
        match adb
            .readlink_f(serial, &current, cancel.clone())
            .await
            .map_err(|e| file_error_from_adb(&current, e))?
        {
            ReadlinkF::Canonical(resolved) => {
                let candidate = join_canonical(&resolved, &remainder)?;
                return recheck_resolved(safety, &candidate, kind);
            }
            ReadlinkF::Missing => {
                let Some(parent) = parent_remote(&current) else {
                    return Err(FileError::RemoteFailed(path.as_str().to_string()));
                };
                let name = last_segment(&current);
                if name.is_empty() {
                    return Err(FileError::RemoteFailed(path.as_str().to_string()));
                }
                remainder.insert(0, name.to_string());
                current = parent.to_string();
            }
            ReadlinkF::Unparseable => {
                return Err(FileError::RemoteFailed(path.as_str().to_string()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recheck_resolved_accepts_legit_storage_and_rejects_escape() {
        let safety = SafetyRoot::default();

        assert!(
            recheck_resolved(&safety, "/storage/emulated/0/DCIM", RecheckKind::Descendant).is_ok()
        );
        assert!(recheck_resolved(
            &safety,
            "/storage/self/primary/DCIM/a.jpg",
            RecheckKind::Descendant
        )
        .is_ok());
        assert!(recheck_resolved(&safety, "/storage/emulated/0", RecheckKind::Descendant).is_ok());

        assert!(recheck_resolved(&safety, "/data/local/tmp/x", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/data/x", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/system/x", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/etc/x", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/sdcard", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/storage", RecheckKind::Descendant).is_err());
        assert!(recheck_resolved(&safety, "/sdcardevil", RecheckKind::Descendant).is_err());
    }

    #[test]
    fn recheck_inclusive_allows_safety_root() {
        let safety = SafetyRoot::default();
        assert!(recheck_resolved(&safety, "/sdcard", RecheckKind::Inclusive).is_ok());
        assert!(recheck_resolved(&safety, "/storage", RecheckKind::Inclusive).is_ok());
        assert!(recheck_resolved(&safety, "/storage/emulated/0", RecheckKind::Inclusive).is_ok());
        assert!(recheck_resolved(&safety, "/data", RecheckKind::Inclusive).is_err());
        assert!(recheck_resolved(&safety, "/", RecheckKind::Inclusive).is_err());
    }

    #[test]
    fn normalize_mut_requires_descendant_and_entry_name() {
        let safety = SafetyRoot::default();
        assert_eq!(
            normalize_mut(&safety, "/sdcard/DCIM/a.jpg")
                .unwrap()
                .as_str(),
            "/sdcard/DCIM/a.jpg"
        );
        assert!(matches!(
            normalize_mut(&safety, "/sdcard"),
            Err(FileError::OutsideRoot(_))
        ));
        assert!(matches!(
            normalize_mut(&safety, "/data/local/tmp/x"),
            Err(FileError::OutsideRoot(_))
        ));
        assert!(matches!(
            normalize_mut(&safety, "/sdcard/../etc"),
            Err(FileError::Path(_))
        ));
        assert!(matches!(
            normalize_mut(&safety, "/sdcard/."),
            Err(FileError::OutsideRoot(_))
        ));
    }

    #[test]
    fn normalize_browse_allows_root() {
        let safety = SafetyRoot::default();
        assert_eq!(
            normalize_browse(&safety, "/sdcard").unwrap().as_str(),
            "/sdcard"
        );
        assert!(matches!(
            normalize_browse(&safety, "/data"),
            Err(FileError::OutsideRoot(_))
        ));
    }

    #[test]
    fn parent_remote_stops_at_root() {
        assert_eq!(parent_remote("/sdcard/DCIM/a.jpg"), Some("/sdcard/DCIM"));
        assert_eq!(parent_remote("/sdcard"), Some("/"));
        assert_eq!(parent_remote("/"), None);
        assert_eq!(last_segment("/sdcard/DCIM/a.jpg"), "a.jpg");
        assert_eq!(last_segment("/sdcard"), "sdcard");
    }

    #[test]
    fn ancestor_reconstruct_rejects_escape() {
        let safety = SafetyRoot::default();
        let candidate = join_canonical("/data", &["newdir".into()]).unwrap();
        assert_eq!(candidate, "/data/newdir");
        assert!(recheck_resolved(&safety, &candidate, RecheckKind::Descendant).is_err());
    }

    #[test]
    fn ancestor_reconstruct_accepts_storage() {
        let safety = SafetyRoot::default();
        let candidate = join_canonical("/storage/emulated/0", &["newdir".into()]).unwrap();
        assert_eq!(candidate, "/storage/emulated/0/newdir");
        assert!(recheck_resolved(&safety, &candidate, RecheckKind::Descendant).is_ok());
    }

    #[test]
    fn join_canonical_from_root() {
        assert_eq!(
            join_canonical("/", &["sdcard".into(), "a".into()]).unwrap(),
            "/sdcard/a"
        );
        assert_eq!(
            join_canonical("/storage/emulated/0", &[]).unwrap(),
            "/storage/emulated/0"
        );
    }

    #[test]
    fn transport_errors_map_to_adb_not_ok() {
        assert!(matches!(
            file_error_from_adb("/sdcard/a", yohu_adb::AdbError::Cancelled),
            FileError::Adb(yohu_adb::AdbError::Cancelled)
        ));
        assert!(matches!(
            file_error_from_adb("/sdcard/a", yohu_adb::AdbError::DeviceOffline("off".into())),
            FileError::Adb(yohu_adb::AdbError::DeviceOffline(_))
        ));
    }
}
