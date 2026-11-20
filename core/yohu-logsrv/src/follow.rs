//! 跟流工人：一次 `adb logcat` 进程，以及槽位内的监督循环。
//!
//! 槽位（意图）与工人（进程）分离：logcat 退出 / IO 错误不得拆代际管道或发 Stopped。
//! 对照 platform/tools/base `LogCatReceiverTask`（shell 结束 ≠ 停采集意图）
//! 与 stb-tester `LogcatCollector`（后台循环重连，掉线例外才停）。
//! 续流对齐 AOSP `logcat -T <time>`（`YYYY-MM-DD HH:MM:SS.mmm`，含该时刻）。
//!
//! 代际 `cancel` 由槽位持有；每次 attempt 用子令牌。Batcher / 环属代际，不随工人重建。
//!
//! ## attempt 预算（P1）
//!
//! 「同世代重启」不是无限的：连续可恢复失败（`Exited{code}` 含 0、以及运输抖动 `Error`）
//! 计入 [`AttemptBudget`]，退避按指数增长，达阈值升级 [`FollowEnd::Terminal`]，
//! 由槽位按永久失败路径收敛并发 `Stopped`。否则 `logcat -T <未来时刻>`、SELinux 拒绝等
//! 「立刻退出」的场景会变成每秒 4 次进程创建的无限重生循环。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::assembler::MessageAssembler;
use crate::batch::Batcher;
use crate::limits::{
    FOLLOW_ATTEMPT_LIMIT, FOLLOW_RESTART_BACKOFF_MAX, FOLLOW_RESTART_BACKOFF_MIN, LINE_CHANNEL_CAP,
};
use crate::record::LogRecord;
use crate::ring::{is_system_timestamp, ResumeSkip, RingBuffer};
use crate::task::AbortOnDrop;
use yohu_adb::{AdbClient, AdbError};

const LOGCAT_FORMAT: &str = "long,uid,year";
const LAST_MESSAGE_DELAY: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FollowEnd {
    Cancelled,
    Offline,
    /// 工人正常退出（logcat 结束）。可同世代重启，但计入 attempt 预算。
    Exited { code: i32 },
    /// 可同世代重启的运输错误（IO / BadExit / 超时 / 泵 panic 等）。计入 attempt 预算。
    Error,
    /// 永久失败（无 adb 工具 / 候选失败 / 不支持 shell / 预算耗尽）：不再热重启，
    /// 按掉线路径收敛并发 Stopped。
    Terminal,
}

/// 一次 attempt 之后的处置。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AttemptDecision {
    /// 还能再试：退避这么久。
    Retry(Duration),
    /// 连续可恢复失败已达上限：升级为 Terminal。
    Exhausted,
}

/// 连续可恢复失败的计数与指数退避。
///
/// `Exited{code:0}` 也计入：退出码 0 只说明「进程正常结束」，不说明「采集有意义地跑过」。
/// 计数在任一非可恢复结局（Offline / Terminal / Cancelled）时不需要复位——
/// 那三条路径直接结束监督循环。
#[derive(Debug, Default)]
pub(crate) struct AttemptBudget {
    consecutive: u32,
}

impl AttemptBudget {
    pub(crate) fn new() -> Self {
        Self { consecutive: 0 }
    }

    pub(crate) fn consecutive(&self) -> u32 {
        self.consecutive
    }

    /// 记一次可恢复结束，返回下一步处置。
    pub(crate) fn on_recoverable(&mut self) -> AttemptDecision {
        self.consecutive += 1;
        if self.consecutive >= FOLLOW_ATTEMPT_LIMIT {
            return AttemptDecision::Exhausted;
        }
        AttemptDecision::Retry(backoff(self.consecutive))
    }
}

