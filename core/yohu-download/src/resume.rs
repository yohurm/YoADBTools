//! Range 续传决策（206 追加 / 200 整包重来 / 416 删 part）。

use crate::error::DownloadError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeAction {
    Fresh,
    AppendFrom(u64),
}

/// 已有 `have` 字节时，根据 HTTP 状态决定写盘策略。
pub fn resume_plan(have: u64, status: u16) -> Result<ResumeAction, DownloadError> {
    if have == 0 {
        return Ok(ResumeAction::Fresh);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_plan_cases() {
        assert_eq!(resume_plan(0, 200).unwrap(), ResumeAction::Fresh);
        assert_eq!(resume_plan(100, 206).unwrap(), ResumeAction::AppendFrom(100));
        assert_eq!(resume_plan(100, 200).unwrap(), ResumeAction::Fresh);
        assert!(resume_plan(100, 416).is_err());
    }
}
