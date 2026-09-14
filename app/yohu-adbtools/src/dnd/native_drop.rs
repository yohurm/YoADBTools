//! wry 拖入：物理点收成 CSS 点后发出 `window/drag`。不是 AppEvent。

use serde::Serialize;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager};

pub fn css_point(physical_x: f64, physical_y: f64, scale: f64) -> (f64, f64) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    (physical_x / scale, physical_y / scale)
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum NativeDrag {
    Enter { paths: Vec<String>, x: f64, y: f64 },
    Over { x: f64, y: f64 },
    Drop { paths: Vec<String>, x: f64, y: f64 },
    Leave,
}

fn path_strings(paths: &[std::path::PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// 把 wry `DragDrop` 收成单一 CSS DTO 再交给现有 `window/drag` 事件。
pub fn emit_native_drag(app: &AppHandle, label: &str, event: &DragDropEvent) {
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let payload = match event {
        DragDropEvent::Enter { paths, position } => {
            let (x, y) = css_point(position.x, position.y, scale);
            NativeDrag::Enter {
                paths: path_strings(paths),
                x,
                y,
            }
        }
        DragDropEvent::Over { position } => {
            let (x, y) = css_point(position.x, position.y, scale);
            NativeDrag::Over { x, y }
        }
        DragDropEvent::Drop { paths, position } => {
            let (x, y) = css_point(position.x, position.y, scale);
            NativeDrag::Drop {
                paths: path_strings(paths),
                x,
                y,
            }
        }
        DragDropEvent::Leave => NativeDrag::Leave,
        _ => return,
    };
    if let Err(e) = app.emit(yohu_protocol::event_names::WINDOW_DRAG, &payload) {
        tracing::warn!(error = %e, "window/drag emit 失败");
    }
}

#[cfg(test)]
mod tests {
    use super::css_point;

    #[test]
    fn css_point_divides_by_scale() {
        assert_eq!(css_point(200.0, 100.0, 2.0), (100.0, 50.0));
        assert_eq!(css_point(10.0, 20.0, 0.0), (10.0, 20.0));
    }
}
