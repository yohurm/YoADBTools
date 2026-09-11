//! 命令库领域模型与校验（schemaVersion 3）。
//!
//! wire 结构（DTO）在 yohu-protocol；本模块持有领域语义（校验/占位符填充）。
//! 命令组下命令与命令块同级。命令只描述一行；命令块描述多步 + 块级间隔。
//! 不配置成功/失败正则、组内延时、失败中断。

use serde::{Deserialize, Serialize};
use yohu_protocol::{
    is_allowed_block_gap, CommandDto, CommandGroupDto, CommandLibraryDto, CommandStepDto,
    LibraryEntryDto,
};

/// 一条命令。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandDefinition {
    pub id: String,
    pub name: String,
    /// 具体命令行（不含 `adb` 二进制）。可含 `{0}` `{1}` …，执行前由 [`CommandDefinition::fill`]。
    pub template: String,
}

/// 命令块里的一步（一行 ADB 正文）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandStep {
    pub template: String,
}

/// 命令块：与命令同级，顺序执行多步，步间使用块级间隔。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandBlock {
    pub id: String,
    pub name: String,
    pub gap_ms: u64,
    pub steps: Vec<CommandStep>,
}

/// 命令组下的叶子（命令或命令块）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LibraryEntry {
    Command(CommandDefinition),
    Block(CommandBlock),
}

/// 命令组（组内顺序执行全部条目；条目之间无额外间隔）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub entries: Vec<LibraryEntry>,
}

/// 命令库（`library.json` 全量结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandLibrary {
    pub schema_version: u32,
    #[serde(default)]
    pub groups: Vec<CommandGroup>,
}

/// 命令库校验/IO 错误。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LibraryError {
    #[error("命令 ID 重复: {0}")]
    DuplicateCommandId(String),
    #[error("条目名称为空 (id={0})")]
    EmptyEntryName(String),
    #[error("组 ID 重复: {0}")]
    DuplicateGroupId(String),
    #[error("命令块为空 (id={0})")]
    EmptyBlock(String),
    #[error("命令块步骤为空 (block={block_id}, index={index})")]
    EmptyStep { block_id: String, index: usize },
    #[error("命令块间隔不在可选集 (id={id}, gap_ms={gap_ms})")]
    InvalidBlockGap { id: String, gap_ms: u64 },
    #[error("填充值数量不一致 (id={id})：需要 {expected} 个，实际 {actual}")]
    FillValueMismatch {
        id: String,
        expected: usize,
        actual: usize,
    },
    #[error("命令组含需填值的条目 (group={group_id}, entry={entry_id})，请逐条执行")]
    GroupNeedsValues { group_id: String, entry_id: String },
    #[error("读取/写入失败: {0}")]
    Io(String),
}

impl CommandLibrary {
    pub const SCHEMA_VERSION: u32 = yohu_protocol::COMMAND_LIBRARY_SCHEMA_VERSION;

    pub fn empty() -> Self {
        Self {
            schema_version: Self::SCHEMA_VERSION,
            groups: Vec::new(),
        }
    }

    /// 全量校验（保存前调用；保存必须全量提交、取消零污染）。
    pub fn validate(&self) -> Result<(), LibraryError> {
        let mut group_ids = std::collections::HashSet::new();
        let mut entry_ids = std::collections::HashSet::new();
        for g in &self.groups {
            if !group_ids.insert(g.id.as_str()) {
                return Err(LibraryError::DuplicateGroupId(g.id.clone()));
            }
            for entry in &g.entries {
                if entry.name().trim().is_empty() {
                    return Err(LibraryError::EmptyEntryName(entry.id().to_string()));
                }
                if !entry_ids.insert(entry.id()) {
                    return Err(LibraryError::DuplicateCommandId(entry.id().to_string()));
                }
                if let LibraryEntry::Block(block) = entry {
                    block.validate()?;
                }
            }
        }
        Ok(())
    }

    pub fn group(&self, id: &str) -> Option<&CommandGroup> {
        self.groups.iter().find(|g| g.id == id)
    }

    pub fn command(&self, id: &str) -> Option<&CommandDefinition> {
        self.groups
            .iter()
            .flat_map(|g| g.entries.iter())
            .find_map(|e| e.as_command().filter(|c| c.id == id))
    }

