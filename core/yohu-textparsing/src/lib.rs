//! yohu-textparsing — 多格式文本解析引擎（ADR-v6-036）。
//!
//! 与 `yohu-search` / `yohu-download` 并列：公共原语，**零产品类型、零 GitHub、零 Tauri**。
//! 调用方声明 [`TextFormat`]，不要在业务 crate 里叠 HTML / Markdown / XML 规则。

pub mod html;
pub mod markdown;
pub mod plain;
pub mod xml;

pub use html::Html;
pub use markdown::Markdown;
pub use plain::Plain;
pub use xml::Xml;

/// 输入文本的书写格式。调用方按来源指定，不要猜测后写进业务逻辑。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextFormat {
    /// 已是展示用纯文本；只做空白规整与实体解码。
    Plain,
    /// GitHub Release `body`、manifest `notes` 等 Markdown。
    Markdown,
    /// Atom `content type="html"`、网页摘要等 HTML。
    Html,
}

/// 按格式把输入收成展示用纯文本。
pub fn to_plain(input: &str, format: TextFormat) -> String {
    match format {
        TextFormat::Plain => Plain::to_plain(input),
        TextFormat::Markdown => Markdown::to_plain(input),
        TextFormat::Html => Html::to_plain(input),
    }
}

/// 根据前缀嗅探格式（仅未知来源）。已知来源应直接传 [`TextFormat`]。
pub fn sniff_format(input: &str) -> TextFormat {
    let inner = Xml::unwrap_cdata(input).trim_start();
    if Html::looks_like(inner) {
        TextFormat::Html
    } else if Markdown::looks_like(inner) {
        TextFormat::Markdown
    } else {
        TextFormat::Plain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatch_html_and_markdown() {
        assert_eq!(
            to_plain("<p><strong>v1</strong></p>", TextFormat::Html),
            "v1"
        );
        assert_eq!(
            to_plain("## 环境\n\n- **Windows**", TextFormat::Markdown),
            "环境\n• Windows"
        );
    }

    #[test]
    fn sniff_prefers_html_tags() {
        assert_eq!(sniff_format("<p>hi</p>"), TextFormat::Html);
        assert_eq!(sniff_format("## Title"), TextFormat::Markdown);
        assert_eq!(sniff_format("plain"), TextFormat::Plain);
    }
}
