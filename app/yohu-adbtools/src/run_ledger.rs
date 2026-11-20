//! 壳任务账本：任务中心条目的唯一登记/收口点。
//!
//! 键是 `(serial, generation)`：迟到世代不得误杀新世代任务（ADR-v6-046 §5）。
//!
//! **原子性**（P0-1）：`register` 与 `close` 在同一把锁内完成，中间没有 `await`，也没有
//! 「先返回、再取锁」的第二段。危险窗口（`Stopped` 先于 `register` 被分发器消费）用墓碑
//! 收口：`close` 未见登记项时写墓碑，`register` 先查墓碑——命中则不登记任务（不新建、
//! 不泄漏）。
//!
//! **墓碑的生命周期由「登记在途」界定**（[`RunLedger::begin`] / [`RunLedger::abandon`]）：
//! 只有「该 serial 有一次 `start` 尚未登记」时，`close` 才可能写墓碑——其它情形（重复
//! `Stopped`、`start` 在登记前就失败）根本不写，因此墓碑数不超过在途 `start` 数，
//! 不随会话时长增长。

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// 账本登记结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RegisterOutcome {
    /// 已登记，任务为 Active。
    Registered,
    /// 该世代已收口（墓碑命中）：任务根本没有创建。
    AlreadyClosed,
}

struct Ledger {
    /// `(serial, generation) → task_id`。
    tasks: HashMap<(String, u64), u32>,
    /// 该 serial 上有一次 `start` 尚未登记（`Stopped` 可能先到）。
    inflight: HashSet<String>,
    /// 墓碑：该世代在登记之前就收口了，迟到的 `register` 不得再登记。
    closed: HashSet<(String, u64)>,
}

pub(crate) struct RunLedger {
    inner: Mutex<Ledger>,
}

impl RunLedger {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new(Ledger {
                tasks: HashMap::new(),
                inflight: HashSet::new(),
                closed: HashSet::new(),
            }),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Ledger> {
        self.inner.lock().expect("run ledger lock poisoned")
    }

    /// 标记「该 serial 即将起流，登记尚未发生」。
    ///
    /// 与 `capture.start` 的调用配对：`begin` → `start().await` → [`Self::register_with`]，
    /// 失败分支必须 [`Self::abandon`]。
    pub(crate) fn begin(&self, serial: &str) {
        self.lock().inflight.insert(serial.to_string());
    }

    /// `start` 在登记之前就失败（取消 / `logcat -c` 失败）：撤回在途标记，并丢掉该 serial
    /// 上可能已写的墓碑——那个世代永远不会登记，墓碑留着就是泄漏。
    pub(crate) fn abandon(&self, serial: &str) {
        let mut inner = self.lock();
        inner.inflight.remove(serial);
        inner.closed.retain(|(owner, _)| owner != serial);
    }

    /// 同一把锁内：撤在途标记 → 查墓碑 → 建任务 → 登记。
    ///
    /// `make_task` 在锁内执行（只做内存插入 + 非阻塞通知），因此「判定该世代是否已收口」
    /// 与「写入任务」之间没有可交错的观察点。
    pub(crate) fn register_with<F>(
        &self,
        serial: &str,
        generation: u64,
        make_task: F,
    ) -> RegisterOutcome
    where
        F: FnOnce() -> u32,
    {
        let key = (serial.to_string(), generation);
        let mut inner = self.lock();
        inner.inflight.remove(serial);
        if inner.closed.remove(&key) {
            tracing::info!(
                serial,
                generation,
                "世代已收口（Stopped 先于 register），不登记任务"
            );
            return RegisterOutcome::AlreadyClosed;
        }
        let task_id = make_task();
        inner.tasks.insert(key, task_id);
        RegisterOutcome::Registered
    }

    /// 同一把锁内：取登记项；未见且该 serial 有登记在途时写墓碑（收口早于登记的世代）。
    ///
    /// 返回 `Some(task_id)` 表示该世代确有活动任务需要收口；`None` 表示迟到收口。
    pub(crate) fn close(&self, serial: &str, generation: u64) -> Option<u32> {
        let key = (serial.to_string(), generation);
        let mut inner = self.lock();
        if let Some(task_id) = inner.tasks.remove(&key) {
            return Some(task_id);
        }
        if inner.inflight.contains(serial) {
            inner.closed.insert(key);
        }
        None
    }

    /// 清扫：收口该 serial 上所有不属当前世代的登记项。
    ///
    /// 自愈点（P1-7）：槽位已 Empty 但账本仍 Active 的世代在这里一次性收口，
    /// 掉线/切换成为恢复点而不是泄漏源。`live = None` 表示槽位没有在采世代。
    pub(crate) fn sweep(&self, serial: &str, live: Option<u64>) -> Vec<u32> {
        let mut finished = Vec::new();
        let mut inner = self.lock();
        let Ledger {
            tasks,
            inflight,
            closed,
        } = &mut *inner;
        tasks.retain(|key, task_id| {
            if key.0 == serial && Some(key.1) != live {
                finished.push(*task_id);
                // 该世代已被清扫收口：迟到的 register 同样不得复活它。
                closed.insert(key.clone());
                inflight.remove(serial);
                false
            } else {
                true
            }
        });
        finished
    }

