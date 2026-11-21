# 交接说明（给新会话的开发者看）

> 这份文件是**项目当前状态快照**。新开会话后，第一件事就是读它，再按需读 `MANUAL.md`（完整使用手册）、`src/core.js`（内核）、`src/apps/*.js`（应用范例）。
> 最后更新：v1.7.0（2026-11-21 仓库整理：README 拆分 + `.gitignore` + GitHub 隐私清单），全部自检通过（内核冒烟 545 项、产物验收 75 项）。
> 近期新增：**拼图进阶**（片数最高 1000、视口画布缩放/平移、IndexedDB 自动保存与恢复、绿色吸附提示开关、底部列表虚拟滚动），
> 上一版是**拼图小游戏**（导入图片 + 经典/异形切块 + 底部横向碎片列表 + 拖拽吸附）、
> **睡前故事应用**（长文创作接口 + 本地 GPT-SoVITS 语音，提示词完全自定义）、接口管理器的「长文创作 / 语音合成」两种新类型与**音色库**、
> **GPT-SoVITS 同步启动**（启动器 .bat + `gptsovits-launch.ini` 配置桥）。

---

## 1. 这是个什么项目

**小手机 PhoneShell**：一个跑在 Windows 上的**单文件 HTML 手机模拟器**。双击 `phone.html` 就是一台手机：
桌面图标点开即用、数据本地持久化、应用以**插件**形式存在（可导入导出、可让 AI 现场创作）、所有美术都由代码生成（内联 SVG / emoji / CSS / Canvas），**零外部资源、零依赖、零安装**。

用户的最终目标：把它当成一个「能自己长应用的小手机」。目前已按用户要求长出了阅读器、息屏知识卡、统一 API 管理等能力（见第 7 节 v1.3）。

---

## 2. 文件结构与职责

```
phone.html               ← 交付物：单文件，双击运行。由 build.mjs 生成，不要手改
README.md                ← GitHub 门面：项目简介、特性、快速开始、目录结构与隐私说明
MANUAL.md                ← 完整使用手册（运行方式、桌面操作、API 管理、阅读器、睡前故事、拼图、插件 API）
HANDOFF.md               ← 本文件（面向开发）
.gitignore               ← 排除本机私有文件（见第 11 节）；phone.html 不能被忽略
启动小手机.bat            ← 默认浏览器打开（先调下面的同步启动脚本）
启动小手机-独立窗口.bat    ← 用 Edge/Chrome --app 模式打开成手机窗口（同样先同步启动）
同步启动GPT-SoVITS.bat    ← 「没在跑就拉起来」的逻辑：读 gptsovits-launch.ini → 探端口 → 启动 → 等就绪
gptsovits-launch.ini     ← 同步启动配置（由「设置 → 同步启动」导出，放到本目录即可；本机私有，已进 .gitignore）
build.mjs                ← 构建：把 src/ 拼成 phone.html（含超集自检，见第 5 节）
src/shell.html           ← HTML 模板，含 3 个占位标记 + 息屏屏保 #screensaver 的结构
src/core.css             ← 全部样式（约 27 KB，含息屏屏保样式）
src/core.js              ← 内核：注册表 / 存储 / 锁屏 / 分页桌面 / 拖拽 / 文件夹 / 应用容器 / 弹窗 /
                            图标系统 / **API 管理器（含长文创作 + 语音合成 TTS）** / **音色库** /
                            **GPT-SoVITS 同步启动配置桥** / **息屏屏保 + 知识卡**（约 140 KB，3092 行）
src/apps/*.js            ← 内置应用，一个文件一个应用，按文件名排序内联
src/games/*.js           ← 内置游戏，同上（构建时排在 apps 之后）
tests/smoke.mjs          ← 内核冒烟测试（假 DOM 真跑 core.js + 全部内置应用）
tests/verify-html.mjs    ← 产物验收（解析 phone.html：结构 / 语法 / 假 DOM 真跑产物）
```

内置应用清单（`src/apps/`，按文件名排序）：`aigen`（AI 创作）、`appstore`、`bedtime`（睡前故事，**v1.5.0 新增**）、`calc`、`clock`、
`notes`（便签，摩卡咖啡色）、`reader`（阅读器）、`settings`（含 **API 管理 + 音色库 + 同步启动** 子界面）；
游戏（`src/games/`）：`g2048`、`gomoku`（五子棋）、`puzzle`（拼图，**v1.6.0 新增**）、`snake`、`uno`。共 13 个。

> ⚠️ **三个 .bat 必须是 UTF-8 无 BOM + CRLF**。文件里有中文（`chcp 65001` 之后才显示正常），
> 而且 `同步启动GPT-SoVITS.bat` 用了 `goto`/`call`/`for`，**LF 换行在某些 cmd 上会解析出错**，改完记得确认换行。
> 别用 PowerShell 的 `Get-Content`/`Set-Content` 往返改它们（GBK 解码会毁中文）。

---

## 3. 常用命令

```powershell
node build.mjs                        # 构建 phone.html
node build.mjs --watch                # 改源码自动重建（长驻）
node build.mjs --out <path>           # 换输出路径
node tests/smoke.mjs                  # 内核回归（必须 0 失败）
node tests/verify-html.mjs            # 产物回归（必须 0 失败）
```

**改动闭环**：改 `src/` → `node build.mjs` → 跑两个测试 → 让用户刷新页面看效果。
新增一个内置应用：把 `.js` 丢进 `src/apps/`（照抄 `appstore.js` 骨架），构建时自动内联，**不需要改任何配置**；
但 `tests/verify-html.mjs` 里有**写死的应用数与 script 块数断言**（`script 块数量正确（2 基础 + N 插件）`、`注册应用数 = N`、
`导出备份包含全部应用与存档` 的 `bundle.apps.length === N`、以及逐个 id 的清单；N 目前是 13），加了应用要同步改，否则产物验收会红。

---

## 4. 插件（应用）契约 —— 改内核时不要破坏它

应用就是一段 JS 源码，只有一个约定：定义 `function createApp(phone) { return {...} }`。

```js
function createApp(phone){
  return {
    id: "guess",            // 字母开头，2-32 位字母数字下划线短横线
    name: "猜数字",          // ≤20 字
    icon: "emoji:🎯",       // "emoji:xxx" 或 "svg:<内置矢量图标名>"
    desc: "1~100 猜数字",    // ≤40 字
    order: 100,             // 可选，桌面排序（内置应用用了 10/11/20/21/22/80/81/82）
    color: "mocha",         // 可选，具名配色 mocha / latte / espresso（不给就按 id 哈希取色）
    mount: function(phone, root, ctx){ /* 往 root 里渲染界面 */ }
  };
}
```

`mount` 的第三个参数 `ctx`：

| 方法 | 作用 |
|---|---|
| `ctx.store.get/set/all/remove/clear` | 该应用的永久存档（自动 JSON 化，键 `phone.data.<id>`） |
| `ctx.setTitle(str)` | 改标题栏文字 |
| `ctx.addAction(label, fn)` | 标题栏右上角加按钮 |
| `ctx.onKey(handler)` | 键盘监听，关闭应用自动解绑 |
| `ctx.onCleanup(fn)` | 清理函数（**定时器/rAF/监听都必须走它**） |
| `ctx.useFullBody()` | 去掉内边距并禁滚动（画布类游戏用） |
| `ctx.setBodyPadding('0')` | 自定义内容区内边距（阅读器用它自己管留白） |
| `ctx.close()` | 退出应用 |

`phone` 顶层 API（详见 `MANUAL.md` 第九节）：`phone.utils.el/$/$$/esc/md/clamp/hash/download/downloadBlob/readFile`、
`phone.utils.copy/readTextFile/splitParagraphs/cleanImportText/htmlToText/parseLooseJson/splitForTTS/normText/trimText`、
`phone.icons.html/list/named`、`phone.grad(id)`、`phone.toast/alert/confirm/prompt`、`phone.openApp/closeApp/home`、
`phone.addApp/removeApp/getApps/getApp/exportApp/exportAll/importBundle`、`phone.compile(code)`、
`phone.store/settings`、`phone.wallpaper.*`、`phone.layout.*`、
**`phone.apis.*`（全机统一接口：list/get/save/remove/resolve/bind/chat/write/search/ask/test/models/purposes/purposeType/types/presets/typeLabel）**、
**`phone.tts.*`（语音合成与音色库：url/synth/test/setWeights/split/defaults/normalize/providers/langs/splitMethods/voices/voiceGet/voiceSave/voiceRemove/defaultVoiceId/setDefaultVoice/voiceToTts）**、
**`phone.gsv.*`（GPT-SoVITS 同步启动：config/save/defaults/commands/fromUrl/ini/iniName/launcher/ping）**、
**`phone.idle.*`（seconds/setSeconds/reset/enter/exit/isOn）**、
**`phone.knowledge.*`（state/generate/next/prev/allRead/readCount/clear）**。

**UI 样式类**（内核提供，应用直接复用）：`ui-btn`(+`ghost`/`warn`)、`ui-field`、`ui-label`、`ui-card`、
`ui-row`、`ui-list`(+`li`/`li-main`)、`ui-hint`、`ui-muted`、`ui-bar`、`ui-pre`、`ui-spin`。

**插件编译规则**（`compileAppCode`，改它要谨慎，有测试覆盖）：
支持 `function createApp(phone){}`、`createApp = ...`、`module.exports = {...}`；不支持 `import/export`（源码里**不能**出现 `.exports` 赋值之外的花样）。
源码里既没有 `createApp` 也没有导出 → 明确报错「源码里没有找到 createApp(phone) 工厂函数」。

---

## 5. 构建脚本的两个坑（都踩过，已修，别改回去）

