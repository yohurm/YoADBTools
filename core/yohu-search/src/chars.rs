//! Unicode 标量扫描。不进公开面。

use crate::token::{normalize_search_query, search_lowercase};

pub struct FoldedSearch {
    pub hay: Vec<char>,
    pub needle: Vec<char>,
    pub normalized: String,
}

/// 查询折成小写原文与针。空针没有命中。字段第一次命中和高亮区间都问这一次。
pub fn fold_search(text: &str, token: &str) -> Option<FoldedSearch> {
    let normalized = normalize_search_query(token);
    if normalized.is_empty() {
        return None;
    }
    Some(FoldedSearch {
        hay: search_lowercase(text).chars().collect(),
        needle: normalized.chars().collect(),
        normalized,
    })
}

pub fn find_chars(hay: &[char], needle: &[char], from: usize) -> Option<usize> {
    if needle.is_empty() {
        return Some(from.min(hay.len()));
    }
    if needle.len() > hay.len() {
        return None;
    }
    let last = hay.len() - needle.len();
    let mut i = from;
    while i <= last {
        if hay[i..i + needle.len()] == needle[..] {
            return Some(i);
        }
        i += 1;
    }
    None
}