    pub fn block(&self, id: &str) -> Option<&CommandBlock> {
        self.groups
            .iter()
            .flat_map(|g| g.entries.iter())
            .find_map(|e| e.as_block().filter(|b| b.id == id))
    }

    pub fn from_dto(dto: &CommandLibraryDto) -> Self {
        Self {
            schema_version: dto.schema_version,
            groups: dto.groups.iter().map(group_from_dto).collect(),
        }
    }

    pub fn to_dto(&self) -> CommandLibraryDto {
        CommandLibraryDto {
            schema_version: self.schema_version,
            groups: self.groups.iter().map(group_to_dto).collect(),
        }
    }
}

impl CommandGroup {
    pub fn first_entry_needing_values(&self) -> Option<&LibraryEntry> {
        self.entries.iter().find(|e| e.needs_values())
    }
}

impl LibraryEntry {
    pub fn id(&self) -> &str {
        match self {
            Self::Command(c) => &c.id,
            Self::Block(b) => &b.id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Self::Command(c) => &c.name,
            Self::Block(b) => &b.name,
        }
    }

    pub fn needs_values(&self) -> bool {
        match self {
            Self::Command(c) => c.needs_values(),
            Self::Block(b) => b.needs_values(),
        }
    }

    pub fn as_command(&self) -> Option<&CommandDefinition> {
        match self {
            Self::Command(c) => Some(c),
            Self::Block(_) => None,
        }
    }

    pub fn as_block(&self) -> Option<&CommandBlock> {
        match self {
            Self::Block(b) => Some(b),
            Self::Command(_) => None,
        }
    }
}

impl CommandBlock {
    pub fn validate(&self) -> Result<(), LibraryError> {
        if self.steps.is_empty() {
            return Err(LibraryError::EmptyBlock(self.id.clone()));
        }
        if !is_allowed_block_gap(self.gap_ms) {
            return Err(LibraryError::InvalidBlockGap {
                id: self.id.clone(),
                gap_ms: self.gap_ms,
            });
        }
        for (index, step) in self.steps.iter().enumerate() {
            if step.template.trim().is_empty() {
                return Err(LibraryError::EmptyStep {
                    block_id: self.id.clone(),
                    index,
                });
            }
        }
        Ok(())
    }

    pub fn placeholder_arity(&self) -> usize {
        self.steps
            .iter()
            .map(|s| placeholder_arity(&s.template))
            .max()
            .unwrap_or(0)
    }

    pub fn needs_values(&self) -> bool {
        self.placeholder_arity() > 0
    }

    pub fn fill(&self, values: &[String]) -> Result<Self, LibraryError> {
        let expected = self.placeholder_arity();
        if values.len() != expected {
            return Err(LibraryError::FillValueMismatch {
                id: self.id.clone(),
                expected,
                actual: values.len(),
            });
        }
        Ok(Self {
            steps: self
                .steps
                .iter()
                .map(|s| CommandStep {
                    template: apply_values(&s.template, values),
                })
                .collect(),
            ..self.clone()
        })
    }
}

impl CommandDefinition {
    pub fn from_dto(c: &CommandDto) -> Self {
        command_from_dto(c)
    }

    pub fn to_dto(&self) -> CommandDto {
        command_to_dto(self)
    }

    pub fn placeholder_arity(&self) -> usize {
        placeholder_arity(&self.template)
    }

    pub fn needs_values(&self) -> bool {
        self.placeholder_arity() > 0
    }

    /// 按序替换 `{0}` `{1}` …。值个数必须等于占位符元数。
    ///
    /// 单趟扫描替换：从原模板逐个识别 `{n}`，插入的值**不再被重扫**。
    /// 因此若值本身含 `{1}` 等占位符样文本，会被当作字面量保留。
    pub fn fill(&self, values: &[String]) -> Result<Self, LibraryError> {
        let expected = self.placeholder_arity();
        if values.len() != expected {
            return Err(LibraryError::FillValueMismatch {
                id: self.id.clone(),
                expected,
                actual: values.len(),
            });
        }
        Ok(Self {
            template: apply_values(&self.template, values),
            ..self.clone()
        })
    }
}

