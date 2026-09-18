//! 单字段对单语的第一次命中。下标是 Unicode 标量。

use crate::chars::{find_chars, lowered_chars};
use crate::token::normalize_search_query;
use crate::types::SearchHitKind;

fn hit_kind(hay: &[char], needle: &[char], index: usize) -> SearchHitKind {
    if hay == needle {
        return SearchHitKind::Exact;
    }
    if index == 0 || hay[index - 1].is_whitespace() {
        return SearchHitKind::Prefix;
    }
    SearchHitKind::Contains
}

pub fn search_field_hit(text: &str, token: &str) -> Option<(usize, usize, SearchHitKind)> {
    let needle = normalize_search_query(token);
    if needle.is_empty() {
        return None;
    }
    let hay = lowered_chars(text);
    let n: Vec<char> = needle.chars().collect();
    let start = find_chars(&hay, &n, 0)?;
    Some((start, start + n.len(), hit_kind(&hay, &n, start)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        text: String,
        token: String,
        kind: Option<SearchHitKind>,
        start: Option<usize>,
        end: Option<usize>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        field_hits: Vec<Case>,
    }

    #[test]
    fn field_hits_shared_fixture() {
        let data: Fixture =
            serde_json::from_str(include_str!("../testdata/search.json")).expect("fixture");
        for (i, case) in data.field_hits.iter().enumerate() {
            match search_field_hit(&case.text, &case.token) {
                Some((start, end, kind)) => {
                    assert_eq!(Some(kind), case.kind, "kind {i}");
                    assert_eq!(Some(start), case.start, "start {i}");
                    assert_eq!(Some(end), case.end, "end {i}");
                }
                None => assert!(case.kind.is_none(), "miss {i}"),
            }
        }
    }
}
