//! 构建期封装官方 adb sidecar（ADR-v6-008）。
//!
//! - 校验仓库 `tools/` 已由 `scripts/setup-adb` 放入当前平台的官方 platform-tools；
//! - 复制到当前 profile 的 `tools/`（与开发仓库布局一致），
//!   使 `cargo tauri build --no-bundle` / `cargo run` 也能解析内置 adb。
//!
//! 安装包仍走 `tauri.conf.json` + 平台覆盖文件的 `bundle.resources`。

use std::path::{Path, PathBuf};

#[cfg(windows)]
const ADB_FILES: &[&str] = &["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"];
#[cfg(not(windows))]
const ADB_FILES: &[&str] = &["adb"];

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let tools = manifest.join("..").join("..").join("tools");
    let tools = std::fs::canonicalize(&tools).unwrap_or(tools);

    for name in ADB_FILES {
        let src = tools.join(name);
        println!("cargo:rerun-if-changed={}", src.display());
        if !src.is_file() {
            panic!(
                "缺少官方 sidecar {name}（{}）。请先运行 scripts/setup-adb.sh 或 scripts/setup-adb.ps1",
                src.display()
            );
        }
    }

    if let Some(profile_dir) = profile_output_dir() {
        let dest_dir = profile_dir.join(yohu_protocol::dir::TOOLS);
        let _ = std::fs::create_dir_all(&dest_dir);
        for name in ADB_FILES {
            let src = tools.join(name);
            let dst = dest_dir.join(name);
            if let Err(e) = std::fs::copy(&src, &dst) {
                println!(
                    "cargo:warning=复制 sidecar {name} 到 {} 失败: {e}",
                    dest_dir.display()
                );
            } else if let Err(e) = ensure_unix_executable(&dst) {
                println!("cargo:warning=设置 sidecar {name} 可执行位失败: {e}");
            }
            // 旧布局曾平铺到 exe 旁；避免和 tools/ 双份抢解析。
            let _ = std::fs::remove_file(profile_dir.join(name));
        }
    }

    tauri_build::build();

    let conf_path = manifest.join("tauri.conf.json");
    println!("cargo:rerun-if-changed={}", conf_path.display());
    assert_identity_sync(&conf_path);

    // scrcpy 版本单源校验（M5）：协议钉死 SERVER_VERSION 与 setup 脚本下载版本必须一致。
    let scripts = manifest.join("..").join("..").join("scripts");
    for setup in [
        scripts.join("setup-scrcpy-server.ps1"),
        scripts.join("setup-scrcpy-server.sh"),
    ] {
        if setup.is_file() {
            assert_scrcpy_version(&setup);
        }
    }
}

fn ensure_unix_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)?.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o111);
            std::fs::set_permissions(path, perms)?;
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// 校验 setup 脚本中的 scrcpy 版本与 `yohu_protocol::scrcpy::SERVER_VERSION` 一致。
fn assert_scrcpy_version(setup: &Path) {
    let text = std::fs::read_to_string(setup)
        .unwrap_or_else(|e| panic!("读取 {} 失败: {e}", setup.display()));
    let expected = yohu_protocol::scrcpy::SERVER_VERSION;
    let ver = text.lines().find_map(|l| {
        let l = l.trim();
        l.strip_prefix("$version = ")
            .or_else(|| l.strip_prefix("VERSION="))
            .map(|v| v.trim().trim_matches(['"', '\'']))
    });
    let Some(ver) = ver else {
        panic!("{} 未找到 version / VERSION 定义", setup.display());
    };
    if ver != expected {
        panic!(
            "scrcpy 版本不一致：{}={ver}，yohu-protocol::scrcpy::SERVER_VERSION={expected}",
            setup.display()
        );
    }
}

/// `OUT_DIR` = `target/<profile>/build/<crate>-<hash>/out` → `<profile>` 目录。
fn profile_output_dir() -> Option<PathBuf> {
    let out = PathBuf::from(std::env::var("OUT_DIR").ok()?);
    out.ancestors().nth(3).map(Path::to_path_buf)
}

fn assert_identity_sync(conf_path: &Path) {
    let conf = std::fs::read_to_string(conf_path)
        .unwrap_or_else(|e| panic!("读取 {} 失败: {e}", conf_path.display()));
    let json: serde_json::Value = serde_json::from_str(&conf)
        .unwrap_or_else(|e| panic!("解析 {} 失败: {e}", conf_path.display()));
    let version = env!("CARGO_PKG_VERSION");
    let product = json["productName"].as_str().unwrap_or("");
    let identifier = json["identifier"].as_str().unwrap_or("");
    let title = json["app"]["windows"][0]["title"].as_str().unwrap_or("");
    let conf_version = json["version"].as_str().unwrap_or("");
    if product != yohu_protocol::PRODUCT_NAME
        || identifier != yohu_protocol::IDENTIFIER
        || title != yohu_protocol::DISPLAY_NAME
        || conf_version != version
    {
        panic!(
            "tauri.conf.json 身份须与 yohu-protocol 常量及 CARGO_PKG_VERSION 一致：\
             productName={}/{}, identifier={}/{}, title={}/{}, version={}/{}",
            product,
            yohu_protocol::PRODUCT_NAME,
            identifier,
            yohu_protocol::IDENTIFIER,
            title,
            yohu_protocol::DISPLAY_NAME,
            conf_version,
            version
        );
    }
}