/// 扫描 `{n}`，返回最大索引 + 1。
pub fn placeholder_arity(template: &str) -> usize {
    let mut max_index: Option<usize> = None;
    let mut rest = template;
    while let Some(pos) = rest.find('{') {
        let after = &rest[pos + 1..];
        let Some(end) = after.find('}') else { break };
        if let Ok(n) = after[..end].parse::<usize>() {
            max_index = Some(max_index.map_or(n, |m: usize| m.max(n)));
        }
        rest = &after[end + 1..];
    }
    max_index.map_or(0, |m| m + 1)
}

fn apply_values(template: &str, values: &[String]) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    loop {
        let Some(pos) = rest.find('{') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        if let Some(end) = after.find('}') {
            if let Ok(n) = after[..end].parse::<usize>() {
                if let Some(value) = values.get(n) {
                    out.push_str(value);
                    rest = &after[end + 1..];
                    continue;
                }
            }
        }
        out.push('{');
        rest = after;
    }
    out
}

fn group_from_dto(g: &CommandGroupDto) -> CommandGroup {
    CommandGroup {
        id: g.id.clone(),
        name: g.name.clone(),
        entries: g.entries.iter().map(entry_from_dto).collect(),
    }
}

fn group_to_dto(g: &CommandGroup) -> CommandGroupDto {
    CommandGroupDto {
        id: g.id.clone(),
        name: g.name.clone(),
        entries: g.entries.iter().map(entry_to_dto).collect(),
    }
}

fn entry_from_dto(entry: &LibraryEntryDto) -> LibraryEntry {
    match entry {
        LibraryEntryDto::Command { id, name, template } => LibraryEntry::Command(CommandDefinition {
            id: id.clone(),
            name: name.clone(),
            template: template.clone(),
        }),
        LibraryEntryDto::Block {
            id,
            name,
            gap_ms,
            steps,
        } => LibraryEntry::Block(CommandBlock {
            id: id.clone(),
            name: name.clone(),
            gap_ms: *gap_ms,
            steps: steps
                .iter()
                .map(|s| CommandStep {
                    template: s.template.clone(),
                })
                .collect(),
        }),
    }
}

fn entry_to_dto(entry: &LibraryEntry) -> LibraryEntryDto {
    match entry {
        LibraryEntry::Command(c) => LibraryEntryDto::Command {
            id: c.id.clone(),
            name: c.name.clone(),
            template: c.template.clone(),
        },
        LibraryEntry::Block(b) => LibraryEntryDto::Block {
            id: b.id.clone(),
            name: b.name.clone(),
            gap_ms: b.gap_ms,
            steps: b
                .steps
                .iter()
                .map(|s| CommandStepDto {
                    template: s.template.clone(),
                })
                .collect(),
        },
    }
}

fn command_from_dto(c: &CommandDto) -> CommandDefinition {
    CommandDefinition {
        id: c.id.clone(),
        name: c.name.clone(),
        template: c.template.clone(),
    }
}

