//! 汉字拼音命中。音节表在 `data/pinyin.tsv`（与 YoUI 镜像同一份）。
//! 全拼 / 音节前缀 / 首字母；`ü` 作 `v`。下标是 Unicode 标量。不进公开面。

use std::collections::HashMap;
use std::sync::OnceLock;

struct PinyinDict {
    syllables: Vec<String>,
    by_char: HashMap<char, Vec<u16>>,
}

fn parse_dict(tsv: &str) -> PinyinDict {
    let mut syllables = Vec::new();
    let mut by_char: HashMap<char, Vec<u16>> = HashMap::new();
    let mut index: HashMap<&str, u16> = HashMap::new();
    for line in tsv.lines() {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((syl, chars)) = line.split_once('\t') else {
            continue;
        };
        if syl.is_empty() || !syl.bytes().all(|b| b.is_ascii_lowercase()) {
            continue;
        }
        let id = match index.get(syl) {
            Some(id) => *id,
            None => {
                let id = u16::try_from(syllables.len()).expect("pinyin syllables");
                index.insert(syl, id);
                syllables.push(syl.to_string());
                id
            }
        };
        for ch in chars.chars() {
            let ids = by_char.entry(ch).or_default();
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    PinyinDict {
        syllables,
        by_char,
    }
}

fn dict() -> &'static PinyinDict {
    static DICT: OnceLock<PinyinDict> = OnceLock::new();
    DICT.get_or_init(|| parse_dict(include_str!("../data/pinyin.tsv")))
}

pub fn is_pinyin_query(token: &str) -> bool {
    let mut letter = false;
    for ch in token.chars() {
        if ch.is_ascii_alphabetic() {
            letter = true;
        } else if ch != '\'' {
            return false;
        }
    }
    letter
}

fn needle_chars(token: &str) -> Vec<char> {
    token.chars().filter(|&ch| ch != '\'').collect()
}

fn prefix_len(syl: &str, needle: &[char], ni: usize) -> usize {
    let rest = needle.len() - ni;
    let mut n = 0;
    for b in syl.bytes() {
        if n >= rest || b as char != needle[ni + n] {
            break;
        }
        n += 1;
    }
    n
}

fn consume(hay: &[char], hi: usize, needle: &[char], ni: usize, dict: &PinyinDict) -> Option<usize> {
    if ni == needle.len() {
        return Some(hi);
    }
    if hi >= hay.len() {
        return None;
    }
    let ch = hay[hi];
    if ch.is_ascii_alphabetic() {
        return if ch == needle[ni] {
            consume(hay, hi + 1, needle, ni + 1, dict)
        } else {
            None
        };
    }
    if let Some(ids) = dict.by_char.get(&ch) {
        for id in ids {
            let syl = dict.syllables[*id as usize].as_str();
            let max = prefix_len(syl, needle, ni);
            for k in 1..=max {
                if let Some(end) = consume(hay, hi + 1, needle, ni + k, dict) {
                    return Some(end);
                }
            }
        }
        return None;
    }
    consume(hay, hi + 1, needle, ni, dict)
}

fn find_from(hay: &[char], needle: &[char], from: usize, dict: &PinyinDict) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let mut start = from;
    while start < hay.len() {
        let ch = hay[start];
        if !ch.is_ascii_alphabetic() && !dict.by_char.contains_key(&ch) {
            start += 1;
            continue;
        }
        if let Some(end) = consume(hay, start, needle, 0, dict) {
            if end > start {
                return Some((start, end));
            }
        }
        start += 1;
    }
    None
}

/// 字段里第一次拼音命中。`token` 已小写。无汉字或非拼音查询则空。
pub fn find_pinyin_span(hay: &[char], token: &str, from: usize) -> Option<(usize, usize)> {
    if !is_pinyin_query(token) || !hay.iter().any(|ch| dict().by_char.contains_key(ch)) {
        return None;
    }
    find_from(hay, &needle_chars(token), from, dict())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn readings(ch: char) -> Vec<&'static str> {
        dict()
            .by_char
            .get(&ch)
            .into_iter()
            .flatten()
            .map(|id| dict().syllables[*id as usize].as_str())
            .collect()
    }

    #[test]
    fn table_common_readings() {
        assert!(readings('型').contains(&"xing"));
        assert!(readings('号').contains(&"hao"));
        assert!(readings('女').contains(&"nv"));
        assert!(readings('行').contains(&"xing"));
        assert!(readings('行').contains(&"hang"));
    }
}
