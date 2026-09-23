//! DeviceShell：官方 sidecar 上一条 `adb shell -T`（ADR-v6-008 补偿）。
//!
//! 只做 `open` / `exec` / `close`。SafetyRoot、`RemoteEntry`、logcat / dumpsys / push 不进本类型。
//! 关闭分类在排空 stderr 之后做（对齐 ProcessRunner stdout EOF 后再信 stderr），禁止 live snapshot。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, ChildStdout};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::error::AdbError;
use crate::parse::browse as browse_parse;
use crate::parse::offline;
use crate::parse::shell_option;
use crate::tool::ToolResolver;
use yohu_runtime::{ChildHandle, ProcessOutput, ProcessRunner, STDERR_BUDGET, STDOUT_BUDGET};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
const HANDSHAKE_LINE_LIMIT: usize = 64;
const STDERR_DRAIN: Duration = Duration::from_secs(1);

/// 长驻 shell 失败。`Unsupported` 表示无 `-T` / 非 sh，调用方回退短命令。
#[derive(Debug)]
pub enum DeviceShellError {
    Cancelled,
    Timeout,
    Unsupported,
    Failed(AdbError),
}

impl From<DeviceShellError> for AdbError {
    fn from(e: DeviceShellError) -> Self {
        match e {
            DeviceShellError::Cancelled => AdbError::Cancelled,
            DeviceShellError::Timeout => AdbError::Timeout,
            DeviceShellError::Unsupported => AdbError::UnsupportedShell,
            DeviceShellError::Failed(e) => e,
        }
    }
}

/// 关闭分类时会话处于握手还是已 Live 的 exec。
enum CloseKind {
    Handshake,
    Exec,
}

struct LiveIo {
    child: ChildHandle,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr_tail: Arc<Mutex<String>>,
    stderr_task: JoinHandle<()>,
}

/// 一条已握手的 `adb shell -T`。`exec` 失败会收割进程；调用方再 `open`。
pub struct DeviceShell {
    halt: CancellationToken,
    io: tokio::sync::Mutex<Option<LiveIo>>,
    nonce: AtomicU64,
}

impl DeviceShell {
    pub async fn open(
        tool: &ToolResolver,
        runner: &ProcessRunner,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Self, DeviceShellError> {
        let shell = Self {
            halt: CancellationToken::new(),
            io: tokio::sync::Mutex::new(None),
            nonce: AtomicU64::new(1),
        };
        let live = spawn_live(tool, runner, serial, &shell.halt, &cancel).await?;
        *shell.io.lock().await = Some(live);
        Ok(shell)
    }

    pub async fn exec(
        &self,
        inner: &str,
        timeout: Duration,
        cancel: CancellationToken,
    ) -> Result<ProcessOutput, DeviceShellError> {
        let mut io = lock_io(self, &cancel).await?;
        let live = io.as_mut().ok_or_else(|| {
            DeviceShellError::Failed(AdbError::Io(std::io::Error::other("浏览 shell 已结束")))
        })?;
        let nonce = self.nonce.fetch_add(1, Ordering::Relaxed);
        let turn = browse_parse::wrap_session_script(nonce, inner);
        match exec_turn(live, &turn, nonce, timeout, &cancel, &self.halt).await {
            Ok(out) => Ok(out),
            Err(e) => {
                let live = io.take().expect("exec 回合持有会话");
                Err(classify_close(live, e, CloseKind::Exec).await)
            }
        }
    }

    pub fn close(&self) {
        self.halt.cancel();
        if let Ok(mut io) = self.io.try_lock() {
            reap_now(&mut io);
        }
    }
}

impl Drop for DeviceShell {
    fn drop(&mut self) {
        self.close();
    }
}

async fn lock_io<'a>(
    shell: &'a DeviceShell,
    cancel: &CancellationToken,
) -> Result<tokio::sync::MutexGuard<'a, Option<LiveIo>>, DeviceShellError> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(DeviceShellError::Cancelled),
        _ = shell.halt.cancelled() => Err(DeviceShellError::Cancelled),
        guard = shell.io.lock() => Ok(guard),
    }
}

fn reap_now(io: &mut Option<LiveIo>) {
    if let Some(mut live) = io.take() {
        live.stderr_task.abort();
        live.child.kill_tree();
    }
}

async fn spawn_live(
    tool: &ToolResolver,
    runner: &ProcessRunner,
    serial: &str,
    halt: &CancellationToken,
    cancel: &CancellationToken,
) -> Result<LiveIo, DeviceShellError> {
    let adb = tool.resolve().map_err(DeviceShellError::Failed)?;
    let mut argv = Vec::new();
    if !serial.is_empty() {
        argv.push("-s".into());
        argv.push(serial.into());
    }
    argv.push("shell".into());
    argv.push("-T".into());
    let mut child = runner
        .spawn_child_piped(&adb, &argv)
        .map_err(|e| DeviceShellError::Failed(e.into()))?;
    let stdin = child.stdin.take().ok_or_else(|| {
        DeviceShellError::Failed(AdbError::Io(std::io::Error::other("浏览 shell 无 stdin")))
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        DeviceShellError::Failed(AdbError::Io(std::io::Error::other("浏览 shell 无 stdout")))
    })?;
    let stderr = child.stderr.take();
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    let stderr_task = spawn_stderr_drain(stderr, Arc::clone(&stderr_tail));
    let mut live = LiveIo {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr_tail: Arc::clone(&stderr_tail),
        stderr_task,
    };
    match handshake(&mut live, halt, cancel).await {
        Ok(()) => Ok(live),
        Err(e) => Err(classify_close(live, e, CloseKind::Handshake).await),
    }
}

