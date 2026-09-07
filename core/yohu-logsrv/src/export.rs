//! 从设备环导出过滤后的 txt（需求：仅用户操作落盘，导出=过滤后缓冲快照）。

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use yohu_domain::format_log_line;
use yohu_protocol::{ExportResult, LogFilter};

use crate::capture::{CaptureService, LogError};

impl CaptureService {
    /// 把 `seq >= from_seq` 且匹配 filter 的环快照写成一份 txt。
    pub fn export(
        self: &Arc<Self>,
        serial: &str,
        from_seq: u64,
        filter: &LogFilter,
        dest: Option<&Path>,
        default_dir: Option<&Path>,
    ) -> Result<ExportResult, LogError> {
        let lines = self.ring(serial).snapshot_filtered(from_seq, filter);
        let path = resolve_dest(dest, default_dir, serial)?;
        let mut body = String::new();
        for line in &lines {
            body.push_str(&format_log_line(line));
            body.push('\n');
        }
        fs::write(&path, body)?;
        Ok(ExportResult {
            path: path.to_string_lossy().into_owned(),
            lines: lines.len() as u64,
        })
    }
}

fn resolve_dest(
    dest: Option<&Path>,
    default_dir: Option<&Path>,
    serial: &str,
) -> io::Result<PathBuf> {
    match dest {
        Some(p) if !p.as_os_str().is_empty() => {
            if let Some(parent) = p.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent)?;
                }
            }
            Ok(p.to_path_buf())
        }
        _ => {
            let dir = default_dir
                .filter(|d| !d.as_os_str().is_empty())
                .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "未指定导出目录"))?;
            fs::create_dir_all(dir)?;
            let safe: String = serial
                .chars()
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                        c
                    } else {
                        '-'
                    }
                })
                .collect();
            Ok(dir.join(format!("logcat-{safe}-{}.txt", stamp())))
        }
    }
}

fn stamp() -> String {
    let now = time::OffsetDateTime::now_local()
        .map(|t| {
            t.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default()
        })
        .unwrap_or_default();
    now.replace([':', '+'], "-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;
    use tokio_util::sync::CancellationToken;
    use yohu_adb::{AdbClient, ToolResolver};
    use yohu_protocol::{AppEvent, LogFilter, LogLine, LogScope};

    fn line(pid: u32, msg: &str) -> LogLine {
        LogLine {
            seq: 0,
            ts: "01-01 00:00:00.000".into(),
            pid,
            tid: 1,
            uid: None,
            level: 'I',
            tag: "T".into(),
            msg: msg.into(),
        }
    }

    #[test]
    fn export_writes_filtered_ring_snapshot() {
        let scratch = std::env::temp_dir().join(format!(
            "yohu-export-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let (tx, _rx) = mpsc::channel::<AppEvent>(8);
        let adb = Arc::new(AdbClient::new(
            ToolResolver::new(None, scratch.join("res"), scratch.join("data")),
            1,
        ));
        let svc = CaptureService::new(adb, tx, 100, CancellationToken::new());
        let ring = svc.ring("S1");
        ring.push(line(1, "keep"));
        ring.push(line(2, "drop"));
        ring.push(line(1, "also"));

        let out = scratch.join("out.txt");
        let filter = LogFilter {
            scope: LogScope::Pid { pid: 1 },
            ..Default::default()
        };
        let result = svc
            .export("S1", 0, &filter, Some(&out), None)
            .expect("export");
        assert_eq!(result.lines, 2);
        let text = fs::read_to_string(&out).expect("read");
        assert!(text.contains("keep"));
        assert!(text.contains("also"));
        assert!(!text.contains("drop"));
        let _ = fs::remove_dir_all(&scratch);
    }
}
