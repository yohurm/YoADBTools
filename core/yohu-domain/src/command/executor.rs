//! 命令组 / 命令块编排：多设备并行、组内串行。不判定成败、不因失败中断。
//! 组条目之间无额外间隔；命令块步间可按允许的常量集等待。
//!
//! 执行能力经 [`Runner`] 端口注入（yohu-adb 实现），本层不做进程 IO —— 可单测。
//! 依赖倒置：端口与其错误类型都定义在 domain，适配层（yohu-adb）负责映射。

use std::future::Future;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::library::{CommandBlock, CommandDefinition, LibraryEntry};
use yohu_protocol::ExecOutcome;

/// 执行端口错误（domain 自有类型；适配层映射）。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RunError {
    #[error("设备掉线: {0}")]
    DeviceOffline(String),
    #[error("设备未授权")]
    Unauthorized,
    #[error("执行超时")]
    Timeout,
    #[error("已取消")]
    Cancelled,
    #[error("执行失败: {0}")]
    Adb(String),
}

/// 命令执行端口（由 yohu-adb 的 `AdbClient` 实现）。
pub trait Runner: Send + Sync + 'static {
    fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> impl Future<Output = Result<ExecOutcome, RunError>> + Send;
}

/// 共享引用自动实现端口（`Arc<AdbClient>: Runner`）。
impl<T: Runner + ?Sized> Runner for Arc<T> {
    async fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, RunError> {
        (**self).run(serial, argv, timeout_ms, cancel).await
    }
}

/// 去掉用户可能手写的前导 `adb` / `adb.exe`，避免拼成 `adb -s X adb shell …`。
pub fn strip_leading_adb(input: &str) -> &str {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 7 && trimmed[..7].eq_ignore_ascii_case("adb.exe") {
        let rest = &trimmed[7..];
        return rest.trim_start();
    }
    if bytes.len() >= 3 && trimmed[..3].eq_ignore_ascii_case("adb") {
        let rest = &trimmed[3..];
        if rest.is_empty() || rest.starts_with(char::is_whitespace) {
            return rest.trim_start();
        }
    }
    trimmed
}

/// 单命令：拆行 → 执行。只返回原始输出，不做成败判定。
pub async fn run_command<R: Runner>(
    runner: &R,
    serial: &str,
    command: &CommandDefinition,
    cancel: CancellationToken,
) -> Result<CommandRun, RunError> {
    run_line(runner, serial, &command.template, cancel).await
}

/// 自定义输入：规范化命令行后执行。
pub async fn run_line<R: Runner>(
    runner: &R,
    serial: &str,
    line: &str,
    cancel: CancellationToken,
) -> Result<CommandRun, RunError> {
    let argv = split_command_line(strip_leading_adb(line));
    let started = std::time::Instant::now();
    let outcome = runner.run(serial, argv, None, cancel).await?;
    let duration_ms = started.elapsed().as_millis() as u64;
    Ok(CommandRun {
        outcome,
        duration_ms,
    })
}

/// 单命令执行结果（原始输出）。
#[derive(Debug, Clone, PartialEq)]
pub struct CommandRun {
    pub outcome: ExecOutcome,
    pub duration_ms: u64,
}

impl CommandRun {
    pub fn into_eval_result(self) -> yohu_protocol::EvalResult {
        yohu_protocol::EvalResult {
            ok: self.outcome.exit_code == 0,
            message: String::new(),
            exit_code: self.outcome.exit_code,
            stdout: self.outcome.stdout,
            stderr: self.outcome.stderr,
            duration_ms: self.duration_ms,
        }
    }
}

/// stdout / stderr 拼成一段展示文本。
pub fn combine_output(stdout: &str, stderr: &str) -> String {
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.to_string(),
        (true, false) => stderr.to_string(),
        (false, false) => format!("{stdout}\n{stderr}"),
    }
}

/// 组执行进度事件（每命令一条）。
#[derive(Debug, Clone)]
pub struct GroupRunEvent {
    pub serial: String,
    /// 命令名（展示用）
    pub name: String,
    /// 已填充的具体命令行（不含 adb）
    pub template: String,
    /// 组内命令序号（0 起）
    pub command_index: usize,
    pub total: usize,
    /// 原始输出（stdout + stderr；执行失败则为错误文案）
    pub message: String,
    pub exit_code: i32,
    /// 单命令用时（毫秒）
    pub duration_ms: u64,
}

/// 已展开的一步（命令或命令块的一步）。`gap_after_ms` 只加在本步之后、下一步之前。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduledStep {
    pub name: String,
    pub template: String,
    pub gap_after_ms: u64,
}

impl ScheduledStep {
    pub fn from_command(command: &CommandDefinition) -> Self {
        Self {
            name: command.name.clone(),
            template: command.template.clone(),
            gap_after_ms: 0,
        }
    }
}

