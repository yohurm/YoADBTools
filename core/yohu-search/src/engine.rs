//! 冻结一份文档表。后续 search 不回看调用方切片。

use crate::query::search_documents;
use crate::types::{SearchDocument, SearchMatch, SearchOptions};

#[derive(Debug, Clone)]
pub struct SearchEngine {
    docs: Vec<SearchDocument>,
}

impl SearchEngine {
    pub fn new(docs: Vec<SearchDocument>) -> Self {
        Self { docs }
    }

    pub fn search(&self, query: &str, options: SearchOptions) -> Vec<SearchMatch> {
        search_documents(&self.docs, query, options)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SearchDocument;

    #[test]
    fn engine_freezes_snapshot() {
        let docs: Vec<SearchDocument> =
            serde_json::from_value(serde_json::from_str::<serde_json::Value>(include_str!(
                "../testdata/search.json"
            )).unwrap()["docs"].clone())
            .expect("docs");
        let mut live = docs[..1].to_vec();
        let engine = SearchEngine::new(live.clone());
        live.push(docs[1].clone());
        assert!(engine.search("ping", SearchOptions::default()).is_empty());
        assert_eq!(
            engine
                .search("型号", SearchOptions::default())
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["c-model"]
        );
    }
}
