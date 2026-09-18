//! Unicode 标量扫描。不进公开面。

pub fn lowered_chars(text: &str) -> Vec<char> {
    text.to_lowercase().chars().collect()
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
