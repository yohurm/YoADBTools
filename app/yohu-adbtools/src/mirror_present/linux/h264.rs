//! Annex-B H.264 头解析。只够填 VA 的 picture / slice 参数。不是一个解码器。

pub struct Sps {
    pub profile_idc: u8,
    pub chroma_format_idc: u32,
    pub bit_depth_luma_minus8: u32,
    pub bit_depth_chroma_minus8: u32,
    pub log2_max_frame_num_minus4: u32,
    pub pic_order_cnt_type: u32,
    pub log2_max_pic_order_cnt_lsb_minus4: u32,
    pub delta_pic_order_always_zero_flag: bool,
    pub max_num_ref_frames: u32,
    pub gaps_in_frame_num_value_allowed_flag: bool,
    pub pic_width_in_mbs_minus1: u32,
    pub pic_height_in_map_units_minus1: u32,
    pub frame_mbs_only_flag: bool,
    pub mb_adaptive_frame_field_flag: bool,
    pub direct_8x8_inference_flag: bool,
    pub crop_left: u32,
    pub crop_right: u32,
    pub crop_top: u32,
    pub crop_bottom: u32,
}

impl Sps {
    pub fn display_size(&self) -> (u32, u32) {
        let coded_w = (self.pic_width_in_mbs_minus1 + 1) * 16;
        let map_h = (self.pic_height_in_map_units_minus1 + 1) * 16;
        let coded_h = if self.frame_mbs_only_flag { map_h } else { map_h * 2 };
        let (sub_x, sub_y) = match self.chroma_format_idc {
            1 => (2, 2),
            2 => (2, 1),
            _ => (1, 1),
        };
        let unit_y = sub_y * if self.frame_mbs_only_flag { 1 } else { 2 };
        let w = coded_w.saturating_sub((self.crop_left + self.crop_right) * sub_x);
        let h = coded_h.saturating_sub((self.crop_top + self.crop_bottom) * unit_y);
        (w.max(2), h.max(2))
    }

    pub fn coded_size(&self) -> (u32, u32) {
        let w = (self.pic_width_in_mbs_minus1 + 1) * 16;
        let map_h = (self.pic_height_in_map_units_minus1 + 1) * 16;
        let h = if self.frame_mbs_only_flag { map_h } else { map_h * 2 };
        (w, h)
    }
}

pub struct Pps {
    pub entropy_coding_mode_flag: bool,
    pub bottom_field_pic_order_in_frame_present_flag: bool,
    pub num_ref_idx_l0_default_active_minus1: u32,
    pub num_ref_idx_l1_default_active_minus1: u32,
    pub weighted_pred_flag: bool,
    pub weighted_bipred_idc: u32,
    pub pic_init_qp_minus26: i32,
    pub chroma_qp_index_offset: i32,
    pub second_chroma_qp_index_offset: i32,
    pub deblocking_filter_control_present_flag: bool,
    pub constrained_intra_pred_flag: bool,
    pub redundant_pic_cnt_present_flag: bool,
    pub transform_8x8_mode_flag: bool,
}

pub struct SliceHeader {
    pub first_mb_in_slice: u32,
    pub slice_type: u32,
    pub frame_num: u32,
    pub field_pic_flag: bool,
    pub idr_pic_id: u32,
    pub pic_order_cnt_lsb: u32,
    pub nal_ref_idc: u8,
    pub nal_unit_type: u8,
    pub num_ref_idx_l0_active_minus1: u32,
    pub num_ref_idx_l1_active_minus1: u32,
    pub direct_spatial_mv_pred_flag: bool,
    pub cabac_init_idc: u32,
    pub slice_qp_delta: i32,
    pub disable_deblocking_filter_idc: u32,
    pub slice_alpha_c0_offset_div2: i32,
    pub slice_beta_offset_div2: i32,
    /// RBSP 上从 NAL 头到 slice_data 的比特数。VA 的 `slice_data_bit_offset` 认这个。
    pub header_bits: u16,
}

struct Bits<'a> {
    data: &'a [u8],
    bit: usize,
}

