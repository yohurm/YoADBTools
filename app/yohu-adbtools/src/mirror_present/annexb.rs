//! Annex-B 直播辅助：config 粘滞、关键帧拼 AU、NAL 切分 / AVCC。
//!
//! 与 OS 解码器无关。Windows MF 与 macOS VideoToolbox 共用。

use std::time::Instant;

use yohu_mirror::EncodedFrame;

/// 首帧只认一次。已经记过就返回 false。
pub fn claim_first(seen: &mut bool) -> bool {
    if *seen {
        return false;
    }
    *seen = true;
    true
}

/// 解码座启动到现在的毫秒。
pub fn seat_elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis() as u64
}

/// 粘滞配置帧的编码号和载荷。没有帧就没有配置。
pub fn sticky_config(frame: Option<EncodedFrame>) -> Option<(u8, Vec<u8>)> {
    frame.map(|frame| (frame.codec, frame.payload))
}

pub fn select_live_frames(
    last_config: &mut Option<Vec<u8>>,
    frames: Vec<EncodedFrame>,
) -> Vec<EncodedFrame> {
    for frame in &frames {
        if frame.config {
            *last_config = Some(frame.payload.clone());
        }
    }
    frames.into_iter().filter(|f| !f.config).collect()
}

/// 第一帧只记下内容尺寸。之后宽高变了才返回 true。
pub fn note_content_size(last_w: &mut u32, last_h: &mut u32, width: u32, height: u32) -> bool {
    let changed = *last_w > 0 && (*last_w, *last_h) != (width, height);
    *last_w = width;
    *last_h = height;
    changed
}

/// 还没有解码器、启动失败没钉死本会话、并且这一帧有内容尺寸，才打开。
pub fn should_open_decoder(has_decoder: bool, failed: bool, has_size: bool) -> bool {
    !has_decoder && !failed && has_size
}

/// 打开失败就钉死本会话。成功把解码器交回，错误交回给平台打日志。
pub fn take_open<T, E>(failed: &mut bool, result: Result<T, E>) -> Result<T, E> {
    result.inspect_err(|_err| {
        *failed = true;
    })
}

/// 解码节拍属于哪一端。日志句不同，计数规则相同。
pub enum DecodeSeatKind {
    MediaFoundation,
    VideoToolbox,
}

/// 当前宿主的解码座。两个变体都在这一份里构造，各平台用 `cfg!` 选一支。
pub fn host_decode_seat() -> DecodeSeatKind {
    if cfg!(windows) {
        DecodeSeatKind::MediaFoundation
    } else if cfg!(target_os = "macos") {
        DecodeSeatKind::VideoToolbox
    } else {
        DecodeSeatKind::MediaFoundation
    }
}

/// 这一秒有喂入或解出才记一拍，然后两个计数都清零。
pub fn note_decode_beat(fed: &mut u32, decoded: &mut u32, kind: DecodeSeatKind) {
    if *fed > 0 || *decoded > 0 {
        match kind {
            DecodeSeatKind::MediaFoundation => {
                tracing::info!(fed = *fed, decoded = *decoded, "MF 解码节拍");
            }
            DecodeSeatKind::VideoToolbox => {
                tracing::info!(fed = *fed, decoded = *decoded, "VT 解码节拍");
            }
        }
    }
    *fed = 0;
    *decoded = 0;
}

/// 喂进一帧：先计一次，再拼这一帧的访问单元。
pub fn begin_feed(fed: &mut u32, config: Option<&[u8]>, payload: &[u8], keyframe: bool) -> Vec<u8> {
    *fed += 1;
    access_unit(config, payload, keyframe)
}

/// 一次 feed 或 drain 的结果。解出画面才增加解码计数。
pub enum FeedOutcome<T, E> {
    Picture(T),
    Empty,
    Failed(E),
}

pub fn take_feed<T, E>(decoded: &mut u32, result: Result<Option<T>, E>) -> FeedOutcome<T, E> {
    match result {
        Ok(Some(picture)) => {
            *decoded += 1;
            FeedOutcome::Picture(picture)
        }
        Ok(None) => FeedOutcome::Empty,
        Err(err) => FeedOutcome::Failed(err),
    }
}

pub fn access_unit(config: Option<&[u8]>, payload: &[u8], keyframe: bool) -> Vec<u8> {
    if keyframe {
        if let Some(cfg) = config {
            let mut au = Vec::with_capacity(cfg.len() + payload.len());
            au.extend_from_slice(cfg);
            au.extend_from_slice(payload);
            return au;
        }
    }
    payload.to_vec()
}

