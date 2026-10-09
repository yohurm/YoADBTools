//! libva H.264 VLD。不经过 FFmpeg，也不链 libva：运行时 `dlopen`。
//!
//! 没有 `/dev/dri`、`vaInitialize` 失败、或没有 H.264 VLD 时返回 `None`，
//! 调用方改走 OpenH264。X11 上能 `vaPutSurface` 就画进子窗口；否则把表面
//! 读成 I420，仍由同一块 GTK 子窗口 Present。

use std::ffi::CString;
use std::os::raw::{c_char, c_int, c_void};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::color::{copy_i420, nv12_to_i420, OwnedYuv};
use super::h264::{self, Pps, SliceHeader, Sps};

const H264_PROFILES: [i32; 3] = [7, 6, 13];
const HEVC_MAIN: i32 = 17;
const VLD: i32 = 1;
const YUV420: u32 = 1;
const PROGRESSIVE: i32 = 1;
const INVALID: u32 = 0xffff_ffff;
const SHORT_TERM: u32 = 0x8;
const PIC_INVALID: u32 = 0x1;
const SURFACES: usize = 16;
const NV12: u32 = 0x3231_564e;
const I420: u32 = 0x3032_3449;
const YV12: u32 = 0x3231_5659;

pub struct VaProbe {
    pub h264: bool,
    pub hevc: bool,
}

pub fn probe_caps() -> VaProbe {
    let Some(mut disp) = open_display() else {
        return VaProbe {
            h264: false,
            hevc: false,
        };
    };
    let h264 = has_profile(&disp, &H264_PROFILES);
    let hevc = has_profile(&disp, &[HEVC_MAIN]);
    disp.terminate();
    VaProbe { h264, hevc }
}

/// GTK 回调里的一次 `vaPutSurface`。表面在 `done` 置位前不回收。
pub struct VaBlit {
    pub dpy: usize,
    pub surface: u32,
    pub src_w: u16,
    pub src_h: u16,
    pub done: Arc<AtomicBool>,
    pub lock: Arc<Mutex<()>>,
    pub put: PutSurface,
}

impl Drop for VaBlit {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
    }
}

impl VaBlit {
    /// 画进子窗口。返回后表面可以回收；失败则调用方改用 cairo。
    pub fn put_into(&self, xid: u64, x: i32, y: i32, w: u32, h: u32) -> bool {
        if xid == 0 || w == 0 || h == 0 {
            return false;
        }
        let Ok(_guard) = self.lock.lock() else {
            return false;
        };
        let st = unsafe {
            (self.put)(
                self.dpy as *mut c_void,
                self.surface,
                xid as usize,
                0,
                0,
                self.src_w,
                self.src_h,
                x as i16,
                y as i16,
                w as u16,
                h as u16,
                std::ptr::null_mut(),
                0,
                0,
            )
        };
        st == 0
    }
}

pub type PutSurface = unsafe extern "C" fn(
    *mut c_void,
    u32,
    usize,
    i16,
    i16,
    u16,
    u16,
    i16,
    i16,
    u16,
    u16,
    *mut c_void,
    u32,
    u32,
) -> i32;

pub struct VaDecoder {
    disp: Display,
    config: u32,
    context: u32,
    surfaces: [u32; SURFACES],
    done: [Arc<AtomicBool>; SURFACES],
    cursor: usize,
    coded_w: u32,
    coded_h: u32,
    sps: Option<Sps>,
    pps: Option<Pps>,
    dpb: Vec<RefPic>,
    frame_num: u32,
    lock: Arc<Mutex<()>>,
    xid: Arc<AtomicU64>,
}

struct RefPic {
    surface: u32,
    frame_idx: u32,
    poc: i32,
    slot: usize,
}

unsafe impl Send for VaDecoder {}

impl Drop for VaDecoder {
    fn drop(&mut self) {
        self.destroy_context();
        self.disp.terminate();
    }
}

