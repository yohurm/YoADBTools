use crate::plain::Plain;
use crate::xml::Xml;

/// Markdown → 纯文本（去标题标记、列表圆点、成对 `**` / `__` / `` ` ``）。
pub struct Markdown;

impl Markdown {
    pub fn to_plain(input: &str) -> String {
        let stripped = Self::strip(Xml::unwrap_cdata(input));
        Plain::normalize(&Xml::decode_entities(&stripped))
    }

    pub fn looks_like(input: &str) -> bool {
        let t = input.trim_start();
        t.starts_with('#')
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.contains("**")
            || t.contains("__")
            || t.contains("```")
    }

    /// 去 Markdown 壳，保留正文。不处理 HTML 标签。
    pub fn strip(input: &str) -> String {
        let mut out = String::new();
        for line in input.replace('\r', "").lines() {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&strip_line(line));
        }
        out
    }
}

fn strip_line(line: &str) -> String {
    let mut s = line.trim().to_string();
    for _ in 0..4 {
        if s.starts_with('#') {
            s = s.trim_start_matches('#').trim_start().to_string();
        }
    }
    if let Some(rest) = s.strip_prefix("- ") {
        s = format!("• {rest}");
    } else if let Some(rest) = s.strip_prefix("* ") {
        s = format!("• {rest}");
    }
    s = replace_pairs(&s, "**");
    s = replace_pairs(&s, "__");
    replace_pairs(&s, "`")
}

fn replace_pairs(s: &str, marker: &str) -> String {
    if marker.is_empty() {
        return s.to_string();
    }
    let parts: Vec<&str> = s.split(marker).collect();
    if parts.len() < 3 {
        return s.to_string();
    }
    parts.join("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_heading_and_bold() {
        let out = Markdown::to_plain("## 环境\n\n- **Windows** x64\n\n相对 **v0.1.1** 更新");
        assert!(out.contains("环境"));
        assert!(out.contains("Windows"));
        assert!(!out.contains("**"));
        assert!(out.contains("v0.1.1"));
        assert!(out.contains("• Windows"));
    }
}
