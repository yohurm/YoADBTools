/**
 * 日志 store 的唯一模型：窗口、设备桶、整棵 UI 状态。
 * 只放类型与窗口标题常量；不放任何读写逻辑。
 */

import type { LevelLetter, PidBinding, ProcessEntry } from "@yohu/api";

import { scopeBadge, type SessionScope } from "./filter";
import type { ViewRow } from "./stack";

/** 默认 System 窗口标题，也是全范围徽章文案。唯一来源。 */
export const SYSTEM_SESSION_TITLE = scopeBadge({ kind: "all" });

export interface LogSessionState {
  id: number;
  title: string;
  /** 窗口绑定的设备；空表示尚未选定 */
  serial: string | null;
  /** 本窗口是否在消费该设备的 logcat 扇出。写方唯一：capture-orchestrator。 */
  capturing: boolean;
  /** start IPC 进行中；空态/按钮不得再显示「未采集」。写方唯一：capture-orchestrator。 */
  starting: boolean;
  /** 本窗口起始序号；<0 表示从未开始，禁止从镜像补洞。写方唯一：follow-state。 */
  fromSeq: number;
  scope: SessionScope;
  /** 精确级别集合；空 = 不限。不是最低含以上。 */
  levels: LevelLetter[];
  tagContains: string;
  keyword: string;
  /**
   * 暂停：同时关闭「入文档」与「自动跟尾」，仍照常计命中与信号。
   * 视图只消费 `effectiveFollowing(...)`，不再自己组合布尔。
   */
  paused: boolean;
  /** 贴底跟滚；离开底部后冻结可见区，只累计 pendingCount。写方唯一：follow-state。 */
  following: boolean;
  /**
   * 离开底部时可见区末 seq；跟滚中为 null。冻结期间入镜上限就是它
   * （`panel.applyAppend` 消费），不跟当前（可能已筛窄的）末行走。
   */
  frozenThroughSeq: number | null;
  pendingCount: number;
  /** 当前可见面板上的信号行，由 visible 派生，禁止累计已裁掉的行 */
  signalCount: number;
  /** 视口窗口行（core 已过滤），上限 `WINDOW_MAX`（ADR-v6-050）；滚动比例来源是它的长度。 */
  visible: readonly ViewRow[];
  /** 从文档头裁掉的行数。视口用它把滚动偏移退回同样的行；整文档替换时归零。 */
  docShift: number;
  /** 本窗口见过的最大 seq。清空游标推过它。 */
  lastSeenSeq: number;
  binding: PidBinding;
  /**
   * 列宽覆盖（列键 → 字符宽）。会话级视图状态，随会话建销、天然隔离。
   * 用 string 键：store 不依赖 editor 的列键类型；具体列键由格式化层窄化。
   */
  colChars: Record<string, number>;
  /** 表头横滑偏移（px）。会话级视图状态，切 Tab 各自恢复。 */
  headShift: number;
}

/** 显示过滤补丁。暂停只走 setPaused。 */
export type SessionFilterPatch = Partial<
  Pick<LogSessionState, "levels" | "tagContains" | "keyword" | "scope">
>;

/** 每设备一份投影：世代 / 溢出 / 进程索引 / 已安装包名。窗口只引用 serial，不共用全局数组。 */
export interface DeviceUiState {
  generation: number;
  overflowed: boolean;
  processEntries: ProcessEntry[];
  indexDegraded: boolean;
  /** 已安装包名（新建窗口包名检索；与 ps 进程索引分离） */
  packages: string[];
  packagesDegraded: boolean;
}

export interface LogUiState {
  /** 左侧焦点：新建窗口的默认设备，不等于唯一采集设备 */
  serial: string | null;
  /** 按 serial 分桶的设备投影 */
  devices: Record<string, DeviceUiState>;
  sessions: LogSessionState[];
  activeSessionId: number | null;
  /** 设备环条数上限，也是窗口文档条数上限。 */
  bufferCapacity: number;
}
