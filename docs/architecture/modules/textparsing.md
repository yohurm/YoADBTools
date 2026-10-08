# 模块：`yohu-textparsing`（多格式文本解析引擎）

> ADR-v6-036。与 search / download 同级，零产品类型。

## 定位

| 项 | 说明 |
|----|------|
| crate | `core/yohu-textparsing` |
| 职责 | HTML / Markdown / XML（CDATA、实体）/ 纯文本 → 展示用纯文本 |
| 不做什么 | GitHub、Release、IPC、渲染 Markdown、完整 HTML DOM |

## 公开 API

```rust
yohu_textparsing::to_plain(input, TextFormat::Html)
yohu_textparsing::to_plain(input, TextFormat::Markdown)
yohu_textparsing::to_plain(input, TextFormat::Plain)
Html::to_plain / Markdown::to_plain / Plain::to_plain
Xml::unwrap_cdata / Xml::decode_entities
sniff_format(input)                     // 仅未知来源
```

调用方声明格式。已知来源禁止用 sniff 代替通道约定。

## 调用约定（update）

```text
Atom <content>  → Xml::decode_entities(unwrap_cdata) → to_plain(..., Html)
REST body       → to_plain(..., Markdown)
manifest notes  → to_plain(..., Markdown)
```