impl VaDecoder {
    pub fn open(xid: Arc<AtomicU64>) -> Option<Self> {
        let disp = open_display()?;
        if !has_profile(&disp, &H264_PROFILES) {
            let mut disp = disp;
            disp.terminate();
            return None;
        }
        let profile = first_profile(&disp, &H264_PROFILES)?;
        let mut config = INVALID;
        let st = unsafe {
            (disp.create_config)(
                disp.dpy,
                profile,
                VLD,
                std::ptr::null(),
                0,
                &mut config,
            )
        };
        if st != 0 || config == INVALID {
            let mut disp = disp;
            disp.terminate();
            return None;
        }
        let done = std::array::from_fn(|_| Arc::new(AtomicBool::new(true)));
        Some(Self {
            disp,
            config,
            context: INVALID,
            surfaces: [INVALID; SURFACES],
            done,
            cursor: 0,
            coded_w: 0,
            coded_h: 0,
            sps: None,
            pps: None,
            dpb: Vec::new(),
            frame_num: 0,
            lock: Arc::new(Mutex::new(())),
            xid,
        })
    }

    pub fn feed(&mut self, annexb: &[u8]) -> Result<Option<(OwnedYuv, Option<VaBlit>)>, String> {
        let nals = h264::annexb_nals(annexb);
        let mut slices: Vec<(&[u8], SliceHeader)> = Vec::new();
        for nal in &nals {
            let kind = nal.first().map(|b| b & 0x1f).unwrap_or(0);
            match kind {
                7 => self.sps = Some(h264::parse_sps(nal)?),
                8 => self.pps = Some(h264::parse_pps(nal)?),
                1 | 5 => {
                    let sps = self.sps.as_ref().ok_or("还没有 SPS")?;
                    let pps = self.pps.as_ref().ok_or("还没有 PPS")?;
                    slices.push((*nal, h264::parse_slice(nal, sps, pps)?));
                }
                _ => {}
            }
        }
        if slices.is_empty() {
            return Ok(None);
        }
        self.ensure_context()?;
        let (slot, surface) = self.alloc_surface()?;
        let _guard = self.lock.lock().expect("va lock");
        let header = &slices[0].1;
        if header.nal_unit_type == 5 {
            self.dpb.clear();
        }
        let poc = self.poc_of(header);
        let pic = self.picture_param(surface, header, poc);
        let iq = iq_matrix();
        let mut buffers = Vec::new();
        buffers.push(self.mk_buf(0, &pic)?);
        buffers.push(self.mk_buf(1, &iq)?);
        for (nal, slice) in &slices {
            let param = self.slice_param(nal, slice);
            buffers.push(self.mk_buf(4, &param)?);
            buffers.push(self.mk_buf(5, nal)?);
        }
        let st = unsafe { (self.disp.begin)(self.disp.dpy, self.context, surface) };
        if st != 0 {
            self.free_bufs(&buffers);
            self.done[slot].store(true, Ordering::SeqCst);
            return Err(format!("vaBeginPicture {st}"));
        }
        let st = unsafe {
            (self.disp.render)(
                self.disp.dpy,
                self.context,
                buffers.as_ptr(),
                buffers.len() as i32,
            )
        };
        let end = unsafe { (self.disp.end)(self.disp.dpy, self.context) };
        let sync = unsafe { (self.disp.sync)(self.disp.dpy, surface) };
        self.free_bufs(&buffers);
        if st != 0 || end != 0 || sync != 0 {
            self.done[slot].store(true, Ordering::SeqCst);
            return Err(format!("va 提交失败 begin-render {st} end {end} sync {sync}"));
        }
        let yuv = self.copy_surface(surface)?;
        if header.nal_ref_idc != 0 {
            self.dpb.push(RefPic {
                surface,
                frame_idx: header.frame_num,
                poc,
                slot,
            });
            let keep = self.sps.as_ref().map(|s| s.max_num_ref_frames).unwrap_or(1).max(1) as usize;
            while self.dpb.len() > keep {
                self.dpb.remove(0);
            }
        }
        self.frame_num = header.frame_num;
        let blit = self.blit_for(slot, surface, &yuv);
        Ok(Some((yuv, blit)))
    }