#[cfg(any(target_os = "macos", test))]
pub fn split_nals(data: &[u8]) -> Vec<&[u8]> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i..].starts_with(&[0, 0, 0, 1]) {
            starts.push(i + 4);
            i += 4;
            continue;
        }
        if data[i..].starts_with(&[0, 0, 1]) {
            starts.push(i + 3);
            i += 3;
            continue;
        }
        i += 1;
    }
    let mut nals = Vec::with_capacity(starts.len());
    for (idx, start) in starts.iter().copied().enumerate() {
        let end = starts
            .get(idx + 1)
            .map(|next| {
                if *next >= 4 && data[*next - 4..*next].starts_with(&[0, 0, 0, 1]) {
                    *next - 4
                } else {
                    *next - 3
                }
            })
            .unwrap_or(data.len());
        if start < end {
            nals.push(&data[start..end]);
        }
    }
    nals
}

#[cfg(target_os = "macos")]
pub fn h264_nal_type(nal: &[u8]) -> u8 {
    nal.first().copied().unwrap_or(0) & 0x1F
}

#[cfg(target_os = "macos")]
pub fn hevc_nal_type(nal: &[u8]) -> u8 {
    nal.first().map(|b| (b >> 1) & 0x3F).unwrap_or(0)
}

#[cfg(target_os = "macos")]
pub fn h264_parameter_sets<'a>(nals: &[&'a [u8]]) -> (Vec<&'a [u8]>, Vec<&'a [u8]>) {
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    for nal in nals {
        match h264_nal_type(nal) {
            7 => sps.push(*nal),
            8 => pps.push(*nal),
            _ => {}
        }
    }
    (sps, pps)
}

#[cfg(target_os = "macos")]
#[allow(clippy::type_complexity)]
pub fn hevc_parameter_sets<'a>(nals: &[&'a [u8]]) -> (Vec<&'a [u8]>, Vec<&'a [u8]>, Vec<&'a [u8]>) {
    let mut vps = Vec::new();
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    for nal in nals {
        match hevc_nal_type(nal) {
            32 => vps.push(*nal),
            33 => sps.push(*nal),
            34 => pps.push(*nal),
            _ => {}
        }
    }
    (vps, sps, pps)
}

