//! 运行时 `dlopen` Cisco OpenH264。二进制不进 `.deb`，也不进这个 crate。
//!
//! 调用的是 2.4 / 2.6 那份 `ISVCDecoder` 虚表（`DecodeFrameNoDelay` 在第 4 项）。
//! 解码线程持有对象；GTK 主线程不碰它。

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::path::{Path, PathBuf};

use yohu_protocol::{dir, DATA_DIR_NAME};
use yohu_runtime::app_data_root;

use super::color::{copy_i420, OwnedYuv};

const SONAMES: &[&str] = &[
    "libopenh264.so.7",
    "libopenh264.so.8",
    "libopenh264.so.2",
    "libopenh264.so",
];

pub fn locate(extra_dir: &Path) -> Option<PathBuf> {
    if let Some(from_env) = std::env::var_os("YOHU_OPENH264") {
        let path = PathBuf::from(from_env);
        if path.is_file() {
            return Some(path);
        }
    }
    let mut dirs = vec![extra_dir.to_path_buf()];
    if let Ok(root) = app_data_root(DATA_DIR_NAME) {
        dirs.push(root.join(dir::DATA).join(dir::OPENH264));
    }
    for folder in dirs {
        for name in SONAMES {
            let path = folder.join(name);
            if path.is_file() {
                return Some(path);
            }
        }
        let Ok(entries) = std::fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let text = name.to_string_lossy();
            if text.starts_with("libopenh264") && text.contains(".so") {
                return Some(entry.path());
            }
        }
    }
    None
}

pub struct OpenH264Decoder {
    _lib: Lib,
    destroy: unsafe extern "C" fn(*mut c_void),
    decode: DecodeFn,
    obj: *mut c_void,
}

type DecodeFn = unsafe extern "C" fn(
    *mut c_void,
    *const u8,
    i32,
    *mut *mut u8,
    *mut BufferInfo,
) -> i32;

struct Lib(*mut c_void);

unsafe impl Send for OpenH264Decoder {}

impl Drop for OpenH264Decoder {
    fn drop(&mut self) {
        unsafe {
            if !self.obj.is_null() {
                let uninit = vmethod(self.obj, 1);
                let uninit: unsafe extern "C" fn(*mut c_void) -> i64 = std::mem::transmute(uninit);
                let _ = uninit(self.obj);
                (self.destroy)(self.obj);
                self.obj = std::ptr::null_mut();
            }
        }
    }
}

impl OpenH264Decoder {
    pub fn open(extra_dir: &Path) -> Result<Self, String> {
        let lib = load_library(extra_dir)?;
        unsafe {
            let create: unsafe extern "C" fn(*mut *mut c_void) -> i64 = lib.sym(b"WelsCreateDecoder\0")?;
            let destroy: unsafe extern "C" fn(*mut c_void) = lib.sym(b"WelsDestroyDecoder\0")?;
            let mut obj = std::ptr::null_mut();
            let rc = create(&mut obj);
            if rc != 0 || obj.is_null() {
                return Err(format!("WelsCreateDecoder 返回 {rc}"));
            }
            let mut param = [0u8; 32];
            param[24..28].copy_from_slice(&8u32.to_ne_bytes());
            let init = vmethod(obj, 0);
            let init: unsafe extern "C" fn(*mut c_void, *const u8) -> i64 = std::mem::transmute(init);
            let irc = init(obj, param.as_ptr());
            if irc != 0 {
                destroy(obj);
                return Err(format!("OpenH264 Initialize 返回 {irc}"));
            }
            let decode = vmethod(obj, 3);
            let decode: DecodeFn = std::mem::transmute(decode);
            Ok(Self {
                _lib: lib,
                destroy,
                decode,
                obj,
            })
        }
    }

    pub fn feed(&mut self, annexb: &[u8]) -> Result<Option<OwnedYuv>, String> {
        if annexb.is_empty() {
            return Ok(None);
        }
        unsafe {
            let mut dst = [std::ptr::null_mut::<u8>(); 3];
            let mut info = BufferInfo::default();
            let st = (self.decode)(
                self.obj,
                annexb.as_ptr(),
                annexb.len() as i32,
                dst.as_mut_ptr(),
                &mut info,
            );
            if info.status != 1 {
                return Ok(None);
            }
            let _ = st;
            copy_i420(
                info.sys.width.max(0) as u32,
                info.sys.height.max(0) as u32,
                info.dst[0],
                info.dst[1],
                info.dst[2],
                info.sys.stride[0],
                info.sys.stride[1],
            )
            .ok_or_else(|| "OpenH264 解出了空画面".to_string())
            .map(Some)
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SysMem {
    width: i32,
    height: i32,
    format: i32,
    stride: [i32; 2],
}

#[repr(C)]
struct BufferInfo {
    status: i32,
    _pad_status: i32,
    _in_ts: u64,
    _out_ts: u64,
    sys: SysMem,
    _pad_sys: i32,
    dst: [*mut u8; 3],
}

impl Default for BufferInfo {
    fn default() -> Self {
        Self {
            status: 0,
            _pad_status: 0,
            _in_ts: 0,
            _out_ts: 0,
            sys: SysMem {
                width: 0,
                height: 0,
                format: 0,
                stride: [0, 0],
            },
            _pad_sys: 0,
            dst: [std::ptr::null_mut(); 3],
        }
    }
}

const _: () = assert!(std::mem::size_of::<BufferInfo>() == 72);
const _: () = assert!(std::mem::size_of::<SysMem>() == 20);

unsafe fn vmethod(obj: *mut c_void, index: isize) -> *const () {
    let vt = *(obj as *const *const *const ());
    *vt.offset(index)
}

fn load_library(extra_dir: &Path) -> Result<Lib, String> {
    unsafe {
        if let Some(path) = locate(extra_dir) {
            let c = CString::new(path.to_string_lossy().as_bytes()).map_err(|_| "路径含空字节")?;
            let handle = libc::dlopen(c.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
            if !handle.is_null() {
                return Ok(Lib(handle));
            }
        }
        for name in SONAMES {
            let c = CString::new(*name).expect("soname");
            let handle = libc::dlopen(c.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
            if !handle.is_null() {
                return Ok(Lib(handle));
            }
        }
        Err(dl_error("找不到 OpenH264"))
    }
}

impl Lib {
    unsafe fn sym<T>(&self, name: &[u8]) -> Result<T, String> {
        let ptr = libc::dlsym(self.0, name.as_ptr() as *const c_char);
        if ptr.is_null() {
            return Err(dl_error("OpenH264 缺少符号"));
        }
        Ok(std::mem::transmute_copy(&ptr))
    }
}

fn dl_error(fallback: &str) -> String {
    unsafe {
        let err = libc::dlerror();
        if err.is_null() {
            return fallback.to_string();
        }
        CStr::from_ptr(err).to_string_lossy().into_owned()
    }
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
    fn missing_dir_is_not_returned_as_the_file() {
        let missing = std::env::temp_dir().join("yohu-openh264-absent");
        let found = locate(&missing);
        assert_ne!(found.as_ref(), Some(&missing));
    }

    #[test]
    fn cisco_binary_decodes_the_32_square_fixture_when_installed() {
        let Some(mut dec) = OpenH264Decoder::open(Path::new("/no/such")).ok() else {
            return;
        };
        let pic = dec.feed(&fixture()).unwrap().expect("frame");
        assert_eq!((pic.width, pic.height), (32, 32));
        assert!(pic.y.iter().any(|s| *s > 16));
    }
}
