//! 命中种类分与字段权重。

use crate::types::{SearchField, SearchHitKind};

pub const SEARCH_KIND_SCORE_EXACT: i32 = 100;
pub const SEARCH_KIND_SCORE_PREFIX: i32 = 40;
pub const SEARCH_KIND_SCORE_CONTAINS: i32 = 10;
pub const DEFAULT_SEARCH_FIELD_WEIGHT: i32 = 1;

pub fn kind_score(kind: SearchHitKind) -> i32 {
    match kind {
        SearchHitKind::Exact => SEARCH_KIND_SCORE_EXACT,
        SearchHitKind::Prefix => SEARCH_KIND_SCORE_PREFIX,
        SearchHitKind::Contains => SEARCH_KIND_SCORE_CONTAINS,
    }
}

pub fn field_weight(field: &SearchField) -> i32 {
    match field.weight {
        Some(w) if w > 0 => w,
        Some(_) => 0,
        None => DEFAULT_SEARCH_FIELD_WEIGHT,
    }
}
