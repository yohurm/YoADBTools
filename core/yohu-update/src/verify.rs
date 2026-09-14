//! 安装包大小上限与 SHA-256 校验。

use sha2::{Digest, Sha256};

/// 安装包缓存上限（防异常 Content-Length 填盘）。
pub const MAX_INSTALLER_BYTES: u64 = 512 * 1024 * 1024;

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex_lower(&digest)
}

pub fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

pub fn sha256_matches(expected: &str, actual: &str) -> bool {
    let exp = expected.trim();
    if exp.is_empty() {
        return true;
    }
    exp.eq_ignore_ascii_case(actual.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_empty_expected_always_matches() {
        assert!(sha256_matches("", "deadbeef"));
        assert!(sha256_matches("AB", "ab"));
        assert!(!sha256_matches("aa", "bb"));
    }

    #[test]
    fn sha256_hex_known() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
