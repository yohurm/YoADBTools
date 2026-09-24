//! 真网 GitHub Releases 冒烟（默认 `#[ignore]`，本地验收时手动 `--ignored` 跑）。

use tokio_util::sync::CancellationToken;
use yohu_protocol::UpdateDownloadRequest;
use yohu_update::{
    check_with_github, download_with_github, GitHubReleaseSource, PlatformInfo,
};

fn win_platform(version: &str) -> PlatformInfo {
    PlatformInfo {
        version: version.into(),
        identifier: "com.yohu.adbtools".into(),
        os: "windows".into(),
        arch: "x86_64".into(),
    }
}

#[tokio::test]
#[ignore = "live GitHub: check + download"]
async fn live_check_and_download_from_github() {
    let token = std::env::var("YOHU_GITHUB_TOKEN").unwrap_or_default();
    let source = GitHubReleaseSource::new("yohurm", "Windows-YoADBTools")
        .expect("source")
        .with_token(token);
    let platform = win_platform("0.1.1");
    let update = check_with_github(source.clone(), platform)
        .await
        .expect("check");
    assert!(
        update.has_new_version,
        "expected newer than 0.1.1, got {:?}",
        update.version
    );
    assert_eq!(update.version, "0.1.2");
    let url = update
        .installer_url
        .as_deref()
        .expect("win64 setup url");
    assert!(url.contains("0.1.2"));
    assert!(url.contains("setup.exe"));

    let request = UpdateDownloadRequest {
        url: url.into(),
        sha256: update.sha256.clone(),
        size_bytes: update.size_bytes,
        version: update.version.clone(),
    };
    let result = download_with_github(
        source,
        request,
        CancellationToken::new(),
        |_| {},
    )
    .await
    .expect("download");
    let meta = tokio::fs::metadata(&result.path).await.expect("meta");
    assert!(meta.is_file());
    assert!(meta.len() > 0);
    if update.size_bytes > 0 {
        assert_eq!(meta.len(), update.size_bytes);
    }
    assert!(result.path.contains("cache"));
}
