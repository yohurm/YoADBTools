//! 默认命令库（首次启动/损坏重建时写入；纯代码构造，可单测）。

use yohu_protocol::CommandParamDto;

use super::{CommandDefinition, CommandGroup, CommandLibrary, LibraryEntry};

/// 产线常用默认命令库（schemaVersion 3）。新增命令不做成功/失败正则。
pub fn default_library() -> CommandLibrary {
    let g = |id: &str, name: &str, entries: Vec<LibraryEntry>| CommandGroup {
        id: id.into(),
        name: name.into(),
        entries,
    };

    let c = |id: &str, name: &str, template: &str, params: Vec<CommandParamDto>| {
        LibraryEntry::Command(CommandDefinition {
            id: id.into(),
            name: name.into(),
            template: template.into(),
            params,
        })
    };
    let p0 = |description: &str| {
        vec![CommandParamDto {
            index: 0,
            description: description.into(),
        }]
    };

    CommandLibrary {
        schema_version: CommandLibrary::SCHEMA_VERSION,
        groups: vec![
            g(
                "g-device",
                "设备信息",
                vec![
                    c("c-model", "型号", "shell getprop ro.product.model", vec![]),
                    c(
                        "c-version",
                        "Android 版本",
                        "shell getprop ro.build.version.release",
                        vec![],
                    ),
                    c("c-serial", "设备序列号", "shell getprop ro.serialno", vec![]),
                ],
            ),
            g(
                "g-power",
                "电源",
                vec![
                    c("c-battery", "电池状态", "shell dumpsys battery", vec![]),
                    c("c-wake", "点亮屏幕", "shell input keyevent 224", vec![]),
                    c("c-sleep", "熄灭屏幕", "shell input keyevent 223", vec![]),
                ],
            ),
            g(
                "g-connect",
                "连接性",
                vec![
                    c(
                        "c-wifi",
                        "WiFi 状态",
                        "shell dumpsys wifi | grep -E 'Wi-Fi is|mNetworkInfo'",
                        vec![],
                    ),
                    c("c-ping", "网络连通性（主机）", "shell ping -c 3 {0}", p0("主机")),
                    c("c-props", "查询属性", "shell getprop {0}", p0("属性名")),
                ],
            ),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_library_valid() {
        let lib = default_library();
        assert!(lib.validate().is_ok());
        assert_eq!(lib.groups.len(), 3);
        assert_eq!(
            lib.groups.iter().map(|g| g.entries.len()).sum::<usize>(),
            9
        );
    }

    #[test]
    fn placeholder_commands_keep_arity() {
        let lib = default_library();
        let ping = lib.command("c-ping").expect("c-ping 存在");
        assert_eq!(ping.placeholder_arity(), 1);
        let props = lib.command("c-props").expect("c-props 存在");
        assert_eq!(props.placeholder_arity(), 1);
        let model = lib.command("c-model").expect("c-model 存在");
        assert_eq!(model.placeholder_arity(), 0);
    }
}