/// `min * 2^(n-1)`，封顶 `FOLLOW_RESTART_BACKOFF_MAX`。`n` 从 1 起（第一次失败）。
pub(crate) fn backoff(consecutive: u32) -> Duration {
    let shift = consecutive.saturating_sub(1).min(16);
    let factor = 1u32 << shift;
    let scaled = FOLLOW_RESTART_BACKOFF_MIN.saturating_mul(factor);
    scaled.min(FOLLOW_RESTART_BACKOFF_MAX)
}

fn follow_argv(since: Option<&str>) -> Vec<String> {
    let mut argv = vec!["logcat".into(), "-v".into(), LOGCAT_FORMAT.into()];
    // `-T ""`（空续流锚点）会被 logcat 当成非法值回落 tail_lines=1（掉行）。为空则不带 `-T`。
    if let Some(ts) = since.filter(|ts| !ts.is_empty()) {
        argv.push("-T".into());
        argv.push(ts.to_string());
    }
    argv
}

/// 续流去重。规则与 [`RingBuffer::resume_skip`] 共用「空 ts 不是时间」这一条：
/// 系统行（缓冲区边界）不参与比较，直接入环。
fn skip_resume(skip: &ResumeSkip, rec: &LogRecord) -> bool {
    if is_system_timestamp(&rec.ts) {
        return false;
    }
    if rec.ts.as_str() < skip.ts.as_str() {
        return true;
    }
    if rec.ts != skip.ts {
        return false;
    }
    skip.identities.iter().any(|(pid, tid, tag, msg)| {
        *pid == rec.pid && *tid == rec.tid && tag == &rec.tag && msg == &rec.msg
    })
}

/// 墙钟是否已越过续流锚点（越过即可丢弃跳过集）。
fn advanced_past(skip: &ResumeSkip, rec: &LogRecord) -> bool {
    !is_system_timestamp(&rec.ts) && rec.ts != skip.ts
}

fn follow_resumes(end: FollowEnd) -> bool {
    matches!(end, FollowEnd::Exited { .. } | FollowEnd::Error)
}

/// 行的所有权交给环；入环后只向批量器报告水位（seq），界面对窗口自行从环拉取。
async fn emit(ring: &RingBuffer, batcher: &Batcher, record: LogRecord) -> Result<(), ()> {
    let line = record.into_wire();
    let pushed = ring.push(line);
    batcher.note(pushed.seq).await
}

/// 续流重复行丢掉；墙钟往前走就清掉跳过集，然后入环。
async fn admit_line(
    skip: &mut Option<ResumeSkip>,
    ring: &RingBuffer,
    batcher: &Batcher,
    record: LogRecord,
) -> Result<(), ()> {
    if skip.as_ref().is_some_and(|known| skip_resume(known, &record)) {
        return Ok(());
    }
    if skip.as_ref().is_some_and(|known| advanced_past(known, &record)) {
        *skip = None;
    }
    emit(ring, batcher, record).await
}

