//! push/pull 传输引擎：stderr∪stdout 解析 + 累计字节 + 终态必达 + 可取消。

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tokio::time::MissedTickBehavior;
use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use crate::guard::{normalize_mut, resolve_and_recheck, RecheckKind};
use yohu_adb::{AdbClient, AdbError};
use yohu_domain::SafetyRoot;
use yohu_protocol::{AppEvent, Direction, TransferFault, TransferProgress, TransferState};

const PROGRESS_THROTTLE: Duration = Duration::from_millis(200);

/// 一次传输的完整规格。
#[derive(Debug, Clone)]
pub struct TransferSpec {
    pub id: u32,
    pub serial: String,
    pub direction: Direction,
    pub local: String,
    pub remote: String,
    /// 单文件 pull 的清单 size；push 仍以本地 metadata 为准。
    pub expected_bytes: Option<u64>,
}

/// 传输引擎。
#[derive(Clone)]
pub struct TransferRunner {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl TransferRunner {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    /// 执行一次传输；进度经 `sink` 以 `TransferProgress` 事件推送。
    pub async fn run(
        &self,
        spec: TransferSpec,
        cancel: CancellationToken,
        sink: mpsc::Sender<AppEvent>,
    ) -> Result<u64, FileError> {
        let TransferSpec {
            id,
            serial,
            direction,
            local,
            remote,
            expected_bytes,
        } = spec;
        let local_path = PathBuf::from(&local);
        let mut name = transfer_name(&remote);
        let remote_norm = match normalize_mut(&self.safety, &remote) {
            Ok(path) => path,
            Err(err) => {
                return fail_before_stream(&sink, id, direction, &name, &local_path, err).await;
            }
        };
        if let Err(err) = resolve_and_recheck(
            &self.adb,
            &self.safety,
            &serial,
            &remote_norm,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await
        {
            return fail_before_stream(&sink, id, direction, &name, &local_path, err).await;
        }
        name = transfer_name(remote_norm.as_str());

        let (argv, expected) = match direction {
            Direction::Push => match push_local_total(&local_path) {
                Ok(local_total) => (
                    vec!["push".into(), local.clone(), remote_norm.as_str().into()],
                    (local_total > 0).then_some(local_total),
                ),
                Err(err) => {
                    return fail_before_stream(&sink, id, direction, &name, &local_path, err).await;
                }
            },
            Direction::Pull => (
                vec!["pull".into(), remote_norm.as_str().into(), local.clone()],
                expected_bytes.filter(|n| *n > 0),
            ),
        };

        let mut acc = ProgressAcc {
            completed: 0,
            inflight: 0,
            expected,
        };
        let mut progress = TransferProgress {
            id,
            direction,
            bytes: 0,
            total: expected,
            state: TransferState::Running,
            fault: None,
            name: Some(name),
        };
        emit(&sink, progress.clone(), true).await;

        let (line_tx, mut line_rx) = mpsc::channel::<String>(64);
        let stream = tokio::spawn({
            let adb = Arc::clone(&self.adb);
            let cancel = cancel.clone();
            let serial = serial.to_string();
            async move {
                adb.stream_progress_lines(&serial, &argv, cancel, line_tx)
                    .await
            }
        });

        let mut last_summary = String::new();
        let mut last_emit = Instant::now() - PROGRESS_THROTTLE;
        let mut ticker = tokio::time::interval(PROGRESS_THROTTLE);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                line = line_rx.recv() => {
                    let Some(line) = line else { break };
                    last_summary = line.clone();
                    if apply_progress_line(&mut acc, &line) {
                        paint_progress(&mut progress, &acc);
                        if last_emit.elapsed() >= PROGRESS_THROTTLE {
                            emit(&sink, progress.clone(), false).await;
                            last_emit = Instant::now();
                        }
                    }
                }
                _ = ticker.tick(), if direction == Direction::Pull && expected.is_some() => {
                    if let Some(bytes) = poll_local_bytes(&local_path, expected) {
                        if bytes > progress.bytes {
                            acc.inflight = bytes.saturating_sub(acc.completed);
                            paint_progress(&mut progress, &acc);
                            emit(&sink, progress.clone(), false).await;
                            last_emit = Instant::now();
                        }
                    }
                }
            }
        }

