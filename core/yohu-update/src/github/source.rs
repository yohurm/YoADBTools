use crate::error::UpdateError;

pub const DEFAULT_OWNER: &str = "yohurm";
pub const DEFAULT_REPO: &str = "Windows-YoADBTools";

/// GitHub 仓库坐标；token 仅用于 REST 兜底与私有 asset 下载（检查路径尽量无 token）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubReleaseSource {
    pub owner: String,
    pub repo: String,
    pub token: String,
}

impl GitHubReleaseSource {
    pub fn new(owner: impl Into<String>, repo: impl Into<String>) -> Result<Self, UpdateError> {
        let source = Self {
            owner: owner.into().trim().to_string(),
            repo: repo.into().trim().to_string(),
            token: String::new(),
        };
        if source.owner.is_empty() || source.repo.is_empty() {
            return Err(UpdateError::NotConfigured);
        }
        Ok(source)
    }

    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = token.into().trim().to_string();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_owner_rejected() {
        assert!(matches!(
            GitHubReleaseSource::new(" ", "Windows-YoADBTools"),
            Err(UpdateError::NotConfigured)
        ));
    }
}
