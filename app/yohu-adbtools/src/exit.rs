//! 关窗后的退出。主人是根取消令牌。
//!
//! 顺序：取消 → 等本进程的 adb 子进程收敛；到点仍在则强杀其进程树 → 设置 flush。
//! 不按会话调用 stop / detach。呈现表面在进程退出时拆掉，不跟投屏 stop 绑在一起。

use std::time::{Duration, Instant};

use crate::state::AppState;

/// 任务没在超时内自己收掉 adb 时，强杀进程树的上限。
pub(crate) const EXIT_JOIN: Duration = Duration::from_secs(3);

const POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProcRow {
    pub pid: u32,
    pub parent: u32,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExitStep {
    KeepWaiting,
    KillThenFlush,
    Flush,
}

/// 还有 adb 子进程就继续等；到点仍在则杀树后 flush；已经没有就直接 flush。
pub(crate) fn exit_step(adb_children_left: bool, budget_exhausted: bool) -> ExitStep {
    if !adb_children_left {
        ExitStep::Flush
    } else if budget_exhausted {
        ExitStep::KillThenFlush
    } else {
        ExitStep::KeepWaiting
    }
}

pub(crate) fn is_adb_image(name: &str) -> bool {
    let file = name.rsplit(['\\', '/']).next().unwrap_or(name);
    file.eq_ignore_ascii_case("adb.exe") || file.eq_ignore_ascii_case("adb")
}

/// 只认当前进程的直接子进程，避免杀掉机器上别的 adb。
pub(crate) fn adb_child_pids(rows: &[ProcRow], parent: u32) -> Vec<u32> {
    rows.iter()
        .filter(|row| row.parent == parent && row.pid != parent && is_adb_image(&row.name))
        .map(|row| row.pid)
        .collect()
}

#[cfg(any(test, not(windows)))]
pub(crate) fn parse_ps_row(line: &str) -> Option<ProcRow> {
    let mut parts = line.split_whitespace();
    let pid = parts.next()?.parse().ok()?;
    let parent = parts.next()?.parse().ok()?;
    let name = parts.next()?.to_string();
    Some(ProcRow { pid, parent, name })
}

/// 关窗之后调用。设置 flush 在收敛或强杀之后。
pub fn shutdown(state: &AppState) {
    state.root_cancel.cancel();
    state.present.shutdown();
    let parent = std::process::id();
    let started = Instant::now();
    tauri::async_runtime::block_on(async {
        loop {
            tokio::time::sleep(POLL).await;
            let pids = adb_child_pids(&snapshot_processes(), parent);
            match exit_step(!pids.is_empty(), started.elapsed() >= EXIT_JOIN) {
                ExitStep::KeepWaiting => {}
                ExitStep::KillThenFlush => {
                    for pid in &pids {
                        force_kill_tree(*pid);
                    }
                    tracing::warn!(n = pids.len(), "退出超时，已强杀 adb 进程树");
                    break;
                }
                ExitStep::Flush => break,
            }
        }
    });
    if let Err(e) = state.settings.save_atomic() {
        tracing::warn!("退出时保存设置失败: {e}");
    }
    crate::dnd::cleanup_stale(&state.paths.drag_out_dir());
}

fn snapshot_processes() -> Vec<ProcRow> {
    #[cfg(windows)]
    {
        windows_snapshot()
    }
    #[cfg(not(windows))]
    {
        unix_snapshot()
    }
}

/// 强杀这个直接子进程的进程树，并且等到强杀结束才返回。
/// shutdown 在这之后才 `save_atomic`。
fn force_kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // status 会等 taskkill 退出。spawn 一返回就 flush，强杀还没结束。
        match std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status()
        {
            Ok(status) if status.success() => {}
            Ok(status) => {
                tracing::warn!(pid, code = ?status.code(), "强杀 adb 进程树未成功");
            }
            Err(err) => tracing::warn!(pid, "无法执行 taskkill: {err}"),
        }
    }
    #[cfg(unix)]
    {
        // spawn 时 process_group(0)，负 pid 杀整组。组不在时再杀该 pid。
        // 信号发出后等到这个直接子进程被收尸，再返回。
        let signaled = unsafe { libc::kill(-(pid as i32), libc::SIGKILL) } == 0
            || unsafe { libc::kill(pid as i32, libc::SIGKILL) } == 0;
        if signaled {
            wait_direct_child(pid);
        } else {
            tracing::warn!(pid, "强杀 adb 进程树未成功");
        }
    }
}

#[cfg(unix)]
fn wait_direct_child(pid: u32) {
    let Ok(pid) = i32::try_from(pid) else {
        return;
    };
    if pid <= 0 {
        return;
    }
    loop {
        let waited = unsafe { libc::waitpid(pid, std::ptr::null_mut(), 0) };
        if waited >= 0 {
            return;
        }
        if std::io::Error::last_os_error().raw_os_error() != Some(libc::EINTR) {
            return;
        }
    }
}

