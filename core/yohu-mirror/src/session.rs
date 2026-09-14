//! 单设备投屏会话编排：push → 隧道 → app_process → 握手 → 解复用。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use yohu_adb::AdbClient;
use yohu_runtime::ChildHandle;

use crate::argv;
use crate::consts::{KILL_WAIT, SERVER_LOG_CAP};
use crate::control::{self, ControlCmd};
use crate::emit;
use crate::error::MirrorError;
use crate::frame::FramePipe;
use crate::pump;
use crate::tunnel::{self, WarmTunnel};

/// 壳展开后的会话参数（不进 UI IPC）。
#[derive(Debug, Clone)]
pub struct MirrorSessionRequest {
    pub serial: String,
    pub control: bool,
    pub force_forward: bool,
    pub max_size: u32,
    pub video_bit_rate: u32,
    pub max_fps: u32,
    pub video_codec: String,
}

pub struct SessionOpts {
    pub req: MirrorSessionRequest,
    pub server_path: PathBuf,
    pub frames: Arc<FramePipe>,
    pub warm: Option<WarmTunnel>,
}

fn drain_child_logs(child: &mut ChildHandle, serial: String, logs: Arc<Mutex<String>>) {
    if let Some(out) = child.stdout.take() {
        let logs = Arc::clone(&logs);
        let serial = serial.clone();
        tokio::spawn(async move {
            pump_text(out, serial, logs).await;
        });
    }
    if let Some(err) = child.stderr.take() {
        let logs = Arc::clone(&logs);
        tokio::spawn(async move {
            pump_text(err, serial, logs).await;
        });
    }
}

async fn pump_text<R>(reader: R, serial: String, logs: Arc<Mutex<String>>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    use tokio::io::AsyncBufReadExt;
    let mut lines = tokio::io::BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        tracing::info!(serial = %serial, "scrcpy-server {line}");
        let mut buf = logs.lock().expect("mirror log lock poisoned");
        if buf.len() > SERVER_LOG_CAP {
            continue;
        }
        buf.push_str(&line);
        buf.push('\n');
    }
}

fn snapshot_logs(logs: &Arc<Mutex<String>>) -> String {
    logs.lock()
        .expect("mirror log lock poisoned")
        .trim()
        .to_string()
}

async fn wait_kill(child: &mut ChildHandle) {
    tokio::select! {
        _ = child.wait() => {}
        _ = tokio::time::sleep(KILL_WAIT) => {
            child.kill_tree();
            let _ = child.wait().await;
        }
    }
}

/// 跑完一条投屏直到取消或流结束。进入 Live 后调用 `on_live`。
///
/// `cancel` 是**本次 attempt** 令牌（由槽位 token 的 `child_token()` 传入）。
/// 结束只取消本次 attempt；代际 `FramePipe` 与槽位 token 由 `MirrorService` 收。
pub async fn run_session(
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<yohu_protocol::AppEvent>,
    cancel: CancellationToken,
    generation: u64,
    mut opts: SessionOpts,
    control_rx: mpsc::Receiver<ControlCmd>,
    on_live: impl FnOnce(),
) -> Result<(), MirrorError> {
    let result = run_attempt(
        adb,
        sink,
        cancel.clone(),
        generation,
        &mut opts,
        control_rx,
        on_live,
    )
    .await;
    cancel.cancel();
    result
}

