//! 命令库落盘：校验由 domain 完成；本层只做原子写、损坏备份与 schema 2→3 一次性迁移。

use std::fs;
use std::path::Path;

use serde::Deserialize;
use yohu_domain::{
    CommandDefinition, CommandGroup, CommandLibrary, LibraryEntry,
};
use yohu_runtime::{atomic_write, backup_corrupt};

/// 加载命令库（缺失 → 默认库；schema 2 → 迁到 3；其余不匹配 → 备份后写默认库）。
pub fn load_or_default(file: &Path) -> Result<CommandLibrary, String> {
    match fs::read_to_string(file) {
        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(value) => match value.get("schema_version").and_then(|v| v.as_u64()) {
                Some(3) => match serde_json::from_str::<CommandLibrary>(&text) {
                    Ok(lib) => Ok(lib),
                    Err(_) => restore_default(file, &text, "JSON 解析失败"),
                },
                Some(2) => migrate_v2(file, &text),
                _ => restore_default(file, &text, "schema 不受支持"),
            },
            Err(_) => restore_default(file, &text, "JSON 解析失败"),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_default(file),
        Err(e) => Err(e.to_string()),
    }
}

/// 全量原子提交。调用方先 `validate`。
pub fn save(file: &Path, library: &CommandLibrary) -> Result<(), String> {
    atomic_write(
        file,
        serde_json::to_string_pretty(library).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn restore_default(file: &Path, text: &str, reason: &str) -> Result<CommandLibrary, String> {
    tracing::warn!("命令库损坏（{reason}），备份重建");
    backup_corrupt(file, text).map_err(|e| e.to_string())?;
    write_default(file)
}

fn migrate_v2(file: &Path, text: &str) -> Result<CommandLibrary, String> {
    let v2: LibraryV2 = match serde_json::from_str(text) {
        Ok(v2) => v2,
        Err(_) => return restore_default(file, text, "schema 2 无法解析"),
    };
    let library = CommandLibrary {
        schema_version: CommandLibrary::SCHEMA_VERSION,
        groups: v2
            .groups
            .into_iter()
            .map(|g| CommandGroup {
                id: g.id,
                name: g.name,
                entries: g
                    .commands
                    .into_iter()
                    .map(|c| {
                        LibraryEntry::Command(CommandDefinition {
                            id: c.id,
                            name: c.name,
                            template: c.template,
                            params: vec![],
                        })
                    })
                    .collect(),
            })
            .collect(),
    };
    save(file, &library)?;
    tracing::info!("命令库已从 schema 2 迁到 {}", CommandLibrary::SCHEMA_VERSION);
    Ok(library)
}

fn write_default(file: &Path) -> Result<CommandLibrary, String> {
    let library = yohu_domain::default_library();
    save(file, &library)?;
    tracing::info!("已写入默认命令库: {}", file.display());
    Ok(library)
}

#[derive(Deserialize)]
struct LibraryV2 {
    groups: Vec<GroupV2>,
}

#[derive(Deserialize)]
struct GroupV2 {
    id: String,
    name: String,
    #[serde(default)]
    commands: Vec<CommandV2>,
}

#[derive(Deserialize)]
struct CommandV2 {
    id: String,
    name: String,
    template: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("yohu-lib-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("library.json")
    }

    #[test]
    fn missing_file_writes_default() {
        let file = temp_file("missing");
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, CommandLibrary::SCHEMA_VERSION);
        assert!(file.exists());
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn corrupt_json_is_backed_up() {
        let file = temp_file("corrupt");
        fs::write(&file, "{not json").unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, CommandLibrary::SCHEMA_VERSION);
        let parent = file.parent().unwrap();
        let backups: Vec<_> = fs::read_dir(parent)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("corrupt-"))
            .collect();
        assert!(!backups.is_empty());
        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn schema_2_migrates_commands_to_entries() {
        let file = temp_file("v2");
        fs::write(
            &file,
            r#"{"schema_version":2,"groups":[{"id":"g1","name":"设备信息","commands":[{"id":"c1","name":"型号","template":"shell getprop"}]}]}"#,
        )
        .unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, 3);
        assert_eq!(lib.groups[0].entries.len(), 1);
        assert_eq!(lib.command("c1").map(|c| c.template.as_str()), Some("shell getprop"));
        let saved = fs::read_to_string(&file).unwrap();
        assert!(saved.contains("\"schema_version\": 3"));
        assert!(saved.contains("\"kind\": \"command\""));
        assert!(!saved.contains("\"commands\""));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
}
