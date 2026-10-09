import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

function production(): string {
  return readdirSync(root)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => readFileSync(join(root, name), "utf8"))
    .join("\n");
}

/** 旧写法只留在未导出函数体里那一次。针在本文件拆开，避免测试源码自己凑成整句。 */
function expectOnce(needle: string, name: string): void {
  const src = production();
  expect(src.split(needle).length - 1).toBe(1);
  const declared = src.includes(`function ${name}(`) || src.includes(`const ${name} =`);
  expect(declared, name).toBe(true);
  expect(src).not.toContain(`export function ${name}`);
  expect(src).not.toContain(`export const ${name}`);
}

describe("清单失败位写成真", () => {
  it("mark_list_fault_once", () => {
    expectOnce("setSession(" + '"listFault", true)', "markListFault");
  });
});

describe("清单失败位写成假", () => {
  it("clear_list_fault_once", () => {
    expectOnce("setSession(" + '"listFault", false)', "clearListFault");
  });
});

describe("冷启动旗写成假", () => {
  it("mark_warm_once", () => {
    expectOnce("setSession(" + '"cold", false)', "markWarm");
  });
});

describe("冷启动旗写成真", () => {
  it("mark_cold_once", () => {
    expectOnce("setSession(" + '"cold", true)', "markCold");
  });
});

describe("清单加载写成停", () => {
  it("mark_idle_once", () => {
    expectOnce("setSession(" + '"loading", false)', "markIdle");
  });
});

describe("清单加载写成开", () => {
  it("mark_busy_once", () => {
    expectOnce("setSession(" + '"loading", true)', "markBusy");
  });
});

describe("清单行清空", () => {
  it("clear_entries_once", () => {
    expectOnce("setEntries(" + "[])", "clearEntries");
  });
});

describe("浏览会话世代加一", () => {
  it("bump_session_gen_once", () => {
    expectOnce("sessionGen " + "+= 1", "bumpSessionGen");
  });
});

describe("清单世代加一", () => {
  it("bump_list_gen_once", () => {
    expectOnce("listGen " + "+= 1", "bumpListGen");
  });
});

describe("浏览世代清成没有", () => {
  it("clear_core_generation_once", () => {
    expectOnce("coreGeneration " + "= 0", "clearCoreGeneration");
  });
});

describe("浏览会话世代过期", () => {
  it("session_gen_stale_once", () => {
    expectOnce("gen " + "!== sessionGen", "sessionGenStale");
  });
});

describe("清单世代过期", () => {
  it("list_gen_stale_once", () => {
    expectOnce("gen " + "!== listGen", "listGenStale");
  });
});

describe("目录快照清空", () => {
  it("clear_dir_cache_once", () => {
    expectOnce("dirCache." + "clear()", "clearDirCache");
  });
});

describe("清单读取已选序列号", () => {
  it("picked_serial_once", () => {
    expectOnce("selectedSerial(" + "serial())", "pickedSerial");
  });
});

describe("视图卸下", () => {
  it("mark_view_detached_once", () => {
    expectOnce("viewAttached " + "= false", "markViewDetached");
  });
});

describe("视图挂上", () => {
  it("mark_view_attached_once", () => {
    expectOnce("viewAttached " + "= true", "markViewAttached");
  });
});

describe("地址改到目标路径", () => {
  it("show_target_path_once", () => {
    expectOnce('setSession("path", ' + "target)", "showTargetPath");
  });
});

describe("当前路径下的子项", () => {
  it("child_at_once", () => {
    expectOnce("childPath(session.path, " + "name)", "childAt");
  });
});

describe("排序后的清单写回", () => {
  it("show_entries_once", () => {
    expectOnce("setEntries(" + "next)", "showEntries");
  });
});

describe("传输刷新计时槽清空", () => {
  it("forget_transfer_timer_once", () => {
    expectOnce("transferListTimer " + "= undefined", "forgetTransferTimer");
  });
});

describe("画出缓存快照", () => {
  it("paint_cached_once", () => {
    expectOnce("paintSnapshot(" + "cached)", "paintCached");
  });
});

describe("读出会话世代", () => {
  it("read_session_gen_once", () => {
    expectOnce("const gen = " + "sessionGen", "readSessionGen");
  });
});

describe("读出浏览世代", () => {
  it("read_core_generation_once", () => {
    expectOnce("const prevGen = " + "coreGeneration", "readCoreGeneration");
  });
});

describe("清掉清单错误", () => {
  it("clear_listed_error_once", () => {
    expectOnce("notifyError(" + '""' + ")", "clearListedError");
  });
});

describe("当前选中名", () => {
  it("selection_names_once", () => {
    expectOnce("listingStore.selection" + ".names", "selectionNames");
  });
});

describe("子路径被拒绝", () => {
  it("child_path_rejected_once", () => {
    expectOnce("!" + "child.ok", "childPathRejected");
  });
});

