//! 投屏协议与编码参数（纯函数；无 IO）。

use yohu_protocol::{
    default_mirror_max_fps, default_mirror_max_size, default_mirror_video_bit_rate,
    default_wifi_mirror_max_fps, default_wifi_mirror_max_size, default_wifi_mirror_video_bit_rate,
    AppSettings, MirrorProtocol,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MirrorEncodeParams {
    pub max_size: u32,
    pub video_bit_rate: u32,
    pub max_fps: u32,
    pub video_codec: &'static str,
}

pub const USB_ENCODE: MirrorEncodeParams = MirrorEncodeParams {
    max_size: default_mirror_max_size(),
    video_bit_rate: default_mirror_video_bit_rate(),
    max_fps: default_mirror_max_fps(),
    video_codec: "h265",
};

pub const WIFI_ENCODE: MirrorEncodeParams = MirrorEncodeParams {
    max_size: default_wifi_mirror_max_size(),
    video_bit_rate: default_wifi_mirror_video_bit_rate(),
    max_fps: default_wifi_mirror_max_fps(),
    video_codec: "h264",
};

pub fn params_of(protocol: MirrorProtocol) -> MirrorEncodeParams {
    match protocol {
        MirrorProtocol::Usb => USB_ENCODE,
        MirrorProtocol::Wifi => WIFI_ENCODE,
    }
}

pub fn apply_protocol(settings: &mut AppSettings, protocol: MirrorProtocol) {
    let params = params_of(protocol);
    settings.mirror_max_size = params.max_size;
    settings.mirror_video_bit_rate = params.video_bit_rate;
    settings.mirror_max_fps = params.max_fps;
    settings.mirror_protocol = protocol;
}

pub fn is_tcp_connection(connection: &str) -> bool {
    connection.starts_with("tcp:")
}

/// 本会话 start 用的编码参数。tcp 且未改质量时用无线协议参数，不写回设置。
pub fn start_encode(
    settings: &AppSettings,
    connection: &str,
    session_quality_touched: bool,
) -> MirrorEncodeParams {
    if is_tcp_connection(connection)
        && !session_quality_touched
        && settings.mirror_protocol != MirrorProtocol::Wifi
    {
        return WIFI_ENCODE;
    }
    let codec = if settings.mirror_protocol == MirrorProtocol::Wifi {
        WIFI_ENCODE.video_codec
    } else {
        USB_ENCODE.video_codec
    };
    MirrorEncodeParams {
        max_size: settings.mirror_max_size,
        video_bit_rate: settings.mirror_video_bit_rate,
        max_fps: settings.mirror_max_fps,
        video_codec: codec,
    }
}

pub fn start_force_forward(settings: &AppSettings, connection: &str) -> bool {
    settings.mirror_force_forward || is_tcp_connection(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_params_are_fixed() {
        assert_eq!(USB_ENCODE.max_size, default_mirror_max_size());
        assert_eq!(USB_ENCODE.video_bit_rate, default_mirror_video_bit_rate());
        assert_eq!(USB_ENCODE.max_fps, default_mirror_max_fps());
        assert_eq!(params_of(MirrorProtocol::Usb), USB_ENCODE);
        assert_eq!(params_of(MirrorProtocol::Wifi), WIFI_ENCODE);
        let table: serde_json::Value =
            serde_json::from_str(include_str!("../testdata/mirror_encode.json")).expect("fixture");
        for (name, params) in [("usb", USB_ENCODE), ("wifi", WIFI_ENCODE)] {
            let row = &table[name];
            assert_eq!(row["max_size"], params.max_size);
            assert_eq!(row["video_bit_rate"], params.video_bit_rate);
            assert_eq!(row["max_fps"], params.max_fps);
            assert_eq!(row["video_codec"], params.video_codec);
        }
    }

    #[test]
    fn tcp_uses_wifi_unless_session_touched() {
        #[derive(serde::Deserialize)]
        struct Case {
            connection: String,
            touched: bool,
            encode: String,
            force_forward: bool,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/mirror_start_encode.json"))
                .expect("fixture");
        let s = AppSettings::default();
        for (i, case) in cases.iter().enumerate() {
            let got = start_encode(&s, &case.connection, case.touched);
            match case.encode.as_str() {
                "usb" => assert_eq!(got, USB_ENCODE, "encode {i}"),
                "wifi" => assert_eq!(got, WIFI_ENCODE, "encode {i}"),
                "settings" => assert_eq!(got.max_size, s.mirror_max_size, "settings {i}"),
                other => panic!("unknown encode {other}"),
            }
            assert_eq!(
                start_force_forward(&s, &case.connection),
                case.force_forward,
                "forward {i}"
            );
        }
    }
}
