//! 从设备环导出过滤后的 txt（需求：仅用户操作落盘，导出=过滤后缓冲快照）。
//! 过滤走 domain `log_filter_matches`；环本身不过滤。
//!
//! 导出用例独立为 [`LogExporter`]，不再挂 `CaptureService`。流式扫环（`for_each_from`，
//! 不整环克隆 `Vec<LogLine>`），同步落盘由壳侧 `spawn_blocking` 承担。
//!
//! ## 未登记不得导出
//!
//! 「从未开始采集的窗口不得导出」是契约（`ExportRequest` 注释）。判定源是
//! [`RingStore::try_ring`]：环是否存在即「是否登记过采集」。读路径不建环，
//! 因此未登记的 serial 返回 [`LogError::WindowNotRegistered`]，不会静默写出空文件。
//!
//! ## 快照边界固定
//!
//! 入口先取一次 `through = ring.last_seq()`，`for_each_from` 只扫到它为止：
//! 导出内容因此不随导出期间的写入速率变化，`ExportResult.lines` 可复现。

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use yohu_domain::{format_log_line, log_filter_matches};
use yohu_protocol::{ExportResult, LogFilter};

use crate::capture::LogError;
use crate::ring_store::RingStore;

pub struct LogExporter;

impl LogExporter {
    /// 把 `seq >= from_seq` 且匹配 filter 的环快照写成一份 txt。
    pub fn export(
        rings: &RingStore,
        serial: &str,
        from_seq: u64,
        filter: &LogFilter,
        dest: Option<&Path>,
        default_dir: Option<&Path>,
    ) -> Result<ExportResult, LogError> {
        // 先判定登记：未登记直接失败，不猜目录、不写空文件。
        let Some(ring) = rings.try_ring(serial) else {
            return Err(LogError::WindowNotRegistered);
        };
        let path = resolve_dest(dest, default_dir, serial)?;
        let through = ring.last_seq();
        let file = fs::File::create(&path).map_err(|e| io_err(&path, e))?;
        let mut writer = io::BufWriter::new(file);
        let mut write_err: Option<io::Error> = None;
        let mut count = 0u64;
        ring.for_each_from(from_seq, through, |line| {
            if write_err.is_some() || !log_filter_matches(filter, line) {
                return;
            }
            if let Err(e) = writeln!(writer, "{}", format_log_line(line)) {
                write_err = Some(e);
                return;
            }
            count += 1;
        });
        if let Some(e) = write_err {
            return Err(io_err(&path, e));
        }
        writer.flush().map_err(|e| io_err(&path, e))?;
        Ok(ExportResult {
            path: path.to_string_lossy().into_owned(),
            lines: count,
        })
    }
}

fn make_dir(dir: &Path) -> Result<(), LogError> {
    fs::create_dir_all(dir).map_err(|e| io_err(dir, e))
}

/// 结构化分类：路径载荷给 IPC，OS 原文只进 tracing。
fn io_err(path: &Path, e: io::Error) -> LogError {
    tracing::warn!(path = %path.display(), error = %e, "日志导出写盘失败");
    LogError::ExportIo {
        path: path.display().to_string(),
    }
}

fn resolve_dest(
    dest: Option<&Path>,
    default_dir: Option<&Path>,
    serial: &str,
) -> Result<PathBuf, LogError> {
    match dest {
        Some(p) if !p.as_os_str().is_empty() => {
            if let Some(parent) = p.parent() {
                if !parent.as_os_str().is_empty() {
                    make_dir(parent)?;
                }
            }
            Ok(p.to_path_buf())
        }
        _ => {
            let dir = default_dir
                .filter(|d| !d.as_os_str().is_empty())
                .ok_or(LogError::ExportDir)?;
            make_dir(dir)?;
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
            Ok(dir.join(format!("logcat-{safe}-{}.txt", stamp()?)))
        }
    }
}

