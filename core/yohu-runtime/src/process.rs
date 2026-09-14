//! 进程管理：spawn / 输出泵 / 终止进程树。
//!
//! 高内聚：只负责宿主进程生命周期与字节流，不做 adb 语义、不返回产品 wire。
//! stdout 与 stderr 必须同时泵取，否则大输出会填满管道造成死锁。
//! 流式路径在 stdout EOF 之后仍须排空 stderr，再 `wait`；成功路径不得提前丢接收端。
//! 取消/超时时必须先松开管道再 `wait`，否则子进程堵在写满的 pipe 上退不出去。

use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const STDOUT_BUDGET: usize = 8 * 1024 * 1024;
const STDERR_BUDGET: usize = 64 * 1024;
const REAP_WAIT: Duration = Duration::from_secs(3);

/// 短命令捕获结果。非零退出码仍是 `Ok`；超时/取消/IO/截断才是 `Err`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// 宿主进程错误（不是 `AdbError`）。
#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    #[error("执行超时")]
    Timeout,
    #[error("任务已取消")]
    Cancelled,
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("执行失败(退出码 {exit_code}): {stderr}")]
    BadExit { exit_code: i32, stderr: String },
    #[error("输出超过捕获预算")]
    Truncated,
}

/// 终止整个进程树，并兜底 `start_kill` 主进程。
///
/// Windows：`taskkill /T /F`（不等待 taskkill 退出，避免堵住 tokio）。
/// Unix：子进程以新进程组启动，此处 `killpg`。
pub fn kill_tree(child: &mut Child) {
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        #[cfg(unix)]
        {
            // spawn 时 process_group(0) → 负 pid 杀整组。
            // SAFETY: pid 来自当前 Child；负 pid 对 process_group(0) 启动的组发 SIGKILL。
            let _ = unsafe { libc::kill(-(pid as i32), libc::SIGKILL) };
        }
    }
    let _ = child.start_kill();
}

async fn reap(child: &mut Child) {
    kill_tree(child);
    if tokio::time::timeout(REAP_WAIT, child.wait()).await.is_err() {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(REAP_WAIT, child.wait()).await;
    }
}

/// 长驻子进程句柄。`spawn_child` 的返回类型；可 `DerefMut` 到 [`Child`] 取管道。
pub struct ChildHandle {
    child: Child,
}

impl ChildHandle {
    fn wrap(child: Child) -> Self {
        Self { child }
    }

    pub fn pid(&self) -> Option<u32> {
        self.child.id()
    }

    pub fn kill_tree(&mut self) {
        kill_tree(&mut self.child);
    }

    pub async fn wait(&mut self) -> std::io::Result<std::process::ExitStatus> {
        self.child.wait().await
    }
}

impl Deref for ChildHandle {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.child
    }
}

impl DerefMut for ChildHandle {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.child
    }
}

/// 进程运行器（无状态）。
#[derive(Default)]
pub struct ProcessRunner;