fn classify(result: &Result<i32, AdbError>, slot_cancelled: bool) -> FollowEnd {
    if slot_cancelled {
        return FollowEnd::Cancelled;
    }
    match result {
        Ok(code) => FollowEnd::Exited { code: *code },
        Err(AdbError::DeviceOffline(_) | AdbError::NotOnline(_)) => FollowEnd::Offline,
        Err(
            AdbError::ToolUnavailable
            | AdbError::CandidatesFailed
            | AdbError::UnsupportedShell,
        ) => FollowEnd::Terminal,
        Err(
            AdbError::Cancelled
            | AdbError::Timeout
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
    batcher: Batcher,
    cancel: CancellationToken,
    resume: bool,
) -> FollowEnd {
    let skip = if resume { ring.resume_skip() } else { None };
    let since = skip.as_ref().map(|s| s.ts.clone());
    let (line_tx, mut line_rx) = mpsc::channel::<String>(LINE_CHANNEL_CAP);
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
                        if admit_line(&mut skip, &ring_pump, &batcher_pump, line)
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(LAST_MESSAGE_DELAY), if assembler.has_pending() => {
                    if let Some(line) = assembler.take() {
                        if admit_line(&mut skip, &ring_pump, &batcher_pump, line)
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
            let _ = admit_line(&mut skip, &ring_pump, &batcher_pump, line).await;
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
        FollowEnd::Terminal => {
            if let Err(e) = &result {
                tracing::error!(serial = %serial, error = %e, "采集跟流永久失败，结束槽位");
            }
        }
    }

    drop(line_tx);
    pump.join().await;
    end
}

/// 槽位监督：工人结束且意图仍在时同世代重启（`-T` 续流，不清环）。
///
/// 连续可恢复失败受 [`AttemptBudget`] 约束：退避递增，达阈值返回 [`FollowEnd::Terminal`]。
pub(crate) async fn supervise_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    batcher: Batcher,
    cancel: CancellationToken,
) -> FollowEnd {
    let mut resume = false;
    let mut budget = AttemptBudget::new();
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
        if !follow_resumes(end) || cancel.is_cancelled() {
            return if cancel.is_cancelled() {
                FollowEnd::Cancelled
            } else {
                end
            };
        }
        let wait = match budget.on_recoverable() {
            AttemptDecision::Retry(wait) => wait,
            AttemptDecision::Exhausted => {
                tracing::error!(
                    serial = %serial,
                    attempts = budget.consecutive(),
                    "采集跟流连续可恢复失败达上限，升级为永久失败"
                );
                return FollowEnd::Terminal;
            }
        };
        resume = true;
        let resume_ts = ring.resume_skip().map(|skip| skip.ts);
        tracing::info!(
            serial = %serial,
            attempt = budget.consecutive(),
            wait_ms = wait.as_millis(),
            resume_ts = resume_ts.as_deref().unwrap_or(""),
            "采集跟流同世代重启"
        );
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return FollowEnd::Cancelled,
            _ = tokio::time::sleep(wait) => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(ts: &str, pid: u32, tid: u32, tag: &str, msg: &str) -> LogRecord {
        LogRecord {
            ts: ts.into(),
            pid,
            tid,
            tag: tag.into(),
            msg: msg.into(),
            ..LogRecord::default()
        }
    }

    fn system_record(msg: &str) -> LogRecord {
        LogRecord {
            msg: msg.into(),
            ..LogRecord::default()
        }
    }

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
        // 空续流锚点不得拼出 `-T ""`（会回落 tail_lines=1 掉行）
        assert_eq!(
            follow_argv(Some("")),
            vec!["logcat".to_string(), "-v".into(), LOGCAT_FORMAT.into()]
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
    fn permanent_failures_are_terminal_and_never_resume() {
        for err in [
            AdbError::ToolUnavailable,
            AdbError::CandidatesFailed,
            AdbError::UnsupportedShell,
        ] {
            let end = classify(&Err(err), false);
            assert_eq!(end, FollowEnd::Terminal);
            assert!(!follow_resumes(end), "永久失败不得热重启");
        }
        assert!(!follow_resumes(FollowEnd::Offline));
        assert!(!follow_resumes(FollowEnd::Cancelled));
    }

    #[test]
    fn transient_errors_resume_without_clearing_the_slot() {
        let end = classify(
            &Err(AdbError::BadExit {
                exit_code: 255,
                stderr: String::new(),
            }),
            false,
        );
        assert_eq!(end, FollowEnd::Error);
        assert!(follow_resumes(end));
        for err in [
            AdbError::Timeout,
            AdbError::Truncated,
            AdbError::PumpPanic,
            AdbError::BadExit {
                exit_code: 1,
                stderr: "boom".into(),
            },
            AdbError::Io(std::io::Error::other("pipe")),
            AdbError::Shell(yohu_adb::ShellFault::Ended),
        ] {
            let end = classify(&Err(err), false);
            assert_eq!(end, FollowEnd::Error);
            assert!(follow_resumes(end), "短暂运输错误应可同世代重启");
        }
    }

    #[test]
    fn only_offline_and_terminal_stop_the_slot() {
        assert_eq!(
            classify(&Err(AdbError::NotOnline("S1".into())), false),
            FollowEnd::Offline
        );
        assert_eq!(
            classify(&Err(AdbError::ToolUnavailable), false),
            FollowEnd::Terminal
        );
    }

    /// 预算：每次可恢复失败都让退避指数增长，封顶后不再增长。
    #[test]
    fn budget_backoff_grows_exponentially_then_caps() {
        assert_eq!(backoff(1), FOLLOW_RESTART_BACKOFF_MIN);
        assert_eq!(backoff(2), FOLLOW_RESTART_BACKOFF_MIN * 2);
        assert_eq!(backoff(3), FOLLOW_RESTART_BACKOFF_MIN * 4);
        assert!(backoff(4) > backoff(3));
        assert_eq!(backoff(64), FOLLOW_RESTART_BACKOFF_MAX, "必须封顶");
        assert!(
            backoff(u32::MAX) <= FOLLOW_RESTART_BACKOFF_MAX,
            "极端计数不得溢出"
        );
    }

    /// 预算：`Exited{code:0}` 连发也计数，达上限即升级 Terminal（不再无限重生）。
    #[test]
    fn budget_counts_exited_zero_and_escalates_to_terminal() {
        let mut budget = AttemptBudget::new();
        for i in 1..FOLLOW_ATTEMPT_LIMIT {
            match budget.on_recoverable() {
                AttemptDecision::Retry(wait) => {
                    assert_eq!(wait, backoff(i), "第 {i} 次退避");
                }
                AttemptDecision::Exhausted => panic!("第 {i} 次不应耗尽"),
            }
        }
        assert_eq!(budget.consecutive(), FOLLOW_ATTEMPT_LIMIT - 1);
        assert_eq!(
            budget.on_recoverable(),
            AttemptDecision::Exhausted,
            "连续 {FOLLOW_ATTEMPT_LIMIT} 次可恢复失败必须升级 Terminal"
        );

        // `Exited{code:0}` 与 `Error` 一样计入（follow_resumes 对两者都返回 true）
        assert!(follow_resumes(FollowEnd::Exited { code: 0 }));
        assert!(follow_resumes(FollowEnd::Error));
    }

    #[test]
    fn skip_resume_drops_known_identity_at_last_ts() {
        let skip = ResumeSkip {
            ts: "2026-01-02 03:04:05.880".into(),
            identities: vec![(9999, 5678, "OtherTag".into(), "hello three".into())],
        };
        let dup = record("2026-01-02 03:04:05.880", 9999, 5678, "OtherTag", "hello three");
        let newer = record("2026-01-02 03:04:06.000", 1, 1, "T", "next");
        assert!(skip_resume(&skip, &dup));
        assert!(!skip_resume(&skip, &newer));
    }

    /// 空 ts 的系统行既不算「更旧」也不清跳过集：缓冲区边界必须保留（与 `resume_skip`
    /// 只认非空 ts 的取锚策略对称）。
    #[test]
    fn system_lines_bypass_resume_comparison_symmetrically() {
        let skip = ResumeSkip {
            ts: "2026-01-02 03:04:05.880".into(),
            identities: vec![(1, 1, "T".into(), "known".into())],
        };
        let boundary = system_record("--------- beginning of main");
        assert!(!skip_resume(&skip, &boundary), "系统行不得被判为重复丢弃");
        assert!(!advanced_past(&skip, &boundary), "系统行不得清掉跳过集");

        // 真正的墙钟前进才清跳过集
        let forward = record("2026-01-02 03:04:06.000", 1, 1, "T", "x");
        assert!(advanced_past(&skip, &forward));
        // 同一时刻不算前进
        let same = record("2026-01-02 03:04:05.880", 2, 2, "U", "y");
        assert!(!advanced_past(&skip, &same));
    }
}
