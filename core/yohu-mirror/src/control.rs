//! 控制消息序列化与控制通道写入。

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use yohu_protocol::scrcpy;
use yohu_protocol::MirrorControlMessage;

use crate::consts::CONTROL_WRITE;
use crate::error::MirrorError;

pub enum ControlCmd {
    Send(Vec<u8>),
    Close,
}

/// 把语义控制消息编成 server 可读的字节。
pub fn encode(message: &MirrorControlMessage) -> Vec<u8> {
    match message {
        MirrorControlMessage::Touch {
            action,
            x,
            y,
            width,
            height,
        } => encode_touch(*action, *x, *y, *width, *height),
        MirrorControlMessage::Key { keycode, down } => encode_key(
            if *down {
                scrcpy::ACTION_DOWN
            } else {
                scrcpy::ACTION_UP
            },
            *keycode,
        ),
        MirrorControlMessage::DisplayPower { on } => {
            vec![scrcpy::CTRL_SET_DISPLAY_POWER, u8::from(*on)]
        }
        MirrorControlMessage::BackOrScreenOn => {
            let mut bytes = encode_back_or_screen_on(scrcpy::ACTION_DOWN);
            bytes.extend_from_slice(&encode_back_or_screen_on(scrcpy::ACTION_UP));
            bytes
        }
        MirrorControlMessage::ExpandNotification => vec![scrcpy::CTRL_EXPAND_NOTIFICATION],
        MirrorControlMessage::ExpandSettings => vec![scrcpy::CTRL_EXPAND_SETTINGS],
        MirrorControlMessage::CollapsePanels => vec![scrcpy::CTRL_COLLAPSE_PANELS],
        MirrorControlMessage::RotateDevice => vec![scrcpy::CTRL_ROTATE_DEVICE],
    }
}

fn encode_key(action: u8, keycode: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + 1 + 12);
    out.push(scrcpy::CTRL_INJECT_KEYCODE);
    out.push(action);
    out.extend_from_slice(&(keycode as i32).to_be_bytes());
    out.extend_from_slice(&0i32.to_be_bytes());
    out.extend_from_slice(&0i32.to_be_bytes());
    out
}

fn encode_touch(action: u8, x: u32, y: u32, width: u16, height: u16) -> Vec<u8> {
    let pressure: u16 = if action == scrcpy::ACTION_UP {
        0
    } else {
        scrcpy::TOUCH_PRESSURE_MAX
    };
    let (action_button, buttons) = if action == scrcpy::ACTION_UP {
        (0i32, 0i32)
    } else {
        (scrcpy::BUTTON_PRIMARY, scrcpy::BUTTON_PRIMARY)
    };
    let mut out = Vec::with_capacity(32);
    out.push(scrcpy::CTRL_INJECT_TOUCH);
    out.push(action);
    out.extend_from_slice(&scrcpy::POINTER_ID_MOUSE.to_be_bytes());
    out.extend_from_slice(&(x as i32).to_be_bytes());
    out.extend_from_slice(&(y as i32).to_be_bytes());
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
    out.extend_from_slice(&pressure.to_be_bytes());
    out.extend_from_slice(&action_button.to_be_bytes());
    out.extend_from_slice(&buttons.to_be_bytes());
    out
}

fn encode_back_or_screen_on(action: u8) -> Vec<u8> {
    vec![scrcpy::CTRL_BACK_OR_SCREEN_ON, action]
}

pub async fn write_all(
    stream: &mut (impl AsyncWriteExt + Unpin),
    bytes: &[u8],
    cancel: &CancellationToken,
) -> Result<(), MirrorError> {
    let write = stream.write_all(bytes);
    tokio::pin!(write);
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        _ = tokio::time::sleep(CONTROL_WRITE) => {
            Err(MirrorError::Protocol("控制通道写入超时".into()))
        }
        res = &mut write => {
            res?;
            Ok(())
        }
    }
}

pub async fn write_display_power(
    stream: &mut TcpStream,
    on: bool,
    cancel: &CancellationToken,
) -> Result<(), MirrorError> {
    let bytes = encode(&MirrorControlMessage::DisplayPower { on });
    write_all(stream, &bytes, cancel).await
}

pub async fn drain_control_reads(mut stream: OwnedReadHalf, cancel: CancellationToken) {
    let mut buf = [0u8; 256];
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            r = stream.read(&mut buf) => {
                if r.ok().filter(|n| *n > 0).is_none() {
                    break;
                }
            }
        }
    }
}

pub async fn drive_writes(
    mut stream: OwnedWriteHalf,
    mut rx: mpsc::Receiver<ControlCmd>,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            cmd = rx.recv() => {
                match cmd {
                    Some(ControlCmd::Send(bytes)) => {
                        if write_all(&mut stream, &bytes, &cancel).await.is_err() {
                            break;
                        }
                    }
                    Some(ControlCmd::Close) | None => break,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_power_on_is_type_10_true() {
        let bytes = encode(&MirrorControlMessage::DisplayPower { on: true });
        assert_eq!(bytes, vec![scrcpy::CTRL_SET_DISPLAY_POWER, 1]);
    }

    #[test]
    fn key_down_home_be() {
        let bytes = encode(&MirrorControlMessage::Key {
            keycode: 3,
            down: true,
        });
        assert_eq!(bytes[0], scrcpy::CTRL_INJECT_KEYCODE);
        assert_eq!(bytes[1], scrcpy::ACTION_DOWN);
        assert_eq!(&bytes[2..6], &3i32.to_be_bytes());
        assert_eq!(bytes.len(), 14);
    }

    #[test]
    fn touch_down_layout() {
        let bytes = encode(&MirrorControlMessage::Touch {
            action: scrcpy::ACTION_DOWN,
            x: 10,
            y: 20,
            width: 1080,
            height: 1920,
        });
        assert_eq!(bytes[0], scrcpy::CTRL_INJECT_TOUCH);
        assert_eq!(bytes[1], scrcpy::ACTION_DOWN);
        assert_eq!(&bytes[2..10], &scrcpy::POINTER_ID_MOUSE.to_be_bytes());
        assert_eq!(&bytes[10..14], &10i32.to_be_bytes());
        assert_eq!(&bytes[14..18], &20i32.to_be_bytes());
        assert_eq!(&bytes[18..20], &1080u16.to_be_bytes());
        assert_eq!(&bytes[20..22], &1920u16.to_be_bytes());
        assert_eq!(&bytes[22..24], &scrcpy::TOUCH_PRESSURE_MAX.to_be_bytes());
    }

    #[test]
    fn empty_commands_are_single_byte() {
        assert_eq!(
            encode(&MirrorControlMessage::ExpandNotification),
            vec![scrcpy::CTRL_EXPAND_NOTIFICATION]
        );
        assert_eq!(
            encode(&MirrorControlMessage::RotateDevice),
            vec![scrcpy::CTRL_ROTATE_DEVICE]
        );
    }
}
