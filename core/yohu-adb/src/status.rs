//! 在线设备运行时状态枢纽：每台 Online 设备一路周期采样，变更才推 `device/status`。
//!
//! 目录（`adb devices -l`）仍是存在性唯一源；本枢纽不改 `DeviceInfo`，只跟 Online serial 集合。

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::client::AdbClient;
use crate::parse::status::DeviceStatusFields;
use yohu_protocol::{AppEvent, DeviceStatus};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);

struct Slot {
    cancel: CancellationToken,
    status: Option<DeviceStatus>,
}

/// 设备运行时状态服务（每 Online serial 一路）。
pub struct DeviceStatusHub {
    client: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    parent: CancellationToken,
    slots: Mutex<HashMap<String, Slot>>,
}

impl DeviceStatusHub {
    pub fn new(
        client: Arc<AdbClient>,
        sink: mpsc::Sender<AppEvent>,
        parent: CancellationToken,
    ) -> Arc<Self> {
        Arc::new(Self {
            client,
            sink,
            parent,
            slots: Mutex::new(HashMap::new()),
        })
    }

    /// 与当前 Online serial 对齐：新设备开采样，离开集合的停任务并丢缓存。
    pub fn sync_online(self: &Arc<Self>, serials: &[String]) {
        let wanted: HashSet<&str> = serials.iter().map(String::as_str).collect();
        let mut slots = self.slots.lock().expect("status slots lock poisoned");
        let stale: Vec<String> = slots
            .keys()
            .filter(|s| !wanted.contains(s.as_str()))
            .cloned()
            .collect();
        for serial in stale {
            if let Some(slot) = slots.remove(&serial) {
                slot.cancel.cancel();
            }
        }
        let mut to_start = Vec::new();
        for serial in serials {
            if slots.contains_key(serial) {
                continue;
            }
            let cancel = self.parent.child_token();
            slots.insert(
                serial.clone(),
                Slot {
                    cancel: cancel.clone(),
                    status: None,
                },
            );
            to_start.push((serial.clone(), cancel));
        }
        drop(slots);
        for (serial, cancel) in to_start {
            let hub = Arc::clone(self);
            tokio::spawn(async move {
                poll_loop(hub, serial, cancel).await;
            });
        }
    }

    pub fn snapshot(&self, serial: &str) -> Option<DeviceStatus> {
        self.slots
            .lock()
            .expect("status slots lock poisoned")
            .get(serial)
            .and_then(|s| s.status.clone())
    }

    pub fn snapshot_all(&self) -> Vec<DeviceStatus> {
        let mut out: Vec<DeviceStatus> = self
            .slots
            .lock()
            .expect("status slots lock poisoned")
            .values()
            .filter_map(|s| s.status.clone())
            .collect();
        out.sort_by(|a, b| a.serial.cmp(&b.serial));
        out
    }

    /// 写设备深浅色后再采一次，更新缓存并推事件。读只信 [`AdbClient::sample_status`]。
    /// 采样失败时保留上次运行时字段，只覆盖本次写入的 night；槽已撤则视为掉线。
    pub async fn set_night(
        &self,
        serial: &str,
        night: bool,
        cancel: CancellationToken,
    ) -> Result<DeviceStatus, crate::AdbError> {
        let slot_cancel = self
            .slots
            .lock()
            .expect("status slots lock poisoned")
            .get(serial)
            .map(|s| s.cancel.clone());
        let cancel = slot_cancel.unwrap_or(cancel);
        self.client
            .set_night_mode(serial, night, cancel.clone())
            .await?;
        let previous = self.snapshot(serial);
        let sampled = match self.client.sample_status(serial, cancel).await {
            Ok(fields) => Some(fields),
            Err(e) => {
                tracing::debug!(serial = %serial, error = %e, "写深浅色后采样失败，保留上次快照");
                None
            }
        };
        let fields = overlay_after_set_night(previous.as_ref(), sampled, night);
        let (status, _) = self
            .upsert(serial, fields)
            .ok_or_else(|| crate::AdbError::DeviceOffline(serial.to_string()))?;
        // 用户写入是控制面：与 devices/changed 一样 send().await，禁止 try_send。
        if let Err(e) = self
            .sink
            .send(AppEvent::DeviceStatus {
                status: status.clone(),
            })
            .await
        {
            tracing::warn!(serial = %serial, error = %e, "device/status 发送失败");
        }
        Ok(status)
    }

    /// 槽已不在 Online 集合时不写缓存。返回 (快照, 内容是否变化)。
    fn upsert(&self, serial: &str, fields: DeviceStatusFields) -> Option<(DeviceStatus, bool)> {
        let mut slots = self.slots.lock().expect("status slots lock poisoned");
        let slot = slots.get_mut(serial)?;
        let fields = overlay_fields(slot.status.as_ref(), fields);
        let generation = slot
            .status
            .as_ref()
            .map(|s| s.generation.saturating_add(1))
            .unwrap_or(1);
        let next = DeviceStatus {
            serial: serial.to_string(),
            generation,
            night: fields.night,
            battery_pct: fields.battery_pct,
            charging: fields.charging,
            sdk: fields.sdk,
            release: fields.release,
            screen_on: fields.screen_on,
            brand: fields.brand,
        };
        if let Some(prev) = slot.status.as_ref() {
            if prev.same_runtime(&next) {
                return Some((prev.clone(), false));
            }
        }
        slot.status = Some(next.clone());
        Some((next, true))
    }
}

