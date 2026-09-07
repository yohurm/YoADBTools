//! VideoToolbox：Annex-B → BGRA。禁止 FFmpeg / libavcodec。

use std::ffi::c_void;
use std::ptr;

use super::super::annexb::{h264_parameter_sets, hevc_parameter_sets, split_nals, vcl_avcc};
use super::super::backend::AnnexBDecoder;

pub type OSStatus = i32;
type CFTypeRef = *const c_void;
type CFAllocatorRef = *const c_void;
type CFDictionaryRef = *const c_void;
type CFNumberRef = *const c_void;
type CFStringRef = *const c_void;
type CMFormatDescriptionRef = *mut c_void;
type CMBlockBufferRef = *mut c_void;
type CMSampleBufferRef = *mut c_void;
type CVImageBufferRef = *mut c_void;
type CVPixelBufferRef = *mut c_void;
type VTDecompressionSessionRef = *mut c_void;

const NO_ERR: OSStatus = 0;
const K_CF_NUMBER_SINT32_TYPE: i32 = 3;
const K_CV_PIXEL_FORMAT_32_BGRA: u32 = 0x4247_5241; // 'BGRA'
const K_CV_PIXEL_FORMAT_420V: u32 = 0x3432_3076; // '420v'
const K_CV_PIXEL_FORMAT_420F: u32 = 0x3432_3066; // '420f'

const fn fourcc(a: u8, b: u8, c: u8, d: u8) -> u32 {
    ((a as u32) << 24) | ((b as u32) << 16) | ((c as u32) << 8) | (d as u32)
}

const K_CM_VIDEO_CODEC_HEVC: u32 = fourcc(b'h', b'v', b'c', b'1');

#[repr(C)]
#[derive(Clone, Copy)]
struct CMTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
}

#[repr(C)]
struct VTDecompressionOutputCallbackRecord {
    callback: unsafe extern "C" fn(
        *mut c_void,
        *mut c_void,
        OSStatus,
        u32,
        CVImageBufferRef,
        CMTime,
        CMTime,
    ),
    ref_con: *mut c_void,
}

#[repr(C)]
struct CFDictionaryKeyCallBacks {
    _version: isize,
    _retain: *const c_void,
    _release: *const c_void,
    _copy_description: *const c_void,
    _equal: *const c_void,
    _hash: *const c_void,
}

#[repr(C)]
struct CFDictionaryValueCallBacks {
    _version: isize,
    _retain: *const c_void,
    _release: *const c_void,
    _copy_description: *const c_void,
    _equal: *const c_void,
}

