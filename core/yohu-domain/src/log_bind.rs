//! 包名会话 PID 重绑 + 会话过滤 → wire [`LogFilter`]。
//! UI `@yohu/api` 镜像本层 + [`testdata/log_bind.json`]。

use yohu_protocol::{LogFilter, LogScope, ProcessEntry};

use crate::log_filter::{normalize_log_levels, tag_filter_active};

/// 历史 PID 集上限（产品常量）。
pub const HISTORY_PID_CAP: usize = 8;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PidBinding {
    pub current: Vec<u32>,
    pub history: Vec<u32>,
}

/// 会话作用域（包名会话的 pids 来自 [`pid_set_of`]，不在此枚举里）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterScopeInput {
    All,
    Pid(u32),
    Package,
}

pub fn rebind_pids(
    prev: &PidBinding,
    index: &[ProcessEntry],
    pkg: &str,
    include_child: bool,
    history_cap: usize,
) -> PidBinding {
    let current: Vec<u32> = index
        .iter()
        .filter(|entry| {
            if include_child {
                entry.name == pkg || entry.name.starts_with(&format!("{pkg}:"))
            } else {
                entry.name == pkg
            }
        })
        .map(|entry| entry.pid)
        .collect();
    let mut history = prev.history.clone();
    for pid in &current {
        if !history.contains(pid) {
            history.push(*pid);
        }
    }
    if history.len() > history_cap {
        history = history[history.len() - history_cap..].to_vec();
    }
    PidBinding { current, history }
}

/// 当前在前、历史在后，去重保序。
pub fn pid_set_of(binding: &PidBinding) -> Vec<u32> {
    let mut out = Vec::with_capacity(binding.current.len() + binding.history.len());
    for pid in binding.current.iter().chain(binding.history.iter()) {
        if !out.contains(pid) {
            out.push(*pid);
        }
    }
    out
}

pub fn to_wire_filter<S: AsRef<str>>(
    levels: &[S],
    tag_contains: &str,
    keyword: &str,
    scope: FilterScopeInput,
    pid_set: &[u32],
) -> LogFilter {
    let levels = normalize_log_levels(levels.iter().map(AsRef::as_ref));
    let tag_contains = tag_filter_active(tag_contains).then(|| tag_contains.to_string());
    let message_contains = if keyword.is_empty() {
        None
    } else {
        Some(keyword.to_string())
    };
    let scope = match scope {
        FilterScopeInput::All => LogScope::All,
        FilterScopeInput::Pid(pid) => LogScope::Pid { pid },
        FilterScopeInput::Package => LogScope::Package {
            pids: pid_set.to_vec(),
        },
    };
    LogFilter {
        levels,
        tag_contains,
        message_contains,
        scope,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct BindingDto {
        current: Vec<u32>,
        history: Vec<u32>,
    }

    #[derive(Deserialize)]
    struct RebindCase {
        prev: BindingDto,
        index: Vec<ProcessEntry>,
        pkg: String,
        include_child: bool,
        current: Vec<u32>,
        history: Vec<u32>,
        pid_set: Vec<u32>,
    }

    #[derive(Deserialize)]
    struct HistoryCap {
        cap: usize,
        pids: Vec<u32>,
        pkg: String,
        pid_set_len: usize,
        current0: u32,
    }

    #[derive(Deserialize)]
    #[serde(tag = "kind", rename_all = "camelCase")]
    enum ScopeDto {
        All,
        Pid { pid: u32 },
        Package,
    }

    #[derive(Deserialize)]
    struct WireCase {
        levels: Vec<String>,
        tag_contains: String,
        keyword: String,
        scope: ScopeDto,
        pid_set: Vec<u32>,
        #[serde(default)]
        expect: Option<serde_json::Value>,
        #[serde(default)]
        omit_tag: bool,
        #[serde(default)]
        expect_tag: Option<String>,
        #[serde(default)]
        expect_message: Option<String>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        rebind: Vec<RebindCase>,
        history_cap: HistoryCap,
        wire: Vec<WireCase>,
    }

    fn fixture() -> Fixture {
        serde_json::from_str(include_str!("../testdata/log_bind.json")).expect("log_bind")
    }

    fn scope_of(scope: &ScopeDto) -> FilterScopeInput {
        match scope {
            ScopeDto::All => FilterScopeInput::All,
            ScopeDto::Pid { pid } => FilterScopeInput::Pid(*pid),
            ScopeDto::Package => FilterScopeInput::Package,
        }
    }

    #[test]
    fn rebind_shared_fixture() {
        for (i, case) in fixture().rebind.iter().enumerate() {
            let got = rebind_pids(
                &PidBinding {
                    current: case.prev.current.clone(),
                    history: case.prev.history.clone(),
                },
                &case.index,
                &case.pkg,
                case.include_child,
                HISTORY_PID_CAP,
            );
            assert_eq!(got.current, case.current, "current {i}");
            assert_eq!(got.history, case.history, "history {i}");
            assert_eq!(pid_set_of(&got), case.pid_set, "pid_set {i}");
        }
    }

    #[test]
    fn history_cap_shared_fixture() {
        let case = fixture().history_cap;
        let mut binding = PidBinding::default();
        for pid in case.pids {
            binding = rebind_pids(
                &binding,
                &[ProcessEntry {
                    pid,
                    name: case.pkg.clone(),
                }],
                &case.pkg,
                false,
                case.cap,
            );
        }
        let set = pid_set_of(&binding);
        assert_eq!(set.len(), case.pid_set_len);
        assert_eq!(set[0], case.current0);
    }

    #[test]
    fn wire_shared_fixture() {
        for (i, case) in fixture().wire.iter().enumerate() {
            let got = to_wire_filter(
                &case.levels,
                &case.tag_contains,
                &case.keyword,
                scope_of(&case.scope),
                &case.pid_set,
            );
            if let Some(expect) = &case.expect {
                let actual = serde_json::to_value(&got).expect("json");
                if let Some(obj) = expect.as_object() {
                    for (key, value) in obj {
                        assert_eq!(&actual[key], value, "wire {i} {key}");
                    }
                }
            }
            if case.omit_tag {
                assert!(got.tag_contains.is_none(), "omit tag {i}");
            }
            if let Some(tag) = &case.expect_tag {
                assert_eq!(got.tag_contains.as_deref(), Some(tag.as_str()), "tag {i}");
            }
            if let Some(msg) = &case.expect_message {
                assert_eq!(
                    got.message_contains.as_deref(),
                    Some(msg.as_str()),
                    "msg {i}"
                );
            }
        }
    }
}
