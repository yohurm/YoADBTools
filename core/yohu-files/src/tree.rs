//! 拖出描述符树展开。相对路径用 POSIX `/`；OLE `\` 由壳 dnd 转换。

use std::collections::HashSet;

use tokio_util::sync::CancellationToken;

use crate::browse::FileBrowser;
use crate::fault::FileError;
use crate::guard::{last_segment, normalize_mut, parent_remote, resolve_and_recheck, RecheckKind};
use yohu_domain::RemotePath;
use yohu_protocol::{DragOutItem, EntryKind};

/// 单次拖出展开上限，避免巨大目录卡死 DoDragDrop 前的列举。
pub const MAX_TREE_ENTRIES: usize = 4096;
const MAX_TREE_DEPTH: u32 = 24;

/// 拖出描述符一条：远端绝对路径 + POSIX 相对路径。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub remote: String,
    pub relative: String,
    pub is_dir: bool,
    pub size: u64,
}

impl FileBrowser {
    /// 拖出根条目：只做同步 SafetyRoot，不碰设备。OLE 必须在松手前启动。
    /// 目录子树仍走 [`Self::list_tree`]，在 DoDragDrop 之后后台展开。
    pub fn drag_roots(&self, items: &[DragOutItem]) -> Result<Vec<TreeEntry>, FileError> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for item in items {
            let path = normalize_mut(&self.safety, &item.remote)?;
            if !seen.insert(path.as_str().to_string()) {
                continue;
            }
            let name = last_segment(path.as_str());
            if name.is_empty() {
                return Err(FileError::Path(path.as_str().into()));
            }
            out.push(TreeEntry {
                remote: path.as_str().to_string(),
                relative: name.to_string(),
                is_dir: item.is_dir,
                size: if item.is_dir { 0 } else { item.size },
            });
        }
        if out.is_empty() {
            return Err(FileError::EmptyTree(
                items
                    .first()
                    .map(|item| item.remote.clone())
                    .unwrap_or_default(),
            ));
        }
        Ok(out)
    }

    /// 把一组远端路径展开成 FILEDESCRIPTOR 树（目录递归；文件一条）。
    /// 每条必须是安全根真子路径，并做祖先 realpath 复核。
    /// `generation` 由调用方自带（拖出会话与 `BrowseAttach` 同一时钟）；不从槽位窥世代。
    pub async fn list_tree(
        &self,
        serial: &str,
        remotes: &[String],
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<Vec<TreeEntry>, FileError> {
        self.ensure_generation(serial, generation)?;
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for raw in remotes {
            let path = normalize_mut(&self.safety, raw)?;
            if !seen.insert(path.as_str().to_string()) {
                continue;
            }
            let resolved = resolve_and_recheck(
                &self.adb,
                &self.safety,
                serial,
                &path,
                RecheckKind::Descendant,
                cancel.clone(),
            )
            .await?;
            let (is_dir, size) = self
                .classify(serial, &resolved, generation, cancel.clone())
                .await?;
            self.push_tree(
                serial,
                path,
                String::new(),
                is_dir,
                size,
                0,
                generation,
                &mut out,
                &mut seen,
                cancel.clone(),
            )
            .await?;
        }
        if out.is_empty() {
            return Err(FileError::EmptyTree(
                remotes.first().cloned().unwrap_or_default(),
            ));
        }
        Ok(out)
    }

    async fn classify(
        &self,
        serial: &str,
        path: &RemotePath,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<(bool, u64), FileError> {
        let parent =
            parent_remote(path.as_str()).ok_or_else(|| FileError::Path(path.as_str().into()))?;
        let name = last_segment(path.as_str());
        let entries = self.list(serial, parent, generation, cancel).await?;
        let entry = entries
            .iter()
            .find(|e| e.name == name)
            .ok_or_else(|| FileError::RemoteNotFound(path.as_str().to_string()))?;
        match dir_flag(entry.kind) {
            Some(true) => Ok((true, 0)),
            Some(false) | None => Ok((false, entry.size)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn push_tree<'a>(
        &'a self,
        serial: &'a str,
        remote: RemotePath,
        parent_rel: String,
        is_dir: bool,
        size: u64,
        depth: u32,
        generation: u64,
        out: &'a mut Vec<TreeEntry>,
        seen: &'a mut HashSet<String>,
        cancel: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), FileError>> + Send + 'a>>
    {
        Box::pin(async move {
            tree_bounds(is_dir, depth, out.len())?;
            let name = remote.file_name();
            if name.is_empty() {
                return Err(FileError::Path(remote.as_str().into()));
            }
            let relative = join_posix_relative(&parent_rel, name);
            out.push(TreeEntry {
                remote: remote.as_str().to_string(),
                relative: relative.clone(),
                is_dir,
                size,
            });
            if !is_dir {
                return Ok(());
            }
            let children = self
                .list(serial, remote.as_str(), generation, cancel.clone())
                .await?;
            for child in children {
                if cancel.is_cancelled() {
                    return Err(FileError::Adb(yohu_adb::AdbError::Cancelled));
                }
                let child_raw = format!("{}/{}", remote.as_str(), child.name);
                let child_path = normalize_mut(&self.safety, &child_raw)?;
                if !seen.insert(child_path.as_str().to_string()) {
                    continue;
                }
                let child_resolved = resolve_and_recheck(
                    &self.adb,
                    &self.safety,
                    serial,
                    &child_path,
                    RecheckKind::Descendant,
                    cancel.clone(),
                )
                .await?;
                let (child_dir, child_size) = match dir_flag(child.kind) {
                    Some(true) => (true, 0),
                    Some(false) => (false, child.size),
                    None => {
                        self.classify(serial, &child_resolved, generation, cancel.clone())
                            .await?
                    }
                };
                self.push_tree(
                    serial,
                    child_path,
                    relative.clone(),
                    child_dir,
                    child_size,
                    depth + 1,
                    generation,
                    out,
                    seen,
                    cancel.clone(),
                )
                .await?;
            }
            Ok(())
        })
    }
}

/// Dir/File 直接判定；Symlink 不预设为目录。
fn dir_flag(kind: EntryKind) -> Option<bool> {
    match kind {
        EntryKind::Dir => Some(true),
        EntryKind::File | EntryKind::Other => Some(false),
        EntryKind::Symlink => None,
    }
}

/// 条数与深度同一套触顶契约：先计数，再层数。目录触顶失败；文件可落在最深一层。
fn tree_bounds(is_dir: bool, depth: u32, count: usize) -> Result<(), FileError> {
    if count >= MAX_TREE_ENTRIES {
        return Err(FileError::TreeLimit(MAX_TREE_ENTRIES));
    }
    if is_dir && depth >= MAX_TREE_DEPTH {
        return Err(FileError::TreeDepth(MAX_TREE_DEPTH));
    }
    Ok(())
}

fn join_posix_relative(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_posix_relative_builds_slash_tree() {
        assert_eq!(join_posix_relative("", "DCIM"), "DCIM");
        assert_eq!(join_posix_relative("DCIM", "a.jpg"), "DCIM/a.jpg");
        assert_eq!(
            join_posix_relative("DCIM/Camera", "x.png"),
            "DCIM/Camera/x.png"
        );
    }

    #[test]
    fn dir_flag_does_not_treat_symlink_as_directory() {
        assert_eq!(dir_flag(EntryKind::Dir), Some(true));
        assert_eq!(dir_flag(EntryKind::File), Some(false));
        assert_eq!(dir_flag(EntryKind::Other), Some(false));
        assert_eq!(dir_flag(EntryKind::Symlink), None);
    }

    /// 0..=23 层目录 + 第 24 层文件仍成功；第 24 层再出现目录则 TreeDepth。
    fn walk_bounds(nodes: &[(bool, u32)]) -> Result<usize, FileError> {
        let mut count = 0;
        for &(is_dir, depth) in nodes {
            tree_bounds(is_dir, depth, count)?;
            count += 1;
        }
        Ok(count)
    }

    #[test]
    fn directory_at_max_depth_fails_closed() {
        let mut nodes: Vec<(bool, u32)> = (0..MAX_TREE_DEPTH).map(|d| (true, d)).collect();
        nodes.push((true, MAX_TREE_DEPTH));
        let err = walk_bounds(&nodes).unwrap_err();
        assert!(matches!(err, FileError::TreeDepth(n) if n == MAX_TREE_DEPTH));
        assert_eq!(err.to_string(), format!("拖出目录超过 {MAX_TREE_DEPTH} 层"));
        assert!(!matches!(err, FileError::TreeLimit(_)));
        assert!(!err.to_string().contains('/'));
    }

    #[test]
    fn tree_under_depth_limit_succeeds() {
        let mut nodes: Vec<(bool, u32)> = (0..MAX_TREE_DEPTH).map(|d| (true, d)).collect();
        nodes.push((false, MAX_TREE_DEPTH));
        assert_eq!(
            walk_bounds(&nodes).expect("不满深度的树应成功"),
            MAX_TREE_DEPTH as usize + 1
        );
        assert!(tree_bounds(true, 0, 0).is_ok());
        assert!(tree_bounds(true, MAX_TREE_DEPTH - 1, 0).is_ok());
        assert!(tree_bounds(false, MAX_TREE_DEPTH, 0).is_ok());
    }
}
