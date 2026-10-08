//! 单字段对单语的第一次命中。下标是 Unicode 标量。

use crate::chars::{find_chars, fold_search};
use crate::pinyin::find_pinyin_span;
use crate::types::SearchHitKind;

pub fn search_field_hit(text: &str, token: &str) -> Option<(usize, usize, SearchHitKind)> {
    let folded = fold_search(text, token)?;
    if let Some(start) = find_chars(&folded.hay, &folded.needle, 0) {
        let end = start + folded.needle.len();
        return Some((start, end, span_kind(&folded.hay, start, end)));
    }
    let (start, end) = find_pinyin_span(&folded.hay, &folded.normalized, 0)?;
    Some((start, end, span_kind(&folded.hay, start, end)))
}

fn span_kind(hay: &[char], start: usize, end: usize) -> SearchHitKind {
    if start == 0 && end == hay.len() {
        return SearchHitKind::Exact;
    }
    if start == 0 || hay[start - 1].is_whitespace() {
        return SearchHitKind::Prefix;
    }
    SearchHitKind::Contains
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