#[allow(clippy::duplicated_attributes)]
#[link(name = "CoreFoundation", kind = "framework")]
#[link(name = "CoreMedia", kind = "framework")]
#[link(name = "CoreVideo", kind = "framework")]
#[link(name = "VideoToolbox", kind = "framework")]
unsafe extern "C" {
    static kCFAllocatorDefault: CFAllocatorRef;
    static kCFAllocatorMalloc: CFAllocatorRef;
    static kCFBooleanTrue: CFTypeRef;
    static kCFTypeDictionaryKeyCallBacks: CFDictionaryKeyCallBacks;
    static kCFTypeDictionaryValueCallBacks: CFDictionaryValueCallBacks;
    static kCVPixelBufferPixelFormatTypeKey: CFStringRef;
    static kCVPixelBufferIOSurfacePropertiesKey: CFStringRef;
    static kCVPixelBufferMetalCompatibilityKey: CFStringRef;

    fn CFRelease(cf: CFTypeRef);
    fn CFRetain(cf: CFTypeRef) -> CFTypeRef;
    fn CFNumberCreate(
        allocator: CFAllocatorRef,
        the_type: i32,
        value_ptr: *const c_void,
    ) -> CFNumberRef;
    fn CFDictionaryCreate(
        allocator: CFAllocatorRef,
        keys: *const *const c_void,
        values: *const *const c_void,
        num_values: isize,
        key_call_backs: *const CFDictionaryKeyCallBacks,
        value_call_backs: *const CFDictionaryValueCallBacks,
    ) -> CFDictionaryRef;

    fn CMVideoFormatDescriptionCreateFromH264ParameterSets(
        allocator: CFAllocatorRef,
        parameter_set_count: usize,
        parameter_set_pointers: *const *const u8,
        parameter_set_sizes: *const usize,
        nal_unit_header_length: i32,
        format_description_out: *mut CMFormatDescriptionRef,
    ) -> OSStatus;
    fn CMVideoFormatDescriptionCreateFromHEVCParameterSets(
        allocator: CFAllocatorRef,
        parameter_set_count: usize,
        parameter_set_pointers: *const *const u8,
        parameter_set_sizes: *const usize,
        nal_unit_header_length: i32,
        extensions: CFDictionaryRef,
        format_description_out: *mut CMFormatDescriptionRef,
    ) -> OSStatus;
    fn CMBlockBufferCreateWithMemoryBlock(
        structure_allocator: CFAllocatorRef,
        memory_block: *mut c_void,
        block_length: usize,
        block_allocator: CFAllocatorRef,
        custom_block_source: *const c_void,
        offset_to_data: usize,
        data_length: usize,
        flags: u32,
        new_b_buf_out: *mut CMBlockBufferRef,
    ) -> OSStatus;
    fn CMSampleBufferCreateReady(
        allocator: CFAllocatorRef,
        data_buffer: CMBlockBufferRef,
        format_description: CMFormatDescriptionRef,
        num_samples: isize,
        num_sample_timing_entries: isize,
        sample_timing_array: *const c_void,
        num_sample_size_entries: isize,
        sample_size_array: *const usize,
        sample_buffer_out: *mut CMSampleBufferRef,
    ) -> OSStatus;

    fn CVPixelBufferLockBaseAddress(buf: CVPixelBufferRef, flags: u64) -> OSStatus;
    fn CVPixelBufferUnlockBaseAddress(buf: CVPixelBufferRef, flags: u64) -> OSStatus;
    fn CVPixelBufferGetWidth(buf: CVPixelBufferRef) -> usize;
    fn CVPixelBufferGetHeight(buf: CVPixelBufferRef) -> usize;
    fn CVPixelBufferGetBytesPerRow(buf: CVPixelBufferRef) -> usize;
    fn CVPixelBufferGetBaseAddress(buf: CVPixelBufferRef) -> *mut c_void;
    fn CVPixelBufferGetBaseAddressOfPlane(buf: CVPixelBufferRef, plane: usize) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRowOfPlane(buf: CVPixelBufferRef, plane: usize) -> usize;
    fn CVPixelBufferGetPixelFormatType(buf: CVPixelBufferRef) -> u32;
    fn CVPixelBufferIsPlanar(buf: CVPixelBufferRef) -> u8;

    fn VTDecompressionSessionCreate(
        allocator: CFAllocatorRef,
        video_format_description: CMFormatDescriptionRef,
        video_decoder_specification: CFDictionaryRef,
        destination_image_buffer_attributes: CFDictionaryRef,
        output_callback: *const VTDecompressionOutputCallbackRecord,
        decompression_session_out: *mut VTDecompressionSessionRef,
    ) -> OSStatus;
    fn VTDecompressionSessionDecodeFrame(
        session: VTDecompressionSessionRef,
        sample_buffer: CMSampleBufferRef,
        decode_flags: u32,
        source_frame_ref_con: *mut c_void,
        info_flags_out: *mut u32,
    ) -> OSStatus;
    fn VTDecompressionSessionWaitForAsynchronousFrames(
        session: VTDecompressionSessionRef,
    ) -> OSStatus;
    fn VTDecompressionSessionInvalidate(session: VTDecompressionSessionRef);
    fn VTIsHardwareDecodeSupported(codec_type: u32) -> u8;
}

struct Slot {
    status: OSStatus,
    image: CVImageBufferRef,
}

/// VT 输出的 GPU 图：热路径不转 BGRA。截图才 CPU 拷。
pub struct Picture {
    pub width: u32,
    pub height: u32,
    image: CVPixelBufferRef,
}

unsafe impl Send for Picture {}

impl Drop for Picture {
    fn drop(&mut self) {
        unsafe {
            if !self.image.is_null() {
                CFRelease(self.image);
                self.image = ptr::null_mut();
            }
        }
    }
}

impl Picture {
    fn adopt(image: CVPixelBufferRef) -> Option<Self> {
        if image.is_null() {
            return None;
        }
        unsafe {
            let width = CVPixelBufferGetWidth(image) as u32;
            let height = CVPixelBufferGetHeight(image) as u32;
            Some(Self {
                width,
                height,
                image,
            })
        }
    }

    pub fn retain_image(&self) -> ImageRef {
        ImageRef::retain(self.image)
    }

    pub fn copy_bgra(&self) -> Result<Vec<u8>, String> {
        copy_bgra(self.image)
    }
}

/// 交给主线程 CALayer 的额外 retain。
pub struct ImageRef(CVPixelBufferRef);

unsafe impl Send for ImageRef {}