1. **占位替换必须用替换函数**：`shell.replace(MARK_JS, () => safeCoreJs)`。
   用替换字符串会把内联源码里的 `$$`、`$&`、`` $` `` 当成替换模式 —— 曾经把内核的 `function $$(` 塌缩成 `function $(`，产出**坏文件**而语法检查没拦住。
2. **产物自检**：构建后必须校验 ①占位符已消耗 ②抽出每个 `<script>` 重新编译 ③`core.js` 里 `function $(` 与 `function $$(` 各恰好 1 个。

---

## 6. 设计与用户偏好（**重要**，用户明确提过）

- **美术风格**：低多边形卡通 + 手机感；**任何素材都用代码画**，禁止外部图片/字体/CDN/网络资源。
- **应用窗口必须完全不透明**：用户明确要求过。`.app-host` 用实色渐变（`--screen`→`--screen2`），`.app-nav` 用 `#f6f8fe`，dock 用 `#ffffff`；**不要**给应用窗口加 `rgba` 底色或 `backdrop-filter`（用户会觉得"有透明度"）。
- **默认桌面背景是纯色**（`bgMode: 'solid'`，5 款接近白的底色），渐变壁纸是可选模式，**只在桌面与锁屏可见**。
- 桌面图标文字：纯色模式用深色（`var(--ink)`），渐变壁纸模式由 `#screen.wallpaper-on` 覆盖成白字+阴影。改样式时注意这条联动，否则浅底白字会看不见。
- 用户是中文交流，**界面文案、代码注释、报错信息全部中文**。
- ⚠️ **绝对不要用 PowerShell 的 `Get-Content` / `Set-Content` / `-replace` 管道往返改这些中文文件**：本机 pwsh 会按 GBK 误解码再写回，中文直接变乱码（当年的 `README.md` 被这么毁过一次，只能整篇重写；现在完整手册在 `MANUAL.md`）。要改文件就用编辑/写入工具，写完后确认 **UTF-8 无 BOM**。

---

## 7. 已经做过的功能与修过的坑

**v1.7.0**（用户对拼图的反馈：难度要更高、最高 100 甚至 1000 片；因此必须有缩放和保存；绿色提示框希望能自己关掉）：

1. **片数拉到 1000**：`COUNTS` 加 100/150/200/300/500/1000；`planGrid` 的行列上限 12→**64**（1000 片在竖图上约 27×37）；`buildPuzzle` 的凸起 `amp` 下限 4→**2**、按 `min(cellW,cellH)*0.22` 算，`edgePoints` 的采样点数按 amp 自适应（8~18），否则 1000 片会多出几十万个点。
2. **相机式缩放 / 平移（这次的大头）**：
   - 画布从「底板大小」改成**铺满 `stage` 的视口画布**；底板坐标 → 屏幕 = `x*zoom + panX`。`drawBoard()` 用 `setTransform(pr*z, 0,0, pr*z, pr*panX, pr*panY)` 进入底板坐标，所有线宽都写成 `N / z` 才不会被放大。
   - **不再给每片预渲染 canvas**（1000 片会吃掉几十 MB）：新增 `drawPieceImage(g,p)` 直接在「底板坐标」下从原图按 bbox 裁切；底板、缩略图、拖拽幽灵都复用同一套（缩略图/幽灵用 `paintPieceCanvas()` 换一个 transform）。
   - **culling**：只画与视口相交的碎片；虚线格子在「格子的屏幕像素 ≥ 13」时才画（1000 片缩到 100% 时整块板就是一片灰，画了也看不清）。
   - 操作：工具栏 `− / 百分比 / +`、滚轮（以指针为中心）、双指捏合（两个 pointer，`beginPinch/movePinch`）、放大后**单指拖底板平移**；点按（移动 < 5px）才是放置碎片。范围 100%~800%，点百分比回 100%。
   - `defaultZoomFor(n)`：100 片 1.25、200 片 1.5、500+ 片 2.2，换片数时自动给一个能看清的大小。
   - ⚠️ 假 DOM 里 `canvas.getBoundingClientRect()` 恒为 368×640，而 `stage` 量出来可能是 320×400，所以 `localPoint()` 用 `stageW / rect.width` 做了补偿；`boardPointToClient()` 必须做同样的逆变换，否则测试里拖拽坐标会整体偏。
   - ⚠️ `endDrag()` 在「拖到板外 / pointercancel」时也必须重绘：`S.hover` 被清掉了，但如果不 `drawBoard()`，绿色高亮会留在屏幕上（第一版就漏了）。
   - ⚠️ `onWheel` 必须先判 `if (!e.deltaY) return`，否则触控板的横向滚动（deltaY=0）会被当成缩小。
3. **进度保存 / 自动恢复**：
   - 新模块级 **`storagePut/Get/Del`**：优先 IndexedDB（`phoneshell-puzzle` / 对象仓库 `kv`），失败或不存在时降级 localStorage，键名 `pz.save.image` / `pz.save.state`（注意：不走 `ctx.store`，照片不应该混进「导出全部备份」）。
   - 图片记录：`{name, w, h, dataUrl}`；状态记录：`{v, mode, count, cols, rows, total, moves, elapsed, zoom, panX, panY, placed[], order[], savedAt}`。
   - 采样图第一次保存时用 `canvas.toDataURL('image/jpeg', 0.86)` 转出来并缓存到 `S.imgDataUrl`；导入的图直接用 FileReader 的 dataURL。`S.savedImgUrl` 用来避免每次自动保存都重写图片。
   - 每放好一片 `scheduleSave()`（800ms 防抖）；`onCleanup` 里只有 `S.placed > 0 && !S.over` 才补存一次；`finish()` 清存档。手动 💾 走 `saveGame(false)`（有 toast）。
   - 启动顺序：`loadSaved()` → `restoreSaved()`（重建碎片、按索引恢复 placed、恢复 order/moves/elapsed/zoom/pan）→ 没有存档才 `loadSample()`。**初始化和示例图加载现在是异步的**，所以 mount 暴露了 `controller.ready()`；测试里挂载后要 `await C.ready()` 再断言。
   - ⚠️ `userStarted` 竞态：存档读取是异步的，如果用户在这几十毫秒里点了片数/模式/碎片，就不能再让旧存档盖回去（`init` 的分支里检查）。
   - ⚠️ 恢复时用**保存的索引**对应重新切出来的碎片；如果图片解码尺寸变了（EXIF 之类）索引可能错位，越界/重复索引会被过滤并在末尾补齐。
4. **绿色吸附提示开关**：`S.showHover`（`store` 键 `hoverBox`，默认开），工具栏 🎯 / 键盘 `G`；关掉只是不画绿色目标框，吸附判定不变。测试把手 `controller.hoverBox(on)`。
5. **底部碎片列表虚拟滚动**：`.pz-strip` 里放一个 `.pz-track`（宽度 = 片数×61-7），只按 `scrollLeft` 渲染视口附近约 11 个 `.pz-item`；`renderTrayWindow()` 由 scroll（rAF 节流）和 `renderTray()` 触发，`scrollToPiece()` 直接按索引算 scrollLeft。这样 1000 片也只有十几个 canvas，不会卡。
6. 杂项：`state()` 加 `zoom/panX/panY/showHover/slots/stageW/stageH`；`controller` 加 `ready/setZoom/zoom/zoomStep/resetZoom/panBy/trayWindow/trayScroll/hoverBox/save/clearSave/toBoard`；画布加了 `contextmenu` 屏蔽长按菜单。
7. **测试**：smoke 新增「1000 片切块 / 自动放大 / 坐标换算 / 平移边界 / 滚轮 / 双指 / 提示开关 / 虚拟列表 / 保存恢复（localStorage 与假 IndexedDB 两条路）」等，总数 **545**；verify 仍是 **75**。给 `FakeEl` 补了 `toDataURL()`，并临时 `defineGlobal('indexedDB', 假实现)` 跑主路径。

**v1.6.0**（用户新需求：新增「拼图」小游戏 —— 自行导入图片、可设片数、经典 + 异形两种拼图，未拼完的碎片放在屏幕下方可滑动列表里）：

1. **新游戏 `src/games/puzzle.js`**（`id:'puzzle'`，`order:14`，`icon:'svg:puzzle'`，未指定 color → 按 id 哈希取到藤紫）。分层结构：
   - **纯函数（模块级，不碰 DOM，测试直接调）**：`fitBox(w,h,maxW,maxH)` 等比缩放、`planGrid(n,aspect)` 推行列、`edgePoints(ax,ay,bx,by,s,pos,amp)` 生成单条边、`appendPts(dst,src,reverse)` 拼接去重、`buildPuzzle({w,h,cols,rows,mode,rnd})` 切块、`snapTol(cellW,cellH)` 吸附容差。
   - 切块的**核心约定**：相邻两片**共用同一份绝对坐标点列**。`hEdge[r][c]` / `vEdge[r][c]` 存好每条边（含凸起）的点列，每片按「上→右→下→左（顺时针）」拼接，其中右边/上边正向、下边/左边反向。**不要改成「每片自己算凸起方向」** —— 那就需要处理互补关系，很容易把两片都切成凹口。凸起法线固定取「顺时针 90°」（横边朝下、竖边朝左），`s=±1` 只决定往哪边鼓。
   - 凸起形状：`sin(πt)^0.62` 采样 18 个点（`t` 是凸起区间 0..1）。指数 <1 会让曲线在两端接近垂直出线，形成「窄颈 + 圆头」的经典拼图感；只改 `amp`（默认 `min(cellW,cellH)*0.24`，夹在 4~26px）就能调凸起大小。`pos` 有 ±0.06 的随机偏移，让边缘不那么机械。
   - **底板长宽比跟图片走**：`fitBox` 在 `stage` 的可用尺寸里等比缩放，`S.boardW/boardH` 就是画布的 CSS 尺寸；`canvas.width = boardW*dpr`（`dpr` 夹在 1~2），画布坐标统一用 CSS px。
   - **碎片预渲染（v1.7.0 起已移除，改成按视口直接从原图裁切，见上；九参数 drawImage 的规则仍然适用）**：`prerenderPiece` 把每片画进自己的 canvas（`boxW = bbox 宽 + 2*PAD`，`PAD=2.4` 留给描边）。绘制时 `translate(-(minX-PAD), -(minY-PAD))` 后用**绝对板坐标**建路径、`clip`，再 `drawImage(img, sx,sy,sw,sh, ox,oy,w,h)` —— 九参数版本的 **src 与 dest 必须都按 bbox 缩放**（第一版把 dest 写成了整块底板 `boardW/boardH`，图片会被拉伸，是这个游戏最容易写错的一行）。
   - **绘制顺序**（`drawBoard`）：底 → 空槽轮廓（虚线，让玩家看出每片长什么样）→ 已放好的碎片 → 拖拽目标高亮（绿）→ 提示金框 → 放错的红色闪框 → 外框。空槽必须在已放碎片**之前**画，否则凸起会被虚线盖住。
   - **两种放置方式**：从下方列表**拖拽**（pointerdown 在 `.pz-item`，pointermove/up 监听在 document 上），或**点选碎片 → 点底板**（canvas 的 `click`）。判定用 `|pos - 碎片 bbox 中心| <= 0.55*单元格`，不算「最近的一片」，**只认被拖的那一片自己的位置**（避免掉在别处却吸到邻居格子里）。
   - **底部横向列表**：`.pz-strip` 是 `overflow-x:auto` 的 flex 容器，每个 `.pz-item`（54×54）里放一张重绘的缩略 canvas；两侧 `‹ ›` 给鼠标翻页。**滚动位置在 `renderTray` 里保存/恢复**（否则每放好一片列表都会弹回开头）。`scrollToPiece` 用两个 `getBoundingClientRect` 算相对位置，**别用 `offsetLeft`**（`.pz-strip` 没有定位，offsetParent 是 `.pz-wrap`，会算偏）。
   - **手势判方向**：`touch-action:pan-x` 的列表项上，**横向移动 → 只滚列表**（`endDrag`，不拦默认行为，交给浏览器滚），**纵向移动 → 拿起碎片**（`preventDefault` + 显示 ghost）。阈值 `DRAG_START=7px`，方向判定 `|dx| > |dy|*1.25`。ghost 是 `.pz-wrap` 里的一个 canvas，**按碎片原始尺寸 1:1 画**（底板坐标 = CSS px），中心跟手。
   - **示例图**：`SAMPLES` 三张（晚霞山峦 720×960 / 夜色城市 960×720 / 几何花园 840×840），全部用 Canvas 代码画（`drawSunset/drawNight/drawGarden` + `ridge()` 多边形山脊 + `seedRnd()` 固定种子），`sampleFor(key)` 只生成一次并缓存 canvas。**这是「所有美术都由代码画」的约定，别改成 dataURL / 外部图片。** 尺寸别调太大：底板最宽约 340 CSS px、×2 DPR 才 680 物理像素，三张图同时缓存要压住 Canvas 内存。
   - **导入图片**：`pickImage()` 建一个 `display:none` 的 `<input type=file accept="image/*">` 塞进 wrap 再 `click()`（有些浏览器要求 input 在文档里）；`FileReader.readAsDataURL` → `new Image()` 解码 → 读 `naturalWidth/Height` → `applyImage`。桌面端 `dragover/drop` 也接了。**导入的图片不写 localStorage**（大图会撑爆 5MB），只记 `mode / count / sample` 与各档最好成绩。
   - **换图面板**：标题栏「🖼 换图」`ctx.addAction` → `.pz-sheet` 浮层，三张示例图缩略卡 + 「从本地选一张图片」；缩略图**首次打开时才生成**（`fillSheet` 里 `sheetFilled` 标记），不在 mount 时白画三张大图。
   - **计时/成绩**：`startClock()` 在第一次点选/拖拽时启动（不是一进应用就开始），完成时 `finish()` 算用时、写 `best['模式:片数']`（`{time,moves,at}`）并弹 `.pz-over`。
   - **测试把手**：`mount.__test = { css, counts, samples, planGrid, fitBox, edgePoints, buildPuzzle, snapTol, fmtTime, controller() }`。`controller()` 提供 `state/board/piece/target/trayCount/select/drop/placeAll/setMode/setCount/sample/importFile/preview/hint/relayout/boardPointToClient`。
2. **测试**：smoke 新增「拼图」一节 50+ 项（纯函数 + 真挂载 + 真实 pointer 拖拽 + 桩 Image/FileReader 导入 + 重新打开记忆设置）；`verify-html.mjs` 的 script 数 14→15、应用数 12→13、id 清单加 `puzzle`、`bundle.apps.length` 13。
   - 几何断言用 **面积守恒**（shoelace 求和 = 底板面积）验证异形片既不重叠也不留缝，再用**点在多边形内**验证凸起两侧分属两片；比逐点比对更不容易写错。
3. 版本号 1.5.1 → **1.6.0**。

**v1.0**：外壳、插件系统、存档、AI 现场创作（OpenAI 兼容接口）、导入导出、8 个内置应用/游戏
（2048、贪吃蛇、时钟[含秒表/番茄钟]、便签、计算器、应用商店、AI 创作、设置）。

**v1.1**：修「壁纸切换没反应」（根因 `#screen` 不透明底盖住壁纸）；修「AI 创作看不到输入框」（textarea 忘了 append 进 DOM）；桌面**分页**（3 页 × 12 格，滚轮/拖动/方向键/圆点）；**长按整理模式** + 拖拽排序 + 跨页拖拽；**文件夹分组**（拖到图标上生成、2×2 缩略图、可改名/拖入/解散）。

**v1.2**：修「dock 三个键全失灵」（`appItemNode` 里 `if (opts.dock) { ...; return b; }` 提前返回，跳过了 click 绑定）；修「整屏发黑」（壁纸层被移到手机框外且屏幕无底色）；应用窗口改**完全不透明**；默认改纯色背景，新增纯色/渐变壁纸两种模式。

**v1.3**（用户提的四件事，全部落地）：

1. **便签**：编辑页加「📋 一键复制」（标题栏也有「复制」；输入框里选中一部分就只复制选中的，否则整段复制），列表页每条也加了「复制」；配色换成**摩卡咖啡色系**（只作用于 notes 窗口，靠 `notes.js` 注入的 `#notes-mocha-css` 样式表 + `#apps .app-host[data-app-id="notes"]` 前缀），图标换成新的 `svg:coffee`；`color: 'mocha'` 走内核新增的**具名配色** `NAMED_COLORS`（`pickColor` 优先看应用的 `color` 字段）。
2. **阅读器**（新应用 `src/apps/reader.js`）：导入/删除纯文本（txt/md/csv/json/html…，HTML 去标签、中文 txt 自动 UTF-8→GBK 回退）、段落分页渲染 + 记忆进度、关键词检索（列出命中、点击跳转、`markHTML` 高亮）、AI 总结（全文/选中，可存到本书）、**划线询问**（划选 → 底部 `.rd-selbar` → 面板里带划线内容 + 上下文问对话模型 → 答案存成划线记录并回显在正文）、日间/夜间两套配色（切 host 上的 `.rd-night`）+ 字号调节。
3. **闲置息屏 + 知识卡**（内核）：`#screensaver`（`src/shell.html` 结构 + `core.css` 样式），`phone.idle.*` 负责闲置检测（document 上的 pointerdown/keydown/wheel/touchstart/mousemove，4 秒轮询一次），`phone.knowledge.*` 负责取卡：10 个话题并发 3 去调 `apis.search`，每话题取 1 条 → 10 张一组；显示过即记为已读，**`allRead()` 成立后才允许 `generate(true)`**（详见 v1.3.1 第 4 条：没有检索接口时**默认不生成**）。
4. **API 统一管理**（`phone.apis` + 设置里的「API 管理」子界面）：接口条目存在 settings 的 `apis` 键、用途绑定存在 `apiBind` 键；支持类型 chat/search、预设列表、`apiTest` 连通性自检；**aigen.js 里原来的接口填写整段删掉**，改为显示当前接口 + 引导去设置；`apiMigrate()` 在 boot 时把老版本的 `ai.key/ai.baseUrl/ai.model` 自动迁成一条 chat 接口并绑定。发给 AI 的系统提示词里也新增了「必须用 `phone.apis`，不许自己存密钥」。

**v1.3 顺手修的坑**：`#toast-layer` 的 z-index 从 60 提到 68（否则屏保里的提示被盖住）；阅读器里点底部询问条时的 `mouseup` 会收起选区、把刚划好的内容清掉 → 用 `e.target.closest('.rd-selbar, button, input, textarea, select, .ui-btn')` 跳过；阅读进度只在段落号变化时才写存档（大部头每次写 1MB JSON 会卡）；阅读器把 `.app-body` 内边距交给应用自己管（`ctx.setBodyPadding('0')`），工具条才能干净地 `position:sticky;top:0`。

**v1.5.1**（用户反馈：睡前故事要删掉「风格」「讲给谁听」、提示词要**最终**可自定义；另外要「启动手机时若没起 GPT-SoVITS 就同步启动」，地址在设置界面填）：

1. **睡前故事删掉两个预设块**：`STYLES`、`AGES` 连常量带 UI 一起删了（`LENGTHS` 保留）。`suggestTitle()`、收藏记录里的 `styleKey/styleLabel/ageKey/extra` 一并去掉，改成存 `promptSys` / `promptUser`（各截 1500 字）当出处。
2. **提示词改成「最终提示词自定义」**：
   - 新增 `PROMPT_SYS_DEFAULT` / `PROMPT_USER_DEFAULT`（带 `{{主题}} {{字数}} {{篇幅}} {{日期}}` 占位符的初始模板）与 `PLACEHOLDERS` 说明表。
   - `renderPrompt(tpl, vars)` 只做占位符替换（认不出来的 `{{x}}` 原样留着，用户看得出来）；不填主题时 `{{主题}}` → 「请你自由发挥」。
   - `buildStoryPrompt({sys, user, topic, lenKey})` 现在**直接吃用户编辑过的两份文本**，没有任何隐藏拼接。
   - UI：创作页只剩 ①主题 / ②篇幅 / ③最终提示词。③ 里是**系统提示词 + 用户提示词两个 textarea**（改完即时写进 `ctx.store('ui')`），下面是占位符按钮、折叠的「预览：现在发出去到底是什么」、「存成模板 / 载入 / 删除 / 恢复默认 / **占位符换成当前内容**」。
   - `freezePrompts()` = 把占位符一次性换成当前内容，此后两份提示词就是纯文本（**所见即所发**），`mount.__test.controller().freezePrompts()` 可测。
   - 模板结构从 `{id,name,text}` 变成 `{id,name,sys,text}`（载入时系统提示词一起换）。
   - 创作台顶部新增「🔍 检测语音服务」，直接看到 GPT-SoVITS 在不在。
3. **GPT-SoVITS 同步启动（新功能）**：浏览器不能启动本机进程，所以做成「设置界面填配置 → 导出 ini → 启动器 .bat 读它干活」的**配置桥**。
   - 内核新增 `phone.gsv`（settings 键 `gsvBoot`）：`config()/save()/defaults()/commands()/fromUrl()/ini()/iniName()/launcher()/ping()`。
     - `gsvConfig()` 归一化并在 `save()` 时钳制（`wait` 10~600、`port` 1~65535、`onFail` 只认 `open|stop`）。
     - `gsvIni()` 生成 **CRLF + `#` 注释 + `key=value`** 的配置（bat 用 `for /f "eol=# tokens=1,* delims=="` 解析，注释符必须是 `#` 而不是 `;`，因为 `for /f` 默认 `eol=;`）。
     - `gsvPing(urlOrApi)` 用 **`fetch(url, {mode:'no-cors'})`** 探端口：**服务在跑就 resolve（哪怕返回 400/404），连不上才 reject**，所以探测既不需要服务端开跨域，也不会因为 HTTP 状态码误判。4 秒超时。
   - `同步启动GPT-SoVITS.bat`（新文件）= 读 ini → `powershell` 开 TcpClient 探端口 → 没在跑就 `start "GPT-SoVITS" cmd /k "<command>"`（先 `pushd` 工作目录）→ 每秒探一次直到超时 → `exit /b 3` 表示「超时且配置要求先别开」。
     - ⚠️ **不能用延迟展开 / 不能在同一个括号块里读刚设的变量**：脚本里靠「子过程 `call :gsv_port_open` 设置 `PORT_OK`，下一行单独用 `%PORT_OK%`」的写法避开 `%VAR%` 提前展开的坑。
     - 两个启动器都 `call` 它，并检查 `if errorlevel 3`。
   - 设置页新增 `boot` 视图：开关 / 探测地址（带「从当前语音接口读取主机与端口」）/ 端口 / 工作目录 / 启动命令（5 个预设）/ 最多等多少秒 / 超时怎么办 / 检测是否在运行 / 导出配置文件 / 复制配置内容 + 「启动器会做什么」说明；主页与 API 管理页各有入口。
   - `ttsNetError()` 的文案里加了「同步启动」的指路。
4. 测试：smoke 新增「GPT-SoVITS 同步启动」一节（默认值 / 保存钳制 / fromUrl / ini 内容与 CRLF / 探测的 on 与 off 两条路），并把提示词相关断言改成占位符语义；设置页测试补了走一遍 `boot` 视图（点预设 → 填目录 → 保存 → 导出）。总数 438 + 71。
   - ⚠️ 断言 `runtime\python.exe` 时正则要写 `/runtime\\python\.exe/`（正则里的 `\\` 才是一个反斜杠），我第一版写成了 `\\\\` 挂了一次。
5. 版本号 1.5.0 → **1.5.1**。

**v1.5.0**（用户新需求：新增「睡前故事」软件 + 创作 api + 本地 GPT-SoVITS 语音；接口管理要加预设与模型选择）：

1. **内核：接口管理器扩成 4 种类型 4 个用途**（`src/core.js`）：
   - `API_PURPOSES` 变成 `chat / write / search / tts`，新增 `API_PURPOSE_TYPE` 映射；`apiResolve(purpose, opts)` 现在**按用途只挑同类型接口**（以前 `purpose==='search'?'search':'chat'`，语音会被对话接口顶掉）。
     `resolve('write')` 默认允许**借用对话模型**（`opts.fallbackChat !== false` 可关），返回的 record 上靠 `api.type !== 'write'` 判断是不是借来的，界面上会写「借用的对话模型」。
   - `API_PRESETS` 增加 `write`（DeepSeek / Kimi 长文 / Qwen-Long / GLM-4-Long / 本地 Ollama）与 `tts`（GPT-SoVITS 本地 v2 / 旧版 v1 / 局域网 / OpenAI 兼容语音）。预设里的 `tts` 字段会被预设按钮合并进草稿。
   - `apiSave` 校验：`write` 和 `chat` 一样要求模型名；`tts` 只有 **provider==='openai'** 才要求模型名，**gpt-sovits + apiVersion==='v2' 要求参考音频**（api_v2 的 `check_params` 里 `ref_audio_path` 是必填；v1 可以在启动参数里预设默认参考音频，所以放行）。
   - 新增 `apiWrite(api, messages, opts)`＝同协议但用 `write` 用途的接口（`phone.apis.write`）。
2. **内核：TTS 能力（`phone.tts`）**：
   - `TTS_DEFAULTS` / `normTts()` 把任意来源的语音参数补齐（apiVersion / method / refAudio / promptText / promptLang / textLang / textSplit / mediaType / speed / topK / topP / temperature / batchSize / streaming / gptWeights / sovitsWeights / timeout）。
   - `ttsUrl(api, text, opts)`：GPT-SoVITS 走 **GET**（`api_v2.py` 的 `/tts`；v1 用根路径 `/?refer_wav_path=…`）。**故意不用 POST** —— POST 带 `application/json` 会触发 CORS 预检，GET 是简单请求，跨域门槛更低。
   - `ttsSynth(api, text, opts)`：真把音频取回来（`res.arrayBuffer()` → Blob → objectURL），返回 `{url, blob, bytes, mime, via}`；OpenAI 兼容走 `POST {baseUrl}/audio/speech`。错误经 `ttsNetError()` 翻译成中文，**明确提示「本地 GPT-SoVITS 默认没开跨域，可改用直连播放」**。
   - `ttsSetWeights(api, {gpt, sovits})`：调 `/set_gpt_weights`、`/set_sovits_weights`；读不到返回（跨域）时**补发一次 `mode:'no-cors'` 的请求**把指令送到，并返回 `ok:null` 让界面提示「读不到返回结果」。
   - `ttsTest(api)` → `{msg,url,bytes,mime}`；`apiTest()` 对 `type==='tts'` 自动走它。
   - **音色库**（settings 键 `ttsVoices` + `ttsVoiceDefault`）：音色 = 参考音频 + 参考文本 + 语种 + 语速；`voiceSave/voiceRemove/defaultVoiceId/setDefaultVoice/voiceToTts`。
   - `splitForTTS(text, max)`：先按段落、再按句末标点分句，然后把短句拼回 max 字左右；超长句只在 `，、；：` 空格处断，**尽量不拦腰截断**。暴露为 `phone.utils.splitForTTS`。
   - `phone.utils.downloadBlob(name, blob)`：二进制导出（音频用）；`download()` 改成薄封装。
   - `phone.version` 从 `1.3.4`（一直忘了改）直接跳到 **1.5.0**。
3. **设置界面（`src/apps/settings.js`）**：
   - 类型按钮 4 个；用途绑定按 `apis.purposeType(p.key)` 过滤；接口清单对 `tts` 显示服务商 / 参考音频。
   - 语音接口编辑页：语音服务商、**音色库选择 + 套用**、参考音频路径、参考文本、参考/合成语种、切分方式、语速、返回格式、**取音频方式（自动 / 只取数据 / 只直连）**、接口版本、**GPT/SoVITS 权重路径 + 切换模型**、高级采样（top_k/top_p/temperature/batch_size/流式）、超时、备注、「🔊 试听一句」、「保存并自检」。
   - 新增两个视图 `voices` / `voice`：音色库列表（设为默认 / 写进接口 / 删除）与音色编辑页。
   - 主页新增「语音合成（睡前故事朗读）」状态卡 + 音色库入口。
   - 试听统一走 `playPreview()`：`method==='direct'` 直接 `new Audio(url)`，否则先 `synth`，`auto` 模式失败自动退化为直连。`ctx.onCleanup` 里停掉播放器。
4. **新应用 `src/apps/bedtime.js`（睡前故事，order 23，`emoji:🌙`，espresso）**：
   - 视图 `studio`（创作台：模式切换 + 主题/风格/年龄/篇幅 chips + 自定义提示词与模板 + 最终提示词预览）/ `script`（文稿页：改标题、直接编辑正文、实时字数与预计时长、换音色、重新分段、合成并播放、存收藏）/ `player`（段落列表 + 状态 + 粘性播放条）/ `fav`（收藏夹）。
   - 播放流水线：`prepParas()` → `splitForTTS(script, 60)`；`synthOne(i)` 带 `S.pending[i]` 去重、`S.paraState[i]` 状态机（0 待合成 / 1 生成中 / 2 就绪 / 3 失败）、**自动模式失败就 `S.directMode = true` 后递归重试一次**（⚠️ catch 里必须 `delete S.pending[i]` 再递归，否则命中「已有 pending」直接返回自己那个正在 reject 的 Promise → 死锁）；`prefetch(i+1)` 让下一段趁播放时准备好；`playIndex(i)` 用 `new Audio(url)` + `onended` 串下一段，播放前 `stopPlayer()`。
   - 底部播放条：上一段 / 播放暂停 / 下一段 / 停止、全部合成（可中途停）、连续播放开关、**定时停止**（15/30/60 分钟或「念完这段就停」）、存收藏、导出音频（逐段 wav，`U.downloadBlob`，350ms 间隔防多文件下载被拦）。
   - 收藏夹：`stories` 存在 `ctx.store('stories')`，上限 80 篇；**再存同一篇是覆盖**（`S.storyId`）；单篇导出 TXT/JSON、整夹导出 JSON；**音频不进收藏**（几 MB 起，会撑爆 localStorage），每次播放现合成。
   - `cleanScript()`：去 markdown/emoji/括号星号、半角标点转全角、**直引号配成中文弯引号**、**阿拉伯数字转汉字**（`numToCn`，0~9999）、**去掉中文之间的空格**（TTS 会把空格当停顿）。`estimateSeconds(chars, speed) = chars / (4.6 × speed)`。
   - 深色深夜配色，靠应用自己注入的 `#bedtime-theme-css`（`#apps .app-host[data-app-id="bedtime"]` 前缀），窗口底色仍是**完全不透明**的实色渐变（符合用户对「应用窗口不许透明」的要求）。
   - 测试把手：`mount.__test = { clean, num, prompt, estimate, fmtDur, storyToText, safeName, css, styles(), lengths(), controller() }`，`controller()` 每次 mount 刷新（注册表浅拷贝只保留 mount，所以必须挂在 mount 上，见第 8 节）。
5. **测试**：smoke 新增四节（长文创作接口 / 语音合成 / 睡前故事 / 设置界面），并把 `verify-html.mjs` 的应用数与 script 块数从 11/13 改成 **12/14**。
   - 桩细节：`g.fetch` 要返回 `arrayBuffer: () => Promise.resolve(new ArrayBuffer(n))`；`defineGlobal('Audio', class{...play(){return Promise.resolve()}})` 才能跑通合成与播放分支；`URL.createObjectURL` 在测试里恒返回 `'blob:fake'`。
   - ⚠️ 断言「多段合成」时，正文要**够长**（每段目标 60 字，短句会被合并成一段），否则 `paras[1]` 不存在会误判成 bug。

**v1.4.1**（用户对 UNO 的三条反馈 + 一个新需求）：

1. **「三个 AI 分别位于屏幕左右上三侧」**：原来是 `.uno-opps` 一横排。现在 `.uno-table` 是 **3×3 grid**，`grid-template-areas` 为 `". top ." / "left center right" / ". bottom ."`，三个 AI 分别进 `.uno-seat-top / -left / -right`，**玩家在 `.uno-seat-bottom`**（这个座位节点在 `wrap` 里、不在 table 里，因为手牌区要占满宽度）。`SEAT_NAMES = ['bottom','left','top','right']` 把「座位号 0..3」映射到方位的 CSS 类，**渲染 / 动画 / 测试都用它**，改布局只改这一处。
   - 座位号与方位是**逆时针**：0=下（你）、1=左、2=上、3=右（和 `direction = +1` 的顺时针出牌一致：你 → 左 → 上 → 右 → 你）。
   - 紧凑面板：上方那颗宽 168px，左右两颗宽 98px；AI 手牌背面是名字下面的小扇子（`.uno-bk + .uno-bk{margin-left:-6px}`，最多 `MAX_HAND = 12` 张，超出显示 `.uno-more` 的 `+N`）。
   - 气泡按座位朝向：上 `.uno-bub{top:-16px}`、左 `left:calc(100%+4px)`、右 `right:calc(100%+4px)`，玩家那颗在名字行里（`position:static`）。
2. **「出牌应该都在中央，不要出成两叠」**：现在**唯一的弃牌堆固定在 `.uno-center`（grid 中格）**，四人打出的牌都进它；另外给新打出的牌加 `fly-bottom/-left/-top/-right` 动画（`@keyframes unoFlyB/T/L/R`），**从出牌人那个方向飞向中央**。用 `lastPlayer` 记录出牌人，`renderPile()` 消费一次后置回 -1，所以只有新牌会动、重绘不会乱飞。
   - ⚠️ **踩过的坑（用户反馈「牌落在弃牌堆下方、还是两叠」）**：第一版 `renderPile()` 用 `while (pile.children.length > 1) pile.removeChild(pile.children[0])` 清理旧牌，**假设颜色标签永远在 children[0]**。实际第二次渲染时那个位置已经变成一张牌 → 每渲染一次就**误删标签、留下一张旧牌**，弃牌堆越叠越多，视觉上就是「另一叠牌堆在弃牌堆下面」。现在改成用 `pileCards` 数组记着自己画了哪几张，重绘时**逐张 `removeChild`**，不再依赖子节点顺序；CSS 里 `.uno-pile .uno-card{position:absolute;left:0;top:0}` 保证所有牌**真的重叠在同一格**（之前只是普通文档流，所以会排到下面去）。
   - 回归断言（smoke）：开局弃牌堆 = `颜色标签 + 1 张`、连打多张后 = `颜色标签 + 最近 3 张`、永远只有 1 个 `.pile-top`、且 `.uno-pile .uno-card` 的 CSS 必须是 `position:absolute`。
   - 牌桌下方的 `#centerInfo`（方向 + 牌堆剩几张）和 `msgEl` 提示条是普通 flex 行，不在牌桌里。
3. **「AI 出牌太快」**：`scheduleAi()` 里原来写死 `620 + random*420`ms → 现在统一走 `aiDelay(base)` = `clamp(400..2500, aiTempo) × base` + 最多 40% 随机，`aiTempo` **默认 1000ms**（出牌 1.0、摸牌后再出 0.9、跳过 0.7、摸不到牌 0.6）。玩家可在角色面板里拖滑杆改（`store('tempo')`）。
4. **角色自定义（新功能）**：标题栏「🎭 角色」→ `openCast()` 打开 `.uno-edit` 浮层（打开时 `castOpen = true`，`canHumanAct()` 会拦住出牌）。浮层里四行（自己 + 3 个 AI），每行：头像输入框（自由粘贴 emoji）+ 名字输入框（`MAX_NAME = 6` 字）+ 22 个内置 emoji 快捷键；底部还有 `AI 出牌间隔` 滑杆。`saveCast()` 写入 `store('cast')`（`{me:{name,avatar}, ai:[{name,avatar}×3]}`）并立刻重绘；`resetCast()` 回默认。
   - `profiles[0]` 是玩家、`1..3` 是 AI，**性格（chat/catchy）在 mount 时从模块级 `AI_PROFILES` 深拷过来**，自定义只覆盖 name/avatar，所以话痨度这些仍然跟着 `AI_PROFILES` 走。`nameOf/avatarOf/baseOf` 全部改成读 `profiles`。
   - 改名/换头像后，气泡、日志、结算文案都会跟着变（都走 `nameOf()`）。
   - 测试：`mount.__controller` 增加了 `profiles()/tempo()/setTempo()/openCast()/saveCast()/resetCast()/castOpen()/seatOf()/avatarOf()`。

**v1.4**（用户要求新增两个游戏：五子棋带「求助」、UNO 带概率表情；两个都**不调用对话接口**）：
1. **五子棋 `src/games/gomoku.js`**（`id:'gomoku'`，`order:12`，`color:'espresso'`，图标 `svg:target`）：
   - 引擎全是纯函数（`src` 顶部，**不碰 DOM**）：`PAT` 棋型分值表（1~5 连 × 活/死）、`lineStr()` 取线 + `pointScore()` 算单点四方向最强两种棋型（0.35 权重避免十字重复计分）、`ranked()` 候选点排序（`atk + 0.9*def`，自己成五 +8×WIN、必须堵五 +7×WIN、堵冲四 +300000）、`alphabeta()` 极简负极大搜索、`findBestMove()` 统一入口、`pickMove()` 按难度加噪声（简单 40% / 普通 12% / 困难 0%）。
   - 候选点只取「已有棋子周围 2 格内的空点」（`candidates()`），顶层最多 8 个（`findBestMove` 里写死 `Math.min(limit||8, 8)`）——**实测中局深度 4 单步约 70~90ms**，手机上够用；别随手把 8 调大。
   - 棋盘是 **Canvas**（木色底 + 网格 + 星位 + 径向渐变棋子 + 最后一手红圈）。交互：`canvas` 上 `pointerdown`（要判 `e.button`，测试里不传 button 会被挡掉）与 `touchstart` 兜底；坐标用 `getBoundingClientRect` + `metric`（`posOf/cellFromPoint`）。
   - **求助**：标题栏「💡 求助」按钮（也支持 `H` 键）→ `doHint()` 调 `findBestMove(board, 1, 4, 8)`（永远用最高难度给玩家算），把 `hintPos` 画成浮动层 `.gomoku-hintDot`（金色虚线，`placeHintDot()` 定位）。开局第一步直接推荐天元 `idx(7,7)`。
   - 悔棋 `U`：`undo()` 先撤电脑那一手再撤自己那一手（靠 `board[p]` 的 1/2 判断归属，玩家永远执黑先行）。三档难度存在 `store('difficulty')`。
   - 测试把手：`mount.__test.engine()`（引擎纯函数）与 `mount.__test.state()`（局内状态快照，**必须写在 mount 里面**才能读到 `board/metric/turn`）。
2. **UNO `src/games/uno.js`**（`id:'uno'`，`order:13`，图标 `emoji:🃏`）：
   - 牌堆/规则是模块级纯函数：`buildDeck()`（108 张：四色 0 一张 + 1~9 各两张 + 三种功能牌各两张 + 4 变色 + 4 变色+4）、`canPlay()`（**变色+4 在手里还有能跟的牌时不许打**，标准规则）、`playableList()`、`valueText/cornerText/cardName`。
   - 局内是 `hands[4]` + `deck/discard/color/turn/direction/phase` 状态机；`phase` 取 `idle|human|ai|over`。`resolveEffect()` 处理 +2/+4/禁止/反转（返回「被跳过的座位」），`playCard()` 统一走「移除手牌 → 压弃牌堆 → 定颜色 → 结算效果 → UNO 检查 → 推进回合 → `afterMove()`」。
   - **喊 UNO 与抓人**：`unoCheck(who)` 里 AI 有 **30% 概率忘记喊**，忘了就 `openCatchWindow()` 开 3.4 秒窗口 —— 底部冒「🙋 抓 X！」按钮（玩家点 `humanCatch()`），同时每个 AI 按性格 `catchy`（0.30~0.55）掷骰子延迟 0.9~2.5 秒来抓；抓到罚摸 2 张。玩家自己忘了就点「喊 UNO」自救（`humanSayUno()` 会作废抓牌窗口）。
   - **概率表情（本游戏的核心诉求）**：`EXPR_RULES` 规则表（`{ev, min/max/val, prob, e, t}`）+ `AI_PROFILES[].chat` 话痨度（自定义角色后仍然跟着默认配置走），`chooseRule()` 按 `prob + base` 加权抽一条，`exprTick()` 再掷一次 `rnd()*100 < min(95, prob+base)` —— **两次随机，所以同一局面有时发、有时不发**。`base` 就是角色话痨度（玩家 8 / 小圆 6 / 阿蓝 -4 / 喵喵 14）。想调「话多话少」只改 `chat` 与规则里的 `prob`。
   - 覆盖 20+ 情境：`penalty`(被 +2/+4，min≥4 与 min≥1 两档)、`play`(val=draw2/wild4/skip/reverse/wild/普通牌)、`uno/safe/caught/catch/someoneUno`、`draw`、`skipped`、`tense`(对手只剩一张)、`win/lose`、以及 `*` 兜底碎碎念。AI 之间也会互相抓、互相抱怨；玩家打功能牌也会 `react(0, ...)`。气泡 2.4 秒后自动隐藏。
   - 测试把手：`mount.__test.engine`（纯函数）与 `mount.__test.controller()`（局内控制把手，每次 mount 刷新）。
3. **两个应用都挂在 `mount` 上暴露测试把手**，原因见第 8 节「注册表会浅拷贝定义」那条。

**v1.3.4**（用户澄清「重复」= **跨组**重复；并要求改成用 AI 润色而不是硬裁）：

1. **跨组不重复**：`K_TOPICS` 每项改成 `qs: [问法1, 问法2, 问法3]`，`knowledgeTopics()` 按 `knowledgeRound % qs.length` 轮换（`knowledgeNextRound()` 每次生成 +1）——以前写死一句检索词，反复查当然返回同一批；再加**跨组记忆** `knowledgeSeen`（settings 键，最多 120 条，记 `{k: 内容指纹, u: URL}`），`chooseCards(board, seen)` 分三档挑卡：全新+非万能页 → 全新 → 复用旧的（打 `repeat` 标记）。整组都是 `repeat` 时**不覆盖上一组**，只提示「这次没取到新内容」。`knowledge.seenCount()/forgetSeen()` 对外暴露，设置页有「忘记看过的卡」。
2. **AI 润色**：新增 `polishCards(picked, board)` —— 把每个话题的候选（前 2 条、每条 ≤400 字）打成 `[i] 话题：xx（检索词：xx）` 的清单，一次 `apiChat(..., {json:true})` 让对话模型按 `{"cards":[{"i":0,"title":"...","summary":"..."}]}` 输出「≤20 字标题 + 60~100 字摘要」，回填时保留 `k/u/q/o/repeat` 并把原文塞进 `card.full`（「展开全文」仍可看原件），打 `polished=1`。开关 `knowledgePolish`（默认 true，`knowledge.polish()/setPolish()`），没绑对话模型 / 请求失败自动退回裁剪原文。
3. 顺带修了两个真 bug（写测试时暴露的）：①补检索以前重查 `topics[0..missing-1]`（**前 N 个**话题）而不是**空着的**那几个，会把同一话题的卡塞进一组 → 改成按 `have[o]` 过滤；②`chooseCards` 用 `usedTopic[o]` 保证**一个话题只出一张卡**。
4. 测试注意：桩 `fetch` 里如果把递增计数器写在 `text: () => ...` 的闭包里（而不是先 `const k = ++seq` 锁住），所有响应会返回同一个序号，看起来像产品 bug ——第 3 条的两个 bug 就是这么被"歪打正着"发现的。

**v1.3.3**（用户反馈「知识卡内容都相同 / 字小 / 字多且没换行」）：

1. **十张卡一模一样**：原来每个话题只取 `items[0]`，而 Tavily 这类接口对相近查询经常返回同一页（聚合站首页之类）→ 整组卡是同一段文字。现在 `knowledgeGenerate` 改成**先收候选、最后统一选卡**：`collect()` 把每个话题的候选（`count: 3`）都放进 `board`，全部跑完后交给 `chooseCards(board)` —— 它先统计每条候选被**多少个话题**命中过（`freq`，按 `cardKey` + 裸 URL 两个维度），命中率 ≥ 1/3 的判为「万能页」优先跳过，再按话题顺序逐题挑一条没被用过的；一轮下来不足 10 张就换说法（`q + ' 最新进展 相关报道'`）再补一轮候选后重新选一次。给每张卡带上 `q`（所用检索词）和 `o`（话题序，用于排序），少于 10 张时 toast 说明「重复内容已自动去掉」。
2. **字小**：`core.css` 的 `.ss-summary` 13px→16px（行高 1.75）、`.ss-title` 16.5px→18px，分类/序号/来源行同步放大。
3. **字多且没换行**：`K_SUMMARY_MAX` 180→110；换行丢失的根因在 `parseSearchItems` 的 `push()` 里 `.replace(/\s+/g,' ')` 把 `\n` 也压掉了 → 改用新的 `normText()`（统一换行、压缩空格，但**保留段落换行**），配合 `.ss-summary{white-space:pre-line}` 正常分段。

**v1.3.2**（用户反馈「知识卡里糊一大段内容」）：根因是 Tavily 这类搜索接口的 `content` 字段经常是整页正文，之前 `summary: it.snippet` 原样塞进卡片，把卡片撑爆、把时钟和箭头顶出屏幕。修法分三层 ——
① **生成时裁剪**：新增 `trimText(text, max)`（归一化空白 → 按 max 截断 → 尽量在 `。！？；、，`/`. ! ; ,`/空格处断开 → 去尾部标点 → 加 `…`），`makeCard(cat, it)` 统一造卡：标题 46 字（`K_TITLE_MAX`）、摘要 180 字（`K_SUMMARY_MAX`），长文另存 `card.full`（最多 1500 字 `K_FULL_MAX`）；`modelCards()` 也改走 `makeCard`，并在提示词里要求 summary 40~90 字。
② **版面兜底**：`.ss-title` 2 行、`.ss-summary` 6 行 `-webkit-line-clamp`，`.ss-stage` 可滚（`max-height:100%;min-height:0;overflow-y:auto`），来源行省略号截断；卡片头新增 `#ss-more`「展开全文」按钮（`kExpanded` 状态控制，展开时 `.ss-summary.expanded` 限高 220px 可滚，切卡/换组自动收起）。
③ 测试：smoke 里用 900 字 `content` 的桩断言摘要 ≤180 且以 `…` 结尾、标题 ≤46、在句子边界断开、`full` 保留。新增 UI 元素记得同步两个测试文件的 `PAGE_IDS`（这次漏了 `ss-more`，测试直接报 TypeError）。

**v1.3.1**（用户对 v1.3 的四条反馈）：

1. **模型名自动检测**：`phone.apis.models(id)` 调 `GET {baseUrl}/models`（超时压到 30 秒，兼容 `{data:[{id}]}` / `{models:[{name}]}` / 字符串数组，去重 + 排序），设置里模型名字段右边加「拉取列表」按钮 → 拉到后出现下拉框。拉列表前会先**宽松保存**草稿（`apiSave(def, {allowIncomplete:true})`，跳过「必须填模型名」校验），否则第一次用根本存不下来。
2. **API Key 显隐**：Key 输入框右边「👁 显示 / 🙈 隐藏」按钮，直接改 `input.type`（不重绘，值不丢），可见状态存在 mount 作用域的 `keyVisible`。
3. **息屏退出方式**（用户要求：鼠标动不要退出，按键才退出）：`markActivity()` 现在只更新时间戳、**永不自己退出**；退出只有两条路 —— ① `document` 上**捕获阶段**的 keydown（`preventDefault + stopPropagation`，避免这一下按键落到屏保下面的输入框里）②屏保上的「返回（Esc）」按钮。点击屏保空白处也不再退出（防误触）。
4. **修「还没配接口就能生成知识卡」**：根因 ① `apiMigrate()` 会把旧版「AI 创作」里的接口配置静默迁成一条 chat 接口（用户会觉得「我没配过」）→ 现在迁移完成会弹 toast 说明；② `knowledgeGenerate` 在没有 search 接口时会**自动**退化成 `modelCards(chat)` 让模型编 → 现在由 `knowledgeFallback` 设置**显式控制，默认 false**，关着时只显示「请去配置联网检索接口」的提示卡。开关在 API 管理页（`phone.knowledge.fallback()/setFallback(on)`）。

**内核里修过的逻辑缺陷**（都有测试兜底）：`compileAppCode` 返回了 `createApp` 本身而非调用结果；`layout.makeFolder` 漏了下标（`layout.pages[p] = f`）会吞掉同槽位应用；拖拽时若一个中间 pointermove 都没收到就松手，落点会丢失（已用松手坐标兜底）。

---

## 8. 测试脚手架的关键知识（改测试时会用到）

两个测试文件共用一套**假 DOM**，几个必须模仿真实浏览器语义的地方（都踩过坑）：

- `dataset` 必须与属性双向同步（否则 `[data-grid]` 这类选择器匹配不到）→ `makeDataset(el)` Proxy。
- `closest()` 要支持**逗号选择器列表**（内核用了 `.app-item, .slot-hint, ...`）。
- 元素上的 `pointermove` **不会**冒泡到 `document`（真实浏览器会）→ 测试里两边都要派发。
- `document.addEventListener` 要真的能存监听并 `dispatch`（否则内核挂在 document 上的拖拽收尾逻辑测不到）。
- 长按阈值是 **380ms**；测试里 `setTimeout` 要等 ~430ms。
- 测试里拿到的 DOM 节点必须**在最后一次 renderHome 之后**重新查询，否则拿到已脱离 DOM 的旧节点。
- 假 DOM 下 `document.readyState` 恒为 `complete`，所以 boot 会在 core 脚本执行时就跑完、此时插件还没注册 → 测试里要调 `phone.rebind()` 重载注册表（真实浏览器不需要）。
- Canvas 桩要提供 `createLinearGradient()` 且返回值自带 `addColorStop`。
- **新增 UI 元素（如 `#screensaver`）要同步加进两个测试文件的 `PAGE_IDS`**，否则 `$('#xx')` 拿到 null（内核里都有 null 兜底，但功能就测不到了）。
- **假 DOM 的 `innerHTML` 不会解析成子节点**：用 `innerHTML` 写进去的内容只能用 `.innerHTML` 断言（阅读器的检索高亮、`U.md` 渲染的回答都是这种情况）。
- **事件不会在假 DOM 里冒泡**：监听挂在 `root` 上时，要往 `root`（也就是 `.app-body`）派发，而不是往某个段落节点派发。
- **异步接口调用要用桩 `fetch`**：smoke 里默认 `fetch` 是 reject；新加的网络流程测试用 `g.fetch = () => Promise.resolve({ ok:true, status:200, text:()=>Promise.resolve(JSON.stringify({...})) })`，并且记得 `await` 到 Promise 链结束（`phone.knowledge.next()` 之类会把 Promise 返回出来）。
- 假 DOM 里**不要用 `lastChild`/`firstChild`/`offsetParent` 这些没实现的属性**（会 TypeError）；`children`/`parentNode`/`all()`/`find()`/`count()` 是有的。
- **取音频用的是 `res.arrayBuffer()`**：桩 fetch 里要补上 `arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))`，否则语音相关流程根本测不到。
- **假 DOM 里没有 `Audio`**：要跑通「合成 → 播放」分支得 `defineGlobal('Audio', class { constructor(src){ this.src = src; } play(){ return Promise.resolve(); } pause(){} })`；应用侧统一用 `typeof Audio === 'function'` 兜底，测试里 `URL.createObjectURL` 恒返回 `'blob:fake'`。
- `navigator.clipboard` 要用 `g.navigator.clipboard = { writeText }` 打桩，否则 `phone.utils.copy` 走 `document.execCommand` 兜底（假 DOM 没实现，返回 false）。
- **注册表会浅拷贝应用定义**：`loadRegistry()` 里对内置应用做 `Object.assign({}, def)` 再 `normalizeApp()`，**只保留 id/name/icon/color/desc/order/builtin/mount**。所以应用想给测试留把手（引擎函数、局内状态快照），要挂在 **`mount` 函数对象上**（`mount.__test = {...}`），测试里用 `phone.getApp('id').mount.__test.xxx()`；挂在定义对象上的自定义字段会被丢掉。
- **假 DOM 挂载内置应用后要跑一遍 `ctx.onCleanup` 收集到的清理函数**（smoke 的「内置应用挂载与打开检查」循环里已经这么做了）。否则应用里排的定时器会漏到后面的测试里：UNO 会自己排 AI 回合，测试跑着跑着「你的手牌」就莫名变成 9 张（这个坑我踩了半天，`__controller` 指向的实例被旧定时器接着驱动）。
- **断言不要假设随机发牌的结果**：UNO 开局明牌若是「+2」，先手玩家起手就是 9 张而不是 7 张；若是「反转」，**下家就不是 1 号座了**（先手变成 3 号座、方向 -1）。所以测 +2 时要按 `(0 + ctrl.direction() + 4) % 4` 算真正的下家，别写死 `hands()[1]`——我就是这么踩了一次「7 → 7」的假 bug。
- **选择器不要用可能是其它类名前缀的类**：假 DOM 的 `matches()` 用 `[\w-]+` 抓类名，`.emoji` 会匹配到 `uno-in-emoji`？不会，但它会把 `.nm` 匹配到 `uno-nm`（classList 里存的是完整 token，`contains('nm')` 为 false），所以当时那 4 个 `.nm` 其实选到的是 **.uno-nm 名字标签**（数量恰好也是 4，掩盖了错误）。新增类名要么唯一、要么带前缀（现在用 `uno-in-name` / `uno-in-emoji`）。
- **假 DOM 里「子节点顺序」比真实浏览器更容易出错**：UNO 弃牌堆那个「越叠越多」的 bug，就是代码里假设了「颜色标签一定是 `children[0]`」。写清理逻辑时按**自己登记的节点列表**删除，别按索引猜。
- **CSS 断言可以直接问应用要样式文本**：假 DOM 的 `createElement` 不注册 id，`document.getElementById('uno-style')` 拿不到注入的 `<style>`。UNO 把 `CSS` 挂在 `mount.__test.css` 给测试用（其它应用要断言样式可以照这个来）。
- **异步测试段要包在 `async` 里**：smoke 有 `await new Promise(r => setTimeout(r, 430))` 这类等待（长按、电脑应手），定时器会在这段时间里真正跑起来；新增的异步断言要放在这些等待之后、并且不要把「同时被界面驱动的那一局」当成被测对象（要么用隔离实例自己 mount 一份，要么只断言界面结构）。
- **拼图的拖拽测试要走真事件**：`.pz-item` 上派发 `pointerdown`，再往 **document** 派发 `pointermove`（先纵向拉出 7px 让 `drag.active = true`）和 `pointerup`。假 DOM 的 `getBoundingClientRect()` 恒返回 `{left:0,top:0,width:368,height:640}`，所以要用 `controller.boardPointToClient(x,y)` 把底板坐标反算成 client 坐标，**别手写像素**（底板尺寸跟图片/可用区域都有关）。
- **拼图的图片导入要桩 `Image` 与 `FileReader`**：`FileReader` 补 `readAsDataURL()`（同步设置 `this.result` 并调 `this.onload`），`Image` 用 class + `set src()`（设置 `naturalWidth/naturalHeight` 后同步调 `onload`）。**这两处桩会影响后面的测试，记得先把 `g.Image` / `g.FileReader` 存起来，测完再 `defineGlobal` 还原**（原来那个 `FileReader` 只有 `readAsText`，被换掉后阅读器之类的路径就跑不了）。
- **几何正确性别逐点硬比**：异形拼图的凸起是 18 个采样点的折线，逐点比容易因为浮点/顺序写错。用 **shoelace 面积求和 = 底板面积**（不重叠不漏空）＋ **点在多边形内**（凸起两侧分属两片）两条不变式最稳。
- **拼图 mount 之后要 `await C.ready()`**：v1.7.0 起启动流程是「先异步读存档（IndexedDB/localStorage），没有才装示例图」，同步断言拿到的是空局。另外 `controller.boardPointToClient()` / `toBoard()` 已经带上了 zoom/pan 和假 DOM 的 rect 缩放补偿，测坐标一致性直接用它俩互转即可。
- **拼图的保存测试要桩 `canvas.toDataURL()`**：`FakeEl` 已经补了 `toDataURL()`（返回 `data:image/jpeg;base64,FAKE`）。测 IndexedDB 主路径时用 `defineGlobal('indexedDB', 假实现)`：`open()` 返回 `{onupgradeneeded,onsuccess,result}`，`transaction().objectStore()` 提供 `put/get/delete` 并异步回调 `onsuccess`；**测完记得还原 `g.indexedDB` 并清空假数据**。localStorage 兜底路径不需要桩。
- **拼图的存档要「收尾」**：实例退出时只要 `placed > 0 && !over` 就会补一份存档，会污染后面的用例。测试里要么先 `placeAll()` 让这局结束（`finish()` 会清存档），要么测完手动删 `pz.save.state` / `pz.save.image`。

**沙箱限制**：本机 DSH 沙箱里**浏览器进程起不来**（命名管道被禁，`mojo platform_channel` EPERM），所以**无法做真实浏览器验收**——只能靠上面两个测试 + 让用户人工确认。不要重复尝试启动浏览器。

---

## 9. 已知待办 / 可以接着做

- 更多内置小游戏（俄罗斯方块、扫雷、翻牌记忆、打砖块……）：直接加 `src/games/xxx.js` 即可，框架不用动。
- **睡前故事**：音频缓存到 IndexedDB（现在关掉应用就回收 objectURL，重听要重新合成）；多角色对白（同一篇里不同角色换不同音色，`phone.tts.synth` 已经支持逐段传不同 `tts` 参数，只差 UI）；背景音乐与淡入淡出；连载「第 N 集」；把收藏夹做成可导入导出整包（现在导出 JSON 只能看不能导回）。
- **同步启动**：目前只能靠「导出 ini 放进小手机文件夹」这一步手动搬运（浏览器写不了任意路径）。如果以后愿意加一个常驻的本地小助手（例如 PowerShell HttpListener 监听 127.0.0.1），就能做成应用里点一下「启动 GPT-SoVITS」；另外可以考虑自动探测常见整合包目录来预填 workdir。
- **语音合成**：给 GPT-SoVITS 加一个「拉取音色列表」的能力（服务端没有标准接口，可考虑让用户填一个目录/清单）；流式播放（现在是逐段拼接，等效流式，但没有 `streaming_mode` 的 chunk 合并）；音频波形/进度条（现在只有段级的播放中状态）。
- 五子棋：棋谱回放 / 复盘、禁手规则（三三、四四）、在线难度自适应（按胜率调）。
- **拼图**：碎片旋转（增加难度，要改 `tryPlace` 的判定与预渲染角度）；多存档位（现在只有「当前这一局」一个存档，换图/换片数后再放一片会覆盖旧进度）；碎片边缘加立体高光/投影（现在只有 1px 描边）；缩略图缓存（现在滚动时按窗口现画）；「自动拼一片」的提示；按完成度/用时给星级评分。
- UNO：+2 / +4 叠加（现在不叠）、AI 之间「结盟 / 针对」的小心思、把表情规则做成可配置（现在写在 `EXPR_RULES` 里）、给角色加「话痨度」滑杆（现在只有改代码才能调）。
- 阅读器：书签、按「第 x 章」自动识别目录、按章节总结；正文虚拟滚动（现在是每 60 段一页手动「继续加载」）。
- 知识卡：收藏卡片、自定义话题列表（现在是内核里写死的 `K_TOPICS` 10 个话题）、卡片里点开原文链接。
- 长按图标弹出上下文菜单（重命名、卸载、置顶、加入文件夹）。
- 插件权限提示 / 沙箱开关（导入他人插件时更放心）。
- 更多壁纸与配色（全部代码生成）。
- 桌面分页目前固定 3 页（`PAGE_COUNT`），可改成按应用数量动态增减。

---

## 10. 用户接下来想做的事

v1.7.0 按反馈给拼图加了「更高难度（最高 1000 片）+ 缩放 + 保存 + 提示开关」：**先让用户在真机上验收这几项**（本机沙箱起不来浏览器，只能靠两个测试 + 人工确认）：

1. **1000 片**：选 1000 片（异形），确认 ①能正常切出来、不白屏 ②自动放大到 220% 后格子看得清 ③左右拖底板、滚轮/双指缩放顺不顺 ④放一片进去是否正常、会不会卡。
2. **缩放 / 平移**：`+ −` 按钮、点百分比回 100%、鼠标滚轮缩放、手机上双指捏合；放大后单指拖底板平移；确认**点按放置**和**拖动平移**不会互相误触。
3. **保存 / 恢复**：拼几片（比如 200 片拼 5~10 片）→ 直接关掉应用/关浏览器 → 重新打开 `phone.html` → 是否提示「已恢复上次的拼图」、已拼碎片/列表顺序/用时/缩放位置是否都对；再点 💾 手动保存看提示。
4. **大图保存**：导入一张手机原图（几 MB）拼两片 → 关掉重开，确认 IndexedDB 这条路能存能读；如果浏览器隐私模式不让存，看是否给出「图片太大 / 存储不可用」的提示而不是静默失败。
5. **🎯 开关**：关掉绿色吸附提示后再拖，确认没有绿框、但仍然能吸附；再打开看是否恢复；重启后开关状态是否记住。
6. **列表虚拟滚动**：1000 片时左右滑列表是否流畅、缩略图会不会错位/空白（快速滑动时可能出现半帧空白，属正常）。
7. **辅助与成绩**：「💡 提示」会不会自动把画面移到那一片；「👁 看原图」在放大状态下是否正常；拼完结算与最好成绩；6 / 24 / 100 / 1000 片各试一局看布局和留白。
8. **旧功能回归**：睡前故事 / 同步启动 / 音色库那几项（见 v1.5.1）如果还没验收过，一并看。

继续加功能照第 3 节的闭环：改 `src/` → `node build.mjs` → `node tests/smoke.mjs && node tests/verify-html.mjs` → 让用户刷新 `phone.html` 看效果。

---

## 11. 上传到 GitHub / 隐私清单

> 这一节是给「把整个文件夹拖到 GitHub」之前看的。结论先说：**项目代码里没有账号密码**，
> 但有几样本机运行痕迹不适合公开；而真正的个人数据（便签、接口 Key、阅读进度、睡前故事、音色、拼图存档）
> **根本不在这个文件夹里**，它们存在浏览器的 localStorage / IndexedDB 里。

### 11.1 哪些是本机私有、不要上传

| 文件 / 目录 | 里面有什么 | 处理 |
|---|---|---|
| `gptsovits-launch.ini` | 本机 GPT-SoVITS 的**绝对目录**和启动命令（可能带用户名/盘符） | 不传；已写进 `.gitignore` |
| `*.lnk`（例如 `phone.html - 快捷方式.lnk`） | Windows 快捷方式，二进制里带**本机绝对路径**（例如 `E:\<你的路径>\phone.html`） | 不传 / 删除；已写进 `.gitignore` |
| `tmp/` | 几十个开发调试脚本，里面硬编码了本机绝对路径（如 `E:\<你的路径>\tmp\...`） | 不传 / 删除；已写进 `.gitignore` |
| `phoneshell-backup-*.json` | 「设置 → 导出全部备份」导出的文件：**接口配置（含 API Key）+ 全部应用存档** | 绝对不传；已写进 `.gitignore` |
| `*.phoneapp.json` | 本地导出的插件包（一般只有代码，但属于本地导出物） | 不传；已写进 `.gitignore` |
| 自己的参考音频（`*.wav`）、照片、截图原图 | 可能含个人声音/照片 | 传到别处，不要放进仓库 |

**可以放心上传的**：`phone.html`、`build.mjs`、`src/`、`tests/`、三个 `.bat`、`README.md`、`MANUAL.md`、`HANDOFF.md`、`.gitignore`。
`phone.html` 是构建产物，里面只有代码，不含 localStorage/IndexedDB 数据；测试里的 `sk-test` 是**假的测试密钥**，不是真 Key。

### 11.2 真正的个人数据在哪里

以下内容**不会**随着文件夹上传（它们在浏览器配置目录里，不在项目目录）：

- 「设置 → API 管理」里的接口地址 / API Key / 音色库路径；
- 便签内容、阅读器导入的书与进度、睡前故事收藏夹；
- 拼图的存档与导入的照片（IndexedDB 的 `phoneshell-puzzle`）；
- 桌面布局、壁纸、息屏设置。

> 另外：使用 AI 创作 / 总结 / 知识卡 / 语音时，相关文本会发给你**自己在「API 管理」里配置的接口**——这是功能本身，不是仓库泄露；本仓库不包含这些数据，也没有自己的服务器。

注意：如果换到 GitHub Pages 之类的**新域名**打开，浏览器会把它当成新站点，原来的本地数据不会跟过去（也不会泄露）——想迁移就用「导出全部备份 / 导入备份」，但那个 JSON 里有机密，别传仓库。

### 11.3 两种上传方式

**A. 用 git（推荐，`.gitignore` 会自动生效）**

```powershell
git init
git add .
git status          # 确认列表里没有 gptsovits-launch.ini / *.lnk / tmp/ / phoneshell-backup-*.json
git commit -m "PhoneShell v1.7.0"
git remote add origin <你的仓库地址>
git push -u origin main
```

**B. GitHub 网页「拖文件夹」上传（不读取 `.gitignore`）**

拖拽前先把这些移出/删掉，再拖：

- `gptsovits-launch.ini`（如果存在）
- `phone.html - 快捷方式.lnk`（或任何 `*.lnk`）
- `tmp/` 整个目录
- `phoneshell-backup-*.json`（如果导出过）

或者只把白名单文件拖上去（见 11.1 末尾）。

### 11.4 上传前自检（PowerShell）

在项目根目录跑，**没有输出就说明上面列出的敏感文件都不在**：

```powershell
Get-ChildItem -Recurse -Force -File |
  Where-Object {
    $_.Name -match '^gptsovits-launch\.ini$|\.lnk$|^phoneshell-backup-.*\.json$|\.phoneapp\.json$' -or
    $_.FullName -match '\\tmp\\'
  } |
  Select-Object FullName
```

再顺手扫一眼有没有真实密钥（正常应该没有输出；测试里的 `sk-test` 只有 7 个字符，不会命中 16 位以上的规则）：

```powershell
Get-ChildItem -Recurse -File -Include *.js,*.mjs,*.html,*.md,*.bat,*.json |
  Select-String -Pattern 'sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9\-_]{20,}' -Encoding UTF8 |
  Select-Object Path, LineNumber, Line
```

### 11.5 如果已经手滑传了

- **真实 API Key**：先去服务商后台**作废/重新生成**，这比删文件更重要。
- `gptsovits-launch.ini` / 备份 JSON：从仓库删除还不够，Git 历史里仍然能翻到；要用 `git filter-repo` 或 BFG 清历史，然后强推。
- 只是 `.lnk` / `tmp/`：删掉再提交一次即可（没有密钥风险，只是本机路径）。

