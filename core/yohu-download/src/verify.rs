//! 体积上限与 SHA-256。

use sha2::{Digest, Sha256};

pub const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_lower(&Sha256::digest(bytes))
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
