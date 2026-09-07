//! 设备目录：最近一次成功的 `adb devices -l` 就是唯一存在性快照。
//! 扫描失败不改目录；扫描成功（含空列表）整表替换。
//! 目录与状态 Hub 先广播/开采，掉线收敛不挡 UI。
//! 启动预热与 UI `device.refresh` 共用一趟扫描，禁止并行抢 adb daemon。

use std::sync::Arc;
use std::time::Instant;

use crate::state::AppState;
use yohu_domain::{catalog_after_scan, start_force_forward};
use yohu_protocol::{AppEvent, DeviceInfo, DeviceState};
use yohu_runtime::atomic_write;

type CatalogResult = Result<Vec<DeviceInfo>, String>;

/// 读目录快照，不触发扫描。
pub fn snapshot(state: &AppState) -> Vec<DeviceInfo> {
    state
        .last_devices
        .lock()
        .expect("devices lock poisoned")
        .clone()
}

/// 启动时恢复上次目录，UI `device.list` 能马上画出卡片；随后扫描会整表替换。
pub fn restore(state: &AppState) {
    let path = state.paths.devices_catalog_file();
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => return,
    };
    let devices: Vec<DeviceInfo> = match serde_json::from_str(&text) {
        Ok(devices) => devices,
        Err(e) => {
            tracing::warn!(path = %path.display(), error = %e, "上次设备目录损坏，忽略");
            return;
        }
    };
    if devices.is_empty() {
        return;
    }
    tracing::info!(n = devices.len(), "已恢复上次设备目录，等待扫描对账");
    *state.last_devices.lock().expect("devices lock poisoned") = devices;
}

fn persist_catalog(state: &AppState, devices: &[DeviceInfo]) {
    let path = state.paths.devices_catalog_file();
    match serde_json::to_vec(devices) {
        Ok(bytes) => {
            if let Err(e) = atomic_write(&path, bytes) {
                tracing::warn!(path = %path.display(), error = %e, "写入设备目录缓存失败");
            }
        }
        Err(e) => tracing::warn!(error = %e, "序列化设备目录缓存失败"),
    }
}

/// 立即 `adb start-server` + `devices -l`。并发调用合并为同一趟，禁止双开 daemon。
pub async fn refresh(state: &AppState) -> CatalogResult {
    let mut gate = state.catalog_gate.lock().await;
    if let Some(rx) = gate.as_ref() {
        let mut rx = rx.clone();
        drop(gate);
        tracing::info!("目录扫描已在进行，等待同一趟结果");
        loop {
            if let Some(result) = rx.borrow().clone() {
                return result;
            }
            if rx.changed().await.is_err() {
                return Err("扫描中断".into());
            }
        }
    }
    let (tx, rx) = tokio::sync::watch::channel(None);
    *gate = Some(rx);
    drop(gate);
    let result = refresh_inner(state).await;
    let _ = tx.send(Some(result.clone()));
    *state.catalog_gate.lock().await = None;
    result
}

async fn refresh_inner(state: &AppState) -> CatalogResult {
    let t0 = Instant::now();
    let (scanned, adb_used) = state
        .client
        .devices_resilient(state.root_cancel.child_token())
        .await
        .map_err(|e| e.to_string())?;
    let previous = snapshot(state);
    let (devices, went_offline) = catalog_after_scan(&previous, scanned);

    tracing::info!(
        ms = t0.elapsed().as_millis(),
        adb = %adb_used.display(),
        n = devices.len(),
        "设备扫描成功"
    );

    {
        let mut cache = state.last_devices.lock().expect("devices lock poisoned");
        *cache = devices.clone();
    }
    persist_catalog(state, &devices);

    let online: Vec<String> = devices
        .iter()
        .filter(|d| d.state == DeviceState::Online)
        .map(|d| d.serial.clone())
        .collect();

    state.status.sync_online(&online);

    if let Err(e) = state
        .event_tx
        .send(AppEvent::DevicesChanged {
            devices: devices.clone(),
        })
        .await
    {
        tracing::warn!("devices/changed 发送失败: {e}");
    }

    for serial in &went_offline {
        tracing::info!("设备掉线: {}", serial);
        let _ = state
            .event_tx
            .send(AppEvent::DeviceOffline {
                serial: serial.clone(),
            })
            .await;
    }

    let settings = state.settings.snapshot();
    for device in &devices {
        if device.state == DeviceState::Online {
            let serial = device.serial.clone();
            let force = start_force_forward(&settings, &device.connection);
            let mirror = Arc::clone(&state.mirror);
            tokio::spawn(async move {
                mirror.warmup(&serial, force).await;
            });
        }
    }

    if !went_offline.is_empty() {
        let capture = Arc::clone(&state.capture);
        let mirror = Arc::clone(&state.mirror);
        let offline = went_offline;
        tokio::spawn(async move {
            for serial in offline {
                capture.detach_device(&serial).await;
                mirror.stop(&serial).await;
                mirror.drop_warm(&serial).await;
            }
        });
    }

    Ok(devices)
}
