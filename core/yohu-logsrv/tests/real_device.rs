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
use yohu_logsrv::{CaptureService, LogExporter};
use yohu_protocol::{AppEvent, LogFilter, LogPage, LogWindowBind};

/// 真机「跟尾」用例要求环内历史超过一页（原页宽 80，故至少 81 行）。
const MIN_PAGE_LINES: usize = 81;

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
        .find(|d| yohu_domain::device_is_online(d.state))
        .map(|d| d.serial)
}

fn snapshot_lines(service: &CaptureService, serial: &str) -> Vec<yohu_protocol::LogLine> {
    service.snapshot(serial, 0, 50_000)
}

fn spawn_event_pump(
    mut rx: mpsc::Receiver<AppEvent>,
) -> (
    Arc<std::sync::Mutex<Vec<yohu_protocol::LogLine>>>,
    tokio::task::JoinHandle<()>,
) {
    let lines = Arc::new(std::sync::Mutex::new(Vec::new()));
    let collected = Arc::clone(&lines);
    let handle = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let AppEvent::LogHits(hits) = event {
                collected
                    .lock()
                    .expect("event pump")
                    .extend(hits.tail);
            }
        }
    });
    (lines, handle)
}

fn bind_follow(service: &CaptureService, serial: &str) {
    service.bind_window(LogWindowBind {
        id: 1,
        serial: serial.to_string(),
        filter: LogFilter::default(),
        from_seq: 0,
    });
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

    bind_follow(&service, &serial);
    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    assert!(service.status(&serial).capturing);

    let lines = wait_pumped_lines(&pumped, 5, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "真实 logcat 应产出日志记录");
    let ring_lines = snapshot_lines(&service, &serial);
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
    assert!(!service.status(&serial).capturing);
    assert!(
        !snapshot_lines(&service, &serial).is_empty(),
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
    bind_follow(&service, &serial);
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
        snapshot_lines(&service, &serial).is_empty(),
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
    assert!(!service.status(&serial).capturing);
    assert!(
        snapshot_lines(&service, &serial).is_empty(),
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

    bind_follow(&service, &serial);
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
    let ring = service.ring_store();
    let result = LogExporter::export(
        ring.as_ref(),
        &serial,
        0,
        &LogFilter::default(),
        Some(&out),
        None,
    )
    .expect("导出环快照");
    let content = std::fs::read_to_string(&result.path).expect("读导出文件");
    assert!(
        content.lines().count() as u64 >= result.lines,
        "导出物理行数应覆盖记录数（多行正文会更多）"
    );
    assert!(
        result.lines >= lines.len() as u64,
        "导出条数应覆盖已收到的批次"
    );

    let _ = std::fs::remove_dir_all(&root);
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}

fn assert_follow_tail(page: &LogPage) {
    let len = page.lines.len() as u64;
    assert!(len > 0, "跟尾快照应有正文");
    assert_eq!(len, page.total, "登记快照带上全部命中，滚动不再按页回环");
    assert_eq!(
        page.lines.last().map(|line| line.seq),
        page.lines.iter().map(|line| line.seq).max(),
        "快照末行是最新一条"
    );
}

async fn wait_ring_len(service: &CaptureService, serial: &str, min: usize) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    loop {
        let n = snapshot_lines(service, serial).len();
        if n >= min {
            return;
        }
        if tokio::time::Instant::now() >= deadline {
            panic!("环行数 {n} 未到 {min}");
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_restart_follow_page_is_tail() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res-tail"), scratch("data-tail")),
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
    let min = MIN_PAGE_LINES;

    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    wait_ring_len(&service, &serial, min).await;
    let first = service.bind_window(LogWindowBind {
        id: 7,
        serial: serial.clone(),
        filter: LogFilter::default(),
        from_seq: 0,
    });
    assert_follow_tail(&first);
    eprintln!("[真机] 首次跟尾 total={}", first.total);

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 超时");
    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("再开始超时")
        .expect("再开始");
    wait_ring_len(&service, &serial, min).await;
    let again = service.bind_window(LogWindowBind {
        id: 7,
        serial: serial.clone(),
        filter: LogFilter::default(),
        from_seq: 0,
    });
    assert_follow_tail(&again);
    eprintln!("[真机] 停止后再开始跟尾 total={}", again.total);

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("收尾 stop 超时");
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
}

/// 打开采集前设备已有缓冲必须保留（`clear_device_on_start` 默认关的核心行为）：
/// 先往设备缓冲写唯一标记，再以 `clear_device=false` 开始采集，环里必须收到该标记。
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_start_without_clear_keeps_existing_device_buffer() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let adb = real_adb();
    let run = |args: &[&str]| -> String {
        let out = std::process::Command::new(&adb)
            .arg("-s")
            .arg(&serial)
            .args(args)
            .output()
            .expect("运行 adb");
        assert!(
            out.status.success(),
            "adb {:?} 失败: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).into_owned()
    };

    run(&["logcat", "-c"]);
    let marker = format!("YOHU_KEEP_{}", std::process::id());
    run(&["shell", "log", "-t", "YOHU_KEEP", "-p", "i", &marker]);
    assert!(
        run(&["logcat", "-d", "-s", "YOHU_KEEP:I"]).contains(&marker),
        "标记应先存在于设备缓冲"
    );

    let (tx, rx) = mpsc::channel::<AppEvent>(128);
    let (_pumped, pump) = spawn_event_pump(rx);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );
    // 不清设备缓冲开始采集：设备里已有的「前面的日志」必须被收进环
    tokio::time::timeout(Duration::from_secs(20), service.start(&serial, false))
        .await
        .expect("start 超时")
        .expect("开始采集");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    let mut found = false;
    while tokio::time::Instant::now() < deadline {
        if snapshot_lines(&service, &serial)
            .iter()
            .any(|line| line.msg.contains(&marker))
        {
            found = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 超时");
    drop(service);
    let _ = tokio::time::timeout(Duration::from_secs(2), pump).await;
    assert!(
        found,
        "不清缓冲开始采集时，设备已有缓冲（前面的日志）必须进入环"
    );
}
