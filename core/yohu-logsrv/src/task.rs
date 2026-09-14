//! 采集任务 join：取消后有上限地等待，超时 abort，禁止握着管道死等。

use std::time::Duration;

/// 取消后等跟流任务收敛的上限。
const STOP_JOIN: Duration = Duration::from_secs(3);

pub(crate) async fn join_or_abort<T>(mut handle: tokio::task::JoinHandle<T>) {
    tokio::select! {
        _ = &mut handle => {}
        _ = tokio::time::sleep(STOP_JOIN) => {
            handle.abort();
            let _ = handle.await;
        }
    }
}

/// 外层任务被 abort 时连带取消内部 spawn，避免 logcat 读任务脱离后死等管道。
pub(crate) struct AbortOnDrop<T>(Option<tokio::task::JoinHandle<T>>);

impl<T> AbortOnDrop<T> {
    pub(crate) fn new(handle: tokio::task::JoinHandle<T>) -> Self {
        Self(Some(handle))
    }

    pub(crate) async fn join(mut self) {
        if let Some(handle) = self.0.take() {
            join_or_abort(handle).await;
        }
    }
}

impl<T> Drop for AbortOnDrop<T> {
    fn drop(&mut self) {
        if let Some(handle) = self.0.take() {
            handle.abort();
        }
    }
}
