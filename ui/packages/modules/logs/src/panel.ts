/**
 * 窗口文档纯状态的公开门面：唯一实现已移入 `stream/log-window-reducer`。
 * 本文件只做转发，供模块内与测试沿用既有入口；禁止在此再写第二套实现或算法。
 */

export * from "./stream/log-window-reducer";
