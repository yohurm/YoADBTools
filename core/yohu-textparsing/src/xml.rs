/// XML 层：CDATA 与实体。Atom / RSS 取出元素文本后先走这里，再交给 Html / Markdown。
pub struct Xml;

impl Xml {
    /// 剥一层 `<![CDATA[...]]>`；不是 CDATA 则原样返回。
    pub fn unwrap_cdata(s: &str) -> &str {
        let t = s.trim();
        t.strip_prefix("<![CDATA[")
            .and_then(|inner| inner.strip_suffix("]]>"))
            .map(str::trim)
            .unwrap_or(t)
    }

    /// 解码 `&amp;` / `&lt;` / `&#39;` / `&#x27;` 等。
    pub fn decode_entities(s: &str) -> String {
        let mut out = String::with_capacity(s.len());
        let mut rest = s;
        while let Some(i) = rest.find('&') {
            out.push_str(&rest[..i]);
            rest = &rest[i..];
            let Some(end) = rest.find(';') else {
                out.push('&');
                rest = &rest[1..];
                continue;
            };
            if end > 32 {
                out.push('&');
                rest = &rest[1..];
                continue;
            }
            let ent = &rest[1..end];
            if let Some(ch) = entity_char(ent) {
                out.push(ch);
                rest = &rest[end + 1..];
            } else {
                out.push('&');
                rest = &rest[1..];
            }
        }
        out.push_str(rest);
        out
    }
}

fn entity_char(ent: &str) -> Option<char> {
    match ent {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        "nbsp" => Some(' '),
        _ => {
            let num = ent.strip_prefix('#')?;
            let code = if let Some(hex) = num.strip_prefix(['x', 'X']) {
                u32::from_str_radix(hex, 16).ok()?
            } else {
                num.parse().ok()?
            };
            char::from_u32(code)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwraps_cdata() {
        assert_eq!(Xml::unwrap_cdata("<![CDATA[<p>a</p>]]>"), "<p>a</p>");
        assert_eq!(Xml::unwrap_cdata("plain"), "plain");
    }

    #[test]
    fn decodes_named_and_numeric() {
        assert_eq!(Xml::decode_entities("A &amp; B &#39;ok&#39;"), "A & B 'ok'");
        assert_eq!(Xml::decode_entities("&lt;p&gt;"), "<p>");
    }
}