fn fields_from_status(status: &DeviceStatus) -> DeviceStatusFields {
    DeviceStatusFields {
        night: status.night,
        battery_pct: status.battery_pct,
        charging: status.charging,
        sdk: status.sdk,
        release: status.release.clone(),
        screen_on: status.screen_on,
        brand: status.brand.clone(),
    }
}

/// 本次 `None` 保留上次已有值，让 getprop 首采与 dumpsys 补采可以分开发。
fn overlay_fields(
    previous: Option<&DeviceStatus>,
    sampled: DeviceStatusFields,
) -> DeviceStatusFields {
    let prev = previous.map(fields_from_status);
    DeviceStatusFields {
        night: sampled.night.or(prev.as_ref().and_then(|p| p.night)),
        battery_pct: sampled
            .battery_pct
            .or(prev.as_ref().and_then(|p| p.battery_pct)),
        charging: sampled.charging.or(prev.as_ref().and_then(|p| p.charging)),
        sdk: sampled.sdk.or(prev.as_ref().and_then(|p| p.sdk)),
        release: sampled
            .release
            .or_else(|| prev.as_ref().and_then(|p| p.release.clone())),
        screen_on: sampled
            .screen_on
            .or(prev.as_ref().and_then(|p| p.screen_on)),
        brand: sampled
            .brand
            .or_else(|| prev.as_ref().and_then(|p| p.brand.clone())),
    }
}

/// 写深浅色已成功：采样到则用采样（解析不到 night 时才填写入值）；失败则保留上次其它字段并采用本次写入的 night。
fn overlay_after_set_night(
    previous: Option<&DeviceStatus>,
    sampled: Option<DeviceStatusFields>,
    night: bool,
) -> DeviceStatusFields {
    match sampled {
        Some(mut fields) => {
            if fields.night.is_none() {
                fields.night = Some(night);
            }
            fields
        }
        None => {
            let mut fields = previous.map(fields_from_status).unwrap_or_default();
            fields.night = Some(night);
            fields
        }
    }
}

async fn push_sample(
    hub: &Arc<DeviceStatusHub>,
    serial: &str,
    cancel: &CancellationToken,
    props_only: bool,
) {
    let result = if props_only {
        hub.client.sample_props(serial, cancel.clone()).await
    } else {
        hub.client.sample_status(serial, cancel.clone()).await
    };
    match result {
        Ok(fields) => {
            if let Some((status, true)) = hub.upsert(serial, fields) {
                let _ = hub.sink.try_send(AppEvent::DeviceStatus { status });
            }
        }
        Err(e) => {
            tracing::debug!(serial = %serial, error = %e, "设备状态采样失败，保留上次快照");
        }
    }
}

async fn poll_loop(hub: Arc<DeviceStatusHub>, serial: String, cancel: CancellationToken) {
    // 首采拆段：getprop 先推 Android/API，dumpsys 随后补电量/深浅色，禁止整包结束才出数。
    push_sample(&hub, &serial, &cancel, true).await;
    if cancel.is_cancelled() {
        return;
    }
    push_sample(&hub, &serial, &cancel, false).await;
    let mut ticker = tokio::time::interval(SAMPLE_INTERVAL);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    ticker.tick().await;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {}
        }
        if cancel.is_cancelled() {
            break;
        }
        push_sample(&hub, &serial, &cancel, false).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(night: bool, battery: Option<u8>) -> DeviceStatus {
        DeviceStatus {
            serial: "S1".into(),
            generation: 3,
            night: Some(night),
            battery_pct: battery,
            charging: Some(true),
            sdk: Some(34),
            release: Some("15".into()),
            screen_on: Some(true),
            brand: Some("motorola".into()),
        }
    }

    #[test]
    fn overlay_keeps_previous_runtime_when_sample_fails() {
        let prev = status(false, Some(87));
        let fields = overlay_after_set_night(Some(&prev), None, true);
        assert_eq!(fields.night, Some(true));
        assert_eq!(fields.battery_pct, Some(87));
        assert_eq!(fields.sdk, Some(34));
        assert_eq!(fields.release.as_deref(), Some("15"));
    }

    #[test]
    fn overlay_uses_sample_when_present() {
        let prev = status(false, Some(10));
        let sampled = DeviceStatusFields {
            night: Some(true),
            battery_pct: Some(40),
            charging: Some(false),
            sdk: Some(35),
            release: Some("16".into()),
            screen_on: Some(false),
            brand: Some("google".into()),
        };
        let fields = overlay_after_set_night(Some(&prev), Some(sampled.clone()), true);
        assert_eq!(fields, sampled);
    }

    #[test]
    fn overlay_fills_night_only_when_sample_missed_it() {
        let sampled = DeviceStatusFields {
            night: None,
            battery_pct: Some(50),
            ..DeviceStatusFields::default()
        };
        let fields = overlay_after_set_night(None, Some(sampled), true);
        assert_eq!(fields.night, Some(true));
        assert_eq!(fields.battery_pct, Some(50));
    }

    #[test]
    fn overlay_fields_keeps_previous_when_sample_omits() {
        let prev = status(true, Some(87));
        let sampled = DeviceStatusFields {
            sdk: Some(35),
            release: Some("16".into()),
            brand: Some("motorola".into()),
            ..DeviceStatusFields::default()
        };
        let fields = overlay_fields(Some(&prev), sampled);
        assert_eq!(fields.sdk, Some(35));
        assert_eq!(fields.release.as_deref(), Some("16"));
        assert_eq!(fields.night, Some(true));
        assert_eq!(fields.battery_pct, Some(87));
    }
}
