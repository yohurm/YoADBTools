//! `pm list packages` / `cmd package list packages` 输出解析。

/// 解析已安装包名列表。
///
/// 行形如：`package:com.example.app`；`-f` 形如 `package:/data/app/foo.apk=com.example.app`。
/// 去空白、去重、按字典序。无法识别的行跳过。
pub fn parse_pm_list_packages(output: &str) -> Vec<String> {
    let mut names: Vec<String> = output.lines().filter_map(parse_package_line).collect();
    names.sort();
    names.dedup();
    names
}

fn parse_package_line(line: &str) -> Option<String> {
    let line = line.trim();
    let rest = line.strip_prefix("package:")?;
    let name = rest
        .rsplit_once('=')
        .map(|(_, name)| name)
        .unwrap_or(rest)
        .split_whitespace()
        .next()?
        .trim();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
package:com.android.systemui
package:com.example.app
package:com.android.systemui
package:com.idle.app
";

    #[test]
    fn parses_dedupes_and_sorts() {
        let names = parse_pm_list_packages(SAMPLE);
        assert_eq!(
            names,
            vec!["com.android.systemui", "com.example.app", "com.idle.app",]
        );
    }

    #[test]
    fn parses_path_equals_form_and_uid_suffix() {
        let out = "\
package:/data/app/~~x/base.apk=com.foo
package:com.bar uid:10001
";
        assert_eq!(parse_pm_list_packages(out), vec!["com.bar", "com.foo"]);
    }

    #[test]
    fn skips_noise() {
        assert!(parse_pm_list_packages("Error: no such command\n\n").is_empty());
    }
}
