use std::sync::Mutex;

use reqwest::Client;
use yohu_protocol::RemoteUpdate;

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::platform::PlatformInfo;

use super::api::remote_from_api_body;
use super::atom::{notes_from_atom_html, parse_latest_release};
use super::http::{build_client, get_text, github_error_message, user_agent_for};
use super::manifest::{remote_from_manifest_json, MANIFEST_FILES};
use super::source::GitHubReleaseSource;
use super::urls::GitHubUrls;
use super::web_latest::parse_web_latest_tag;
use crate::release::remote_from_tag_and_notes;

pub struct GitHubReleaseProvider {
    source: GitHubReleaseSource,
    urls: GitHubUrls,
    client: Client,
    api_latest_etag: Mutex<Option<String>>,
}

impl GitHubReleaseProvider {
    pub fn new(source: GitHubReleaseSource) -> Result<Self, UpdateError> {
        Ok(Self {
            urls: GitHubUrls::new(&source.owner, &source.repo),
            client: build_client()?,
            api_latest_etag: Mutex::new(None),
            source,
        })
    }

    async fn fetch_manifest_at(&self, url: &str, platform: &PlatformInfo) -> Option<RemoteUpdate> {
        let ua = user_agent_for(platform);
        let resp = get_text(
            &self.client,
            url,
            "application/json",
            &ua,
            None,
            None,
        )
        .await
        .ok()?;
        if resp.status != 200 {
            return None;
        }
        remote_from_manifest_json(&resp.body, platform, url).ok()
    }

    async fn try_manifest_latest(&self, platform: &PlatformInfo) -> Option<RemoteUpdate> {
        for file in MANIFEST_FILES {
            let url = self.urls.manifest_latest(file);
            if let Some(update) = self.fetch_manifest_at(&url, platform).await {
                tracing::debug!(url = %url, "update check via static manifest (latest)");
                return Some(update);
            }
        }
        None
    }

    async fn try_manifest_for_tag(
        &self,
        tag: &str,
        platform: &PlatformInfo,
        page_url: &str,
    ) -> Option<RemoteUpdate> {
        for file in MANIFEST_FILES {
            let url = self.urls.manifest_for_tag(tag, file);
            if let Some(update) = self.fetch_manifest_at(&url, platform).await {
                tracing::debug!(url = %url, tag = %tag, "update check via static manifest (tag)");
                return Some(update);
            }
        }
        remote_from_tag_and_notes(
            tag,
            "",
            page_url,
            &self.source.owner,
            &self.source.repo,
            platform,
        )
        .ok()
        .map(|update| {
            tracing::debug!(tag = %tag, "update check via conventional asset URL");
            update
        })
    }

    async fn try_atom_path(&self, platform: &PlatformInfo) -> Option<RemoteUpdate> {
        let ua = user_agent_for(platform);
        let resp = get_text(
            &self.client,
            &self.urls.atom(),
            "application/atom+xml, application/xml, text/xml",
            &ua,
            None,
            None,
        )
        .await
        .ok()?;
        if resp.status != 200 {
            return None;
        }
        let entry = parse_latest_release(&resp.body).ok()?;
        let notes = notes_from_atom_html(&entry.notes_html);
        self.try_manifest_for_tag(&entry.tag, platform, &entry.page_url)
            .await
            .map(|mut u| {
                if u.description.is_empty() {
                    u.description = notes;
                }
                tracing::debug!("update check via releases.atom");
                u
            })
    }

    async fn try_web_latest(&self, platform: &PlatformInfo) -> Option<RemoteUpdate> {
        let ua = user_agent_for(platform);
        let resp = get_text(
            &self.client,
            &self.urls.web_latest(),
            "application/json",
            &ua,
            None,
            None,
        )
        .await
        .ok()?;
        if resp.status != 200 {
            return None;
        }
        let tag = parse_web_latest_tag(&resp.body).ok()?;
        let page = self.urls.release_page(&tag);
        self.try_manifest_for_tag(&tag, platform, &page)
            .await
            .map(|update| {
                tracing::debug!("update check via github.com releases/latest JSON");
                update
            })
    }

    async fn try_api_latest(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
        let ua = user_agent_for(platform);
        let etag = self
            .api_latest_etag
            .lock()
            .ok()
            .and_then(|g| g.clone());
        let bearer = (!self.source.token.is_empty()).then_some(self.source.token.as_str());
        let resp = get_text(
            &self.client,
            &self.urls.api_latest(),
            "application/vnd.github+json",
            &ua,
            bearer,
            etag.as_deref(),
        )
        .await?;
        if resp.status == 304 {
            return Err(UpdateError::Platform(
                "更新元数据未变化（304），请稍后再试".into(),
            ));
        }
        if resp.status == 404 {
            return Err(UpdateError::NoRelease);
        }
        if !http_success(resp.status) {
            let hint = github_error_message(&resp.body);
            if hint.is_empty() {
                return Err(UpdateError::Http(resp.status));
            }
            return Err(UpdateError::Platform(hint));
        }
        if let Some(new_etag) = resp.etag {
            if let Ok(mut guard) = self.api_latest_etag.lock() {
                *guard = Some(new_etag);
            }
        }
        tracing::debug!("update check via REST releases/latest (fallback)");
        remote_from_api_body(&resp.body, platform)
    }
}

fn http_success(status: u16) -> bool {
    (200..300).contains(&status)
}

impl UpdateCheckProvider for GitHubReleaseProvider {
    async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
        if let Some(update) = self.try_manifest_latest(platform).await {
            return Ok(update);
        }
        if let Some(update) = self.try_atom_path(platform).await {
            return Ok(update);
        }
        if let Some(update) = self.try_web_latest(platform).await {
            return Ok(update);
        }
        self.try_api_latest(platform).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_constructs() {
        let source = GitHubReleaseSource::new("yohurm", "Windows-YoADBTools").unwrap();
        assert!(GitHubReleaseProvider::new(source).is_ok());
    }
}
