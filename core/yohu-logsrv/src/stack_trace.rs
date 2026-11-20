//! 对照 AS `StackTraceExpander`：展开 logcat 正文里的 `... N more` 折叠栈帧。
//!
//! ## 只做展开，不产出展示标记（P1）
//!
//! 展开出来的帧在界面上要标「这是补回来的」，但那是**展示层**关注点。
//! 早先的做法是给帧尾追加 `U+00A0`，那个标记随 `msg` 一起进环、进导出 txt、
//! 进剪贴板，还让 `message_contains` 在补出的帧上失配——展示关注点漏进了存储层。
//!
//! 因此本层只产出**纯帧文本**：折叠行被上一栈尾部的真实帧替代，文本与原始帧逐字相同。
//! 是否「补出来的」由界面按自己的规则判定（AS 的 `at … (…)` 形状是纯函数）。

struct Context {
    in_trace: bool,
    stack1_is_current: bool,
    stack1: Vec<String>,
    stack2: Vec<String>,
}

impl Context {
    fn new() -> Self {
        Self {
            in_trace: false,
            stack1_is_current: true,
            stack1: Vec::new(),
            stack2: Vec::new(),
        }
    }

    fn current_stack(&mut self) -> &mut Vec<String> {
        if self.stack1_is_current {
            &mut self.stack1
        } else {
            &mut self.stack2
        }
    }

    fn previous_stack(&mut self) -> &mut Vec<String> {
        if self.stack1_is_current {
            &mut self.stack2
        } else {
            &mut self.stack1
        }
    }

    fn swap_stacks(&mut self) {
        self.previous_stack().clear();
        self.stack1_is_current = !self.stack1_is_current;
    }

    /// 退出 trace：三态（在 trace / 哪个栈是当前 / 双栈内容）一起复位。
    /// 漏掉 `stack1_is_current` 会让「哪个栈是当前」跨 reset 残留。
    fn reset(&mut self) {
        self.in_trace = false;
        self.stack1_is_current = true;
        self.stack1.clear();
        self.stack2.clear();
        debug_assert!(self.stack1.is_empty() && self.stack2.is_empty());
        debug_assert!(self.stack1_is_current);
    }
}

/// 展开整段正文。返回的行是纯帧文本，不含任何展示字符。
pub(crate) fn expand_stack_trace_lines(lines: &[String]) -> Vec<String> {
    let mut ctx = Context::new();
    let mut out = Vec::with_capacity(lines.len());
    for line in lines {
        process_line(&mut ctx, line, &mut out);
    }
    out
}

fn process_line(ctx: &mut Context, line: &str, out: &mut Vec<String>) {
    if is_frame_line(line) {
        ctx.in_trace = true;
        ctx.current_stack().push(line.to_string());
        out.push(line.to_string());
        return;
    }
    if !ctx.in_trace {
        out.push(line.to_string());
        return;
    }
    if is_cause_line(line) {
        ctx.swap_stacks();
        out.push(line.to_string());
        return;
    }
    if let Some(count) = elided_count(line) {
        if handle_elided(ctx, count, out) {
            return;
        }
        // 越界（N > 上一栈长）：原样输出该行，不造帧
    }
    ctx.reset();
    out.push(line.to_string());
}

fn stack_prefix(line: &str) -> &str {
    line.trim_start()
}

fn is_frame_line(line: &str) -> bool {
    let t = stack_prefix(line);
    t.starts_with("at ") && t.contains('(') && t.ends_with(')')
}

fn is_cause_line(line: &str) -> bool {
    stack_prefix(line).starts_with("Caused by:")
}

fn elided_count(line: &str) -> Option<usize> {
    let t = line.trim();
    let rest = t.strip_prefix("... ")?.strip_suffix(" more")?;
    let n: usize = rest.parse().ok()?;
    (n > 0).then_some(n)
}

