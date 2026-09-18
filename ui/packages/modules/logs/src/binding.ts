/**
 * 包名会话 PID 重绑。规则在 @yohu/api（镜像 yohu-domain::log_bind）。
 */

export {
  HISTORY_PID_CAP,
  copyBinding,
  emptyBinding,
  pidSetOf,
  rebindPids,
  type PidBinding,
} from "@yohu/api";
