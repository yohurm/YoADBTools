//! 文档表检索。默认 AND + 空查询原序通过。

use crate::field::search_field_hit;
use crate::score::{field_weight, kind_score};
use crate::token::tokenize_search_query;
use crate::types::{SearchCombine, SearchDocument, SearchEmpty, SearchHit, SearchMatch, SearchOptions};

fn match_document(
    doc: &SearchDocument,
    tokens: &[String],
    index: usize,
    combine: SearchCombine,
) -> Option<SearchMatch> {
    if tokens.is_empty() {
        return Some(SearchMatch {
            id: doc.id.clone(),
            score: 0,
            hits: Vec::new(),
            group: doc.group.clone(),
            index,
        });
    }
    let mut hits = Vec::new();
    let mut score = 0;
    let mut covered = 0usize;
    for token in tokens {
        let mut best = 0;
        let mut matched = false;
        for field in &doc.fields {
            if let Some((start, end, kind)) = search_field_hit(&field.text, token) {
                matched = true;
                hits.push(SearchHit {
                    field: field.key.clone(),
                    start,
                    end,
                    kind,
                });
                best = best.max(kind_score(kind) * field_weight(field));
            }
        }
        if matched {
            covered += 1;
            score += best;
        }
    }
    if covered == 0 {
        return None;
    }
    if combine == SearchCombine::And && covered < tokens.len() {
        return None;
    }
    Some(SearchMatch {
        id: doc.id.clone(),
        score,
        hits,
        group: doc.group.clone(),
        index,
    })
}

fn empty_matches(docs: &[SearchDocument]) -> Vec<SearchMatch> {
    docs.iter()
        .enumerate()
        .map(|(index, doc)| SearchMatch {
            id: doc.id.clone(),
            score: 0,
            hits: Vec::new(),
            group: doc.group.clone(),
            index,
        })
        .collect()
}

pub fn search_documents(
    docs: &[SearchDocument],
    query: &str,
    options: SearchOptions,
) -> Vec<SearchMatch> {
    let tokens = tokenize_search_query(query);
    if tokens.is_empty() {
        return match options.empty {
            SearchEmpty::None => Vec::new(),
            SearchEmpty::Pass => empty_matches(docs),
        };
    }
    let mut out: Vec<SearchMatch> = docs
        .iter()
        .enumerate()
        .filter_map(|(index, doc)| match_document(doc, &tokens, index, options.combine))
        .collect();
    out.sort_by(|a, b| b.score.cmp(&a.score).then(a.index.cmp(&b.index)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        query: String,
        #[serde(default)]
        options: SearchOptions,
        ids: Vec<String>,
        #[serde(default)]
        score0: Option<i32>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        docs: Vec<SearchDocument>,
        search: Vec<Case>,
    }

    #[test]
    fn search_shared_fixture() {
        let data: Fixture =
            serde_json::from_str(include_str!("../testdata/search.json")).expect("fixture");
        for (i, case) in data.search.iter().enumerate() {
            let matches = search_documents(&data.docs, &case.query, case.options);
            let ids: Vec<&str> = matches.iter().map(|m| m.id.as_str()).collect();
            assert_eq!(
                ids,
                case.ids.iter().map(String::as_str).collect::<Vec<_>>(),
                "search {i}"
            );
            if let Some(score) = case.score0 {
                assert_eq!(matches.first().map(|m| m.score), Some(score), "score {i}");
            }
        }
    }
}
