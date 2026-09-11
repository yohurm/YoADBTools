//! 墙钟解析单点。展示精度按表面分开：日志/终端带毫秒，文件只到秒。
//! 禁止把「只有时分」的原文补成秒或毫秒。

/// `2026-09-10 17:20:45.123`
pub const DATETIME_DISPLAY_LEN: usize = 23;
/// `2026-09-10 17:20:45`
pub const DATETIME_SECONDS_LEN: usize = 19;

struct Parts {
    year: u32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    millis: u32,
}

/// 日志 / 终端：`YYYY-MM-DD HH:mm:ss.SSS`。
pub fn format_datetime(
    year: u32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    millis: u32,
) -> Option<String> {
    valid_parts(year, month, day, hour, minute, second, millis)?;
    Some(format!(
        "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{millis:03}"
    ))
}

/// 文件修改时间：`YYYY-MM-DD HH:mm:ss`。
pub fn format_datetime_seconds(
    year: u32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> Option<String> {
    valid_parts(year, month, day, hour, minute, second, 0)?;
    Some(format!(
        "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"
    ))
}

/// 收到带毫秒的墙钟。缺秒则空，不补造。
pub fn canonicalize_datetime(raw: &str) -> Option<String> {
    let p = parse_parts(raw)?;
    format_datetime(
        p.year, p.month, p.day, p.hour, p.minute, p.second, p.millis,
    )
}

/// 收到到秒的墙钟（`ls -lla` / `stat %y` 的小数与时区丢弃）。缺秒则空。
pub fn canonicalize_datetime_seconds(raw: &str) -> Option<String> {
    let p = parse_parts(raw)?;
    format_datetime_seconds(p.year, p.month, p.day, p.hour, p.minute, p.second)
}

fn valid_parts(
    year: u32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    millis: u32,
) -> Option<()> {
    if year > 9999
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
        || millis > 999
    {
        return None;
    }
    Some(())
}

fn parse_parts(raw: &str) -> Option<Parts> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_z = trimmed.strip_suffix('Z').unwrap_or(trimmed);
    let tokens: Vec<&str> = without_z.split_whitespace().collect();
    let (date, time) = match tokens.as_slice() {
        [one] => one.split_once('T')?,
        [date, time] => (*date, *time),
        [date, time, zone] if is_zone_token(zone) => (*date, *time),
        _ => return None,
    };
    let (year, month, day) = parse_date(date)?;
    let (hour, minute, second, millis) = parse_time(time)?;
    Some(Parts {
        year,
        month,
        day,
        hour,
        minute,
        second,
        millis,
    })
}

fn is_zone_token(token: &str) -> bool {
    matches!(token.as_bytes().first(), Some(b'+' | b'-'))
        && token.chars().filter(|c| c.is_ascii_digit()).count() >= 4
}

fn parse_u32_exact(s: &str) -> Option<u32> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

fn parse_date(s: &str) -> Option<(u32, u32, u32)> {
    let mut parts = s.split('-');
    let year = parts.next()?;
    let month = parts.next()?;
    let day = parts.next()?;
    if parts.next().is_some() || year.len() != 4 || month.len() != 2 || day.len() != 2 {
        return None;
    }
    Some((
        parse_u32_exact(year)?,
        parse_u32_exact(month)?,
        parse_u32_exact(day)?,
    ))
}

fn parse_time(s: &str) -> Option<(u32, u32, u32, u32)> {
    let (hms, frac) = match s.split_once('.') {
        Some((head, tail)) => (head, Some(tail)),
        None => (s, None),
    };
    let mut parts = hms.split(':');
    let hour = parts.next()?;
    let minute = parts.next()?;
    let second = parts.next()?;
    if parts.next().is_some() || hour.len() != 2 || minute.len() != 2 || second.len() != 2 {
        return None;
    }
    Some((
        parse_u32_exact(hour)?,
        parse_u32_exact(minute)?,
        parse_u32_exact(second)?,
        match frac {
            Some(value) => parse_frac_millis(value)?,
            None => 0,
        },
    ))
}

fn parse_frac_millis(frac: &str) -> Option<u32> {
    let mut digits = String::new();
    for ch in frac.chars() {
        if !ch.is_ascii_digit() {
            return None;
        }
        if digits.len() < 3 {
            digits.push(ch);
        }
    }
    if digits.is_empty() {
        return None;
    }
    while digits.len() < 3 {
        digits.push('0');
    }
    parse_u32_exact(&digits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct Fixture {
        canonicalize: Vec<CanonCase>,
        canonicalize_seconds: Vec<CanonCase>,
        format: Vec<FormatCase>,
    }

    #[derive(serde::Deserialize)]
    struct CanonCase {
        input: String,
        #[serde(default)]
        expect: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FormatCase {
        year: u32,
        month: u32,
        day: u32,
        hour: u32,
        minute: u32,
        second: u32,
        millis: u32,
        #[serde(default)]
        expect: Option<String>,
    }

    #[test]
    fn shared_fixture() {
        let fixture: Fixture =
            serde_json::from_str(include_str!("../testdata/datetime.json")).expect("fixture");
        for (i, case) in fixture.canonicalize.iter().enumerate() {
            assert_eq!(
                canonicalize_datetime(&case.input),
                case.expect,
                "canonicalize {i} {}",
                case.input
            );
        }
        for (i, case) in fixture.canonicalize_seconds.iter().enumerate() {
            assert_eq!(
                canonicalize_datetime_seconds(&case.input),
                case.expect,
                "canonicalize_seconds {i} {}",
                case.input
            );
            if let Some(text) = &case.expect {
                assert_eq!(text.len(), DATETIME_SECONDS_LEN);
            }
        }
        for (i, case) in fixture.format.iter().enumerate() {
            assert_eq!(
                format_datetime(
                    case.year,
                    case.month,
                    case.day,
                    case.hour,
                    case.minute,
                    case.second,
                    case.millis
                ),
                case.expect,
                "format {i}"
            );
            if let Some(text) = &case.expect {
                assert_eq!(text.len(), DATETIME_DISPLAY_LEN);
            }
        }
    }
}
