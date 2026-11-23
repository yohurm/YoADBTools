//! 每设备环存储：`serial → Arc<RingBuffer>` + 容量。
//!
//! 槽位、窗口、导出都只借用环句柄；环本身不持产品状态。
//!
//! **容量唯一 owner 是本类型**：`set_capacity` 立即向所有已存在环下推，
//! 因此任一时刻 `ring.capacity() == store.capacity()` 恒成立（`debug_assert` 锁住）。
//!
//! 读路径不产生副作用：`try_ring` 只查不建，`ensure_ring` 只在采集侧调用。

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use yohu_protocol::LogLine;

use crate::ring::{ring_capacity, RingBuffer};

pub struct RingStore {
    capacity: AtomicUsize,
    rings: Mutex<HashMap<String, Arc<RingBuffer>>>,
}

impl RingStore {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: AtomicUsize::new(ring_capacity(capacity)),
            rings: Mutex::new(HashMap::new()),
        }
    }

    /// 改容量：唯一 owner 的写入口。已存在的环**全部**立即跟随（不只下次 `start` 的那个）。
    pub fn set_capacity(&self, capacity: usize) {
        let capacity = ring_capacity(capacity);
        self.capacity.store(capacity, Ordering::Relaxed);
        let rings = self.rings.lock().expect("ring store lock poisoned");
        for ring in rings.values() {
            ring.install_capacity(capacity);
            debug_assert_eq!(
                ring.capacity(),
                capacity,
                "容量下推后每个环必须等于 store 容量"
            );
        }
    }

    pub(crate) fn capacity(&self) -> usize {
        self.capacity.load(Ordering::Relaxed)
    }

    /// 只读：该 serial 是否已有环（= 是否登记过采集）。读路径不得创建。
    pub(crate) fn try_ring(&self, serial: &str) -> Option<Arc<RingBuffer>> {
        let rings = self.rings.lock().expect("ring store lock poisoned");
        rings.get(serial).map(Arc::clone)
    }

    /// 仅采集侧调用：按**当前** store 容量建立该 serial 的环（已存在则复用并同步容量）。
    pub(crate) fn ensure_ring(&self, serial: &str) -> Arc<RingBuffer> {
        let cap = self.capacity();
        let mut rings = self.rings.lock().expect("ring store lock poisoned");
        let ring = rings
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(RingBuffer::new(cap)))
            .clone();
        drop(rings);
        ring.install_capacity(cap);
        debug_assert_eq!(
            ring.capacity(),
            self.capacity(),
            "ensure_ring 后环容量必须等于 store 容量"
        );
        ring
    }

    pub(crate) fn clear(&self, serial: &str) {
        if let Some(ring) = self.try_ring(serial) {
            ring.clear();
        }
    }

    pub(crate) fn last_seq(&self, serial: &str) -> u64 {
        self.try_ring(serial)
            .map(|ring| ring.last_seq())
            .unwrap_or(0)
    }

    /// 只读快照：未登记的 serial 返回空（不建环）。
    pub(crate) fn snapshot(&self, serial: &str, from_seq: u64, limit: usize) -> Vec<LogLine> {
        match self.try_ring(serial) {
            Some(ring) => ring.snapshot(from_seq, limit),
            None => Vec::new(),
        }
    }

    /// 列式二进制快照（P0-3，UI `log.range`）。
    pub(crate) fn range_bytes(&self, serial: &str, from_seq: u64, limit: usize) -> Vec<u8> {
        match self.try_ring(serial) {
            Some(ring) => ring.encode_range(from_seq, limit),
            None => {
                let mut out = Vec::with_capacity(8);
                out.extend_from_slice(&0u32.to_le_bytes());
                out.extend_from_slice(&0u32.to_le_bytes());
                out
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(msg: &str) -> LogLine {
        LogLine {
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            level: 'I',
            tag: "T".into(),
            msg: msg.into(),
            ..LogLine::default()
        }
    }

    /// 读路径不得懒创建：`try_ring` / `snapshot` / `last_seq` / `clear` 都不建环。
    #[test]
    fn read_paths_do_not_create_rings() {
        let store = RingStore::new(64);
        assert!(store.try_ring("S1").is_none());
        assert!(store.snapshot("S1", 0, 10).is_empty());
        assert_eq!(store.last_seq("S1"), 0);
        store.clear("S1");
        assert!(
            store.try_ring("S1").is_none(),
            "读路径与 clear 都不得为未采集的 serial 建环"
        );
    }

    /// `set_capacity` 必须把新容量下推到**所有**已存在环，不只下次 start 的那个。
    #[test]
    fn set_capacity_reaches_every_existing_ring() {
        let store = RingStore::new(100);
        let a = store.ensure_ring("A");
        let b = store.ensure_ring("B");
        let c = store.ensure_ring("C");
        assert_eq!(a.capacity(), 100);

        store.set_capacity(7);
        for (name, ring) in [("A", &a), ("B", &b), ("C", &c)] {
            assert_eq!(ring.capacity(), store.capacity(), "{name} 必须跟随 store");
            assert_eq!(ring.capacity(), 7);
        }

        // 缩容立即淘汰超出部分
        for i in 0..20 {
            a.push(line(&format!("a{i}")));
            b.push(line(&format!("b{i}")));
        }
        assert_eq!(a.len(), 7);
        assert_eq!(b.len(), 7);

        // 新建的环也按当前 store 容量
        let d = store.ensure_ring("D");
        assert_eq!(d.capacity(), 7);
    }

    /// 容量钳制单点：store 收 0 也归一为 1，并下推到环。
    #[test]
    fn capacity_clamped_at_store_and_pushed_down() {
        let store = RingStore::new(0);
        assert_eq!(store.capacity(), 1);
        let ring = store.ensure_ring("S1");
        assert_eq!(ring.capacity(), 1);
        store.set_capacity(0);
        assert_eq!(store.capacity(), 1);
        assert_eq!(ring.capacity(), 1);
    }

    /// 已存在的环在 `ensure_ring` 时同步到当前 store 容量（start 复用的路径）。
    #[test]
    fn ensure_ring_resyncs_existing_ring_capacity() {
        let store = RingStore::new(10);
        let first = store.ensure_ring("S1");
        store.set_capacity(3);
        let again = store.ensure_ring("S1");
        assert!(Arc::ptr_eq(&first, &again), "同一 serial 复用同一环");
        assert_eq!(again.capacity(), 3);
    }
}
