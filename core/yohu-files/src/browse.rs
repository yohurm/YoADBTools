//! 设备文件浏览（ls 解析）。树展开见 [`crate::tree`]。
//!
//! 列表走浏览会话（Empty / Starting / Live）内的 `DeviceShell.exec` 或 oneshot `browse_list`。
//! 世代与采集槽位同构（ADR-v6-016/033）：attach Ok 只表示该世代在槽位提交时已发布 Live；
//! 之后 list / list_tree / release 携带世代。过期 release 不得清掉更新一代。
//! UI 快照只加速绘制，禁止在本层因「进过父目录」而跳过 `readlink`（目录可被换成符号链接）。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use crate::guard::{join_canonical, normalize_browse, recheck_resolved, RecheckKind};
use yohu_adb::{AdbClient, AdbError, DeviceShell, DeviceShellError};
use yohu_domain::SafetyRoot;
use yohu_protocol::{BrowseAttach, RemoteEntry};

const EXEC_ATTEMPTS: u32 = 2;

struct BrowseSlot {
    inner: std::sync::Mutex<SlotInner>,
}

enum SlotInner {
    Closed,
    Starting {
        generation: u64,
        cancel: CancellationToken,
    },
    Live {
        generation: u64,
        worker: Option<Box<DeviceShell>>,
        oneshot: bool,
    },
}

enum AttachPeek {
    Adopt(BrowseAttach),
    Wait,
    Vacant,
}

enum BeginAttach {
    Adopt(BrowseAttach),
    Wait,
}

/// 文件浏览器：每 serial 至多一路浏览会话（对标 FileListingService）。
#[derive(Clone)]
pub struct FileBrowser {
    pub(crate) adb: Arc<AdbClient>,
    pub(crate) safety: SafetyRoot,
    sessions: Arc<std::sync::Mutex<HashMap<String, Arc<BrowseSlot>>>>,
    next_generation: Arc<AtomicU64>,
    changed: Arc<Notify>,
}