impl CommandBlock {
    pub fn scheduled_steps(&self) -> Vec<ScheduledStep> {
        let last = self.steps.len().saturating_sub(1);
        self.steps
            .iter()
            .enumerate()
            .map(|(index, step)| ScheduledStep {
                name: self.name.clone(),
                template: step.template.clone(),
                gap_after_ms: if index < last { self.gap_ms } else { 0 },
            })
            .collect()
    }
}

impl LibraryEntry {
    pub fn scheduled_steps(&self) -> Vec<ScheduledStep> {
        match self {
            Self::Command(command) => vec![ScheduledStep::from_command(command)],
            Self::Block(block) => block.scheduled_steps(),
        }
    }
}

impl super::library::CommandGroup {
    pub fn scheduled_steps(&self) -> Vec<ScheduledStep> {
        self.entries
            .iter()
            .flat_map(LibraryEntry::scheduled_steps)
            .collect()
    }
}

/// 组执行编排器（无状态，可复用）。
pub struct GroupExecutor<R: Runner> {
    runner: Arc<R>,
}

impl<R: Runner> GroupExecutor<R> {
    pub fn new(runner: R) -> Self {
        Self {
            runner: Arc::new(runner),
        }
    }

    /// 对每个设备并行执行已展开的步骤；设备内串行。
    /// 进度经 `progress_tx` 推送；`cancel` 取消整个运行（含间隔等待）。
    pub async fn run(
        &self,
        steps: &[ScheduledStep],
        serials: &[String],
        progress_tx: mpsc::Sender<GroupRunEvent>,
        cancel: CancellationToken,
    ) {
        let mut joins = Vec::with_capacity(serials.len());
        for serial in serials {
            let steps = steps.to_vec();
            let runner = Arc::clone(&self.runner);
            let tx = progress_tx.clone();
            let cancel = cancel.clone();
            let serial = serial.clone();
            joins.push(tokio::spawn(async move {
                let executor = GroupExecutor { runner };
                executor.run_for_device(&steps, &serial, tx, cancel).await;
            }));
        }
        for j in joins {
            let _ = j.await;
        }
    }

    async fn run_for_device(
        &self,
        steps: &[ScheduledStep],
        serial: &str,
        progress_tx: mpsc::Sender<GroupRunEvent>,
        cancel: CancellationToken,
    ) {
        let total = steps.len();
        for (index, step) in steps.iter().enumerate() {
            if cancel.is_cancelled() {
                return;
            }
            let started = std::time::Instant::now();
            let command = CommandDefinition {
                id: String::new(),
                name: step.name.clone(),
                template: step.template.clone(),
            };
            let (message, exit_code, duration_ms) =
                match run_command(&*self.runner, serial, &command, cancel.clone()).await {
                    Ok(run) => (
                        combine_output(&run.outcome.stdout, &run.outcome.stderr),
                        run.outcome.exit_code,
                        run.duration_ms,
                    ),
                    Err(e) => (
                        e.to_string(),
                        -1,
                        started.elapsed().as_millis() as u64,
                    ),
                };
            // 每条命令的组进度是结果区渲染依据（非可丢的背压类推送），必须可靠送达；
            // 若消费方通道已关闭，说明该设备运行被放弃，停止后续命令。
            if progress_tx
                .send(GroupRunEvent {
                    serial: serial.to_string(),
                    name: step.name.clone(),
                    template: step.template.clone(),
                    command_index: index,
                    total,
                    message,
                    exit_code,
                    duration_ms,
                })
                .await
                .is_err()
            {
                return;
            }
            if !wait_gap(step.gap_after_ms, &cancel).await {
                return;
            }
        }
    }
}

/// 返回 `false` 表示等待被取消。
async fn wait_gap(gap_ms: u64, cancel: &CancellationToken) -> bool {
    if gap_ms == 0 {
        return true;
    }
    tokio::select! {
        _ = cancel.cancelled() => false,
        _ = tokio::time::sleep(std::time::Duration::from_millis(gap_ms)) => true,
    }
}

