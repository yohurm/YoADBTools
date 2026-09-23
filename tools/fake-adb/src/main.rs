//! 脚本化假 adb：按脚本文件模拟 `adb` CLI 行为，供 core 集成测试使用。
//!
//! **零共享状态设计**（并行测试安全）：脚本文件 = 本 exe 同目录下同名 `.json`
//! （每个测试把自己的 exe 副本放进独立临时目录 → 天然隔离）。
//!
//! 脚本 JSON：
//! ```json
//! {
//!   "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1"],
//!   "logcat_lines": ["[ 2026-01-02 03:04:05.678  1000: 1234: 5678 I/TestTag ]", "hello"],
//!   "logcat_delay_ms": 10,
//!   "logcat_forever": false,
//!   "logcat_exit_code": 0,
//!   "logcat_stderr": "",
//!   "ps": "PID NAME\n1234 com.test.app\n",
//!   "packages": "package:com.test.app\npackage:com.idle.app\n",
//!   "ls": "drwxr-xr-x 2 root root 4096 2026-01-01 12:00:53.423950275 +0800 DCIM\n",
//!   "shell_t_reject_after_stdout": false,
//!   "shell_no_ready": false
//! }
//! ```

use std::io::{BufRead, Write};
use std::time::Duration;

#[derive(serde::Deserialize, Default)]
struct Script {
    #[serde(default)]
    devices: Vec<String>,
    /// devices 分支退出码（默认 0；模拟损坏 adb 时用非 0）
    #[serde(default)]
    devices_exit_code: i32,
    #[serde(default)]
    devices_stderr: String,
    #[serde(default)]
    logcat_lines: Vec<String>,
    #[serde(default = "default_delay")]
    logcat_delay_ms: u64,
    #[serde(default)]
    logcat_forever: bool,
    #[serde(default)]
    logcat_exit_code: i32,
    #[serde(default)]
    logcat_stderr: String,
    #[serde(default)]
    ps: String,
    #[serde(default)]
    packages: String,
    #[serde(default)]
    ls: String,
    /// 交互 `shell -T`：关 stdout → 延迟 → stderr 写 `unknown option -T` → 退出。
    #[serde(default)]
    shell_t_reject_after_stdout: bool,
    /// 交互 shell：不打印 READY，直接退出（非 sh）。
    #[serde(default)]
    shell_no_ready: bool,
}

const SHELL_T_REJECT_DELAY: Duration = Duration::from_millis(200);

fn default_delay() -> u64 {
    10
}

fn reject_shell_t_after_stdout() -> ! {
    close_stdout_fd();
    std::thread::sleep(SHELL_T_REJECT_DELAY);
    eprintln!("unknown option -T");
    let _ = std::io::stderr().flush();
    std::process::exit(1);
}

fn close_stdout_fd() {
    #[cfg(windows)]
    {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        let stdout = std::io::stdout();
        let raw = stdout.as_raw_handle();
        // SAFETY: 本 fixture 主动关 STDOUT，让父进程在本进程写 stderr 之前见到 EOF。
        let _owned = unsafe { OwnedHandle::from_raw_handle(raw) };
    }
    #[cfg(unix)]
    {
        use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
        let stdout = std::io::stdout();
        let raw = stdout.as_raw_fd();
        // SAFETY: 同上，把 fd 1 交给 OwnedFd 在 drop 时 close。
        let _owned = unsafe { OwnedFd::from_raw_fd(raw) };
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let exe = std::env::current_exe().expect("无法获取自身路径");
    let script_path = exe.with_extension("json");
    let text = std::fs::read_to_string(&script_path)
        .unwrap_or_else(|_| panic!("脚本文件不存在: {}", script_path.display()));
    let script: Script = serde_json::from_str(&text).expect("脚本 JSON 无效");

    let joined = args.join(" ");
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    if is_interactive_shell(&args) {
        if script.shell_t_reject_after_stdout {
            let _ = out.flush();
            drop(out);
            drop(stdout);
            reject_shell_t_after_stdout();
        }
        if script.shell_no_ready {
            return;
        }
        run_interactive_shell(&script, &mut out);
        return;
    }

    if args.first().map(|s| s.as_str()) == Some("devices") {
        if !script.devices_stderr.is_empty() {
            eprintln!("{}", script.devices_stderr);
        }
        writeln!(out, "List of devices attached").ok();
        for device in &script.devices {
            writeln!(out, "{device}").ok();
        }
        out.flush().ok();
        std::process::exit(script.devices_exit_code);
    }

    if joined.contains("logcat -c") {
        std::process::exit(0);
    }

    if joined.contains("logcat") {
        if !script.logcat_stderr.is_empty() {
            eprintln!("{}", script.logcat_stderr);
        }
        for line in &script.logcat_lines {
            writeln!(out, "{line}").ok();
            out.flush().ok();
            std::thread::sleep(Duration::from_millis(script.logcat_delay_ms));
        }
        if script.logcat_forever {
            loop {
                std::thread::sleep(Duration::from_secs(1));
            }
        }
        std::process::exit(script.logcat_exit_code);
    }

    if joined.contains("shell ps") {
        write!(out, "{}", script.ps).ok();
        out.flush().ok();
        std::process::exit(0);
    }

    if joined.contains("list packages") {
        write!(out, "{}", script.packages).ok();
        out.flush().ok();
        std::process::exit(0);
    }

    if joined.contains("shell ls") || joined.contains("ls -lla") || joined.contains("__YOHU_BROWSE") {
        write_browse_payload(&mut out, &script.ls);
        out.flush().ok();
        std::process::exit(0);
    }

    if joined.contains("push") || joined.contains("pull") {
        writeln!(out, "file: 1 file pushed. (123 bytes in 0.001s)").ok();
        out.flush().ok();
        std::process::exit(0);
    }

    // 未知命令：静默成功
    std::process::exit(0);
}

fn is_interactive_shell(args: &[String]) -> bool {
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-s" => i += 2,
            "shell" => {
                let rest = &args[i + 1..];
                return rest.iter().all(|a| a.starts_with('-') && a != "-c");
            }
            _ => i += 1,
        }
    }
    false
}

fn write_browse_payload(out: &mut impl Write, ls: &str) {
    writeln!(out, "__YOHU_BROWSE_RES__").ok();
    writeln!(out, "/sdcard").ok();
    writeln!(out, "__YOHU_BROWSE_REM__").ok();
    writeln!(out).ok();
    writeln!(out, "__YOHU_BROWSE_LS__").ok();
    write!(out, "{ls}").ok();
    if !ls.ends_with('\n') && !ls.is_empty() {
        writeln!(out).ok();
    }
}

fn extract_nonce(line: &str, kind: &str) -> Option<u64> {
    let needle = format!("__YOHU_{kind}_");
    let idx = line.find(&needle)?;
    let rest = &line[idx + needle.len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn run_interactive_shell(script: &Script, out: &mut impl Write) {
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let mut line = String::new();
    loop {
        line.clear();
        match input.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        if line.contains("__YOHU_SHELL_READY__") && line.contains("printf") {
            writeln!(out, "__YOHU_SHELL_READY__").ok();
            out.flush().ok();
            continue;
        }
        if let Some(nonce) = extract_nonce(&line, "BEGIN") {
            if line.contains("printf") {
                writeln!(out, "__YOHU_BEGIN_{nonce}__").ok();
                write_browse_payload(out, &script.ls);
                writeln!(out, "__YOHU_END_{nonce}__ 0").ok();
                out.flush().ok();
            }
        }
    }
}
