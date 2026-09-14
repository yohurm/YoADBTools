/**
 * 命令库常量（与 yohu-protocol::library_dto 对齐）。
 */

/** 命令库 schema（与 yohu-protocol::COMMAND_LIBRARY_SCHEMA_VERSION 对齐）。 */
export const COMMAND_LIBRARY_SCHEMA_VERSION = 3;

/** 命令块可选间隔（毫秒；与 yohu-protocol::COMMAND_BLOCK_GAPS_MS 对齐）。 */
export const COMMAND_BLOCK_GAPS_MS = [0, 200, 500, 1000, 2000, 5000] as const;