async fn run_attempt(
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<yohu_protocol::AppEvent>,
    cancel: CancellationToken,
    generation: u64,
    opts: &mut SessionOpts,
    control_rx: mpsc::Receiver<ControlCmd>,
    on_live: impl FnOnce(),
) -> Result<(), MirrorError> {
    let serial = opts.req.serial.clone();
    let started = Instant::now();
    tracing::info!(
        serial = %serial,
        generation,
        control = opts.req.control,
        force_forward = opts.req.force_forward,
        max_size = opts.req.max_size,
        bit_rate = opts.req.video_bit_rate,
        max_fps = opts.req.max_fps,
        server = %opts.server_path.display(),
        "投屏会话开始"
    );

    let reused = opts.warm.take();
    if let Some(warm) = reused.as_ref() {
        tracing::info!(
            serial = %serial,
            scid = warm.scid(),
            port = warm.port(),
            used_forward = warm.used_forward(),
            elapsed_ms = started.elapsed().as_millis() as u64,
            "复用预热隧道"
        );
    }

    if !opts.server_path.is_file() {
        tracing::error!(
            serial = %serial,
            path = %opts.server_path.display(),
            "缺少 scrcpy-server"
        );
        drop_taken(reused, &adb, &serial).await;
        return Err(MirrorError::ServerMissing(
            opts.server_path.display().to_string(),
        ));
    }
    match crate::codec::VideoCodec::from_name(&opts.req.video_codec) {
        Ok(codec) => opts.req.video_codec = codec.name().to_string(),
        Err(e) => {
            drop_taken(reused, &adb, &serial).await;
            return Err(e);
        }
    }

    if let Err(e) =
        tunnel::push_server_if_needed(&adb, &serial, &opts.server_path, cancel.clone()).await
    {
        drop_taken(reused, &adb, &serial).await;
        return Err(e);
    }
    tracing::info!(
        serial = %serial,
        elapsed_ms = started.elapsed().as_millis() as u64,
        "server jar 已就绪"
    );
    if cancel.is_cancelled() {
        drop_taken(reused, &adb, &serial).await;
        return Err(MirrorError::Cancelled);
    }

    let tunnel = match reused {
        Some(warm) => warm,
        None => tunnel::open(&adb, &serial, opts.req.force_forward, cancel.clone()).await?,
    };

    let argv = argv::server_argv(&opts.req, tunnel.scid(), tunnel.used_forward());
    tracing::info!(
        serial = %serial,
        forward = tunnel.used_forward(),
        elapsed_ms = started.elapsed().as_millis() as u64,
        "启动 app_process"
    );
    let mut child = match adb.spawn_long_lived(&serial, &argv) {
        Ok(c) => c,
        Err(e) => {
            tunnel.drop_async(&adb, &serial).await;
            return Err(e.into());
        }
    };
    let logs = Arc::new(Mutex::new(String::new()));
    drain_child_logs(&mut child, serial.clone(), Arc::clone(&logs));
    let alive = Arc::new(AtomicBool::new(true));

    let wait_alive = Arc::clone(&alive);
    let wait_cancel = cancel.clone();
    let wait_task = tokio::spawn(async move {
        tokio::select! {
            _ = wait_cancel.cancelled() => {}
            _ = child.wait() => {
                wait_alive.store(false, Ordering::Relaxed);
            }
        }
        if wait_cancel.is_cancelled() {
            child.kill_tree();
            wait_kill(&mut child).await;
        }
        wait_alive.store(false, Ordering::Relaxed);
    });

    let result = run_after_spawn(AfterSpawn {
        tunnel: &tunnel,
        cancel: &cancel,
        alive: &alive,
        opts,
        generation,
        started,
        sink,
        control_rx,
        on_live,
    })
    .await;

    cancel.cancel();
    let _ = wait_task.await;

    tunnel.drop_async(&adb, &serial).await;
    let server_logs = snapshot_logs(&logs);
    if !server_logs.is_empty() {
        tracing::info!(serial = %serial, generation, "scrcpy-server 输出:\n{server_logs}");
    }

    match &result {
        Ok(()) => tracing::info!(serial = %serial, generation, "投屏会话正常结束"),
        Err(MirrorError::Cancelled) => {
            tracing::info!(serial = %serial, generation, "投屏会话取消")
        }
        Err(e) => tracing::error!(serial = %serial, generation, error = %e, "投屏会话失败"),
    }
    result
}

async fn drop_taken(warm: Option<WarmTunnel>, adb: &AdbClient, serial: &str) {
    if let Some(warm) = warm {
        warm.drop_async(adb, serial).await;
    }
}

struct AfterSpawn<'a, F> {
    tunnel: &'a WarmTunnel,
    cancel: &'a CancellationToken,
    alive: &'a Arc<AtomicBool>,
    opts: &'a SessionOpts,
    generation: u64,
    started: Instant,
    sink: mpsc::Sender<yohu_protocol::AppEvent>,
    control_rx: mpsc::Receiver<ControlCmd>,
    on_live: F,
}

