//! 安装包形态：Windows NSIS `.exe`，macOS `.dmg`，Linux `.deb`。

/// 当前产品支持的安装包种类。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallerKind {
    Nsis,
    Dmg,
    Deb,
}

impl InstallerKind {
    /// 从文件名或 URL 末段识别；无法识别则 `None`。
    pub fn from_name(name: &str) -> Option<Self> {
        let lower = name.trim().to_ascii_lowercase();
        if lower.ends_with(Self::Nsis.extension()) {
            Some(Self::Nsis)
        } else if lower.ends_with(Self::Dmg.extension()) {
            Some(Self::Dmg)
        } else if lower.ends_with(Self::Deb.extension()) {
            Some(Self::Deb)
        } else {
            None
        }
    }

    /// 当前 OS 应安装的形态。
    pub fn for_os(os: &str) -> Option<Self> {
        match crate::platform::host_os(os)? {
            crate::platform::HostOs::Windows => Some(Self::Nsis),
            crate::platform::HostOs::Macos => Some(Self::Dmg),
            crate::platform::HostOs::Linux => Some(Self::Deb),
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Nsis => ".exe",
            Self::Dmg => ".dmg",
            Self::Deb => ".deb",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_nsis_and_dmg() {
        assert_eq!(
            InstallerKind::from_name("YohuAdbTools_0.1.3_x64-setup.exe"),
            Some(InstallerKind::Nsis)
        );
        assert_eq!(
            InstallerKind::from_name("YohuAdbTools_0.1.3_aarch64.dmg"),
            Some(InstallerKind::Dmg)
        );
        assert_eq!(InstallerKind::from_name("releases/tag/v0.1.3"), None);
        assert_eq!(InstallerKind::from_name("YohuAdbTools_0.1.3_x64.msi"), None);
        assert_eq!(InstallerKind::from_name("YohuAdbTools.app"), None);
        assert_eq!(
            InstallerKind::from_name("YohuAdbTools_0.1.3_amd64.deb"),
            Some(InstallerKind::Deb)
        );
        assert_eq!(
            InstallerKind::from_name("YohuAdbTools_0.1.3_amd64.AppImage"),
            None
        );
    }

    #[test]
    fn for_os_matches_product_targets() {
        assert_eq!(InstallerKind::for_os("windows"), Some(InstallerKind::Nsis));
        assert_eq!(InstallerKind::for_os("macos"), Some(InstallerKind::Dmg));
        assert_eq!(InstallerKind::for_os("darwin"), Some(InstallerKind::Dmg));
        assert_eq!(InstallerKind::for_os("linux"), Some(InstallerKind::Deb));
    }
}
