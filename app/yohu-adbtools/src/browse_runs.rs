//! 目录浏览：会话 attach / generation-scoped release；后一次 list 取消前一次。
//! commands 只校验在线并转发。目录 went_offline：replace + 强制关掉当时的槽（同拍，不带 UI generation）。

use std::future::Future;
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

    /// 与目录决策同拍：先 cancel 在途 list，再按 serial 关掉当时的槽。
    async fn close_current<S, F, Fut>(&self, serials: &[S], mut detach: F)
    where
        S: AsRef<str>,
        F: FnMut(String) -> Fut,
        Fut: Future<Output = ()>,
    {
        self.replace();
        for serial in serials {
            detach(serial.as_ref().to_owned()).await;
        }
    }
}

/// 目录 `went_offline`：replace 取消在途 list，再 force detach 当时的槽（不是 release）。
pub async fn went_offline(state: &AppState, serials: &[String]) {
    let browser = state.browser.clone();
    state
        .browse_runs
        .close_current(serials, move |serial| {
            let browser = browser.clone();
            async move {
                tracing::info!(serial = %serial, "browse went_offline");
                browser.detach(&serial).await;
            }
        })
        .await;
}

pub async fn attach(
    state: &AppState,
    serial: &str,
) -> Result<yohu_protocol::BrowseAttach, FileError> {
    tracing::info!(serial = %serial, "files.session.attach");
    state
        .browser
        .attach(serial, state.root_cancel.child_token())
        .await
}

/// IPC `files.session.detach`：按 generation release。过期世代在 core 为空操作，且不取消在途 list。
pub async fn release(state: &AppState, serial: &str, generation: u64) {
    tracing::info!(serial = %serial, generation, "files.session.detach");
    if state.browser.release(serial, generation).await {
        state.browse_runs.replace();
    }
}

pub async fn reset_transport(state: &AppState) {
    state.browse_runs.replace();
    state.browser.drop_workers().await;
}

pub async fn list(
    state: &AppState,
    serial: &str,
    path: &str,
    generation: u64,
) -> Result<Vec<RemoteEntry>, FileError> {
    tracing::info!(serial = %serial, path = %path, generation, "files.list");
    let cancel = state.browse_runs.replace();
    state.browser.list(serial, path, generation, cancel).await
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

    #[tokio::test]
    async fn went_offline_cancels_then_detaches_serials_in_order() {
        let runs = BrowseRuns::new();
        let prior = runs.replace();
        let log = std::sync::Arc::new(Mutex::new(Vec::<String>::new()));
        let seen = log.clone();
        runs.close_current(&["A", "B"], |serial| {
            assert!(
                prior.is_cancelled(),
                "replace must cancel in-flight list before the first detach"
            );
            let seen = seen.clone();
            async move {
                seen.lock()
                    .expect("browse test log poisoned")
                    .push(format!("{serial}-start"));
                tokio::task::yield_now().await;
                seen.lock()
                    .expect("browse test log poisoned")
                    .push(format!("{serial}-end"));
            }
        })
        .await;
        assert_eq!(
            *log.lock().expect("browse test log poisoned"),
            vec![
                "A-start".to_string(),
                "A-end".to_string(),
                "B-start".to_string(),
                "B-end".to_string(),
            ]
        );
    }
}
