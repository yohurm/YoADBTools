use std::time::Duration;

use reqwest::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, IF_NONE_MATCH, USER_AGENT};

use crate::error::UpdateError;
use crate::platform::PlatformInfo;

pub const CHECK_TIMEOUT: Duration = Duration::from_secs(15);

pub fn build_client() -> Result<Client, UpdateError> {
    Client::builder()
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|e| UpdateError::Network(e.to_string()))
}

pub struct TextResponse {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
}

pub async fn get_text(
    client: &Client,
    url: &str,
    accept: &str,
    user_agent: &str,
    bearer: Option<&str>,
    if_none_match: Option<&str>,
) -> Result<TextResponse, UpdateError> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_str(accept).map_err(parse_hdr)?);
    headers.insert(USER_AGENT, HeaderValue::from_str(user_agent).map_err(parse_hdr)?);
    if let Some(token) = bearer.filter(|t| !t.is_empty()) {
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(parse_hdr)?,
        );
    }
    if let Some(etag) = if_none_match.filter(|e| !e.is_empty()) {
        headers.insert(
            IF_NONE_MATCH,
            HeaderValue::from_str(etag).map_err(parse_hdr)?,
        );
    }
    let response = client.get(url).headers(headers).send().await?;
    let status = response.status().as_u16();
    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let body = response.text().await?;
    Ok(TextResponse { status, body, etag })
}

fn parse_hdr(e: reqwest::header::InvalidHeaderValue) -> UpdateError {
    UpdateError::Network(e.to_string())
}

pub fn user_agent_for(platform: &PlatformInfo) -> String {
    crate::platform::user_agent(&platform.version)
}

pub fn github_error_message(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("message")
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}
