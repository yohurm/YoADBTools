//! 投屏会话：计划、任务登记、Present 绑定。commands 只校验在线并转发。

use std::collections::HashMap;
use std::sync::Mutex;

use crate::mirror_present::PresentError;
use crate::state::AppState;
use yohu_mirror::MirrorError;
use yohu_protocol::{MirrorStart, MirrorStartRequest};

pub struct MirrorSessions {
    tasks: Mutex<HashMap<String, u32>>,
}

impl MirrorSessions {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_task(&self, serial: &str, task_id: u32) {
        self.tasks
            .lock()
            .expect("mirror task lock poisoned")
            .insert(serial.to_string(), task_id);
    }

    pub fn finish_task(&self, serial: &str) -> Option<u32> {
        self.tasks
            .lock()
            .expect("mirror task lock poisoned")
            .remove(serial)
    }
}

/// 调用方已鉴权。
pub async fn start(state: &AppState, req: MirrorStartRequest) -> Result<MirrorStart, MirrorError> {
    let plan =
        crate::mirror_plan::plan_start(&state.settings.snapshot(), req, state.present.hevc_ok());
    tracing::info!(
        serial = %plan.serial,
        control = plan.control,
        force_forward = plan.force_forward,
        codec = %plan.video_codec,
        max_size = plan.max_size,
        bit_rate = plan.video_bit_rate,
        max_fps = plan.max_fps,
        "mirror.start"
    );
    let serial = plan.serial.clone();
    let result = state.mirror.start(plan).await.map_err(|e| {
        tracing::error!(serial = %serial, error = %e, "mirror.start 失败");
        e
    })?;
    tracing::info!(
        serial = %result.serial,
        generation = result.generation,
        adopted = result.adopted,
        "mirror.start 返回"
    );
    if !result.adopted {
        let task_id = state.tasks.register(
            format!("投屏: {}", serial),
            format!("设备 {}", serial),
            None,
        );
        state.mirror_sessions.register_task(&serial, task_id);
    }
    if let Some(pipe) = state.mirror.frame_pipe(&serial) {
        state.present.attach(&serial, result.generation, pipe);
    }
    Ok(result)
}

pub fn finish(state: &AppState, serial: &str) {
    if let Some(task_id) = state.mirror_sessions.finish_task(serial) {
        state.tasks.finish(task_id);
    }
}

pub fn screenshot(state: &AppState, serial: &str, path: &str) -> Result<(), PresentError> {
    state.present.screenshot(serial, path)?;
    state.app_log.info(format!("投屏截图已保存: {path}"));
    Ok(())
}
