//! 跟流工人：一次 `adb logcat` 进程，以及槽位内的监督循环。
//!
//! 槽位（意图）与工人（进程）分离：logcat 退出 / IO 错误不得拆代际管道或发 Stopped。
//! 对照 platform/tools/base `LogCatReceiverTask`（shell 结束 ≠ 停采集意图）
//! 与 stb-tester `LogcatCollector`（后台循环重连，掉线例外才停）。
//! 续流对齐 AOSP `logcat -T <time>`（`YYYY-MM-DD HH:MM:SS.mmm`，含该时刻）。
//!
//! 代际 `cancel` 由槽位持有；每次 attempt 用子令牌。Batcher / 环属代际，不随工人重建。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::assembler::MessageAssembler;
use crate::batch::Batcher;
use crate::ring::{ResumeSkip, RingBuffer};
use crate::task::AbortOnDrop;
use yohu_adb::{AdbClient, AdbError};
use yohu_protocol::LogLine;

const LOGCAT_FORMAT: &str = "long,uid,year";
const LAST_MESSAGE_DELAY: Duration = Duration::from_millis(100);
/// 工人退出后到下一 attempt 的间隔。不是槽位轮询：select 取消即停。
const FOLLOW_RESTART_WAIT: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FollowEnd {
    Cancelled,
    Offline,
    Exited { code: i32 },
    Error,
}

fn follow_argv(since: Option<&str>) -> Vec<String> {
    let mut argv = vec!["logcat".into(), "-v".into(), LOGCAT_FORMAT.into()];
    if let Some(ts) = since {
        argv.push("-T".into());
        argv.push(ts.to_string());
    }
    argv
}

fn skip_resume(skip: &ResumeSkip, line: &LogLine) -> bool {
    if line.ts.as_str() < skip.ts.as_str() {
        return true;
    }
    if line.ts != skip.ts {
        return false;
    }
    skip.identities
        .iter()
        .any(|(pid, tid, tag, msg)| *pid == line.pid && *tid == line.tid && tag == &line.tag && msg == &line.msg)
}

async fn emit(ring: &RingBuffer, batcher: &Batcher, mut line: LogLine) -> Result<(), ()> {
    line.seq = ring.push(line.clone());
    batcher.feed(line).await
}

fn classify(result: Result<i32, AdbError>, slot_cancelled: bool) -> FollowEnd {
    if slot_cancelled {
        return FollowEnd::Cancelled;
    }
    match result {
        Ok(code) => FollowEnd::Exited { code },
        Err(AdbError::Cancelled) => FollowEnd::Error,
        Err(AdbError::DeviceOffline(_)) | Err(AdbError::NotOnline(_)) => FollowEnd::Offline,
        Err(_) => FollowEnd::Error,
    }
}

