//! 会话专用有界帧队列：sticky 最后一份 config；IDR 优先于 delta。零 Tauri。

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

use crate::codec::PIPE_H265;

/// 宽和高都大于 0 才是一帧内容尺寸。0 只表示还没有画面。
pub fn content_size_usable(width: u32, height: u32) -> bool {
    width > 0 && height > 0
}

const QUEUE_CAP: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedFrame {
    pub generation: u64,
    pub width: u32,
    pub height: u32,
    pub config: bool,
    pub keyframe: bool,
    pub pts: u64,
    pub codec: u8,
    pub payload: Vec<u8>,
    pub dropped: u32,
}

impl EncodedFrame {
    pub fn has_content_size(&self) -> bool {
        content_size_usable(self.width, self.height)
    }

    pub fn is_hevc(&self) -> bool {
        self.codec == PIPE_H265
    }

    fn is_delta(&self) -> bool {
        !self.config && !self.keyframe
    }
}

/// 会话帧泵。config 不进容量队列；满时先丢 delta，不为 delta 丢掉最后的 IDR。
pub struct FramePipe {
    last_config: Mutex<Option<EncodedFrame>>,
    pending_config: AtomicBool,
    queue: Mutex<VecDeque<EncodedFrame>>,
    notify: Notify,
    closed: AtomicBool,
    dropped: AtomicU32,
}

fn lock_pipe<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().expect("frame pipe lock poisoned")
}

impl FramePipe {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            last_config: Mutex::new(None),
            pending_config: AtomicBool::new(false),
            queue: Mutex::new(VecDeque::with_capacity(QUEUE_CAP)),
            notify: Notify::new(),
            closed: AtomicBool::new(false),
            dropped: AtomicU32::new(0),
        })
    }

    pub fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn dropped(&self) -> u32 {
        self.dropped.load(Ordering::SeqCst)
    }

    pub fn push(&self, mut frame: EncodedFrame) {
        if self.closed.load(Ordering::SeqCst) {
            return;
        }
        frame.dropped = self.dropped.load(Ordering::SeqCst);
        if frame.config {
            *lock_pipe(&self.last_config) = Some(frame);
            self.pending_config.store(true, Ordering::SeqCst);
            self.notify.notify_one();
            return;
        }
        let mut queue = lock_pipe(&self.queue);
        if queue.len() >= QUEUE_CAP && !evict_for(&mut queue, &frame, &self.dropped) {
            return;
        }
        frame.dropped = self.dropped.load(Ordering::SeqCst);
        queue.push_back(frame);
        drop(queue);
        self.notify.notify_one();
    }

    fn pop(&self) -> Option<EncodedFrame> {
        if self.pending_config.swap(false, Ordering::SeqCst) {
            if let Some(config) = lock_pipe(&self.last_config).clone() {
                return Some(config);
            }
        }
        lock_pipe(&self.queue).pop_front()
    }

    pub async fn recv(&self) -> Option<EncodedFrame> {
        loop {
            if let Some(frame) = self.pop() {
                return Some(frame);
            }
            if self.closed.load(Ordering::SeqCst) {
                return self.pop();
            }
            self.notify.notified().await;
        }
    }

    /// 呈现线程直取。禁止再泵进无界通道，否则本队列的 8 帧背压失效。
    pub fn try_recv(&self) -> Option<EncodedFrame> {
        self.pop()
    }

    /// 把现在已经在队列里的帧一次取完。不等下一帧。
    pub fn drain_ready(&self) -> Vec<EncodedFrame> {
        let mut frames = Vec::new();
        while let Some(frame) = self.try_recv() {
            frames.push(frame);
        }
        frames
    }

    /// 阻塞拿到的第一帧，再带上队列里现成的。管道已关时返回 None。
    pub fn recv_batch(&self, first: Option<EncodedFrame>) -> Option<Vec<EncodedFrame>> {
        let first = first?;
        let mut frames = vec![first];
        frames.extend(self.drain_ready());
        Some(frames)
    }

    /// 会话级 SPS/PPS 快照。新解码座入座时读取，不走一次性 pending。
    pub fn sticky_config(&self) -> Option<EncodedFrame> {
        lock_pipe(&self.last_config).clone()
    }

    /// 同代下一 attempt 入队前清空内容。不关管道、不改 dropped。
    pub fn reset_content(&self) {
        *lock_pipe(&self.last_config) = None;
        self.pending_config.store(false, Ordering::SeqCst);
        lock_pipe(&self.queue).clear();
    }
}

