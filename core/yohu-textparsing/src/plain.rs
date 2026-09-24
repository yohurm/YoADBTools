use crate::xml::Xml;

/// 纯文本层：空白规整。其它格式收成行后再走这里。
pub struct Plain;

impl Plain {
    pub fn to_plain(input: &str) -> String {
        Self::normalize(&Xml::decode_entities(Xml::unwrap_cdata(input)))
    }

    /// 每行压缩空白，段落之间单换行，去首尾空。
    pub fn normalize(s: &str) -> String {
        let mut out = String::new();
        for line in s.replace('\r', "").lines() {
            let trimmed = line.split_whitespace().collect::<Vec<_>>().join(" ");
            if trimmed.is_empty() {
                if !out.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                continue;
            }
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&trimmed);
        }
        out.trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_spaces_keeps_lines() {
        assert_eq!(Plain::normalize("a   b\n\n  c"), "a b\nc");
    }
}