pub(crate) async fn run_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    batcher: Batcher,
    cancel: CancellationToken,
    resume: bool,
) -> FollowEnd {
    let skip = if resume { ring.resume_skip() } else { None };
    let since = skip.as_ref().map(|s| s.ts.clone());
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let ring_pump = Arc::clone(&ring);
    let batcher_pump = batcher.clone();
    let pump = AbortOnDrop::new(tokio::spawn(async move {
        let mut assembler = MessageAssembler::new();
        let mut skip = skip;
        loop {
            tokio::select! {
                raw = line_rx.recv() => {
                    let Some(raw) = raw else {
                        break;
                    };
                    for line in assembler.ingest(&raw) {
                        if skip.as_ref().is_some_and(|s| skip_resume(s, &line)) {
                            continue;
                        }
                        if skip.as_ref().is_some_and(|s| line.ts != s.ts) {
                            skip = None;
                        }
                        if emit(&ring_pump, &batcher_pump, line).await.is_err() {
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(LAST_MESSAGE_DELAY), if assembler.has_pending() => {
                    if let Some(line) = assembler.take() {
                        if skip.as_ref().is_some_and(|s| skip_resume(s, &line)) {
                            continue;
                        }
                        if skip.as_ref().is_some_and(|s| line.ts != s.ts) {
                            skip = None;
                        }
                        if emit(&ring_pump, &batcher_pump, line).await.is_err() {
                            return;
                        }
                    }
                }
            }
        }
        if let Some(line) = assembler.take() {
            if skip.as_ref().is_some_and(|s| skip_resume(s, &line)) {
                return;
            }
            let _ = emit(&ring_pump, &batcher_pump, line).await;
        }
    }));

    let result = adb
        .stream_lines(&serial, &follow_argv(since.as_deref()), cancel.clone(), line_tx.clone())
        .await;
    let end = classify(result, cancel.is_cancelled());
    match end {
        FollowEnd::Cancelled => {}
        FollowEnd::Offline => {
            tracing::warn!(serial = %serial, "采集跟流掉线");
        }
        FollowEnd::Exited { code } => {
            tracing::warn!(serial = %serial, code, resume, "采集跟流工人退出");
        }
        FollowEnd::Error => {
            tracing::warn!(serial = %serial, resume, "采集跟流工人出错");
        }
    }

    drop(line_tx);
    pump.join().await;
    end
}

/// 槽位监督：工人结束且意图仍在时同世代重启（`-T` 续流，不清环）。
pub(crate) async fn supervise_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    batcher: Batcher,
    cancel: CancellationToken,
) -> FollowEnd {
    let mut resume = false;
    loop {
        let attempt = cancel.child_token();
        let end = run_follow(
            Arc::clone(&adb),
            serial.clone(),
            Arc::clone(&ring),
            batcher.clone(),
            attempt,
            resume,
        )
        .await;
        match end {
            FollowEnd::Cancelled | FollowEnd::Offline => return end,
            FollowEnd::Exited { .. } | FollowEnd::Error => {
                if cancel.is_cancelled() {
                    return FollowEnd::Cancelled;
                }
                resume = true;
                tracing::info!(serial = %serial, "采集跟流同世代重启");
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => return FollowEnd::Cancelled,
                    _ = tokio::time::sleep(FOLLOW_RESTART_WAIT) => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follow_argv_omits_t_until_resume() {
        assert_eq!(
            follow_argv(None),
            vec!["logcat".to_string(), "-v".into(), LOGCAT_FORMAT.into()]
        );
        assert_eq!(
            follow_argv(Some("2026-01-02 03:04:05.880")),
            vec![
                "logcat".to_string(),
                "-v".into(),
                LOGCAT_FORMAT.into(),
                "-T".into(),
                "2026-01-02 03:04:05.880".into(),
            ]
        );
    }

    #[test]
    fn classify_pipe_cancel_without_slot_cancel_is_error() {
        assert_eq!(classify(Err(AdbError::Cancelled), false), FollowEnd::Error);
        assert_eq!(classify(Err(AdbError::Cancelled), true), FollowEnd::Cancelled);
        assert_eq!(
            classify(Err(AdbError::DeviceOffline("offline".into())), false),
            FollowEnd::Offline
        );
        assert_eq!(classify(Ok(0), false), FollowEnd::Exited { code: 0 });
        assert_eq!(classify(Ok(0), true), FollowEnd::Cancelled);
    }

    #[test]
    fn skip_resume_drops_known_identity_at_last_ts() {
        let skip = ResumeSkip {
            ts: "2026-01-02 03:04:05.880".into(),
            identities: vec![(9999, 5678, "OtherTag".into(), "hello three".into())],
        };
        let dup = LogLine {
            ts: skip.ts.clone(),
            pid: 9999,
            tid: 5678,
            tag: "OtherTag".into(),
            msg: "hello three".into(),
            ..LogLine::default()
        };
        let newer = LogLine {
            ts: "2026-01-02 03:04:06.000".into(),
            pid: 1,
            tid: 1,
            tag: "T".into(),
            msg: "next".into(),
            ..LogLine::default()
        };
        assert!(skip_resume(&skip, &dup));
        assert!(!skip_resume(&skip, &newer));
    }
}