        let outcome = match stream.await {
            Ok(inner) => inner,
            Err(_) => {
                return finish_unsuccessful(
                    &sink,
                    progress,
                    direction,
                    &local_path,
                    TransferState::Failed,
                    FileError::ProgressJoin,
                )
                .await;
            }
        };

        paint_progress(&mut progress, &acc);
        match outcome {
            Ok(0) => {
                progress.state = TransferState::Done;
                progress.fault = None;
                apply_done_local_len(&mut progress, &local_path);
                let bytes = progress.bytes;
                emit_terminal(&sink, progress).await?;
                Ok(bytes)
            }
            Ok(code) => {
                let err = file_error_from_adb(
                    remote_norm.as_str(),
                    AdbError::BadExit {
                        exit_code: code,
                        stderr: last_summary,
                    },
                );
                finish_unsuccessful(
                    &sink,
                    progress,
                    direction,
                    &local_path,
                    TransferState::Failed,
                    err,
                )
                .await
            }
            Err(AdbError::Cancelled) => {
                finish_unsuccessful(
                    &sink,
                    progress,
                    direction,
                    &local_path,
                    TransferState::Cancelled,
                    FileError::Adb(AdbError::Cancelled),
                )
                .await
            }
            Err(e) => {
                let err = file_error_from_adb(remote_norm.as_str(), e);
                finish_unsuccessful(
                    &sink,
                    progress,
                    direction,
                    &local_path,
                    TransferState::Failed,
                    err,
                )
                .await
            }
        }
    }
}

struct ProgressAcc {
    completed: u64,
    inflight: u64,
    expected: Option<u64>,
}

fn paint_progress(progress: &mut TransferProgress, acc: &ProgressAcc) {
    let bytes = acc.completed.saturating_add(acc.inflight);
    progress.bytes = acc.expected.map(|total| bytes.min(total)).unwrap_or(bytes);
    if let Some(total) = acc.expected {
        progress.total = Some(total.max(progress.bytes));
    } else if progress.bytes > 0 {
        progress.total = None;
    }
}

fn poll_local_bytes(path: &Path, expected: Option<u64>) -> Option<u64> {
    let len = std::fs::metadata(path).ok()?.len();
    Some(expected.map(|total| len.min(total)).unwrap_or(len))
}

/// 仅 Done：本机是文件才写长度。目录或读不到保持观测，禁止回退 expected。
fn apply_done_local_len(progress: &mut TransferProgress, local: &Path) {
    let Ok(meta) = std::fs::metadata(local) else {
        return;
    };
    if !meta.is_file() {
        return;
    }
    let n = meta.len();
    progress.bytes = n;
    progress.total = Some(n);
}

/// `FileError` → wire。Cancelled / ProgressClosed / 树错误不进事件。禁止 `_` 吞变体。
fn wire_fault(err: &FileError) -> Option<TransferFault> {
    match err {
        FileError::Path(path) => Some(TransferFault::Path { path: path.clone() }),
        FileError::OutsideRoot(path) => Some(TransferFault::OutsideRoot { path: path.clone() }),
        FileError::RemoteNotFound(path) => {
            Some(TransferFault::RemoteNotFound { path: path.clone() })
        }
        FileError::NotADirectory(path) => Some(TransferFault::NotADirectory { path: path.clone() }),
        FileError::PermissionDenied(path) => {
            Some(TransferFault::PermissionDenied { path: path.clone() })
        }
        FileError::ReadOnly(path) => Some(TransferFault::ReadOnly { path: path.clone() }),
        FileError::AlreadyExists(path) => Some(TransferFault::AlreadyExists { path: path.clone() }),
        FileError::RemoteFailed(path) => Some(TransferFault::RemoteFailed { path: path.clone() }),
        FileError::LocalNotFound(path) => Some(TransferFault::LocalNotFound { path: path.clone() }),
        FileError::Local(path) => Some(TransferFault::Local { path: path.clone() }),
        FileError::ProgressJoin => Some(TransferFault::ProgressJoin),
        FileError::ProgressClosed
        | FileError::EmptyTree(_)
        | FileError::TreeLimit(_)
        | FileError::TreeDepth(_)
        | FileError::NotAttached => None,
        FileError::Adb(AdbError::Cancelled) => None,
        FileError::Adb(AdbError::DeviceOffline(serial) | AdbError::NotOnline(serial)) => {
            Some(TransferFault::DeviceOffline {
                serial: serial.clone(),
            })
        }
        FileError::Adb(AdbError::Timeout) => Some(TransferFault::Timeout),
        FileError::Adb(AdbError::Io(_)) | FileError::Adb(AdbError::UnsupportedShell) => {
            Some(TransferFault::Io)
        }
        FileError::Adb(AdbError::ToolUnavailable(_)) => Some(TransferFault::ToolUnavailable),
        FileError::Adb(AdbError::BadExit { .. }) => None,
    }
}