impl FileBrowser {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
            sessions: Arc::new(std::sync::Mutex::new(HashMap::new())),
            next_generation: Arc::new(AtomicU64::new(0)),
            changed: Arc::new(Notify::new()),
        }
    }

    fn slot(&self, serial: &str) -> Option<Arc<BrowseSlot>> {
        self.sessions
            .lock()
            .expect("browse sessions lock poisoned")
            .get(serial)
            .cloned()
    }

    fn peek_attach(&self, serial: &str) -> AttachPeek {
        let map = self.sessions.lock().expect("browse sessions lock poisoned");
        let Some(slot) = map.get(serial) else {
            return AttachPeek::Vacant;
        };
        let inner = slot.inner.lock().expect("browse slot lock poisoned");
        match *inner {
            SlotInner::Live { generation, .. } => AttachPeek::Adopt(BrowseAttach {
                serial: serial.to_string(),
                generation,
                adopted: true,
            }),
            SlotInner::Starting { .. } => AttachPeek::Wait,
            SlotInner::Closed => AttachPeek::Vacant,
        }
    }

    fn still_starting(&self, serial: &str) -> bool {
        let Some(slot) = self.slot(serial) else {
            return false;
        };
        let starting = matches!(
            *slot.inner.lock().expect("browse slot lock poisoned"),
            SlotInner::Starting { .. }
        );
        starting
    }

    fn still_live(&self, slot: &BrowseSlot, generation: u64) -> bool {
        matches!(
            *slot.inner.lock().expect("browse slot lock poisoned"),
            SlotInner::Live { generation: g, .. } if g == generation
        )
    }

    fn begin_attach(&self, serial: &str) -> Result<(u64, CancellationToken), BeginAttach> {
        let mut map = self.sessions.lock().expect("browse sessions lock poisoned");
        if let Some(slot) = map.get(serial).cloned() {
            let inner = slot.inner.lock().expect("browse slot lock poisoned");
            match *inner {
                SlotInner::Live { generation, .. } => {
                    return Err(BeginAttach::Adopt(BrowseAttach {
                        serial: serial.to_string(),
                        generation,
                        adopted: true,
                    }));
                }
                SlotInner::Starting { .. } => return Err(BeginAttach::Wait),
                SlotInner::Closed => {}
            }
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed) + 1;
        let cancel = CancellationToken::new();
        let slot = Arc::new(BrowseSlot {
            inner: std::sync::Mutex::new(SlotInner::Starting {
                generation,
                cancel: cancel.clone(),
            }),
        });
        map.insert(serial.to_string(), slot);
        self.changed.notify_waiters();
        Ok((generation, cancel))
    }

    fn slot_generation(&self, serial: &str) -> Option<u64> {
        let slot = self.slot(serial)?;
        let inner = slot.inner.lock().expect("browse slot lock poisoned");
        match *inner {
            SlotInner::Starting { generation, .. } | SlotInner::Live { generation, .. } => {
                Some(generation)
            }
            SlotInner::Closed => None,
        }
    }

    /// 调用方自带世代；只比较当前槽位。不由此函数发号，也不回填世代。
    pub(crate) fn ensure_generation(&self, serial: &str, generation: u64) -> Result<(), FileError> {
        match self.slot_generation(serial) {
            None => Err(FileError::NotAttached),
            Some(g) if g == generation => Ok(()),
            Some(_) => Err(FileError::Adb(AdbError::Cancelled)),
        }
    }

    fn publish_live(
        &self,
        serial: &str,
        generation: u64,
        worker: Option<Box<DeviceShell>>,
        oneshot: bool,
    ) -> Option<BrowseAttach> {
        let map = self.sessions.lock().expect("browse sessions lock poisoned");
        let slot = map.get(serial)?;
        let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
        match *inner {
            SlotInner::Starting { generation: g, .. } if g == generation => {
                *inner = SlotInner::Live {
                    generation,
                    worker,
                    oneshot,
                };
                Some(BrowseAttach {
                    serial: serial.to_string(),
                    generation,
                    adopted: false,
                })
            }
            _ => None,
        }
    }

    fn abandon_starting(&self, serial: &str, generation: u64) {
        let remove = {
            let Some(slot) = self.slot(serial) else {
                return;
            };
            let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
            match *inner {
                SlotInner::Starting { generation: g, .. } if g == generation => {
                    *inner = SlotInner::Closed;
                    true
                }
                _ => false,
            }
        };
        if remove {
            let mut map = self.sessions.lock().expect("browse sessions lock poisoned");
            if let Some(slot) = map.get(serial) {
                let closed = matches!(
                    *slot.inner.lock().expect("browse slot lock poisoned"),
                    SlotInner::Closed
                );
                if closed {
                    map.remove(serial);
                }
            }
        }
        self.changed.notify_waiters();
    }

    /// Empty→Starting→Live。已 Live 则 adopt。握手失败（无 `-T`）记 oneshot，仍算 attach。
    pub async fn attach(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<BrowseAttach, FileError> {
        let mut waiting = false;
        loop {
            match self.peek_attach(serial) {
                AttachPeek::Adopt(result) => return Ok(result),
                AttachPeek::Wait => {
                    waiting = true;
                    let notified = self.changed.notified();
                    if self.still_starting(serial) {
                        notified.await;
                    }
                    continue;
                }
                AttachPeek::Vacant if waiting => {
                    return Err(FileError::Adb(AdbError::Cancelled));
                }
                AttachPeek::Vacant => {}
            }

            let (generation, slot_cancel) = match self.begin_attach(serial) {
                Ok(begun) => begun,
                Err(BeginAttach::Adopt(adopted)) => return Ok(adopted),
                Err(BeginAttach::Wait) => continue,
            };

            let opened = tokio::select! {
                biased;
                _ = cancel.cancelled() => Err(DeviceShellError::Cancelled),
                result = self.adb.open_device_shell(serial, slot_cancel) => result,
            };

            let (worker, oneshot) = match opened {
                Ok(shell) => (Some(Box::new(shell)), false),
                Err(DeviceShellError::Unsupported) => (None, true),
                Err(DeviceShellError::Cancelled) => {
                    self.abandon_starting(serial, generation);
                    return Err(FileError::Adb(AdbError::Cancelled));
                }
                Err(e) => {
                    self.abandon_starting(serial, generation);
                    return Err(file_error_from_adb(serial, e.into()));
                }
            };

            let Some(result) = self.publish_live(serial, generation, worker, oneshot) else {
                self.changed.notify_waiters();
                return Err(FileError::Adb(AdbError::Cancelled));
            };
            self.changed.notify_waiters();
            return Ok(result);
        }
    }

    fn close_slot(slot: &BrowseSlot) {
        let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
        if let SlotInner::Starting { cancel, .. } = &*inner {
            cancel.cancel();
        }
        *inner = SlotInner::Closed;
    }

    /// UI / IPC: stale generation is a no-op (must not kill a newer Live).
    /// Returns whether this generation was the current slot (shell then cancels in-flight list).
    pub async fn release(&self, serial: &str, generation: u64) -> bool {
        let slot = {
            let mut map = self.sessions.lock().expect("browse sessions lock poisoned");
            let Some(slot) = map.get(serial).cloned() else {
                return false;
            };
            let matches = {
                let inner = slot.inner.lock().expect("browse slot lock poisoned");
                match *inner {
                    SlotInner::Starting { generation: g, .. }
                    | SlotInner::Live { generation: g, .. } => g == generation,
                    SlotInner::Closed => false,
                }
            };
            if !matches {
                return false;
            }
            map.remove(serial)
        };
        if let Some(slot) = slot {
            Self::close_slot(&slot);
            self.changed.notify_waiters();
            true
        } else {
            false
        }
    }

    /// 强制丢掉当前槽位（目录 went_offline，任意世代）。
    pub async fn detach(&self, serial: &str) {
        let slot = {
            let mut map = self.sessions.lock().expect("browse sessions lock poisoned");
            map.remove(serial)
        };
        if let Some(slot) = slot {
            Self::close_slot(&slot);
        }
        self.changed.notify_waiters();
    }

    /// 丢掉工人，槽位仍 Live。改 `adb.path` 后下一趟 list 用新工具再握手。
    pub async fn drop_workers(&self) {
        let slots: Vec<Arc<BrowseSlot>> = self
            .sessions
            .lock()
            .expect("browse sessions lock poisoned")
            .values()
            .cloned()
            .collect();
        for slot in slots {
            let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
            if let SlotInner::Live {
                worker, oneshot, ..
            } = &mut *inner
            {
                *worker = None;
                *oneshot = false;
            }
        }
    }

    /// 列出设备目录。必须已 attach 且 `generation` 仍为当前槽位；不自动 attach。
    ///
    /// 尾斜杠语义：`ls -lla /sdcard/` 会跟随符号链接列出目标目录内容
    /// （部分机型 `/sdcard -> /storage/self/primary`，不带尾斜杠只列出链接本身）。
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = normalize_browse(&self.safety, path)?;
        let raw = self
            .list_raw(serial, normalized.as_str(), generation, cancel)
            .await?;
        let remainder: Vec<String> = raw
            .remainder
            .split('/')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        let candidate = join_canonical(&raw.resolved, &remainder)?;
        recheck_resolved(&self.safety, candidate.as_str(), RecheckKind::Inclusive)?;
        if self.slot_generation(serial) != Some(generation) {
            return Err(FileError::Adb(AdbError::Cancelled));
        }
        Ok(raw.entries)
    }

    async fn list_raw(
        &self,
        serial: &str,
        path: &str,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<yohu_adb::BrowseListRaw, FileError> {
        loop {
            if cancel.is_cancelled() {
                return Err(FileError::Adb(AdbError::Cancelled));
            }
            let slot = self.slot(serial).ok_or(FileError::NotAttached)?;
            let oneshot = {
                let inner = slot.inner.lock().expect("browse slot lock poisoned");
                match *inner {
                    SlotInner::Closed => return Err(FileError::NotAttached),
                    SlotInner::Starting { generation: g, .. } if g == generation => None,
                    SlotInner::Live {
                        generation: g,
                        oneshot: true,
                        ..
                    } if g == generation => Some(true),
                    SlotInner::Live { generation: g, .. } if g == generation => Some(false),
                    SlotInner::Starting { .. } | SlotInner::Live { .. } => {
                        return Err(FileError::Adb(AdbError::Cancelled));
                    }
                }
            };
            match oneshot {
                None => {
                    let notified = self.changed.notified();
                    let waiting = matches!(
                        *slot.inner.lock().expect("browse slot lock poisoned"),
                        SlotInner::Starting { generation: g, .. } if g == generation
                    );
                    if waiting {
                        notified.await;
                    }
                }
                Some(true) => {
                    return self
                        .list_oneshot(serial, &slot, path, generation, cancel)
                        .await;
                }
                Some(false) => {
                    return self
                        .list_via_shell(serial, slot, path, generation, cancel)
                        .await;
                }
            }
        }
    }

    async fn list_oneshot(
        &self,
        serial: &str,
        slot: &BrowseSlot,
        path: &str,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<yohu_adb::BrowseListRaw, FileError> {
        let raw = self
            .adb
            .browse_list(serial, path, cancel)
            .await
            .map_err(|e| file_error_from_adb(path, e))?;
        if !self.still_live(slot, generation) {
            return Err(FileError::Adb(AdbError::Cancelled));
        }
        Ok(raw)
    }

    async fn list_via_shell(
        &self,
        serial: &str,
        slot: Arc<BrowseSlot>,
        path: &str,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<yohu_adb::BrowseListRaw, FileError> {
        let script = AdbClient::browse_list_script(path);
        let mut last_err: Option<AdbError> = None;
        for _ in 0..EXEC_ATTEMPTS {
            let shell = match self
                .take_or_open_worker(&slot, serial, generation, cancel.clone())
                .await
            {
                Ok(Some(shell)) => shell,
                Ok(None) => {
                    return self
                        .list_oneshot(serial, &slot, path, generation, cancel)
                        .await;
                }
                Err(e) => return Err(e),
            };
            match shell
                .exec(
                    &script,
                    Duration::from_millis(yohu_adb::BROWSE_LIST_TIMEOUT_MS),
                    cancel.clone(),
                )
                .await
            {
                Ok(out) => {
                    self.restore_worker(&slot, generation, shell);
                    if !self.still_live(&slot, generation) {
                        return Err(FileError::Adb(AdbError::Cancelled));
                    }
                    return AdbClient::parse_browse_list(&out.stdout, out.exit_code, &out.stderr)
                        .map_err(|e| file_error_from_adb(path, e));
                }
                Err(DeviceShellError::Cancelled) => {
                    return Err(FileError::Adb(AdbError::Cancelled));
                }
                Err(DeviceShellError::Timeout) => {
                    return Err(FileError::Adb(AdbError::Timeout));
                }
                Err(DeviceShellError::Unsupported) => {
                    self.mark_oneshot(&slot, generation);
                    return self
                        .list_oneshot(serial, &slot, path, generation, cancel)
                        .await;
                }
                Err(DeviceShellError::Failed(e)) => {
                    last_err = Some(e);
                }
            }
        }
        tracing::debug!(
            serial = %serial,
            first = %last_err.as_ref().map(|e| e.to_string()).unwrap_or_default(),
            "浏览 shell exec 失败，槽位仍 Live"
        );
        Err(file_error_from_adb(
            path,
            last_err.unwrap_or_else(|| AdbError::Io(std::io::Error::other("浏览 shell exec 失败"))),
        ))
    }

    async fn take_or_open_worker(
        &self,
        slot: &BrowseSlot,
        serial: &str,
        generation: u64,
        cancel: CancellationToken,
    ) -> Result<Option<DeviceShell>, FileError> {
        {
            let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
            match &mut *inner {
                SlotInner::Closed => {
                    return Err(FileError::NotAttached);
                }
                SlotInner::Starting { generation: g, .. } if *g == generation => {
                    return Err(FileError::NotAttached);
                }
                SlotInner::Starting { .. } => {
                    return Err(FileError::Adb(AdbError::Cancelled));
                }
                SlotInner::Live {
                    generation: g,
                    oneshot: true,
                    ..
                } if *g == generation => return Ok(None),
                SlotInner::Live {
                    generation: g,
                    worker,
                    ..
                } if *g == generation => {
                    if let Some(shell) = worker.take() {
                        return Ok(Some(*shell));
                    }
                }
                SlotInner::Live { .. } => {
                    return Err(FileError::Adb(AdbError::Cancelled));
                }
            }
        }
        match self.adb.open_device_shell(serial, cancel).await {
            Ok(shell) => Ok(Some(shell)),
            Err(DeviceShellError::Unsupported) => {
                self.mark_oneshot(slot, generation);
                Ok(None)
            }
            Err(DeviceShellError::Cancelled) => Err(FileError::Adb(AdbError::Cancelled)),
            Err(e) => Err(file_error_from_adb(serial, e.into())),
        }
    }

    fn restore_worker(&self, slot: &BrowseSlot, generation: u64, shell: DeviceShell) {
        let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
        if let SlotInner::Live {
            generation: g,
            worker,
            oneshot: false,
            ..
        } = &mut *inner
        {
            if *g == generation {
                *worker = Some(Box::new(shell));
            }
        }
    }

    fn mark_oneshot(&self, slot: &BrowseSlot, generation: u64) {
        let mut inner = slot.inner.lock().expect("browse slot lock poisoned");
        if let SlotInner::Live {
            generation: g,
            worker,
            oneshot,
            ..
        } = &mut *inner
        {
            if *g == generation {
                *worker = None;
                *oneshot = true;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dummy_client() -> Arc<AdbClient> {
        Arc::new(AdbClient::new(
            yohu_adb::ToolResolver::new(
                Some(PathBuf::from("nonexistent-adb")),
                PathBuf::from("nonexistent-resource"),
                PathBuf::from("nonexistent-data"),
            ),
            1,
        ))
    }

    #[tokio::test]
    async fn list_without_attach_fails() {
        let browser = FileBrowser::new(dummy_client());
        let err = browser
            .list("S1", "/sdcard", 1, CancellationToken::new())
            .await
            .unwrap_err();
        assert!(matches!(err, FileError::NotAttached));
    }
}
