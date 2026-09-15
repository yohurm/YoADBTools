//! 解码座 → 表面的已解码画面槽。跟 start/stop，不跟 HWND。

#![cfg(windows)]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use super::mf::DecodedPicture;

#[derive(Clone)]
pub struct ReadyFrame {
    pub serial: String,
    pub generation: u64,
    /// scrcpy session 内容宽高。占用 / dest / 触控只认这个。
    pub content_w: u32,
    pub content_h: u32,
    /// 硬解纹理 / packed NV12 尺寸，可以大于内容。
    pub picture_w: u32,
    pub picture_h: u32,
    pub picture: DecodedPicture,
}

pub struct PictureBank {
    slot: Mutex<Option<ReadyFrame>>,
    seq: AtomicU64,
}

impl PictureBank {
    pub fn new() -> Self {
        Self {
            slot: Mutex::new(None),
            seq: AtomicU64::new(0),
        }
    }

    pub fn publish(&self, frame: ReadyFrame) {
        *self.slot.lock().expect("picture bank lock poisoned") = Some(frame);
        self.seq.fetch_add(1, Ordering::SeqCst);
    }

    pub fn latest(&self) -> Option<(u64, ReadyFrame)> {
        let frame = self.slot.lock().expect("picture bank lock poisoned").clone()?;
        Some((self.seq.load(Ordering::SeqCst), frame))
    }

    pub fn clear(&self) {
        *self.slot.lock().expect("picture bank lock poisoned") = None;
        self.seq.store(0, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mirror_present::windows::mf::DecodedPicture;

    #[test]
    fn latest_none_until_publish() {
        let bank = PictureBank::new();
        assert!(bank.latest().is_none());
        bank.publish(ReadyFrame {
            serial: "S1".into(),
            generation: 3,
            content_w: 8,
            content_h: 16,
            picture_w: 10,
            picture_h: 18,
            picture: DecodedPicture::Nv12(vec![1, 2, 3]),
        });
        let (seq, frame) = bank.latest().expect("published");
        assert_eq!(seq, 1);
        assert_eq!(frame.serial, "S1");
        assert_eq!(frame.generation, 3);
        assert_eq!((frame.content_w, frame.content_h), (8, 16));
        assert_eq!((frame.picture_w, frame.picture_h), (10, 18));
        bank.clear();
        assert!(bank.latest().is_none());
    }
}