#[cfg(target_os = "macos")]
pub fn vcl_avcc(hevc: bool, data: &[u8]) -> Vec<u8> {
    let nals = split_nals(data);
    let mut out = Vec::new();
    for nal in nals {
        let skip = if hevc {
            matches!(hevc_nal_type(nal), 32..=35)
        } else {
            matches!(h264_nal_type(nal), 7..=9)
        };
        if skip {
            continue;
        }
        let len = nal.len() as u32;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(nal);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nal(kind: u8, rest: &[u8]) -> Vec<u8> {
        let mut v = vec![0, 0, 0, 1, kind];
        v.extend_from_slice(rest);
        v
    }

    fn annexb_to_avcc(data: &[u8]) -> Vec<u8> {
        let nals = split_nals(data);
        if nals.is_empty() {
            if data.len() >= 4 {
                return data.to_vec();
            }
            return Vec::new();
        }
        let mut out = Vec::new();
        for nal in nals {
            let len = nal.len() as u32;
            out.extend_from_slice(&len.to_be_bytes());
            out.extend_from_slice(nal);
        }
        out
    }

    #[test]
    fn split_and_avcc_roundtrip_lengths() {
        let mut buf = nal(0x67, &[1, 2, 3]);
        buf.extend_from_slice(&nal(0x65, &[9, 9]));
        let nals = split_nals(&buf);
        assert_eq!(nals.len(), 2);
        assert_eq!(nals[0][0], 0x67);
        assert_eq!(nals[1][0], 0x65);
        let avcc = annexb_to_avcc(&buf);
        assert_eq!(&avcc[0..4], 4u32.to_be_bytes().as_slice());
        assert_eq!(&avcc[4], &0x67);
    }

    #[test]
    fn access_unit_prefixes_config_on_keyframe() {
        let au = access_unit(Some(&[1, 2]), &[3, 4], true);
        assert_eq!(au, vec![1, 2, 3, 4]);
        assert_eq!(access_unit(Some(&[1, 2]), &[3, 4], false), vec![3, 4]);
    }

    #[test]
    fn select_live_keeps_sticky_config() {
        let mut last = None;
        let frames = vec![
            EncodedFrame {
                generation: 1,
                width: 8,
                height: 8,
                config: true,
                keyframe: false,
                pts: 0,
                codec: 0,
                payload: vec![7],
                dropped: 0,
            },
            EncodedFrame {
                generation: 1,
                width: 8,
                height: 8,
                config: false,
                keyframe: true,
                pts: 1,
                codec: 0,
                payload: vec![5],
                dropped: 0,
            },
        ];
        let live = select_live_frames(&mut last, frames);
        assert_eq!(last.as_deref(), Some(&[7][..]));
        assert_eq!(live.len(), 1);
        assert!(live[0].keyframe);
    }

    #[test]
    fn first_content_size_is_not_a_change() {
        let mut w = 0;
        let mut h = 0;
        assert!(!note_content_size(&mut w, &mut h, 10, 20));
        assert_eq!((w, h), (10, 20));
        assert!(!note_content_size(&mut w, &mut h, 10, 20));
        assert!(note_content_size(&mut w, &mut h, 11, 20));
        assert_eq!((w, h), (11, 20));
    }

    #[test]
    fn content_size_change_is_shared() {
        let here = include_str!("annexb.rs");
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(here.contains("fn note_content_size"));
        assert!(!windows.contains("last_content_w > 0"));
        assert!(!macos.contains("last_content_w > 0"));
    }

    #[test]
    fn open_decoder_only_when_absent_unfailed_and_sized() {
        assert!(!should_open_decoder(true, false, true));
        assert!(!should_open_decoder(false, true, true));
        assert!(!should_open_decoder(false, false, false));
        assert!(should_open_decoder(false, false, true));
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(!windows.contains("decoder.is_none()"));
        assert!(!macos.contains("decoder.is_none()"));
    }

    #[test]
    fn decode_beat_logs_then_clears_both_counts() {
        let mut fed = 0;
        let mut decoded = 0;
        note_decode_beat(&mut fed, &mut decoded, DecodeSeatKind::MediaFoundation);
        assert_eq!((fed, decoded), (0, 0));
        fed = 2;
        decoded = 1;
        note_decode_beat(&mut fed, &mut decoded, DecodeSeatKind::VideoToolbox);
        assert_eq!((fed, decoded), (0, 0));
        let here = include_str!("annexb.rs");
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(here.contains("MF 解码节拍"));
        assert!(here.contains("VT 解码节拍"));
        assert!(!windows.contains("解码节拍"));
        assert!(!macos.contains("解码节拍"));
    }

    #[test]
    fn sticky_config_is_codec_and_payload() {
        assert!(sticky_config(None).is_none());
        let got = sticky_config(Some(EncodedFrame {
            generation: 1,
            width: 8,
            height: 8,
            config: true,
            keyframe: false,
            pts: 3,
            codec: 1,
            payload: vec![9],
            dropped: 0,
        }))
        .expect("config");
        assert_eq!(got, (1, vec![9]));
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(!windows.contains("Some(frame.payload)"));
        assert!(!macos.contains("Some(frame.payload)"));
    }

    #[test]
    fn feed_counts_a_picture_and_not_an_empty_result() {
        let mut fed = 0;
        let mut decoded = 0;
        let au = begin_feed(&mut fed, Some(&[1]), &[2], true);
        assert_eq!(fed, 1);
        assert_eq!(au, vec![1, 2]);
        assert!(matches!(
            take_feed(&mut decoded, Ok::<Option<u8>, &str>(None)),
            FeedOutcome::Empty
        ));
        assert_eq!(decoded, 0);
        assert!(matches!(
            take_feed(&mut decoded, Ok::<Option<u8>, &str>(Some(7))),
            FeedOutcome::Picture(7)
        ));
        assert_eq!(decoded, 1);
        assert!(matches!(
            take_feed(&mut decoded, Err::<Option<u8>, &str>("x")),
            FeedOutcome::Failed("x")
        ));
        assert_eq!(decoded, 1);
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(!windows.contains("decoded += 1"));
        assert!(!macos.contains("decoded += 1"));
        assert!(!windows.contains("fed += 1"));
        assert!(!macos.contains("fed += 1"));
    }

    #[test]
    fn first_frame_is_claimed_once() {
        let mut seen = false;
        assert!(claim_first(&mut seen));
        assert!(!claim_first(&mut seen));
        let started = std::time::Instant::now();
        let ms = seat_elapsed_ms(started);
        assert!(ms < 5_000);
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert!(!windows.contains("if self.first"));
        assert!(!macos.contains("if self.first"));
        assert!(!windows.contains(".as_millis()"));
        assert!(!macos.contains(".as_millis()"));
    }

    #[test]
    fn open_failure_latches_the_session() {
        let mut failed = false;
        assert_eq!(take_open(&mut failed, Ok::<u8, &str>(1)).expect("open"), 1);
        assert!(!failed);
        assert!(take_open(&mut failed, Err::<u8, &str>("x")).is_err());
        assert!(failed);
        let windows = include_str!("windows/decode.rs");
        let macos = include_str!("macos/decode.rs");
        assert_eq!(windows.matches("self.failed = true").count(), 1);
        assert_eq!(windows.matches("self.end_session()").count(), 2);
        assert_eq!(macos.matches("self.failed = true").count(), 0);
    }
}