fn spawn_stderr_drain(
    stderr: Option<tokio::process::ChildStderr>,
    tail: Arc<Mutex<String>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let Some(stderr) = stderr else {
            return;
        };
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf);
                    if let Ok(mut g) = tail.lock() {
                        if g.len() < STDERR_BUDGET {
                            g.push_str(&line);
                            if g.len() > STDERR_BUDGET {
                                g.truncate(STDERR_BUDGET);
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
    })
}

/// 停写 stdin，排空 stderr 泵后再分类。`close` / Drop 仍走 `reap_now`。
async fn classify_close(
    live: LiveIo,
    origin: DeviceShellError,
    kind: CloseKind,
) -> DeviceShellError {
    let LiveIo {
        mut child,
        stdin,
        stdout: _,
        stderr_tail,
        mut stderr_task,
    } = live;
    drop(stdin);
    tokio::select! {
        _ = &mut stderr_task => {}
        _ = tokio::time::sleep(STDERR_DRAIN) => {
            stderr_task.abort();
            let _ = stderr_task.await;
        }
    }
    let stderr = stderr_tail.lock().map(|s| s.clone()).unwrap_or_default();
    child.kill_tree();
    if matches!(
        origin,
        DeviceShellError::Cancelled | DeviceShellError::Timeout
    ) {
        return origin;
    }
    if offline::stderr_is_device_offline(&stderr) {
        return DeviceShellError::Failed(AdbError::DeviceOffline(stderr.trim().to_string()));
    }
    if shell_option::stderr_rejects_shell_option(&stderr) {
        return DeviceShellError::Unsupported;
    }
    if matches!(kind, CloseKind::Handshake) {
        return DeviceShellError::Unsupported;
    }
    origin
}

async fn handshake(
    live: &mut LiveIo,
    halt: &CancellationToken,
    cancel: &CancellationToken,
) -> Result<(), DeviceShellError> {
    write_stdin(&mut live.stdin, &browse_parse::handshake_script()).await?;
    let deadline = tokio::time::Instant::now() + HANDSHAKE_TIMEOUT;
    for _ in 0..HANDSHAKE_LINE_LIMIT {
        let line = read_line(live, deadline, cancel, halt, STDOUT_BUDGET).await?;
        if line == browse_parse::MARK_SHELL_READY {
            return Ok(());
        }
    }
    Err(DeviceShellError::Failed(AdbError::Io(
        std::io::Error::other("浏览 shell 握手失败"),
    )))
}

async fn exec_turn(
    live: &mut LiveIo,
    turn: &str,
    nonce: u64,
    timeout: Duration,
    cancel: &CancellationToken,
    halt: &CancellationToken,
) -> Result<ProcessOutput, DeviceShellError> {
    write_stdin(&mut live.stdin, turn).await?;
    let begin = browse_parse::begin_line(nonce);
    let deadline = tokio::time::Instant::now() + timeout;
    let mut seen_begin = false;
    let mut body = String::new();
    loop {
        let line = read_line(
            live,
            deadline,
            cancel,
            halt,
            STDOUT_BUDGET.saturating_sub(body.len()),
        )
        .await?;
        if !seen_begin {
            if line == begin {
                seen_begin = true;
            }
            continue;
        }
        if let Some(code) = browse_parse::parse_end_line(&line, nonce) {
            let stderr = live
                .stderr_tail
                .lock()
                .map(|s| s.clone())
                .unwrap_or_default();
            return Ok(ProcessOutput {
                exit_code: code,
                stdout: body,
                stderr,
            });
        }
        if body.len() + line.len() + 1 > STDOUT_BUDGET {
            return Err(DeviceShellError::Failed(AdbError::Io(
                std::io::Error::other("输出超过捕获预算"),
            )));
        }
        body.push_str(&line);
        body.push('\n');
    }
}

async fn write_stdin(stdin: &mut ChildStdin, text: &str) -> Result<(), DeviceShellError> {
    stdin
        .write_all(text.as_bytes())
        .await
        .map_err(|e| DeviceShellError::Failed(AdbError::Io(e)))?;
    stdin
        .flush()
        .await
        .map_err(|e| DeviceShellError::Failed(AdbError::Io(e)))
}

async fn read_line(
    live: &mut LiveIo,
    deadline: tokio::time::Instant,
    cancel: &CancellationToken,
    halt: &CancellationToken,
    remaining: usize,
) -> Result<String, DeviceShellError> {
    if remaining == 0 {
        return Err(DeviceShellError::Failed(AdbError::Io(
            std::io::Error::other("输出超过捕获预算"),
        )));
    }
    let mut buf = Vec::new();
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(DeviceShellError::Cancelled),
        _ = halt.cancelled() => Err(DeviceShellError::Cancelled),
        _ = tokio::time::sleep_until(deadline) => Err(DeviceShellError::Timeout),
        n = live.stdout.read_until(b'\n', &mut buf) => {
            let n = n.map_err(|e| DeviceShellError::Failed(AdbError::Io(e)))?;
            if n == 0 {
                return Err(DeviceShellError::Failed(AdbError::Io(std::io::Error::other(
                    "浏览 shell 已结束",
                ))));
            }
            if buf.len() > remaining {
                return Err(DeviceShellError::Failed(AdbError::Io(std::io::Error::other(
                    "输出超过捕获预算",
                ))));
            }
            let line = String::from_utf8_lossy(&buf);
            Ok(line.trim_end_matches(['\r', '\n']).to_string())
        }
    }
}
