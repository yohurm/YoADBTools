//! 浏览会话：未 attach 不得 list；attach 后 DeviceShell 连续两趟 list。
//! attach 之后的 list / release 按世代作用域（ADR-v6-016/033）。

use std::path::PathBuf;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, AdbError, ToolResolver};
use yohu_files::{FileBrowser, FileError};

fn fake_adb_src() -> PathBuf {
    let mut p = std::env::current_exe().expect("测试进程路径");
    p.pop();
    p.pop();
    let plain = p.join(yohu_runtime::host_bin_name("fake-adb"));
    assert!(
        plain.is_file(),
        "先执行 cargo build --workspace（fake-adb 明文 bin）"
    );
    plain
}

fn isolated_fake_adb(script: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "yohu-files-browse-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    std::fs::create_dir_all(&dir).expect("创建临时目录失败");
    let exe = dir.join(yohu_runtime::host_bin_name("fake-adb"));
    std::fs::copy(fake_adb_src(), &exe).expect("拷贝 fake-adb 失败");
    yohu_runtime::ensure_executable(&exe).expect("fake-adb 可执行位");
    std::fs::write(exe.with_extension("json"), script).expect("写脚本失败");
    exe
}

fn client(adb_exe: PathBuf) -> Arc<AdbClient> {
    Arc::new(AdbClient::new(
        ToolResolver::new(
            Some(adb_exe),
            PathBuf::from("nonexistent-resource"),
            std::env::temp_dir().join(format!("yohu-files-browse-data-{}", std::process::id())),
        ),
        4,
    ))
}

const LS_SCRIPT: &str = r#"{
    "ls": "drwxr-xr-x 2 root root 4096 2026-01-01 12:00:53.423950275 +0800 DCIM\n-rw-rw---- 1 root sdcard_rw 12 2026-01-02 08:30:07.000000000 +0800 a.txt\n"
}"#;

#[tokio::test]
async fn list_without_attach_is_not_attached() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let err = browser
        .list("S1", "/sdcard", 1, CancellationToken::new())
        .await
        .unwrap_err();
    assert!(matches!(err, FileError::NotAttached));
}

#[tokio::test]
async fn attach_then_two_lists_reuse_shell() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let attached = browser
        .attach("S1", CancellationToken::new())
        .await
        .expect("attach");
    let generation = attached.generation;
    let first = browser
        .list("S1", "/sdcard", generation, CancellationToken::new())
        .await
        .expect("第一趟");
    assert!(first.iter().any(|e| e.name == "DCIM"));
    let second = browser
        .list("S1", "/sdcard/DCIM", generation, CancellationToken::new())
        .await
        .expect("第二趟");
    assert_eq!(second.len(), first.len());
    browser.drop_workers().await;
    let third = browser
        .list("S1", "/sdcard", generation, CancellationToken::new())
        .await
        .expect("丢掉工人后槽位仍 Live");
    assert!(third.iter().any(|e| e.name == "DCIM"));
    assert!(browser.release("S1", generation).await);
    let err = browser
        .list("S1", "/sdcard", generation, CancellationToken::new())
        .await
        .unwrap_err();
    assert!(matches!(err, FileError::NotAttached));
}

#[tokio::test]
async fn list_wrong_generation_is_cancelled() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let attached = browser
        .attach("S1", CancellationToken::new())
        .await
        .expect("attach");
    let err = browser
        .list(
            "S1",
            "/sdcard",
            attached.generation.wrapping_add(1),
            CancellationToken::new(),
        )
        .await
        .unwrap_err();
    assert!(matches!(err, FileError::Adb(AdbError::Cancelled)));
}

#[tokio::test]
async fn release_stale_generation_is_noop() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let first = browser
        .attach("S1", CancellationToken::new())
        .await
        .expect("G");
    browser.detach("S1").await;
    let second = browser
        .attach("S1", CancellationToken::new())
        .await
        .expect("G2");
    assert_ne!(second.generation, first.generation);
    assert!(!browser.release("S1", first.generation).await);
    let entries = browser
        .list("S1", "/sdcard", second.generation, CancellationToken::new())
        .await
        .expect("过期 release 不得杀掉更新 Live");
    assert!(entries.iter().any(|e| e.name == "DCIM"));
}

#[tokio::test]
async fn detach_during_attach_cannot_ok_then_not_attached() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let pending = {
        let browser = browser.clone();
        tokio::spawn(async move { browser.attach("S1", CancellationToken::new()).await })
    };
    tokio::task::yield_now().await;
    browser.detach("S1").await;
    match pending.await.expect("join") {
        Ok(attached) => {
            match browser
                .list(
                    "S1",
                    "/sdcard",
                    attached.generation,
                    CancellationToken::new(),
                )
                .await
            {
                Ok(_) => {}
                Err(FileError::NotAttached) | Err(FileError::Adb(AdbError::Cancelled)) => {}
                Err(other) => {
                    panic!("attach Ok 后 list 只能是 Live / NotAttached / Cancelled: {other}")
                }
            }
        }
        Err(_) => {
            let err = browser
                .list("S1", "/sdcard", 1, CancellationToken::new())
                .await
                .unwrap_err();
            assert!(matches!(err, FileError::NotAttached));
        }
    }
}

#[tokio::test]
async fn list_after_release_during_flight_is_cancelled_or_not_attached() {
    let browser = FileBrowser::new(client(isolated_fake_adb(LS_SCRIPT)));
    let attached = browser
        .attach("S1", CancellationToken::new())
        .await
        .expect("attach");
    let generation = attached.generation;
    let pending = {
        let browser = browser.clone();
        tokio::spawn(async move {
            browser
                .list("S1", "/sdcard", generation, CancellationToken::new())
                .await
        })
    };
    browser.release("S1", generation).await;
    match pending.await.expect("join") {
        Ok(_) => {
            let err = browser
                .list("S1", "/sdcard", generation, CancellationToken::new())
                .await
                .unwrap_err();
            assert!(matches!(err, FileError::NotAttached));
        }
        Err(FileError::NotAttached) | Err(FileError::Adb(AdbError::Cancelled)) => {}
        Err(other) => panic!("在途 list 只能 Ok（随后已关）/ NotAttached / Cancelled: {other}"),
    }
}
