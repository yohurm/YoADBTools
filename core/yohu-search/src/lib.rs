//! yohu-search — 目录级检索引擎。
//!
//! 与 `yohu-motion` 并列：公共原语，**不进** `yohu-domain`，不含命令库 / logcat / 路径 / Tauri。
//! 公开面只从本文件转出。对照 MiniSearch（空白分词、字段加权、AND）与 Fuse（加权字段、命中区间）。
//! 内存线性扫描；不做倒排、不做编辑距离。汉字另走全拼 / 音节前缀 / 首字母（`ü`→`v`）。下标按 Unicode 标量。
//!
//! YoUI `search/` 镜像本 crate + [`testdata/search.json`]。

mod chars;
mod engine;
mod expand;
mod field;
mod highlight;
mod pinyin;
mod query;
mod score;
mod token;
mod types;

pub use engine::SearchEngine;
pub use expand::expand_search_groups;
pub use field::search_field_hit;
pub use highlight::{merge_search_ranges, search_highlight_ranges};
pub use query::search_documents;
pub use score::{
    DEFAULT_SEARCH_FIELD_WEIGHT, SEARCH_KIND_SCORE_CONTAINS, SEARCH_KIND_SCORE_EXACT,
    SEARCH_KIND_SCORE_PREFIX,
};
pub use token::{normalize_search_query, tokenize_search_query};
pub use types::{
    SearchCombine, SearchDocument, SearchEmpty, SearchField, SearchHit, SearchHitKind, SearchMatch,
    SearchOptions, SearchRange,
};
