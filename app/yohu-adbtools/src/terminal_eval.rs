//! 单命令多设备并行执行（壳服务；命令层只做校验与转发）。
//!
//! 编排/失败映射下沉到本服务，`commands/terminal.rs` 保持薄转发。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::library_store::lock_library;
use crate::state::AppState;
use yohu_adb::AdbClient;
use yohu_domain::{run_command, run_line, CommandDefinition, CommandRun, LibraryError, RunError};
use yohu_protocol::{EvalResult, SerialEvalResult, TerminalEvalRequest, TerminalExecRequest};

#[derive(Debug, thiserror::Error)]
pub enum TerminalEvalError {
    #[error("命令不存在: {0}")]
    CommandNotFound(String),
    #[error("命令行为空")]
    EmptyCommand,
    #[error("{0}")]
    Library(#[from] LibraryError),
    #[error("命令任务异常结束")]
    JoinPanic,
    #[error("命令任务已取消")]
    JoinCancelled,
}

/// 查库、填充占位符、对 `serials` 并行执行。
pub async fn eval(
    state: &AppState,
    req: TerminalEvalRequest,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let definition = {
        let library = lock_library(state);
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
            let result =
                run_command(client.as_ref(), &serial, &command, CancellationToken::new()).await;
            from_run(serial, result)
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
            let result = run_line(client.as_ref(), &serial, &line, CancellationToken::new()).await;
            from_run(serial, result)
        }));
    }
    join_results(handles).await
}

async fn join_results(
    handles: Vec<tokio::task::JoinHandle<SerialEvalResult>>,
) -> Result<Vec<SerialEvalResult>, TerminalEvalError> {
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.map_err(|e| {
            if e.is_panic() {
                TerminalEvalError::JoinPanic
            } else {
                TerminalEvalError::JoinCancelled
            }
        })?);
    }
    Ok(results)
}

fn from_run(serial: String, result: Result<CommandRun, RunError>) -> SerialEvalResult {
    match result {
        Ok(run) => from_eval(&serial, run.into_eval_result()),
        Err(error) => from_run_error(serial, error),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn join_panic_does_not_keep_the_task_text() {
        let handle = tokio::spawn(async {
            panic!("secret-join");
            #[allow(unreachable_code)]
            SerialEvalResult {
                serial: String::new(),
                ok: false,
                message: String::new(),
                exit_code: 0,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 0,
            }
        });
        let err = join_results(vec![handle]).await.unwrap_err();
        assert!(matches!(err, TerminalEvalError::JoinPanic));
        assert_eq!(err.to_string(), "命令任务异常结束");
        assert!(!err.to_string().contains("secret"));
    }

    #[tokio::test]
    async fn aborted_join_is_cancelled() {
        let handle = tokio::spawn(std::future::pending::<SerialEvalResult>());
        handle.abort();
        let err = join_results(vec![handle]).await.unwrap_err();
        assert!(matches!(err, TerminalEvalError::JoinCancelled));
        assert_eq!(err.to_string(), "命令任务已取消");
    }

    #[test]
    fn run_outcome_becomes_one_serial_result() {
        let ok = from_run(
            "S1".into(),
            Ok(CommandRun {
                outcome: yohu_protocol::ExecOutcome {
                    exit_code: 0,
                    stdout: "hi".into(),
                    stderr: String::new(),
                },
                duration_ms: 4,
            }),
        );
        assert_eq!(ok.serial, "S1");
        assert!(ok.ok);
        assert_eq!(ok.stdout, "hi");
        assert_eq!(ok.exit_code, 0);
        assert_eq!(ok.duration_ms, 4);

        let err = from_run("S2".into(), Err(RunError::Timeout));
        assert_eq!(err.serial, "S2");
        assert!(!err.ok);
        assert_eq!(err.exit_code, -1);
        assert_eq!(err.message, "执行超时");
        assert!(err.stdout.is_empty());
        assert!(err.stderr.is_empty());
    }

    #[test]
    fn group_and_block_share_task_detail() {
        let src = include_str!("group_runs.rs");
        assert_eq!(src.matches("台设备 ·").count(), 1);
    }

    #[test]
    fn library_lock_sentence_once() {
        let owner_line = "state.library.lock().expect(\"library lock poisoned\")";
        let needle = "library lock poisoned";
        let files = [
            include_str!("library_store.rs"),
            include_str!("terminal_eval.rs"),
            include_str!("group_runs.rs"),
        ];
        assert_eq!(files[0].matches(owner_line).count(), 1);
        assert_eq!(files[1].matches(owner_line).count(), 0);
        assert_eq!(files[2].matches(owner_line).count(), 0);
        for src in files {
            let scanned = match src.split_once("fn library_lock_sentence_once") {
                Some((head, tail)) => format!("{head}{}", tail.replace(needle, "")),
                None => src.to_string(),
            };
            let scanned = scanned.replace(owner_line, "");
            assert!(!scanned.contains(needle), "{needle}");
        }
    }

    #[test]
    fn group_lock_sentence_once() {
        let src = include_str!("group_runs.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert_eq!(production.matches("group lock poisoned").count(), 1);
    }
}