impl ProcessRunner {
    /// 运行短命令：捕获 stdout/stderr 与退出码；`cancel` 触发进程树终止。
    pub async fn run_capture(
        &self,
        program: &Path,
        args: &[String],
        timeout: Option<Duration>,
        cancel: CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        let mut child = self.spawn(program, args)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (stdout_tx, mut stdout_rx) = mpsc::channel::<String>(128);
        let (stderr_tx, mut stderr_rx) = mpsc::channel::<String>(128);
        let mut stdout_task = spawn_bounded_pump(stdout, stdout_tx, STDOUT_BUDGET);
        let mut stderr_task = spawn_bounded_pump(stderr, stderr_tx, STDERR_BUDGET);

        let mut stdout_text = String::new();
        let mut stderr_text = String::new();
        let mut stdout_done = stdout_rx.is_closed();
        let mut stderr_done = stderr_rx.is_closed();
        let deadline = timeout.map(|t| tokio::time::Instant::now() + t);
        let out_timeout = async {
            match deadline {
                Some(d) => tokio::time::sleep_until(d).await,
                None => std::future::pending::<()>().await,
            }
        };
        let mut timeout_guard = Box::pin(out_timeout);

        loop {
            if stdout_done && stderr_done {
                break;
            }
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    drop(stdout_rx);
                    drop(stderr_rx);
                    abort_task(stdout_task.take());
                    abort_task(stderr_task.take());
                    reap(&mut child).await;
                    return Err(ProcessError::Cancelled);
                }
                _ = &mut timeout_guard => {
                    drop(stdout_rx);
                    drop(stderr_rx);
                    abort_task(stdout_task.take());
                    abort_task(stderr_task.take());
                    reap(&mut child).await;
                    return Err(ProcessError::Timeout);
                }
                result = join_pump_task(&mut stdout_task), if stdout_task.is_some() => {
                    if let Err(e) = result {
                        drop(stdout_rx);
                        drop(stderr_rx);
                        abort_task(stderr_task.take());
                        reap(&mut child).await;
                        return Err(e);
                    }
                }
                result = join_pump_task(&mut stderr_task), if stderr_task.is_some() => {
                    if let Err(e) = result {
                        drop(stdout_rx);
                        drop(stderr_rx);
                        abort_task(stdout_task.take());
                        reap(&mut child).await;
                        return Err(e);
                    }
                }
                chunk = stdout_rx.recv(), if !stdout_done => {
                    match chunk {
                        Some(c) => stdout_text.push_str(&c),
                        None => stdout_done = true,
                    }
                }
                chunk = stderr_rx.recv(), if !stderr_done => {
                    match chunk {
                        Some(c) => stderr_text.push_str(&c),
                        None => stderr_done = true,
                    }
                }
            }
        }
        if let Some(task) = stdout_task.take() {
            if let Err(e) = flatten_join(task.await) {
                reap(&mut child).await;
                return Err(e);
            }
        }
        if let Some(task) = stderr_task.take() {
            if let Err(e) = flatten_join(task.await) {
                reap(&mut child).await;
                return Err(e);
            }
        }

        let status = match deadline {
            Some(d) => match tokio::time::timeout_at(d, child.wait()).await {
                Ok(s) => s?,
                Err(_) => {
                    reap(&mut child).await;
                    return Err(ProcessError::Timeout);
                }
            },
            None => child.wait().await?,
        };

        Ok(ProcessOutput {
            exit_code: status.code().unwrap_or(-1),
            stdout: stdout_text,
            stderr: stderr_text,
        })
    }

    /// 流式命令：stdout 逐行经 `line_tx` 转发；非零退出为 [`ProcessError::BadExit`]。
    ///
    /// 计划稿曾写 `spawn_streaming`；实现名强调「跑到退出或取消」。
    /// 通路：stdout 泵行 → stdout EOF → 排空 stderr（通道关闭或取消）→ `wait`。
    /// 泵 Io/Truncated 与取消仍 fail-closed（drop 接收端 + abort + reap）。
    pub async fn run_streaming(
        &self,
        program: &Path,
        args: &[String],
        cancel: CancellationToken,
        line_tx: mpsc::Sender<String>,
    ) -> Result<i32, ProcessError> {
        let mut child = self.spawn(program, args)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (stderr_tx, mut stderr_rx) = mpsc::channel::<String>(64);
        let mut stderr_task = spawn_bounded_pump(stderr, stderr_tx, STDERR_BUDGET);
        let mut stderr_text = String::new();

        let mut stop: Option<ProcessError> = None;
        let mut stderr_done = stderr_rx.is_closed();
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        stop = Some(ProcessError::Cancelled);
                        break;
                    }
                    result = join_pump_task(&mut stderr_task), if stderr_task.is_some() => {
                        if let Err(e) = result {
                            stop = Some(e);
                            break;
                        }
                    }
                    chunk = stderr_rx.recv(), if !stderr_done => {
                        match chunk {
                            Some(c) => stderr_text.push_str(&c),
                            None => stderr_done = true,
                        }
                    }
                    line = lines.next_line() => {
                        match line {
                            Ok(Some(l)) => {
                                tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => {
                                        stop = Some(ProcessError::Cancelled);
                                    }
                                    sent = line_tx.send(l) => {
                                        if sent.is_err() {
                                            stop = Some(ProcessError::Cancelled);
                                        }
                                    }
                                }
                                if stop.is_some() {
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(e) => {
                                stop = Some(ProcessError::Io(e));
                                break;
                            }
                        }
                    }
                }
            }
        }

        if let Some(err) = stop {
            drop(stderr_rx);
            abort_task(stderr_task.take());
            reap(&mut child).await;
            return Err(err);
        }

        // stdout EOF（或无 stdout）：wait 之前继续 recv 排空 stderr。
        // 成功路径不 drop 接收端，否则泵被解开但 BadExit.stderr 丢尾巴。
        while !stderr_done {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    drop(stderr_rx);
                    abort_task(stderr_task.take());
                    reap(&mut child).await;
                    return Err(ProcessError::Cancelled);
                }
                result = join_pump_task(&mut stderr_task), if stderr_task.is_some() => {
                    if let Err(e) = result {
                        drop(stderr_rx);
                        abort_task(stderr_task.take());
                        reap(&mut child).await;
                        return Err(e);
                    }
                }
                chunk = stderr_rx.recv() => {
                    match chunk {
                        Some(c) => stderr_text.push_str(&c),
                        None => stderr_done = true,
                    }
                }
            }
        }

        let status = match stderr_task.take() {
            Some(mut task) => {
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        task.abort();
                        reap(&mut child).await;
                        return Err(ProcessError::Cancelled);
                    }
                    pump = &mut task => {
                        if let Err(e) = flatten_join(pump) {
                            reap(&mut child).await;
                            return Err(e);
                        }
                        child.wait().await?
                    }
                    waited = child.wait() => {
                        flatten_join(task.await)?;
                        waited?
                    }
                }
            }
            None => child.wait().await?,
        };
        let exit_code = status.code().unwrap_or(-1);
        if exit_code != 0 {
            return Err(ProcessError::BadExit {
                exit_code,
                stderr: stderr_text,
            });
        }
        Ok(exit_code)
    }

    /// 启动长驻子进程：不捕获退出。调用方必须泵输出并在取消时 [`ChildHandle::kill_tree`]。
    pub fn spawn_child(
        &self,
        program: &Path,
        args: &[String],
    ) -> Result<ChildHandle, ProcessError> {
        Ok(ChildHandle::wrap(self.spawn(program, args)?))
    }

    fn spawn(&self, program: &Path, args: &[String]) -> Result<Child, ProcessError> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        #[cfg(unix)]
        cmd.process_group(0);
        cmd.spawn().map_err(ProcessError::Io)
    }
}