/// 按引号规则拆分命令行（双引号分组、反斜杠转义双引号）。
///
/// 例：`shell "echo hello world" getprop` → `["shell", "echo hello world", "getprop"]`
pub fn split_command_line(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => in_quotes = !in_quotes,
            '\\' if chars.peek() == Some(&'"') => {
                chars.next();
                current.push('"');
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn split_plain() {
        assert_eq!(
            split_command_line("shell getprop ro.build.version"),
            vec!["shell", "getprop", "ro.build.version"]
        );
    }

    #[test]
    fn split_quoted_keeps_spaces() {
        assert_eq!(
            split_command_line(r#"shell "echo hello world" getprop"#),
            vec!["shell", "echo hello world", "getprop"]
        );
    }

    #[test]
    fn split_escaped_quote() {
        assert_eq!(split_command_line(r#"shell "a\"b""#), vec!["shell", "a\"b"]);
    }

    #[test]
    fn split_empty() {
        assert!(split_command_line("   ").is_empty());
    }

    #[test]
    fn strip_leading_adb_variants() {
        assert_eq!(strip_leading_adb("  shell ls  "), "shell ls");
        assert_eq!(strip_leading_adb("adb shell ls"), "shell ls");
        assert_eq!(strip_leading_adb("ADB.exe shell ls"), "shell ls");
        assert_eq!(strip_leading_adb("adb"), "");
        assert_eq!(strip_leading_adb("adbd"), "adbd");
    }

    struct FakeRunner {
        calls: Mutex<Vec<(String, Vec<String>)>>,
        exit_codes: Mutex<Vec<i32>>,
    }

    impl Runner for FakeRunner {
        async fn run(
            &self,
            serial: &str,
            argv: Vec<String>,
            _timeout_ms: Option<u64>,
            _cancel: CancellationToken,
        ) -> Result<ExecOutcome, RunError> {
            let code = self.exit_codes.lock().unwrap().remove(0);
            self.calls.lock().unwrap().push((serial.to_string(), argv));
            Ok(ExecOutcome {
                exit_code: code,
                stdout: format!("out-{code}"),
                stderr: String::new(),
            })
        }
    }

    fn command(id: &str, template: &str) -> CommandDefinition {
        CommandDefinition {
            id: id.into(),
            name: id.into(),
            template: template.into(),
        }
    }

    fn steps(commands: &[CommandDefinition]) -> Vec<ScheduledStep> {
        commands.iter().map(ScheduledStep::from_command).collect()
    }

    #[tokio::test]
    async fn parallel_per_device_sequential_within() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0, 0, 0, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = steps(&[command("a", "echo a"), command("b", "echo b")]);
        let (tx, mut rx) = mpsc::channel(16);

        executor
            .run(
                &group,
                &["s1".into(), "s2".into()],
                tx,
                CancellationToken::new(),
            )
            .await;

        let mut events = Vec::new();
        while let Ok(e) = rx.try_recv() {
            events.push(e);
        }
        assert_eq!(events.len(), 4);
        let calls = {
            let fake = &executor.runner;
            fake.calls.lock().unwrap().clone()
        };
        assert_eq!(calls.len(), 4);
        assert_eq!(calls.iter().filter(|c| c.0 == "s1").count(), 2);
        assert_eq!(calls.iter().filter(|c| c.0 == "s2").count(), 2);
    }

    #[tokio::test]
    async fn group_continues_after_nonzero_exit() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![1, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = steps(&[command("a", "echo a"), command("b", "echo b")]);
        let (tx, mut rx) = mpsc::channel(16);

        executor
            .run(&group, &["s1".into()], tx, CancellationToken::new())
            .await;

        let mut events = Vec::new();
        while let Ok(e) = rx.try_recv() {
            events.push(e);
        }
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].exit_code, 1);
        assert_eq!(events[1].exit_code, 0);
        assert_eq!(events[0].template, "echo a");
    }

    #[tokio::test]
    async fn cancel_stops_execution() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = steps(&[command("a", "echo a"), command("b", "echo b")]);
        let (tx, mut rx) = mpsc::channel(16);
        let cancel = CancellationToken::new();
        cancel.cancel();

        executor.run(&group, &["s1".into()], tx, cancel).await;
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn run_command_returns_raw_output() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0]),
        };
        let run = run_command(
            &runner,
            "s1",
            &command("a", "echo a"),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(run.outcome.exit_code, 0);
        assert_eq!(run.outcome.stdout, "out-0");
        let wire = run.into_eval_result();
        assert!(wire.ok);
        assert_eq!(wire.exit_code, 0);
    }

    #[tokio::test]
    async fn run_line_strips_leading_adb() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0]),
        };
        run_line(&runner, "s1", "adb shell ls", CancellationToken::new())
            .await
            .unwrap();
        let calls = runner.calls.lock().unwrap().clone();
        assert_eq!(calls[0].1, vec!["shell", "ls"]);
    }

    #[test]
    fn combine_output_joins_streams() {
        assert_eq!(combine_output("out", ""), "out");
        assert_eq!(combine_output("", "err"), "err");
        assert_eq!(combine_output("out", "err"), "out\nerr");
        assert_eq!(combine_output("", ""), "");
    }

    #[test]
    fn block_gap_sits_between_steps_only() {
        let block = CommandBlock {
            id: "b1".into(),
            name: "自检".into(),
            gap_ms: 1000,
            steps: vec![
                super::super::library::CommandStep {
                    template: "echo a".into(),
                },
                super::super::library::CommandStep {
                    template: "echo b".into(),
                },
            ],
        };
        let steps = block.scheduled_steps();
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].gap_after_ms, 1000);
        assert_eq!(steps[1].gap_after_ms, 0);
        assert_eq!(steps[0].name, "自检");
        assert_eq!(steps[1].template, "echo b");
    }

    #[tokio::test]
    async fn cancel_aborts_gap_wait() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        assert!(!wait_gap(60_000, &cancel).await);
        assert!(wait_gap(0, &CancellationToken::new()).await);
    }
}
