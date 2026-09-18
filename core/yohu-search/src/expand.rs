//! 组名字段命中则纳入同 group 的全部文档。输出按源序。

use std::collections::{HashMap, HashSet};

use crate::types::{SearchDocument, SearchMatch};

pub fn expand_search_groups(
    docs: &[SearchDocument],
    matches: &[SearchMatch],
    group_field: Option<&str>,
) -> Vec<SearchMatch> {
    let group_field = group_field.unwrap_or("group");
    let mut by_id: HashMap<&str, SearchMatch> = HashMap::new();
    let mut keep: HashSet<&str> = HashSet::new();
    let mut expand: HashSet<&str> = HashSet::new();
    for m in matches {
        keep.insert(m.id.as_str());
        by_id.insert(m.id.as_str(), m.clone());
        if let Some(group) = m.group.as_deref() {
            if m.hits.iter().any(|h| h.field == group_field) {
                expand.insert(group);
            }
        }
    }
    if !expand.is_empty() {
        for (index, doc) in docs.iter().enumerate() {
            if let Some(group) = doc.group.as_deref() {
                if expand.contains(group) {
                    keep.insert(doc.id.as_str());
                    by_id.entry(doc.id.as_str()).or_insert_with(|| SearchMatch {
                        id: doc.id.clone(),
                        score: 0,
                        hits: Vec::new(),
                        group: doc.group.clone(),
                        index,
                    });
                }
            }
        }
    }
    docs.iter()
        .enumerate()
        .filter_map(|(index, doc)| {
            if !keep.contains(doc.id.as_str()) {
                return None;
            }
            Some(by_id.get(doc.id.as_str()).cloned().unwrap_or(SearchMatch {
                id: doc.id.clone(),
                score: 0,
                hits: Vec::new(),
                group: doc.group.clone(),
                index,
            }))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query::search_documents;
    use crate::types::{SearchDocument, SearchOptions};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        query: String,
        ids: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        docs: Vec<SearchDocument>,
        expand: Vec<Case>,
    }

    #[test]
    fn expand_shared_fixture() {
        let data: Fixture =
            serde_json::from_str(include_str!("../testdata/search.json")).expect("fixture");
        for (i, case) in data.expand.iter().enumerate() {
            let matches = search_documents(&data.docs, &case.query, SearchOptions::default());
            let expanded = expand_search_groups(&data.docs, &matches, None);
            let ids: Vec<&str> = expanded.iter().map(|m| m.id.as_str()).collect();
            assert_eq!(
                ids,
                case.ids.iter().map(String::as_str).collect::<Vec<_>>(),
                "expand {i}"
            );
        }
    }
}
