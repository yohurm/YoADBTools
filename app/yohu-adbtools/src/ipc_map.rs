//! capability / domain 错误 → [`IpcError`]。与 `commands` 平级。
//! invoke 拒绝与 `update/progress` 的失败都走同一映射；更新映射在 `ipc_update`，避免经设备目录绕回。

use yohu_adb::AdbError;
use yohu_domain::{DeviceSessionError, LibraryError};
#[cfg(test)]
use yohu_domain::SettingError;
use yohu_files::FileError;
use yohu_logsrv::LogError;
use yohu_mirror::MirrorError;
use yohu_protocol::{IpcError, IpcErrorCode};

use crate::device_catalog::CatalogError;
use crate::dnd::DndError;
use crate::group_runs::GroupRunError;
use crate::library_store::LibraryStoreError;
use crate::mirror_present::PresentError;
use crate::settings_store::SettingsStoreError;
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
        AdbError::ToolUnavailable
        | AdbError::CandidatesFailed
        | AdbError::BadExit { .. }
        | AdbError::Timeout => IpcErrorCode::AdbError,
        AdbError::Io(_)
        | AdbError::Truncated
        | AdbError::PumpPanic
        | AdbError::Shell(_)
        | AdbError::UnsupportedShell => IpcErrorCode::Internal,
    }
}

/// ADB 错误 → IPC 错误（保留语义码）。目录里的 `Arc<AdbError>` 也走这一份。
pub fn ipc_adb(e: &AdbError) -> IpcError {
    IpcError {
        code: adb_code(e),
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
        CatalogError::Adb(adb) => ipc_adb(&adb),
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
        LibraryStoreError::Io => ipc(LibraryStoreError::Io),
        LibraryStoreError::EmptyPaths => ipc_library(LibraryError::EmptyImportPaths),
        LibraryStoreError::NotJson => ipc_library(LibraryError::ImportPathsNotJson),
        LibraryStoreError::NotALibrary => ipc_library(LibraryError::NotALibrary),
    }
}

/// 文件模块错误 → IPC。文案与 `FileError` Display 同一条（分类 + 载荷），不扫 stderr。
pub fn ipc_file(e: FileError) -> IpcError {
    match e {
        FileError::Adb(adb) => ipc_adb(&adb),
        named => {
            let code = match &named {
                FileError::RemoteNotFound(_) => IpcErrorCode::NotFound,
                FileError::RemoteFailed(_) | FileError::Local(_) | FileError::ProgressClosed => {
                    IpcErrorCode::AdbError
                }
                FileError::ProgressJoin
                | FileError::BrowseMalformed(_)
                | FileError::ReadlinkUnparseable(_) => IpcErrorCode::Internal,
                FileError::Path(_)
                | FileError::NotAbsolute(_)
                | FileError::Traversal(_)
                | FileError::InvalidName(_)
                | FileError::OutsideRoot(_)
                | FileError::NotAttached
                | FileError::NotADirectory(_)
                | FileError::PermissionDenied(_)
                | FileError::ReadOnly(_)
                | FileError::AlreadyExists(_)
                | FileError::LocalNotFound(_)
                | FileError::EmptyTree(_)
                | FileError::TreeLimit(_)
                | FileError::TreeDepth(_) => IpcErrorCode::InvalidArgs,
                FileError::Adb(_) => unreachable!("Adb 已在外层匹配"),
            };
            ipc_code(code, named.to_string())
        }
    }
}

/// 更新检查错误 → IPC。实现在 [`crate::ipc_update`]，进度事件与 invoke 共用。
pub use crate::ipc_update::ipc_update;

pub fn ipc_present(e: PresentError) -> IpcError {
    let code = match &e {
        PresentError::Empty | PresentError::SerialMismatch => IpcErrorCode::InvalidArgs,
        PresentError::Exited
        | PresentError::Timeout
        | PresentError::Unimplemented
        | PresentError::ScreenshotWrite
        | PresentError::ScreenshotRead => IpcErrorCode::Internal,
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
        MirrorError::ServerMissing | MirrorError::ServerFailed(_) => {
            ipc_code(IpcErrorCode::AdbError, message)
        }
        MirrorError::Adb(adb) => IpcError {
            code: adb_code(&adb),
            message,
        },
        MirrorError::Io(_) => ipc_code(IpcErrorCode::Internal, message),
    }
}

pub fn ipc_log(e: LogError) -> IpcError {
    match e {
        LogError::Cancelled => ipc_code(IpcErrorCode::Cancelled, e.to_string()),
        LogError::Adb(adb) => ipc_adb(&adb),
        LogError::Io(_) | LogError::ExportStamp | LogError::ExportDir => ipc(e),
    }
}

pub fn ipc_group(e: GroupRunError) -> IpcError {
    match e {
        GroupRunError::Library(lib) => ipc_library(lib),
        other @ (GroupRunError::GroupNotFound(_)
        | GroupRunError::BlockNotFound(_)
        | GroupRunError::RunNotFound(_)) => ipc_code(IpcErrorCode::NotFound, other.to_string()),
    }
}

/// 设备会话鉴权失败 → IPC。文案用领域 Display。
pub fn ipc_session(e: DeviceSessionError) -> IpcError {
    let code = match &e {
        DeviceSessionError::Empty => IpcErrorCode::InvalidArgs,
        DeviceSessionError::Unknown(_) => IpcErrorCode::NotFound,
        DeviceSessionError::Unauthorized(_) => IpcErrorCode::Unauthorized,
        DeviceSessionError::Offline(_) => IpcErrorCode::DeviceOffline,
    };
    ipc_code(code, e.to_string())
}

