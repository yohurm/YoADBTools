//! 后台任务中心：长任务（采集/投屏/传输/命令组/更新）登记，状态栏展示。
//!
//! **推送单点**：`task/summary` 只有一个写者——本中心自己的 drainer。登记与收口只
//! 「打一个唤醒」，drainer 在唤醒后读「此刻」的全量快照再 `send().await`。因此
//! ① 永不并发 `spawn` 发快照；② 后发快照不会比先发的旧（读的是当前状态而非陈旧副本）。
//!
//! **终态回收**：终态只保留最近 [`TASK_FINISHED_RETENTION`] 且至多
//! [`TASK_RETENTION_MAX`] 条，回收在 [`TaskCenter::summary`] 一处收口——UI 不承担回收。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc;

use crate::limits::{TASK_FINISHED_RETENTION, TASK_RETENTION_MAX};
use yohu_protocol::{AppEvent, TaskInfo};

/// 设备任务的悬停明细。
pub fn device_detail(serial: &str) -> String {
    format!("设备 {serial}")
}

struct Tasks {
    tasks: HashMap<u32, TaskInfo>,
    /// 终态时刻（只对 `active == false` 的条目有值）。
    finished_at: HashMap<u32, Instant>,
}

impl Tasks {
    /// 丢掉过期与超额的终态。活动任务永不被回收。
    fn prune(&mut self, now: Instant) {
        let expired: Vec<u32> = self
            .finished_at
            .iter()
            .filter(|(_, at)| now.duration_since(**at) > TASK_FINISHED_RETENTION)
            .map(|(id, _)| *id)
            .collect();
        for id in expired {
            self.finished_at.remove(&id);
            self.tasks.remove(&id);
        }
        if self.finished_at.len() > TASK_RETENTION_MAX {
            let mut by_age: Vec<(u32, Instant)> = self
                .finished_at
                .iter()
                .map(|(id, at)| (*id, *at))
                .collect();
            by_age.sort_by_key(|(_, at)| std::cmp::Reverse(*at));
            for (id, _) in by_age.into_iter().skip(TASK_RETENTION_MAX) {
                self.finished_at.remove(&id);
                self.tasks.remove(&id);
            }
        }
    }
}

/// 任务登记中心。
pub struct TaskCenter {
    inner: Mutex<Tasks>,
    next: AtomicU32,
    sink: mpsc::Sender<AppEvent>,
    /// 容量 1 的唤醒通道：合并同一状态窗口内的多次登记/收口，不丢终态。
    wake: mpsc::Sender<()>,
    wake_rx: Mutex<Option<mpsc::Receiver<()>>>,
}

