//! 投屏指针：离开占用面即抬起，避免设备停在按下。

pub const TOUCH_DOWN: u8 = 0;
pub const TOUCH_UP: u8 = 1;
pub const TOUCH_MOVE: u8 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointerKind {
    Down,
    Move,
    Up,
    Leave,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TouchOut {
    pub action: u8,
    pub x: u32,
    pub y: u32,
    pub width: u16,
    pub height: u16,
}

#[derive(Debug, Default)]
pub struct PointerGesture {
    pressing: bool,
    last: Option<(u32, u32, u16, u16)>,
}

impl PointerGesture {
    pub fn pressing(&self) -> bool {
        self.pressing
    }

    pub fn feed(
        &mut self,
        kind: PointerKind,
        mapped: Option<(u32, u32)>,
        video_w: u32,
        video_h: u32,
    ) -> Option<TouchOut> {
        let size = (video_w as u16, video_h as u16);
        match kind {
            PointerKind::Down => {
                let (x, y) = mapped?;
                self.pressing = true;
                self.last = Some((x, y, size.0, size.1));
                Some(TouchOut {
                    action: TOUCH_DOWN,
                    x,
                    y,
                    width: size.0,
                    height: size.1,
                })
            }
            PointerKind::Move => {
                if !self.pressing {
                    return None;
                }
                match mapped {
                    Some((x, y)) => {
                        self.last = Some((x, y, size.0, size.1));
                        Some(TouchOut {
                            action: TOUCH_MOVE,
                            x,
                            y,
                            width: size.0,
                            height: size.1,
                        })
                    }
                    None => self.end(),
                }
            }
            PointerKind::Up => self.end_at(mapped, size),
            PointerKind::Leave => self.end(),
        }
    }

    pub fn cancel(&mut self) -> Option<TouchOut> {
        self.end()
    }

    fn end_at(&mut self, mapped: Option<(u32, u32)>, size: (u16, u16)) -> Option<TouchOut> {
        if !self.pressing {
            return None;
        }
        let (x, y, width, height) = match mapped {
            Some((x, y)) => (x, y, size.0, size.1),
            None => self.last?,
        };
        self.pressing = false;
        self.last = None;
        Some(TouchOut {
            action: TOUCH_UP,
            x,
            y,
            width,
            height,
        })
    }

    fn end(&mut self) -> Option<TouchOut> {
        if !self.pressing {
            return None;
        }
        let (x, y, width, height) = self.last?;
        self.pressing = false;
        self.last = None;
        Some(TouchOut {
            action: TOUCH_UP,
            x,
            y,
            width,
            height,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn down(g: &mut PointerGesture) -> TouchOut {
        g.feed(PointerKind::Down, Some((10, 20)), 100, 200)
            .expect("down")
    }

    #[test]
    fn down_move_up_inside() {
        let mut g = PointerGesture::default();
        assert_eq!(down(&mut g).action, TOUCH_DOWN);
        let mv = g
            .feed(PointerKind::Move, Some((11, 21)), 100, 200)
            .expect("move");
        assert_eq!(
            mv,
            TouchOut {
                action: TOUCH_MOVE,
                x: 11,
                y: 21,
                width: 100,
                height: 200,
            }
        );
        let up = g
            .feed(PointerKind::Up, Some((12, 22)), 100, 200)
            .expect("up");
        assert_eq!(up.action, TOUCH_UP);
        assert_eq!((up.x, up.y), (12, 22));
        assert!(!g.pressing());
    }

    #[test]
    fn leave_occupancy_while_pressing_sends_up_at_last() {
        let mut g = PointerGesture::default();
        down(&mut g);
        g.feed(PointerKind::Move, Some((40, 50)), 100, 200);
        let up = g
            .feed(PointerKind::Move, None, 100, 200)
            .expect("leave via unmapped move");
        assert_eq!(
            up,
            TouchOut {
                action: TOUCH_UP,
                x: 40,
                y: 50,
                width: 100,
                height: 200,
            }
        );
        assert!(!g.pressing());
        assert!(g.feed(PointerKind::Move, None, 100, 200).is_none());
    }

    #[test]
    fn explicit_leave_ends_press() {
        let mut g = PointerGesture::default();
        down(&mut g);
        let up = g.feed(PointerKind::Leave, None, 0, 0).expect("leave");
        assert_eq!(up.action, TOUCH_UP);
        assert_eq!((up.x, up.y), (10, 20));
        assert!(!g.pressing());
    }

    #[test]
    fn up_outside_still_releases_last() {
        let mut g = PointerGesture::default();
        down(&mut g);
        let up = g.feed(PointerKind::Up, None, 100, 200).expect("up outside");
        assert_eq!(up.action, TOUCH_UP);
        assert_eq!((up.x, up.y), (10, 20));
    }

    #[test]
    fn down_outside_is_ignored() {
        let mut g = PointerGesture::default();
        assert!(g.feed(PointerKind::Down, None, 100, 200).is_none());
        assert!(!g.pressing());
    }

    #[test]
    fn move_without_press_is_ignored() {
        let mut g = PointerGesture::default();
        assert!(g.feed(PointerKind::Move, Some((1, 1)), 100, 200).is_none());
    }

    #[test]
    fn cancel_while_pressing_sends_up() {
        let mut g = PointerGesture::default();
        down(&mut g);
        assert_eq!(g.cancel().map(|t| t.action), Some(TOUCH_UP));
        assert!(g.cancel().is_none());
    }
}
