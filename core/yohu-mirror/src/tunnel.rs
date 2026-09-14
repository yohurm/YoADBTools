//! ADB reverse / forward 隧道（设备 abstract socket ↔ 本机 TCP）。

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream};
use tokio_util::sync::CancellationToken;
use yohu_adb::AdbClient;
use yohu_protocol::scrcpy;

use crate::consts::{
    ACCEPT, ADB_PUSH_MS, ADB_REMOVE_MS, ADB_STAT_MS, ADB_TUNNEL_MS, FORWARD_ATTEMPTS,
    FORWARD_DUMMY, FORWARD_RETRY, LOOPBACK_HOST, TCP_RETRY,
};
use crate::error::MirrorError;

const SERVER_EXITED_BEFORE_TUNNEL: &str = "server 在建立隧道前退出";

fn server_exited() -> MirrorError {
    MirrorError::ServerFailed(SERVER_EXITED_BEFORE_TUNNEL.into())
}

pub fn socket_name(scid: u32) -> String {
    format!("scrcpy_{scid:08x}")
}

pub fn abstract_spec(scid: u32) -> String {
    format!("localabstract:{}", socket_name(scid))
}

pub fn random_scid() -> u32 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u32)
        .unwrap_or(1);
    (nanos ^ std::process::id()).max(1) & 0x7FFF_FFFF
}

/// 预热隧道：jar 已按大小跳过 push，reverse/forward 已挂上。
pub enum WarmTunnel {
    Reverse {
        scid: u32,
        port: u16,
        listener: TcpListener,
    },
    Forward {
        scid: u32,
        port: u16,
    },
}

impl WarmTunnel {
    pub fn scid(&self) -> u32 {
        match self {
            Self::Reverse { scid, .. } | Self::Forward { scid, .. } => *scid,
        }
    }

    pub fn port(&self) -> u16 {
        match self {
            Self::Reverse { port, .. } | Self::Forward { port, .. } => *port,
        }
    }

    pub fn used_forward(&self) -> bool {
        matches!(self, Self::Forward { .. })
    }

    pub async fn drop_async(&self, adb: &AdbClient, serial: &str) {
        match self {
            Self::Forward { port, .. } => remove_forward(adb, serial, *port).await,
            Self::Reverse { scid, .. } => remove_reverse(adb, serial, *scid).await,
        }
    }

    pub async fn connect_video(
        &self,
        cancel: &CancellationToken,
        process_alive: &AtomicBool,
    ) -> Result<TcpStream, MirrorError> {
        match self {
            Self::Forward { port, .. } => {
                tracing::info!(port, "forward 连接视频通道");
                connect_forward(*port, cancel, process_alive).await
            }
            Self::Reverse { listener, .. } => {
                tracing::info!("等待 reverse 视频连接");
                accept_one(listener, cancel, ACCEPT, process_alive).await
            }
        }
    }

    pub async fn connect_control(
        &self,
        cancel: &CancellationToken,
        process_alive: &AtomicBool,
    ) -> Result<TcpStream, MirrorError> {
        match self {
            Self::Forward { port, .. } => connect_tcp(*port, cancel, ACCEPT, process_alive).await,
            Self::Reverse { listener, .. } => {
                accept_one(listener, cancel, ACCEPT, process_alive).await
            }
        }
    }
}

/// 按本地 jar 大小跳过重复 push。
pub async fn push_server_if_needed(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let local_len = match std::fs::metadata(local) {
        Ok(meta) => meta.len(),
        Err(_) => return push_server(adb, serial, local, cancel).await,
    };
    if jar_already_on_device(
        local_len,
        remote_jar_size(adb, serial, cancel.clone()).await,
    ) {
        tracing::info!(
            serial,
            size = local_len,
            "scrcpy-server 已在设备上，跳过 push"
        );
        return Ok(());
    }
    push_server(adb, serial, local, cancel).await?;
    tracing::info!(serial, size = local_len, "scrcpy-server 已 push");
    Ok(())
}

async fn remote_jar_size(adb: &AdbClient, serial: &str, cancel: CancellationToken) -> Option<u64> {
    let out = adb
        .run(
            serial,
            &[
                "shell".into(),
                format!("stat -c %s {}", scrcpy::DEVICE_SERVER_PATH),
            ],
            Some(ADB_STAT_MS),
            cancel,
        )
        .await
        .ok()?;
    if out.exit_code != 0 {
        return None;
    }
    out.stdout
        .split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
}

/// reverse 失败则唯一回退到 forward。warmup 与会话共用。
pub async fn open(
    adb: &AdbClient,
    serial: &str,
    force_forward: bool,
    cancel: CancellationToken,
) -> Result<WarmTunnel, MirrorError> {
    let scid = random_scid();
    let (listener, port) = bind_local().await?;
    if !force_forward {
        match setup_reverse(adb, serial, scid, port, cancel.clone()).await {
            Ok(()) => {
                tracing::info!(serial, scid, port, "adb reverse 已建立");
                return Ok(WarmTunnel::Reverse {
                    scid,
                    port,
                    listener,
                });
            }
            Err(e) => {
                tracing::warn!(serial, "adb reverse 失败，回退 forward: {e}");
            }
        }
    }
    drop(listener);
    setup_forward(adb, serial, scid, port, cancel).await?;
    tracing::info!(serial, scid, port, "adb forward 已建立");
    Ok(WarmTunnel::Forward { scid, port })
}