    /// 墓碑条数（测试用：证明不随失败启动/重复收口增长）。
    #[cfg(test)]
    pub(crate) fn tombstone_len(&self) -> usize {
        self.lock().closed.len()
    }

    /// 登记项条数（测试用）。
    #[cfg(test)]
    pub(crate) fn registered_len(&self) -> usize {
        self.lock().tasks.len()
    }

    /// 在途标记条数（测试用）。
    #[cfg(test)]
    pub(crate) fn inflight_len(&self) -> usize {
        self.lock().inflight.len()
    }
}

impl Default for RunLedger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_before_register_writes_tombstone_and_blocks_registration() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        assert_eq!(ledger.close("S1", 7), None, "未登记世代收口只写墓碑");
        assert_eq!(ledger.tombstone_len(), 1);
        let mut created = false;
        let outcome = ledger.register_with("S1", 7, || {
            created = true;
            11
        });
        assert_eq!(outcome, RegisterOutcome::AlreadyClosed);
        assert!(!created, "已收口世代不得建任务");
        assert_eq!(ledger.registered_len(), 0);
        assert_eq!(ledger.tombstone_len(), 0, "命中即消费墓碑");
        assert_eq!(ledger.inflight_len(), 0, "登记后不再在途");
    }

    #[test]
    fn register_before_close_hands_the_task_back_once() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 3, || 21),
            RegisterOutcome::Registered
        );
        assert_eq!(ledger.close("S1", 3), Some(21));
        assert_eq!(ledger.close("S1", 3), None, "同一任务只收口一次");
        assert_eq!(ledger.registered_len(), 0);
    }

    #[test]
    fn late_close_of_old_generation_does_not_touch_new_task() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 5, || 31),
            RegisterOutcome::Registered
        );
        assert_eq!(ledger.close("S1", 4), None, "旧世代收口不得结束新任务");
        assert_eq!(ledger.close("S1", 5), Some(31));
    }

    /// 墓碑只在「登记在途」时写：`start` 在登记前失败（安全支）不留墓碑。
    #[test]
    fn abandoned_start_leaves_no_tombstone() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        // start 失败（取消 / logcat -c 失败）→ 分发器可能已经收到 Stopped。
        assert_eq!(ledger.close("S1", 9), None);
        assert_eq!(ledger.tombstone_len(), 1, "在途时收口会写墓碑");
        ledger.abandon("S1");
        assert_eq!(ledger.tombstone_len(), 0, "放弃启动必须撤掉墓碑");
        assert_eq!(ledger.inflight_len(), 0);
    }

    /// 无在途登记时，重复 Stopped 不写墓碑——墓碑数不随会话时长增长。
    #[test]
    fn repeated_close_without_inflight_keeps_no_tombstone() {
        let ledger = RunLedger::new();
        for generation in 0..100 {
            assert_eq!(ledger.close("S1", generation), None);
        }
        assert_eq!(ledger.tombstone_len(), 0, "无在途登记不得积累墓碑");
    }

    /// 反复失败启动 N 次：墓碑始终为 0（每次 abandon 都清掉）。
    #[test]
    fn repeated_failed_starts_do_not_grow_the_tombstone_set() {
        let ledger = RunLedger::new();
        for generation in 0..50 {
            ledger.begin("S1");
            assert_eq!(ledger.close("S1", generation), None);
            ledger.abandon("S1");
        }
        assert_eq!(ledger.tombstone_len(), 0);
        assert_eq!(ledger.inflight_len(), 0);
    }

    #[test]
    fn sweep_closes_only_generations_the_slot_no_longer_owns() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 3, || 41),
            RegisterOutcome::Registered
        );
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 4, || 42),
            RegisterOutcome::Registered
        );
        ledger.begin("S2");
        assert_eq!(
            ledger.register_with("S2", 5, || 43),
            RegisterOutcome::Registered
        );

        let mut swept = ledger.sweep("S1", Some(4));
        swept.sort_unstable();
        assert_eq!(swept, vec![41], "只收口非在采世代");
        assert_eq!(ledger.registered_len(), 2);

        let mut rest = ledger.sweep("S1", None);
        rest.sort_unstable();
        assert_eq!(rest, vec![42], "槽位 Empty 时该 serial 全部收口");
        assert_eq!(ledger.registered_len(), 1, "别的 serial 不受影响");
    }

    /// 清扫收口的世代不得被迟到的 register 复活。
    #[test]
    fn swept_generation_cannot_be_registered_later() {
        let ledger = RunLedger::new();
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 6, || 51),
            RegisterOutcome::Registered
        );
        assert_eq!(ledger.sweep("S1", None), vec![51]);
        ledger.begin("S1");
        assert_eq!(
            ledger.register_with("S1", 6, || 52),
            RegisterOutcome::AlreadyClosed,
            "已清扫世代同样不得再登记"
        );
    }
}
