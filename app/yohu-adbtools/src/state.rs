//! 应用状态容器：core 服务实例 + 运行期可变状态。
//!
//! 组合根装配在 lib.rs；commands 层只经 State<AppState> 访问，不触碰 Tauri 之外的全局。

use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, DeviceStatusHub, ToolResolver};
use yohu_domain::{
    assert_device_online, assert_targets_online, AppLog, CommandLibrary, DeviceSessionError,
};
use yohu_files::{FileBrowser, FileMutator, TransferRunner};
use yohu_logsrv::CaptureService;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, DeviceInfo, IpcError, IpcErrorCode};

use crate::browse_runs::BrowseRuns;
use crate::capture_runs::CaptureRuns;
use crate::group_runs::GroupRuns;
use crate::mirror_present::PresentHost;
use crate::mirror_sessions::MirrorSessions;
use crate::paths::AppPaths;
use crate::settings_store::SettingsStore;
use crate::tasks::TaskCenter;
use crate::transfer_runs::TransferRuns;
use crate::update_runs::UpdateRuns;

type CatalogWatch = tokio::sync::watch::Receiver<Option<Result<Vec<DeviceInfo>, String>>>;

/// 应用状态（Tauri managed state）。
pub struct AppState {
    pub client: Arc<AdbClient>,
    pub tool: Arc<ToolResolver>,
    pub capture: Arc<CaptureService>,
    pub status: Arc<DeviceStatusHub>,
    pub mirror: Arc<MirrorService>,
    pub present: Arc<PresentHost>,
    pub browser: FileBrowser,
    pub mutator: FileMutator,
    pub transfers: TransferRunner,
    pub settings: SettingsStore,
    pub paths: AppPaths,
    pub app_log: AppLog,
    pub tasks: Arc<TaskCenter>,

    pub event_tx: mpsc::Sender<AppEvent>,
    pub root_cancel: CancellationToken,

    pub last_devices: Mutex<Vec<DeviceInfo>>,
    pub group_runs: GroupRuns,
    pub library: Mutex<CommandLibrary>,
    pub capture_runs: CaptureRuns,
    pub mirror_sessions: MirrorSessions,
    pub transfer_runs: TransferRuns,
    pub update_runs: UpdateRuns,
    pub browse_runs: BrowseRuns,
    pub catalog_gate: tokio::sync::Mutex<Option<CatalogWatch>>,
}

impl AppState {
    /// commands 鉴权。只许 invoke 边界调用，服务禁止再验。
    pub fn require_online(&self, serial: &str) -> Result<(), IpcError> {
        let devices = self.last_devices.lock().expect("devices lock poisoned");
        assert_device_online(serial, &devices).map_err(session_ipc)
    }

    pub fn require_online_many(&self, serials: &[String]) -> Result<(), IpcError> {
        let devices = self.last_devices.lock().expect("devices lock poisoned");
        assert_targets_online(serials, &devices).map_err(session_ipc)
    }
}

fn session_ipc(e: DeviceSessionError) -> IpcError {
    let code = match e {
        DeviceSessionError::Empty => IpcErrorCode::InvalidArgs,
        DeviceSessionError::Unknown(_) => IpcErrorCode::NotFound,
        DeviceSessionError::Unauthorized(_) => IpcErrorCode::Unauthorized,
        DeviceSessionError::Offline(_) => IpcErrorCode::DeviceOffline,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}
