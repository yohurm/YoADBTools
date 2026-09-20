//! capability / domain 错误 → [`IpcError`]。与 `commands` 平级；只许 invoke 边界调用。

use yohu_adb::AdbError;
use yohu_domain::LibraryError;
use yohu_files::FileError;
use yohu_logsrv::LogError;
use yohu_mirror::MirrorError;
use yohu_protocol::{IpcError, IpcErrorCode};
use yohu_update::UpdateError;

use crate::device_catalog::CatalogError;
use crate::dnd::DndError;
use crate::group_runs::GroupRunError;
use crate::library_store::LibraryStoreError;
use crate::mirror_present::PresentError;
use crate::terminal_eval::TerminalEvalError;

/// core 错误 → IPC 错误（前端按 code 处理）。
pub fn ipc(e: impl std::fmt::Display) -> IpcError {
    IpcError {
        code: IpcErrorCode::Internal,
        message: e.to_string(),
    }
}

fn adb_code(e: &AdbError) -> IpcErrorCode {
    match e {
        AdbError::DeviceOffline(_) | AdbError::NotOnline(_) => IpcErrorCode::DeviceOffline,
        AdbError::Cancelled => IpcErrorCode::Cancelled,
        AdbError::ToolUnavailable(_) | AdbError::BadExit { .. } | AdbError::Timeout => {
            IpcErrorCode::AdbError
        }
        AdbError::Io(_) => IpcErrorCode::Internal,
    }
}

/// ADB 错误 → IPC 错误（保留语义码）。
pub fn ipc_adb(e: AdbError) -> IpcError {
    IpcError {
        code: adb_code(&e),
        message: e.to_string(),
    }
}

/// 设备目录扫描错误 → IPC。
pub fn ipc_catalog(e: CatalogError) -> IpcError {
    match e {
        CatalogError::Interrupted => ipc_code(
            IpcErrorCode::Cancelled,
            CatalogError::Interrupted.to_string(),
        ),
        CatalogError::Adb(adb) => IpcError {
            code: adb_code(&adb),
            message: adb.to_string(),
        },
    }
}

/// 构造一个简单 IPC 错误。
pub fn ipc_code(code: IpcErrorCode, message: impl Into<String>) -> IpcError {
    IpcError {
        code,
        message: message.into(),
    }
}

pub fn ipc_library(error: LibraryError) -> IpcError {
    ipc_code(IpcErrorCode::InvalidArgs, error.to_string())
}

pub fn ipc_library_store(e: LibraryStoreError) -> IpcError {
    match e {
        LibraryStoreError::Library(lib) => ipc_library(lib),
        LibraryStoreError::Io(msg) => ipc(msg),
    }
}

/// 文件模块错误 → IPC。文案与 `FileError` Display 同一条（分类 + 载荷），不扫 stderr。
pub fn ipc_file(e: FileError) -> IpcError {
    match e {
        FileError::Adb(adb) => ipc_adb(adb),
        named => {
            let code = match &named {
                FileError::RemoteNotFound(_) => IpcErrorCode::NotFound,
                FileError::LocalNotFound(_) => IpcErrorCode::InvalidArgs,
                FileError::RemoteFailed(_) | FileError::Local(_) | FileError::ProgressClosed => {
                    IpcErrorCode::AdbError
                }
                FileError::ProgressJoin => IpcErrorCode::Internal,
                FileError::Adb(_) => unreachable!("Adb 已在外层匹配"),
                _ => IpcErrorCode::InvalidArgs,
            };
            ipc_code(code, named.to_string())
        }
    }
}

