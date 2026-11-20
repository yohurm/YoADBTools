//! 采集服务组合根与 commands 门面。
//!
//! 槽位状态机在 [`crate::slots::CaptureSlots`]，环存储在 [`crate::ring_store::RingStore`]，
//! 窗口命中在 [`crate::windows::WindowBook`]，导出在 [`crate::export::LogExporter`]，
//! 进程索引在 [`crate::index::ProcessIndexService`]。
//! `CaptureService` 只做组合与薄转发，不再自己实现环 / 导出 / 窗口索引内部。

use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::index::ProcessIndexService;
use crate::ring_store::RingStore;
use crate::slots::CaptureSlots;
use crate::windows::WindowBook;
use yohu_adb::AdbClient;
use yohu_protocol::{
    CaptureStart, CaptureStatus, LogLine, LogPage, LogWindowBind, ProcessEntry,
};

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("采集已取消")]
    Cancelled,
    /// 运输失败。句子就是 `AdbError` 的句子，不再加前缀。
    #[error(transparent)]
    Adb(#[from] yohu_adb::AdbError),
    /// 导出落盘失败。只带路径载荷分类；OS 原文进 tracing，不进 IPC。
    #[error("导出写入失败: {path}")]
    ExportIo { path: String },
    #[error("无法生成导出时间戳")]
    ExportStamp,
    #[error("未指定导出目录")]
    ExportDir,
    #[error("日志导出任务失败")]
    ExportJoin,
    #[error("日志窗口未登记")]
    WindowNotRegistered,
}

pub struct CaptureService {
    slots: Arc<CaptureSlots>,
    rings: Arc<RingStore>,
    windows: Arc<WindowBook>,
    index: Arc<ProcessIndexService>,
    adb: Arc<AdbClient>,
    /// 应用根取消令牌：短查询（清缓冲 / ps）用它的子令牌。
    root_cancel: CancellationToken,
}

impl CaptureService {
    pub fn new(
        adb: Arc<AdbClient>,
        sink: mpsc::Sender<yohu_protocol::AppEvent>,
        ring_capacity: usize,
        root_cancel: CancellationToken,
    ) -> Arc<Self> {
        let rings = Arc::new(RingStore::new(ring_capacity));
        let windows = Arc::new(WindowBook::new());
        let index = Arc::new(ProcessIndexService::new(Arc::clone(&adb), sink.clone()));
        let slots = Arc::new(CaptureSlots::new(
            Arc::clone(&adb),
            Arc::clone(&index),
            sink,
            Arc::clone(&windows),
            Arc::clone(&rings),
            root_cancel.clone(),
        ));
        Arc::new(Self {
            slots,
            rings,
            windows,
            index,
            adb,
            root_cancel,
        })
    }

    pub fn set_ring_capacity(&self, capacity: usize) {
        self.rings.set_capacity(capacity);
    }

    /// 会话层持有环存储（导出等独立用例按需取用）。
    pub fn ring_store(&self) -> &Arc<RingStore> {
        &self.rings
    }

    /// 开始跟流。仅 Live 可 adopt。
    pub async fn start(
        self: &Arc<Self>,
        serial: &str,
        clear_device: bool,
    ) -> Result<CaptureStart, LogError> {
        self.slots.start(serial, clear_device).await
    }

    pub async fn stop(&self, serial: &str) {
        self.slots.stop(serial).await;
    }

    pub fn status(&self, serial: &str) -> CaptureStatus {
        let (capturing, generation) = self.slots.status(serial);
        CaptureStatus {
            serial: serial.to_string(),
            capturing,
            generation,
            last_seq: self.rings.last_seq(serial),
        }
    }

    pub fn clear(&self, serial: &str) {
        self.rings.clear(serial);
        self.windows.clear_serial(serial);
    }

    pub fn bind_window(&self, spec: LogWindowBind) -> LogPage {
        // 读路径不建环：未登记的 serial 得到空窗口/空页。
        let ring = self.rings.try_ring(&spec.serial);
        self.windows.bind(spec, ring.as_deref())
    }

    pub fn release_window(&self, id: u64) {
        self.windows.release(id);
    }

    pub async fn clear_device_buffer(&self, serial: &str) -> Result<(), LogError> {
        self.adb
            .clear_log(serial, self.root_cancel.child_token())
            .await?;
        self.clear(serial);
        Ok(())
    }

    /// 设备生命周期终点：停采集、清缓冲、忘掉槽位（世代记录随之消失）。
    pub async fn detach_device(&self, serial: &str) {
        self.slots.stop(serial).await;
        self.clear(serial);
        self.slots.forget(serial);
    }

    pub async fn process_snapshot(&self, serial: &str) -> Result<Vec<ProcessEntry>, LogError> {
        self.index
            .snapshot(serial, self.root_cancel.child_token())
            .await
            .map_err(Into::into)
    }

    /// 诊断用公开 API：返回 `seq >= from_seq` 的前 `limit` 条环快照。
    /// 供集成测试与排障读取采集结果；命令层不经此入口（wire 走窗口快照）。
    pub fn snapshot(&self, serial: &str, from_seq: u64, limit: usize) -> Vec<LogLine> {
        self.rings.snapshot(serial, from_seq, limit)
    }
}

#[cfg(test)]
mod tests {
    use super::LogError;
    use yohu_adb::AdbError;

    #[test]
    fn adb_display_is_the_transport_sentence() {
        let err = LogError::Adb(AdbError::ToolUnavailable);
        assert_eq!(err.to_string(), AdbError::ToolUnavailable.to_string());
        assert!(!err.to_string().contains("采集失败"));
    }

    /// 错误只分类：每个变体一句话，不带邻层 `Display` 拼接。
    #[test]
    fn window_not_registered_is_a_real_classification() {
        let err = LogError::WindowNotRegistered;
        assert_eq!(err.to_string(), "日志窗口未登记");
    }
}