fn spawn_bounded_pump<R>(
    reader: Option<R>,
    tx: mpsc::Sender<String>,
    max_bytes: usize,
) -> Option<JoinHandle<Result<(), ProcessError>>>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    reader.map(|r| tokio::spawn(read_lines_bounded(r, tx, max_bytes)))
}

fn abort_task(task: Option<JoinHandle<Result<(), ProcessError>>>) {
    if let Some(handle) = task {
        handle.abort();
    }
}

fn flatten_join(
    result: Result<Result<(), ProcessError>, tokio::task::JoinError>,
) -> Result<(), ProcessError> {
    match result {
        Ok(inner) => inner,
        Err(e) => Err(ProcessError::Io(std::io::Error::other(e.to_string()))),
    }
}

async fn join_pump_task(
    task: &mut Option<JoinHandle<Result<(), ProcessError>>>,
) -> Result<(), ProcessError> {
    match task.as_mut() {
        Some(handle) => {
            let result = flatten_join(handle.await);
            *task = None;
            result
        }
        None => std::future::pending().await,
    }
}

async fn read_lines_bounded<R>(
    reader: R,
    tx: mpsc::Sender<String>,
    max_bytes: usize,
) -> Result<(), ProcessError>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut budget = max_bytes;
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let mut line = line;
                line.push('\n');
                if line.len() > budget {
                    return Err(ProcessError::Truncated);
                }
                budget -= line.len();
                if tx.send(line).await.is_err() {
                    return Ok(());
                }
            }
            Ok(None) => return Ok(()),
            Err(e) => return Err(ProcessError::Io(e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[tokio::test]
    async fn read_lines_bounded_invalid_utf8_is_io() {
        let (tx, _rx) = mpsc::channel::<String>(8);
        let bytes = b"ok\n\xFF\xFE bad\n";
        let err = read_lines_bounded(Cursor::new(bytes.as_slice()), tx, 4096)
            .await
            .expect_err("非法 UTF-8 必须 Io");
        assert!(matches!(err, ProcessError::Io(_)));
    }

    #[tokio::test]
    async fn read_lines_bounded_over_budget_is_truncated() {
        let (tx, mut rx) = mpsc::channel::<String>(8);
        let bytes = b"aaaa\nbbbb\ncccc\n";
        let err = read_lines_bounded(Cursor::new(bytes.as_slice()), tx, 6)
            .await
            .expect_err("超预算必须 Truncated");
        assert!(matches!(err, ProcessError::Truncated));
        assert_eq!(rx.recv().await.as_deref(), Some("aaaa\n"));
        assert!(rx.recv().await.is_none());
    }

    #[test]
    fn process_output_holds_nonzero_as_ok_payload() {
        let out = ProcessOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "x".into(),
        };
        assert_eq!(out.exit_code, 1);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn run_streaming_cancel_reaps_ping() {
        let runner = ProcessRunner;
        let cancel = CancellationToken::new();
        let (tx, mut rx) = mpsc::channel::<String>(8);
        let cancel_run = cancel.clone();
        let join = tokio::spawn(async move {
            runner
                .run_streaming(
                    Path::new("ping"),
                    &["-t".into(), "127.0.0.1".into()],
                    cancel_run,
                    tx,
                )
                .await
        });
        let _ = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;
        cancel.cancel();
        let finished = tokio::time::timeout(Duration::from_secs(8), join)
            .await
            .expect("取消后应收回 ping，不能握着 stdout 死等 wait");
        let err = finished.expect("join streaming task");
        assert!(matches!(err, Err(ProcessError::Cancelled)));
    }

    /// stdout 先关、stderr 超过有界 channel（64）时必须排空后结束，且 BadExit 含尾巴。
    fn stderr_burst_after_stdout_close() -> (&'static Path, Vec<String>) {
        const LINES: u32 = 80;
        #[cfg(windows)]
        {
            (
                Path::new("powershell"),
                vec![
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NonInteractive".into(),
                    "-Command".into(),
                    format!(
                        "[Console]::Out.WriteLine('stdout-done'); [Console]::Out.Close(); \
                         foreach ($i in 1..{LINES}) {{ [Console]::Error.WriteLine(('stderr-line-{{0}}' -f $i)) }}; \
                         exit 7"
                    ),
                ],
            )
        }
        #[cfg(unix)]
        {
            (
                Path::new("sh"),
                vec![
                    "-c".into(),
                    format!(
                        "echo stdout-done; exec 1>&-; i=1; \
                         while [ \"$i\" -le {LINES} ]; do echo stderr-line-$i >&2; i=$((i+1)); done; \
                         exit 7"
                    ),
                ],
            )
        }
    }

    #[tokio::test]
    async fn run_streaming_drains_stderr_after_stdout_eof() {
        let runner = ProcessRunner;
        let cancel = CancellationToken::new();
        let (tx, _rx) = mpsc::channel::<String>(8);
        let (program, args) = stderr_burst_after_stdout_close();
        let result = tokio::time::timeout(
            Duration::from_secs(15),
            runner.run_streaming(program, &args, cancel, tx),
        )
        .await
        .expect("stdout EOF 后排空 stderr 必须结束，不能卡在容量 64 的 channel");

        match result {
            Err(ProcessError::BadExit { exit_code, stderr }) => {
                assert_eq!(exit_code, 7);
                assert!(
                    stderr.contains("stderr-line-80"),
                    "BadExit.stderr 必须含尾巴: {stderr:?}"
                );
                assert!(
                    stderr.contains("stderr-line-1"),
                    "排空不得丢开头: {stderr:?}"
                );
            }
            other => panic!("期望 BadExit，得到 {other:?}"),
        }
    }
}
