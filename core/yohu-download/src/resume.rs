//! Range 续传决策（206 追加 / 200 整包重来 / 416 删 part）与 `.part` 路径。

use std::path::{Path, PathBuf};

use crate::error::DownloadError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeAction {
    Fresh,
    AppendFrom(u64),
}

/// 根据已有字节和 HTTP 状态决定写盘策略。尚无 part 时只有 2xx 可以整包重写。
pub fn resume_plan(have: u64, status: u16) -> Result<ResumeAction, DownloadError> {
    if have == 0 {
        return if (200..300).contains(&status) {
            Ok(ResumeAction::Fresh)
        } else {
            Err(DownloadError::Http(status))
        };
    }
    if status == 206 {
        return Ok(ResumeAction::AppendFrom(have));
    }
    if status == 200 {
        return Ok(ResumeAction::Fresh);
    }
    if status == 416 {
        return Err(DownloadError::SizeMismatch);
    }
    Err(DownloadError::Http(status))
}

/// 未完成下载的旁路文件：`{文件名}.part`。无文件名时沿用 `file.part.part`。
pub(crate) fn partial_path(dest: &Path) -> PathBuf {
    dest.with_file_name(format!(
        "{}.part",
        dest.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file.part".into())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_plan_cases() {
        assert_eq!(resume_plan(0, 200).unwrap(), ResumeAction::Fresh);
        assert_eq!(
            resume_plan(100, 206).unwrap(),
            ResumeAction::AppendFrom(100)
        );
        assert_eq!(resume_plan(100, 200).unwrap(), ResumeAction::Fresh);
        assert!(resume_plan(100, 416).is_err());
        assert!(matches!(resume_plan(0, 404), Err(DownloadError::Http(404))));
        assert_eq!(resume_plan(0, 206).unwrap(), ResumeAction::Fresh);
        assert!(matches!(resume_plan(0, 416), Err(DownloadError::Http(416))));
    }

    #[test]
    fn cut_part_path_and_success_status() {
        let stream = include_str!("stream.rs");
        let fetch = include_str!("fetch.rs");
        assert!(
            !stream.contains("file.part"),
            "部分文件名只由 partial_path 产生"
        );
        assert!(!fetch.contains("file.part"));
        assert!(
            !stream.contains("(200..300)"),
            "尚无 part 时的 2xx 只在 resume_plan"
        );
        assert!(!fetch.contains("(200..300)"));
    }
}