impl<'a> Bits<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, bit: 0 }
    }

    fn pos(&self) -> usize {
        self.bit
    }

    fn u(&mut self, n: u32) -> u32 {
        let mut v = 0u32;
        for _ in 0..n {
            let byte = self.bit / 8;
            let shift = 7 - (self.bit % 8);
            let bit = self.data.get(byte).copied().unwrap_or(0) >> shift & 1;
            v = (v << 1) | u32::from(bit);
            self.bit += 1;
        }
        v
    }

    fn flag(&mut self) -> bool {
        self.u(1) == 1
    }

    fn ue(&mut self) -> u32 {
        let mut zeros = 0u32;
        while zeros < 31 && self.bit / 8 < self.data.len() && !self.flag() {
            zeros += 1;
        }
        if zeros == 0 || self.bit / 8 > self.data.len() {
            return 0;
        }
        (1u32 << zeros) - 1 + self.u(zeros)
    }

    fn se(&mut self) -> i32 {
        let v = self.ue();
        if v & 1 == 0 {
            -((v / 2) as i32)
        } else {
            (v / 2 + 1) as i32
        }
    }
}

fn rbsp(nal: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(nal.len());
    let mut zeros = 0;
    for &b in nal {
        if zeros >= 2 && b == 0x03 {
            zeros = 0;
            continue;
        }
        out.push(b);
        if b == 0 {
            zeros += 1;
        } else {
            zeros = 0;
        }
    }
    out
}

pub fn annexb_nals(data: &[u8]) -> Vec<&[u8]> {
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
    let mut nals = Vec::new();
    for (idx, start) in starts.iter().copied().enumerate() {
        let end = starts.get(idx + 1).map(|next| {
            if *next >= 4 && data.get(*next - 4..*next) == Some(&[0, 0, 0, 1]) {
                *next - 4
            } else {
                *next - 3
            }
        }).unwrap_or(data.len());
        if start < end {
            nals.push(&data[start..end]);
        }
    }
    nals
}

fn high_profile(profile: u8) -> bool {
    matches!(
        profile,
        100 | 110 | 122 | 244 | 44 | 83 | 86 | 118 | 128 | 138 | 139 | 134 | 135
    )
}

fn skip_scaling_list(bits: &mut Bits<'_>, size: u32) {
    let mut last = 8i32;
    let mut next = 8i32;
    for _ in 0..size {
        if next != 0 {
            let delta = bits.se();
            next = (last + delta).rem_euclid(256);
        }
        last = if next == 0 { last } else { next };
    }
}

pub fn parse_sps(nal: &[u8]) -> Result<Sps, String> {
    if nal.first().map(|b| b & 0x1f) != Some(7) {
        return Err("不是 SPS".into());
    }
    let raw = rbsp(nal);
    let mut b = Bits::new(&raw);
    let _ = b.u(8);
    let profile_idc = b.u(8) as u8;
    let _constraint = b.u(8);
    let _level = b.u(8);
    let _sps_id = b.ue();
    let mut chroma = 1u32;
    let mut bit_luma = 0u32;
    let mut bit_chroma = 0u32;
    if high_profile(profile_idc) {
        chroma = b.ue();
        if chroma == 3 {
            let _separate = b.flag();
        }
        bit_luma = b.ue();
        bit_chroma = b.ue();
        let _bypass = b.flag();
        if b.flag() {
            let n = if chroma == 3 { 12 } else { 8 };
            for i in 0..n {
                if b.flag() {
                    skip_scaling_list(&mut b, if i < 6 { 16 } else { 64 });
                }
            }
        }
    }
    let log2_max_frame_num_minus4 = b.ue();
    let pic_order_cnt_type = b.ue();
    let mut log2_poc = 0u32;
    let mut delta_zero = false;
    if pic_order_cnt_type == 0 {
        log2_poc = b.ue();
    } else if pic_order_cnt_type == 1 {
        delta_zero = b.flag();
        let _off0 = b.se();
        let _off1 = b.se();
        let n = b.ue();
        for _ in 0..n {
            let _ = b.se();
        }
    }
    let max_num_ref_frames = b.ue();
    let gaps = b.flag();
    let pic_width_in_mbs_minus1 = b.ue();
    let pic_height_in_map_units_minus1 = b.ue();
    let frame_mbs_only_flag = b.flag();
    let mut mbaff = false;
    if !frame_mbs_only_flag {
        mbaff = b.flag();
    }
    let direct_8x8 = b.flag();
    let mut crop = [0u32; 4];
    if b.flag() {
        for slot in &mut crop {
            *slot = b.ue();
        }
    }
    Ok(Sps {
        profile_idc,
        chroma_format_idc: chroma,
        bit_depth_luma_minus8: bit_luma,
        bit_depth_chroma_minus8: bit_chroma,
        log2_max_frame_num_minus4,
        pic_order_cnt_type,
        log2_max_pic_order_cnt_lsb_minus4: log2_poc,
        delta_pic_order_always_zero_flag: delta_zero,
        max_num_ref_frames,
        gaps_in_frame_num_value_allowed_flag: gaps,
        pic_width_in_mbs_minus1,
        pic_height_in_map_units_minus1,
        frame_mbs_only_flag,
        mb_adaptive_frame_field_flag: mbaff,
        direct_8x8_inference_flag: direct_8x8,
        crop_left: crop[0],
        crop_right: crop[1],
        crop_top: crop[2],
        crop_bottom: crop[3],
    })
}

