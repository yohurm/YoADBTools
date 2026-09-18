//! 投屏 HWND 几何：铺满主窗客户区。占用卡片只由 DComp clip 裁。
//!
//! HWND 是主窗的 **WS_CHILD**。`CreateTargetForHwnd` 把合成树绑在这块稳定目标上；
//! 官方用 Visual Offset / RectangleClip，不靠每帧 `SetWindowPos` 跟 CSS 弹簧。
//! `CreateSwapChainForComposition` 强制 `DXGI_SCALING_STRETCH`：侧栏改 avail 时禁止改子窗尺寸。
//! 主窗改尺寸由 owner `WM_WINDOWPOSCHANGING` 跨线程 `SWP_ASYNCWINDOWPOS`。
//! 禁止 `SWP_NOCOPYBITS`。禁止持锁跨 `SetWindowPos`。

#![cfg(windows)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, SetWindowPos, ShowWindowAsync, HWND_TOP, SWP_ASYNCWINDOWPOS,
    SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOSIZE, SW_HIDE, WINDOWPOS, WM_NCDESTROY,
    WM_WINDOWPOSCHANGING,
};

use yohu_protocol::MIRROR_MIN_LAYOUT_PX;

const SUBCLASS_ID: usize = 0x594F4855;

#[derive(Clone, Copy)]
struct Slot {
    hwnd: isize,
    visible: bool,
    has_cur: bool,
    cur_w: u32,
    cur_h: u32,
}

struct Data {
    owner: isize,
    hooked: bool,
    slots: HashMap<String, Slot>,
}

pub struct GeomHost {
    inner: Mutex<Data>,
}

impl GeomHost {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Data {
                owner: 0,
                hooked: false,
                slots: HashMap::new(),
            }),
        })
    }

    pub fn set_owner(self: &Arc<Self>, hwnd: isize) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        if g.owner == hwnd && g.hooked {
            return;
        }
        if g.hooked && g.owner != 0 {
            unsafe {
                let _ =
                    RemoveWindowSubclass(HWND(g.owner as *mut _), Some(subclass_proc), SUBCLASS_ID);
            }
            g.hooked = false;
        }
        g.owner = hwnd;
        if hwnd == 0 {
            return;
        }
        let ok = unsafe {
            SetWindowSubclass(
                HWND(hwnd as *mut _),
                Some(subclass_proc),
                SUBCLASS_ID,
                Arc::as_ptr(self) as usize,
            )
        };
        g.hooked = ok.as_bool();
        if !g.hooked {
            tracing::error!("投屏几何：主窗 subclass 失败");
        }
    }

    pub fn register(&self, serial: &str, hwnd: isize) {
        self.inner
            .lock()
            .expect("geom lock poisoned")
            .slots
            .insert(serial.to_string(), Slot::new(hwnd));
    }

    pub fn unregister(&self, serial: &str) {
        self.inner
            .lock()
            .expect("geom lock poisoned")
            .slots
            .remove(serial);
    }

    pub fn set_visible(&self, serial: &str, visible: bool) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        let Some(slot) = g.slots.get_mut(serial) else {
            return;
        };
        slot.visible = visible;
    }

    /// 子窗铺满主窗客户区。调用方不得持 Host 锁。
    pub fn place_owned(&self, serial: &str) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        let owner = g.owner;
        let Some((cw, ch)) = client_size(owner) else {
            return;
        };
        let Some(mut slot) = g.slots.get(serial).copied() else {
            return;
        };
        let cmd = step_slot(&mut slot, cw, ch);
        g.slots.insert(serial.to_string(), slot);
        drop(g);
        if let Some(PlaceCmd::Pos { w, h, .. }) = cmd {
            tracing::info!(serial, w, h, "HWND 铺满主窗客户区");
        }
        apply_cmd(cmd, PlaceKind::Owned);
    }
}

impl Slot {
    fn new(hwnd: isize) -> Self {
        Self {
            hwnd,
            visible: false,
            has_cur: false,
            cur_w: 0,
            cur_h: 0,
        }
    }
}

fn client_size(owner: isize) -> Option<(u32, u32)> {
    if owner == 0 {
        return None;
    }
    unsafe {
        let mut cr = RECT::default();
        GetClientRect(HWND(owner as *mut _), &mut cr).ok()?;
        Some((
            (cr.right - cr.left).max(0) as u32,
            (cr.bottom - cr.top).max(0) as u32,
        ))
    }
}