/// 远端末段。空段（尾斜杠）往前找。
pub fn transfer_name(remote: &str) -> String {
    remote
        .rsplit('/')
        .find(|part| !part.is_empty())
        .unwrap_or(remote)
        .to_string()
}

/// 行有新进度则 true。目录摘要累加；`[ N%]` 只在已知总量时当单文件。
fn apply_progress_line(acc: &mut ProgressAcc, line: &str) -> bool {
    if let Some(n) = extract_byte_count(line) {
        acc.completed = acc.completed.saturating_add(n);
        acc.inflight = 0;
        return true;
    }
    if let (Some(total), Some(pct)) = (acc.expected, extract_percent(line)) {
        acc.inflight = total.saturating_mul(u64::from(pct)) / 100;
        return true;
    }
    false
}

async fn emit(sink: &mpsc::Sender<AppEvent>, progress: TransferProgress, reliable: bool) {
    let event = AppEvent::TransferProgress(progress);
    if reliable {
        let _ = sink.send(event).await;
    } else {
        let _ = sink.try_send(event);
    }
}

async fn emit_terminal(
    sink: &mpsc::Sender<AppEvent>,
    progress: TransferProgress,
) -> Result<(), FileError> {
    sink.send(AppEvent::TransferProgress(progress))
        .await
        .map_err(|_| FileError::ProgressClosed)
}

async fn fail_before_stream(
    sink: &mpsc::Sender<AppEvent>,
    id: u32,
    direction: Direction,
    name: &str,
    local: &Path,
    err: FileError,
) -> Result<u64, FileError> {
    let progress = TransferProgress {
        id,
        direction,
        bytes: 0,
        total: None,
        state: TransferState::Running,
        fault: None,
        name: Some(name.to_string()),
    };
    finish_unsuccessful(sink, progress, direction, local, TransferState::Failed, err).await
}

async fn finish_unsuccessful(
    sink: &mpsc::Sender<AppEvent>,
    mut progress: TransferProgress,
    direction: Direction,
    local: &Path,
    state: TransferState,
    err: FileError,
) -> Result<u64, FileError> {
    let cleanup = cleanup_pull(direction, local);
    progress.state = state;
    progress.fault = match state {
        TransferState::Failed => wire_fault(&err),
        TransferState::Cancelled | TransferState::Done | TransferState::Running => None,
    };
    let _ = sink.send(AppEvent::TransferProgress(progress)).await;
    cleanup?;
    Err(err)
}

fn local_fs_error(err: std::io::Error, path: &Path) -> FileError {
    let shown = path.display().to_string();
    if err.kind() == std::io::ErrorKind::NotFound {
        FileError::LocalNotFound(shown)
    } else {
        FileError::Local(shown)
    }
}