pub fn parse_pps(nal: &[u8]) -> Result<Pps, String> {
    if nal.first().map(|b| b & 0x1f) != Some(8) {
        return Err("不是 PPS".into());
    }
    let raw = rbsp(nal);
    let mut b = Bits::new(&raw);
    let _ = b.u(8);
    let _pps_id = b.ue();
    let _sps_id = b.ue();
    let entropy = b.flag();
    let bottom = b.flag();
    if b.ue() != 0 {
        return Err("不支持 FMO".into());
    }
    let l0 = b.ue();
    let l1 = b.ue();
    let weighted_pred = b.flag();
    let weighted_bipred = b.u(2);
    let init_qp = b.se();
    let _init_qs = b.se();
    let chroma_off = b.se();
    let deblock = b.flag();
    let constrained = b.flag();
    let redundant = b.flag();
    let mut transform_8x8 = false;
    let mut second = chroma_off;
    if b.pos() + 1 < raw.len() * 8 {
        transform_8x8 = b.flag();
        if b.flag() {
            for i in 0..if transform_8x8 { 8 } else { 6 } {
                if b.flag() {
                    skip_scaling_list(&mut b, if i < 6 { 16 } else { 64 });
                }
            }
        }
        if b.pos() + 1 < raw.len() * 8 {
            second = b.se();
        }
    }
    Ok(Pps {
        entropy_coding_mode_flag: entropy,
        bottom_field_pic_order_in_frame_present_flag: bottom,
        num_ref_idx_l0_default_active_minus1: l0,
        num_ref_idx_l1_default_active_minus1: l1,
        weighted_pred_flag: weighted_pred,
        weighted_bipred_idc: weighted_bipred,
        pic_init_qp_minus26: init_qp,
        chroma_qp_index_offset: chroma_off,
        second_chroma_qp_index_offset: second,
        deblocking_filter_control_present_flag: deblock,
        constrained_intra_pred_flag: constrained,
        redundant_pic_cnt_present_flag: redundant,
        transform_8x8_mode_flag: transform_8x8,
    })
}

fn slice_is_b(slice_type: u32) -> bool {
    slice_type % 5 == 1
}

fn slice_is_p(slice_type: u32) -> bool {
    slice_type.is_multiple_of(5)
}

fn slice_is_i(slice_type: u32) -> bool {
    matches!(slice_type % 5, 2 | 4)
}

