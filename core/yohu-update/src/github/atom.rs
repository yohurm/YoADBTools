use crate::error::UpdateError;
use crate::release::strip_tag_prefix;
use yohu_textparsing::{to_plain, TextFormat, Xml};

/// Atom 里最新一条 Release 摘要（electron-updater 主路径，无 REST 配额）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtomRelease {
    pub tag: String,
    pub page_url: String,
    pub notes_html: String,
}

/// 解析 `releases.atom`，取第一条可识别 semver tag 的 entry。
pub fn parse_latest_release(atom_xml: &str) -> Result<AtomRelease, UpdateError> {
    let entries = split_atom_entries(atom_xml);
    for entry in entries {
        if let Some(parsed) = parse_entry(&entry) {
            return Ok(parsed);
        }
    }
    Err(UpdateError::NoRelease)
}

fn split_atom_entries(xml: &str) -> Vec<String> {
    let lower = xml.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut start = 0usize;
    while let Some(rel) = lower[start..].find("<entry") {
        let abs = start + rel;
        if let Some(end_rel) = lower[abs..].find("</entry>") {
            let end = abs + end_rel + "</entry>".len();
            out.push(xml[abs..end].to_string());
            start = end;
        } else {
            break;
        }
    }
    out
}

fn parse_entry(entry: &str) -> Option<AtomRelease> {
    let page_url = extract_attr(entry, "link", "href")?;
    if !page_url.contains("/releases/tag/") {
        return None;
    }
    let tag = tag_from_page_url(&page_url)?;
    if strip_tag_prefix(&tag).is_empty() {
        return None;
    }
    let title = extract_text(entry, "title").unwrap_or_default();
    let content = extract_text(entry, "content").unwrap_or_default();
    let notes_html = if content.is_empty() { title } else { content };
    Some(AtomRelease {
        tag,
        page_url,
        notes_html,
    })
}

fn tag_from_page_url(url: &str) -> Option<String> {
    let marker = "/releases/tag/";
    let idx = url.find(marker)? + marker.len();
    let rest = url[idx..].trim_end_matches('/');
    let tag = rest.split(['?', '#']).next()?.trim();
    if tag.is_empty() {
        None
    } else {
        Some(tag.to_string())
    }
}

fn extract_attr(block: &str, tag: &str, attr: &str) -> Option<String> {
    let needle = format!("<{tag}");
    let start = block.find(&needle)?;
    let slice = &block[start..];
    let gt = slice.find('>')?;
    let head = &slice[..gt];
    let attr_needle = format!("{attr}=\"");
    let a = head.find(&attr_needle)? + attr_needle.len();
    let rest = &head[a..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn extract_text(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = block.find(&open)?;
    let after_open = &block[start..];
    let content_start = after_open.find('>')? + 1;
    let close = format!("</{tag}>");
    let inner = after_open[content_start..].split_once(&close)?.0;
    Some(Xml::decode_entities(Xml::unwrap_cdata(inner.trim())))
}

pub fn notes_from_atom_html(html: &str) -> String {
    to_plain(html, TextFormat::Html)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_atom_first_entry() {
        let xml = r#"<?xml version="1.0"?>
<feed>
  <entry>
    <title>v0.1.2</title>
    <link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/v0.1.2"/>
    <content type="html">Release notes here</content>
  </entry>
  <entry>
    <title>v0.1.1</title>
    <link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/v0.1.1"/>
  </entry>
</feed>"#;
        let r = parse_latest_release(xml).unwrap();
        assert_eq!(r.tag, "v0.1.2");
        assert!(r.notes_html.contains("Release notes"));
    }

    #[test]
    fn atom_html_notes_are_plain_text() {
        let html = "<p>Yohu ADB Tools <strong>v0.1.2</strong>.</p><ul><li><strong>文件管理</strong>：会话。</li></ul>";
        let notes = notes_from_atom_html(html);
        assert!(!notes.contains('<'));
        assert!(notes.contains("Yohu ADB Tools v0.1.2."));
        assert!(notes.contains("• 文件管理：会话。"));
    }
}
