//! 呈现线程：Cmd → Stage / DecodeBind；NSView 只在主线程碰。

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::super::backend::Cmd;
use super::decode::DecodeBind;
use super::host::Host;
use super::view;

const PRESENT_IDLE: Duration = Duration::from_millis(4);

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
) -> Sender<Cmd> {
    let (tx, rx) = mpsc::channel::<Cmd>();
    std::thread::Builder::new()
        .name(format!("mirror-present-{serial}"))
        .spawn(move || {
            if let Err(e) = run_loop(serial, owner, mirror, event_tx, rx) {
                tracing::error!("投屏呈现退出: {e}");
            }
        })
        .expect("spawn present thread");
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
        match rx.recv_timeout(PRESENT_IDLE) {
            Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(cmd) => {
                dispatch(&host, cmd, &mut decode);
                need_sync = true;
            }
            Err(RecvTimeoutError::Timeout) => {}
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
        if beat.elapsed() >= Duration::from_secs(1) {
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
            let mut h = host.lock().expect("present lock poisoned");
            h.apply_layout(&layout);
        }
        Cmd::BindPipe {
            serial,
            generation,
            pipe,
        } => {
            host.lock()
                .expect("present lock poisoned")
                .bind(serial, generation);
            *decode = Some(DecodeBind::new(pipe));
        }
        Cmd::UnbindPipe { serial } => {
            if host.lock().expect("present lock poisoned").unbind(&serial) {
                *decode = None;
            }
        }
        Cmd::Screenshot { path, reply } => {
            let result = host
                .lock()
                .expect("present lock poisoned")
                .screenshot(&path);
            let _ = reply.send(result);
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
        match rx.try_recv() {
            Ok(Cmd::Shutdown) | Err(TryRecvError::Disconnected) => return false,
            Err(TryRecvError::Empty) => return true,
            Ok(cmd) => dispatch(host, cmd, decode),
        }
    }
}

fn tick_decode(host: &Arc<Mutex<Host>>, bind: &mut DecodeBind) -> bool {
    let frames = bind.pull();
    if frames.is_empty() {
        return false;
    }
    if let Some(frame) = frames.iter().find(|f| f.width > 0 && f.height > 0) {
        host.lock()
            .expect("present lock poisoned")
            .adopt_encoded_size(frame.width, frame.height);
    }
    let Some(pic) = bind.tick.ingest(frames) else {
        return true;
    };
    bind.tick.note_first(pic.width, pic.height);
    let image = pic.retain_image();
    let shown = host
        .lock()
        .expect("present lock poisoned")
        .present_picture(pic);
    if shown {
        view::present_pixel(image);
    }
    true
}

fn sync_view(host: &Arc<Mutex<Host>>) {
    let snap = host.lock().expect("present lock poisoned").layout_snap();
    view::apply_snap(snap);
}
