//! 查询词高亮区间。

use crate::chars::{find_chars, lowered_chars};
use crate::token::{normalize_search_query, tokenize_search_query};
use crate::types::SearchRange;

pub fn merge_search_ranges(ranges: &[SearchRange]) -> Vec<SearchRange> {
    let mut sorted: Vec<SearchRange> = ranges.iter().copied().filter(|r| r.end > r.start).collect();
    if sorted.is_empty() {
        return Vec::new();
    }
    sorted.sort_by(|a, b| a.start.cmp(&b.start).then(a.end.cmp(&b.end)));
    let mut out = vec![sorted[0]];
    for cur in sorted.into_iter().skip(1) {
        let last = out.last_mut().expect("out not empty");
        if cur.start <= last.end {
            last.end = last.end.max(cur.end);
        } else {
            out.push(cur);
        }
    }
    out
}

fn token_ranges(text: &str, token: &str) -> Vec<SearchRange> {
    let needle = normalize_search_query(token);
    if needle.is_empty() {
        return Vec::new();
    }
    let hay = lowered_chars(text);
    let n: Vec<char> = needle.chars().collect();
    let mut ranges = Vec::new();
    let mut from = 0;
    while let Some(start) = find_chars(&hay, &n, from) {
        let end = start + n.len();
        ranges.push(SearchRange { start, end });
        from = start + n.len().max(1);
        if from > hay.len() {
            break;
        }
    }
    ranges
}

pub fn search_highlight_ranges(text: &str, query: &str) -> Vec<SearchRange> {
    let tokens = tokenize_search_query(query);
    if tokens.is_empty() {
        return Vec::new();
    }
    let ranges: Vec<SearchRange> = tokens
        .iter()
        .flat_map(|token| token_ranges(text, token))
        .collect();
    merge_search_ranges(&ranges)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        text: String,
        query: String,
        ranges: Vec<SearchRange>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        highlight: Vec<Case>,
    }

    #[test]
    fn highlight_shared_fixture() {
        let data: Fixture =
            serde_json::from_str(include_str!("../testdata/search.json")).expect("fixture");
        for (i, case) in data.highlight.iter().enumerate() {
            assert_eq!(
                search_highlight_ranges(&case.text, &case.query),
                case.ranges,
                "hl {i}"
            );
        }
    }
}
