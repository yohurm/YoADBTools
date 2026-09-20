# 模块：文件管理

- 能力 crate：`yohu-files`（browse / transfer / mutate）
- 安全根：`yohu-domain::SafetyRoot`（ADR-v6-013）；浏览 `check`；突变与传输 `check_descendant` + `validate_entry_name`；符号链接 `readlink -f` 复核（运输错误/无法解析失败；目标不存在则祖先 realpath）。`ReadlinkF` 从 `yohu-adb` 根导出，files 不点 `parse`。`FileError` 只分类+路径/计数/层数，不实现 `From<AdbError>`；未分类 BadExit 走 `RemoteFailed(path)`，Display 无 stderr。拖出树 `TreeLimit` / `TreeDepth` 触顶 fail-closed。变更超时在 `mutate.rs`
- UI：`@yohu/module-files`；`singleRequired`
- **路径槽：** `AddressSlot` 只接线。上级钮 + 公开 `YoAddressField`（`.yohu-address*`）。地址策略在 `@yohu/ui` `address-field-model`（由 `YoAddressField` 消费）；模块禁止再维护 `address-edit`，禁止再 import 交互函数。行铺满，盒外不是路径栏。浏览态：面包屑 + 短热区。点铬内热区 / 分隔符 / `Ctrl+L` 后输入同格从左向右揭开；打开手势 `pointerup` 后再 focus，光标在末尾、不预选；点分段跳转。收回只 clip 输入铬，时长只消费 `spatialLocal`，面包屑 `display: none` 不占位，播完再卸。输入盒 `field-sizing: content`，跟文字 hug；长路径 `max-width: 100%` 当铬视野。编辑盒铬走 `YoCorner`（描边 accent / 校验 error），禁止再 `border` + `overflow:hidden` 叠圆角，禁止套 `YoTextField`。取消只认输入铬外。禁止 JS 测宽。Enter 只交 `listingStore.goTo(原文)`（模块内唯一 `resolveRemotePath`：`path-parse` 句法、不折叠 `..` → `path-guard` → `files.list`）。面包屑 / 上级走 `navigate` / `goUp`（夹紧绝对段，不经 resolve）。`path-guard` 与 domain `testdata/safety_root.json` 同一向量（拒绝相对 / `..` / 根外）。解析/安全根失败或设备上不存在/不是目录/无权限：不改当前路径、不关输入，`YoToast` 提示（远端不存在为「没有这个目录，请重新输入」）。禁止路径栏上方错误卡片，禁止扫 `ls` stderr。分类在 core `FileError`；壳 `ipc_file`：`RemoteNotFound` → `not_found`，`LocalNotFound` 与其余路径类 → `invalid_args`。`SafetyRoot` 仍强制校验
- **清单列：** 文件走 Family B 列架：`YoColFrame` + `YoColRow` / `YoColHeader`、`cellPad=list`、`YoColTrack` / `YoColCell`、`YoVirtualList tone="list"`。投放目录热态走 `hotKey`：行底在 `list-row/`，投放框在 `list-frame/` 叠加层，禁止模块 `--drop` / `focus-ring`。行高走 `controlRowHeight()`（与日志同池：`Density.*.controlHeight`）。日志是 Family A 文档：表头同样走 `YoColFrame` / `YoColHeader`，但 `cellPad=none`、轨道是 Format `ch`；行是 Document.text，不走 `YoColTrack`。列宽走 `col-model` / `col-resize`，文件模块只 `setColWidth`，不进设置。排序走 `YoColHeader.onSort`，模块不自绘排序钮、不挂 `__label`。删除名单走 `YoChip` leading + onDismiss，禁止自造关闭钮。地址折叠在 `YoAddressField`；传输坞开合走 `YoCollapse`。禁止再自绘第二套路径栏或坞折叠。模块 CSS 禁止点 `.yohu-panel__body` / `__content` / `.yohu-scroller*` / `:has`，禁止 `overflow: auto` 当产品滚轴，禁止再铺 surface + radius 当面板铬
- **页眉：** `YoChrome.leading={<YoBadge text={selectedLabel} tone="neutral" />}`；功能栏 `actions[{key,node}]`（上传 / 下载 / 刷新 / 预览），进出走库 chip。禁止 `deviceLabel`，禁止模块自挂 Presence 补页眉。
- **修改时间：** `ls -lla`（toybox `-ll` = 秒+纳秒+时区）在解析边界经 domain `canonicalize_datetime_seconds` 收到 `YYYY-MM-DD HH:mm:ss`。列表与预览按原文显示，不补毫秒、不把「只有时分」补成秒
- **传输作业：** [文件传输-v6.md](../文件传输-v6.md)。四个入口同一 `TransferJob`；DropSession 热态（官方拖入 enter 即亮虚线）；默认进当前目录，`files_drop_into_folder`（立即，默认关，无副标题）才指向目录行；浏览在 `listing.ts`，作业寿命在 `transfers.ts`；清单只经 `listingStore.requestListing`；传输终态只点名 `requestListing("transfer")`；坞是 `TransferDock`。禁止 `fileStore` 别名
- 拖出协议细节：[文件拖拽-v6.md](../文件拖拽-v6.md) + ADR-v6-018。空态/加载走 `YoEmptyState` / `YoLoading` 的 `fill`；拖入虚线走清单 `YoPanel edge="drop"`（填充盒外一圈 YoCorner halo，不是面板描边），禁止 CSS `outline` 直角环，禁止模块再写 `--drop` 补丁，禁止点库根 `.yohu-empty-state` / `.yohu-loading` / `.yohu-panel`
- 右键：`files/src/menu.ts` → `openContextMenu`