    fn blit_for(&self, slot: usize, surface: u32, yuv: &OwnedYuv) -> Option<VaBlit> {
        if !self.disp.x11 || self.disp.put.is_none() || self.xid.load(Ordering::SeqCst) == 0 {
            self.done[slot].store(true, Ordering::SeqCst);
            return None;
        }
        Some(VaBlit {
            dpy: self.disp.dpy as usize,
            surface,
            src_w: yuv.width.min(u16::MAX as u32) as u16,
            src_h: yuv.height.min(u16::MAX as u32) as u16,
            done: Arc::clone(&self.done[slot]),
            lock: Arc::clone(&self.lock),
            put: self.disp.put.expect("put"),
        })
    }

    fn poc_of(&self, header: &SliceHeader) -> i32 {
        let sps = self.sps.as_ref();
        match sps.map(|s| s.pic_order_cnt_type).unwrap_or(0) {
            0 => header.pic_order_cnt_lsb as i32,
            _ => {
                if header.nal_ref_idc == 0 {
                    header.frame_num as i32 * 2 - 1
                } else {
                    header.frame_num as i32 * 2
                }
            }
        }
    }

    fn ensure_context(&mut self) -> Result<(), String> {
        let sps = self.sps.as_ref().ok_or("还没有 SPS")?;
        let (w, h) = sps.coded_size();
        if self.context != INVALID && self.coded_w == w && self.coded_h == h {
            return Ok(());
        }
        self.destroy_context();
        let mut surfaces = [INVALID; SURFACES];
        let st = unsafe {
            (self.disp.create_surfaces)(
                self.disp.dpy,
                YUV420,
                w,
                h,
                surfaces.as_mut_ptr(),
                SURFACES as u32,
                std::ptr::null(),
                0,
            )
        };
        if st != 0 {
            return Err(format!("vaCreateSurfaces {st}"));
        }
        let mut context = INVALID;
        let st = unsafe {
            (self.disp.create_context)(
                self.disp.dpy,
                self.config,
                w as i32,
                h as i32,
                PROGRESSIVE,
                surfaces.as_mut_ptr(),
                SURFACES as i32,
                &mut context,
            )
        };
        if st != 0 {
            unsafe {
                (self.disp.destroy_surfaces)(self.disp.dpy, surfaces.as_mut_ptr(), SURFACES as i32);
            }
            return Err(format!("vaCreateContext {st}"));
        }
        self.surfaces = surfaces;
        self.context = context;
        self.coded_w = w;
        self.coded_h = h;
        for flag in &self.done {
            flag.store(true, Ordering::SeqCst);
        }
        self.dpb.clear();
        Ok(())
    }

