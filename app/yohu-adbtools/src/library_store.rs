//! 命令库落盘：采纳只走 domain `from_dto`；导入文本的解析与合并也在 domain。
//! 本层只读路径、做原子写和损坏备份，以及把内存库写入。
//! 磁盘与 IPC 共用 [`CommandLibraryDto`]；只认当前 schema。

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::state::AppState;
use yohu_domain::{
    apply_import, combine_imports, parse_import_text, preview_import, screen_import_paths,
    CommandLibrary, ImportScreen, LibraryError,
};
use yohu_protocol::{CommandLibraryDto, ImportPreviewDto};
use yohu_runtime::{atomic_write, backup_corrupt};

#[derive(Debug, thiserror::Error)]
pub enum LibraryStoreError {
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error("命令库读写失败")]
    Io,
    /// 没有路径。不改产品库。句子是 [`LibraryError::EmptyImportPaths`]。
    #[error("{}", LibraryError::EmptyImportPaths)]
    EmptyPaths,
    /// 扩展名不是 JSON。不改产品库。句子是 [`LibraryError::ImportPathsNotJson`]。
    #[error("{}", LibraryError::ImportPathsNotJson)]
    NotJson,
    /// 正文不是命令库。不改产品库。句子是 [`LibraryError::NotALibrary`]。
    #[error("{}", LibraryError::NotALibrary)]
    NotALibrary,
}

pub(crate) fn lock_library(
    state: &AppState,
) -> std::sync::MutexGuard<'_, yohu_domain::CommandLibrary> {
    state.library.lock().expect("library lock poisoned")
}

/// 加载命令库并写入内存：缺失 → 默认库；当前 schema → `from_dto`；
/// 其它 schema_version 或解析/校验失败 → 备份后写默认库。
pub fn load(state: &AppState) -> Result<CommandLibraryDto, LibraryStoreError> {
    let library = load_or_default(&state.paths.library_file())?;
    *lock_library(state) = library.clone();
    Ok(library.to_dto())
}

/// `from_dto` 后全量原子提交，并写入内存库。取消零污染由 UI 深拷贝保证。
pub fn save(state: &AppState, dto: CommandLibraryDto) -> Result<(), LibraryStoreError> {
    let library = CommandLibrary::from_dto(&dto)?;
    persist(&state.paths.library_file(), &library)?;
    *lock_library(state) = library;
    Ok(())
}

/// 读拖入文件并对照内存库出预览。不写盘。
pub fn preview(state: &AppState, paths: &[String]) -> Result<ImportPreviewDto, LibraryStoreError> {
    let current = lock_library(state).clone();
    let incoming = read_import_paths(paths)?;
    Ok(preview_import(&current, &incoming))
}

/// 重读同一批文件，按条目 id 合并后原子写入内存库。
pub fn apply(
    state: &AppState,
    paths: &[String],
    entry_ids: &[String],
) -> Result<CommandLibraryDto, LibraryStoreError> {
    let current = lock_library(state).clone();
    let next = merge_import(&current, paths, entry_ids)?;
    persist(&state.paths.library_file(), &next)?;
    *lock_library(state) = next.clone();
    Ok(next.to_dto())
}

