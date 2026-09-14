//! 目录浏览：后一次 list 取消前一次。commands 只校验在线并转发。

use std::sync::Mutex;

use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_files::FileError;
use yohu_protocol::RemoteEntry;

pub struct BrowseRuns {
    slot: Mutex<CancellationToken>,
}

impl BrowseRuns {
    pub fn new() -> Self {
        Self {
            slot: Mutex::new(CancellationToken::new()),
        }
    }

    pub fn replace(&self) -> CancellationToken {
        let mut slot = self.slot.lock().expect("browse lock poisoned");
        slot.cancel();
        let next = CancellationToken::new();
        *slot = next.clone();
        next
    }
}

pub async fn list(
    state: &AppState,
    serial: &str,
    path: &str,
) -> Result<Vec<RemoteEntry>, FileError> {
    tracing::info!(serial = %serial, path = %path, "files.list");
    let cancel = state.browse_runs.replace();
    state.browser.list(serial, path, cancel).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_cancels_previous_token() {
        let runs = BrowseRuns::new();
        let first = runs.replace();
        assert!(!first.is_cancelled());
        let second = runs.replace();
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
    }
}