#[cfg(windows)]
fn windows_snapshot() -> Vec<ProcRow> {
    use std::ffi::c_void;

    const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
    const MAX_PATH: usize = 260;

    #[repr(C)]
    struct ProcessEntry32W {
        size: u32,
        usage: u32,
        pid: u32,
        default_heap_id: usize,
        module_id: u32,
        threads: u32,
        parent_pid: u32,
        pri_class_base: i32,
        flags: u32,
        exe_file: [u16; MAX_PATH],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    fn invalid_snapshot() -> *mut c_void {
        -1isize as *mut c_void
    }

    fn blank_entry() -> ProcessEntry32W {
        ProcessEntry32W {
            size: std::mem::size_of::<ProcessEntry32W>() as u32,
            usage: 0,
            pid: 0,
            default_heap_id: 0,
            module_id: 0,
            threads: 0,
            parent_pid: 0,
            pri_class_base: 0,
            flags: 0,
            exe_file: [0; MAX_PATH],
        }
    }

    fn exe_name(entry: &ProcessEntry32W) -> String {
        let end = entry
            .exe_file
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(entry.exe_file.len());
        String::from_utf16_lossy(&entry.exe_file[..end])
    }

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot.is_null() || snapshot == invalid_snapshot() {
        tracing::warn!("退出时无法枚举进程，跳过 adb 强杀");
        return Vec::new();
    }
    let mut rows = Vec::new();
    let mut entry = blank_entry();
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while ok && rows.len() < 100_000 {
        rows.push(ProcRow {
            pid: entry.pid,
            parent: entry.parent_pid,
            name: exe_name(&entry),
        });
        entry = blank_entry();
        ok = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    rows
}

#[cfg(not(windows))]
fn unix_snapshot() -> Vec<ProcRow> {
    let output = match std::process::Command::new("ps")
        .args(["-ax", "-o", "pid=,ppid=,comm="])
        .output()
    {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            tracing::warn!(code = ?output.status.code(), "退出时 ps 失败，跳过 adb 强杀");
            return Vec::new();
        }
        Err(e) => {
            tracing::warn!("退出时无法枚举进程，跳过 adb 强杀: {e}");
            return Vec::new();
        }
    };
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().filter_map(parse_ps_row).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_join_is_three_seconds() {
        assert_eq!(EXIT_JOIN, Duration::from_secs(3));
    }

    #[test]
    fn no_adb_child_flushes_without_kill() {
        assert_eq!(exit_step(false, false), ExitStep::Flush);
        assert_eq!(exit_step(false, true), ExitStep::Flush);
    }

    #[test]
    fn adb_child_waits_until_budget_then_kills() {
        assert_eq!(exit_step(true, false), ExitStep::KeepWaiting);
        assert_eq!(exit_step(true, true), ExitStep::KillThenFlush);
    }

    #[test]
    fn adb_child_pids_are_direct_children_only() {
        let rows = vec![
            ProcRow {
                pid: 2,
                parent: 1,
                name: "adb.exe".into(),
            },
            ProcRow {
                pid: 3,
                parent: 1,
                name: "notepad.exe".into(),
            },
            ProcRow {
                pid: 4,
                parent: 9,
                name: r"C:\platform-tools\adb.exe".into(),
            },
            ProcRow {
                pid: 5,
                parent: 1,
                name: "ADB.EXE".into(),
            },
            ProcRow {
                pid: 1,
                parent: 1,
                name: "adb.exe".into(),
            },
            ProcRow {
                pid: 6,
                parent: 1,
                name: "/opt/homebrew/bin/adb".into(),
            },
        ];
        assert_eq!(adb_child_pids(&rows, 1), vec![2, 5, 6]);
    }

    #[test]
    fn parse_ps_row_reads_pid_parent_and_image() {
        let row = parse_ps_row("  42  7 /usr/local/bin/adb").expect("row");
        assert_eq!(row.pid, 42);
        assert_eq!(row.parent, 7);
        assert!(is_adb_image(&row.name));
    }

    #[cfg(windows)]
    #[test]
    fn snapshot_sees_current_process() {
        let rows = snapshot_processes();
        let me = std::process::id();
        assert!(
            rows.iter().any(|row| row.pid == me),
            "进程快照必须包含当前进程"
        );
    }

    struct KillOnDrop(Option<std::process::Child>);

    impl Drop for KillOnDrop {
        fn drop(&mut self) {
            let Some(mut child) = self.0.take() else {
                return;
            };
            // 已经收过尸就不要再按 pid 发信号，避免 pid 被复用后误杀。
            if let Ok(None) = child.try_wait() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn spawn_linger_child() -> std::process::Child {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            std::process::Command::new("ping")
                .args(["-n", "30", "127.0.0.1"])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .expect("启动用于强杀等待的子进程")
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::process::CommandExt;
            std::process::Command::new("sleep")
                .arg("30")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .process_group(0)
                .spawn()
                .expect("启动用于强杀等待的子进程")
        }
    }

    fn child_ended_before_return(child: &mut std::process::Child) -> bool {
        #[cfg(windows)]
        {
            matches!(child.try_wait(), Ok(Some(_)))
        }
        #[cfg(not(windows))]
        {
            match child.try_wait() {
                Err(err) => err.raw_os_error() == Some(libc::ECHILD),
                Ok(_) => false,
            }
        }
    }

    #[test]
    fn force_kill_tree_returns_after_the_child_exits() {
        let mut guard = KillOnDrop(Some(spawn_linger_child()));
        let child = guard.0.as_mut().expect("子进程");
        let pid = child.id();
        force_kill_tree(pid);
        assert!(
            child_ended_before_return(child),
            "强杀返回后子进程必须已经结束，然后才能 flush 设置"
        );
    }
}
