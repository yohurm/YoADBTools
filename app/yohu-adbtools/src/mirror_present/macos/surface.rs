//! 呈现线程：Cmd → Stage / DecodeBind；NSView 只在主线程碰。

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::super::backend::{poll_ready, poll_timeout, Cmd, SurfacePoll};
use super::decode::DecodeBind;
use super::host::Host;
use super::view;

use crate::limits::{PRESENT_BEAT, PRESENT_IDLE};

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
) -> Sender<Cmd> {
    let (tx, rx) = mpsc::channel::<Cmd>();
    let name = crate::mirror_present::present_thread_name(&serial);
    crate::mirror_present::spawn_present_thread(name, move || {
        if let Err(e) = run_loop(serial, owner, mirror, event_tx, rx) {
            crate::mirror_present::present_beat::log_present_exit(&e);
        }
    });
    tx
}

fn run_loop(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    rx: Receiver<Cmd>,
) -> Result<(), String> {
    let host = Arc::new(Mutex::new(Host::new(serial, mirror, event_tx)));
    view::attach(owner, Arc::clone(&host));
    let mut decode: Option<DecodeBind> = None;
    let mut beat = Instant::now();
    let mut need_sync = true;
    loop {
        match poll_timeout(rx.recv_timeout(PRESENT_IDLE)) {
            SurfacePoll::Stop => break,
            SurfacePoll::Ready(cmd) => {
                dispatch(&host, cmd, &mut decode);
                need_sync = true;
            }
            SurfacePoll::Idle => {}
        }
        if !drain_cmds(&rx, &host, &mut decode) {
            break;
        }
        if let Some(bind) = decode.as_mut() {
            if tick_decode(&host, bind) {
                need_sync = true;
            }
        }
        if need_sync {
            sync_view(&host);
            need_sync = false;
        }
        if beat.elapsed() >= PRESENT_BEAT {
            if let Some(bind) = decode.as_mut() {
                bind.tick.log_beat();
            }
            beat = Instant::now();
        }
    }
    drop(decode);
    if let Ok(mut h) = host.lock() {
        h.end_press();
    }
    view::detach();
    Ok(())
}

fn dispatch(host: &Arc<Mutex<Host>>, cmd: Cmd, decode: &mut Option<DecodeBind>) {
    match cmd {
        Cmd::Layout(layout) => {
            let mut h = super::super::lock_present(host);
            h.apply_layout(&layout);
        }
        Cmd::BindPipe {
            serial,
            generation,
            pipe,
        } => {
            super::super::lock_present(host).bind(serial, generation);
            *decode = Some(DecodeBind::new(pipe));
        }
        Cmd::UnbindPipe { serial } => {
            if super::super::lock_present(host).unbind(&serial) {
                *decode = None;
            }
        }
        Cmd::AdoptContent { width, height } => {
            super::super::lock_present(host)
                .stage
                .adopt_encoded_size(width, height);
        }
        Cmd::Screenshot { path, reply } => {
            let result = super::super::lock_present(host).screenshot(&path);
            let _ = reply.send(result);
        }
        Cmd::Pointer { kind, x, y } => {
            super::super::lock_present(host).handle_wire_pointer(kind, x, y);
        }
        Cmd::Shutdown => {}
    }
}

fn drain_cmds(
    rx: &Receiver<Cmd>,
    host: &Arc<Mutex<Host>>,
    decode: &mut Option<DecodeBind>,
) -> bool {
    loop {
        match poll_ready(rx.try_recv()) {
            SurfacePoll::Stop => return false,
            SurfacePoll::Idle => return true,
            SurfacePoll::Ready(cmd) => dispatch(host, cmd, decode),
        }
    }
}

fn tick_decode(host: &Arc<Mutex<Host>>, bind: &mut DecodeBind) -> bool {
    let frames = bind.pipe.drain_ready();
    if frames.is_empty() {
        return false;
    }
    if let Some(frame) = frames.iter().find(|f| f.has_content_size()) {
        super::super::lock_present(host)
            .stage
            .adopt_encoded_size(frame.width, frame.height);
    }
    let Some(pic) = bind.tick.ingest(frames) else {
        return true;
    };
    bind.tick.note_first(pic.width, pic.height);
    let image = pic.retain_image();
    let shown = super::super::lock_present(host).present_picture(pic);
    if shown {
        view::present_pixel(image);
    }
    true
}

fn sync_view(host: &Arc<Mutex<Host>>) {
    let snap = super::super::lock_present(host).layout_snap();
    view::apply_snap(snap);
}