impl ImageRef {
    fn retain(image: CVPixelBufferRef) -> Self {
        unsafe {
            if !image.is_null() {
                CFRetain(image);
            }
        }
        Self(image)
    }

    pub fn as_ptr(&self) -> CVPixelBufferRef {
        self.0
    }
}

impl Drop for ImageRef {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                CFRelease(self.0);
                self.0 = ptr::null_mut();
            }
        }
    }
}

pub struct VideoToolboxDecoder {
    hevc: bool,
    width: u32,
    height: u32,
    session: VTDecompressionSessionRef,
    format: CMFormatDescriptionRef,
    slot: Box<Slot>,
}

pub fn hevc_available() -> bool {
    unsafe { VTIsHardwareDecodeSupported(K_CM_VIDEO_CODEC_HEVC) != 0 }
}

fn status_err(op: &str, status: OSStatus) -> String {
    format!("{op} 失败（OSStatus {status}）")
}

fn pixel_attrs() -> CFDictionaryRef {
    unsafe {
        let fmt = K_CV_PIXEL_FORMAT_420V as i32;
        let num = CFNumberCreate(
            kCFAllocatorDefault,
            K_CF_NUMBER_SINT32_TYPE,
            ptr::addr_of!(fmt).cast(),
        );
        let iosurface = CFDictionaryCreate(
            kCFAllocatorDefault,
            ptr::null(),
            ptr::null(),
            0,
            ptr::addr_of!(kCFTypeDictionaryKeyCallBacks),
            ptr::addr_of!(kCFTypeDictionaryValueCallBacks),
        );
        let keys: [*const c_void; 3] = [
            kCVPixelBufferPixelFormatTypeKey,
            kCVPixelBufferIOSurfacePropertiesKey,
            kCVPixelBufferMetalCompatibilityKey,
        ];
        let vals: [*const c_void; 3] = [num, iosurface, kCFBooleanTrue];
        let dict = CFDictionaryCreate(
            kCFAllocatorDefault,
            keys.as_ptr(),
            vals.as_ptr(),
            3,
            ptr::addr_of!(kCFTypeDictionaryKeyCallBacks),
            ptr::addr_of!(kCFTypeDictionaryValueCallBacks),
        );
        if !num.is_null() {
            CFRelease(num);
        }
        if !iosurface.is_null() {
            CFRelease(iosurface);
        }
        dict
    }
}

unsafe extern "C" fn output_callback(
    ref_con: *mut c_void,
    _src: *mut c_void,
    status: OSStatus,
    _info: u32,
    image: CVImageBufferRef,
    _pts: CMTime,
    _dur: CMTime,
) {
    let slot = unsafe { &mut *(ref_con as *mut Slot) };
    slot.status = status;
    if !slot.image.is_null() {
        unsafe { CFRelease(slot.image) };
        slot.image = ptr::null_mut();
    }
    if status == NO_ERR && !image.is_null() {
        slot.image = unsafe { CFRetain(image) as CVImageBufferRef };
    }
}

fn create_format(hevc: bool, annexb: &[u8]) -> Result<CMFormatDescriptionRef, String> {
    let nals = split_nals(annexb);
    if nals.is_empty() {
        return Err("码流缺少 NAL".into());
    }
    unsafe {
        let mut format = ptr::null_mut();
        let status = if hevc {
            let (vps, sps, pps) = hevc_parameter_sets(&nals);
            if vps.is_empty() || sps.is_empty() || pps.is_empty() {
                return Err("HEVC 缺少 VPS/SPS/PPS".into());
            }
            let sets = [vps[0], sps[0], pps[0]];
            let ptrs: [*const u8; 3] = [sets[0].as_ptr(), sets[1].as_ptr(), sets[2].as_ptr()];
            let sizes: [usize; 3] = [sets[0].len(), sets[1].len(), sets[2].len()];
            CMVideoFormatDescriptionCreateFromHEVCParameterSets(
                kCFAllocatorDefault,
                3,
                ptrs.as_ptr(),
                sizes.as_ptr(),
                4,
                ptr::null(),
                &mut format,
            )
        } else {
            let (sps, pps) = h264_parameter_sets(&nals);
            if sps.is_empty() || pps.is_empty() {
                return Err("H.264 缺少 SPS/PPS".into());
            }
            let mut ptrs: Vec<*const u8> = Vec::new();
            let mut sizes: Vec<usize> = Vec::new();
            for nal in sps.iter().chain(pps.iter()) {
                ptrs.push(nal.as_ptr());
                sizes.push(nal.len());
            }
            CMVideoFormatDescriptionCreateFromH264ParameterSets(
                kCFAllocatorDefault,
                ptrs.len(),
                ptrs.as_ptr(),
                sizes.as_ptr(),
                4,
                &mut format,
            )
        };
        if status != NO_ERR || format.is_null() {
            return Err(status_err("创建格式描述", status));
        }
        Ok(format)
    }
}