fn command_to_dto(c: &CommandDefinition) -> CommandDto {
    CommandDto {
        id: c.id.clone(),
        name: c.name.clone(),
        template: c.template.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cmd(id: &str, name: &str, template: &str) -> CommandDefinition {
        CommandDefinition {
            id: id.into(),
            name: name.into(),
            template: template.into(),
        }
    }

    fn block(id: &str, gap_ms: u64, templates: &[&str]) -> CommandBlock {
        CommandBlock {
            id: id.into(),
            name: format!("块{id}"),
            gap_ms,
            steps: templates
                .iter()
                .map(|t| CommandStep {
                    template: (*t).into(),
                })
                .collect(),
        }
    }

    fn group(id: &str, entries: Vec<LibraryEntry>) -> CommandGroup {
        CommandGroup {
            id: id.into(),
            name: format!("组{id}"),
            entries,
        }
    }

    #[test]
    fn empty_library_valid() {
        assert!(CommandLibrary::empty().validate().is_ok());
    }

    #[test]
    fn duplicate_ids_rejected_across_commands_and_blocks() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![
                group("g1", vec![LibraryEntry::Command(cmd("c1", "a", "echo 1"))]),
                group("g1", vec![LibraryEntry::Command(cmd("c2", "b", "echo 2"))]),
            ],
        };
        assert!(matches!(
            lib.validate(),
            Err(LibraryError::DuplicateGroupId(_))
        ));

        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group(
                "g1",
                vec![
                    LibraryEntry::Command(cmd("x1", "a", "echo 1")),
                    LibraryEntry::Block(block("x1", 0, &["echo 2"])),
                ],
            )],
        };
        assert!(matches!(
            lib.validate(),
            Err(LibraryError::DuplicateCommandId(_))
        ));
    }

    #[test]
    fn block_validation_rejects_empty_and_illegal_gap() {
        assert!(matches!(
            block("b1", 0, &[]).validate(),
            Err(LibraryError::EmptyBlock(_))
        ));
        assert!(matches!(
            block("b1", 300, &["echo 1"]).validate(),
            Err(LibraryError::InvalidBlockGap { gap_ms: 300, .. })
        ));
        assert!(matches!(
            block("b1", 0, &["  "]).validate(),
            Err(LibraryError::EmptyStep { index: 0, .. })
        ));
        assert!(block("b1", 1000, &["echo 1", "echo 2"]).validate().is_ok());
    }

    #[test]
    fn dto_roundtrip_mixed_entries() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group(
                "g1",
                vec![
                    LibraryEntry::Command(CommandDefinition {
                        id: "c1".into(),
                        name: "版本".into(),
                        template: "shell getprop ro.build.version.release".into(),
                    }),
                    LibraryEntry::Block(block("b1", 500, &["echo a", "echo b"])),
                ],
            )],
        };
        let dto = lib.to_dto();
        let back = CommandLibrary::from_dto(&dto);
        assert_eq!(back, lib);
    }

    #[test]
    fn fill_and_arity_match_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            template: String,
            values: Vec<String>,
            arity: usize,
            #[serde(default)]
            filled: Option<String>,
            #[serde(default)]
            error: Option<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../../testdata/command_fill.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            let c = cmd("c", "n", &case.template);
            assert_eq!(placeholder_arity(&case.template), case.arity, "arity case {i}");
            if case.error.as_deref() == Some("arity") {
                assert!(
                    matches!(
                        c.fill(&case.values),
                        Err(LibraryError::FillValueMismatch { .. })
                    ),
                    "error case {i}"
                );
                continue;
            }
            assert_eq!(
                c.fill(&case.values).unwrap().template,
                case.filled.as_deref().expect("filled"),
                "fill case {i}"
            );
        }
    }

    #[test]
    fn block_fill_uses_max_arity_across_steps() {
        let b = block("b1", 0, &["ping {0}", "getprop {1}"]);
        assert_eq!(b.placeholder_arity(), 2);
        let filled = b.fill(&["8.8.8.8".into(), "ro.product.model".into()]).unwrap();
        assert_eq!(filled.steps[0].template, "ping 8.8.8.8");
        assert_eq!(filled.steps[1].template, "getprop ro.product.model");
    }

    #[test]
    fn command_lookup_crosses_groups() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group(
                "g1",
                vec![LibraryEntry::Command(cmd("c9", "a", "echo 1"))],
            )],
        };
        assert_eq!(lib.command("c9").map(|c| c.name.as_str()), Some("a"));
        assert!(lib.command("missing").is_none());
        assert!(lib.block("c9").is_none());
    }

    #[test]
    fn group_with_inputs_cannot_run_as_whole() {
        let g = group(
            "g1",
            vec![LibraryEntry::Command(cmd("c1", "ping", "ping {0}"))],
        );
        assert_eq!(
            g.first_entry_needing_values().map(|e| e.id()),
            Some("c1")
        );
        assert!(group(
            "g2",
            vec![LibraryEntry::Command(cmd("c2", "a", "echo 1"))]
        )
        .first_entry_needing_values()
        .is_none());
    }

    #[test]
    fn legacy_group_tags_are_ignored_on_disk() {
        let lib: CommandLibrary = serde_json::from_str(
            r#"{"schema_version":3,"groups":[{"id":"g1","name":"设备信息","tags":["产线"],"entries":[]}]}"#,
        )
        .unwrap();
        assert_eq!(lib.groups[0].name, "设备信息");
        let json = serde_json::to_value(&lib).unwrap();
        assert!(json["groups"][0].get("tags").is_none());
    }
}
