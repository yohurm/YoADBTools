//! 用户点击后下载 Cisco OpenH264（ADR-v6-044）。
//!
//! 不在进程启动时调用。不打进 `.deb`。成功只把 `libopenh264.so.7` 放进数据目录，不调用 `mirror.start`。

use std::path::{Path, PathBuf};

use yohu_protocol::IpcError;
use yohu_protocol::IpcErrorCode;

use crate::ipc_map::ipc_code;
use crate::state::AppState;

const CISCO_HOST: &str = "ciscobinary.openh264.org";
const ARCHIVE_NAME: &str = "libopenh264-2.4.1-linux64.7.so.bz2";
/// 2026-10-10 从该主机取到的 bz2。改版本必须同时改这一行和下面的长度。
const ARCHIVE_SHA256: &str = "ca413853d99d960ebcd5ae5b4c65a85bb2b5598e9042e64700a9f4b737ca3a3f";
const ARCHIVE_BYTES: u64 = 633_796;
const SONAME: &str = "libopenh264.so.7";

#[derive(Debug, Clone, serde::Serialize)]
pub struct Openh264Status {
    pub ready: bool,
}

pub fn status(state: &AppState) -> Openh264Status {
    Openh264Status {
        ready: state.present.openh264_located(),
    }
}

pub async fn acquire(state: &AppState) -> Result<Openh264Status, IpcError> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = state;
        return Err(ipc_code(
            IpcErrorCode::InvalidArgs,
            "OpenH264 单独下载只在 Linux 上",
        ));
    }
    #[cfg(target_os = "linux")]
    acquire_linux(state).await
}