fn create_session(
    format: CMFormatDescriptionRef,
    slot: &mut Slot,
) -> Result<VTDecompressionSessionRef, String> {
    unsafe {
        let attrs = pixel_attrs();
        let rec = VTDecompressionOutputCallbackRecord {
            callback: output_callback,
            ref_con: ptr::from_mut(slot).cast(),
        };
        let mut session = ptr::null_mut();
        let status = VTDecompressionSessionCreate(
            kCFAllocatorDefault,
            format,
            ptr::null(),
            attrs,
            &rec,
            &mut session,
        );
        if !attrs.is_null() {
            CFRelease(attrs);
        }
        if status != NO_ERR || session.is_null() {
            return Err(status_err("VTDecompressionSessionCreate", status));
        }
        Ok(session)
    }
}

fn copy_bgra(image: CVPixelBufferRef) -> Result<Vec<u8>, String> {
    unsafe {
        if CVPixelBufferLockBaseAddress(image, 0) != NO_ERR {
            return Err("锁定 CVPixelBuffer 失败".into());
        }
        let width = CVPixelBufferGetWidth(image) as u32;
        let height = CVPixelBufferGetHeight(image) as u32;
        let fmt = CVPixelBufferGetPixelFormatType(image);
        let result = if fmt == K_CV_PIXEL_FORMAT_32_BGRA {
            copy_packed_bgra(image, width, height)
        } else if fmt == K_CV_PIXEL_FORMAT_420V || fmt == K_CV_PIXEL_FORMAT_420F {
            copy_nv12(image, width, height, fmt == K_CV_PIXEL_FORMAT_420F)
        } else {
            Err(format!("不支持的像素格式 {fmt:#x}"))
        };
        let _ = CVPixelBufferUnlockBaseAddress(image, 0);
        result
    }
}

unsafe fn copy_packed_bgra(
    image: CVPixelBufferRef,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let src = CVPixelBufferGetBaseAddress(image) as *const u8;
    if src.is_null() {
        return Err("BGRA 基址为空".into());
    }
    let stride = CVPixelBufferGetBytesPerRow(image);
    let mut bgra = vec![0u8; width as usize * height as usize * 4];
    for y in 0..height as usize {
        let row = src.add(y * stride);
        let dst = bgra.as_mut_ptr().add(y * width as usize * 4);
        ptr::copy_nonoverlapping(row, dst, width as usize * 4);
    }
    Ok(bgra)
}

unsafe fn copy_nv12(
    image: CVPixelBufferRef,
    width: u32,
    height: u32,
    full: bool,
) -> Result<Vec<u8>, String> {
    if CVPixelBufferIsPlanar(image) == 0 {
        return Err("NV12 不是 planar".into());
    }
    let y_ptr = CVPixelBufferGetBaseAddressOfPlane(image, 0) as *const u8;
    let uv_ptr = CVPixelBufferGetBaseAddressOfPlane(image, 1) as *const u8;
    if y_ptr.is_null() || uv_ptr.is_null() {
        return Err("NV12 平面为空".into());
    }
    let y_stride = CVPixelBufferGetBytesPerRowOfPlane(image, 0);
    let uv_stride = CVPixelBufferGetBytesPerRowOfPlane(image, 1);
    let mut bgra = vec![0u8; width as usize * height as usize * 4];
    for y in 0..height as usize {
        for x in 0..width as usize {
            let yy = *y_ptr.add(y * y_stride + x) as i32;
            let uv_i = (y / 2) * uv_stride + (x / 2) * 2;
            let uu = *uv_ptr.add(uv_i) as i32;
            let vv = *uv_ptr.add(uv_i + 1) as i32;
            let (y2, u, v) = if full {
                (yy, uu - 128, vv - 128)
            } else {
                (((yy - 16).max(0) * 255) / 219, uu - 128, vv - 128)
            };
            let r = (y2 + (359 * v) / 256).clamp(0, 255) as u8;
            let g = (y2 - (88 * u) / 256 - (183 * v) / 256).clamp(0, 255) as u8;
            let b = (y2 + (454 * u) / 256).clamp(0, 255) as u8;
            let o = (y * width as usize + x) * 4;
            bgra[o] = b;
            bgra[o + 1] = g;
            bgra[o + 2] = r;
            bgra[o + 3] = 255;
        }
    }
    Ok(bgra)
}

