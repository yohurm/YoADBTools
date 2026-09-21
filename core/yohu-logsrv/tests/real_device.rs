//! 真实设备集成测试（第二层：yohu-logsrv 采集服务全链路）。
//!
//! 覆盖：真实 logcat 单流采集 → long 头组装 → 环形缓冲 → 批量事件；
//! 停止保留缓冲；清设备缓冲（logcat -c）后重采；设备切换清缓冲语义。
//! 无在线设备时自动跳过。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use yohu_adb::{AdbClient, ToolResolver};
use yohu_logsrv::CaptureService;
use yohu_protocol::{AppEvent, LogFilter, ReplayRequest};

fn real_adb() -> PathBuf {
    yohu_adb::repo_sidecar_adb()
}

/// 每个测试独立的临时目录（避免相对路径在 crate CWD 物化残留目录，M4）。
fn scratch(part: &str) -> PathBuf {
    std::env::temp_dir().join(format!("yohu-logsrv-test-{}-{}", std::process::id(), part))
}

async fn online_device(client: &AdbClient) -> Option<String> {
    let devices = client
        .devices(tokio_util::sync::CancellationToken::new())
        .await
        .ok()?;
    devices
        .into_iter()
        .find(|d| d.state == yohu_protocol::DeviceState::Online)
        .map(|d| d.serial)
}

fn replay_lines(service: &CaptureService, serial: &str) -> Vec<yohu_protocol::LogLine> {
    service
        .replay(ReplayRequest {
            serial: serial.to_string(),
            from_seq: 0,
            limit: 50_000,
        })
        .lines
}

fn spawn_event_pump(mut rx: mpsc::Receiver<AppEvent>) -> (Arc<std::sync::Mutex<Vec<yohu_protocol::LogLine>>>, tokio::task::JoinHandle<()>) {
    let lines = Arc::new(std::sync::Mutex::new(Vec::new()));
    let collected = Arc::clone(&lines);
    let handle = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let AppEvent::LogBatch(payload) = event {
                collected.lock().expect("event pump").extend(payload.batch.lines);
            }
        }
    });
    (lines, handle)
}

async fn wait_pumped_lines(
    lines: &Arc<std::sync::Mutex<Vec<yohu_protocol::LogLine>>>,
    min: usize,
    timeout: Duration,
) -> Vec<yohu_protocol::LogLine> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        {
            let guard = lines.lock().expect("event pump");
            if guard.len() >= min {
                return guard.clone();
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return lines.lock().expect("event pump").clone();
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_capture_stream_batch_and_ring() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };

    let (tx, rx) = mpsc::channel::<AppEvent>(128);
    let (pumped, pump) = spawn_event_pump(rx);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    assert!(service.is_capturing(&serial));

    let lines = wait_pumped_lines(&pumped, 5, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "真实 logcat 应产出日志记录");
    let ring_lines = replay_lines(&service, &serial);
    assert!(ring_lines.len() >= lines.len(), "环形缓冲应含全部批次记录");
    let sample = lines
        .iter()
        .find(|l| !l.ts.is_empty() && l.level != '?')
        .expect("应有解析成功的 logd 记录");
    eprintln!(
        "[真机] 采集 {} 条（缓冲 {}），样例: {} pid={} level={} tag={}",
        lines.len(),
        ring_lines.len(),
        sample.ts,
        sample.pid,
        sample.level,
        sample.tag
    );
    assert_eq!(
        yohu_domain::canonicalize_datetime(&sample.ts).as_deref(),
        Some(sample.ts.as_str()),
        "采集时间戳应已是统一墙钟: {}",
        sample.ts
    );
    // long 组装质量：多数记录应有时间戳与级别
    let parsed_ok = lines
        .iter()
        .filter(|l| !l.ts.is_empty() && l.level != '?')
        .count();
    assert!(
        parsed_ok * 10 >= lines.len() * 8,
        "解析质量不足: {parsed_ok}/{}",
        lines.len()
    );

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    assert!(!service.is_capturing(&serial));
    assert!(
        !replay_lines(&service, &serial).is_empty(),
        "停止后缓冲保留"
    );
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_capture_with_clear_device() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, rx) = mpsc::channel::<AppEvent>(128);
    let (pumped, pump) = spawn_event_pump(rx);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    // 开采前 logcat -c：start(clear_device=true) 内部执行
    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, true))
        .await
        .expect("start 超时")
        .expect("开始采集（先清设备缓冲）");
    let lines = wait_pumped_lines(&pumped, 3, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "清缓冲后仍应采集到新日志");
    eprintln!("[真机] 清缓冲重采 {} 条", lines.len());

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    service.clear(&serial);
    assert!(
        replay_lines(&service, &serial).is_empty(),
        "clear 后缓冲为空"
    );
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_detach_clears_ring() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, rx) = mpsc::channel::<AppEvent>(128);
    let (_pumped, pump) = spawn_event_pump(rx);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    tokio::time::sleep(Duration::from_secs(3)).await;
    tokio::time::timeout(Duration::from_secs(15), service.detach_device(&serial))
        .await
        .expect("detach 应在杀进程树后返回，不能握着 logcat 管道死等");
    assert!(!service.is_capturing(&serial));
    assert!(
        replay_lines(&service, &serial).is_empty(),
        "切换/掉线清缓冲（防串设备）"
    );
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}

/// 导出：采集后从环过滤快照写 txt，条数与环一致。
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_export_filtered_ring_snapshot() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res2"), scratch("data2")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, rx) = mpsc::channel::<AppEvent>(128);
    let (pumped, pump) = spawn_event_pump(rx);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    let lines = wait_pumped_lines(&pumped, 5, Duration::from_secs(30)).await;
    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    assert!(!lines.is_empty(), "真实设备应产出至少一条");

    let root = std::env::temp_dir().join(format!(
        "yohu-real-export-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let out = root.join("out.txt");
    let result = service
        .export(&serial, 0, &LogFilter::default(), Some(&out), None)
        .expect("导出环快照");
    let content = std::fs::read_to_string(&result.path).expect("读导出文件");
    assert_eq!(content.lines().count() as u64, result.lines);
    assert!(
        result.lines >= lines.len() as u64,
        "导出条数应覆盖已收到的批次"
    );

    let _ = std::fs::remove_dir_all(&root);
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}