### 设计前（清单 / 错误）

```text
files.list 失败
  → FileError（core 已分类 + 路径；不带 ls stderr）
  → ipc_file：RemoteNotFound | LocalNotFound → not_found
  → UI classifyRemoteStderr 扫「No such file / 不是目录 / permission…」
  → not_found 再 includes("本地") 才放过
  → isCancelledError / isNotFoundError 扫 cancel / 取消 / 不存在

FileTable itemHeight = 28（写死，不跟密度）
AddressSlot clip 时长 = spatialLocal + 50
DeleteTargets 自绘 chip + 绝对定位关闭钮
path-guard 只做前缀 startsWith，放过 /sdcard/../data
```

问题：UI 把 `NotADirectory` 收成「没有这个目录」；本地不存在与远端不存在同码，不得不扫文案；行高/clip/关闭钮各写一套。

### 设计后（清单 / 错误 / 图标尺寸）

```text
AddressSlot Enter → listingStore.goTo(原文)
  → path-resolve（唯一）→ invoke files.list
  → commands/files require_online + 转发
  → browse_runs::list（替换取消槽，后一次取消前一次）
  → FileBrowser.list（SafetyRoot + ls）
  → FileError Display（分类 + 路径）
  → ipc_file：
        RemoteNotFound → not_found
        LocalNotFound / NotADirectory / PermissionDenied / ReadOnly /
        AlreadyExists / Path / OutsideRoot / EmptyTree / TreeLimit / TreeDepth → invalid_args
        RemoteFailed / Local → adb_error
        Adb → ipc_adb（cancelled / device_offline / …）
  → fault.ts（只读 ipcErrorCode + message）：
        filesFaultText
          not_found → 「没有这个目录，请重新输入」
          其余已分类 → Display 原文
        isCancelledError / isNotFoundError 只认 code
  → model.ts 只管路径 / 列 / ListingEntry（SAFETY_ROOTS 契约常量）
        parentWithinSafety → parentOf + path-guard.isWithinSafety
        禁止再导出 errorText，禁止第二套 startsWith
        表不持 RemoteEntry；listingEntryFromWire 丢掉 link_target，mtime 缺省 ""

图标尺寸（模块只消费 Layout，禁止写死 px）：
  FileTable / DeleteTargets YoFileIcon → Layout.IconSm（16）
  PreviewPane YoPanel overflow=hidden + YoScroller；图标 Layout.IconPreview（48）
  Layout.IconPreview
    → emit-theme.ts
    → --yohu-layout-icon-preview
    → theme.css（与 emitThemeCss() 字节一致）
```

