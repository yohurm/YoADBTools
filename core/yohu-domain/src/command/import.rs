//! 命令库导入：筛路径、解析文本、对照当前库出预览，再按勾选合并。
//!
//! 不读盘。壳只按通过筛选的路径读文本。提交单位是条目 id。
//! 已在库中的条目原地覆盖，不搬组、不改序。新条目追加。

use std::collections::HashSet;
use std::path::Path;

use yohu_protocol::{
    CommandLibraryDto, ImportEntryKind, ImportEntryPreviewDto, ImportGroupPreviewDto,
    ImportPresence, ImportPreviewDto,
};

use super::{CommandGroup, CommandLibrary, LibraryEntry, LibraryError};

/// 对照 `current` 给 `incoming` 的每组、每条标 `new` / `existing`。
pub fn preview_import(current: &CommandLibrary, incoming: &CommandLibrary) -> ImportPreviewDto {
    let group_ids: HashSet<&str> = current
        .groups
        .iter()
        .map(|group| group.id.as_str())
        .collect();
    let entry_ids: HashSet<&str> = current
        .groups
        .iter()
        .flat_map(|group| group.entries.iter().map(|entry| entry.id()))
        .collect();
    ImportPreviewDto {
        groups: incoming
            .groups
            .iter()
            .map(|group| ImportGroupPreviewDto {
                id: group.id.clone(),
                name: group.name.clone(),
                presence: presence(group_ids.contains(group.id.as_str())),
                entries: group
                    .entries
                    .iter()
                    .map(|entry| ImportEntryPreviewDto {
                        id: entry.id().to_string(),
                        name: entry.name().to_string(),
                        kind: entry_kind(entry),
                        presence: presence(entry_ids.contains(entry.id())),
                    })
                    .collect(),
            })
            .collect(),
    }
}

/// 把 `incoming` 里被勾选的条目并入 `current`。
///
/// `selected` 必须是 `incoming` 的条目 id。未勾选不动。
/// 已存在的 id 原地覆盖定义；新 id 追加到已有组末尾，或在库末尾建组。
pub fn apply_import(
    current: &CommandLibrary,
    incoming: &CommandLibrary,
    selected: &HashSet<String>,
) -> Result<CommandLibrary, LibraryError> {
    let incoming_ids: HashSet<&str> = incoming
        .groups
        .iter()
        .flat_map(|group| group.entries.iter().map(|entry| entry.id()))
        .collect();
    for id in selected {
        if !incoming_ids.contains(id.as_str()) {
            return Err(LibraryError::UnknownImportEntry(id.clone()));
        }
    }

    let mut next = current.clone();
    for group in &incoming.groups {
        let mut fresh = Vec::new();
        for entry in &group.entries {
            if !selected.contains(entry.id()) {
                continue;
            }
            if let Some((group_index, entry_index)) = locate_entry(&next, entry.id()) {
                next.groups[group_index].entries[entry_index] = entry.clone();
            } else {
                fresh.push(entry.clone());
            }
        }
        if fresh.is_empty() {
            continue;
        }
        if let Some(group_index) = next.groups.iter().position(|item| item.id == group.id) {
            next.groups[group_index].entries.extend(fresh);
        } else {
            next.groups.push(CommandGroup {
                id: group.id.clone(),
                name: group.name.clone(),
                entries: fresh,
            });
        }
    }
    next.validate()?;
    Ok(next)
}

/// 读盘前的路径筛。只有这两类，不是命令库校验。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportScreen {
    Empty,
    NotJson,
}

/// 读盘前筛路径。空批次、非 JSON 整批拒绝。不读盘。
pub fn screen_import_paths(paths: &[String]) -> Result<(), ImportScreen> {
    if paths.is_empty() {
        return Err(ImportScreen::Empty);
    }
    if paths.iter().any(|path| !is_json_path(path)) {
        return Err(ImportScreen::NotJson);
    }
    Ok(())
}

fn is_json_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
}

/// 把一份导入文本收成库。缺省 `schema_version` 补成当前 schema。不读盘。
pub fn parse_import_text(text: &str) -> Result<CommandLibrary, LibraryError> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|_| LibraryError::NotALibrary)?;
    let mut obj = match value {
        serde_json::Value::Object(map) => map,
        _ => return Err(LibraryError::NotALibrary),
    };
    if obj.get("schema_version").is_none() {
        obj.insert(
            "schema_version".into(),
            serde_json::Value::from(CommandLibrary::SCHEMA_VERSION),
        );
    }
    let dto: CommandLibraryDto = serde_json::from_value(serde_json::Value::Object(obj))
        .map_err(|_| LibraryError::NotALibrary)?;
    CommandLibrary::from_dto(&dto)
}

/// 多份导入库按出现顺序拼成一份，再走库校验。同批 id 冲突整批拒绝。
pub fn combine_imports(parts: Vec<CommandLibrary>) -> Result<CommandLibrary, LibraryError> {
    let library = CommandLibrary {
        schema_version: CommandLibrary::SCHEMA_VERSION,
        groups: parts
            .into_iter()
            .flat_map(|library| library.groups)
            .collect(),
    };
    library.validate()?;
    Ok(library)
}