    fn alloc_surface(&mut self) -> Result<(usize, u32), String> {
        let start = Instant::now();
        loop {
            for step in 0..SURFACES {
                let slot = (self.cursor + step) % SURFACES;
                if self.done[slot].load(Ordering::SeqCst) {
                    self.done[slot].store(false, Ordering::SeqCst);
                    self.cursor = (slot + 1) % SURFACES;
                    return Ok((slot, self.surfaces[slot]));
                }
            }
            if start.elapsed() > Duration::from_millis(200) {
                return Err("VA 表面都还在 Present".into());
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    }

    fn picture_param(&self, surface: u32, header: &SliceHeader, poc: i32) -> Vec<u8> {
        let sps = self.sps.as_ref().expect("sps");
        let pps = self.pps.as_ref().expect("pps");
        let mut buf = vec![0u8; 672];
        write_pic(&mut buf, 0, surface, header.frame_num, if header.nal_ref_idc != 0 { SHORT_TERM } else { 0 }, poc);
        for i in 0..16 {
            let off = 36 + i * 36;
            if let Some(r#ref) = self.dpb.get(i) {
                write_pic(&mut buf, off, r#ref.surface, r#ref.frame_idx, SHORT_TERM, r#ref.poc);
            } else {
                write_pic(&mut buf, off, INVALID, 0, PIC_INVALID, 0);
            }
        }
        write_u16(&mut buf, 612, sps.pic_width_in_mbs_minus1 as u16);
        write_u16(&mut buf, 614, sps.pic_height_in_map_units_minus1 as u16);
        buf[616] = sps.bit_depth_luma_minus8 as u8;
        buf[617] = sps.bit_depth_chroma_minus8 as u8;
        buf[618] = sps.max_num_ref_frames.min(16) as u8;
        let seq = (sps.chroma_format_idc & 3)
            | u32::from(sps.gaps_in_frame_num_value_allowed_flag) << 3
            | u32::from(sps.frame_mbs_only_flag) << 4
            | u32::from(sps.mb_adaptive_frame_field_flag) << 5
            | u32::from(sps.direct_8x8_inference_flag) << 6
            | (sps.log2_max_frame_num_minus4 & 15) << 8
            | (sps.pic_order_cnt_type & 3) << 12
            | (sps.log2_max_pic_order_cnt_lsb_minus4 & 15) << 14
            | u32::from(sps.delta_pic_order_always_zero_flag) << 18;
        write_u32(&mut buf, 620, seq);
        buf[628] = pps.pic_init_qp_minus26 as i8 as u8;
        buf[630] = pps.chroma_qp_index_offset as i8 as u8;
        buf[631] = pps.second_chroma_qp_index_offset as i8 as u8;
        let pic = u32::from(pps.entropy_coding_mode_flag)
            | u32::from(pps.weighted_pred_flag) << 1
            | (pps.weighted_bipred_idc & 3) << 2
            | u32::from(pps.transform_8x8_mode_flag) << 4
            | u32::from(header.field_pic_flag) << 5
            | u32::from(pps.constrained_intra_pred_flag) << 6
            | u32::from(pps.bottom_field_pic_order_in_frame_present_flag) << 7
            | u32::from(pps.deblocking_filter_control_present_flag) << 8
            | u32::from(pps.redundant_pic_cnt_present_flag) << 9
            | u32::from(header.nal_ref_idc != 0) << 10;
        write_u32(&mut buf, 632, pic);
        write_u16(&mut buf, 636, header.frame_num as u16);
        buf
    }

    fn slice_param(&self, nal: &[u8], slice: &SliceHeader) -> Vec<u8> {
        let mut buf = vec![0u8; 3128];
        write_u32(&mut buf, 0, nal.len() as u32);
        write_u16(&mut buf, 12, slice.header_bits);
        write_u16(&mut buf, 14, slice.first_mb_in_slice as u16);
        buf[16] = slice.slice_type as u8;
        buf[17] = u8::from(slice.direct_spatial_mv_pred_flag);
        buf[18] = slice.num_ref_idx_l0_active_minus1 as u8;
        buf[19] = slice.num_ref_idx_l1_active_minus1 as u8;
        buf[20] = slice.cabac_init_idc as u8;
        buf[21] = slice.slice_qp_delta as i8 as u8;
        buf[22] = slice.disable_deblocking_filter_idc as u8;
        buf[23] = slice.slice_alpha_c0_offset_div2 as i8 as u8;
        buf[24] = slice.slice_beta_offset_div2 as i8 as u8;
        for i in 0..32 {
            let off = 28 + i * 36;
            if let Some(r#ref) = self.dpb.get(i) {
                write_pic(&mut buf, off, r#ref.surface, r#ref.frame_idx, SHORT_TERM, r#ref.poc);
            } else {
                write_pic(&mut buf, off, INVALID, 0, PIC_INVALID, 0);
            }
            let off1 = 1180 + i * 36;
            write_pic(&mut buf, off1, INVALID, 0, PIC_INVALID, 0);
        }
        buf
    }

    fn copy_surface(&self, surface: u32) -> Result<OwnedYuv, String> {
        let mut image = [0u8; 120];
        let st = unsafe { (self.disp.derive)(self.disp.dpy, surface, image.as_mut_ptr()) };
        if st != 0 {
            return Err(format!("vaDeriveImage {st}"));
        }
        let fourcc = read_u32(&image, 4);
        let buf = read_u32(&image, 52);
        let width = read_u16(&image, 56) as u32;
        let height = read_u16(&image, 58) as u32;
        let pitches = [
            read_u32(&image, 68) as usize,
            read_u32(&image, 72) as usize,
            read_u32(&image, 76) as usize,
        ];
        let offsets = [
            read_u32(&image, 80) as usize,
            read_u32(&image, 84) as usize,
            read_u32(&image, 88) as usize,
        ];
        let mut ptr = std::ptr::null_mut();
        let st = unsafe { (self.disp.map)(self.disp.dpy, buf, &mut ptr) };
        let copied = if st != 0 || ptr.is_null() {
            Err(format!("vaMapBuffer {st}"))
        } else {
            copy_planes(ptr as *const u8, fourcc, width, height, &pitches, &offsets)
        };
        unsafe {
            if st == 0 {
                (self.disp.unmap)(self.disp.dpy, buf);
            }
            (self.disp.destroy_image)(self.disp.dpy, read_u32(&image, 0));
        }
        let mut yuv = copied?;
        if let Some(sps) = &self.sps {
            let (dw, dh) = sps.display_size();
            if dw < yuv.width || dh < yuv.height {
                yuv = crop_yuv(yuv, dw, dh);
            }
        }
        Ok(yuv)
    }

    fn mk_buf(&self, kind: i32, data: &[u8]) -> Result<u32, String> {
        let mut id = INVALID;
        let st = unsafe {
            (self.disp.create_buffer)(
                self.disp.dpy,
                self.context,
                kind,
                data.len() as u32,
                1,
                data.as_ptr() as *mut c_void,
                &mut id,
            )
        };
        if st != 0 {
            return Err(format!("vaCreateBuffer {kind} {st}"));
        }
        Ok(id)
    }

    fn free_bufs(&self, ids: &[u32]) {
        for id in ids {
            unsafe {
                (self.disp.destroy_buffer)(self.disp.dpy, *id);
            }
        }
    }

    fn destroy_context(&mut self) {
        if self.context != INVALID {
            unsafe { (self.disp.destroy_context)(self.disp.dpy, self.context) };
            self.context = INVALID;
        }
        if self.surfaces.iter().any(|s| *s != INVALID) {
            unsafe {
                (self.disp.destroy_surfaces)(
                    self.disp.dpy,
                    self.surfaces.as_mut_ptr(),
                    SURFACES as i32,
                );
            }
            self.surfaces = [INVALID; SURFACES];
        }
    }
}

fn copy_planes(
    base: *const u8,
    fourcc: u32,
    width: u32,
    height: u32,
    pitches: &[usize; 3],
    offsets: &[usize; 3],
) -> Result<OwnedYuv, String> {
    if width == 0 || height == 0 {
        return Err("VA 图像尺寸是 0".into());
    }
    unsafe {
        match fourcc {
            I420 => copy_i420(
                width,
                height,
                base.add(offsets[0]),
                base.add(offsets[1]),
                base.add(offsets[2]),
                pitches[0] as i32,
                pitches[1] as i32,
            )
            .ok_or_else(|| "I420 拷贝失败".to_string()),
            YV12 => copy_i420(
                width,
                height,
                base.add(offsets[0]),
                base.add(offsets[2]),
                base.add(offsets[1]),
                pitches[0] as i32,
                pitches[2] as i32,
            )
            .ok_or_else(|| "YV12 拷贝失败".to_string()),
            NV12 => {
                let y_len = pitches[0].saturating_mul(height as usize);
                let uv_len = pitches[1].saturating_mul(height as usize / 2 + 1);
                let y = std::slice::from_raw_parts(base.add(offsets[0]), y_len);
                let uv = std::slice::from_raw_parts(base.add(offsets[1]), uv_len);
                Ok(nv12_to_i420(width, height, y, pitches[0], uv, pitches[1]))
            }
            other => Err(format!("不认识的 VA fourcc {other:#x}")),
        }
    }
}

fn crop_yuv(src: OwnedYuv, width: u32, height: u32) -> OwnedYuv {
    let width = width.min(src.width);
    let height = height.min(src.height);
    let y_stride = width as usize;
    let c_stride = width as usize / 2;
    let chroma_h = height as usize / 2;
    let mut y = vec![0u8; y_stride * height as usize];
    let mut u = vec![0u8; c_stride * chroma_h.max(1)];
    let mut v = vec![0u8; c_stride * chroma_h.max(1)];
    for row in 0..height as usize {
        let from = row * src.y_stride;
        let to = row * y_stride;
        y[to..to + y_stride].copy_from_slice(&src.y[from..from + y_stride]);
    }
    for row in 0..chroma_h {
        let from = row * src.c_stride;
        let to = row * c_stride;
        u[to..to + c_stride].copy_from_slice(&src.u[from..from + c_stride]);
        v[to..to + c_stride].copy_from_slice(&src.v[from..from + c_stride]);
    }
    OwnedYuv {
        width,
        height,
        y,
        u,
        v,
        y_stride,
        c_stride,
    }
}

fn iq_matrix() -> Vec<u8> {
    let mut buf = vec![16u8; 240];
    buf[224..].fill(0);
    buf
}

fn write_pic(buf: &mut [u8], off: usize, id: u32, frame_idx: u32, flags: u32, poc: i32) {
    write_u32(buf, off, id);
    write_u32(buf, off + 4, frame_idx);
    write_u32(buf, off + 8, flags);
    write_i32(buf, off + 12, poc);
    write_i32(buf, off + 16, poc);
}

fn write_u32(buf: &mut [u8], off: usize, v: u32) {
    buf[off..off + 4].copy_from_slice(&v.to_ne_bytes());
}
fn write_u16(buf: &mut [u8], off: usize, v: u16) {
    buf[off..off + 2].copy_from_slice(&v.to_ne_bytes());
}
fn write_i32(buf: &mut [u8], off: usize, v: i32) {
    write_u32(buf, off, v as u32);
}
fn read_u32(buf: &[u8], off: usize) -> u32 {
    u32::from_ne_bytes(buf[off..off + 4].try_into().unwrap_or([0; 4]))
}
fn read_u16(buf: &[u8], off: usize) -> u16 {
    u16::from_ne_bytes(buf[off..off + 2].try_into().unwrap_or([0; 2]))
}

struct Display {
    dpy: *mut c_void,
    fd: c_int,
    x11: bool,
    lib: *mut c_void,
    extra: *mut c_void,
    terminate: unsafe extern "C" fn(*mut c_void) -> i32,
    max_profiles: unsafe extern "C" fn(*mut c_void) -> i32,
    max_entry: unsafe extern "C" fn(*mut c_void) -> i32,
    query_profiles: unsafe extern "C" fn(*mut c_void, *mut i32, *mut i32) -> i32,
    query_entries: unsafe extern "C" fn(*mut c_void, i32, *mut i32, *mut i32) -> i32,
    create_config: unsafe extern "C" fn(*mut c_void, i32, i32, *const c_void, i32, *mut u32) -> i32,
    destroy_config: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    create_surfaces: unsafe extern "C" fn(*mut c_void, u32, u32, u32, *mut u32, u32, *const c_void, u32) -> i32,
    destroy_surfaces: unsafe extern "C" fn(*mut c_void, *mut u32, i32) -> i32,
    create_context: unsafe extern "C" fn(*mut c_void, u32, i32, i32, i32, *mut u32, i32, *mut u32) -> i32,
    destroy_context: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    create_buffer: unsafe extern "C" fn(*mut c_void, u32, i32, u32, u32, *mut c_void, *mut u32) -> i32,
    destroy_buffer: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    begin: unsafe extern "C" fn(*mut c_void, u32, u32) -> i32,
    render: unsafe extern "C" fn(*mut c_void, u32, *const u32, i32) -> i32,
    end: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    sync: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    derive: unsafe extern "C" fn(*mut c_void, u32, *mut u8) -> i32,
    destroy_image: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    map: unsafe extern "C" fn(*mut c_void, u32, *mut *mut c_void) -> i32,
    unmap: unsafe extern "C" fn(*mut c_void, u32) -> i32,
    put: Option<PutSurface>,
}

unsafe impl Send for Display {}

impl Display {
    fn terminate(&mut self) {
        unsafe {
            if !self.dpy.is_null() {
                (self.terminate)(self.dpy);
                self.dpy = std::ptr::null_mut();
            }
            if self.fd >= 0 {
                libc::close(self.fd);
                self.fd = -1;
            }
        }
    }
}

fn open_display() -> Option<Display> {
    if let Some(disp) = open_drm() {
        return Some(disp);
    }
    open_x11()
}

fn open_drm() -> Option<Display> {
    let extra = dlopen(b"libva-drm.so.2\0")?;
    let get: unsafe extern "C" fn(c_int) -> *mut c_void = sym(extra, b"vaGetDisplayDRM\0")?;
    for node in ["/dev/dri/renderD128", "/dev/dri/renderD129", "/dev/dri/card0"] {
        let c = CString::new(node).ok()?;
        let fd = unsafe { libc::open(c.as_ptr(), libc::O_RDWR | libc::O_CLOEXEC) };
        if fd < 0 {
            continue;
        }
        let dpy = unsafe { get(fd) };
        if dpy.is_null() {
            unsafe { libc::close(fd) };
            continue;
        }
        if let Some(disp) = finish_display(dpy, fd, false, extra) {
            return Some(disp);
        }
        unsafe { libc::close(fd) };
    }
    unsafe { libc::dlclose(extra) };
    None
}

fn open_x11() -> Option<Display> {
    let extra = dlopen(b"libva-x11.so.2\0")?;
    let get: unsafe extern "C" fn(*mut c_void) -> *mut c_void = sym(extra, b"vaGetDisplay\0")?;
    let display_get = sym_default::<unsafe extern "C" fn() -> *mut c_void>(b"gdk_display_get_default\0")?;
    let xdisplay_get = sym_default::<unsafe extern "C" fn(*mut c_void) -> *mut c_void>(
        b"gdk_x11_display_get_xdisplay\0",
    )?;
    let gdk = unsafe { display_get() };
    if gdk.is_null() {
        unsafe { libc::dlclose(extra) };
        return None;
    }
    let x11 = unsafe { xdisplay_get(gdk) };
    if x11.is_null() {
        unsafe { libc::dlclose(extra) };
        return None;
    }
    let dpy = unsafe { get(x11) };
    if dpy.is_null() {
        unsafe { libc::dlclose(extra) };
        return None;
    }
    finish_display(dpy, -1, true, extra)
}

fn finish_display(dpy: *mut c_void, fd: c_int, x11: bool, extra: *mut c_void) -> Option<Display> {
    let lib = dlopen(b"libva.so.2\0")?;
    unsafe {
        let initialize: unsafe extern "C" fn(*mut c_void, *mut i32, *mut i32) -> i32 =
            sym(lib, b"vaInitialize\0")?;
        let mut major = 0;
        let mut minor = 0;
        if initialize(dpy, &mut major, &mut minor) != 0 {
            libc::dlclose(lib);
            return None;
        }
        let put = sym::<PutSurface>(lib, b"vaPutSurface\0");
        Some(Display {
            dpy,
            fd,
            x11,
            lib,
            extra,
            terminate: sym(lib, b"vaTerminate\0")?,
            max_profiles: sym(lib, b"vaMaxNumProfiles\0")?,
            max_entry: sym(lib, b"vaMaxNumEntrypoints\0")?,
            query_profiles: sym(lib, b"vaQueryConfigProfiles\0")?,
            query_entries: sym(lib, b"vaQueryConfigEntrypoints\0")?,
            create_config: sym(lib, b"vaCreateConfig\0")?,
            destroy_config: sym(lib, b"vaDestroyConfig\0")?,
            create_surfaces: sym(lib, b"vaCreateSurfaces\0")?,
            destroy_surfaces: sym(lib, b"vaDestroySurfaces\0")?,
            create_context: sym(lib, b"vaCreateContext\0")?,
            destroy_context: sym(lib, b"vaDestroyContext\0")?,
            create_buffer: sym(lib, b"vaCreateBuffer\0")?,
            destroy_buffer: sym(lib, b"vaDestroyBuffer\0")?,
            begin: sym(lib, b"vaBeginPicture\0")?,
            render: sym(lib, b"vaRenderPicture\0")?,
            end: sym(lib, b"vaEndPicture\0")?,
            sync: sym(lib, b"vaSyncSurface\0")?,
            derive: sym(lib, b"vaDeriveImage\0")?,
            destroy_image: sym(lib, b"vaDestroyImage\0")?,
            map: sym(lib, b"vaMapBuffer\0")?,
            unmap: sym(lib, b"vaUnmapBuffer\0")?,
            put,
        })
    }
}

fn has_profile(disp: &Display, want: &[i32]) -> bool {
    first_profile(disp, want).is_some()
}

fn first_profile(disp: &Display, want: &[i32]) -> Option<i32> {
    unsafe {
        let max = (disp.max_profiles)(disp.dpy);
        if max <= 0 {
            return None;
        }
        let mut profiles = vec![0i32; max as usize];
        let mut n = 0i32;
        if (disp.query_profiles)(disp.dpy, profiles.as_mut_ptr(), &mut n) != 0 || n <= 0 {
            return None;
        }
        let max_e = (disp.max_entry)(disp.dpy).max(1) as usize;
        for profile in profiles.into_iter().take(n as usize) {
            if !want.contains(&profile) {
                continue;
            }
            let mut entries = vec![0i32; max_e];
            let mut en = 0i32;
            if (disp.query_entries)(disp.dpy, profile, entries.as_mut_ptr(), &mut en) != 0 {
                continue;
            }
            if entries.into_iter().take(en.max(0) as usize).any(|e| e == VLD) {
                return Some(profile);
            }
        }
        None
    }
}

fn dlopen(name: &[u8]) -> Option<*mut c_void> {
    unsafe {
        let handle = libc::dlopen(name.as_ptr() as *const c_char, libc::RTLD_NOW | libc::RTLD_LOCAL);
        if handle.is_null() {
            None
        } else {
            Some(handle)
        }
    }
}

fn sym<T>(lib: *mut c_void, name: &[u8]) -> Option<T> {
    unsafe {
        let ptr = libc::dlsym(lib, name.as_ptr() as *const c_char);
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute_copy(&ptr))
        }
    }
}

fn sym_default<T>(name: &[u8]) -> Option<T> {
    unsafe {
        let ptr = libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr() as *const c_char);
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute_copy(&ptr))
        }
    }
}

impl Drop for Display {
    fn drop(&mut self) {
        self.terminate();
        unsafe {
            if !self.lib.is_null() {
                libc::dlclose(self.lib);
                self.lib = std::ptr::null_mut();
            }
            if !self.extra.is_null() {
                libc::dlclose(self.extra);
                self.extra = std::ptr::null_mut();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_render_node_does_not_invent_h264_vld() {
        if std::path::Path::new("/dev/dri/renderD128").exists() {
            return;
        }
        let caps = probe_caps();
        assert!(!caps.h264);
        assert!(!caps.hevc);
    }
}