/// 文件给 `adb push` 用精确字节；目录交给 adb 递归，总数等摘要行。
fn push_local_total(path: &Path) -> Result<u64, FileError> {
    let meta = std::fs::metadata(path).map_err(|e| local_fs_error(e, path))?;
    if meta.is_file() {
        Ok(meta.len())
    } else if meta.is_dir() {
        Ok(0)
    } else {
        Err(FileError::Local(path.display().to_string()))
    }
}

fn cleanup_pull(direction: Direction, local: &Path) -> Result<(), FileError> {
    if direction != Direction::Pull || !local.exists() {
        return Ok(());
    }
    let result = if local.is_dir() {
        std::fs::remove_dir_all(local)
    } else {
        std::fs::remove_file(local)
    };
    result.map_err(|_| FileError::Local(local.display().to_string()))
}

/// `... (3456 bytes in 0.001s)`。
fn extract_byte_count(line: &str) -> Option<u64> {
    let start = line.find('(')? + 1;
    let end = line[start..].find(" bytes")? + start;
    line[start..end].trim().replace(',', "").parse().ok()
}

/// `[  4%]` / `[ 45%]`。
fn extract_percent(line: &str) -> Option<u8> {
    let start = line.find('[')? + 1;
    let rest = line[start..].trim_start();
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() || !rest[digits.len()..].starts_with('%') {
        return None;
    }
    let pct: u8 = digits.parse().ok()?;
    (pct <= 100).then_some(pct)
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_domain::RemotePath;

    #[test]
    fn extracts_byte_counts() {
        assert_eq!(
            extract_byte_count(
                "report.txt: 1 file pushed, 0 skipped. 1.2 MB/s (3456 bytes in 0.001s)"
            ),
            Some(3456)
        );
        assert_eq!(
            extract_byte_count("/sdcard/x: 1 file pulled, 0 skipped. (1234567 bytes in 0.2s)"),
            Some(1234567)
        );
        assert_eq!(extract_byte_count("no bytes here"), None);
    }

    #[test]
    fn extracts_percent() {
        assert_eq!(extract_percent("[  4%] /sdcard/a.bin"), Some(4));
        assert_eq!(extract_percent("[ 45%] /sdcard/a.bin"), Some(45));
        assert_eq!(extract_percent("[100%] /sdcard/a.bin"), Some(100));
        assert_eq!(extract_percent("no percent"), None);
    }

    #[test]
    fn directory_summaries_accumulate() {
        let mut acc = ProgressAcc {
            completed: 0,
            inflight: 0,
            expected: None,
        };
        assert!(apply_progress_line(
            &mut acc,
            "a.txt: 1 file pushed. (1000 bytes in 0.001s)"
        ));
        assert!(apply_progress_line(
            &mut acc,
            "b.txt: 1 file pushed. (2500 bytes in 0.002s)"
        ));
        let mut progress = TransferProgress {
            id: 1,
            direction: Direction::Push,
            bytes: 0,
            total: None,
            state: TransferState::Running,
            fault: None,
            name: None,
        };
        paint_progress(&mut progress, &acc);
        assert_eq!(progress.bytes, 3500);
        assert_eq!(progress.total, None);
    }

    #[test]
    fn percent_uses_expected_total() {
        let mut acc = ProgressAcc {
            completed: 0,
            inflight: 0,
            expected: Some(1000),
        };
        assert!(apply_progress_line(&mut acc, "[ 40%] /sdcard/a.bin"));
        assert_eq!(acc.inflight, 400);
        let mut progress = TransferProgress {
            id: 1,
            direction: Direction::Push,
            bytes: 0,
            total: Some(1000),
            state: TransferState::Running,
            fault: None,
            name: None,
        };
        paint_progress(&mut progress, &acc);
        assert_eq!(progress.bytes, 400);
        assert_eq!(progress.total, Some(1000));
    }

    #[test]
    fn percent_ignored_without_expected() {
        let mut acc = ProgressAcc {
            completed: 0,
            inflight: 0,
            expected: None,
        };
        assert!(!apply_progress_line(&mut acc, "[ 40%] /sdcard/a.bin"));
    }

    #[test]
    fn transfer_name_takes_last_segment() {
        assert_eq!(transfer_name("/sdcard/DCIM/a.png"), "a.png");
        assert_eq!(transfer_name("/sdcard/DCIM/"), "DCIM");
        assert_eq!(transfer_name("a.png"), "a.png");
    }

    #[test]
    fn remote_path_still_normalized() {
        assert!(RemotePath::parse("/sdcard//a/./b").is_ok());
        assert!(RemotePath::parse("sdcard/a").is_err());
    }

    fn unique_temp(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("yohu-files-{tag}-{}-{nanos}", std::process::id()))
    }

    #[test]
    fn push_accepts_file_and_directory() {
        let root = unique_temp("push-src");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("a.bin");
        std::fs::write(&file, b"hello").unwrap();
        let nested = root.join("folder");
        std::fs::create_dir_all(&nested).unwrap();

        assert_eq!(push_local_total(&file).unwrap(), 5);
        assert_eq!(push_local_total(&nested).unwrap(), 0);
        let missing = root.join("missing");
        let missing_shown = missing.display().to_string();
        assert!(matches!(
            push_local_total(&missing),
            Err(FileError::LocalNotFound(ref p)) if p == &missing_shown
        ));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn local_fs_error_classifies_not_found_only() {
        let path = Path::new(r"C:\tmp\yohu-local.bin");
        let shown = path.display().to_string();
        assert!(matches!(
            local_fs_error(
                std::io::Error::new(std::io::ErrorKind::NotFound, "gone"),
                path
            ),
            FileError::LocalNotFound(ref p) if p == &shown
        ));
        let denied = local_fs_error(
            std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "access denied sentence",
            ),
            path,
        );
        assert!(matches!(denied, FileError::Local(ref p) if p == &shown));
        assert_eq!(denied.to_string(), format!("本地操作失败: {shown}"));
        assert!(!denied.to_string().contains("access denied sentence"));
    }

    #[test]
    fn cleanup_pull_removes_file_or_directory_and_ignores_push() {
        let root = unique_temp("cleanup");
        let file = root.join("partial.bin");
        let dir = root.join("partial-dir");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), b"x").unwrap();
        std::fs::write(&file, b"abc").unwrap();

        cleanup_pull(Direction::Push, &file).unwrap();
        assert!(file.exists());

        cleanup_pull(Direction::Pull, &file).unwrap();
        assert!(!file.exists());

        cleanup_pull(Direction::Pull, &dir).unwrap();
        assert!(!dir.exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    fn sample_progress(bytes: u64, total: Option<u64>) -> TransferProgress {
        TransferProgress {
            id: 9,
            direction: Direction::Pull,
            bytes,
            total,
            state: TransferState::Running,
            fault: None,
            name: Some("a.bin".into()),
        }
    }

    #[test]
    fn done_writes_local_file_len_only() {
        let root = unique_temp("done-len");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("a.bin");
        std::fs::write(&file, b"hello").unwrap();
        let mut progress = sample_progress(0, Some(99));
        apply_done_local_len(&mut progress, &file);
        assert_eq!(progress.bytes, 5);
        assert_eq!(progress.total, Some(5));

        let dir = root.join("folder");
        std::fs::create_dir_all(&dir).unwrap();
        let mut dir_progress = sample_progress(12, None);
        apply_done_local_len(&mut dir_progress, &dir);
        assert_eq!(dir_progress.bytes, 12);
        assert_eq!(dir_progress.total, None);

        let missing = root.join("missing.bin");
        let mut missing_progress = sample_progress(3, Some(99));
        apply_done_local_len(&mut missing_progress, &missing);
        assert_eq!(missing_progress.bytes, 3);
        assert_eq!(missing_progress.total, Some(99));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn wire_fault_maps_named_and_transport() {
        assert_eq!(
            wire_fault(&FileError::RemoteNotFound("/sdcard/a".into())),
            Some(TransferFault::RemoteNotFound {
                path: "/sdcard/a".into()
            })
        );
        assert_eq!(wire_fault(&FileError::Adb(AdbError::Cancelled)), None);
        assert_eq!(
            wire_fault(&FileError::Adb(AdbError::DeviceOffline("S1".into()))),
            Some(TransferFault::DeviceOffline {
                serial: "S1".into()
            })
        );
        assert_eq!(
            wire_fault(&FileError::Adb(AdbError::NotOnline("S2".into()))),
            Some(TransferFault::DeviceOffline {
                serial: "S2".into()
            })
        );
        assert_eq!(
            wire_fault(&FileError::Adb(AdbError::Timeout)),
            Some(TransferFault::Timeout)
        );
        assert_eq!(
            wire_fault(&FileError::Adb(AdbError::Io(std::io::Error::other("pipe")))),
            Some(TransferFault::Io)
        );
        assert_eq!(
            wire_fault(&FileError::ProgressJoin),
            Some(TransferFault::ProgressJoin)
        );
        assert_eq!(wire_fault(&FileError::ProgressClosed), None);
        assert_eq!(wire_fault(&FileError::EmptyTree("/sdcard".into())), None);
        assert_eq!(wire_fault(&FileError::NotAttached), None);
        assert!(!matches!(
            FileError::ProgressJoin,
            FileError::Adb(AdbError::Io(_))
        ));
    }

    #[test]
    fn unsuccessful_keeps_observed_bytes_and_emits_fault() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let (tx, mut rx) = mpsc::channel(4);
            let dest = unique_temp("unsuccessful-dest");
            let err = FileError::RemoteNotFound("/sdcard/gone.bin".into());
            let result = finish_unsuccessful(
                &tx,
                sample_progress(0, Some(999)),
                Direction::Pull,
                &dest,
                TransferState::Failed,
                err,
            )
            .await;
            assert!(result.is_err());
            let AppEvent::TransferProgress(p) = rx.recv().await.unwrap() else {
                panic!("expected transfer progress");
            };
            assert_eq!(p.bytes, 0);
            assert_eq!(p.total, Some(999));
            assert_eq!(p.state, TransferState::Failed);
            assert_eq!(
                p.fault,
                Some(TransferFault::RemoteNotFound {
                    path: "/sdcard/gone.bin".into()
                })
            );

            let (tx, mut rx) = mpsc::channel(4);
            let cancelled = finish_unsuccessful(
                &tx,
                sample_progress(0, Some(999)),
                Direction::Pull,
                &dest,
                TransferState::Cancelled,
                FileError::Adb(AdbError::Cancelled),
            )
            .await;
            assert!(cancelled.is_err());
            let AppEvent::TransferProgress(p) = rx.recv().await.unwrap() else {
                panic!("expected transfer progress");
            };
            assert_eq!(p.bytes, 0);
            assert_eq!(p.state, TransferState::Cancelled);
            assert_eq!(p.fault, None);

            let (tx, mut rx) = mpsc::channel(4);
            let join = finish_unsuccessful(
                &tx,
                sample_progress(40, Some(100)),
                Direction::Pull,
                &dest,
                TransferState::Failed,
                FileError::ProgressJoin,
            )
            .await;
            assert!(join.is_err());
            let AppEvent::TransferProgress(p) = rx.recv().await.unwrap() else {
                panic!("expected transfer progress");
            };
            assert_eq!(p.bytes, 40);
            assert_eq!(p.fault, Some(TransferFault::ProgressJoin));
        });
    }

    #[test]
    fn fail_before_stream_emits_terminal() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let (tx, mut rx) = mpsc::channel(2);
            let err = FileError::OutsideRoot("/data/x".into());
            let result =
                fail_before_stream(&tx, 3, Direction::Push, "x", Path::new("/tmp/x"), err).await;
            assert!(result.is_err());
            let AppEvent::TransferProgress(p) = rx.recv().await.unwrap() else {
                panic!("expected transfer progress");
            };
            assert_eq!(p.id, 3);
            assert_eq!(p.state, TransferState::Failed);
            assert_eq!(p.bytes, 0);
            assert_eq!(
                p.fault,
                Some(TransferFault::OutsideRoot {
                    path: "/data/x".into()
                })
            );
        });
    }
}