fn load_or_default(file: &Path) -> Result<CommandLibrary, LibraryStoreError> {
    match fs::read_to_string(file) {
        Ok(text) => match serde_json::from_str::<CommandLibraryDto>(&text) {
            Ok(dto) => match CommandLibrary::from_dto(&dto) {
                Ok(library) => Ok(library),
                Err(_) => restore_default(file, &text, "校验失败"),
            },
            Err(_) => restore_default(file, &text, "JSON 解析失败"),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_default(file),
        Err(e) => Err(io_failed("读取命令库失败", e)),
    }
}

fn persist(file: &Path, library: &CommandLibrary) -> Result<(), LibraryStoreError> {
    let dto = library.to_dto();
    let text = serde_json::to_string_pretty(&dto).map_err(|e| io_failed("序列化命令库失败", e))?;
    atomic_write(file, text).map_err(|e| io_failed("写入命令库失败", e))
}

fn restore_default(
    file: &Path,
    text: &str,
    reason: &str,
) -> Result<CommandLibrary, LibraryStoreError> {
    tracing::warn!("命令库损坏（{reason}），备份重建");
    backup_corrupt(file, text).map_err(|e| io_failed("备份损坏命令库失败", e))?;
    write_default(file)
}

fn write_default(file: &Path) -> Result<CommandLibrary, LibraryStoreError> {
    let library = yohu_domain::default_library();
    persist(file, &library)?;
    tracing::info!("已写入默认命令库: {}", file.display());
    Ok(library)
}

fn read_import_paths(paths: &[String]) -> Result<CommandLibrary, LibraryStoreError> {
    if let Err(err) = screen_import_paths(paths) {
        return Err(screen_error(err));
    }
    let mut parts = Vec::with_capacity(paths.len());
    for path in paths {
        let text = fs::read_to_string(path).map_err(|err| io_failed("读取导入文件失败", err))?;
        parts.push(accept_import_text(&text)?);
    }
    combine_imports(parts).map_err(LibraryStoreError::Library)
}

fn io_failed(context: &str, err: impl std::fmt::Display) -> LibraryStoreError {
    tracing::warn!(error = %err, "{context}");
    LibraryStoreError::Io
}

fn screen_error(err: ImportScreen) -> LibraryStoreError {
    match err {
        ImportScreen::Empty => LibraryStoreError::EmptyPaths,
        ImportScreen::NotJson => LibraryStoreError::NotJson,
    }
}

fn accept_import_text(text: &str) -> Result<CommandLibrary, LibraryStoreError> {
    match parse_import_text(text) {
        Ok(library) => Ok(library),
        Err(LibraryError::NotALibrary) => Err(LibraryStoreError::NotALibrary),
        Err(other) => Err(other.into()),
    }
}

fn merge_import(
    current: &CommandLibrary,
    paths: &[String],
    entry_ids: &[String],
) -> Result<CommandLibrary, LibraryStoreError> {
    let incoming = read_import_paths(paths)?;
    let selected: HashSet<String> = entry_ids.iter().cloned().collect();
    apply_import(current, &incoming, &selected).map_err(LibraryStoreError::Library)
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
        persist(&file, &expected).unwrap();
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

    #[test]
    fn missing_schema_on_disk_restores_default() {
        let file = temp_file("no-schema");
        fs::write(
            &file,
            r#"{"groups":[{"id":"g1","name":"外来","entries":[{"kind":"command","id":"c1","name":"重启","template":"reboot"}]}]}"#,
        )
        .unwrap();
        let lib = load_or_default(&file).unwrap();
        assert_eq!(lib, yohu_domain::default_library());
        assert!(lib.command("c1").is_none());
        assert!(has_corrupt_backup(file.parent().unwrap()));
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn import_without_schema_previews_and_apply_writes_schema_3() {
        let dir = temp_file("import-ok").parent().unwrap().to_path_buf();
        let drop = dir.join("Nori_CommandLibrary.json");
        fs::write(
            &drop,
            r#"{"groups":[{"id":"g-nori","name":"Nori","entries":[{"kind":"command","id":"c-nori","name":"重启","template":"reboot"}]}]}"#,
        )
        .unwrap();
        let current = CommandLibrary::empty();
        let paths = vec![drop.to_string_lossy().into_owned()];
        let preview = read_import_paths(&paths).unwrap();
        let marked = preview_import(&current, &preview);
        assert_eq!(
            marked.groups[0].presence,
            yohu_protocol::ImportPresence::New
        );
        let product = dir.join("library.json");
        let next = merge_import(&current, &paths, &["c-nori".into()]).unwrap();
        persist(&product, &next).unwrap();
        let saved = fs::read_to_string(&product).unwrap();
        assert!(saved.contains("\"schema_version\": 3"));
        assert!(saved.contains("c-nori"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_rejects_other_schema_without_touching_product() {
        let dir = temp_file("import-v2").parent().unwrap().to_path_buf();
        let drop = dir.join("old.json");
        fs::write(&drop, r#"{"schema_version":2,"groups":[]}"#).unwrap();
        let err = read_import_paths(&[drop.to_string_lossy().into_owned()]).unwrap_err();
        assert!(matches!(
            err,
            LibraryStoreError::Library(LibraryError::UnsupportedSchema { actual: 2, .. })
        ));
        assert!(!dir.join("library.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_reject_display_is_the_domain_sentence() {
        assert_eq!(
            LibraryStoreError::EmptyPaths.to_string(),
            LibraryError::EmptyImportPaths.to_string()
        );
        assert_eq!(
            LibraryStoreError::NotJson.to_string(),
            LibraryError::ImportPathsNotJson.to_string()
        );
        assert_eq!(
            LibraryStoreError::NotALibrary.to_string(),
            LibraryError::NotALibrary.to_string()
        );
    }

    #[test]
    fn import_rejects_non_json_and_cross_file_id() {
        let dir = temp_file("import-bad").parent().unwrap().to_path_buf();
        let text = dir.join("notes.txt");
        fs::write(&text, "hello").unwrap();
        let err = read_import_paths(&[text.to_string_lossy().into_owned()]).unwrap_err();
        assert!(matches!(err, LibraryStoreError::NotJson));

        let body = r#"{"groups":[{"id":"g","name":"组","entries":[{"kind":"command","id":"c1","name":"一","template":"echo 1"}]}]}"#;
        let a = dir.join("a.json");
        let b = dir.join("b.json");
        fs::write(&a, body).unwrap();
        fs::write(&b, body).unwrap();
        let err = read_import_paths(&[
            a.to_string_lossy().into_owned(),
            b.to_string_lossy().into_owned(),
        ])
        .unwrap_err();
        assert!(matches!(
            err,
            LibraryStoreError::Library(LibraryError::DuplicateCommandId(_))
                | LibraryStoreError::Library(LibraryError::DuplicateGroupId(_))
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_unknown_id_does_not_change_library() {
        let dir = temp_file("import-unknown").parent().unwrap().to_path_buf();
        let drop = dir.join("lib.json");
        fs::write(
            &drop,
            r#"{"groups":[{"id":"g","name":"组","entries":[{"kind":"command","id":"c1","name":"一","template":"echo 1"}]}]}"#,
        )
        .unwrap();
        let current = CommandLibrary::empty();
        let err = merge_import(
            &current,
            &[drop.to_string_lossy().into_owned()],
            &["nope".into()],
        )
        .unwrap_err();
        assert!(matches!(
            err,
            LibraryStoreError::Library(LibraryError::UnknownImportEntry(_))
        ));
        let _ = fs::remove_dir_all(&dir);
    }
}
