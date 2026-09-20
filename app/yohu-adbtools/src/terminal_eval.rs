//! 单命令多设备并行执行（壳服务；命令层只做校验与转发）。
//!
//! 编排/失败映射下沉到本服务，`commands/terminal.rs` 保持薄转发。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_adb::AdbClient;
use yohu_domain::{run_command, run_line, CommandDefinition, LibraryError, RunError};
use yohu_protocol::{EvalResult, SerialEvalResult, TerminalEvalRequest, TerminalExecRequest};

#[derive(Debug, thiserror::Error)]
pub enum TerminalEvalError {
    #[error("命令不存在: {0}")]
    CommandNotFound(String),
    #[error("命令行为空")]
    EmptyCommand,
    #[error("{0}")]
    Library(#[from] LibraryError),
    #[error("{0}")]
    Join(String),
}

/// 查库、填充占位符、对 `serials` 并行执行。
pub async fn eval(
    state: &AppState,
    req: TerminalEvalRequest,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let definition = {
        let library = state.library.lock().expect("library lock poisoned");
        library
            .command(&req.command_id)
            .cloned()
            .ok_or_else(|| TerminalEvalError::CommandNotFound(req.command_id.clone()))?
    };
    let filled = definition.fill(&req.values)?;
    run_definition(state.client.clone(), filled, req.serials).await
}

/// 自定义命令行：对 `serials` 并行执行（不查库）。
pub async fn exec(
    state: &AppState,
    req: TerminalExecRequest,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let command = req.command.trim().to_string();
    if command.is_empty() {
        return Err(TerminalEvalError::EmptyCommand);
    }
    run_raw(state.client.clone(), command, req.serials).await
}

async fn run_definition(
    client: Arc<AdbClient>,
    definition: CommandDefinition,
    serials: Vec<String>,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let mut handles = Vec::with_capacity(serials.len());
    for serial in serials {
        let client = client.clone();
        let command = definition.clone();
        handles.push(tokio::spawn(async move {
            match run_command(client.as_ref(), &serial, &command, CancellationToken::new()).await {
                Ok(run) => from_eval(&serial, run.into_eval_result()),
                Err(error) => from_run_error(serial, error),
            }
        }));
    }
    join_results(handles).await
}

async fn run_raw(
    client: Arc<AdbClient>,
    line: String,
    serials: Vec<String>,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let mut handles = Vec::with_capacity(serials.len());
    for serial in serials {
        let client = client.clone();
        let line = line.clone();
        handles.push(tokio::spawn(async move {
            match run_line(client.as_ref(), &serial, &line, CancellationToken::new()).await {
                Ok(run) => from_eval(&serial, run.into_eval_result()),
                Err(error) => from_run_error(serial, error),
            }
        }));
    }
    join_results(handles).await
}

async fn join_results(
    handles: Vec<tokio::task::JoinHandle<SerialEvalResult>>,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(
            handle
                .await
                .map_err(|e| TerminalEvalError::Join(e.to_string()))?,
        );
    }
    Ok(results)
}

fn from_eval(serial: &str, result: EvalResult) -> SerialEvalResult {
    SerialEvalResult {
        serial: serial.to_string(),
        ok: result.ok,
        message: result.message,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: result.duration_ms,
    }
}

fn from_run_error(serial: String, error: RunError) -> SerialEvalResult {
    SerialEvalResult {
        serial,
        ok: false,
        message: error.to_string(),
        exit_code: -1,
        stdout: String::new(),
        stderr: String::new(),
        duration_ms: 0,
    }
}