fn presence(existing: bool) -> ImportPresence {
    if existing {
        ImportPresence::Existing
    } else {
        ImportPresence::New
    }
}

fn entry_kind(entry: &LibraryEntry) -> ImportEntryKind {
    match entry {
        LibraryEntry::Command(_) => ImportEntryKind::Command,
        LibraryEntry::Block(_) => ImportEntryKind::Block,
    }
}

fn locate_entry(library: &CommandLibrary, id: &str) -> Option<(usize, usize)> {
    for (group_index, group) in library.groups.iter().enumerate() {
        if let Some(entry_index) = group.entries.iter().position(|entry| entry.id() == id) {
            return Some((group_index, entry_index));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command::{CommandBlock, CommandDefinition, CommandStep};

    #[test]
    fn empty_or_non_json_paths_are_rejected_before_read() {
        assert_eq!(screen_import_paths(&[]), Err(ImportScreen::Empty));
        assert_eq!(
            screen_import_paths(&["a.json".into(), "b.txt".into()]),
            Err(ImportScreen::NotJson)
        );
        assert!(screen_import_paths(&["a.json".into(), "b.JSON".into()]).is_ok());
    }

    fn command(id: &str, name: &str, template: &str) -> LibraryEntry {
        LibraryEntry::Command(CommandDefinition {
            id: id.into(),
            name: name.into(),
            template: template.into(),
            params: vec![],
        })
    }

    fn block(id: &str, name: &str, template: &str) -> LibraryEntry {
        LibraryEntry::Block(CommandBlock {
            id: id.into(),
            name: name.into(),
            gap_ms: 0,
            steps: vec![CommandStep {
                template: template.into(),
                params: vec![],
            }],
        })
    }

    fn group(id: &str, name: &str, entries: Vec<LibraryEntry>) -> CommandGroup {
        CommandGroup {
            id: id.into(),
            name: name.into(),
            entries,
        }
    }

    fn library(groups: Vec<CommandGroup>) -> CommandLibrary {
        CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups,
        }
    }

    fn ids(list: &[&str]) -> HashSet<String> {
        list.iter().map(|id| (*id).to_string()).collect()
    }

    fn entry_name(library: &CommandLibrary, id: &str) -> String {
        library
            .groups
            .iter()
            .flat_map(|group| group.entries.iter())
            .find(|entry| entry.id() == id)
            .map(|entry| entry.name().to_string())
            .unwrap()
    }

    #[test]
    fn preview_marks_existing_ids() {
        let current = library(vec![group(
            "g-old",
            "旧",
            vec![command("c1", "旧重启", "reboot")],
        )]);
        let incoming = library(vec![group(
            "g-old",
            "文件组",
            vec![
                command("c1", "新重启", "reboot"),
                block("b1", "自检", "echo 1"),
            ],
        )]);
        let preview = preview_import(&current, &incoming);
        assert_eq!(preview.groups[0].presence, ImportPresence::Existing);
        assert_eq!(
            preview.groups[0].entries[0].presence,
            ImportPresence::Existing
        );
        assert_eq!(preview.groups[0].entries[0].kind, ImportEntryKind::Command);
        assert_eq!(preview.groups[0].entries[1].presence, ImportPresence::New);
        assert_eq!(preview.groups[0].entries[1].kind, ImportEntryKind::Block);
    }

    #[test]
    fn unselected_entries_stay() {
        let current = library(vec![group(
            "g",
            "旧",
            vec![command("c1", "旧", "echo old")],
        )]);
        let incoming = library(vec![group(
            "g2",
            "新",
            vec![command("c2", "新", "echo new")],
        )]);
        let next = apply_import(&current, &incoming, &ids(&[])).unwrap();
        assert_eq!(next, current);
    }

    #[test]
    fn new_group_appends_only_selected_entries() {
        let current = library(vec![group("g", "旧", vec![command("c0", "留", "echo 0")])]);
        let incoming = library(vec![group(
            "g-nori",
            "Nori",
            vec![
                command("c1", "要", "echo 1"),
                command("c2", "不要", "echo 2"),
            ],
        )]);
        let next = apply_import(&current, &incoming, &ids(&["c1"])).unwrap();
        assert_eq!(next.groups.len(), 2);
        assert_eq!(next.groups[1].id, "g-nori");
        assert_eq!(next.groups[1].name, "Nori");
        assert_eq!(next.groups[1].entries.len(), 1);
        assert_eq!(next.groups[1].entries[0].id(), "c1");
    }

    #[test]
    fn new_entry_appends_to_existing_group() {
        let current = library(vec![group(
            "g",
            "旧名",
            vec![command("c0", "留", "echo 0")],
        )]);
        let incoming = library(vec![group(
            "g",
            "文件名",
            vec![command("c1", "新", "echo 1")],
        )]);
        let next = apply_import(&current, &incoming, &ids(&["c1"])).unwrap();
        assert_eq!(next.groups.len(), 1);
        assert_eq!(next.groups[0].name, "旧名");
        assert_eq!(
            next.groups[0]
                .entries
                .iter()
                .map(|entry| entry.id())
                .collect::<Vec<_>>(),
            vec!["c0", "c1"]
        );
    }

    #[test]
    fn existing_entry_overwrites_in_place() {
        let current = library(vec![group(
            "home",
            "主",
            vec![
                command("c1", "旧", "echo old"),
                command("c2", "邻", "echo 2"),
            ],
        )]);
        let incoming = library(vec![group(
            "file",
            "文件",
            vec![
                command("c1", "新", "echo new"),
                command("c3", "另", "echo 3"),
            ],
        )]);
        let next = apply_import(&current, &incoming, &ids(&["c1", "c3"])).unwrap();
        assert_eq!(entry_name(&next, "c1"), "新");
        assert_eq!(
            next.command("c1").map(|command| command.template.as_str()),
            Some("echo new")
        );
        assert_eq!(next.groups[0].entries[0].id(), "c1");
        assert_eq!(next.groups[0].entries[1].id(), "c2");
        assert_eq!(next.groups[1].id, "file");
        assert_eq!(next.groups[1].entries[0].id(), "c3");
    }

    #[test]
    fn block_overwrite_replaces_steps() {
        let current = library(vec![group(
            "g",
            "组",
            vec![block("b1", "旧块", "echo old")],
        )]);
        let incoming = library(vec![group(
            "g",
            "组",
            vec![block("b1", "新块", "echo new")],
        )]);
        let next = apply_import(&current, &incoming, &ids(&["b1"])).unwrap();
        assert_eq!(next.groups.len(), 1);
        assert_eq!(entry_name(&next, "b1"), "新块");
        assert_eq!(
            next.block("b1")
                .map(|block| block.steps[0].template.as_str()),
            Some("echo new")
        );
    }

    #[test]
    fn same_name_different_id_is_new() {
        let current = library(vec![group(
            "g",
            "组",
            vec![command("c1", "重启", "reboot")],
        )]);
        let incoming = library(vec![group(
            "g2",
            "另",
            vec![command("c9", "重启", "reboot")],
        )]);
        let preview = preview_import(&current, &incoming);
        assert_eq!(preview.groups[0].presence, ImportPresence::New);
        assert_eq!(preview.groups[0].entries[0].presence, ImportPresence::New);
        let next = apply_import(&current, &incoming, &ids(&["c9"])).unwrap();
        assert_eq!(next.groups.len(), 2);
    }

    #[test]
    fn all_existing_entries_do_not_create_group() {
        let current = library(vec![group(
            "home",
            "主",
            vec![command("c1", "旧", "echo old")],
        )]);
        let incoming = library(vec![group(
            "file",
            "文件",
            vec![command("c1", "新", "echo new")],
        )]);
        let next = apply_import(&current, &incoming, &ids(&["c1"])).unwrap();
        assert_eq!(next.groups.len(), 1);
        assert_eq!(next.groups[0].id, "home");
        assert_eq!(entry_name(&next, "c1"), "新");
    }

    #[test]
    fn unknown_selection_is_rejected() {
        let current = library(vec![]);
        let incoming = library(vec![group("g", "组", vec![command("c1", "一", "echo 1")])]);
        let err = apply_import(&current, &incoming, &ids(&["missing"])).unwrap_err();
        assert_eq!(err, LibraryError::UnknownImportEntry("missing".into()));
    }

    #[test]
    fn missing_schema_is_filled_before_adopt() {
        let text = r#"{"groups":[{"id":"g","name":"组","entries":[{"kind":"command","id":"c1","name":"一","template":"echo 1"}]}]}"#;
        let library = parse_import_text(text).unwrap();
        assert_eq!(library.schema_version, CommandLibrary::SCHEMA_VERSION);
        assert_eq!(library.groups[0].entries[0].id(), "c1");
    }

    #[test]
    fn other_schema_and_garbage_stay_out_of_the_library() {
        let old = parse_import_text(r#"{"schema_version":2,"groups":[]}"#).unwrap_err();
        assert!(matches!(
            old,
            LibraryError::UnsupportedSchema { actual: 2, .. }
        ));
        assert_eq!(
            parse_import_text("[]").unwrap_err(),
            LibraryError::NotALibrary
        );
    }

    #[test]
    fn combined_files_reject_a_repeated_entry_id() {
        let left = parse_import_text(
            r#"{"groups":[{"id":"g1","name":"甲","entries":[{"kind":"command","id":"c1","name":"一","template":"echo 1"}]}]}"#,
        )
        .unwrap();
        let right = parse_import_text(
            r#"{"groups":[{"id":"g2","name":"乙","entries":[{"kind":"command","id":"c1","name":"二","template":"echo 2"}]}]}"#,
        )
        .unwrap();
        let err = combine_imports(vec![left, right]).unwrap_err();
        assert!(matches!(err, LibraryError::DuplicateCommandId(_)));
    }
}
