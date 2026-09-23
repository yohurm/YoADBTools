//! 长驻 DeviceShell：fake-adb `shell -T` 握手后连续两趟 exec 都有条目。

use std::path::PathBuf;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, DeviceShellError, ToolResolver};

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
        "yohu-browse-{}-{:?}",
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

fn tool(adb_exe: PathBuf) -> ToolResolver {
    ToolResolver::new(
        Some(adb_exe),
        PathBuf::from("nonexistent-resource"),
        std::env::temp_dir().join(format!("yohu-browse-data-{}", std::process::id())),
    )
}

const LS_SCRIPT: &str = r#"{
    "ls": "drwxr-xr-x 2 root root 4096 2026-01-01 12:00:53.423950275 +0800 DCIM\n-rw-rw---- 1 root sdcard_rw 12 2026-01-02 08:30:07.000000000 +0800 a.txt\n"
}"#;

#[tokio::test]
async fn device_shell_reuses_interactive_shell() {
    let client = AdbClient::new(tool(isolated_fake_adb(LS_SCRIPT)), 4);
    let shell = client
        .open_device_shell("S1", CancellationToken::new())
        .await
        .expect("握手");
    let script = AdbClient::browse_list_script("/sdcard");
    let timeout = Duration::from_secs(20);
    let first = shell
        .exec(&script, timeout, CancellationToken::new())
        .await
        .expect("第一趟");
    let raw = AdbClient::parse_browse_list(&first.stdout, first.exit_code, &first.stderr)
        .expect("解析第一趟");
    assert_eq!(raw.resolved, "/sdcard");
    assert_eq!(raw.entries.len(), 2);
    assert_eq!(raw.entries[0].name, "DCIM");

    let script2 = AdbClient::browse_list_script("/sdcard/DCIM");
    let second = shell
        .exec(&script2, timeout, CancellationToken::new())
        .await
        .expect("第二趟必须复用同一会话");
    let raw2 = AdbClient::parse_browse_list(&second.stdout, second.exit_code, &second.stderr)
        .expect("解析第二趟");
    assert_eq!(raw2.entries.len(), 2);
}

const REJECT_T_AFTER_STDOUT: &str = r#"{
    "shell_t_reject_after_stdout": true
}"#;

const NO_READY_SCRIPT: &str = r#"{
    "shell_no_ready": true
}"#;

#[tokio::test]
async fn device_shell_open_unsupported_when_t_rejected_after_stdout_eof() {
    let client = AdbClient::new(tool(isolated_fake_adb(REJECT_T_AFTER_STDOUT)), 4);
    let opened = tokio::time::timeout(
        Duration::from_secs(8),
        client.open_device_shell("S1", CancellationToken::new()),
    )
    .await
    .expect("延迟 stderr 后 open 必须结束");
    match opened {
        Err(DeviceShellError::Unsupported) => {}
        Err(e) => {
            panic!("stdout EOF 后延迟的 unknown option -T 必须 Unsupported，不能塌成 Io: {e:?}")
        }
        Ok(_) => panic!("host 拒绝 -T 必须失败"),
    }
}

#[tokio::test]
async fn device_shell_open_unsupported_when_handshake_never_ready() {
    let client = AdbClient::new(tool(isolated_fake_adb(NO_READY_SCRIPT)), 4);
    let opened = tokio::time::timeout(
        Duration::from_secs(8),
        client.open_device_shell("S1", CancellationToken::new()),
    )
    .await
    .expect("非 sh 退出后 open 必须结束");
    match opened {
        Err(DeviceShellError::Unsupported) => {}
        Err(e) => panic!("握手从未 READY 且无 option 文案必须 Unsupported: {e:?}"),
        Ok(_) => panic!("未见 READY 必须失败"),
    }
}

#[tokio::test]
async fn browse_list_oneshot_still_parses() {
    let client = AdbClient::new(tool(isolated_fake_adb(LS_SCRIPT)), 4);
    let raw = client
        .browse_list("S1", "/sdcard", CancellationToken::new())
        .await
        .expect("oneshot 也应 list");
    assert!(raw.entries.iter().any(|e| e.name == "DCIM"));
}
