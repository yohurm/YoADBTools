use crate::plain::Plain;
use crate::xml::Xml;

/// HTML → 纯文本（块级换行、列表圆点、去标签）。
pub struct Html;

impl Html {
    pub fn to_plain(input: &str) -> String {
        let stripped = Self::strip_tags(Xml::unwrap_cdata(input));
        Plain::normalize(&Xml::decode_entities(&stripped))
    }

    pub fn looks_like(input: &str) -> bool {
        let t = input.trim_start();
        if t.starts_with('<') {
            return true;
        }
        let lower = t.to_ascii_lowercase();
        ["<p", "<li", "<ul", "<ol", "<div", "<br", "<h1", "<h2", "<strong", "<em", "<code"]
            .iter()
            .any(|tag| lower.contains(tag))
    }

    /// 块标签变换行，`<li>` 变 `• `，其余标签删除。不解码实体。
    pub fn strip_tags(input: &str) -> String {
        let mut out = String::with_capacity(input.len());
        let mut rest = input;
        while !rest.is_empty() {
            if rest.starts_with("<!--") {
                rest = rest.split_once("-->").map(|(_, r)| r).unwrap_or("");
                continue;
            }
            if !rest.starts_with('<') {
                let next = rest.find('<').unwrap_or(rest.len());
                out.push_str(&rest[..next]);
                rest = &rest[next..];
                continue;
            }
            let Some(end) = rest.find('>') else {
                out.push_str(rest);
                break;
            };
            let raw = &rest[1..end];
            rest = &rest[end + 1..];
            let (name, closing) = tag_name(raw);
            if matches!(name.as_str(), "script" | "style") && !closing {
                let close = format!("</{name}>");
                if let Some(i) = rest.to_ascii_lowercase().find(&close) {
                    rest = &rest[i + close.len()..];
                } else {
                    rest = "";
                }
                continue;
            }
            apply_block_tag(&name, closing, &mut out);
        }
        out
    }
}

fn tag_name(raw: &str) -> (String, bool) {
    let trimmed = raw.trim();
    let closing = trimmed.starts_with('/');
    let name = trimmed
        .trim_start_matches('/')
        .split(|c: char| c.is_whitespace() || c == '/' || c == '>')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    (name, closing)
}

fn apply_block_tag(name: &str, closing: bool, out: &mut String) {
    match name {
        "br" | "hr" => push_nl(out),
        "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote" | "pre" | "tr"
        | "table" | "section" | "ul" | "ol" => push_nl(out),
        "li" if !closing => {
            push_nl(out);
            if !out.ends_with("• ") {
                out.push_str("• ");
            }
        }
        "li" => push_nl(out),
        _ => {}
    }
}

fn push_nl(out: &mut String) {
    if out.is_empty() || out.ends_with('\n') {
        return;
    }
    out.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atom_html_to_plain() {
        let raw = r#"<p>Yohu ADB Tools <strong>v0.1.2</strong>.</p>
<p>Windows x64 安装包：<code>YohuAdbTools_0.1.2_x64-setup.exe</code>。</p>
<ul>
<li><strong>文件管理</strong>：浏览改为世代会话。</li>
<li><strong>投屏</strong>：目录树后仓补全。</li>
</ul>"#;
        let out = Html::to_plain(raw);
        assert!(!out.contains('<'));
        assert!(!out.contains("strong"));
        assert!(out.contains("Yohu ADB Tools v0.1.2."));
        assert!(out.contains("YohuAdbTools_0.1.2_x64-setup.exe"));
        assert!(out.contains("• 文件管理：浏览改为世代会话。"));
        assert!(out.contains("• 投屏：目录树后仓补全。"));
    }

    #[test]
    fn cdata_html_entities() {
        assert_eq!(
            Html::to_plain("<![CDATA[<p>A &amp; B &#39;ok&#39;</p>]]>"),
            "A & B 'ok'"
        );
    }
}
