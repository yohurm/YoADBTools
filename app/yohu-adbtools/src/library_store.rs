//! 命令库落盘：采纳只走 domain `from_dto`；
//! 本层只做原子写与损坏备份。
//! 磁盘与 IPC 共用 [`CommandLibraryDto`]；只认当前 schema。

use std::fs;
use std::path::Path;

use yohu_domain::CommandLibrary;
use yohu_protocol::CommandLibraryDto;
use yohu_runtime::{atomic_write, backup_corrupt};

/// 加载命令库：缺失 → 默认库；当前 schema → `from_dto`；
/// 其它 schema_version 或解析/校验失败 → 备份后写默认库。
pub fn load_or_default(file: &Path) -> Result<CommandLibrary, String> {
    match fs::read_to_string(file) {
        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(value) => match value.get("schema_version").and_then(|v| v.as_u64()) {
                Some(version) if version == u64::from(CommandLibrary::SCHEMA_VERSION) => {
                    match serde_json::from_str::<CommandLibraryDto>(&text) {
                        Ok(dto) => adopt_or_restore(file, &text, dto),
                        Err(_) => restore_default(file, &text, "JSON 解析失败"),
                    }
                }
                _ => restore_default(file, &text, "schema 不受支持"),
            },
            Err(_) => restore_default(file, &text, "JSON 解析失败"),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_default(file),
        Err(e) => Err(e.to_string()),
    }
}

/// 全量原子提交。调用方先经 `from_dto`。
pub fn save(file: &Path, library: &CommandLibrary) -> Result<(), String> {
    let dto = library.to_dto();
    atomic_write(
        file,
        serde_json::to_string_pretty(&dto).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn adopt_or_restore(
    file: &Path,
    text: &str,
    dto: CommandLibraryDto,
) -> Result<CommandLibrary, String> {
    match CommandLibrary::from_dto(&dto) {
        Ok(lib) => Ok(lib),
        Err(_) => restore_default(file, text, "校验失败"),
    }
}

fn restore_default(file: &Path, text: &str, reason: &str) -> Result<CommandLibrary, String> {
    tracing::warn!("命令库损坏（{reason}），备份重建");
    backup_corrupt(file, text).map_err(|e| e.to_string())?;
    write_default(file)
}

fn write_default(file: &Path) -> Result<CommandLibrary, String> {
    let library = yohu_domain::default_library();
    save(file, &library)?;
    tracing::info!("已写入默认命令库: {}", file.display());
    Ok(library)
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

    fn has_corrupt_backup(parent: &Path) -> bool {
        fs::read_dir(parent)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().contains("corrupt-"))
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
    fn current_schema_adopts_from_dto() {
        let file = temp_file("current");
        let expected = yohu_domain::default_library();
        save(&file, &expected).unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib, expected);
        assert!(!has_corrupt_backup(file.parent().unwrap()));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn corrupt_json_is_backed_up() {
        let file = temp_file("corrupt");
        fs::write(&file, "{not json").unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib.schema_version, CommandLibrary::SCHEMA_VERSION);
        let parent = file.parent().unwrap();
        assert!(has_corrupt_backup(parent));
        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn schema_2_unsupported_restores_default() {
        let file = temp_file("v2");
        fs::write(
            &file,
            r#"{"schema_version":2,"groups":[{"id":"g1","name":"设备信息","commands":[{"id":"c1","name":"型号","template":"shell getprop"}]}]}"#,
        )
        .unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib, yohu_domain::default_library());
        assert!(lib.command("c1").is_none());
        assert!(has_corrupt_backup(file.parent().unwrap()));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn schema_3_invalid_restores_default() {
        let file = temp_file("v3-bad");
        fs::write(
            &file,
            r#"{"schema_version":3,"groups":[{"id":"g1","name":"g","entries":[{"kind":"command","id":"c1","name":"空","template":"  "}]}]}"#,
        )
        .unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib, yohu_domain::default_library());
        assert!(has_corrupt_backup(file.parent().unwrap()));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn schema_3_invalid_block_gap_restores_default() {
        let file = temp_file("v3-gap");
        fs::write(
            &file,
            r#"{"schema_version":3,"groups":[{"id":"g1","name":"g","entries":[{"kind":"block","id":"b1","name":"自检","gap_ms":300,"steps":[{"template":"echo 1"}]}]}]}"#,
        )
        .unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib, yohu_domain::default_library());
        assert!(has_corrupt_backup(file.parent().unwrap()));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
}