fn stamp() -> Result<String, LogError> {
    let now = time::OffsetDateTime::now_local().map_err(|_| LogError::ExportStamp)?;
    let formatted = now
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|_| LogError::ExportStamp)?;
    if formatted.is_empty() {
        return Err(LogError::ExportStamp);
    }
    Ok(formatted.replace([':', '+'], "-"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::{LogLine, LogScope};

    use crate::ring_store::RingStore;

    fn line(pid: u32, msg: &str) -> LogLine {
        LogLine {
            ts: "2026-01-01 00:00:00.000".into(),
            pid,
            tid: 1,
            level: 'I',
            tag: "T".into(),
            msg: msg.into(),
            ..LogLine::default()
        }
    }

    fn scratch(part: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "yohu-export-{part}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ))
    }

    #[test]
    fn export_writes_filtered_ring_snapshot() {
        let dir = scratch("filtered");
        let rings = RingStore::new(100);
        let ring = rings.ensure_ring("S1");
        ring.push(line(1, "keep"));
        ring.push(line(2, "drop"));
        ring.push(line(1, "also"));

        let out = dir.join("out.txt");
        let filter = LogFilter {
            scope: LogScope::Pid { pid: 1 },
            ..Default::default()
        };
        let result =
            LogExporter::export(&rings, "S1", 0, &filter, Some(&out), None).expect("export");
        assert_eq!(result.lines, 2);
        let text = fs::read_to_string(&out).expect("read");
        assert!(text.contains("keep"));
        assert!(text.contains("also"));
        assert!(!text.contains("drop"));
        let _ = fs::remove_dir_all(&dir);
    }

    /// 契约：从未开始采集的 serial 不得导出——报 `WindowNotRegistered`，且不落盘。
    #[test]
    fn unregistered_serial_is_rejected_without_writing() {
        let dir = scratch("unregistered");
        let rings = RingStore::new(100);
        let out = dir.join("out.txt");

        let err = LogExporter::export(&rings, "NEVER", 0, &LogFilter::default(), Some(&out), None)
            .expect_err("未登记必须失败");
        assert!(matches!(err, LogError::WindowNotRegistered));
        assert!(!out.exists(), "失败时不得留下空文件");
        assert!(
            rings.try_ring("NEVER").is_none(),
            "判定不得创建环（读路径无副作用）"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// 已登记但环为空（采集过又清空）：允许导出，写 0 行。
    #[test]
    fn registered_but_empty_ring_exports_zero_lines() {
        let dir = scratch("empty-registered");
        let rings = RingStore::new(100);
        rings.ensure_ring("S1").clear();
        let out = dir.join("out.txt");
        let result = LogExporter::export(&rings, "S1", 0, &LogFilter::default(), Some(&out), None)
            .expect("已登记应可导出");
        assert_eq!(result.lines, 0);
        assert!(out.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// 快照边界固定：导出只覆盖入口时刻的 `last_seq`，之后的写入不进文件。
    #[test]
    fn export_snapshot_bound_is_fixed_at_entry() {
        let dir = scratch("snapshot");
        let rings = RingStore::new(100);
        let ring = rings.ensure_ring("S1");
        for i in 0..3 {
            ring.push(line(1, &format!("before {i}")));
        }
        let out = dir.join("out.txt");
        // 通过公开入口导出：入口取 through=2，扫到 2 即止
        let result = LogExporter::export(&rings, "S1", 0, &LogFilter::default(), Some(&out), None)
            .expect("export");
        assert_eq!(result.lines, 3);

        // 导出后再写入不影响已写出的文件
        ring.push(line(1, "after"));
        let text = fs::read_to_string(&out).expect("read");
        assert!(!text.contains("after"));
        assert_eq!(text.lines().count() as u64, result.lines);

        // 再导一次才包含新行
        let out2 = dir.join("out2.txt");
        let again = LogExporter::export(&rings, "S1", 0, &LogFilter::default(), Some(&out2), None)
            .expect("export");
        assert_eq!(again.lines, 4);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_export_dir_is_not_an_io_error() {
        let rings = RingStore::new(100);
        rings.ensure_ring("S1");
        let err = LogExporter::export(&rings, "S1", 0, &LogFilter::default(), None, None)
            .unwrap_err();
        assert!(matches!(err, LogError::ExportDir));
        assert_eq!(err.to_string(), "未指定导出目录");
        assert!(!err.to_string().contains("导出失败"));
    }

    #[test]
    fn stamp_is_nonempty_filename_fragment() {
        let value = stamp().expect("本机应能取本地时间");
        assert!(!value.is_empty());
        assert!(!value.contains(':'));
    }

    #[test]
    fn export_default_name_includes_timestamp() {
        let dir = scratch("stamp");
        let rings = RingStore::new(100);
        rings.ensure_ring("S1").push(line(1, "keep"));

        let result =
            LogExporter::export(&rings, "S1", 0, &LogFilter::default(), None, Some(&dir))
                .expect("export");
        let name = Path::new(&result.path)
            .file_name()
            .expect("file name")
            .to_string_lossy();
        assert!(name.starts_with("logcat-S1-"));
        assert!(name.ends_with(".txt"));
        let stamp_part = name
            .strip_prefix("logcat-S1-")
            .and_then(|s| s.strip_suffix(".txt"))
            .expect("stamp");
        assert!(!stamp_part.is_empty(), "禁止空串时间戳文件名");
        let _ = fs::remove_dir_all(&dir);
    }
}