async fn run_after_spawn<F: FnOnce()>(ctx: AfterSpawn<'_, F>) -> Result<(), MirrorError> {
    let serial = ctx.opts.req.serial.clone();
    let control_wanted = ctx.opts.req.control;

    // scrcpy 4.1：server 先 accept 齐 video（+audio）+control，才 sendDeviceMeta。
    let mut video = ctx.tunnel.connect_video(ctx.cancel, ctx.alive).await?;
    tracing::info!(
        serial = %serial,
        elapsed_ms = ctx.started.elapsed().as_millis() as u64,
        "视频通道已接通"
    );

    let mut control_stream = if control_wanted {
        tracing::info!(serial = %serial, "连接控制通道");
        let stream = ctx.tunnel.connect_control(ctx.cancel, ctx.alive).await?;
        tracing::info!(serial = %serial, "控制通道已接通");
        Some(stream)
    } else {
        None
    };

    let handshake = pump::read_handshake(&mut video, ctx.cancel).await?;
    if let Some(stream) = control_stream.as_mut() {
        control::write_display_power(stream, true, ctx.cancel).await?;
    }

    tracing::info!(
        serial = %serial,
        codec = handshake.codec.name(),
        width = handshake.width,
        height = handshake.height,
        control = control_wanted,
        elapsed_ms = ctx.started.elapsed().as_millis() as u64,
        "投屏 Live"
    );
    (ctx.on_live)();
    emit::emit_live(
        &ctx.sink,
        &serial,
        ctx.generation,
        handshake.width,
        handshake.height,
        handshake.codec.name(),
        control_wanted,
    )
    .await;

    if let Some(stream) = control_stream.take() {
        let (read_half, write_half) = stream.into_split();
        tokio::spawn(control::drain_control_reads(read_half, ctx.cancel.clone()));
        tokio::spawn(control::drive_writes(
            write_half,
            ctx.control_rx,
            ctx.cancel.clone(),
        ));
    }

    pump::MediaLoop {
        video,
        frames: Arc::clone(&ctx.opts.frames),
        sink: ctx.sink,
        serial,
        generation: ctx.generation,
        handshake,
        control: control_wanted,
        cancel: ctx.cancel.clone(),
        started: ctx.started,
    }
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::PIPE_H264;
    use crate::frame::EncodedFrame;
    use yohu_adb::ToolResolver;

    fn dummy_adb() -> Arc<AdbClient> {
        Arc::new(AdbClient::new(
            ToolResolver::new(
                None,
                std::env::temp_dir().join("yohu-mirror-session-res"),
                std::env::temp_dir().join("yohu-mirror-session-data"),
            ),
            1,
        ))
    }

    fn test_frame() -> EncodedFrame {
        EncodedFrame {
            generation: 1,
            width: 8,
            height: 8,
            config: true,
            keyframe: false,
            pts: 1,
            codec: PIPE_H264,
            payload: vec![1],
            dropped: 0,
        }
    }

    fn pipe_open(frames: &FramePipe) -> bool {
        frames.push(test_frame());
        frames.try_recv().is_some()
    }

    #[tokio::test]
    async fn attempt_end_does_not_cancel_slot_or_close_generation_pipe() {
        let slot = CancellationToken::new();
        let frames = FramePipe::new();
        let attempt = slot.child_token();
        let (sink, _rx) = mpsc::channel(1);
        let (_ctrl_tx, ctrl_rx) = mpsc::channel(1);
        let err = run_session(
            dummy_adb(),
            sink,
            attempt.clone(),
            1,
            SessionOpts {
                req: MirrorSessionRequest {
                    serial: "S1".into(),
                    control: true,
                    force_forward: false,
                    max_size: 0,
                    video_bit_rate: 1,
                    max_fps: 0,
                    video_codec: "h265".into(),
                },
                server_path: PathBuf::from("missing-scrcpy-server"),
                frames: Arc::clone(&frames),
                warm: Some(WarmTunnel::Forward { scid: 1, port: 2 }),
            },
            ctrl_rx,
            || {},
        )
        .await
        .expect_err("missing server");
        assert!(matches!(err, MirrorError::ServerMissing(_)));
        assert!(attempt.is_cancelled());
        assert!(!slot.is_cancelled());
        assert!(pipe_open(&frames));
    }
}
