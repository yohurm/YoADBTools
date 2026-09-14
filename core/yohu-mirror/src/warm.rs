//! 预热隧道判定（纯函数）。条目在 `MirrorService` 编排。

use std::collections::HashMap;

use tokio_util::sync::CancellationToken;

use crate::error::MirrorError;
use crate::tunnel::WarmTunnel;

pub enum WarmEntry {
    Busy {
        cancel: CancellationToken,
        force_forward: bool,
    },
    Ready {
        tunnel: WarmTunnel,
        force_forward: bool,
    },
}

pub enum TakeStep {
    Ready(WarmTunnel),
    Mismatch(WarmTunnel),
    Wait,
    Miss,
}

#[cfg(test)]
impl std::fmt::Debug for TakeStep {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ready(_) => f.write_str("Ready"),
            Self::Mismatch(_) => f.write_str("Mismatch"),
            Self::Wait => f.write_str("Wait"),
            Self::Miss => f.write_str("Miss"),
        }
    }
}

/// 未取消且槽未 Live 则保留。仍归本次 Busy 由 `commit_warmup` 里 `warmed_force_forward is Some` 表达。
fn keep_warmup(cancelled: bool, slot_live: bool) -> bool {
    !cancelled && !slot_live
}

/// 复用比较 warmup 当时的请求意图，不看实际 reverse/forward。
fn warm_matches(warmed_force_forward: bool, start_force_forward: bool) -> bool {
    warmed_force_forward == start_force_forward
}

pub fn take_warm_step(
    warm: &mut HashMap<String, WarmEntry>,
    serial: &str,
    force_forward: bool,
) -> TakeStep {
    match warm.remove(serial) {
        Some(WarmEntry::Ready {
            tunnel,
            force_forward: warmed,
        }) => {
            if warm_matches(warmed, force_forward) {
                TakeStep::Ready(tunnel)
            } else {
                TakeStep::Mismatch(tunnel)
            }
        }
        Some(WarmEntry::Busy {
            cancel,
            force_forward: warmed,
        }) => {
            if warm_matches(warmed, force_forward) {
                warm.insert(
                    serial.to_string(),
                    WarmEntry::Busy {
                        cancel,
                        force_forward: warmed,
                    },
                );
                TakeStep::Wait
            } else {
                cancel.cancel();
                TakeStep::Miss
            }
        }
        None => TakeStep::Miss,
    }
}

pub fn commit_warmup(
    warm: &mut HashMap<String, WarmEntry>,
    serial: &str,
    result: Result<WarmTunnel, MirrorError>,
    cancelled: bool,
    slot_live: bool,
) -> Option<WarmTunnel> {
    let warmed_force_forward = match warm.get(serial) {
        Some(WarmEntry::Busy { force_forward, .. }) => Some(*force_forward),
        _ => None,
    };
    match (result, warmed_force_forward) {
        (Ok(tunnel), Some(force_forward)) if keep_warmup(cancelled, slot_live) => {
            tracing::info!(serial, "投屏预热完成");
            warm.insert(
                serial.to_string(),
                WarmEntry::Ready {
                    tunnel,
                    force_forward,
                },
            );
            None
        }
        (Ok(tunnel), _) => {
            warm.remove(serial);
            Some(tunnel)
        }
        (Err(e), _) => {
            tracing::warn!(serial, error = %e, "投屏预热失败");
            warm.remove(serial);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn forward_tunnel() -> WarmTunnel {
        WarmTunnel::Forward { scid: 7, port: 9 }
    }

    #[test]
    fn keep_warmup_only_drops_live_or_cancel() {
        assert!(keep_warmup(false, false), "Starting 槽不得挡住 Ready");
        assert!(!keep_warmup(false, true), "Live 已自持隧道才丢");
        assert!(!keep_warmup(true, false));
    }

    #[test]
    fn warm_matches_request_intent_not_actual_mode() {
        assert!(warm_matches(false, false));
        assert!(warm_matches(true, true));
        assert!(!warm_matches(true, false));
        assert!(!warm_matches(false, true));
    }

    #[test]
    fn commit_warmup_inserts_ready_while_starting() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Busy {
                cancel: CancellationToken::new(),
                force_forward: false,
            },
        );
        let stale = commit_warmup(&mut warm, "S1", Ok(forward_tunnel()), false, false);
        assert!(stale.is_none());
        assert!(matches!(
            warm.get("S1"),
            Some(WarmEntry::Ready {
                force_forward: false,
                ..
            })
        ));
        match take_warm_step(&mut warm, "S1", false) {
            TakeStep::Ready(t) => {
                assert!(t.used_forward());
                assert_eq!(t.scid(), 7);
            }
            other => panic!("Starting 必须拿到 Ready，得到 {other:?}"),
        }
    }

    #[test]
    fn commit_warmup_drops_when_slot_already_live() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Busy {
                cancel: CancellationToken::new(),
                force_forward: false,
            },
        );
        let stale = commit_warmup(&mut warm, "S1", Ok(forward_tunnel()), false, true);
        assert!(stale.is_some());
        assert!(!warm.contains_key("S1"));
    }

    #[test]
    fn commit_warmup_drops_when_cancelled() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Busy {
                cancel: CancellationToken::new(),
                force_forward: false,
            },
        );
        let stale = commit_warmup(&mut warm, "S1", Ok(forward_tunnel()), true, false);
        assert!(stale.is_some());
        assert!(!warm.contains_key("S1"));
    }

    #[test]
    fn commit_warmup_drops_when_not_busy() {
        let mut warm = HashMap::new();
        let stale = commit_warmup(&mut warm, "S1", Ok(forward_tunnel()), false, false);
        assert!(stale.is_some());
        assert!(!warm.contains_key("S1"));
    }

    #[test]
    fn take_warm_reuses_reverse_prefer_fallback_forward() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Ready {
                tunnel: forward_tunnel(),
                force_forward: false,
            },
        );
        match take_warm_step(&mut warm, "S1", false) {
            TakeStep::Ready(t) => assert!(t.used_forward()),
            other => panic!("reverse-prefer 应复用 fallback-forward，得到 {other:?}"),
        }
    }

    #[test]
    fn take_warm_mismatch_drops_forced_forward() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Ready {
                tunnel: forward_tunnel(),
                force_forward: true,
            },
        );
        assert!(matches!(
            take_warm_step(&mut warm, "S1", false),
            TakeStep::Mismatch(_)
        ));
    }

    #[test]
    fn take_warm_step_waits_busy() {
        let mut warm = HashMap::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Busy {
                cancel: CancellationToken::new(),
                force_forward: false,
            },
        );
        assert!(matches!(
            take_warm_step(&mut warm, "S1", false),
            TakeStep::Wait
        ));
        assert!(matches!(warm.get("S1"), Some(WarmEntry::Busy { .. })));
    }

    #[test]
    fn take_warm_busy_mismatch_is_miss_and_cancels() {
        let mut warm = HashMap::new();
        let cancel = CancellationToken::new();
        warm.insert(
            "S1".into(),
            WarmEntry::Busy {
                cancel: cancel.clone(),
                force_forward: true,
            },
        );
        assert!(matches!(
            take_warm_step(&mut warm, "S1", false),
            TakeStep::Miss
        ));
        assert!(!warm.contains_key("S1"));
        assert!(cancel.is_cancelled());
    }
}
