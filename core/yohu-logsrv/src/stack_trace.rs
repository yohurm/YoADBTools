//! 对照 AS `StackTraceExpander`：展开 logcat 正文里的 `... N more` 折叠栈帧。

const EXPANDED_STACK_TRACE_MARKER: char = '\u{00A0}';

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

    fn reset(&mut self) {
        self.in_trace = false;
        self.stack1.clear();
        self.stack2.clear();
    }
}

pub(crate) fn expand_stack_trace_lines(lines: &[String]) -> Vec<String> {
    let mut ctx = Context::new();
    let mut out = Vec::new();
    for line in lines {
        out.extend(process_line(&mut ctx, line));
    }
    out
}

fn process_line(ctx: &mut Context, line: &str) -> Vec<String> {
    if is_frame_line(line) {
        ctx.in_trace = true;
        ctx.current_stack().push(line.to_string());
        return vec![line.to_string()];
    }
    if !ctx.in_trace {
        return vec![line.to_string()];
    }
    if is_cause_line(line) {
        ctx.swap_stacks();
        return vec![line.to_string()];
    }
    if let Some(count) = elided_count(line) {
        return handle_elided(ctx, line, count);
    }
    ctx.reset();
    vec![line.to_string()]
}

fn is_frame_line(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with("at ") && t.contains('(') && t.ends_with(')')
}

fn is_cause_line(line: &str) -> bool {
    line.trim_start().starts_with("Caused by:")
}

fn elided_count(line: &str) -> Option<usize> {
    let t = line.trim();
    let rest = t.strip_prefix("... ")?.strip_suffix(" more")?;
    let n: usize = rest.parse().ok()?;
    (n > 0).then_some(n)
}

fn handle_elided(ctx: &mut Context, line: &str, elided_count: usize) -> Vec<String> {
    let previous = ctx.previous_stack().clone();
    let start = previous.len().saturating_sub(elided_count);
    if start + elided_count <= previous.len() {
        let mut lines = Vec::with_capacity(elided_count);
        for frame in &previous[start..start + elided_count] {
            let expanded = format!("{frame}{EXPANDED_STACK_TRACE_MARKER}");
            ctx.current_stack().push(frame.clone());
            lines.push(expanded);
        }
        lines
    } else {
        vec![line.to_string()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_elided_frames_from_outer_stack() {
        let input = vec![
            "at com.foo.A.method(A.java:1)".into(),
            "at com.foo.B.method(B.java:2)".into(),
            "... 1 more".into(),
        ];
        let out = expand_stack_trace_lines(&input);
        assert_eq!(out.len(), 3);
        assert!(out[2].ends_with(EXPANDED_STACK_TRACE_MARKER));
        assert!(out[2].starts_with("at com.foo.A"));
    }

    #[test]
    fn plain_lines_pass_through() {
        let input = vec!["hello".into(), "world".into()];
        assert_eq!(expand_stack_trace_lines(&input), input);
    }
}