/// 设置错误 → IPC。校验句来自领域；写入失败不带操作系统原文。
pub fn ipc_settings(e: SettingsStoreError) -> IpcError {
    match e {
        SettingsStoreError::Setting(err) => ipc_code(IpcErrorCode::InvalidArgs, err.to_string()),
        SettingsStoreError::Io => {
            ipc_code(IpcErrorCode::Internal, SettingsStoreError::Io.to_string())
        }
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
                DndError::OleFailed | DndError::Host => IpcErrorCode::Internal,
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
        TerminalEvalError::JoinPanic | TerminalEvalError::JoinCancelled => ipc(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_error_codes() {
        let empty = ipc_session(DeviceSessionError::Empty);
        assert_eq!(empty.code, IpcErrorCode::InvalidArgs);
        assert_eq!(empty.message, DeviceSessionError::Empty.to_string());

        let unknown = ipc_session(DeviceSessionError::Unknown("S1".into()));
        assert_eq!(unknown.code, IpcErrorCode::NotFound);
        assert_eq!(unknown.message, "未知设备: S1");

        let denied = ipc_session(DeviceSessionError::Unauthorized("S1".into()));
        assert_eq!(denied.code, IpcErrorCode::Unauthorized);
        assert_eq!(denied.message, "设备未授权: S1");

        let offline = ipc_session(DeviceSessionError::Offline("S1".into()));
        assert_eq!(offline.code, IpcErrorCode::DeviceOffline);
        assert_eq!(offline.message, yohu_domain::device_not_online_text("S1"));
    }

    #[test]
    fn group_not_found_is_not_found() {
        let e = ipc_group(GroupRunError::GroupNotFound("g1".into()));
        assert_eq!(e.code, IpcErrorCode::NotFound);
        assert_eq!(e.message, "命令组不存在: g1");
        let run = ipc_group(GroupRunError::RunNotFound(3));
        assert_eq!(run.code, IpcErrorCode::NotFound);
        assert_eq!(run.message, "运行不存在: 3");
    }

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
        let e = ipc_library_store(LibraryStoreError::Io);
        assert_eq!(e.code, IpcErrorCode::Internal);
        assert_eq!(e.message, "命令库读写失败");
    }

    #[test]
    fn settings_validation_stays_invalid_args_and_write_is_internal() {
        let invalid = ipc_settings(SettingsStoreError::Setting(SettingError::TooLarge));
        assert_eq!(invalid.code, IpcErrorCode::InvalidArgs);
        assert_eq!(invalid.message, "数值过大");
        let io = ipc_settings(SettingsStoreError::Io);
        assert_eq!(io.code, IpcErrorCode::Internal);
        assert_eq!(io.message, "无法写入设置文件");
    }

    #[test]
    fn library_store_rejected_is_invalid_args() {
        let e = ipc_library_store(LibraryStoreError::NotJson);
        assert_eq!(e.code, IpcErrorCode::InvalidArgs);
        assert_eq!(e.message, LibraryError::ImportPathsNotJson.to_string());
        assert_eq!(
            ipc_library_store(LibraryStoreError::EmptyPaths).message,
            LibraryError::EmptyImportPaths.to_string()
        );
        assert_eq!(
            ipc_library_store(LibraryStoreError::NotALibrary).message,
            LibraryError::NotALibrary.to_string()
        );
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

        let read = ipc_present(PresentError::ScreenshotRead);
        assert_eq!(read.code, IpcErrorCode::Internal);
        assert_eq!(read.message, "截图读取失败");
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

        let ole = ipc_dnd(DndError::OleFailed);
        assert_eq!(ole.code, IpcErrorCode::Internal);
        assert_eq!(ole.message, "拖出失败");

        let host = ipc_dnd(DndError::Host);
        assert_eq!(host.code, IpcErrorCode::Internal);
        assert_eq!(host.message, "拖出宿主调度失败");
    }

    #[test]
    fn mirror_adb_code_matches_transport() {
        let via = ipc_mirror(MirrorError::Adb(AdbError::DeviceOffline("S1".into())));
        let direct = ipc_adb(&AdbError::DeviceOffline("S1".into()));
        assert_eq!(via.code, direct.code);
        assert_eq!(via.code, IpcErrorCode::DeviceOffline);
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
        assert_eq!(e.message, FileError::ProgressJoin.to_string());
        assert_ne!(e.code, IpcErrorCode::AdbError);
    }

    #[test]
    fn readlink_unparseable_is_internal() {
        let e = ipc_file(FileError::ReadlinkUnparseable("/sdcard/a".into()));
        assert_eq!(e.code, IpcErrorCode::Internal);
        assert_eq!(
            e.message,
            FileError::ReadlinkUnparseable("/sdcard/a".into()).to_string()
        );
        assert!(!e.message.contains("远端操作失败"));
    }

    #[test]
    fn browse_malformed_is_internal() {
        let e = ipc_file(FileError::BrowseMalformed("/sdcard".into()));
        assert_eq!(e.code, IpcErrorCode::Internal);
        assert_eq!(e.message, "浏览结果无法识别: /sdcard");
        assert!(!e.message.contains("远端操作失败"));
    }

    #[test]
    fn browse_not_attached_is_invalid_args() {
        let e = ipc_file(FileError::NotAttached);
        assert_eq!(e.code, IpcErrorCode::InvalidArgs);
        assert_eq!(e.message, "浏览会话未打开");
    }

    #[test]
    fn settings_lock_sentence_once() {
        let src = include_str!("settings_store.rs");
        let body = "    result.expect(\"settings lock poisoned\")";
        let scanned = src.replacen(body, "", 1);
        assert!(!scanned.contains("settings lock poisoned"));
    }
}
