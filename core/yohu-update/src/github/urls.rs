/// 本模块 URL 构造（网页 / 静态资产 / Atom / REST）。
pub struct GitHubUrls {
    pub owner: String,
    pub repo: String,
}

impl GitHubUrls {
    pub fn new(owner: &str, repo: &str) -> Self {
        Self {
            owner: owner.to_string(),
            repo: repo.to_string(),
        }
    }

    pub fn atom(&self) -> String {
        format!(
            "https://github.com/{}/{}/releases.atom",
            self.owner, self.repo
        )
    }

    pub fn web_latest(&self) -> String {
        format!(
            "https://github.com/{}/{}/releases/latest",
            self.owner, self.repo
        )
    }

    pub fn manifest_latest(&self, file: &str) -> String {
        format!(
            "https://github.com/{}/{}/releases/latest/download/{file}",
            self.owner, self.repo
        )
    }

    pub fn manifest_for_tag(&self, tag: &str, file: &str) -> String {
        format!(
            "https://github.com/{}/{}/releases/download/{tag}/{file}",
            self.owner, self.repo
        )
    }

    pub fn release_page(&self, tag: &str) -> String {
        format!(
            "https://github.com/{}/{}/releases/tag/{tag}",
            self.owner, self.repo
        )
    }

    pub fn api_latest(&self) -> String {
        format!(
            "https://api.github.com/repos/{}/{}/releases/latest",
            self.owner, self.repo
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_and_atom_paths() {
        let u = GitHubUrls::new("yohurm", "Windows-YoADBTools");
        assert!(u.atom().ends_with("/releases.atom"));
        assert!(u.api_latest().contains("api.github.com"));
        assert!(u
            .manifest_latest("update-manifest.json")
            .contains("/releases/latest/download/"));
    }
}
