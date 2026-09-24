use serde::Deserialize;

use crate::error::UpdateError;

#[derive(Debug, Deserialize)]
struct WebLatestRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    draft: bool,
}

/// `https://github.com/OWNER/REPO/releases/latest` + `Accept: application/json`（electron getLatestTagName）。
pub fn parse_web_latest_tag(body: &str) -> Result<String, UpdateError> {
    let release: WebLatestRelease =
        serde_json::from_str(body).map_err(|e| UpdateError::Parse(e.to_string()))?;
    if release.draft {
        return Err(UpdateError::DraftRelease);
    }
    let tag = release.tag_name.trim();
    if tag.is_empty() {
        return Err(UpdateError::MissingTag);
    }
    Ok(tag.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tag_name() {
        let body = r#"{"tag_name":"v1.2.0","draft":false}"#;
        assert_eq!(parse_web_latest_tag(body).unwrap(), "v1.2.0");
    }
}