impl VideoToolboxDecoder {
    fn ensure_session(&mut self, annexb: &[u8]) -> Result<(), String> {
        if !self.session.is_null() {
            return Ok(());
        }
        let format = create_format(self.hevc, annexb)?;
        let session = match create_session(format, &mut self.slot) {
            Ok(s) => s,
            Err(e) => {
                unsafe { CFRelease(format) };
                return Err(e);
            }
        };
        self.format = format;
        self.session = session;
        tracing::info!(
            hevc = self.hevc,
            width = self.width,
            height = self.height,
            "VideoToolbox 解码器已启动"
        );
        Ok(())
    }

    fn decode_au(&mut self, annexb: &[u8]) -> Result<Option<Picture>, String> {
        self.ensure_session(annexb)?;
        let avcc = vcl_avcc(self.hevc, annexb);
        if avcc.is_empty() {
            return Ok(None);
        }
        unsafe {
            let block_len = avcc.len();
            let mem = libc::malloc(block_len);
            if mem.is_null() {
                return Err("分配样本缓冲失败".into());
            }
            ptr::copy_nonoverlapping(avcc.as_ptr(), mem as *mut u8, block_len);
            let mut block = ptr::null_mut();
            let st = CMBlockBufferCreateWithMemoryBlock(
                kCFAllocatorDefault,
                mem,
                block_len,
                kCFAllocatorMalloc,
                ptr::null(),
                0,
                block_len,
                0,
                &mut block,
            );
            if st != NO_ERR || block.is_null() {
                libc::free(mem);
                return Err(status_err("CMBlockBufferCreateWithMemoryBlock", st));
            }
            let mut sample = ptr::null_mut();
            let sample_size = block_len;
            let st = CMSampleBufferCreateReady(
                kCFAllocatorDefault,
                block,
                self.format,
                1,
                0,
                ptr::null(),
                1,
                &sample_size,
                &mut sample,
            );
            CFRelease(block);
            if st != NO_ERR || sample.is_null() {
                return Err(status_err("CMSampleBufferCreateReady", st));
            }
            self.slot.status = NO_ERR;
            if !self.slot.image.is_null() {
                CFRelease(self.slot.image);
                self.slot.image = ptr::null_mut();
            }
            let mut info = 0u32;
            let st = VTDecompressionSessionDecodeFrame(
                self.session,
                sample,
                0,
                ptr::null_mut(),
                &mut info,
            );
            if self.slot.image.is_null() && self.slot.status == NO_ERR {
                let _ = VTDecompressionSessionWaitForAsynchronousFrames(self.session);
            }
            CFRelease(sample);
            if st != NO_ERR {
                return Err(status_err("VTDecompressionSessionDecodeFrame", st));
            }
            if self.slot.status != NO_ERR {
                return Err(status_err("VideoToolbox 回调", self.slot.status));
            }
            let image = self.slot.image;
            self.slot.image = ptr::null_mut();
            Ok(Picture::adopt(image))
        }
    }

    pub fn reset(&mut self) {
        unsafe {
            if !self.session.is_null() {
                VTDecompressionSessionInvalidate(self.session);
                CFRelease(self.session);
                self.session = ptr::null_mut();
            }
            if !self.format.is_null() {
                CFRelease(self.format);
                self.format = ptr::null_mut();
            }
            if !self.slot.image.is_null() {
                CFRelease(self.slot.image);
                self.slot.image = ptr::null_mut();
            }
            self.slot.status = NO_ERR;
        }
    }
}

impl Drop for VideoToolboxDecoder {
    fn drop(&mut self) {
        self.reset();
    }
}

impl AnnexBDecoder for VideoToolboxDecoder {
    type Picture = Picture;
    type Bind = ();

    fn open(
        hevc: bool,
        width: u32,
        height: u32,
        _bind: Option<&Self::Bind>,
    ) -> Result<Self, String> {
        if width == 0 || height == 0 {
            return Err("VideoToolbox 需要有效宽高".into());
        }
        Ok(Self {
            hevc,
            width,
            height,
            session: ptr::null_mut(),
            format: ptr::null_mut(),
            slot: Box::new(Slot {
                status: NO_ERR,
                image: ptr::null_mut(),
            }),
        })
    }

    fn width(&self) -> u32 {
        self.width
    }

    fn height(&self) -> u32 {
        self.height
    }

    fn feed(&mut self, annexb: &[u8], _keyframe: bool) -> Result<Option<Self::Picture>, String> {
        self.decode_au(annexb)
    }

    fn drain(&mut self) -> Result<Option<Self::Picture>, String> {
        Ok(None)
    }
}
