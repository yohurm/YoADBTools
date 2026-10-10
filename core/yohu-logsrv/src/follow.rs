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
use crate::windows::WindowBook;
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
    skip.identities.iter().any(|(pid, tid, tag, msg)| {
        *pid == line.pid && *tid == line.tid && tag == &line.tag && msg == &line.msg
    })
}

fn follow_resumes(end: FollowEnd) -> bool {
    matches!(end, FollowEnd::Exited { .. } | FollowEnd::Error)
}

/// 行的所有权交给环。只有钉底窗口才为这一页克隆正文。
async fn emit(
    ring: &RingBuffer,
    book: &WindowBook,
    batcher: &Batcher,
    serial: &str,
    line: LogLine,
) -> Result<(), ()> {
    let prepared = book.prepare(serial, &line);
    let pushed = ring.push(line);
    let wire = if prepared.needs_body() {
        ring.lines_by_seq(&[pushed.seq]).into_iter().next()
    } else {
        None
    };
    let notes = book.commit(serial, pushed.seq, pushed.oldest, prepared, wire);
    for note in notes {
        batcher.note(note).await?;
    }
    Ok(())
}

/// 续流重复行丢掉；墙钟往前走就清掉跳过集，然后入环。
async fn admit_line(
    skip: &mut Option<ResumeSkip>,
    ring: &RingBuffer,
    book: &WindowBook,
    batcher: &Batcher,
    serial: &str,
    line: LogLine,
) -> Result<(), ()> {
    if skip
        .as_ref()
        .is_some_and(|known| skip_resume(known, &line))
    {
        return Ok(());
    }
    if skip.as_ref().is_some_and(|known| line.ts != known.ts) {
        *skip = None;
    }
    emit(ring, book, batcher, serial, line).await
}

fn classify(result: &Result<i32, AdbError>, slot_cancelled: bool) -> FollowEnd {
    if slot_cancelled {
        return FollowEnd::Cancelled;
    }
    match result {
        Ok(code) => FollowEnd::Exited { code: *code },
        Err(AdbError::DeviceOffline(_) | AdbError::NotOnline(_)) => FollowEnd::Offline,
        Err(
            AdbError::Cancelled
            | AdbError::ToolUnavailable
            | AdbError::CandidatesFailed
            | AdbError::Timeout
            | AdbError::UnsupportedShell
            | AdbError::BadExit { .. }
            | AdbError::Io(_)
            | AdbError::Truncated
            | AdbError::PumpPanic
            | AdbError::Shell(_),
        ) => FollowEnd::Error,
    }
}