fn evict_for(
    queue: &mut VecDeque<EncodedFrame>,
    incoming: &EncodedFrame,
    dropped: &AtomicU32,
) -> bool {
    if incoming.keyframe {
        let before = queue.len();
        queue.retain(|f| !f.is_delta());
        let n = (before - queue.len()) as u32;
        if n > 0 {
            dropped.fetch_add(n, Ordering::SeqCst);
        }
        if queue.len() < QUEUE_CAP {
            return true;
        }
        if let Some(i) = queue.iter().position(|f| f.keyframe) {
            queue.remove(i);
            dropped.fetch_add(1, Ordering::SeqCst);
            return true;
        }
        return false;
    }
    if let Some(i) = queue.iter().position(EncodedFrame::is_delta) {
        queue.remove(i);
        dropped.fetch_add(1, Ordering::SeqCst);
        return true;
    }
    dropped.fetch_add(1, Ordering::SeqCst);
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::PIPE_H264;

    fn frame(config: bool, keyframe: bool, pts: u64) -> EncodedFrame {
        EncodedFrame {
            generation: 1,
            width: 8,
            height: 8,
            config,
            keyframe,
            pts,
            codec: PIPE_H264,
            payload: vec![pts as u8],
            dropped: 0,
        }
    }

    #[test]
    fn content_size_needs_both_edges_and_hevc_is_the_pipe_id() {
        assert!(!content_size_usable(0, 10));
        assert!(!content_size_usable(10, 0));
        assert!(content_size_usable(10, 20));
        let mut sample = frame(false, true, 1);
        assert!(sample.has_content_size());
        assert!(!sample.is_hevc());
        sample.codec = crate::codec::PIPE_H265;
        sample.width = 0;
        assert!(!sample.has_content_size());
        assert!(sample.is_hevc());
    }

    #[test]
    fn content_size_and_hevc_are_not_rewritten_downstream() {
        let files = [
            include_str!("../../../app/yohu-adbtools/src/events.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/mod.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/stage.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/windows/host.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/windows/decode.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/macos/decode.rs"),
            include_str!("../../../app/yohu-adbtools/src/mirror_present/macos/surface.rs"),
            include_str!("../../../app/yohu-adbtools/tests/mf_live.rs"),
        ];
        for file in files {
            assert!(!file.contains("height > 0"), "height");
            assert!(!file.contains("video_h > 0"), "video");
            assert!(!file.contains("content_h > 0"), "content");
            assert!(!file.contains("codec == PIPE_H265"), "hevc");
            assert!(!file.contains("codec == 1"), "magic");
        }
    }

    #[test]
    fn drop_delta_keep_config_and_idr() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        for i in 1..=8 {
            pipe.push(frame(false, false, i));
        }
        pipe.push(frame(false, true, 99));
        let first = pipe.pop().expect("config");
        assert!(first.config);
        let second = pipe.pop().expect("idr");
        assert!(second.keyframe);
        assert_eq!(second.pts, 99);
        assert!(pipe.dropped() >= 1);
        assert!(pipe.pop().is_none());
    }

    #[test]
    fn idr_drops_oldest_when_queue_is_idrs() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        for i in 1..=8 {
            pipe.push(frame(false, true, i));
        }
        pipe.push(frame(false, true, 100));
        let first = pipe.pop().expect("config");
        assert_eq!(first.pts, 0);
        let pts: Vec<u64> = (0..8).filter_map(|_| pipe.pop().map(|f| f.pts)).collect();
        assert!(pts.contains(&100), "newest idr kept: {pts:?}");
        assert!(!pts.contains(&1), "oldest idr dropped: {pts:?}");
    }

    #[test]
    fn delta_does_not_evict_last_idr() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        for i in 2..=9 {
            pipe.push(frame(false, false, i));
        }
        pipe.push(frame(false, false, 10));
        let _ = pipe.pop();
        let second = pipe.pop().expect("idr");
        assert!(second.keyframe);
        assert_eq!(second.pts, 1);
        assert!(pipe.dropped() >= 1);
    }

    #[test]
    fn new_config_replaces_sticky_slot() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(true, false, 7));
        let first = pipe.pop().expect("latest config");
        assert_eq!(first.pts, 7);
        assert!(pipe.pop().is_none());
    }

    #[test]
    fn try_recv_drains_without_wait() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        assert!(pipe.try_recv().expect("config").config);
        assert!(pipe.try_recv().expect("idr").keyframe);
        assert!(pipe.try_recv().is_none());
    }

    #[test]
    fn sticky_config_survives_consume() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 3));
        assert_eq!(pipe.try_recv().expect("pending config").pts, 3);
        assert!(pipe.try_recv().is_none());
        let sticky = pipe.sticky_config().expect("snapshot");
        assert!(sticky.config);
        assert_eq!(sticky.pts, 3);
        assert!(pipe.try_recv().is_none());
    }

    #[test]
    fn reset_content_clears_sticky_and_queue_without_close() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        pipe.reset_content();
        assert!(pipe.sticky_config().is_none());
        assert!(pipe.try_recv().is_none());
        pipe.push(frame(true, false, 9));
        assert_eq!(pipe.try_recv().expect("new attempt config").pts, 9);
    }

    #[test]
    fn drain_ready_takes_what_is_queued() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        let ready = pipe.drain_ready();
        assert_eq!(ready.len(), 2);
        assert!(pipe.drain_ready().is_empty());
        let batch = pipe.recv_batch(Some(frame(false, false, 2))).expect("batch");
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].pts, 2);
        assert!(pipe.recv_batch(None).is_none());
        let windows = include_str!("../../../app/yohu-adbtools/src/mirror_present/windows/decode.rs");
        let macos = include_str!("../../../app/yohu-adbtools/src/mirror_present/macos/decode.rs");
        assert!(!windows.contains("try_recv"));
        assert!(!macos.contains("try_recv"));
    }
}
