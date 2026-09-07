//! Annex-B 直播辅助：config 粘滞、关键帧拼 AU、NAL 切分 / AVCC。
//!
//! 与 OS 解码器无关。Windows MF 与 macOS VideoToolbox 共用。

use yohu_mirror::EncodedFrame;

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

#[allow(dead_code)]
pub fn annexb_to_avcc(data: &[u8]) -> Vec<u8> {
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

pub fn h264_nal_type(nal: &[u8]) -> u8 {
    nal.first().copied().unwrap_or(0) & 0x1F
}

pub fn hevc_nal_type(nal: &[u8]) -> u8 {
    nal.first().map(|b| (b >> 1) & 0x3F).unwrap_or(0)
}

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
}
