//! 路径守卫：词典 SafetyRoot + 设备端 realpath 复核。
//!
//! 运输错误（取消/掉线/超时）一律失败，禁止 fail-open。
//! 目标不存在时解析最近已存在祖先，再对拼接后的规范路径做安全根校验。

use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, reject_if_cancelled, FileError};
use yohu_adb::{AdbClient, ReadlinkF};
use yohu_domain::{
    join_path, parent_of, validate_entry_name, PathError, RemotePath, SafetyError, SafetyRoot,
};

/// 浏览允许安全根本身；突变/传输/拖出必须是真子路径。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RecheckKind {
    Inclusive,
    Descendant,
}

fn from_path_error(err: PathError) -> FileError {
    match err {
        PathError::NotAbsolute(path) => FileError::NotAbsolute(path),
        PathError::Traversal(path) => FileError::Traversal(path),
        PathError::InvalidName(detail) => FileError::InvalidName(detail),
    }
}

pub(crate) fn outside_root(err: SafetyError) -> FileError {
    match err {
        SafetyError::OutsideRoot(path) => FileError::OutsideRoot(path),
        SafetyError::Path(err) => from_path_error(err),
    }
}

/// 浏览：等于或位于安全根之下。
pub(crate) fn normalize_browse(safety: &SafetyRoot, path: &str) -> Result<RemotePath, FileError> {
    safety.check(path).map_err(outside_root)
}

/// 突变/传输：真子路径 + 末段名合法。
pub(crate) fn normalize_mut(safety: &SafetyRoot, path: &str) -> Result<RemotePath, FileError> {
    let normalized = safety.check_descendant(path).map_err(outside_root)?;
    validate_entry_name(normalized.file_name()).map_err(from_path_error)?;
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

fn unresolved_ancestor(path: &str) -> FileError {
    FileError::RemoteNotFound(path.to_string())
}

fn unparsed_readlink(path: &str) -> FileError {
    FileError::ReadlinkUnparseable(path.to_string())
}

/// 空的已解析祖先就是根。
fn canonical_base(resolved: &str) -> String {
    if resolved.is_empty() {
        "/".into()
    } else {
        resolved.to_string()
    }
}

/// 已解析祖先 + 尚未存在的后缀 → 规范候选路径。
pub(crate) fn join_canonical(resolved: &str, remainder: &[String]) -> Result<String, FileError> {
    for name in remainder {
        validate_entry_name(name).map_err(from_path_error)?;
    }
    if remainder.is_empty() {
        return Ok(canonical_base(resolved));
    }
    let mut acc = canonical_base(resolved);
    for name in remainder {
        acc = join_path(&acc, name);
    }
    Ok(acc)
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
        reject_if_cancelled(&cancel)?;
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
                let Some(parent) = parent_of(&current) else {
                    return Err(unresolved_ancestor(path.as_str()));
                };
                let parsed = RemotePath::parse(&current).map_err(from_path_error)?;
                let name = parsed.file_name();
                if name.is_empty() {
                    return Err(unresolved_ancestor(path.as_str()));
                }
                remainder.insert(0, name.to_string());
                current = parent;
            }
            ReadlinkF::Unparseable => {
                return Err(unparsed_readlink(path.as_str()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fault::{readlink_unparseable_text, remote_not_found_text};

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
            Err(FileError::Traversal(_))
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
    fn readlink_walk_end_is_not_remote_failed() {
        let missing = unresolved_ancestor("/sdcard/nope");
        assert!(matches!(missing, FileError::RemoteNotFound(ref p) if p == "/sdcard/nope"));
        assert_eq!(missing.to_string(), remote_not_found_text("/sdcard/nope"));
        assert!(!missing.to_string().contains("远端操作失败"));

        let bad = unparsed_readlink("/sdcard/nope");
        assert!(matches!(bad, FileError::ReadlinkUnparseable(ref p) if p == "/sdcard/nope"));
        assert_eq!(bad.to_string(), readlink_unparseable_text("/sdcard/nope"));
        assert!(!bad.to_string().contains("远端操作失败"));
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
        assert_eq!(join_canonical("", &[]).unwrap(), "/");
        assert_eq!(join_canonical("", &["sdcard".into()]).unwrap(), "/sdcard");
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