清单：`YoVirtualList itemHeight={controlRowHeight()}`（自己滚，禁止再外包 `YoScroller`）。地址铬 clip 只消费 `spatialLocal`。删除名单 `YoChip` leading=`YoFileIcon` + `block` + `onDismiss`（16vp 正圆关闭贴盒尾）。确认框 `YoDialog initial="footer"`，`open` 独立于名单（`deleteOpen`）；关只翻 open，`onExitComplete` 再清名单/展开。确认文案走 `bodyLead`（居中），名单走 children（调用方组合 `YoScroller`），展开/收起走 `bodyTail`；`YoReveal` 只进视口。操作区取消=`buttonStyle=normal`+accent、删除=`buttonStyle=normal`+danger（AlertDialog NORMAL：`--yohu-comp-gray` + 语义字），双钮铺满。新建文件/目录表单同样走 children + `YoScroller`（`YoTextField` + 错误 `YoCorner`）。`bodyOverflow=auto` 只裁切、不 `overflow-y: auto`；模块 CSS 禁止再用 `overflow: auto` / `overflow-y: auto` 当产品滚轴。`YoVirtualList` 宿主同样 `overflow: hidden`。传输坞 `TransferDock` 禁止再套 `YoScroller`，列表高度走 Collapse + `--yohu-layout-output-max`。入场焦点走 `initial=footer`，禁止 Chip 代写 `data-dialog-skip`。预览格与其余格是兄弟；其余走 `YoReveal`（`.yohu-files__delete-rest` 顶垫 `space-sm`；绘制轴始终绝对定位，行程中出流由主槽裁，落定 clip 避免撑 `scrollHeight`）。盒高交给 Dialog 外包的 `YoTravel` 当拍锁用后 px，关窗冻锁，主槽 clip；滚条走公开 `YoScroller`（无法滚动不画条，滑块可拖），禁止再套 Collapse / `panel` 淡入。禁止把 Reveal 嵌进预览网格当一格。模块只改 `open` / 按钮文案，不写时长、不绑行程。

不做什么：不在 UI 扫 stderr；不把 `LocalNotFound` 打成 `not_found`；不自绘传输坞/面包屑第二套折叠；预览不降成 `IconLg=40`。

### 设计前（路径提交）

```text
AddressSlot.commit
  → resolveRemotePath(原文)                         ← 第一次
       parseRemotePath.collapseDotSegments
         /sdcard/../data/x → /data/x
       guardBrowsePath：.. 已被消掉，只能 outside_root
  → goTo(已折叠绝对路径)
       resolveRemotePath 再跑一遍                   ← 第二次
面包屑也走 goTo，再解析一次
```

问题：`safety_root.json` 的 `/sdcard/../data/x` → `traversal` 只在直接测 guard 时命中；提交链与 domain `RemotePath::parse` 分叉。

### 设计后（路径提交）

```text
AddressSlot Enter
  → listingStore.goTo(原文)                         ← 只这一次 resolveRemotePath
       path-parse：unquote / file-uri / separators / host-reject / alias / relative
                  保留 // . .. ；无 collapseDotSegments
       path-guard：向量在 `@yohu/api` `safety.test` ↔ testdata/safety_root.json
       失败：notifyError，不改 path，不关输入
       成功：loadListing → ++listGen → files.list → ListingEntry
面包屑 / 上级
  → listingStore.navigate / goUp（夹紧绝对段，不经 resolve）
```

不做什么：不在 parse 折叠 `..`；不给 `../Pictures` 开「先消掉再当兄弟目录」旁路。

### 设计前（store 神对象）

```text
store.ts 一份 createFileStore
  listGen / loadListing / requestListing
  + TransferJob / onTransferProgress / push-pull
  + UiTransfer = TransferJob 别名
  + errorTick 进程单例；detachView 不清 fault
```

问题：浏览与作业寿命同文件；切模块再挂会重弹 toast。

### 设计后（listing / transfers）

```text
listing.ts
  listGen / requestListing / goTo（唯一 resolve）/ 挂载期 fault
  detachView：error=""，errorTick=0
  不 import transfers，不订 transfer/progress

transfers.ts
  TransferJob 寿命（adopt / upsert / fade / push / pull / cancel / dragOut）
  读 listingStore.serial / path
  终态只调 listingStore.requestListing("transfer")
```

不做什么：不留 `fileStore` / `UiTransfer` / re-export；不把 store 叫 ViewModel。

### 设计前（传输寿命）

```text
files.push/pull
  → transfer_runs::spawn
      allocate → tasks.register → TransferSpec
      → tokio::spawn(TransferRunner.run → release → finish)

files.dragOut → dnd
  Win ole.rs GetData：同一套 allocate / register / spec / release / finish + block_on
  mac materialize：再写第三遍 + await
```