fn predicted_client_size(owner: isize, wp: &WINDOWPOS) -> Option<(u32, u32)> {
    let (mut w, mut h) = client_size(owner)?;
    if wp.flags.contains(SWP_NOSIZE) {
        return Some((w, h));
    }
    unsafe {
        let mut wr = RECT::default();
        GetWindowRect(HWND(owner as *mut _), &mut wr).ok()?;
        w = (w as i32 + wp.cx - (wr.right - wr.left)).max(0) as u32;
        h = (h as i32 + wp.cy - (wr.bottom - wr.top)).max(0) as u32;
    }
    Some((w, h))
}

enum PlaceCmd {
    Hide(isize),
    Pos { hwnd: isize, w: u32, h: u32 },
}

#[derive(Clone, Copy)]
enum PlaceKind {
    Owned,
    CrossThread,
}

fn place_all(host: &GeomHost, client_w: u32, client_h: u32) {
    let mut g = host.inner.lock().expect("geom lock poisoned");
    let keys: Vec<String> = g.slots.keys().cloned().collect();
    let mut cmds = Vec::with_capacity(keys.len());
    let mut logs = Vec::new();
    for k in keys {
        let Some(mut slot) = g.slots.get(&k).copied() else {
            continue;
        };
        if let Some(cmd) = step_slot(&mut slot, client_w, client_h) {
            if let PlaceCmd::Pos { w, h, .. } = cmd {
                logs.push((k.clone(), w, h));
            }
            cmds.push(cmd);
        }
        g.slots.insert(k, slot);
    }
    drop(g);
    for (serial, w, h) in logs {
        tracing::info!(serial = %serial, w, h, "HWND 铺满主窗客户区");
    }
    for cmd in cmds {
        apply_cmd(Some(cmd), PlaceKind::CrossThread);
    }
}

fn target_size(slot: &Slot, client_w: u32, client_h: u32) -> Option<(u32, u32)> {
    if !slot.visible {
        return None;
    }
    if client_w < MIRROR_MIN_LAYOUT_PX || client_h < MIRROR_MIN_LAYOUT_PX {
        return None;
    }
    Some((client_w, client_h))
}

fn step_slot(slot: &mut Slot, client_w: u32, client_h: u32) -> Option<PlaceCmd> {
    if slot.hwnd == 0 {
        slot.has_cur = false;
        return None;
    }
    let hwnd = slot.hwnd;
    let Some((w, h)) = target_size(slot, client_w, client_h) else {
        slot.has_cur = false;
        return Some(PlaceCmd::Hide(hwnd));
    };
    let same = slot.has_cur && slot.cur_w == w && slot.cur_h == h;
    slot.has_cur = true;
    slot.cur_w = w;
    slot.cur_h = h;
    if same {
        None
    } else {
        Some(PlaceCmd::Pos { hwnd, w, h })
    }
}

fn apply_cmd(cmd: Option<PlaceCmd>, kind: PlaceKind) {
    match cmd {
        Some(PlaceCmd::Hide(hwnd)) => unsafe {
            let _ = ShowWindowAsync(HWND(hwnd as *mut _), SW_HIDE);
        },
        Some(PlaceCmd::Pos { hwnd, w, h }) => apply_pos(HWND(hwnd as *mut _), w, h, kind),
        None => {}
    }
}

fn apply_pos(hwnd: HWND, w: u32, h: u32, kind: PlaceKind) {
    let mut flags = SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    if matches!(kind, PlaceKind::CrossThread) {
        flags |= SWP_ASYNCWINDOWPOS;
    }
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, w as i32, h as i32, flags);
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    let host = unsafe { &*(data as *const GeomHost) };
    match msg {
        WM_WINDOWPOSCHANGING if lparam.0 != 0 => {
            let wp = unsafe { &*(lparam.0 as *const WINDOWPOS) };
            if !wp.flags.contains(SWP_NOSIZE) {
                if let Some((cw, ch)) = predicted_client_size(hwnd.0 as isize, wp) {
                    place_all(host, cw, ch);
                }
            }
        }
        WM_NCDESTROY => unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
        },
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}