#[cfg(target_os = "linux")]
async fn acquire_linux(state: &AppState) -> Result<Openh264Status, IpcError> {
    #[cfg(not(target_arch = "x86_64"))]
    {
        let _ = state;
        return Err(ipc_code(
            IpcErrorCode::InvalidArgs,
            "这台机器不是 x86_64，不能下载这份 x86_64 的 OpenH264。请换对应架构的官方包，或自行放到数据目录的 openh264/ 下",
        ));
    }
    #[cfg(target_arch = "x86_64")]
    acquire_x64(state).await
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
async fn acquire_x64(state: &AppState) -> Result<Openh264Status, IpcError> {
    use std::sync::Arc;
    if state.present.openh264_located() {
        return Ok(Openh264Status { ready: true });
    }
    let ticket = Arc::new(state.root_cancel.child_token());
    {
        let mut slot = state.openh264_acquire.lock().await;
        if slot.is_some() {
            return Err(ipc_code(IpcErrorCode::InvalidArgs, "OpenH264 正在下载"));
        }
        *slot = Some(Arc::clone(&ticket));
    }
    let result = download_and_install(state, ticket.as_ref()).await;
    {
        let mut slot = state.openh264_acquire.lock().await;
        if slot
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &ticket))
        {
            *slot = None;
        }
    }
    result.map(|()| Openh264Status { ready: true })
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
async fn download_and_install(
    state: &AppState,
    cancel: &tokio_util::sync::CancellationToken,
) -> Result<(), IpcError> {
    use yohu_download::{fetch, DownloadSpec};
    use yohu_protocol::dir;
    use yohu_update::user_agent;
    let archive_dir = state.paths.cache_dir.join(dir::OPENH264);
    let archive = archive_dir.join(ARCHIVE_NAME);
    let spec = DownloadSpec {
        url: format!("http://{CISCO_HOST}/{ARCHIVE_NAME}"),
        dest: archive.clone(),
        user_agent: user_agent(env!("CARGO_PKG_VERSION")),
        headers: Vec::new(),
        expected_size: ARCHIVE_BYTES,
        expected_sha256: ARCHIVE_SHA256.to_string(),
        allowed_hosts: vec![CISCO_HOST.to_string()],
    };
    let outcome = fetch(spec, cancel.clone(), |_| {})
        .await
        .map_err(map_download)?;
    if cancel.is_cancelled() {
        let _ = tokio::fs::remove_file(&outcome.path).await;
        let _ = tokio::fs::remove_file(part_path(&archive)).await;
        return Err(ipc_code(IpcErrorCode::Cancelled, "下载已取消"));
    }
    let bytes = tokio::fs::read(&outcome.path).await.map_err(|e| {
        ipc_code(
            IpcErrorCode::Internal,
            format!("读取 OpenH264 压缩包失败: {e}"),
        )
    })?;
    let decoded = tokio::task::spawn_blocking(move || decode_bz2(&bytes))
        .await
        .map_err(|e| ipc_code(IpcErrorCode::Internal, format!("解压 OpenH264 失败: {e}")))?
        .map_err(|e| ipc_code(IpcErrorCode::Internal, format!("解压 OpenH264 失败: {e}")))?;
    if decoded.len() < 4 || &decoded[..4] != b"\x7fELF" {
        return Err(ipc_code(
            IpcErrorCode::Internal,
            "解压结果不是 ELF，已留下压缩包",
        ));
    }
    if cancel.is_cancelled() {
        return Err(ipc_code(IpcErrorCode::Cancelled, "下载已取消"));
    }
    let dest_dir = state.paths.data_root.join(dir::OPENH264);
    tokio::task::spawn_blocking(move || install_soname(&dest_dir, &decoded))
        .await
        .map_err(|e| ipc_code(IpcErrorCode::Internal, format!("安装 OpenH264 失败: {e}")))?
        .map_err(|e| ipc_code(IpcErrorCode::Internal, format!("安装 OpenH264 失败: {e}")))?;
    let _ = tokio::fs::remove_file(&outcome.path).await;
    let _ = tokio::fs::remove_file(part_path(&archive)).await;
    tracing::info!("OpenH264 已写入数据目录，未启动投屏");
    Ok(())
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn map_download(error: yohu_download::DownloadError) -> IpcError {
    use yohu_download::DownloadError;
    let code = match error {
        DownloadError::Cancelled => IpcErrorCode::Cancelled,
        DownloadError::InvalidUrl
        | DownloadError::ChecksumMismatch
        | DownloadError::SizeMismatch
        | DownloadError::TooLarge => IpcErrorCode::InvalidArgs,
        DownloadError::Http(_) | DownloadError::Network | DownloadError::Io(_) => {
            IpcErrorCode::Internal
        }
    };
    ipc_code(code, error.to_string())
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn part_path(dest: &Path) -> PathBuf {
    dest.with_file_name(format!(
        "{}.part",
        dest.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file.part".into())
    ))
}

pub(crate) fn decode_bz2(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut decoder = bzip2::read::BzDecoder::new(bytes);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out).map_err(|e| e.to_string())?;
    if out.is_empty() {
        return Err("解压结果是空的".into());
    }
    Ok(out)
}

pub(crate) fn install_soname(dir: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(".{SONAME}.{}.partial", std::process::id()));
    if let Err(e) = std::fs::write(&tmp, bytes) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    let dest = dir.join(SONAME);
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cisco_pin_matches_the_measured_archive() {
        assert_eq!(ARCHIVE_SHA256.len(), 64);
        assert!(ARCHIVE_SHA256.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(
            format!("http://{CISCO_HOST}/{ARCHIVE_NAME}"),
            "http://ciscobinary.openh264.org/libopenh264-2.4.1-linux64.7.so.bz2"
        );
        assert_eq!(ARCHIVE_BYTES, 633_796);
        assert_eq!(SONAME, "libopenh264.so.7");
    }

    #[test]
    fn bz2_roundtrip_and_atomic_install() {
        use std::io::Read;
        let raw = b"hello-openh264";
        let mut encoder = bzip2::read::BzEncoder::new(&raw[..], bzip2::Compression::fast());
        let mut packed = Vec::new();
        encoder.read_to_end(&mut packed).unwrap();
        assert_eq!(decode_bz2(&packed).unwrap(), raw);

        let dir = std::env::temp_dir().join(format!("yohu-openh264-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let dest = install_soname(&dir, raw).unwrap();
        assert_eq!(dest, dir.join(SONAME));
        assert_eq!(std::fs::read(&dest).unwrap(), raw);
        assert!(!dir
            .join(format!(".{SONAME}.{}.partial", std::process::id()))
            .exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