/// 预热：跳过重复 push，再 `open` 隧道。
pub async fn warmup(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    force_forward: bool,
    cancel: CancellationToken,
) -> Result<WarmTunnel, MirrorError> {
    push_server_if_needed(adb, serial, local, cancel.clone()).await?;
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }
    open(adb, serial, force_forward, cancel).await
}

/// 绑定本机环回任意端口。
pub async fn bind_local() -> Result<(TcpListener, u16), MirrorError> {
    let listener = TcpListener::bind((LOOPBACK_HOST, 0)).await?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

pub async fn setup_reverse(
    adb: &AdbClient,
    serial: &str,
    scid: u32,
    port: u16,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &["reverse".into(), abstract_spec(scid), format!("tcp:{port}")],
            Some(ADB_TUNNEL_MS),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

pub async fn setup_forward(
    adb: &AdbClient,
    serial: &str,
    scid: u32,
    port: u16,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &["forward".into(), format!("tcp:{port}"), abstract_spec(scid)],
            Some(ADB_TUNNEL_MS),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

pub async fn remove_reverse(adb: &AdbClient, serial: &str, scid: u32) {
    let _ = adb
        .run(
            serial,
            &["reverse".into(), "--remove".into(), abstract_spec(scid)],
            Some(ADB_REMOVE_MS),
            CancellationToken::new(),
        )
        .await;
}

pub async fn remove_forward(adb: &AdbClient, serial: &str, port: u16) {
    let _ = adb
        .run(
            serial,
            &["forward".into(), "--remove".into(), format!("tcp:{port}")],
            Some(ADB_REMOVE_MS),
            CancellationToken::new(),
        )
        .await;
}

pub async fn push_server(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &[
                "push".into(),
                local.to_string_lossy().into_owned(),
                scrcpy::DEVICE_SERVER_PATH.into(),
            ],
            Some(ADB_PUSH_MS),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

/// reverse：等设备连入。进程死 → ServerFailed；超时 → Protocol；取消 → Cancelled。
pub async fn accept_one(
    listener: &TcpListener,
    cancel: &CancellationToken,
    timeout: std::time::Duration,
    process_alive: &AtomicBool,
) -> Result<TcpStream, MirrorError> {
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }
    if !process_alive.load(Ordering::Relaxed) {
        return Err(server_exited());
    }
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        _ = tokio::time::sleep(timeout) => Err(MirrorError::Protocol("等待设备连接超时".into())),
        _ = async {
            while process_alive.load(Ordering::Relaxed) {
                tokio::time::sleep(FORWARD_RETRY).await;
            }
        } => Err(server_exited()),
        accepted = listener.accept() => {
            let (stream, _) = accepted?;
            let _ = stream.set_nodelay(true);
            Ok(stream)
        }
    }
}

/// forward：轮询连接本机 adb 转发端口，并读 dummy byte。
pub async fn connect_forward(
    port: u16,
    cancel: &CancellationToken,
    process_alive: &AtomicBool,
) -> Result<TcpStream, MirrorError> {
    connect_forward_loop(
        port,
        cancel,
        process_alive,
        FORWARD_ATTEMPTS,
        FORWARD_DUMMY,
        FORWARD_RETRY,
    )
    .await
}

async fn connect_forward_loop(
    port: u16,
    cancel: &CancellationToken,
    process_alive: &AtomicBool,
    attempts: u32,
    dummy_wait: Duration,
    retry: Duration,
) -> Result<TcpStream, MirrorError> {
    let addr = (LOOPBACK_HOST, port);
    for _ in 0..attempts {
        if cancel.is_cancelled() {
            return Err(MirrorError::Cancelled);
        }
        if !process_alive.load(Ordering::Relaxed) {
            return Err(server_exited());
        }
        if let Ok(mut stream) = TcpStream::connect(&addr).await {
            let _ = stream.set_nodelay(true);
            let mut dummy = [0u8; 1];
            tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(MirrorError::Cancelled),
                _ = async {
                    while process_alive.load(Ordering::Relaxed) {
                        tokio::time::sleep(TCP_RETRY).await;
                    }
                } => return Err(server_exited()),
                read = tokio::time::timeout(dummy_wait, stream.read_exact(&mut dummy)) => {
                    if let Ok(Ok(_)) = read {
                        return Ok(stream);
                    }
                }
            }
        }
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(MirrorError::Cancelled),
            _ = tokio::time::sleep(retry) => {}
        }
    }
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }
    if !process_alive.load(Ordering::Relaxed) {
        return Err(server_exited());
    }
    Err(MirrorError::Protocol("forward 隧道连接失败".into()))
}