/// 更新检查错误 → IPC。
pub fn ipc_update(e: UpdateError) -> IpcError {
    let code = match e {
        UpdateError::NotConfigured
        | UpdateError::InvalidUrl
        | UpdateError::InvalidInstaller
        | UpdateError::TooLarge
        | UpdateError::ChecksumMismatch
        | UpdateError::SizeMismatch => IpcErrorCode::InvalidArgs,
        UpdateError::NoInstallerOrPage
        | UpdateError::NoRelease
        | UpdateError::InstallerNotFound => IpcErrorCode::NotFound,
        UpdateError::Cancelled => IpcErrorCode::Cancelled,
        UpdateError::Platform(_)
        | UpdateError::Http(_)
        | UpdateError::Network(_)
        | UpdateError::Parse(_)
        | UpdateError::DraftRelease
        | UpdateError::MissingTag
        | UpdateError::Io(_)
        | UpdateError::UnsupportedOs => IpcErrorCode::Internal,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}

pub fn ipc_present(e: PresentError) -> IpcError {
    let code = match &e {
        PresentError::Empty | PresentError::SerialMismatch => IpcErrorCode::InvalidArgs,
        PresentError::Exited | PresentError::Timeout | PresentError::Internal(_) => {
            IpcErrorCode::Internal
        }
    };
    ipc_code(code, e.to_string())
}

pub fn ipc_mirror(e: MirrorError) -> IpcError {
    let message = e.public_message();
    match e {
        MirrorError::Cancelled => ipc_code(IpcErrorCode::Cancelled, message),
        MirrorError::NotLive
        | MirrorError::NoControl
        | MirrorError::Protocol(_)
        | MirrorError::Codec(_) => ipc_code(IpcErrorCode::InvalidArgs, message),
        MirrorError::ServerMissing(_) | MirrorError::ServerFailed(_) => {
            ipc_code(IpcErrorCode::AdbError, message)
        }
        MirrorError::Adb(adb) => IpcError {
            code: match &adb {
                AdbError::DeviceOffline(_) | AdbError::NotOnline(_) => IpcErrorCode::DeviceOffline,
                AdbError::Cancelled => IpcErrorCode::Cancelled,
                AdbError::ToolUnavailable(_) | AdbError::BadExit { .. } | AdbError::Timeout => {
                    IpcErrorCode::AdbError
                }
                AdbError::Io(_) => IpcErrorCode::Internal,
            },
            message,
        },
        MirrorError::Io(_) => ipc_code(IpcErrorCode::Internal, message),
    }
}

pub fn ipc_log(e: LogError) -> IpcError {
    match e {
        LogError::Cancelled => ipc_code(IpcErrorCode::Cancelled, e.to_string()),
        LogError::Adb(adb) => ipc_adb(adb),
        LogError::Io(_) | LogError::ExportStamp => ipc(e),
    }
}

pub fn ipc_group(e: GroupRunError) -> IpcError {
    match e {
        GroupRunError::Library(lib) => ipc_library(lib),
        other => ipc_code(IpcErrorCode::NotFound, other.to_string()),
    }
}

pub fn ipc_dnd(e: DndError) -> IpcError {
    match e {
        DndError::Files(f) => ipc_file(f),
        other => {
            let code = match &other {
                DndError::Interrupted => IpcErrorCode::Cancelled,
                DndError::Unsupported
                | DndError::NeedMainThread
                | DndError::NoGesture
                | DndError::NoWindow
                | DndError::NoContentView
                | DndError::NotReady => IpcErrorCode::InvalidArgs,
                DndError::OleFailed(_) | DndError::Host => IpcErrorCode::Internal,
                DndError::Files(_) => unreachable!("Files 已在外层匹配"),
            };
            ipc_code(code, other.to_string())
        }
    }
}

pub fn ipc_eval(e: TerminalEvalError) -> IpcError {
    match e {
        TerminalEvalError::Library(lib) => ipc_library(lib),
        TerminalEvalError::CommandNotFound(_) => ipc_code(IpcErrorCode::NotFound, e.to_string()),
        TerminalEvalError::EmptyCommand => ipc_code(IpcErrorCode::InvalidArgs, e.to_string()),
        TerminalEvalError::Join(_) => ipc(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_interrupted_is_cancelled() {
        let e = ipc_catalog(CatalogError::Interrupted);
        assert_eq!(e.code, IpcErrorCode::Cancelled);
        assert_eq!(e.message, "扫描中断");
    }

    #[test]
    fn catalog_adb_keeps_offline_code() {
        let e = ipc_catalog(AdbError::DeviceOffline("S1".into()).into());
        assert_eq!(e.code, IpcErrorCode::DeviceOffline);
        assert!(e.message.contains("S1"));
    }

    #[test]
    fn library_error_is_invalid_args() {
        let e = ipc_library(LibraryError::EmptyTemplate("c1".into()));
        assert_eq!(e.code, IpcErrorCode::InvalidArgs);
    }

    #[test]
    fn library_store_invalid_is_invalid_args() {
        let e = ipc_library_store(LibraryStoreError::Library(LibraryError::EmptyTemplate(
            "c1".into(),
        )));
        assert_eq!(e.code, IpcErrorCode::InvalidArgs);
        assert!(e.message.contains("c1"));
    }

    #[test]
    fn library_store_io_is_internal() {
        let e = ipc_library_store(LibraryStoreError::Io("disk".into()));
        assert_eq!(e.code, IpcErrorCode::Internal);
        assert_eq!(e.message, "disk");
    }

    #[test]
    fn present_error_codes() {
        let empty = ipc_present(PresentError::Empty);
        assert_eq!(empty.code, IpcErrorCode::InvalidArgs);
        assert_eq!(empty.message, "当前没有投屏画面");

        let mismatch = ipc_present(PresentError::SerialMismatch);
        assert_eq!(mismatch.code, IpcErrorCode::InvalidArgs);
        assert_eq!(mismatch.message, "截图设备与当前舞台不一致");

        let exited = ipc_present(PresentError::Exited);
        assert_eq!(exited.code, IpcErrorCode::Internal);
        assert_eq!(exited.message, "呈现线程已退出");

        let timeout = ipc_present(PresentError::Timeout);
        assert_eq!(timeout.code, IpcErrorCode::Internal);
        assert_eq!(timeout.message, "截图超时");

        let gpu = ipc_present(PresentError::Internal("d3d".into()));
        assert_eq!(gpu.code, IpcErrorCode::Internal);
        assert_eq!(gpu.message, "d3d");
    }

    #[test]
    fn dnd_error_codes() {
        let interrupted = ipc_dnd(DndError::Interrupted);
        assert_eq!(interrupted.code, IpcErrorCode::Cancelled);
        assert_eq!(interrupted.message, "拖出已中断");

        let empty = FileError::EmptyTree("/sdcard/DCIM".into());
        let via_file = ipc_file(FileError::EmptyTree("/sdcard/DCIM".into()));
        let via_dnd = ipc_dnd(DndError::Files(empty));
        assert_eq!(via_dnd.code, via_file.code);
        assert_eq!(via_dnd.message, via_file.message);

        let main = ipc_dnd(DndError::NeedMainThread);
        assert_eq!(main.code, IpcErrorCode::InvalidArgs);
        assert_eq!(main.message, "拖出必须在主线程启动");

        for (e, msg) in [
            (DndError::Unsupported, "拖出仅支持 Windows 与 macOS"),
            (DndError::NoGesture, "没有可用的拖动手势"),
            (DndError::NoWindow, "没有可用的主窗口"),
            (DndError::NoContentView, "主窗口没有 contentView"),
            (DndError::NotReady, "拖出文件尚未就绪"),
        ] {
            let mapped = ipc_dnd(e);
            assert_eq!(mapped.code, IpcErrorCode::InvalidArgs);
            assert_eq!(mapped.message, msg);
        }

        let ole = ipc_dnd(DndError::OleFailed("0x80004005".into()));
        assert_eq!(ole.code, IpcErrorCode::Internal);
        assert_eq!(ole.message, "DoDragDrop 失败: 0x80004005");

        let host = ipc_dnd(DndError::Host);
        assert_eq!(host.code, IpcErrorCode::Internal);
        assert_eq!(host.message, "拖出宿主调度失败");
    }

    #[test]
    fn mirror_bad_exit_strips_stderr() {
        let e = ipc_mirror(MirrorError::Adb(AdbError::BadExit {
            exit_code: 1,
            stderr: "ls: /secret: Permission denied".into(),
        }));
        assert_eq!(e.code, IpcErrorCode::AdbError);
        assert_eq!(e.message, "投屏设备命令失败(退出码 1)");
        assert!(!e.message.contains("Permission denied"));
    }

    #[test]
    fn progress_join_is_internal_not_adb() {
        let e = ipc_file(FileError::ProgressJoin);
        assert_eq!(e.code, IpcErrorCode::Internal);
        assert_eq!(e.message, "传输进度任务已中断");
        assert_ne!(e.code, IpcErrorCode::AdbError);
    }
}
