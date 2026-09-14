//! 命令库 wire 结构（schemaVersion 3）。磁盘与 IPC 共用本 DTO。

use serde::{Deserialize, Serialize};

/// 命令库 schema（domain `CommandLibrary::SCHEMA_VERSION` 与 UI 常量共用）。
pub const COMMAND_LIBRARY_SCHEMA_VERSION: u32 = 3;

/// 命令块可选间隔（毫秒）。组下条目之间仍为 0；间隔只发生在块的步与步之间。
pub const COMMAND_BLOCK_GAPS_MS: &[u64] = &[0, 200, 500, 1000, 2000, 5000];

/// 占位符 `{n}` 的说明。缺席或空串 = 填参时只显示 `{n}`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandParamDto {
    pub index: usize,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandDto {
    pub id: String,
    pub name: String,
    /// 具体命令行，可含 `{0}` `{1}`；执行前由 domain `fill`，不信任 UI 改写后的行
    pub template: String,
    /// `{n}` 的说明；缺省空。空项不落盘。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub params: Vec<CommandParamDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandStepDto {
    pub template: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandBlockDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub gap_ms: u64,
    pub steps: Vec<CommandStepDto>,
    /// 全步共享的 `{n}` 说明；缺省空。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub params: Vec<CommandParamDto>,
}

/// 命令组下的同级叶子：单条命令或命令块。
///
/// 变体内嵌现成 DTO；`tag = "kind"` 把字段与 `kind` 同级展开，磁盘形态不变。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LibraryEntryDto {
    Command(CommandDto),
    Block(CommandBlockDto),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandGroupDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub entries: Vec<LibraryEntryDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandLibraryDto {
    pub schema_version: u32,
    #[serde(default)]
    pub groups: Vec<CommandGroupDto>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_and_block_gap_constants() {
        assert_eq!(COMMAND_LIBRARY_SCHEMA_VERSION, 3);
        assert_eq!(COMMAND_BLOCK_GAPS_MS, &[0, 200, 500, 1000, 2000, 5000]);
    }

    #[test]
    fn command_dto_is_id_name_template() {
        let parsed: CommandDto =
            serde_json::from_str(r#"{"id":"c1","name":"型号","template":"shell getprop"}"#)
                .unwrap();
        assert_eq!(parsed.template, "shell getprop");
        let with_params: CommandDto = serde_json::from_str(
            r#"{"id":"c1","name":"ping","template":"ping {0}","params":[{"index":0,"description":"主机"}]}"#,
        )
        .unwrap();
        assert_eq!(with_params.params[0].description, "主机");
    }

    #[test]
    fn library_entry_dto_tagged_command_and_block() {
        let command: LibraryEntryDto = serde_json::from_str(
            r#"{"kind":"command","id":"c1","name":"型号","template":"shell getprop"}"#,
        )
        .unwrap();
        assert!(matches!(
            command,
            LibraryEntryDto::Command(CommandDto { ref id, .. }) if id == "c1"
        ));
        let block: LibraryEntryDto = serde_json::from_str(
            r#"{"kind":"block","id":"b1","name":"自检","gap_ms":1000,"steps":[{"template":"shell echo 1"}]}"#,
        )
        .unwrap();
        match block {
            LibraryEntryDto::Block(CommandBlockDto { gap_ms, steps, .. }) => {
                assert_eq!(gap_ms, 1000);
                assert_eq!(steps[0].template, "shell echo 1");
            }
            LibraryEntryDto::Command(_) => panic!("expected block"),
        }
    }

    #[test]
    fn library_entry_embeds_dto_fields_beside_kind() {
        let command = LibraryEntryDto::Command(CommandDto {
            id: "c1".into(),
            name: "型号".into(),
            template: "shell getprop".into(),
            params: vec![],
        });
        let json = serde_json::to_value(&command).unwrap();
        assert_eq!(json["kind"], "command");
        assert_eq!(json["id"], "c1");
        assert_eq!(json["template"], "shell getprop");
        assert!(json.get("Command").is_none());

        let block = LibraryEntryDto::Block(CommandBlockDto {
            id: "b1".into(),
            name: "自检".into(),
            gap_ms: 1000,
            steps: vec![CommandStepDto {
                template: "shell echo 1".into(),
            }],
            params: vec![],
        });
        let json = serde_json::to_value(&block).unwrap();
        assert_eq!(json["kind"], "block");
        assert_eq!(json["gap_ms"], 1000);
        assert_eq!(json["steps"][0]["template"], "shell echo 1");
        assert!(json.get("Block").is_none());
    }
}
