//! 本机平台信息：检查更新时交给 Provider（版本比较 / 安装包筛选）。

use yohu_protocol::{AppIdentity, PRODUCT_NAME};

/// 检查与下载共用的 User-Agent：`{PRODUCT_NAME}/{version}`。
pub fn user_agent(version: &str) -> String {
    format!("{PRODUCT_NAME}/{version}")
}

/// 产品交付的 CPU。`x86_64` 与 `amd64` 同一事实，`aarch64` 与 `arm64` 同一事实。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CpuArch {
    X64,
    Arm64,
}

/// 产品交付的操作系统。`macos` 与 `darwin` 同一事实。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostOs {
    Windows,
    Macos,
}

pub fn cpu_arch(arch: &str) -> Option<CpuArch> {
    match arch.trim().to_ascii_lowercase().as_str() {
        "x86_64" | "amd64" => Some(CpuArch::X64),
        "aarch64" | "arm64" => Some(CpuArch::Arm64),
        _ => None,
    }
}

pub fn host_os(os: &str) -> Option<HostOs> {
    match os.trim().to_ascii_lowercase().as_str() {
        "windows" => Some(HostOs::Windows),
        "macos" | "darwin" => Some(HostOs::Macos),
        _ => None,
    }
}

/// 当前安装的平台身份（版本 / 包标识 / OS / 架构）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformInfo {
    pub version: String,
    pub identifier: String,
    pub os: String,
    pub arch: String,
}

impl PlatformInfo {
    /// 用应用身份填充；OS / 架构取编译目标。
    pub fn from_identity(identity: &AppIdentity) -> Self {
        Self {
            version: identity.version.clone(),
            identifier: identity.identifier.clone(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::{AppIdentity, IDENTIFIER, PRODUCT_NAME};

    #[test]
    fn user_agent_is_product_slash_version() {
        assert_eq!(user_agent("0.1.2"), format!("{PRODUCT_NAME}/0.1.2"));
    }

    #[test]
    fn host_aliases_collapse() {
        assert_eq!(host_os("windows"), Some(HostOs::Windows));
        assert_eq!(host_os(" Darwin "), Some(HostOs::Macos));
        assert_eq!(host_os("macos"), Some(HostOs::Macos));
        assert_eq!(host_os("linux"), None);
        assert_eq!(cpu_arch("AMD64"), Some(CpuArch::X64));
        assert_eq!(cpu_arch("x86_64"), Some(CpuArch::X64));
        assert_eq!(cpu_arch("arm64"), Some(CpuArch::Arm64));
        assert_eq!(cpu_arch("aarch64"), Some(CpuArch::Arm64));
        assert_eq!(cpu_arch("i686"), None);
    }

    #[test]
    fn from_identity_keeps_version_and_package_id() {
        let info = PlatformInfo::from_identity(&AppIdentity::with_version("0.1.0"));
        assert_eq!(info.version, "0.1.0");
        assert_eq!(info.identifier, IDENTIFIER);
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }
}
