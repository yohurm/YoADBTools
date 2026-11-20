//! 采集任务 join：取消后有上限地等待，超时 abort，禁止握着管道死等。
//!
//! 三路代际资源（capture / index / batch）共用**一个** deadline 并发收敛：
//! 顺序 join 会把最坏等待时间放大到 3 × `STOP_JOIN`，与退出序列的 3s 总预算冲突。

use std::time::Duration;

use tokio::task::JoinHandle;

/// 取消后等一路代际资源收敛的上限。三路共享同一个 deadline（不是每路各一份）。
pub(crate) const STOP_JOIN: Duration = Duration::from_secs(3);

/// 等到 deadline 或句柄结束；超时 abort 并等它真正结束。
async fn join_until<T>(mut handle: JoinHandle<T>, deadline: tokio::time::Instant) {
    tokio::select! {
        _ = &mut handle => {}
        _ = tokio::time::sleep_until(deadline) => {
            handle.abort();
            let _ = handle.await;
        }
    }
}

/// 收敛一路代际资源（单句柄便利入口，沿用全局 deadline 语义）。
pub(crate) async fn join_or_abort<T>(handle: JoinHandle<T>) {
    let deadline = tokio::time::Instant::now() + STOP_JOIN;
    join_until(handle, deadline).await;
}

/// 收敛 capture / index / batch 三路：共享一个 deadline，并发等待。
///
/// 最坏总耗时是 `STOP_JOIN`（不是 3 × `STOP_JOIN`）。
pub(crate) async fn join_workers(
    capture: Option<JoinHandle<()>>,
    index: Option<JoinHandle<()>>,
    batch: Option<JoinHandle<()>>,
) {
    let deadline = tokio::time::Instant::now() + STOP_JOIN;
    tokio::join!(
        async {
            if let Some(handle) = capture {
                join_until(handle, deadline).await;
            }
        },
        async {
            if let Some(handle) = index {
                join_until(handle, deadline).await;
            }
        },
        async {
            if let Some(handle) = batch {
                join_until(handle, deadline).await;
            }
        },
    );
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// 三路都秒退：总耗时远小于 deadline（并发而非顺序）。
    #[tokio::test]
    async fn join_workers_converges_fast_when_all_finish() {
        let started = Instant::now();
        join_workers(
            Some(tokio::spawn(async {})),
            Some(tokio::spawn(async {})),
            Some(tokio::spawn(async {})),
        )
        .await;
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "三路秒退不应耗时 {:?}",
            started.elapsed()
        );
    }

    /// 三路都卡住：总耗时被**一个** deadline 限制，不是 3 × STOP_JOIN。
    #[tokio::test]
    async fn join_workers_shares_one_deadline_across_three_handles() {
        let started = Instant::now();
        join_workers(
            Some(tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(60)).await;
            })),
            Some(tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(60)).await;
            })),
            Some(tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(60)).await;
            })),
        )
        .await;
        let elapsed = started.elapsed();
        assert!(
            elapsed < STOP_JOIN + Duration::from_secs(1),
            "三路必须共享一个 deadline，实测 {elapsed:?}"
        );
    }

    /// 混合：一路秒退、两路卡住 → 仍只等一个 deadline。
    #[tokio::test]
    async fn join_workers_mixed_finish_still_single_deadline() {
        let started = Instant::now();
        join_workers(
            Some(tokio::spawn(async {})),
            Some(tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(60)).await;
            })),
            Some(tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(60)).await;
            })),
        )
        .await;
        let elapsed = started.elapsed();
        assert!(elapsed < STOP_JOIN + Duration::from_secs(1), "实测 {elapsed:?}");
    }

    #[tokio::test]
    async fn join_workers_accepts_all_none() {
        join_workers(None, None, None).await;
    }
}