/// 从上一栈尾部补 `elided_count` 帧。越界返回 `false`（调用方原样输出该行）。
fn handle_elided(ctx: &mut Context, elided_count: usize, out: &mut Vec<String>) -> bool {
    let previous = ctx.previous_stack().clone();
    let start = previous.len().saturating_sub(elided_count);
    if start + elided_count > previous.len() {
        return false;
    }
    for frame in &previous[start..start + elided_count] {
        // 补出的帧与原始帧逐字相同：不加标记，正文因此可直接导出/复制/匹配
        ctx.current_stack().push(frame.clone());
        out.push(frame.clone());
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expand(lines: &[&str]) -> Vec<String> {
        let owned: Vec<String> = lines.iter().map(|line| (*line).to_string()).collect();
        expand_stack_trace_lines(&owned)
    }

    #[test]
    fn expands_elided_frames_from_outer_stack() {
        let out = expand(&[
            "at com.foo.A.method(A.java:1)",
            "Caused by: java.lang.IllegalStateException",
            "... 1 more",
        ]);
        assert_eq!(out.len(), 3, "折叠行被补出的帧替代");
        assert_eq!(out[2], "at com.foo.A.method(A.java:1)");
        assert_eq!(out[1], "Caused by: java.lang.IllegalStateException");
    }

    /// 正文里不得出现任何展示标记（NBSP 会污染导出/复制/关键字匹配）。
    #[test]
    fn expanded_frames_are_byte_identical_to_source_frames() {
        let out = expand(&[
            "at com.foo.A.method(A.java:1)",
            "Caused by: java.lang.IllegalStateException",
            "... 1 more",
        ]);
        for line in &out {
            assert!(!line.contains('\u{00A0}'), "NBSP 不得进入正文: {line:?}");
        }
        assert_eq!(
            out[2], out[0],
            "补出的帧必须与原始帧逐字相同（无标记差异）"
        );
    }

    #[test]
    fn plain_lines_pass_through() {
        let out = expand(&["hello", "world"]);
        assert_eq!(out, vec!["hello".to_string(), "world".to_string()]);
    }

    #[test]
    fn elided_beyond_previous_stack_stays_verbatim() {
        let out = expand(&[
            "at com.foo.A.method(A.java:1)",
            "Caused by: java.lang.IllegalStateException",
            "... 5 more",
        ]);
        assert_eq!(out[2], "... 5 more", "越界不造帧，原样输出");
    }

    /// `reset` 必须把「哪个栈是当前」一并复位：否则隐式状态跨 reset 残留。
    #[test]
    fn reset_restores_stack_orientation() {
        let mut ctx = Context::new();
        assert!(ctx.stack1_is_current);
        ctx.swap_stacks();
        assert!(!ctx.stack1_is_current, "交换后当前栈是 stack2");
        ctx.in_trace = true;
        ctx.current_stack().push("frame".into());

        ctx.reset();
        assert!(!ctx.in_trace);
        assert!(ctx.stack1_is_current, "reset 后必须回到 stack1 为当前");
        assert!(ctx.stack1.is_empty() && ctx.stack2.is_empty());

        // reset 之后新 trace 从 stack1 开始，不与残留状态混
        ctx.in_trace = true;
        ctx.current_stack().push("fresh".into());
        assert_eq!(ctx.stack1, vec!["fresh".to_string()]);
        assert!(ctx.stack2.is_empty());
    }

    /// 非 trace 行退出 trace 后，下一段 trace 重新从 stack1 起算。
    #[test]
    fn leaving_trace_resets_orientation_between_segments() {
        let out = expand(&[
            "at first.A(a:1)",
            "Caused by: X",
            "... 1 more",
            "plain line breaks the trace",
            "at second.B(b:2)",
            "Caused by: Y",
            "... 1 more",
        ]);
        assert_eq!(out[2], "at first.A(a:1)");
        assert_eq!(out[3], "plain line breaks the trace");
        assert_eq!(
            out[6], "at second.B(b:2)",
            "第二段 trace 的上一栈必须是它自己的栈，不是残留的第一段"
        );
    }
}
