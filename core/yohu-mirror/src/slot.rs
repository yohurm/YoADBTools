//! 投屏槽位判定（纯函数）。Empty 用 `None` 表示。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Starting,
    Live,
    Stopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartAction {
    Adopt,
    Wait,
    Begin,
}

pub fn start_action(phase: Option<Phase>) -> StartAction {
    match phase {
        Some(Phase::Live) => StartAction::Adopt,
        Some(_) => StartAction::Wait,
        None => StartAction::Begin,
    }
}

pub fn start_must_wait(phase: Option<Phase>) -> bool {
    matches!(phase, Some(Phase::Starting | Phase::Stopping))
}

pub fn is_stopping(phase: Option<Phase>) -> bool {
    matches!(phase, Some(Phase::Stopping))
}

pub fn same_generation(slot_generation: u64, expected: u64) -> bool {
    slot_generation == expected
}

pub fn can_mark_live(phase: Phase, generation: u64, expected: u64) -> bool {
    same_generation(generation, expected) && phase == Phase::Starting
}

pub fn can_publish_handle(phase: Phase, generation: u64, expected: u64) -> bool {
    can_mark_live(phase, generation, expected)
}

pub fn still_starting(phase: Phase, generation: u64, expected: u64) -> bool {
    can_mark_live(phase, generation, expected)
}

pub fn can_abandon(phase: Phase, generation: u64, expected: u64) -> bool {
    can_mark_live(phase, generation, expected)
}

pub fn can_release(phase: Phase, generation: u64, expected: u64) -> bool {
    same_generation(generation, expected)
        && matches!(phase, Phase::Live | Phase::Starting | Phase::Stopping)
}

pub fn can_emit_stopped(phase: Phase, generation: u64, expected: u64) -> bool {
    same_generation(generation, expected) && phase == Phase::Stopping
}

pub fn is_live(phase: Option<Phase>) -> bool {
    matches!(phase, Some(Phase::Live))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_adopts_only_live() {
        assert_eq!(start_action(None), StartAction::Begin);
        assert_eq!(start_action(Some(Phase::Live)), StartAction::Adopt);
        assert_eq!(start_action(Some(Phase::Starting)), StartAction::Wait);
        assert_eq!(start_action(Some(Phase::Stopping)), StartAction::Wait);
    }

    #[test]
    fn wait_only_while_transitional() {
        assert!(!start_must_wait(None));
        assert!(!start_must_wait(Some(Phase::Live)));
        assert!(start_must_wait(Some(Phase::Starting)));
        assert!(start_must_wait(Some(Phase::Stopping)));
        assert!(is_stopping(Some(Phase::Stopping)));
        assert!(!is_stopping(Some(Phase::Starting)));
        assert!(is_live(Some(Phase::Live)));
        assert!(!is_live(Some(Phase::Starting)));
    }

    #[test]
    fn generation_guards_transitions() {
        assert!(can_mark_live(Phase::Starting, 3, 3));
        assert!(!can_mark_live(Phase::Live, 3, 3));
        assert!(!can_mark_live(Phase::Starting, 2, 3));
        assert!(can_publish_handle(Phase::Starting, 1, 1));
        assert!(still_starting(Phase::Starting, 4, 4));
        assert!(can_abandon(Phase::Starting, 1, 1));
        assert!(!can_abandon(Phase::Stopping, 1, 1));
        assert!(can_release(Phase::Live, 7, 7));
        assert!(can_release(Phase::Starting, 7, 7));
        assert!(can_release(Phase::Stopping, 7, 7));
        assert!(!can_release(Phase::Live, 7, 8));
        assert!(can_emit_stopped(Phase::Stopping, 9, 9));
        assert!(!can_emit_stopped(Phase::Live, 9, 9));
    }
}