/// forward 后续 socket（4.1 只在第一路发 dummy；控制通道不要再读那一字节）。
///
/// 必须在读设备名之前调用：server 先 `accept` 齐控制通道才 `sendDeviceMeta`。
/// 取消 → Cancelled；进程死 → ServerFailed；超时 → Protocol。
pub async fn connect_tcp(
    port: u16,
    cancel: &CancellationToken,
    timeout: std::time::Duration,
    process_alive: &AtomicBool,
) -> Result<TcpStream, MirrorError> {
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }
    if !process_alive.load(Ordering::Relaxed) {
        return Err(server_exited());
    }
    let addr = (LOOPBACK_HOST, port);
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        _ = tokio::time::sleep(timeout) => Err(MirrorError::Protocol("forward 控制通道连接失败".into())),
        _ = async {
            while process_alive.load(Ordering::Relaxed) {
                tokio::time::sleep(TCP_RETRY).await;
            }
        } => Err(server_exited()),
        stream = async {
            loop {
                if let Ok(stream) = TcpStream::connect(&addr).await {
                    let _ = stream.set_nodelay(true);
                    return stream;
                }
                tokio::time::sleep(TCP_RETRY).await;
            }
        } => Ok(stream),
    }
}

/// 本地 jar 与设备上文件大小一致则跳过 push。
pub fn jar_already_on_device(local_len: u64, remote_len: Option<u64>) -> bool {
    local_len > 0 && remote_len == Some(local_len)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn skip_push_when_sizes_match() {
        assert!(jar_already_on_device(1234, Some(1234)));
        assert!(!jar_already_on_device(1234, Some(1)));
        assert!(!jar_already_on_device(1234, None));
        assert!(!jar_already_on_device(0, Some(0)));
    }

    #[tokio::test]
    async fn accept_one_dead_process_is_server_failed() {
        let (listener, _) = bind_local().await.unwrap();
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(false);
        let err = accept_one(&listener, &cancel, ACCEPT, &alive)
            .await
            .unwrap_err();
        assert!(matches!(err, MirrorError::ServerFailed(_)));
    }

    #[tokio::test]
    async fn accept_one_timeout_is_protocol() {
        let (listener, _) = bind_local().await.unwrap();
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(true);
        let err = accept_one(&listener, &cancel, Duration::from_millis(30), &alive)
            .await
            .unwrap_err();
        assert!(matches!(err, MirrorError::Protocol(_)));
    }

    #[tokio::test]
    async fn accept_one_cancel_is_cancelled() {
        let (listener, _) = bind_local().await.unwrap();
        let cancel = CancellationToken::new();
        cancel.cancel();
        let alive = AtomicBool::new(true);
        let err = accept_one(&listener, &cancel, ACCEPT, &alive)
            .await
            .unwrap_err();
        assert!(matches!(err, MirrorError::Cancelled));
    }

    #[tokio::test]
    async fn connect_tcp_dead_process_is_server_failed() {
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(false);
        let err = connect_tcp(1, &cancel, ACCEPT, &alive).await.unwrap_err();
        assert!(matches!(err, MirrorError::ServerFailed(_)));
    }

    #[tokio::test]
    async fn connect_tcp_timeout_is_protocol() {
        let (listener, port) = bind_local().await.unwrap();
        drop(listener);
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(true);
        let err = connect_tcp(port, &cancel, Duration::from_millis(80), &alive)
            .await
            .unwrap_err();
        assert!(matches!(err, MirrorError::Protocol(_)));
    }

    #[tokio::test]
    async fn connect_tcp_cancel_is_cancelled() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        let alive = AtomicBool::new(true);
        let err = connect_tcp(1, &cancel, ACCEPT, &alive).await.unwrap_err();
        assert!(matches!(err, MirrorError::Cancelled));
    }

    #[tokio::test]
    async fn connect_forward_dead_process_is_server_failed() {
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(false);
        let err = connect_forward(1, &cancel, &alive).await.unwrap_err();
        assert!(matches!(
            err,
            MirrorError::ServerFailed(ref m) if m == SERVER_EXITED_BEFORE_TUNNEL
        ));
    }

    #[tokio::test]
    async fn connect_forward_dies_during_dummy_is_server_failed() {
        let listener = TcpListener::bind((LOOPBACK_HOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let cancel = CancellationToken::new();
        let alive = std::sync::Arc::new(AtomicBool::new(true));
        let flag = std::sync::Arc::clone(&alive);
        let hold = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            flag.store(false, Ordering::Relaxed);
            std::future::pending::<()>().await;
            drop(stream);
        });
        let err = connect_forward(port, &cancel, &alive).await.unwrap_err();
        hold.abort();
        assert!(matches!(
            err,
            MirrorError::ServerFailed(ref m) if m == SERVER_EXITED_BEFORE_TUNNEL
        ));
    }

    #[tokio::test]
    async fn connect_forward_exhausted_while_alive_is_protocol() {
        let (listener, port) = bind_local().await.unwrap();
        drop(listener);
        let cancel = CancellationToken::new();
        let alive = AtomicBool::new(true);
        let err = connect_forward_loop(
            port,
            &cancel,
            &alive,
            2,
            Duration::from_millis(20),
            Duration::from_millis(5),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, MirrorError::Protocol(_)));
    }
}
