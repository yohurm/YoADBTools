//! 采集任务登记与日志导出：默认目录策略在此。commands 只校验在线并转发。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::state::AppState;
use yohu_logsrv::LogError;
use yohu_protocol::{CaptureStart, ExportRequest, ExportResult};

pub struct CaptureRuns {
    tasks: Mutex<HashMap<String, u32>>,
}

impl CaptureRuns {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, serial: &str, task_id: u32) {
        self.tasks
            .lock()
            .expect("capture lock poisoned")
            .insert(serial.to_string(), task_id);
    }

    fn take(&self, serial: &str) -> Option<u32> {
        self.tasks
            .lock()
            .expect("capture lock poisoned")
            .remove(serial)
    }
}

/// 调用方已鉴权。
pub async fn start(state: &AppState, serial: &str) -> Result<CaptureStart, LogError> {
    tracing::info!(serial = %serial, "log.capture.start");
    let snap = state.settings.snapshot();
    state.capture.set_ring_capacity(snap.buffer_capacity);
    let result = state
        .capture
        .start(serial, snap.clear_device_on_start)
        .await?;
    if !result.adopted {
        let task_id = state.tasks.register(
            format!("logcat 采集: {serial}"),
            format!("设备 {serial}"),
            None,
        );
        state.capture_runs.register(serial, task_id);
    }
    Ok(result)
}

pub fn finish(state: &AppState, serial: &str) {
    if let Some(task_id) = state.capture_runs.take(serial) {
        state.tasks.finish(task_id);
    }
}

pub fn default_export_dir(export_default_path: &str, fallback: PathBuf) -> PathBuf {
    if export_default_path.is_empty() {
        fallback
    } else {
        PathBuf::from(export_default_path)
    }
}

pub fn export(state: &AppState, req: ExportRequest) -> Result<ExportResult, LogError> {
    let default_dir = default_export_dir(
        &state.settings.snapshot().export_default_path,
        state.paths.exports_dir(),
    );
    let result = state.capture.export(
        &req.serial,
        req.from_seq,
        &req.filter,
        req.path.as_deref().map(std::path::Path::new),
        Some(default_dir.as_path()),
    )?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_setting_uses_fallback() {
        let dir = default_export_dir("", PathBuf::from("/exports"));
        assert_eq!(dir, PathBuf::from("/exports"));
    }

    #[test]
    fn setting_overrides_fallback() {
        let dir = default_export_dir("D:/logs", PathBuf::from("/exports"));
        assert_eq!(dir, PathBuf::from("D:/logs"));
    }
}