describe("没有选中序列号", () => {
  it("pick_rejected_once", () => {
    expectOnce("!" + "picked.ok", "pickRejected");
  });
});

describe("传输读取已选序列号", () => {
  it("picked_transfer_serial_once", () => {
    expectOnce("selectedSerial(listingStore." + "serial())", "pickedTransferSerial");
  });
});

describe("清掉已排的淡出", () => {
  it("clear_scheduled_fade_once", () => {
    expectOnce("if (prev " + "!== undefined) window.clearTimeout(prev)", "clearScheduledFade");
    expectOnce("fadeTimers." + "get(", "clearScheduledFade");
  });
});

describe("作业标成已关掉", () => {
  it("mark_dismissed_once", () => {
    expectOnce("dismissed." + "add(", "markDismissed");
  });
});

describe("忘掉淡出计时", () => {
  it("forget_fade_once", () => {
    expectOnce("fadeTimers." + "delete(", "forgetFade");
  });
});

describe("忘掉速度采样", () => {
  it("forget_speed_once", () => {
    expectOnce("speedBase." + "delete(", "forgetSpeed");
  });
});

describe("从传输列表拿掉作业", () => {
  it("drop_transfer_once", () => {
    expectOnce("setTransfers((ts) => " + "ts.filter(", "dropTransfer");
  });
});

describe("作业仍在传输", () => {
  it("running_job_once", () => {
    expectOnce("current && " + "transferIsRunning(current.state)", "runningJob");
  });
});

describe("拖放目录名清掉", () => {
  it("clear_drop_dir_once", () => {
    expectOnce("setSession((prev) => dropSessionWithDir(prev, " + "null))", "clearDropDir");
  });
});

describe("清单命中盒", () => {
  it("list_hit_space_once", () => {
    expectOnce("readListHitSpace(list, controlRowHeight(), " + "host.listOffset())", "listHitSpace");
  });
});

describe("投放帧号空闲", () => {
  it("dest_frame_idle_once", () => {
    expectOnce("destFrame " + "=== 0", "destFrameIdle");
  });
});

describe("投放帧号清零", () => {
  it("clear_dest_frame_once", () => {
    expectOnce("destFrame " + "= 0", "clearDestFrame");
  });
});

describe("拖放条目", () => {
  it("drop_entries_once", () => {
    expectOnce("host." + "entries()", "dropEntries");
  });
});

describe("拖放清单元素", () => {
  it("current_list_once", () => {
    expectOnce("host." + "listEl()", "currentList");
  });
});

describe("页上绑定的序列号", () => {
  it("focused_serial_once", () => {
    expectOnce("boundSerial(props." + "selectedSerials)", "focusedSerial");
  });
});

describe("唯一选中文件", () => {
  it("single_listed_file_once", () => {
    expectOnce("listingStore." + "singleFile()", "singleListedFile");
  });
});

describe("预览是否开着", () => {
  it("preview_shown_once", () => {
    expectOnce("listingStore.ui." + "previewOpen", "previewShown");
  });
});

describe("开始下载", () => {
  it("start_download_once", () => {
    expectOnce("void " + "onDownload()", "startDownload");
  });
});

describe("失败句弹错误", () => {
  it("show_failure_once", () => {
    expectOnce('toaster.show(failure, ' + '"error")', "showFailure");
  });
});

describe("本机路径没有", () => {
  it("host_path_absent_once", () => {
    expectOnce("!" + "path", "hostPathAbsent");
  });
});

describe("取消浏览器默认", () => {
  it("cancel_native_once", () => {
    expectOnce("event." + "preventDefault()", "cancelNative");
  });
});

describe("在指针处打开菜单", () => {
  it("open_menu_at_once", () => {
    expectOnce("props.onContextMenu(event.clientX, " + "event.clientY)", "openMenuAt");
  });
});

describe("新建错误清掉", () => {
  it("clear_create_error_once", () => {
    expectOnce("setCreateError(" + '""' + ")", "clearCreateError");
  });
});

describe("新建窗关掉", () => {
  it("close_create_once", () => {
    expectOnce("setCreateOpen(" + "false)", "closeCreate");
  });
});

describe("删除名单收起", () => {
  it("collapse_delete_once", () => {
    expectOnce("setDeleteExpanded(" + "false)", "collapseDelete");
  });
});

describe("删除窗关掉", () => {
  it("close_delete_once", () => {
    expectOnce("setDeleteOpen(" + "false)", "closeDelete");
  });
});

describe("删除芯片", () => {
  it("delete_chip_once", () => {
    expectOnce("<DeleteChip name={name} " + "onRemove={props.onRemove} />", "deleteChip");
  });
});

describe("关掉传输提示", () => {
  it("dismiss_toast_once", () => {
    expectOnce("props.toaster." + "dismiss(toastId)", "dismissToast");
  });
});

describe("传输完成是成功色", () => {
  it("success_when_done_once", () => {
    expectOnce('if (transferIsDone(state)) return ' + '"success"', "successWhenDone");
  });
});
