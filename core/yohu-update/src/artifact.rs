//! 安装包形态：Windows NSIS `.exe`，macOS `.dmg`。

/// 当前产品支持的安装包种类。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallerKind {
    Nsis,
    Dmg,
}

impl InstallerKind {
    /// 从文件名或 URL 末段识别；无法识别则 `None`。
    pub fn from_name(name: &str) -> Option<Self> {
        let lower = name.trim().to_ascii_lowercase();
        if lower.ends_with(".exe") {
            Some(Self::Nsis)
        } else if lower.ends_with(".dmg") {
            Some(Self::Dmg)
        } else {
            None
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Nsis => "exe",
            Self::Dmg => "dmg",
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
    }
}
