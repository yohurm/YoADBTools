//! 后台任务中心：长任务（采集/传输/命令组）登记，状态栏展示。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use tokio::runtime::Handle;
use tokio::sync::mpsc;

use yohu_protocol::{AppEvent, TaskInfo};

/// 任务登记中心。
pub struct TaskCenter {
    inner: Mutex<HashMap<u32, TaskInfo>>,
    next: AtomicU32,
    sink: mpsc::Sender<AppEvent>,
}

impl TaskCenter {
    pub fn new(sink: mpsc::Sender<AppEvent>) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            next: AtomicU32::new(1),
            sink,
        }
    }

    /// 登记一个活动任务（name 展示名，detail 悬停明细，run_id 仅组/块），返回任务 id。
    pub fn register(&self, name: String, detail: String, run_id: Option<u32>) -> u32 {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.inner.lock().expect("tasks lock poisoned").insert(
            id,
            TaskInfo {
                id,
                name,
                active: true,
                detail: Some(detail),
                run_id,
            },
        );
        self.emit_lossy();
        id
    }

    /// 完成任务（保留在列表中，状态栏短暂展示后由 UI 清理展示逻辑决定）。
    pub fn finish(&self, id: u32) {
        if let Some(task) = self.inner.lock().expect("tasks lock poisoned").get_mut(&id) {
            task.active = false;
        }
        self.emit_finish();
    }

    pub fn summary(&self) -> Vec<TaskInfo> {
        let mut tasks: Vec<TaskInfo> = self
            .inner
            .lock()
            .expect("tasks lock poisoned")
            .values()
            .cloned()
            .collect();
        tasks.sort_by_key(|t| t.id);
        tasks
    }

    fn emit_lossy(&self) {
        let _ = self.sink.try_send(AppEvent::TaskSummary {
            tasks: self.summary(),
        });
    }

    /// 终态 `task/summary` 必达（与 transfer 终态同纪律：`send`，禁止 try_send 丢）。
    fn emit_finish(&self) {
        let event = AppEvent::TaskSummary {
            tasks: self.summary(),
        };
        let sink = self.sink.clone();
        match Handle::try_current() {
            Ok(handle) => {
                handle.spawn(async move {
                    let _ = sink.send(event).await;
                });
            }
            Err(_) => {
                let _ = sink.blocking_send(event);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_copies_run_id() {
        let (tx, _rx) = mpsc::channel(8);
        let center = TaskCenter::new(tx);
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
        let (tx, _rx) = mpsc::channel(8);
        let center = TaskCenter::new(tx);
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
}
