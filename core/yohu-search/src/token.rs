//! 查询归一与空白分词。连字符 / 点号不拆。

pub fn normalize_search_query(query: &str) -> String {
    query.trim().to_lowercase()
}

pub fn tokenize_search_query(query: &str) -> Vec<String> {
    let needle = normalize_search_query(query);
    if needle.is_empty() {
        return Vec::new();
    }
    needle.split_whitespace().map(str::to_string).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        query: String,
        normalized: String,
        tokens: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        tokenize: Vec<Case>,
    }

    #[test]
    fn tokenize_shared_fixture() {
        let data: Fixture =
            serde_json::from_str(include_str!("../testdata/search.json")).expect("fixture");
        for (i, case) in data.tokenize.iter().enumerate() {
            assert_eq!(normalize_search_query(&case.query), case.normalized, "norm {i}");
            assert_eq!(tokenize_search_query(&case.query), case.tokens, "tok {i}");
        }
    }
}