pub fn parse_slice(nal: &[u8], sps: &Sps, pps: &Pps) -> Result<SliceHeader, String> {
    let nal_ref_idc = nal.first().map(|b| (b >> 5) & 3).unwrap_or(0);
    let nal_unit_type = nal.first().map(|b| b & 0x1f).unwrap_or(0);
    if !matches!(nal_unit_type, 1 | 5) {
        return Err("不是 VCL slice".into());
    }
    let raw = rbsp(nal);
    let mut b = Bits::new(&raw);
    let _ = b.u(8);
    let first_mb = b.ue();
    let slice_type = b.ue();
    let _pps_id = b.ue();
    let frame_num = b.u(sps.log2_max_frame_num_minus4 + 4);
    let mut field = false;
    if !sps.frame_mbs_only_flag {
        field = b.flag();
        if field {
            let _bottom = b.flag();
        }
    }
    let mut idr_pic_id = 0;
    if nal_unit_type == 5 {
        idr_pic_id = b.ue();
    }
    let mut poc_lsb = 0;
    if sps.pic_order_cnt_type == 0 {
        poc_lsb = b.u(sps.log2_max_pic_order_cnt_lsb_minus4 + 4);
        if pps.bottom_field_pic_order_in_frame_present_flag && !field {
            let _delta = b.se();
        }
    } else if sps.pic_order_cnt_type == 1 && !sps.delta_pic_order_always_zero_flag {
        let _ = b.se();
        if pps.bottom_field_pic_order_in_frame_present_flag && !field {
            let _ = b.se();
        }
    }
    if pps.redundant_pic_cnt_present_flag {
        let _ = b.ue();
    }
    let mut direct_spatial = false;
    if slice_is_b(slice_type) {
        direct_spatial = b.flag();
    }
    let mut l0 = pps.num_ref_idx_l0_default_active_minus1;
    let mut l1 = pps.num_ref_idx_l1_default_active_minus1;
    if (slice_is_p(slice_type) || slice_is_b(slice_type)) && b.flag() {
        l0 = b.ue();
        if slice_is_b(slice_type) {
            l1 = b.ue();
        }
    }
    if (pps.weighted_pred_flag && slice_is_p(slice_type))
        || (pps.weighted_bipred_idc == 1 && slice_is_b(slice_type))
    {
        return Err("加权预测不在这条 VA 路径里".into());
    }
    if nal_ref_idc != 0 {
        if nal_unit_type == 5 {
            let _ = b.flag();
            let _ = b.flag();
        } else if b.flag() {
            loop {
                let op = b.ue();
                if op == 0 || b.pos() / 8 > raw.len() + 8 {
                    break;
                }
                match op {
                    1 | 3 | 4 | 6 => {
                        let _ = b.ue();
                    }
                    2 => {
                        let _ = b.ue();
                    }
                    5 => {
                        let _ = b.ue();
                        let _ = b.ue();
                    }
                    _ => {}
                }
            }
        }
    }
    let mut cabac_init = 0;
    if pps.entropy_coding_mode_flag && !slice_is_i(slice_type) {
        cabac_init = b.ue();
    }
    let qp_delta = b.se();
    let mut disable = 0;
    let mut alpha = 0;
    let mut beta = 0;
    if pps.deblocking_filter_control_present_flag {
        disable = b.ue();
        if disable != 1 {
            alpha = b.se();
            beta = b.se();
        }
    }
    let header_bits = u16::try_from(b.pos()).unwrap_or(u16::MAX);
    Ok(SliceHeader {
        first_mb_in_slice: first_mb,
        slice_type,
        frame_num,
        field_pic_flag: field,
        idr_pic_id,
        pic_order_cnt_lsb: poc_lsb,
        nal_ref_idc,
        nal_unit_type,
        num_ref_idx_l0_active_minus1: l0,
        num_ref_idx_l1_active_minus1: l1,
        direct_spatial_mv_pred_flag: direct_spatial,
        cabac_init_idc: cabac_init,
        slice_qp_delta: qp_delta,
        disable_deblocking_filter_idc: disable,
        slice_alpha_c0_offset_div2: alpha,
        slice_beta_offset_div2: beta,
        header_bits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<u8> {
        const HEX: &str = "000000016742d00b8c8d44a403c2211a800000000168ce3c800000000165b80004000009e4c5000113f93aebc0";
        (0..HEX.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&HEX[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn openh264_baseline_sps_is_32_square() {
        let au = fixture();
        let nals = annexb_nals(&au);
        let sps = parse_sps(nals.iter().find(|n| n[0] & 0x1f == 7).unwrap()).unwrap();
        assert_eq!(sps.profile_idc, 66);
        assert_eq!(sps.display_size(), (32, 32));
        let pps = parse_pps(nals.iter().find(|n| n[0] & 0x1f == 8).unwrap()).unwrap();
        assert!(!pps.entropy_coding_mode_flag);
        let slice = parse_slice(nals.iter().find(|n| n[0] & 0x1f == 5).unwrap(), &sps, &pps).unwrap();
        assert_eq!(slice.nal_unit_type, 5);
        assert!(slice.header_bits > 8);
    }
}