问题：三份寿命。OLE 必须 `block_on`，macOS 必须在 `NSDraggingSession` 前 await，所以不能直接复用 `spawn`，但发号/任务中心只能有一个入口。

### 设计后（files.push / dragOut）

```text
files.push/pull
  → commands/files 薄转发
  → transfer_runs::spawn
      require_online
      → transfer_runs::run（allocate → 任务中心 → TransferSpec → TransferRunner.run → release → finish）
      → tokio::spawn(job)；立即返回 id

files.dragOut
  → commands/files require_online
  → dnd（OLE / Finder / 会话目录）
      Win：主线程 DoDragDrop；GetData 才 transfer_runs::run + block_on
      mac：物化目录后 transfer_runs::run.await；再 NSDraggingSession
```

不做什么：不在 dnd 再写发号；不留 `spawn` 兼容包装；不改 `commands/files` 薄转发；不改 `core/yohu-files`。

### 设计前（dragOut / list_tree 上限）

```text
files.dragOut
  → commands/files require_online
  → dnd.drag_out
    → FileBrowser.list_tree
      → push_tree
        条数 >= 4096 → Err(TreeLimit(4096))
        目录 depth >= 24 → 目录已入树，return Ok(())
    → 壳当成功启动 DoDragDrop / NSDraggingSession
```

问题：条数触顶 fail-closed，深度触顶当成功截断；子树丢掉且不报错。

### 设计后（dragOut / list_tree 失败）

```text
files.dragOut
  → commands/files require_online
  → dnd.drag_out
    → FileBrowser.list_tree
      → normalize_mut + resolve_and_recheck
      → push_tree → tree_bounds
        条数 >= 4096 → FileError::TreeLimit(4096)
        目录 depth >= 24 → FileError::TreeDepth(24)
      空树 → FileError::EmptyTree(path)
    → ipc_file
        TreeLimit / TreeDepth / EmptyTree / Path / OutsideRoot → invalid_args
        Adb → ipc_adb
    → 失败不启动 DoDragDrop / NSDraggingSession
```

不做什么：不把深度塞进 `TreeLimit(计数)`；不把句子装进 `Path`；不静默截断当成功；不改 dnd / UI / `transfer_runs`。

### 设计前（core：ls / push / delete 错误）

```text
FileError::Adb(#[from] AdbError)
  ls / rm / push 的 BadExit（含 stderr）
    → ? 自动 From
    → FileError::Adb(BadExit)
    → ipc_file → ipc_adb
    → UI「执行失败(退出码 n): ls: ...」

guard.rs：use yohu_adb::parse::readlink::ReadlinkF
  files 点 parse 子模块

DELETE_TIMEOUT_MS / MUTATE_TIMEOUT_MS 写在 guard.rs
```

问题：未分类设备失败带着 stderr 进 UI；守卫夹带变更超时；files 越过 `AdbClient::readlink_f` 门面。

### 设计后（core：ls / push / delete 错误）

```text
ls:
  FileBrowser.list
    → normalize_browse + resolve_and_recheck
      AdbClient::readlink_f → yohu_adb::ReadlinkF（根导出）
    → AdbClient::ls
    → map_err(file_error_from_adb)
      BadExit → classify_remote_stderr → 命名变体
      未分类 → RemoteFailed(path)   Display 无 stderr
      取消 / 掉线 / 超时 / IO → FileError::Adb 手构
    → ipc_file（变体未变）

push:
  TransferRunner.run
    → normalize_mut + resolve_and_recheck
    → stream_progress_lines
    → Ok(nonzero) → file_error_from_adb(BadExit{stderr: last_summary})
    → Err(Cancelled) → FileError::Adb(Cancelled)
    → Err(其它) → file_error_from_adb
    → join 失败 → FileError::Adb(Io)
    → ipc_file

delete:
  FileMutator.delete
    → normalize_mut + resolve_and_recheck
    → adb.run(rm -rf, DELETE_TIMEOUT_MS)   超时在 mutate.rs
    → map_err(file_error_from_adb)
    → exit≠0 → file_error_from_adb(BadExit)
    → ipc_file
```

不做什么：不恢复 `From<AdbError>`；不把分类推到壳；files 不写 `yohu_adb::parse::`；守卫只做词典 + 祖先拼接 + SafetyRoot 复核。

传输 / 拖入 / 清单 / 坞的作业模型见 [文件传输-v6.md](../文件传输-v6.md)，本文不再叠第二套设计前/后。