pub(crate) async fn run_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    book: Arc<WindowBook>,
    batcher: Batcher,
    cancel: CancellationToken,
    resume: bool,
) -> FollowEnd {
    let skip = if resume { ring.resume_skip() } else { None };
    let since = skip.as_ref().map(|s| s.ts.clone());
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let ring_pump = Arc::clone(&ring);
    let book_pump = Arc::clone(&book);
    let batcher_pump = batcher.clone();
    let serial_pump = serial.clone();
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
                        if admit_line(&mut skip, &ring_pump, &book_pump, &batcher_pump, &serial_pump, line)
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(LAST_MESSAGE_DELAY), if assembler.has_pending() => {
                    if let Some(line) = assembler.take() {
                        if admit_line(&mut skip, &ring_pump, &book_pump, &batcher_pump, &serial_pump, line)
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }
                }
            }
        }
        if let Some(line) = assembler.take() {
            let _ = admit_line(&mut skip, &ring_pump, &book_pump, &batcher_pump, &serial_pump, line).await;
        }
    }));

    let result = adb
        .stream_lines(
            &serial,
            &follow_argv(since.as_deref()),
            cancel.clone(),
            line_tx.clone(),
        )
        .await;
    let end = classify(&result, cancel.is_cancelled());
    match end {
        FollowEnd::Cancelled => {}
        FollowEnd::Offline => {
            tracing::warn!(serial = %serial, "采集跟流掉线");
        }
        FollowEnd::Exited { code } => {
            tracing::warn!(serial = %serial, code, resume, "采集跟流工人退出");
        }
        FollowEnd::Error => {
            if let Err(e) = &result {
                tracing::warn!(serial = %serial, error = %e, resume, "采集跟流工人出错");
            }
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
    book: Arc<WindowBook>,
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
            Arc::clone(&book),
            batcher.clone(),
            attempt,
            resume,
        )
        .await;
        if !follow_resumes(end) || cancel.is_cancelled() {
            return if cancel.is_cancelled() {
                FollowEnd::Cancelled
            } else {
                end
            };
        }
        resume = true;
        let resume_ts = ring.resume_skip().map(|skip| skip.ts);
        tracing::info!(serial = %serial, resume_ts = resume_ts.as_deref().unwrap_or(""), "采集跟流同世代重启");
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return FollowEnd::Cancelled,
            _ = tokio::time::sleep(FOLLOW_RESTART_WAIT) => {}
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
        assert_eq!(classify(&Err(AdbError::Cancelled), false), FollowEnd::Error);
        assert_eq!(
            classify(&Err(AdbError::Cancelled), true),
            FollowEnd::Cancelled
        );
        assert_eq!(
            classify(&Err(AdbError::DeviceOffline("offline".into())), false),
            FollowEnd::Offline
        );
        assert_eq!(classify(&Ok(0), false), FollowEnd::Exited { code: 0 });
        assert_eq!(classify(&Ok(0), true), FollowEnd::Cancelled);
    }

    #[test]
    fn bad_exit_255_resumes_without_clearing_the_slot() {
        let end = classify(
            &Err(AdbError::BadExit {
                exit_code: 255,
                stderr: String::new(),
            }),
            false,
        );
        assert_eq!(end, FollowEnd::Error);
        assert!(follow_resumes(end));
        assert!(!follow_resumes(FollowEnd::Offline));
        assert!(!follow_resumes(FollowEnd::Cancelled));
        let src = include_str!("follow.rs");
        let emit = src
            .split("async fn emit")
            .nth(1)
            .expect("emit")
            .split("async fn admit_line")
            .next()
            .expect("emit body");
        assert!(
            !emit.contains("line.clone()"),
            "入环不得再克隆整行"
        );
    }

    #[test]
    fn only_offline_stops_the_slot() {
        assert_eq!(
            classify(&Err(AdbError::NotOnline("S1".into())), false),
            FollowEnd::Offline
        );
        for err in [
            AdbError::Timeout,
            AdbError::Truncated,
            AdbError::PumpPanic,
            AdbError::UnsupportedShell,
            AdbError::CandidatesFailed,
            AdbError::ToolUnavailable,
            AdbError::BadExit {
                exit_code: 1,
                stderr: "boom".into(),
            },
            AdbError::Io(std::io::Error::other("pipe")),
            AdbError::Shell(yohu_adb::ShellFault::Ended),
        ] {
            let end = classify(&Err(err), false);
            assert_eq!(end, FollowEnd::Error);
        }
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

    fn without_fn(src: &str, name: &str) -> String {
        let marker = format!("fn {name}");
        let mut out = String::new();
        let mut dropping = false;
        let mut depth = 0i32;
        let mut seen_brace = false;
        for line in src.lines() {
            if !dropping && line.contains(&marker) {
                dropping = true;
                depth = 0;
                seen_brace = false;
            }
            if dropping {
                depth += line.matches('{').count() as i32;
                depth -= line.matches('}').count() as i32;
                if line.contains('{') {
                    seen_brace = true;
                }
                if seen_brace && depth <= 0 {
                    dropping = false;
                }
                continue;
            }
            out.push_str(line);
            out.push('\n');
        }
        out
    }

    #[test]
    fn cut_log_slot_and_ring_stay_with_owner() {
        let mut ring = include_str!("ring.rs").to_string();
        for name in ["ring_capacity", "evict_overflow", "lines_from"] {
            ring = without_fn(&ring, name);
        }
        assert!(!ring.contains(".max(1)"));
        assert!(!ring.contains("pop_front()"));
        assert!(!ring.contains("line.seq >= from_seq"));

        let capture_src = include_str!("capture.rs");
        assert!(!capture_src.contains(".max(1)"));
        assert!(!capture_src.contains("slot.phase == Phase::Starting || slot.phase == Phase::Live"));
        assert!(!capture_src.contains("slot.phase == Phase::Live || slot.phase == Phase::Starting"));
        let mut capture = capture_src.to_string();
        for name in ["phase_occupies", "join_workers", "publish_stopped"] {
            capture = without_fn(&capture, name);
        }
        assert!(!capture.contains("CaptureState::Stopped"));
        assert!(!capture.contains("join_or_abort("));

        let assembler = include_str!("assembler.rs");
        assert!(!assembler.contains("header.is_none() || self.body.is_empty()"));
        let pending = without_fn(assembler, "has_pending");
        assert!(!pending.contains("header.is_some() && !self.body.is_empty()"));
    }

    #[test]
    fn phase_edge_once() {
        let src = include_str!("capture.rs");
        let (production, _) = src
            .split_once("mod tests")
            .expect("capture.rs 应有 mod tests");
        assert_eq!(production.matches("phase == Phase::Starting").count(), 1);
        assert_eq!(production.matches("phase == Phase::Stopping").count(), 1);
    }

    #[test]
    fn capture_same_generation_once() {
        let src = include_str!("capture.rs");
        let (production, _) = src
            .split_once("mod tests")
            .expect("capture.rs 应有 mod tests");
        assert_eq!(production.matches("slot.generation ==").count(), 0);
        assert_eq!(production.matches("slot_generation == expected").count(), 1);
    }
}
