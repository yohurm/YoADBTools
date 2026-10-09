import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(path);
  }
  return out;
}

function production(): string {
  return productionFiles(root)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function times(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

/** 旧写法只留在未导出函数体里那一次。针在本文件拆开，避免测试源码自己凑成整句。 */
function expectOnce(needle: string, name: string): void {
  const src = production();
  expect(times(src, needle), needle).toBe(1);
  expect(times(src, "function " + name)).toBe(1);
  expect(times(src, "export function " + name)).toBe(0);
}

/**
 * 返回值函数的 times("fn()") 含声明行里的 fn()。
 * calls 是这个口径下的次数。引用绑定不带括号，不记进 calls。
 */
function expectCalls(name: string, calls: number): void {
  expect(times(production(), name + "()"), name).toBe(calls);
}

describe("立即生效文案", () => {
  it("徽章和语气比较共用这一句，保存提示不并", () => {
    expectOnce('"' + "立即" + "生效" + '"', "immediateCopy");
    expectCalls("immediateCopy", 16);
    expect(times(production(), '"' + "已保存（立即" + "生效）" + '"')).toBe(1);
  });
});

describe("已保存立即生效", () => {
  it("保存提示只留在函数体，徽章文案不并", () => {
    expectOnce('"' + "已保存（立即" + "生效）" + '"', "savedNow");
    expectCalls("savedNow", 15);
  });
});

describe("浏览动作", () => {
  it("三处浏览钮共用文案，打开不并", () => {
    expectOnce('"' + "浏" + "览" + '"', "browseAction");
    expectCalls("browseAction", 4);
    expect(production()).toContain('"' + "打" + "开" + '"');
  });
});

describe("设置面板溢出", () => {
  it("七张表面都可见溢出，不改成 ops", () => {
    expectOnce('"' + "visible" + '"', "panelOverflow");
    expectCalls("panelOverflow", 8);
    expect(production()).not.toContain('role="' + "ops" + '"');
  });
});

describe("路径与开关同句", () => {
  it("标题和无障碍名各收成一句", () => {
    expectOnce('"' + "ADB " + "路径" + '"', "adbPathCopy");
    expectCalls("adbPathCopy", 3);
    expectOnce('"' + "数据" + "目录" + '"', "dataRootCopy");
    expectCalls("dataRootCopy", 3);
    expectOnce('"' + "设备自动" + "刷新" + '"', "autoRefreshCopy");
    expectCalls("autoRefreshCopy", 3);
    expectOnce('"' + "输入命令默认加上 " + "adb" + '"', "prependAdbCopy");
    expectCalls("prependAdbCopy", 3);
    expectOnce('"' + "拖入时指向" + "文件夹" + '"', "dropFolderCopy");
    expectCalls("dropFolderCopy", 3);
    expectOnce('"' + "缓冲最大" + "行数" + '"', "bufferRowsCopy");
    expectCalls("bufferRowsCopy", 3);
    expectOnce('"' + "开始采集前清空设备缓冲（" + "logcat -c）" + '"', "clearLogCopy");
    expectCalls("clearLogCopy", 3);
    expectOnce('"' + "默认导出" + "路径" + '"', "exportPathCopy");
    expectCalls("exportPathCopy", 3);
    expectOnce('"' + "每次导出询问" + "保存位置" + '"', "askExportCopy");
    expectCalls("askExportCopy", 3);
    expectOnce('"' + "应用" + "日志" + '"', "appLogsCopy");
    expectCalls("appLogsCopy", 3);
  });
});

describe("时钟格式值", () => {
  it("两份顺序表共用四个值，标签不并", () => {
    expectOnce('"' + "time_" + "millis" + '"', "timeMillisValue");
    expectCalls("timeMillisValue", 3);
    expectOnce('return "' + "time" + '"', "timeValue");
    expectCalls("timeValue", 3);
    expectOnce('"' + "datetime_" + "millis" + '"', "dateTimeMillisValue");
    expectCalls("dateTimeMillisValue", 3);
    expectOnce('return "' + "datetime" + '"', "dateTimeValue");
    expectCalls("dateTimeValue", 3);
  });
});

describe("命令库展开", () => {
  it("快照只读一次", () => {
    expectOnce("settingsStore.state." + "terminal_library_expand", "libraryExpand");
    expectCalls("libraryExpand", 5);
  });
});

describe("日志列与检查更新", () => {
  it("列快照、检查中和关于图标各读一次", () => {
    expectOnce("settingsStore.state." + "log_display_columns", "logColumns");
    expectCalls("logColumns", 3);
    expectOnce("updateStore." + "checking()", "updateChecking");
    expectCalls("updateChecking", 3);
    expectOnce("Layout." + "TitlebarCaption", "aboutIconSize");
    expectCalls("aboutIconSize", 3);
  });
});

describe("普通钮样式", () => {
  it("普通样式只写一次，强调和中性不并", () => {
    expectOnce('return "' + "normal" + '"', "normalStyle");
    expectCalls("normalStyle", 8);
  });
});

describe("中性语气", () => {
  it("中性语气只写一次，强调不并", () => {
    expectOnce('return "' + "neutral" + '"', "neutralTone");
    expectCalls("neutralTone", 8);
  });
});

describe("强调语气", () => {
  it("强调语气只写一次，中性不并", () => {
    expectOnce('return "' + "accent" + '"', "accentTone");
    expectCalls("accentTone", 5);
  });
});

describe("小号尺寸", () => {
  it("小号只写一次", () => {
    expectOnce('return "' + "sm" + '"', "smSize");
    expectCalls("smSize", 5);
  });
});

describe("错误语气", () => {
  it("提示错误语气只写一次，窗口 error 事件不并", () => {
    expectOnce('return "' + "error" + '"', "errorTone");
    expectCalls("errorTone", 3);
    expect(production()).toContain('listen(window, "' + "error" + '"');
  });
});

describe("成功语气", () => {
  it("保存成功语气只写一次，在线状态点不并", () => {
    expectOnce('return "' + "success" + '"', "successTone");
    expectCalls("successTone", 2);
    expect(production()).toContain('"' + "success" + '" : "' + "offline" + '"');
  });
});

describe("失败提示与保存失败", () => {
  it("错误提示走语气函数，保存失败包装只写一次", () => {
    expectOnce("toaster.show(text, " + "settingsStore.errorTone())", "showFailure");
    expectOnce("toaster.show(text, " + "successTone())", "showSuccess");
    expectOnce("saveFailedText(deviceStore." + "caughtText(e))", "showSaveFailed");
    expect(times(production(), "showSaveFailed")).toBe(3);
  });
});

describe("产品显示名", () => {
  it("标题栏、状态栏和关于页读同一份，加载回填不并", () => {
    expectOnce("return identity." + "display_name", "displayName");
    expectCalls("displayName", 4);
    expectOnce("info.identity." + "display_name", "reportedName");
    expect(times(production(), "reportedName(")).toBe(2);
  });
});

describe("本机是 macOS", () => {
  it("标题栏和安装文案读同一判断，windows 不并", () => {
    expectOnce("hostOsIsMacos(" + "os())", "macosHost");
    expectCalls("macosHost", 5);
    expect(production()).toContain("hostOsIsWindows(" + "os())");
  });
});

describe("应用日志目录", () => {
  it("打开和路径槽读同一目录", () => {
    expectOnce("paths." + "logs_dir", "logsDirectory");
    expectCalls("logsDirectory", 4);
  });
});

describe("异常句子", () => {
  it("errorText(e) 只写一次，hint 不并", () => {
    expectOnce("return error" + "Text(e)", "caughtText");
    expect(times(production(), "caughtText(e)")).toBe(6);
    expect(production()).toContain("errorText(" + "hintErr)");
  });
});

describe("String 异常", () => {
  it("设置日志和揭窗失败都收成字符串", () => {
    expectOnce("return String(" + "e)", "errorDetail");
    expect(times(production(), "errorDetail(e)")).toBe(3);
  });
});

describe("壳日志频道", () => {
  it("壳日志都走同一频道", () => {
    expectOnce('return "' + "shell" + '"', "shellChannel");
    expectCalls("shellChannel", 6);
  });
});

describe("设置日志频道", () => {
  it("设置日志都走同一频道，三句文案不并", () => {
    expectOnce('return "' + "settings" + '"', "settingsChannel");
    expectCalls("settingsChannel", 4);
  });
});

describe("设备日志频道", () => {
  it("设备日志都走同一频道", () => {
    expectOnce('return "' + "device" + '"', "deviceChannel");
    expectCalls("deviceChannel", 7);
  });
});

describe("目录台数", () => {
  it("长度只写一次，空目录和一台不并", () => {
    expectOnce("return devices." + "length", "listedCount");
    expect(times(production(), "listedCount(")).toBe(5);
    expect(times(production(), "listedCount(devices) " + "=== 0")).toBe(1);
    expect(times(production(), "count " + "=== 1")).toBe(1);
  });
});

describe("目录序列号", () => {
  it("日志里的序列号列表只拼一次", () => {
    expectOnce("devices.map((d) => " + "d.serial)", "listedSerials");
    expect(times(production(), "listedSerials(")).toBe(4);
  });
});

describe("设备目录", () => {
  it("目录数组只读一次", () => {
    expectOnce("return state." + "devices", "catalog");
    expectCalls("catalog", 10);
  });
});

describe("焦点序列号", () => {
  it("焦点只读一次，写成空和写成某台不并", () => {
    expectOnce("return state." + "focusSerial", "focus");
    expectCalls("focus", 8);
  });
});

describe("顺手刷新", () => {
  it("不等待的刷新只写一次，await 的 refresh 不并", () => {
    expectOnce("void " + "refresh()", "refreshNow");
    expectCalls("refreshNow", 2);
    expect(times(production(), "{deviceStore." + "refreshNow}")).toBe(2);
  });
});

describe("勾选表", () => {
  it("模块勾选表只读一次", () => {
    expectOnce("return state." + "selectedByModule", "selectionMap");
    expect(times(production(), "selectionMap(")).toBe(3);
  });
});

describe("扫描错误", () => {
  it("最近错误只读一次", () => {
    expectOnce("deviceStore.state." + "lastError", "scanError");
    expectCalls("scanError", 3);
  });
});

describe("行序列号", () => {
  it("这一行的序列号只读一次", () => {
    expectOnce("return device." + "serial", "rowSerial");
    expect(times(production(), "rowSerial(")).toBe(4);
  });
});

describe("行状态", () => {
  it("这一行的状态只读一次，在线和未授权不并", () => {
    expectOnce("return device." + "state", "rowState");
    expect(times(production(), "rowState(")).toBe(2);
  });
});

describe("栏模块与模式", () => {
  it("模块 id 和选择模式各读一次", () => {
    expectOnce("return props." + "moduleId", "moduleId");
    expectCalls("moduleId", 3);
    expectOnce("return props." + "selectionMode", "mode");
    expectCalls("mode", 4);
  });
});

describe("内联轴", () => {
  it("两槽都是内联轴", () => {
    expectOnce('return "' + "inline" + '"', "inlineAxis");
    expectCalls("inlineAxis", 3);
  });
});

describe("活动模块", () => {
  it("当前模块 id 只读一次", () => {
    expectOnce("navStore." + "activeModuleId()", "activeModule");
    expectCalls("activeModule", 4);
  });
});

describe("窗漆", () => {
  it("主题钮和侧栏钮都是窗漆", () => {
    expectOnce('return "' + "window" + '"', "windowPaint");
    expectCalls("windowPaint", 3);
  });
});

describe("侧栏展开", () => {
  it("标题和展开属性读同一判断", () => {
    expectOnce("railIntentIsExpanded(" + "railIntent())", "railExpanded");
    expectCalls("railExpanded", 3);
  });
});

describe("打开闸门", () => {
  it("闸门写成开只写一次，写成关不并", () => {
    expectOnce("setGate(" + "true)", "openGate");
    expectCalls("openGate", 3);
    expect(times(production(), "setGate(" + "false)")).toBe(1);
  });
});

describe("进来的模块", () => {
  it("当前模块属性只读一次", () => {
    expectOnce("return props." + "current", "incoming");
    expectCalls("incoming", 4);
  });
});

describe("导航条目", () => {
  it("两份名单共用同一条目，系统区文案不并", () => {
    expectOnce("activeId={props." + "activeId}", "navEntry");
    expect(times(production(), "{nav" + "Entry}")).toBe(2);
    expectOnce('return "' + "yohu-nav__" + 'list"', "navListClass");
    expectCalls("navListClass", 3);
  });
});

describe("模块标题", () => {
  it("标题只读一次，开发中后缀不并", () => {
    expectOnce("return mod." + "title", "moduleTitle");
    expect(times(production(), "moduleTitle(")).toBe(4);
  });
});

describe("打开导航项", () => {
  it("按键和点击都打开这一项，阻止默认不并", () => {
    expectOnce("props.onNavigate(" + "itemId())", "openItem");
    expect(times(production(), "onClick={" + "openItem}")).toBe(1);
    expectOnce("return props.mod." + "id", "itemId");
    expect(times(production(), "itemId(")).toBe(3);
  });
});

describe("图标提示", () => {
  it("标签和前置都问同一旗", () => {
    expectOnce("return props." + "iconTip", "showIconTip");
    expectCalls("showIconTip", 3);
  });
});

describe("间隔点", () => {
  it("三处提示都用间隔点拼接", () => {
    expectOnce('parts.join("' + " · " + '")', "joinDot");
    expect(times(production(), "joinDot(")).toBe(4);
  });
});

describe("没有运行时状态", () => {
  it("缺状态和空串各写一次", () => {
    expectOnce("return " + "!status", "statusAbsent");
    expect(times(production(), "statusAbsent(")).toBe(3);
    expectOnce('return "' + '"', "blankStatus");
    expectCalls("blankStatus", 3);
  });
});

describe("空白零件", () => {
  it("两处零件表从空数组开始，带名字的那份不并", () => {
    expectOnce("return " + "[]", "blankParts");
    expectCalls("blankParts", 3);
  });
});

describe("电量夜览亮屏", () => {
  it("三个字段各读一次，息屏和亮屏不并", () => {
    expectOnce("return status." + "battery_pct", "batteryPct");
    expect(times(production(), "batteryPct(")).toBe(2);
    expectOnce("return status." + "night", "nightValue");
    expect(times(production(), "nightValue(")).toBe(2);
    expectOnce("return status." + "screen_on", "screenOn");
    expect(times(production(), "screenOn(")).toBe(3);
    expect(production()).toContain("=== " + "false");
    expect(production()).toContain("=== " + "true");
  });
});

describe("抛出的错误", () => {
  it("事件上的错误和栈各读一次", () => {
    expectOnce("return e." + "error", "thrown");
    expect(times(production(), "thrown(")).toBe(2);
    expectOnce("return error." + "stack", "stackOf");
    expect(times(production(), "stackOf(")).toBe(2);
  });
});

describe("描述符 id", () => {
  it("重复注册的 id 只读一次", () => {
    expectOnce("return descriptor." + "id", "descriptorId");
    expect(times(production(), "descriptorId(")).toBe(2);
  });
});

describe("系统信息回填", () => {
  it("adb 路径和设置快照各读一次", () => {
    expectOnce("return info." + "adb_path", "reportedAdb");
    expect(times(production(), "reportedAdb(")).toBe(2);
    expectOnce("return info." + "settings", "reportedSettings");
    expect(times(production(), "reportedSettings(")).toBe(2);
  });
});

describe("等待运行时状态", () => {
  it("两处等待走同一等待，事件里的 void 不并", () => {
    expectOnce("await " + "pullStatuses()", "awaitStatuses");
    expectCalls("awaitStatuses", 3);
    expect(times(production(), "void " + "pullStatuses()")).toBe(1);
  });
});

describe("现在时刻", () => {
  it("扫描计时只读这一处时钟", () => {
    expectOnce("return performance." + "now()", "nowMs");
    expectCalls("nowMs", 3);
  });
});

describe("在线台数", () => {
  it("在线台数只读一次，无在线文案不并", () => {
    expectOnce("return online." + "length", "onlineCount");
    expect(times(production(), "onlineCount(")).toBe(3);
  });
});

describe("状态序列号", () => {
  it("运行时状态的序列号只读一次", () => {
    expectOnce("return status." + "serial", "statusSerial");
    expect(times(production(), "statusSerial(")).toBe(3);
  });
});

describe("加减选", () => {
  it("是否加减选只读一次", () => {
    expectOnce("return opts?." + "additive", "additivePick");
    expect(times(production(), "additivePick(")).toBe(3);
  });
});

describe("同步最大化", () => {
  it("挂上和尺寸变化都不等待同步，切换最大化的 await 不并", () => {
    expectOnce("void " + "syncMaximized()", "syncNow");
    expectCalls("syncNow", 2);
    expect(times(production(), "listenWindowResize(" + "syncNow)")).toBe(1);
    expect(times(production(), "await " + "syncMaximized()")).toBe(1);
  });
});

describe("阶段空闲字", () => {
  it("存储里的空闲只写一次，阶段比较不并", () => {
    expectOnce('return "' + "idle" + '"', "idlePhase");
    expectCalls("idlePhase", 3);
    expect(production()).toContain('phase === "' + "idle" + '"');
  });
});

describe("进入下载", () => {
  it("下载阶段只跟进度事件，点击不预写", () => {
    expectOnce('setPhase("' + "downloading" + '")', "markDownloading");
    expectCalls("markDownloading", 2);
    expect(production()).toContain("updateStageIsTransfer(e.stage)");
  });
});

describe("进入就绪", () => {
  it("本机阶段写成就绪只写一次", () => {
    expectOnce('setPhase("' + "ready" + '")', "markReady");
    expectCalls("markReady", 3);
  });
});

describe("进入安装", () => {
  it("本机阶段写成安装只写一次", () => {
    expectOnce('setPhase("' + "applying" + '")', "markApplying");
    expectCalls("markApplying", 3);
  });
});

describe("关掉更新窗", () => {
  it("开关写成关只写一次，写成开不并", () => {
    expectOnce("setDialogOpen(" + "false)", "hideDialog");
    expectCalls("hideDialog", 3);
    expect(times(production(), "setDialogOpen(" + "true)")).toBe(1);
  });
});

describe("清掉下载等待", () => {
  it("等待槽写成空只写一次。读等待四次：声明、失败进度、就绪进度、下载入口防重入，点击不预写下载中", () => {
    expectOnce("downloadWaiter " + "= null", "clearWaiter");
    expectCalls("clearWaiter", 5);
    expectOnce("return " + "downloadWaiter", "readWaiter");
    expectCalls("readWaiter", 4);
  });
});

describe("正在安装与正在下载", () => {
  it("关窗两处各问各的阶段，快照 current 不并", () => {
    expectOnce("updatePhaseIsApplying(" + "phase())", "applyingNow");
    expectCalls("applyingNow", 3);
    expectOnce("updatePhaseIsDownloading(" + "phase())", "downloadingNow");
    expectCalls("downloadingNow", 3);
    expect(production()).toContain("updatePhaseIsApplying(" + "current)");
  });
});

describe("取消传输", () => {
  it("取消下载只写一次", () => {
    expectOnce("void " + "updateCancel()", "cancelTransfer");
    expectCalls("cancelTransfer", 3);
  });
});

describe("当前要约", () => {
  it("待装更新只读一次", () => {
    expectOnce("return " + "pending()", "currentOffer");
    expectCalls("currentOffer", 4);
  });
});

describe("要约版本与大小", () => {
  it("版本和字节各两次：声明与下载参数，点击不预写下载中", () => {
    expectOnce("return update." + "version", "offerVersion");
    expect(times(production(), "offerVersion(")).toBe(2);
    expectOnce("return update." + "size_bytes", "offerSize");
    expect(times(production(), "offerSize(")).toBe(2);
  });
});

describe("事件安装包路径", () => {
  it("进度事件上的路径只读一次", () => {
    expectOnce("return e." + "installer_path", "eventInstaller");
    expect(times(production(), "eventInstaller(")).toBe(4);
  });
});

describe("进度阶段", () => {
  it("正在安装和失败各判一次", () => {
    expectOnce("updateStageIsApplying(" + "e.stage)", "stageApplying");
    expect(times(production(), "stageApplying(")).toBe(4);
    expectOnce("updateStageIsFailed(" + "e.stage)", "stageFailed");
    expect(times(production(), "stageFailed(")).toBe(3);
  });
});

describe("参数非法", () => {
  it("非法参数码只写一次，两句提示不并", () => {
    expectOnce('code: "' + "invalid_args" + '"', "invalidArgs");
    expect(times(production(), "invalidArgs(")).toBe(3);
    expect(production()).toContain('"' + "没有可下载的" + "安装包" + '"');
    expect(production()).toContain('"' + "没有可安装的" + "安装包" + '"');
  });
});

describe("待装更新", () => {
  it("对话框里的待装更新只读一次，版本和说明不并", () => {
    expectOnce("return updateStore." + "pending()", "pendingUpdate");
    expectCalls("pendingUpdate", 5);
    expectOnce("pendingUpdate()?" + ".version", "pendingVersion");
    expectCalls("pendingVersion", 5);
    expectOnce("pendingUpdate()?" + ".installer_name", "pendingInstallerName");
    expectCalls("pendingInstallerName", 3);
    expectOnce("pendingUpdate()?" + ".description", "pendingDescription");
    expectCalls("pendingDescription", 3);
  });
});

describe("更新阶段与开关", () => {
  it("阶段和对话框开关各读一次", () => {
    expectOnce("return updateStore." + "phase()", "currentPhase");
    expectCalls("currentPhase", 5);
    expectOnce("return updateStore." + "dialogOpen()", "dialogShown");
    expectCalls("dialogShown", 4);
  });
});

describe("更新框失败", () => {
  it("三处失败都交给同一提示，设置页 toaster 不并", () => {
    expectOnce("props.show(deviceStore.caughtText(e), " + "settingsStore.errorTone())", "showCaught");
    expect(times(production(), "showCaught(e)")).toBe(3);
  });
});

describe("更新进度样式", () => {
  it("进度句和元信息类名各写一次", () => {
    expectOnce('"' + "yohu-settings__update-" + 'progress-text"', "progressTextClass");
    expectCalls("progressTextClass", 3);
    expectOnce('"' + "yohu-settings__update-" + 'meta"', "updateMetaClass");
    expectCalls("updateMetaClass", 3);
  });
});