impl TaskCenter {
    fn lock_inner(&self) -> std::sync::MutexGuard<'_, Tasks> {
        self.inner.lock().expect("tasks lock poisoned")
    }

    pub fn new(sink: mpsc::Sender<AppEvent>) -> Self {
        let (wake, wake_rx) = mpsc::channel(1);
        Self {
            inner: Mutex::new(Tasks {
                tasks: HashMap::new(),
                finished_at: HashMap::new(),
            }),
            next: AtomicU32::new(1),
            sink,
            wake,
            wake_rx: Mutex::new(Some(wake_rx)),
        }
    }

    /// 启动唯一 drainer。组合根调用一次；重复调用无副作用（唤醒端已被取走）。
    pub fn spawn_drainer(self: &Arc<Self>) {
        let taken = self
            .wake_rx
            .lock()
            .expect("tasks drain lock poisoned")
            .take();
        let Some(wake_rx) = taken else {
            return;
        };
        let center = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            center.drain(wake_rx).await;
        });
    }

    /// 唯一快照写者：串行把「此刻」的全量列表交给事件通道。
    async fn drain(&self, mut wake_rx: mpsc::Receiver<()>) {
        while wake_rx.recv().await.is_some() {
            let event = AppEvent::TaskSummary {
                tasks: self.summary(),
            };
            if self.sink.send(event).await.is_err() {
                // 分发器已收摊（进程收尾），不再有读者。
                break;
            }
        }
    }

    /// 登记一个活动任务（name 展示名，detail 悬停明细，run_id 仅组/块），返回任务 id。
    ///
    /// id 分配与插入在同一把锁内：并发登记时快照里不会出现「id 大的先到、id 小的后到」的
    /// 中间态，drainer 读到的集合只增不减。
    pub fn register(&self, name: String, detail: String, run_id: Option<u32>) -> u32 {
        let id = {
            let mut inner = self.lock_inner();
            let id = self.next.fetch_add(1, Ordering::Relaxed);
            inner.tasks.insert(
                id,
                TaskInfo {
                    id,
                    name,
                    active: true,
                    detail: Some(detail),
                    run_id,
                },
            );
            id
        };
        self.wake();
        id
    }

    /// 完成任务：置终态并交给 drainer 推送（终态必达，非 `try_send` 丢弃）。
    pub fn finish(&self, id: u32) {
        let now = Instant::now();
        {
            let mut inner = self.lock_inner();
            let Some(task) = inner.tasks.get_mut(&id) else {
                return;
            };
            task.active = false;
            inner.finished_at.insert(id, now);
        }
        self.wake();
    }

    /// 当前列表：活动任务 + 近期终态（回收只在这里发生）。
    pub fn summary(&self) -> Vec<TaskInfo> {
        let mut inner = self.lock_inner();
        inner.prune(Instant::now());
        let mut tasks: Vec<TaskInfo> = inner.tasks.values().cloned().collect();
        tasks.sort_by_key(|t| t.id);
        tasks
    }

    /// 唤醒 drainer。容量 1：已在排队时不重复入队（drainer 读的是最新全量）。
    fn wake(&self) {
        let _ = self.wake.try_send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn center() -> (Arc<TaskCenter>, mpsc::Receiver<AppEvent>) {
        let (tx, rx) = mpsc::channel(64);
        (Arc::new(TaskCenter::new(tx)), rx)
    }

    #[test]
    fn register_copies_run_id() {
        let (center, _rx) = center();
        let id = center.register("命令组: demo".into(), "1 台 · 1 条".into(), Some(7));
        let task = center
            .summary()
            .into_iter()
            .find(|t| t.id == id)
            .expect("task");
        assert_eq!(task.run_id, Some(7));
        assert!(task.active);
    }

    #[test]
    fn finish_marks_inactive() {
        let (center, _rx) = center();
        let id = center.register("上传".into(), "a → b".into(), None);
        center.finish(id);
        let task = center
            .summary()
            .into_iter()
            .find(|t| t.id == id)
            .expect("task");
        assert!(!task.active);
        assert_eq!(task.run_id, None);
    }

    #[test]
    fn finishing_unknown_id_is_a_no_op() {
        let (center, _rx) = center();
        center.finish(999);
        assert!(center.summary().is_empty());
    }

    #[test]
    fn terminal_list_is_bounded_by_retention_cap() {
        let (center, _rx) = center();
        for i in 0..(TASK_RETENTION_MAX + 8) {
            let id = center.register(format!("t{i}"), "d".into(), None);
            center.finish(id);
        }
        let kept = center.summary();
        assert_eq!(
            kept.len(),
            TASK_RETENTION_MAX,
            "终态只保留最近 K 条，禁止无界增长"
        );
        assert!(kept.iter().all(|t| !t.active));
        // 保留的是最近的那批（id 单调，最大的一批留下）。
        assert_eq!(kept.last().map(|t| t.id), Some((TASK_RETENTION_MAX + 8) as u32));
    }

    #[test]
    fn active_tasks_survive_terminal_reclaim() {
        let (center, _rx) = center();
        let live = center.register("采集".into(), "设备 S1".into(), None);
        for i in 0..(TASK_RETENTION_MAX + 4) {
            let id = center.register(format!("t{i}"), "d".into(), None);
            center.finish(id);
        }
        let kept = center.summary();
        assert!(kept.iter().any(|t| t.id == live && t.active), "活动任务不得被回收");
    }

    #[test]
    fn prune_drops_terminal_older_than_retention() {
        let mut tasks = Tasks {
            tasks: HashMap::new(),
            finished_at: HashMap::new(),
        };
        for id in 1..=3 {
            tasks.tasks.insert(
                id,
                TaskInfo {
                    id,
                    name: format!("t{id}"),
                    active: id == 3,
                    detail: None,
                    run_id: None,
                },
            );
        }
        let now = Instant::now();
        tasks.finished_at.insert(1, now - TASK_FINISHED_RETENTION - Duration::from_secs(1));
        tasks.finished_at.insert(2, now);
        tasks.prune(now);
        assert!(!tasks.tasks.contains_key(&1), "过期终态被丢");
        assert!(tasks.tasks.contains_key(&2), "近期终态保留");
        assert!(tasks.tasks.contains_key(&3), "活动任务保留");
    }

    /// P1-5 回归：终态快照串行推送，任何后到的快照都不得把已结束任务写回 active。
    #[tokio::test]
    async fn terminal_snapshots_are_serialized_and_never_regress() {
        let (center, mut rx) = center();
        center.spawn_drainer();

        let a = center.register("采集".into(), "设备 S1".into(), None);
        let b = center.register("投屏".into(), "设备 S1".into(), None);

        // 并发收口：两条 finish 由不同线程同时触发。
        let c1 = Arc::clone(&center);
        let c2 = Arc::clone(&center);
        let t1 = std::thread::spawn(move || c1.finish(a));
        let t2 = std::thread::spawn(move || c2.finish(b));
        t1.join().expect("finish a");
        t2.join().expect("finish b");

        let mut seen: Vec<Vec<TaskInfo>> = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(Duration::from_millis(200), rx.recv()).await {
                Ok(Some(AppEvent::TaskSummary { tasks })) => {
                    seen.push(tasks);
                    let last = seen.last().expect("just pushed");
                    if last.len() == 2 && last.iter().all(|t| !t.active) {
                        break;
                    }
                }
                Ok(Some(_)) | Err(_) => {}
                Ok(None) => break,
            }
        }

        assert!(!seen.is_empty(), "终态必须推送");
        let mut closed: Vec<u32> = Vec::new();
        for snapshot in &seen {
            for task in snapshot {
                if !task.active {
                    closed.push(task.id);
                } else if closed.contains(&task.id) {
                    panic!("已结束任务 {} 被后到的快照写回 active", task.id);
                }
            }
        }
        let last = seen.last().expect("终态快照");
        assert_eq!(last.len(), 2);
        assert!(last.iter().all(|t| !t.active));
    }

    /// 登记与收口交替时，drainer 只发「此刻」的全量，不出现乱序回退。
    #[tokio::test]
    async fn register_and_finish_interleave_without_stale_snapshots() {
        let (center, mut rx) = center();
        center.spawn_drainer();

        let mut ids = Vec::new();
        for i in 0..4 {
            ids.push(center.register(format!("t{i}"), "d".into(), None));
        }
        for id in ids.iter().take(2) {
            center.finish(*id);
        }

        let mut snapshots = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(Duration::from_millis(200), rx.recv()).await {
                Ok(Some(AppEvent::TaskSummary { tasks })) => snapshots.push(tasks),
                Ok(Some(_)) | Err(_) => {}
                Ok(None) => break,
            }
        }
        assert!(!snapshots.is_empty());
        let last = snapshots.last().expect("快照");
        let inactive: Vec<u32> = last.iter().filter(|t| !t.active).map(|t| t.id).collect();
        assert_eq!(inactive, ids[..2].to_vec(), "收口结果必须体现在最新快照");
        assert_eq!(last.iter().filter(|t| t.active).count(), 2);
    }
}
