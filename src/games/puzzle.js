/* ============================================================
   内置游戏 · 拼图（经典方块 / 异形咬合，可导入自己的图片）
   ------------------------------------------------------------
   设计要点（改代码前先看这几条）：
   1. 底板的**长宽比完全跟图片走**：fitBox() 在可用空间里等比缩放；
   2. 片数只决定「行数 × 列数」，实际片数 = rows × cols（尽量贴近所选片数），
      最大 1000 片；
   3. 经典 = 矩形切块；异形 = 相邻两片**共享同一条绝对边缘曲线**，
      一片的凸起正好是另一片的凹口，所以永远不会有缝；
   4. 未拼的碎片放在下方**横向可滑动列表**里，拖到正确位置附近自动吸附；
      横向滑动列表 = 滚动，纵向拖动 = 拿起碎片（靠 pointermove 判方向）；
   5. **可缩放/平移**：画布按视口铺满，底板用 transform 画；
      放大后只有屏幕里看得见的碎片会参与绘制（culling），1000 片也不卡；
   6. 进度**自动保存**（IndexedDB，降级 localStorage），重新打开自动接着拼；
   7. 绿色吸附提示可以自己关掉（🎯），关掉后要靠自己对着位置放；
   8. 所有美术（包括内置示例图）都由代码现场绘制，不引用任何外部资源。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var CSS_ID = 'puzzle-style';
  var CSS = [
    '.pz-wrap{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;gap:6px;padding:8px 8px 0;box-sizing:border-box;font-family:inherit;color:#0d1330;background:linear-gradient(180deg,#eef2fb 0%,#e1e8f7 100%)}',
    '.pz-bar{flex:0 0 auto;display:flex;align-items:center;gap:6px;min-height:30px}',
    '.pz-seg{flex:0 0 auto;display:flex;gap:2px;background:#fff;border-radius:11px;padding:2px;box-shadow:0 8px 16px -14px rgba(13,19,48,.7)}',
    '.pz-mode{border:0;font:inherit;font-size:11.5px;font-weight:800;letter-spacing:.2px;color:#5b648f;background:transparent;padding:5px 7px;border-radius:9px;cursor:pointer}',
    '.pz-mode.on{background:linear-gradient(160deg,#5cc8ff,#2b6de0);color:#fff;box-shadow:0 5px 12px -8px rgba(43,109,224,.85)}',
    '.pz-counts{flex:1 1 auto;min-width:0;display:flex;gap:5px;overflow-x:auto;overflow-y:hidden;padding:2px 1px;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
    '.pz-counts::-webkit-scrollbar{display:none}',
    '.pz-chip{flex:0 0 auto;border:1px solid #d8e1f5;background:#fff;color:#3a4570;font:inherit;font-size:11px;font-weight:800;padding:4px 8px;border-radius:9px;cursor:pointer;line-height:1.2}',
    '.pz-chip.on{background:linear-gradient(160deg,#3ddc97,#12a86f);color:#08331f;border-color:transparent}',
    '.pz-tools{flex:0 0 auto;display:flex;align-items:center;gap:4px;min-height:28px}',
    '.pz-ic{flex:0 0 auto;width:30px;height:28px;border:1px solid #d8e1f5;background:#fff;border-radius:9px;font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer;padding:0}',
    '.pz-ic.on{background:#e6fbf2;border-color:#3ddc97}',
    '.pz-ic.off{opacity:.55}',
    '.pz-zoom{flex:0 0 auto;min-width:48px;height:28px;border:1px solid #d8e1f5;background:#fff;border-radius:9px;font:inherit;font-size:11px;font-weight:800;color:#3a4570;cursor:pointer;padding:0 4px}',
    '.pz-zoom:active{background:#e9eefb}',
    '.pz-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;border-radius:14px}',
    '.pz-canvas{position:absolute;left:0;top:0;display:block;touch-action:none;cursor:grab;background:transparent}',
    '.pz-canvas.pz-panning{cursor:grabbing}',
    '.pz-over{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.72);backdrop-filter:blur(3px);border-radius:14px;z-index:6}',
    '.pz-over.show{display:grid}',
    '.pz-over-box{display:flex;flex-direction:column;align-items:center;gap:8px;background:#fff;border-radius:20px;padding:16px 20px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.75)}',
    '.pz-over-box b{font-size:17px;font-weight:800}',
    '.pz-over-box small{font-size:12px;color:#5b648f;line-height:1.5}',
    '.pz-over-row{display:flex;gap:8px;margin-top:2px}',
    '.pz-tray{flex:0 0 auto;margin:0 -8px;padding:5px 4px 4px;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -12px 26px -22px rgba(13,19,48,.8)}',
    '.pz-tray-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px 4px;font-size:11px;font-weight:700;color:#5b648f}',
    '.pz-lab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pz-sub{flex:0 0 auto;color:#3a4570}',
    '.pz-stripwrap{display:flex;align-items:center;gap:2px}',
    '.pz-arrow{flex:0 0 auto;width:20px;height:52px;border:0;background:transparent;color:#8b95b8;font-size:17px;font-weight:800;cursor:pointer;padding:0;border-radius:8px}',
    '.pz-arrow:active{background:#eef2fb;color:#2b6de0}',
    '.pz-strip{flex:1 1 auto;min-width:0;position:relative;overflow-x:auto;overflow-y:hidden;padding:2px 3px 6px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}',
    '.pz-strip::-webkit-scrollbar{height:4px}',
    '.pz-strip::-webkit-scrollbar-thumb{background:#cfd9f0;border-radius:4px}',
    '.pz-track{position:relative;height:58px}',
    '.pz-item{position:absolute;top:1px;width:54px;height:54px;display:grid;place-items:center;background:#f2f5fd;border:1px solid #e0e7f6;border-radius:12px;cursor:grab;transition:transform .12s,box-shadow .12s,background .12s;touch-action:pan-x}',
    '.pz-item.on{background:#e6fbf2;border-color:#3ddc97;box-shadow:0 0 0 2px rgba(61,220,151,.35);transform:translateY(-2px)}',
    '.pz-item.hint{animation:pzPulse .8s ease-in-out infinite}',
    '.pz-thumb{display:block;border-radius:6px;filter:drop-shadow(0 2px 2px rgba(13,19,48,.18));pointer-events:none}',
    '.pz-empty{font-size:11.5px;color:#5b648f;padding:16px 8px;white-space:nowrap}',
    '.pz-ghost{position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:9;filter:drop-shadow(0 14px 18px rgba(13,19,48,.35));opacity:.96}',
    '.pz-sheet{position:absolute;left:0;right:0;top:0;bottom:0;z-index:12;display:none;place-items:center;background:rgba(10,16,36,.42);padding:14px}',
    '.pz-sheet.show{display:grid}',
    '.pz-sheet-box{width:100%;max-width:310px;max-height:100%;overflow:auto;background:#fff;border-radius:18px;padding:14px;box-shadow:0 30px 60px -30px rgba(13,19,48,.9)}',
    '.pz-sheet-t{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:800;margin-bottom:10px}',
    '.pz-x{border:0;background:#f0f3fb;color:#5b648f;width:26px;height:26px;border-radius:9px;font-size:14px;font-weight:800;cursor:pointer;padding:0}',
    '.pz-samples{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.pz-sample{display:flex;flex-direction:column;align-items:center;gap:5px;border:2px solid #e6ecf9;background:#f7f9ff;border-radius:14px;padding:6px 4px;cursor:pointer;font:inherit;color:#3a4570}',
    '.pz-sample.on{border-color:#3ddc97;background:#eefbf5}',
    '.pz-sample canvas{display:block;border-radius:8px;box-shadow:0 6px 12px -10px rgba(13,19,48,.7)}',
    '.pz-sample span{font-size:10.5px;font-weight:800;white-space:nowrap}',
    '.pz-sheet .ui-btn{width:100%;margin-top:10px}',
    '.pz-sheet-hint{font-size:10.5px;color:#8b95b8;line-height:1.5;margin-top:8px}',
    '@keyframes pzPulse{0%,100%{box-shadow:0 0 0 2px rgba(61,220,151,.35)}50%{box-shadow:0 0 0 5px rgba(61,220,151,.18)}}'
  ].join('');

  var COUNTS = [6, 12, 24, 35, 48, 63, 80, 100, 150, 200, 300, 500, 1000];
  var PAD = 2.4;          /* 碎片路径外围留的描边余量（底板坐标） */
  var THUMB = 42;         /* 下方列表里缩略图的最大边长 */
  var DRAG_START = 7;     /* 移动多少像素才算「拿起来」 */
  var PI2 = Math.PI * 2;
  var LS_PREFIX = 'pz.save.';
  var IDB_NAME = 'phoneshell-puzzle';
  var IDB_STORE = 'kv';

  /* ---------------- 通用小工具 ---------------- */
  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : fallback;
  }
  function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function shuffled(n, rnd) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    rnd = typeof rnd === 'function' ? rnd : Math.random;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ============================================================
     纯函数：布局 / 边缘曲线 / 切块（不碰 DOM，测试直接调）
     ============================================================ */

  /** 把 w×h 等比缩放进 maxW×maxH */
  function fitBox(w, h, maxW, maxH) {
    w = num(w, 1); h = num(h, 1);
    maxW = num(maxW, 1); maxH = num(maxH, 1);
    var s = Math.min(maxW / w, maxH / h);
    if (!isFinite(s) || s <= 0) s = 1;
    return { w: Math.max(1, w * s), h: Math.max(1, h * s), scale: s };
  }

  /**
   * 由片数与图片长宽比推算行列数。
   * 片数优先（尽量贴近 n），其次让「列/行」贴近图片长宽比。
   * 上限 64×64（1000 片大约是 27×37），方便以后继续加片数。
   */
  function planGrid(n, aspect) {
    n = Math.max(2, Math.round(num(n, 12)));
    aspect = clampNum(isFinite(aspect) && aspect > 0 ? aspect : 1, 0.2, 5);
    var best = null, bestScore = Infinity, c, r, total, err, ratio, score;
    for (c = 1; c <= 64; c++) {
      r = Math.max(1, Math.round(n / c));
      if (r > 64) continue;
      total = r * c;
      if (total > n * 1.5 + 4 && c > 1) continue;
      err = Math.abs(total - n);
      ratio = (c / r) / aspect;
      score = err * 3 + Math.abs(Math.log(ratio)) * 2.2;
      if (score < bestScore) { bestScore = score; best = { cols: c, rows: r }; }
    }
    if (!best) {
      var fc = clampNum(Math.round(Math.sqrt(n * aspect)), 1, 64);
      best = { cols: fc, rows: clampNum(Math.round(n / fc), 1, 64) };
    }
    best.total = best.cols * best.rows;
    return best;
  }

  /**
   * 一条拼图边缘的点列（从 A 到 B，含两端）。
   * s = 0 直线；s = ±1 在这条边的法线方向鼓出一个圆润的凸起。
   * 法线固定取「顺时针 90°」：横边朝下、竖边朝左 —— 关键是**绝对方向**，
   * 这样相邻两片引用同一份点列时天然严丝合缝。
   * pos 是凸起在边上的位置（0~1），amp 是凸起高度（像素）。
   * 采样点数按 amp 自适应：1000 片时 amp 只有 2~3px，用不着 18 个点。
   */
  function edgePoints(ax, ay, bx, by, s, pos, amp) {
    var out = [[ax, ay]];
    if (!s) { out.push([bx, by]); return out; }
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var p = (typeof pos === 'number' && isFinite(pos)) ? clampNum(pos, 0.30, 0.70) : 0.5;
    var half = 0.155;
    var steps = Math.round(clampNum(8 + amp * 0.9, 8, 18));
    var i, t, u, profile, off;
    for (i = 1; i < steps; i++) {
      t = i / steps;
      u = p - half + t * half * 2;
      profile = Math.pow(Math.sin(Math.PI * t), 0.62);
      off = profile * amp * (s > 0 ? 1 : -1);
      out.push([ax + dx * u + nx * off, ay + dy * u + ny * off]);
    }
    out.push([bx, by]);
    return out;
  }

  /** 把 src 点列拼进 dst；reverse = 逆着拼；自动去掉重复端点 */
  function appendPts(dst, src, reverse) {
    if (!src || src.length < 2) return;
    var k, i, p, last;
    for (k = 0; k < src.length; k++) {
      i = reverse ? (src.length - 1 - k) : k;
      p = src[i];
      last = dst.length ? dst[dst.length - 1] : null;
      if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
      dst.push([p[0], p[1]]);
    }
  }

  /**
   * 切块。返回 { pieces, cellW, cellH, amp, hEdge, vEdge }。
   * 每片：{ r,c,pts,minX,minY,maxX,maxY,cx,cy,slotX,slotY,slotW,slotH }
   * opts.rnd 可注入（测试用固定序列）。
   */
  function buildPuzzle(opts) {
    opts = opts || {};
    var W = num(opts.w, 100);
    var H = num(opts.h, 100);
    var cols = Math.max(1, Math.round(num(opts.cols, 1)));
    var rows = Math.max(1, Math.round(num(opts.rows, 1)));
    var mode = opts.mode === 'jigsaw' ? 'jigsaw' : 'classic';
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
    var cellW = W / cols, cellH = H / rows;
    var amp = mode === 'jigsaw' ? clampNum(Math.min(cellW, cellH) * 0.22, 2, 26) : 0;
    var hEdge = [], vEdge = [], r, c, s, pos;

    for (r = 0; r <= rows; r++) {
      hEdge[r] = [];
      for (c = 0; c < cols; c++) {
        s = 0; pos = 0.5;
        if (mode === 'jigsaw' && r > 0 && r < rows) {
          s = rnd() < 0.5 ? -1 : 1;
          if (rnd() < 0.12) s = 0;                 /* 偶尔来一条直边，更像手工切的 */
          pos = 0.5 + (rnd() - 0.5) * 0.12;
        }
        hEdge[r][c] = edgePoints(c * cellW, r * cellH, (c + 1) * cellW, r * cellH, s, pos, amp);
      }
    }
    for (r = 0; r < rows; r++) {
      vEdge[r] = [];
      for (c = 0; c <= cols; c++) {
        s = 0; pos = 0.5;
        if (mode === 'jigsaw' && c > 0 && c < cols) {
          s = rnd() < 0.5 ? -1 : 1;
          if (rnd() < 0.12) s = 0;
          pos = 0.5 + (rnd() - 0.5) * 0.12;
        }
        vEdge[r][c] = edgePoints(c * cellW, r * cellH, c * cellW, (r + 1) * cellH, s, pos, amp);
      }
    }

    var pieces = [];
    var i, pts, minX, minY, maxX, maxY, p;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        pts = [];
        appendPts(pts, hEdge[r][c], false);         /* 上：左→右 */
        appendPts(pts, vEdge[r][c + 1], false);     /* 右：上→下 */
        appendPts(pts, hEdge[r + 1][c], true);      /* 下：右→左 */
        appendPts(pts, vEdge[r][c], true);          /* 左：下→上 */
        /* 首尾重合的点去掉（closePath 会负责闭合） */
        if (pts.length > 2) {
          var f0 = pts[0], l0 = pts[pts.length - 1];
          if (Math.abs(f0[0] - l0[0]) < 1e-6 && Math.abs(f0[1] - l0[1]) < 1e-6) pts.pop();
        }
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
        for (i = 0; i < pts.length; i++) {
          p = pts[i];
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
        pieces.push({
          r: r, c: c, pts: pts,
          minX: minX, minY: minY, maxX: maxX, maxY: maxY,
          cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
          slotX: c * cellW, slotY: r * cellH, slotW: cellW, slotH: cellH,
          placed: false
        });
      }
    }
    return { pieces: pieces, cellW: cellW, cellH: cellH, amp: amp, hEdge: hEdge, vEdge: vEdge };
  }

  /** 吸附容差（底板坐标）：单元格的一小半，且不小于 4px */
  function snapTol(cellW, cellH) {
    return { x: Math.max(4, cellW * 0.5), y: Math.max(4, cellH * 0.5) };
  }

  /* ============================================================
     存档：优先 IndexedDB（能放几 MB 的照片），降级 localStorage
     ============================================================ */
  var idbDb = null;

  function idbSupported() {
    try {
      return (typeof indexedDB !== 'undefined') && indexedDB && typeof indexedDB.open === 'function';
    } catch (e) { return false; }
  }
  function idbOpen() {
    if (!idbSupported()) return Promise.reject(new Error('no-idb'));
    if (idbDb) return Promise.resolve(idbDb);
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        try {
          if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
        } catch (e) { /* 建表失败就算了，后面会降级 */ }
      };
      req.onsuccess = function () { idbDb = req.result; resolve(idbDb); };
      req.onerror = function () { reject(req.error || new Error('idb-error')); };
      req.onblocked = function () { reject(new Error('idb-blocked')); };
    });
  }
  function idbReq(mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, req;
        try { tx = db.transaction(IDB_STORE, mode); } catch (e) { reject(e); return; }
        try { req = fn(tx.objectStore(IDB_STORE)); } catch (e) { reject(e); return; }
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb-op')); };
      });
    });
  }
  function idbPut(k, v) {
    return idbReq('readwrite', function (os) { return os.put(v, k); }).then(function () { return true; });
  }
  function idbGet(k) {
    return idbReq('readonly', function (os) { return os.get(k); }).then(function (v) { return v == null ? null : String(v); });
  }
  function idbDel(k) {
    return idbReq('readwrite', function (os) { return os['delete'](k); }).then(function () { return true; });
  }
  function lsGet(k) {
    try { return localStorage.getItem(LS_PREFIX + k); } catch (e) { return null; }
  }
  function lsPut(k, v) {
    try { localStorage.setItem(LS_PREFIX + k, v); return true; } catch (e) { return false; }
  }
  function lsDel(k) {
    try { localStorage.removeItem(LS_PREFIX + k); } catch (e) { /* 忽略 */ }
  }
  function storagePut(k, v) {
    if (idbSupported()) {
      return idbPut(k, v).catch(function () { return lsPut(k, v); });
    }
    return Promise.resolve(lsPut(k, v));
  }
  function storageGet(k) {
    if (!idbSupported()) return Promise.resolve(lsGet(k));
    return idbGet(k).then(function (v) { return v == null ? lsGet(k) : v; })
      .catch(function () { return lsGet(k); });
  }
  function storageDel(k) {
    lsDel(k);
    if (idbSupported()) { try { idbDel(k).catch(function () { /* 忽略 */ }); } catch (e) { /* 忽略 */ } }
  }

  /* ============================================================
     内置示例图（全部用 Canvas 代码画，无外部素材）
     ============================================================ */
  function seedRnd(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function ridge(g, w, h, baseY, color, peaks) {
    var i;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, baseY);
    for (i = 0; i < peaks.length; i++) g.lineTo(w * peaks[i][0], baseY - h * peaks[i][1]);
    g.lineTo(w, baseY);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
  function glowCircle(g, x, y, r, inner, outer) {
    var gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, PI2);
    g.fill();
  }

  function drawSunset(g, w, h) {
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#25235f');
    sky.addColorStop(0.30, '#6b3f86');
    sky.addColorStop(0.54, '#c95a72');
    sky.addColorStop(0.74, '#f0824f');
    sky.addColorStop(1, '#ffd88a');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    glowCircle(g, w * 0.52, h * 0.55, Math.min(w, h) * 0.42, 'rgba(255,236,170,.55)', 'rgba(255,160,96,0)');
    g.fillStyle = '#fff6cf';
    g.beginPath();
    g.arc(w * 0.52, h * 0.55, Math.min(w, h) * 0.125, 0, PI2);
    g.fill();

    var i, cy;
    for (i = 0; i < 4; i++) {
      cy = h * (0.15 + i * 0.07);
      g.fillStyle = 'rgba(255,224,198,' + (0.20 - i * 0.035).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(w * (0.22 + i * 0.19), cy, w * (0.23 - i * 0.03), h * (0.010 + i * 0.002), 0, 0, PI2);
      g.fill();
    }

    ridge(g, w, h, h * 0.73, '#6a4f94', [[0.02, 0.10], [0.17, 0.30], [0.31, 0.15], [0.47, 0.33], [0.63, 0.17], [0.80, 0.29], [0.96, 0.11]]);
    ridge(g, w, h, h * 0.83, '#483a73', [[0.05, 0.10], [0.25, 0.25], [0.43, 0.11], [0.61, 0.27], [0.79, 0.13], [0.95, 0.21]]);
    ridge(g, w, h, h, '#29234f', [[0.10, 0.12], [0.33, 0.19], [0.53, 0.09], [0.73, 0.17], [0.91, 0.07]]);

    g.strokeStyle = 'rgba(30,24,60,.65)';
    g.lineWidth = Math.max(2, w * 0.004);
    g.lineCap = 'round';
    for (i = 0; i < 5; i++) {
      var bx = w * (0.18 + i * 0.13);
      var by = h * (0.12 + (i % 3) * 0.045);
      var bw = w * 0.022;
      g.beginPath();
      g.moveTo(bx - bw, by);
      g.quadraticCurveTo(bx - bw * 0.4, by - bw * 0.55, bx, by);
      g.quadraticCurveTo(bx + bw * 0.4, by - bw * 0.55, bx + bw, by);
      g.stroke();
    }
  }

  function drawNight(g, w, h) {
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#080d26');
    sky.addColorStop(0.50, '#1a2150');
    sky.addColorStop(1, '#3a2a5e');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    var rnd = seedRnd(20240607);
    var i, j, x, y, r;
    for (i = 0; i < 110; i++) {
      x = rnd() * w;
      y = rnd() * h * 0.66;
      r = 0.6 + rnd() * 1.9;
      g.fillStyle = 'rgba(255,255,255,' + (0.20 + rnd() * 0.75).toFixed(2) + ')';
      g.beginPath();
      g.arc(x, y, r, 0, PI2);
      g.fill();
    }

    var mx = w * 0.76, my = h * 0.19, mr = Math.min(w, h) * 0.072;
    glowCircle(g, mx, my, mr * 3.1, 'rgba(255,248,210,.38)', 'rgba(255,248,210,0)');
    g.fillStyle = '#fff8d8';
    g.beginPath();
    g.arc(mx, my, mr, 0, PI2);
    g.fill();
    g.fillStyle = '#1a2150';
    g.beginPath();
    g.arc(mx + mr * 0.52, my - mr * 0.3, mr * 0.9, 0, PI2);
    g.fill();

    var base = h * 0.82;
    var bw, bx, bh, tone, wx, wy;
    for (i = 0; i < 15; i++) {
      bw = w * (0.048 + rnd() * 0.058);
      bx = (i / 15) * w * 1.03 - w * 0.012;
      bh = h * (0.10 + rnd() * 0.28);
      tone = rnd();
      g.fillStyle = 'rgb(' + Math.round(34 + tone * 46) + ',' + Math.round(42 + tone * 50) + ',' + Math.round(92 + tone * 70) + ')';
      g.fillRect(bx, base - bh, bw, bh);
      g.fillStyle = 'rgba(255,214,120,.72)';
      for (wy = base - bh + 12; wy < base - 10; wy += 17) {
        for (wx = bx + 7; wx < bx + bw - 8; wx += 13) {
          if (rnd() < 0.55) g.fillRect(wx, wy, 5, 8);
        }
      }
      if (rnd() < 0.3) {
        g.fillStyle = 'rgba(255,120,120,.85)';
        g.beginPath();
        g.arc(bx + bw / 2, base - bh - 7, 3, 0, PI2);
        g.fill();
      }
    }

    g.fillStyle = '#121834';
    g.fillRect(0, base, w, h - base);
    g.fillStyle = 'rgba(120,150,230,.16)';
    for (i = 0; i < 26; i++) {
      y = base + 8 + rnd() * (h - base - 10);
      g.fillRect(rnd() * w, y, w * (0.05 + rnd() * 0.16), 2.2);
    }
    g.fillStyle = 'rgba(255,214,120,.22)';
    for (i = 0; i < 10; i++) {
      x = w * (0.06 + i * 0.095);
      g.fillRect(x, base + 4, w * 0.035, h - base - 6);
    }
  }

  function drawGarden(g, w, h) {
    var bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#fff6dd');
    bg.addColorStop(1, '#ffe4bd');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    glowCircle(g, w * 0.22, h * 0.17, Math.min(w, h) * 0.23, 'rgba(255,236,150,.95)', 'rgba(255,220,130,0)');
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(w * 0.22, h * 0.17, Math.min(w, h) * 0.078, 0, PI2);
    g.fill();

    var i, cx, cy;
    for (i = 0; i < 3; i++) {
      cx = w * (0.15 + i * 0.34);
      cy = h * (0.15 + (i % 2) * 0.07);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      g.arc(cx, cy, w * 0.045, 0, PI2);
      g.arc(cx + w * 0.05, cy - w * 0.012, w * 0.035, 0, PI2);
      g.arc(cx + w * 0.09, cy + w * 0.006, w * 0.028, 0, PI2);
      g.fill();
    }

    ridge(g, w, h, h * 0.62, '#a8d8a0', [[0.10, 0.09], [0.30, 0.17], [0.52, 0.07], [0.72, 0.15], [0.92, 0.06]]);
    ridge(g, w, h, h * 0.74, '#6fbd7c', [[0.06, 0.06], [0.26, 0.13], [0.46, 0.05], [0.68, 0.12], [0.88, 0.05]]);
    ridge(g, w, h, h, '#4c9a63', [[0.14, 0.05], [0.36, 0.10], [0.58, 0.04], [0.80, 0.09], [0.96, 0.03]]);

    var rnd = seedRnd(77021);
    var colors = ['#ff7a8a', '#ffb457', '#a98bff', '#5cc8ff', '#ffe066', '#ff9ec4'];
    var stemH, fx, fy, col, rr, k, ang;
    for (i = 0; i < 30; i++) {
      fx = w * (0.05 + rnd() * 0.9);
      fy = h * (0.58 + rnd() * 0.40);
      stemH = h * (0.045 + rnd() * 0.09);
      g.strokeStyle = '#357a4d';
      g.lineWidth = Math.max(2, w * 0.0045);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx, fy - stemH);
      g.stroke();
      col = colors[Math.floor(rnd() * colors.length)];
      rr = w * (0.010 + rnd() * 0.011);
      for (k = 0; k < 5; k++) {
        ang = (k / 5) * PI2 + rnd() * 0.2;
        g.fillStyle = col;
        g.beginPath();
        g.arc(fx + Math.cos(ang) * rr, fy - stemH + Math.sin(ang) * rr, rr * 0.85, 0, PI2);
        g.fill();
      }
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.arc(fx, fy - stemH, rr * 0.7, 0, PI2);
      g.fill();
    }
  }

  var SAMPLES = [
    /* 尺寸不用太大：底板最宽约 340 CSS px，×2 的 DPR 也就 680 物理像素，
       720px 左右足够清晰，同时把三张示例图的 Canvas 内存压在 8 MB 以内。 */
    { key: 'sunset', name: '晚霞山峦', w: 720, h: 960, draw: drawSunset },
    { key: 'night', name: '夜色城市', w: 960, h: 720, draw: drawNight },
    { key: 'garden', name: '几何花园', w: 840, h: 840, draw: drawGarden }
  ];
  var sampleCache = {};
  function sampleFor(key) {
    var def = null, i;
    for (i = 0; i < SAMPLES.length; i++) if (SAMPLES[i].key === key) def = SAMPLES[i];
    if (!def) def = SAMPLES[0];
    if (sampleCache[def.key]) return sampleCache[def.key];
    var cv = document.createElement('canvas');
    cv.width = def.w;
    cv.height = def.h;
    var g = cv.getContext('2d');
    try {
      if (g) def.draw(g, def.w, def.h);
    } catch (e) {
      if (g) { g.fillStyle = '#dfe7f6'; g.fillRect(0, 0, def.w, def.h); }
    }
    var made = { key: def.key, name: def.name, src: cv, w: def.w, h: def.h };
    sampleCache[def.key] = made;
    return made;
  }

  /* ============================================================
     应用
     ============================================================ */
  function createApp(phone) {
    var U = phone.utils;

    function mount(phoneApi, root, ctx) {
      injectCss();
      ctx.useFullBody();
      var store = ctx.store;

      /* ---------------- 状态 ---------------- */
      var S = {
        img: null, imgW: 0, imgH: 0, imgName: '', imgDataUrl: '', savedImgUrl: '',
        sampleKey: 'sunset',
        mode: 'classic', count: 24,
        cols: 0, rows: 0, cellW: 0, cellH: 0, boardW: 0, boardH: 0,
        stageW: 0, stageH: 0,
        zoom: 1, panX: 0, panY: 0,
        pieces: [], order: [], placed: 0, moves: 0,
        selected: -1, hover: -1, hint: -1, flash: -1, showHover: true,
        preview: false, over: false,
        elapsed: 0, startedAt: 0, clockOn: false, timer: 0
      };
      var closed = false;
      var userStarted = false;   /* 恢复存档是异步的：用户先动手了就别再拿旧存档盖回去 */
      var drag = null;
      var pan = null, pinch = null;
      var pointers = {};
      var track = null, trayFirst = -1, trayLast = -1;
      var resizeRaf = 0, layoutRaf = 0, chipRaf = 0, drawRaf = 0, trayRaf = 0;
      var hintTimer = 0, flashTimer = 0, tipTimer = 0, saveTimer = 0;
      var lastRejectTip = 0;
      var sheetOpen = false, sheetFilled = false;

      /* ---------------- 界面骨架 ---------------- */
      var wrap = U.el('div', 'pz-wrap');
      var bar = U.el('div', 'pz-bar');
      var seg = U.el('div', 'pz-seg');
      var btnClassic = U.el('button', 'pz-mode on', '经典');
      var btnJigsaw = U.el('button', 'pz-mode', '异形');
      btnClassic.type = 'button';
      btnJigsaw.type = 'button';
      btnClassic.title = '经典拼图：规规矩矩的方形切片';
      btnJigsaw.title = '异形拼图：带凹凸咬合边的碎片';
      seg.appendChild(btnClassic);
      seg.appendChild(btnJigsaw);

      var countsEl = U.el('div', 'pz-counts');
      var chips = [];
      COUNTS.forEach(function (n) {
        var c = U.el('button', 'pz-chip', String(n) + '片');
        c.type = 'button';
        c.dataset.n = String(n);
        c.addEventListener('click', function () { setCount(n); });
        chips.push(c);
        countsEl.appendChild(c);
      });

      bar.appendChild(seg);
      bar.appendChild(countsEl);

      var tools = U.el('div', 'pz-tools');
      var btnHover = U.el('button', 'pz-ic', '🎯');
      var btnHint = U.el('button', 'pz-ic', '💡');
      var btnEye = U.el('button', 'pz-ic', '👁');
      var btnZoomOut = U.el('button', 'pz-ic', '−');
      var btnZoomLabel = U.el('button', 'pz-zoom', '100%');
      var btnZoomIn = U.el('button', 'pz-ic', '+');
      var btnSave = U.el('button', 'pz-ic', '💾');
      btnHover.type = 'button';
      btnHint.type = 'button';
      btnEye.type = 'button';
      btnZoomOut.type = 'button';
      btnZoomLabel.type = 'button';
      btnZoomIn.type = 'button';
      btnSave.type = 'button';
      btnHover.title = '绿色吸附提示（关掉后要靠自己对位置）';
      btnHint.title = '提示：随机挑一片，把它的位置闪给你看';
      btnEye.title = '看原图（再点一下回到拼图）';
      btnZoomOut.title = '缩小（滚轮 / 双指也可以）';
      btnZoomIn.title = '放大（滚轮 / 双指也可以）';
      btnZoomLabel.title = '当前缩放，点一下回到 100% 看全图';
      btnSave.title = '保存进度（平时会自动保存，这是手动存一次）';
      tools.appendChild(btnHover);
      tools.appendChild(btnHint);
      tools.appendChild(btnEye);
      tools.appendChild(btnZoomOut);
      tools.appendChild(btnZoomLabel);
      tools.appendChild(btnZoomIn);
      tools.appendChild(btnSave);

      var stage = U.el('div', 'pz-stage');
      var canvas = U.el('canvas', 'pz-canvas');
      stage.appendChild(canvas);

      var overEl = U.el('div', 'pz-over');
      var overBox = U.el('div', 'pz-over-box');
      var overTitle = U.el('b', null, '🎉 拼好了！');
      var overSub = U.el('small');
      var overRow = U.el('div', 'pz-over-row');
      var overAgain = U.el('button', 'ui-btn', '再来一局');
      var overNew = U.el('button', 'ui-btn ghost', '换一张图');
      overAgain.type = 'button';
      overNew.type = 'button';
      overRow.appendChild(overAgain);
      overRow.appendChild(overNew);
      overBox.appendChild(overTitle);
      overBox.appendChild(overSub);
      overBox.appendChild(overRow);
      overEl.appendChild(overBox);
      stage.appendChild(overEl);

      var tray = U.el('div', 'pz-tray');
      var trayHead = U.el('div', 'pz-tray-head');
      var labLeft = U.el('span', 'pz-lab', '正在准备拼图…');
      var labRight = U.el('span', 'pz-sub', '完成 0/0 · 0:00');
      trayHead.appendChild(labLeft);
      trayHead.appendChild(labRight);
      var stripWrap = U.el('div', 'pz-stripwrap');
      var btnPrev = U.el('button', 'pz-arrow', '‹');
      var btnNext = U.el('button', 'pz-arrow', '›');
      btnPrev.type = 'button';
      btnNext.type = 'button';
      btnPrev.title = '往前翻';
      btnNext.title = '往后翻';
      var strip = U.el('div', 'pz-strip');
      stripWrap.appendChild(btnPrev);
      stripWrap.appendChild(strip);
      stripWrap.appendChild(btnNext);
      tray.appendChild(trayHead);
      tray.appendChild(stripWrap);

      var ghost = U.el('canvas', 'pz-ghost');

      /* 换图面板 */
      var sheet = U.el('div', 'pz-sheet');
      var sheetBox = U.el('div', 'pz-sheet-box');
      var sheetT = U.el('div', 'pz-sheet-t');
      var sheetTitle = U.el('span', null, '换一张拼图');
      var sheetX = U.el('button', 'pz-x', '×');
      sheetX.type = 'button';
      sheetT.appendChild(sheetTitle);
      sheetT.appendChild(sheetX);
      var samplesEl = U.el('div', 'pz-samples');
      var importBtn = U.el('button', 'ui-btn', '📁 从本地选一张图片');
      importBtn.type = 'button';
      var sheetHint = U.el('div', 'pz-sheet-hint',
        '支持 jpg / png / webp / gif / bmp。底板的长宽会完全照图片来，图片越大切片越清楚。');
      sheetBox.appendChild(sheetT);
      sheetBox.appendChild(samplesEl);
      sheetBox.appendChild(importBtn);
      sheetBox.appendChild(sheetHint);
      sheet.appendChild(sheetBox);

      wrap.appendChild(bar);
      wrap.appendChild(tools);
      wrap.appendChild(stage);
      wrap.appendChild(tray);
      wrap.appendChild(ghost);
      wrap.appendChild(sheet);
      root.appendChild(wrap);

      var g2d = canvas.getContext('2d');

      /* ---------------- 尺寸 / 视口 ---------------- */
      function dpr() {
        var v = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        v = Number(v);
        if (!isFinite(v) || v <= 0) v = 1;
        return Math.min(2, Math.max(1, v));
      }
      function stageSize() {
        var w = stage.clientWidth || 0, h = stage.clientHeight || 0;
        if (!w || !h) { w = wrap.clientWidth || 0; h = wrap.clientHeight || 0; }
        if (!w || !h) { w = 320; h = 400; }             /* 首帧 / 测试环境兜底 */
        return { w: Math.max(80, Math.round(w)), h: Math.max(80, Math.round(h)) };
      }
      function applyCanvasSize() {
        var pr = dpr();
        canvas.width = Math.max(1, Math.round(S.stageW * pr));
        canvas.height = Math.max(1, Math.round(S.stageH * pr));
        canvas.style.width = S.stageW + 'px';
        canvas.style.height = S.stageH + 'px';
        if (g2d && g2d.setTransform) g2d.setTransform(pr, 0, 0, pr, 0, 0);
      }
      function centerView() {
        S.panX = Math.round((S.stageW - S.boardW * S.zoom) / 2);
        S.panY = Math.round((S.stageH - S.boardH * S.zoom) / 2);
      }
      function clampPan() {
        var bw = S.boardW * S.zoom, bh = S.boardH * S.zoom;
        if (bw <= S.stageW) S.panX = Math.round((S.stageW - bw) / 2);
        else S.panX = Math.round(clampNum(S.panX, S.stageW - bw, 0));
        if (bh <= S.stageH) S.panY = Math.round((S.stageH - bh) / 2);
        else S.panY = Math.round(clampNum(S.panY, S.stageH - bh, 0));
      }
      function defaultZoomFor(n) {
        if (n >= 500) return 2.2;
        if (n >= 200) return 1.5;
        if (n >= 100) return 1.25;
        return 1;
      }
      function setZoom(z, ax, ay) {
        z = clampNum(Math.round(z * 100) / 100, 1, 8);
        if (Math.abs(z - S.zoom) < 0.005) { updateZoomLabel(); return; }
        var cx = (typeof ax === 'number' && isFinite(ax)) ? ax : S.stageW / 2;
        var cy = (typeof ay === 'number' && isFinite(ay)) ? ay : S.stageH / 2;
        var bx = (cx - S.panX) / S.zoom;
        var by = (cy - S.panY) / S.zoom;
        S.zoom = z;
        S.panX = cx - bx * z;
        S.panY = cy - by * z;
        clampPan();
        updateZoomLabel();
        drawBoard();
        scheduleSave();
      }
      function resetZoom() { setZoom(1, S.stageW / 2, S.stageH / 2); }
      function zoomStep(dir) {
        if (!S.pieces.length) return;
        setZoom(S.zoom * (dir > 0 ? 1.25 : 0.8), S.stageW / 2, S.stageH / 2);
      }
      function updateZoomLabel() {
        btnZoomLabel.textContent = Math.round(S.zoom * 100) + '%';
      }

      /* ---------------- 绘制 ---------------- */
      function pieceBox(p) {
        return {
          x: p.minX - PAD,
          y: p.minY - PAD,
          w: p.maxX - p.minX + PAD * 2,
          h: p.maxY - p.minY + PAD * 2
        };
      }
      function tracePath(g, pts) {
        if (!pts || pts.length < 3) return;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
      }
      /** 在「底板坐标」下把这一片对应的图片区域贴上去（调用方自己 clip） */
      function drawPieceImage(g, p) {
        var box = pieceBox(p);
        var sx = (box.x / S.boardW) * S.imgW;
        var sy = (box.y / S.boardH) * S.imgH;
        var sw = (box.w / S.boardW) * S.imgW;
        var sh = (box.h / S.boardH) * S.imgH;
        try {
          g.drawImage(S.img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
        } catch (e) {
          try { g.drawImage(S.img, 0, 0, S.boardW, S.boardH); } catch (e2) { /* 画不了就算了 */ }
        }
      }
      function requestDraw() {
        if (drawRaf) return;
        drawRaf = requestAnimationFrame(function () { drawRaf = 0; if (!closed) drawBoard(); });
      }

      function drawBoard() {
        var g = g2d;
        if (!g) return;
        var pr = dpr();
        g.setTransform(pr, 0, 0, pr, 0, 0);
        g.clearRect(0, 0, S.stageW, S.stageH);
        if (!S.img || !S.pieces.length || !S.boardW) return;
        var z = S.zoom, ox = S.panX, oy = S.panY, bw = S.boardW, bh = S.boardH;
        var i, p, r = Math.max(2, 12 / z);
        g.save();
        g.setTransform(pr * z, 0, 0, pr * z, pr * ox, pr * oy);

        /* 底板：带一点阴影，看起来像一块真的拼图板 */
        g.save();
        g.shadowColor = 'rgba(13,19,48,.28)';
        g.shadowBlur = 16;
        g.shadowOffsetY = 7;
        rrPath(g, 0, 0, bw, bh, r);
        g.fillStyle = '#f7f9ff';
        g.fill();
        g.restore();

        if (S.preview && S.img) {
          g.save();
          rrPath(g, 0, 0, bw, bh, r);
          g.clip();
          g.drawImage(S.img, 0, 0, bw, bh);
          g.restore();
          g.lineWidth = 1 / z;
          g.strokeStyle = 'rgba(90,110,170,.4)';
          rrPath(g, 0, 0, bw, bh, r);
          g.stroke();
          g.restore();
          return;
        }

        /* 可见区域（底板坐标）：只画屏幕里看得见的碎片 */
        var vx0 = -ox / z - 40 / z, vy0 = -oy / z - 40 / z;
        var vx1 = (S.stageW - ox) / z + 40 / z, vy1 = (S.stageH - oy) / z + 40 / z;
        var slotPx = Math.min(S.cellW, S.cellH) * z;
        var showSlots = slotPx >= 13;   /* 1000 片缩到 100% 时虚线会糊成一团，就不画了 */

        if (showSlots) {
          for (i = 0; i < S.pieces.length; i++) {
            p = S.pieces[i];
            if (p.placed) continue;
            if (p.maxX < vx0 || p.minX > vx1 || p.maxY < vy0 || p.minY > vy1) continue;
            tracePath(g, p.pts);
            g.fillStyle = 'rgba(224,231,247,.95)';
            g.fill();
            g.save();
            if (g.setLineDash) g.setLineDash([4 / z, 3 / z]);
            g.lineWidth = 1 / z;
            g.strokeStyle = 'rgba(110,132,188,.45)';
            g.stroke();
            g.restore();
            if (g.setLineDash) g.setLineDash([]);
          }
        }

        /* 已拼好的碎片：直接按当前缩放从原图裁切，不留碎片缓存，放大也清楚 */
        for (i = 0; i < S.pieces.length; i++) {
          p = S.pieces[i];
          if (!p.placed) continue;
          if (p.maxX < vx0 || p.minX > vx1 || p.maxY < vy0 || p.minY > vy1) continue;
          g.save();
          tracePath(g, p.pts);
          g.clip();
          drawPieceImage(g, p);
          g.restore();
          tracePath(g, p.pts);
          g.lineWidth = 0.9 / z;
          g.strokeStyle = 'rgba(20,30,60,.28)';
          g.stroke();
        }

        /* 拖拽目标高亮（可以关掉） */
        if (S.showHover && S.hover >= 0 && S.pieces[S.hover] && !S.pieces[S.hover].placed) {
          tracePath(g, S.pieces[S.hover].pts);
          g.fillStyle = 'rgba(61,220,151,.22)';
          g.fill();
          g.lineWidth = 2 / z;
          g.strokeStyle = '#12a86f';
          g.stroke();
        }
        /* 提示 */
        if (S.hint >= 0 && S.pieces[S.hint] && !S.pieces[S.hint].placed) {
          tracePath(g, S.pieces[S.hint].pts);
          g.fillStyle = 'rgba(255,224,102,.22)';
          g.fill();
          g.save();
          if (g.setLineDash) g.setLineDash([6 / z, 4 / z]);
          g.lineWidth = 2.2 / z;
          g.strokeStyle = '#f0b429';
          g.stroke();
          g.restore();
          if (g.setLineDash) g.setLineDash([]);
        }
        /* 放错位置的红色提醒框 */
        if (S.flash >= 0 && S.pieces[S.flash] && !S.pieces[S.flash].placed) {
          tracePath(g, S.pieces[S.flash].pts);
          g.lineWidth = 2.4 / z;
          g.strokeStyle = 'rgba(224,59,99,.9)';
          g.stroke();
        }

        g.lineWidth = 1 / z;
        g.strokeStyle = 'rgba(120,140,190,.5)';
        rrPath(g, 0, 0, bw, bh, r);
        g.stroke();
        g.restore();
      }

      /** 把一片画进缩略图 / 拖拽幽灵画布（target 是 CSS 像素尺寸） */
      function paintPieceCanvas(cv, p, targetW, targetH) {
        var box = pieceBox(p);
        var s = Math.min(targetW / box.w, targetH / box.h);
        var w = Math.max(6, box.w * s), h = Math.max(6, box.h * s);
        var pr = dpr();
        cv.width = Math.max(1, Math.round(w * pr));
        cv.height = Math.max(1, Math.round(h * pr));
        cv.style.width = Math.round(w) + 'px';
        cv.style.height = Math.round(h) + 'px';
        var g = cv.getContext('2d');
        if (!g) return;
        if (g.setTransform) g.setTransform(pr * s, 0, 0, pr * s, -box.x * s * pr, -box.y * s * pr);
        g.save();
        tracePath(g, p.pts);
        g.clip();
        drawPieceImage(g, p);
        g.restore();
        tracePath(g, p.pts);
        g.lineWidth = 1 / s;
        g.strokeStyle = 'rgba(20,30,60,.35)';
        g.stroke();
        return { w: w, h: h };
      }

      /* ---------------- 切块 / 渲染 ---------------- */
      function buildAll(keep) {
        if (!S.img || !S.imgW || !S.imgH) return;
        var plan = planGrid(S.count, S.imgW / S.imgH);
        S.cols = plan.cols;
        S.rows = plan.rows;
        var size = stageSize();
        S.stageW = size.w;
        S.stageH = size.h;
        var fit = fitBox(S.imgW, S.imgH, size.w - 12, size.h - 12);
        S.boardW = Math.max(60, Math.round(fit.w));
        S.boardH = Math.max(60, Math.round(fit.h));
        applyCanvasSize();

        var keepPlaced = {};
        if (keep) S.pieces.forEach(function (p) { if (p.placed) keepPlaced[p.i] = 1; });
        var built = buildPuzzle({
          w: S.boardW, h: S.boardH, cols: S.cols, rows: S.rows,
          mode: S.mode
        });
        S.cellW = built.cellW;
        S.cellH = built.cellH;
        S.pieces = built.pieces;
        S.placed = 0;
        S.pieces.forEach(function (p, i) {
          p.i = i;
          p.placed = !!keepPlaced[i];
          p.boxW = p.maxX - p.minX + PAD * 2;
          p.boxH = p.maxY - p.minY + PAD * 2;
          if (p.placed) S.placed += 1;
        });
        if (!keep) {
          S.order = shuffled(S.pieces.length);
          S.selected = -1;
          S.hover = -1;
          S.hint = -1;
          S.flash = -1;
          S.zoom = defaultZoomFor(S.count);
          centerView();
        } else {
          S.order = (S.order || []).filter(function (i) { return S.pieces[i] && !S.pieces[i].placed; });
          clampPan();
        }
        renderTray();
        updateHud();
        updateZoomLabel();
      }

      /* ---------------- 下方碎片列表（虚拟滚动） ---------------- */
      var ITEM_W = 54, ITEM_GAP = 7, ITEM_STEP = ITEM_W + ITEM_GAP;

      function itemEl(pi, pos) {
        var p = S.pieces[pi];
        var item = U.el('div', 'pz-item');
        if (S.selected === pi) item.classList.add('on');
        if (S.hint === pi) item.classList.add('hint');
        item.dataset.piece = String(pi);
        item.style.left = Math.round(pos * ITEM_STEP) + 'px';
        var tc = U.el('canvas', 'pz-thumb');
        paintPieceCanvas(tc, p, THUMB, THUMB);
        item.appendChild(tc);
        item.addEventListener('pointerdown', function (e) { onItemDown(e, pi, item); });
        return item;
      }

      function renderTray() {
        var keepScroll = strip.scrollLeft || 0;
        strip.innerHTML = '';
        track = null;
        if (!S.order.length) {
          strip.appendChild(U.el('div', 'pz-empty', S.pieces.length ? '碎片都放上去了 🎉' : '正在准备拼图…'));
          return;
        }
        track = U.el('div', 'pz-track');
        track.style.width = (S.order.length * ITEM_STEP - ITEM_GAP) + 'px';
        strip.appendChild(track);
        strip.scrollLeft = keepScroll;
        trayFirst = -1;
        trayLast = -1;
        renderTrayWindow(true);
      }

      function renderTrayWindow(force) {
        if (!track) return;
        var total = S.order.length;
        var vw = strip.clientWidth || 320;
        var left = strip.scrollLeft || 0;
        var first = Math.max(0, Math.floor(left / ITEM_STEP) - 2);
        var count = Math.ceil(vw / ITEM_STEP) + 5;
        var last = Math.min(total, first + count);
        if (!force && first === trayFirst && last === trayLast) return;
        trayFirst = first;
        trayLast = last;
        track.innerHTML = '';
        for (var i = first; i < last; i++) {
          var pi = S.order[i];
          if (!S.pieces[pi] || S.pieces[pi].placed) continue;
          track.appendChild(itemEl(pi, i));
        }
      }

      function updateHud() {
        var total = S.pieces.length;
        var left = Math.max(0, total - S.placed);
        if (!total) {
          labLeft.textContent = '正在准备拼图…';
          labRight.textContent = '完成 0/0 · 0:00';
          return;
        }
        labLeft.textContent = (S.imgName ? '待拼 ' + left + ' 片 · ' + S.imgName : '待拼 ' + left + ' 片');
        labRight.textContent = '完成 ' + S.placed + '/' + total + ' · ' + fmtTime(S.elapsed);
      }

      function syncControls() {
        if (S.mode === 'classic') btnClassic.classList.add('on'); else btnClassic.classList.remove('on');
        if (S.mode === 'jigsaw') btnJigsaw.classList.add('on'); else btnJigsaw.classList.remove('on');
        var activeChip = null;
        chips.forEach(function (c) {
          var on = Number(c.dataset.n) === S.count;
          if (on) { c.classList.add('on'); activeChip = c; } else c.classList.remove('on');
        });
        if (S.preview) btnEye.classList.add('on'); else btnEye.classList.remove('on');
        if (S.showHover) { btnHover.classList.add('on'); btnHover.classList.remove('off'); }
        else { btnHover.classList.remove('on'); btnHover.classList.add('off'); }
        btnHover.title = S.showHover ? '绿色吸附提示：开（点一下关掉）' : '绿色吸附提示：关（点一下打开）';
        updateZoomLabel();
        try { ctx.setTitle('拼图 · ' + S.count + ' 片'); } catch (e) { /* 没有标题栏也无所谓 */ }
        ensureChipVisible(activeChip);
      }

      /* 片数 chips 在窄屏上要横向滚动：把当前选中的那颗滚进视野 */
      function ensureChipVisible(chip) {
        if (!chip || chipRaf) return;
        chipRaf = requestAnimationFrame(function () {
          chipRaf = 0;
          if (typeof chip.getBoundingClientRect !== 'function') return;
          if (typeof countsEl.getBoundingClientRect !== 'function') return;
          var cr = chip.getBoundingClientRect();
          var er = countsEl.getBoundingClientRect();
          if (!cr.width || !er.width) return;
          if (cr.left < er.left) {
            countsEl.scrollLeft = Math.max(0, (countsEl.scrollLeft || 0) + (cr.left - er.left) - 8);
          } else if (cr.right > er.right) {
            countsEl.scrollLeft = (countsEl.scrollLeft || 0) + (cr.right - er.right) + 8;
          }
        });
      }

      function scrollToPiece(pi) {
        var idx = S.order.indexOf(pi);
        if (idx < 0) return;
        var vw = strip.clientWidth || 320;
        strip.scrollLeft = Math.max(0, idx * ITEM_STEP - (vw - ITEM_W) / 2);
        renderTrayWindow(true);
      }

      function scrollTray(dir) {
        if (!S.order.length) return;
        var vw = strip.clientWidth || 320;
        strip.scrollLeft = Math.max(0, (strip.scrollLeft || 0) + dir * Math.max(90, vw * 0.7));
        renderTrayWindow(false);
      }

      /* ---------------- 计时 ---------------- */
      function startClock() {
        if (S.clockOn || S.over) return;
        S.clockOn = true;
        S.startedAt = Date.now() - S.elapsed * 1000;
        S.timer = setInterval(function () {
          if (!S.startedAt || closed) return;
          S.elapsed = Math.round((Date.now() - S.startedAt) / 1000);
          updateHud();
        }, 500);
      }
      function stopClock() {
        if (S.timer) { clearInterval(S.timer); S.timer = 0; }
        S.clockOn = false;
      }

      /* ---------------- 取 / 放碎片 ---------------- */
      function selectPiece(pi) {
        if (S.over) return;
        if (!S.pieces[pi] || S.pieces[pi].placed) return;
        startClock();
        S.selected = (S.selected === pi) ? -1 : pi;
        renderTray();
        drawBoard();
      }

      function tolerance() {
        var base = snapTol(S.cellW || 1, S.cellH || 1);
        var screen = 16 / (S.zoom || 1);   /* 屏幕上至少留 8~16px 的吸附手感 */
        return { x: Math.max(base.x, screen), y: Math.max(base.y, screen) };
      }

      function tryPlace(pi, pos) {
        var p = S.pieces[pi];
        if (!p || p.placed || S.over || !pos) return false;
        var tol = tolerance();
        if (Math.abs(pos.x - p.cx) > tol.x || Math.abs(pos.y - p.cy) > tol.y) {
          rejectDrop(pi);
          return false;
        }
        placePiece(pi);
        return true;
      }

      function placePiece(pi) {
        var p = S.pieces[pi];
        if (!p || p.placed) return;
        startClock();
        p.placed = true;
        S.placed += 1;
        S.moves += 1;
        S.order = S.order.filter(function (x) { return x !== pi; });
        if (S.selected === pi) S.selected = -1;
        if (S.hover === pi) S.hover = -1;
        if (S.hint === pi) S.hint = -1;
        if (S.flash === pi) S.flash = -1;
        renderTray();
        drawBoard();
        updateHud();
        if (S.pieces.length && S.placed >= S.pieces.length) finish();
        else scheduleSave();
      }

      function rejectDrop(pi) {
        var p = S.pieces[pi];
        if (!p) return;
        S.flash = pi;
        drawBoard();
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(function () {
          flashTimer = 0;
          S.flash = -1;
          drawBoard();
        }, 620);
        /* 每滑错一次就弹一次提示会很吵，这里做 2.2 秒节流 */
        if (Date.now() - lastRejectTip > 2200) {
          lastRejectTip = Date.now();
          phone.toast(slotsVisible()
            ? '还没对准：把碎片拖到它的虚线框里，靠近会自动吸住'
            : '还没对准：放大一点再找它的位置（滚轮 / 双指 / 🔍）', 'bad');
        }
      }

      function slotsVisible() {
        return Math.min(S.cellW || 0, S.cellH || 0) * (S.zoom || 1) >= 13;
      }

      function finish() {
        S.over = true;
        if (S.clockOn && S.startedAt) S.elapsed = Math.round((Date.now() - S.startedAt) / 1000);
        stopClock();
        var key = S.mode + ':' + S.count;
        var best = store.get('best', {});
        if (!best || typeof best !== 'object') best = {};
        var prev = best[key];
        var isNew = !prev || S.elapsed < Number(prev.time);
        if (isNew) {
          best[key] = { time: S.elapsed, moves: S.moves, at: Date.now() };
          store.set('best', best);
        }
        clearSave();
        updateHud();
        drawBoard();
        overSub.textContent = '用时 ' + fmtTime(S.elapsed) + ' · ' + S.pieces.length + ' 片 · ' + S.moves + ' 步'
          + (isNew ? ' · 新纪录！' : (prev ? '（最好 ' + fmtTime(prev.time) + '）' : ''));
        overEl.classList.add('show');
        phone.toast('拼好了！用时 ' + fmtTime(S.elapsed), '');
      }

      function hideOverlay() { overEl.classList.remove('show'); }

      function clearRoundTimers() {
        if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = 0; }
      }

      function newRound(keep) {
        hideOverlay();
        closeSheet();
        if (drag) endDrag(false);
        clearRoundTimers();
        S.hint = -1;
        S.flash = -1;
        if (!keep) {
          stopClock();
          S.elapsed = 0;
          S.moves = 0;
          S.selected = -1;
          S.over = false;
          S.preview = false;
        }
        buildAll(keep);
        syncControls();
        drawBoard();
      }

      /* ---------------- 存档 ---------------- */
      function ensureImageDataUrl() {
        if (S.imgDataUrl) return S.imgDataUrl;
        try {
          if (S.img && typeof S.img.toDataURL === 'function') {
            S.imgDataUrl = S.img.toDataURL('image/jpeg', 0.86);
            return S.imgDataUrl;
          }
        } catch (e) { /* 忽略 */ }
        return '';
      }

      function saveGame(silent) {
        if (!S.img || !S.pieces.length || S.over) return Promise.resolve(false);
        if (S.placed <= 0) {
          if (!silent) phone.toast('还没放下一片，先拼一片再保存吧', '');
          return Promise.resolve(false);
        }
        var dataUrl = ensureImageDataUrl();
        if (!dataUrl) {
          if (!silent) phone.toast('这个浏览器不支持把图片存下来', 'bad');
          return Promise.resolve(false);
        }
        var st = {
          v: 1, mode: S.mode, count: S.count, cols: S.cols, rows: S.rows,
          total: S.pieces.length, moves: S.moves,
          elapsed: Math.round(S.elapsed),
          zoom: Math.round(S.zoom * 100) / 100,
          panX: Math.round(S.panX), panY: Math.round(S.panY),
          placed: [], order: [], savedAt: Date.now()
        };
        S.pieces.forEach(function (p, i) { if (p.placed) st.placed.push(i); });
        st.order = S.order.slice();
        var tasks = [];
        if (S.savedImgUrl !== dataUrl) {
          tasks.push(storagePut('image', JSON.stringify({
            name: S.imgName, w: S.imgW, h: S.imgH, dataUrl: dataUrl
          })).then(function (ok) {
            if (ok) S.savedImgUrl = dataUrl;
            return ok;
          }));
        }
        tasks.push(storagePut('state', JSON.stringify(st)));
        return Promise.all(tasks).then(function (rs) {
          var ok = true;
          for (var i = 0; i < rs.length; i++) if (rs[i] === false) ok = false;
          if (ok) {
            if (!silent) phone.toast('已保存：' + S.placed + '/' + S.pieces.length + ' 片，下次打开自动接着拼', '');
          } else if (!silent) {
            phone.toast('保存失败：图片太大，浏览器本地存储放不下', 'bad');
          }
          return ok;
        }).catch(function () {
          if (!silent) phone.toast('保存失败：浏览器本地存储不可用', 'bad');
          return false;
        });
      }

      function scheduleSave() {
        if (closed || S.over || S.placed <= 0) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          saveTimer = 0;
          if (!closed) saveGame(true);
        }, 800);
      }

      function clearSave() {
        storageDel('state');
        storageDel('image');
        S.savedImgUrl = '';
      }

      function loadSaved() {
        return storageGet('state').then(function (rawState) {
          if (!rawState) return null;
          var st;
          try { st = JSON.parse(rawState); } catch (e) { return null; }
          if (!st || !st.placed || !st.placed.length) return null;
          if (st.total && st.placed.length >= Number(st.total)) return null;   /* 已经拼完的局不用恢复 */
          return storageGet('image').then(function (rawImg) {
            if (!rawImg) return null;
            var rec;
            try { rec = JSON.parse(rawImg); } catch (e) { return null; }
            if (!rec || !rec.dataUrl) return null;
            return decodeImage(rec.dataUrl, rec.name).then(function (res) {
              return { state: st, img: res, dataUrl: rec.dataUrl };
            });
          });
        });
      }

      function restoreSaved(saved) {
        var st = saved.state, res = saved.img;
        if (!st || !res || !res.w || !res.h) return false;
        var cnt = Number(st.count);
        S.count = COUNTS.indexOf(cnt) >= 0 ? cnt : S.count;
        S.mode = st.mode === 'jigsaw' ? 'jigsaw' : 'classic';
        S.img = res.src;
        S.imgW = res.w;
        S.imgH = res.h;
        S.imgName = res.name || '已保存的拼图';
        S.imgDataUrl = saved.dataUrl;
        S.savedImgUrl = saved.dataUrl;
        S.zoom = 1;
        buildAll(false);

        var placedSet = {}, i, idx;
        (st.placed || []).forEach(function (v) { placedSet[Number(v)] = 1; });
        S.placed = 0;
        S.pieces.forEach(function (p, k) {
          p.placed = !!placedSet[k];
          if (p.placed) S.placed += 1;
        });
        var order = [], seen = {};
        (st.order || []).forEach(function (v) {
          idx = Number(v);
          if (idx >= 0 && idx < S.pieces.length && !S.pieces[idx].placed && !seen[idx]) {
            seen[idx] = 1;
            order.push(idx);
          }
        });
        S.pieces.forEach(function (p, k) { if (!p.placed && !seen[k]) order.push(k); });
        S.order = order;
        S.moves = Number(st.moves) || 0;
        S.elapsed = Number(st.elapsed) || 0;
        S.over = false;
        S.zoom = clampNum(Number(st.zoom) || 1, 1, 8);
        S.panX = Number(st.panX) || 0;
        S.panY = Number(st.panY) || 0;
        clampPan();
        store.set('mode', S.mode);
        store.set('count', S.count);
        renderTray();
        drawBoard();
        updateHud();
        updateZoomLabel();
        syncControls();
        if (S.placed > 0) startClock();
        return true;
      }

      /* ---------------- 换图 ---------------- */
      function applyImage(src, w, h, name, dataUrl) {
        if (!src || !w || !h) { phone.toast('这张图片读不出尺寸，换一张试试', 'bad'); return false; }
        S.img = src;
        S.imgW = w;
        S.imgH = h;
        S.imgName = name || '本地图片';
        S.imgDataUrl = dataUrl || '';
        S.sampleKey = 'local';      /* 换图面板里不再高亮某张示例图 */
        newRound(false);
        return true;
      }

      function loadSample(key, silent) {
        var made = sampleFor(key);
        S.sampleKey = made.key;
        store.set('sample', made.key);
        S.img = made.src;
        S.imgW = made.w;
        S.imgH = made.h;
        S.imgName = made.name;
        S.imgDataUrl = '';
        newRound(false);
        if (!silent) phone.toast('示例图：' + made.name, '');
      }

      function readFileAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
          try {
            var r = new FileReader();
            r.onload = function () { resolve(String(r.result)); };
            r.onerror = function () { reject(new Error('读取文件失败')); };
            r.readAsDataURL(file);
          } catch (e) { reject(e); }
        });
      }

      function decodeImage(url, name) {
        return new Promise(function (resolve, reject) {
          if (typeof Image !== 'function') { reject(new Error('当前环境不支持加载图片')); return; }
          var img = new Image();
          img.onload = function () {
            resolve({
              src: img,
              w: img.naturalWidth || img.width || 0,
              h: img.naturalHeight || img.height || 0,
              name: name || '本地图片'
            });
          };
          img.onerror = function () { reject(new Error('图片解码失败，换一张试试')); };
          img.src = url;
        });
      }

      function importFile(file) {
        if (!file) return Promise.resolve(false);
        userStarted = true;
        if (file.type && file.type.indexOf('image/') !== 0) {
          phone.toast('这不是图片文件', 'bad');
          return Promise.resolve(false);
        }
        return readFileAsDataUrl(file)
          .then(function (url) {
            return decodeImage(url, file.name).then(function (res) {
              res.dataUrl = url;
              return res;
            });
          })
          .then(function (res) {
            closeSheet();
            applyImage(res.src, res.w, res.h, res.name, res.dataUrl);
            phone.toast('已换成「' + res.name + '」', '');
            return true;
          })
          .catch(function (err) {
            phone.toast('导入失败：' + (err && err.message ? err.message : err), 'bad');
            return false;
          });
      }

      function pickImage() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.addEventListener('change', function () {
          var f = input.files && input.files[0];
          if (f) importFile(f);
          if (input.parentNode) input.parentNode.removeChild(input);
        });
        /* 有的浏览器要求 input 在文档里才能弹出选择框 */
        wrap.appendChild(input);
        input.click();
      }

      function fillSheet() {
        if (sheetFilled) return;
        sheetFilled = true;
        SAMPLES.forEach(function (def) {
          var made = sampleFor(def.key);
          var card = U.el('button', 'pz-sample');
          card.type = 'button';
          card.dataset.sample = def.key;
          var prev = U.el('canvas');
          var pw = 78, ph = Math.round(pw * def.h / def.w);
          if (ph > 96) { ph = 96; pw = Math.round(ph * def.w / def.h); }
          var pr = dpr();
          prev.width = Math.max(1, Math.round(pw * pr));
          prev.height = Math.max(1, Math.round(ph * pr));
          prev.style.width = pw + 'px';
          prev.style.height = ph + 'px';
          var g = prev.getContext('2d');
          if (g) {
            if (g.setTransform) g.setTransform(pr, 0, 0, pr, 0, 0);
            g.drawImage(made.src, 0, 0, pw, ph);
          }
          card.appendChild(prev);
          card.appendChild(U.el('span', null, def.name));
          card.addEventListener('click', function () {
            userStarted = true;
            closeSheet();
            loadSample(def.key, true);
            phone.toast('已换成「' + def.name + '」：' + S.count + ' 片', '');
          });
          samplesEl.appendChild(card);
        });
        refreshSheetActive();
      }

      function refreshSheetActive() {
        var kids = samplesEl.children || [];
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (!k || !k.dataset) continue;
          var on = k.dataset.sample === S.sampleKey;
          if (on) k.classList.add('on'); else k.classList.remove('on');
        }
      }

      function openSheet() {
        fillSheet();
        refreshSheetActive();
        sheetOpen = true;
        sheet.classList.add('show');
      }
      function closeSheet() {
        sheetOpen = false;
        sheet.classList.remove('show');
      }

      /* ---------------- 拖拽（从下方列表拿碎片） ---------------- */
      function itemDownLike(e) {
        if (!e) return false;
        if (typeof e.button === 'number' && e.button !== 0) return false;
        if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return false;
        return true;
      }

      function onItemDown(e, pi, item) {
        if (S.over || S.preview || sheetOpen || pan || pinch) return;
        if (!itemDownLike(e)) return;
        userStarted = true;
        if (drag) endDrag(false);
        drag = { pi: pi, item: item, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
        bindDoc();
      }

      function bindDoc() {
        unbindDoc();
        document.addEventListener('pointermove', onDocMove);
        document.addEventListener('pointerup', onDocUp);
        document.addEventListener('pointercancel', onDocCancel);
      }
      function unbindDoc() {
        document.removeEventListener('pointermove', onDocMove);
        document.removeEventListener('pointerup', onDocUp);
        document.removeEventListener('pointercancel', onDocCancel);
      }

      function onDocMove(e) {
        if (!drag) return;
        var cx = e.clientX || 0, cy = e.clientY || 0;
        drag.x = cx;
        drag.y = cy;
        if (!drag.active) {
          var dx = cx - drag.x0, dy = cy - drag.y0;
          if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
          /* 横向滑动 = 让下面的列表自己滚（手机上很关键）。
             判据是「几乎水平」：竖直方向只要动了一点就按拿碎片处理。 */
          if (Math.abs(dy) < 12 && Math.abs(dx) > 10) { endDrag(false); return; }
          drag.active = true;
          S.selected = drag.pi;
          showGhost(drag.pi);
          if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
          S.hint = -1;
          startClock();
        }
        if (e.cancelable && e.preventDefault) e.preventDefault();
        moveGhost(cx, cy);
        updateHover(cx, cy);
      }

      function onDocUp(e) {
        if (!drag) return;
        var d = drag;
        if (!d.active) {
          endDrag(false);
          selectPiece(d.pi);
          return;
        }
        var pos = clientToBoard(e.clientX || 0, e.clientY || 0);
        endDrag(false);
        if (pos) tryPlace(d.pi, pos);
      }

      /* 浏览器把这次手势当成滚动 / 触控被系统打断：直接放弃，别误选中/误放 */
      function onDocCancel() {
        if (!drag) return;
        endDrag(false);
      }

      function endDrag(redraw) {
        unbindDoc();
        hideGhost();
        var hadHover = S.hover >= 0;
        drag = null;
        S.hover = -1;
        /* 拖到板外 / 手势被取消时也要把绿色高亮擦掉 */
        if (redraw !== false || hadHover) drawBoard();
      }

      function ghostScale() { return clampNum(S.zoom, 1, 2.5); }

      function showGhost(pi) {
        var p = S.pieces[pi];
        if (!p) return;
        var gs = ghostScale();
        var box = pieceBox(p);
        var made = paintPieceCanvas(ghost, p, box.w * gs, box.h * gs);
        drag.gs = gs;
        drag.ghostW = made ? made.w : box.w * gs;
        drag.ghostH = made ? made.h : box.h * gs;
        ghost.style.display = 'block';
      }

      function moveGhost(cx, cy) {
        if (!drag) return;
        var r = wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
        ghost.style.left = Math.round(cx - (r.left || 0) - (drag.ghostW || 0) / 2) + 'px';
        ghost.style.top = Math.round(cy - (r.top || 0) - (drag.ghostH || 0) / 2) + 'px';
      }

      function hideGhost() { ghost.style.display = 'none'; }

      /** 屏幕坐标 → 舞台 CSS 坐标（假 DOM 里 rect 与 CSS 尺寸可能不一致，这里做了补偿） */
      function localPoint(cx, cy) {
        var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        var rw = (r && r.width) || S.stageW || 1;
        var rh = (r && r.height) || S.stageH || 1;
        return {
          x: (cx - ((r && r.left) || 0)) * (S.stageW / rw),
          y: (cy - ((r && r.top) || 0)) * (S.stageH / rh)
        };
      }
      function clientToBoard(cx, cy) {
        if (!S.boardW || !S.stageW) return null;
        var lp = localPoint(cx, cy);
        var x = (lp.x - S.panX) / S.zoom;
        var y = (lp.y - S.panY) / S.zoom;
        if (x < -10 || y < -10 || x > S.boardW + 10 || y > S.boardH + 10) return null;
        return { x: x, y: y };
      }
      function boardPointToClient(x, y) {
        var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: S.stageW, height: S.stageH };
        var kx = S.stageW / ((r.width || S.stageW) || 1);
        var ky = S.stageH / ((r.height || S.stageH) || 1);
        return {
          x: (r.left || 0) + (S.panX + x * S.zoom) / kx,
          y: (r.top || 0) + (S.panY + y * S.zoom) / ky
        };
      }

      function updateHover(cx, cy) {
        if (!drag || !drag.active) return;
        if (!S.showHover) {
          if (S.hover >= 0) { S.hover = -1; requestDraw(); }
          return;
        }
        var p = S.pieces[drag.pi];
        var pos = clientToBoard(cx, cy);
        var hit = -1;
        if (pos && p && !p.placed) {
          var tol = tolerance();
          if (Math.abs(pos.x - p.cx) <= tol.x && Math.abs(pos.y - p.cy) <= tol.y) hit = drag.pi;
        }
        if (hit !== S.hover) { S.hover = hit; requestDraw(); }
      }

      /* ---------------- 底板：平移 / 双指缩放 / 滚轮缩放 / 点按放置 ---------------- */
      function ptrId(e) { return (e && e.pointerId != null) ? String(e.pointerId) : 'mouse'; }
      function ptrCount() { var n = 0, k; for (k in pointers) { if (pointers.hasOwnProperty(k)) n++; } return n; }
      function firstPointerId() {
        for (var k in pointers) { if (pointers.hasOwnProperty(k)) return k; }
        return null;
      }

      function bindBoard() {
        unbindBoard();
        document.addEventListener('pointermove', onBoardMove);
        document.addEventListener('pointerup', onBoardUp);
        document.addEventListener('pointercancel', onBoardCancel);
      }
      function unbindBoard() {
        document.removeEventListener('pointermove', onBoardMove);
        document.removeEventListener('pointerup', onBoardUp);
        document.removeEventListener('pointercancel', onBoardCancel);
      }

      function onBoardDown(e) {
        if (!S.img || S.over || S.preview || sheetOpen || drag) return;
        if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        pointers[ptrId(e)] = { x: e.clientX, y: e.clientY };
        if (ptrCount() === 2) {
          beginPinch();
        } else if (ptrCount() === 1) {
          pan = { x0: e.clientX, y0: e.clientY, panX: S.panX, panY: S.panY, moved: false };
        }
        canvas.classList.add('pz-panning');
        bindBoard();
      }

      function onBoardMove(e) {
        var id = ptrId(e);
        if (pointers[id]) { pointers[id].x = e.clientX; pointers[id].y = e.clientY; }
        if (pinch) { movePinch(); return; }
        if (!pan) return;
        var dx = e.clientX - pan.x0, dy = e.clientY - pan.y0;
        if (!pan.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        pan.moved = true;
        if (S.zoom <= 1) return;            /* 没放大时没有可平移的内容 */
        S.panX = pan.panX + dx;
        S.panY = pan.panY + dy;
        clampPan();
        if (e.cancelable && e.preventDefault) e.preventDefault();
        requestDraw();
      }

      function onBoardUp(e) {
        var id = ptrId(e);
        var wasPinch = !!pinch;
        delete pointers[id];
        if (pinch && ptrCount() < 2) {
          pinch = null;
          if (ptrCount() === 1) {
            var rid = firstPointerId();
            var rp = pointers[rid];
            pan = { x0: rp.x, y0: rp.y, panX: S.panX, panY: S.panY, moved: true };
          }
        }
        var moved = !!(pan && pan.moved);
        if (!wasPinch && pan && !moved && S.selected >= 0) {
          var pos = clientToBoard(e.clientX, e.clientY);
          if (pos) tryPlace(S.selected, pos);
        }
        if (ptrCount() === 0) {
          pan = null;
          pinch = null;
          unbindBoard();
          canvas.classList.remove('pz-panning');
          scheduleSave();
        }
      }

      function onBoardCancel(e) {
        if (e) delete pointers[ptrId(e)];
        if (ptrCount() === 0) {
          pan = null;
          pinch = null;
          unbindBoard();
          canvas.classList.remove('pz-panning');
        } else if (pinch && ptrCount() < 2) {
          pinch = null;
        }
      }

      function twoPointers() {
        var ids = [], k;
        for (k in pointers) { if (pointers.hasOwnProperty(k)) ids.push(k); }
        if (ids.length < 2) return null;
        return { a: pointers[ids[0]], b: pointers[ids[1]] };
      }
      function beginPinch() {
        var pair = twoPointers();
        if (!pair) return;
        var dx = pair.a.x - pair.b.x, dy = pair.a.y - pair.b.y;
        var d0 = Math.sqrt(dx * dx + dy * dy) || 1;
        var lp = localPoint((pair.a.x + pair.b.x) / 2, (pair.a.y + pair.b.y) / 2);
        pinch = {
          d0: d0,
          z0: S.zoom,
          bx: (lp.x - S.panX) / S.zoom,
          by: (lp.y - S.panY) / S.zoom
        };
        pan = null;
      }
      function movePinch() {
        var pair = twoPointers();
        if (!pair) { pinch = null; return; }
        var dx = pair.a.x - pair.b.x, dy = pair.a.y - pair.b.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var z = clampNum(pinch.z0 * (d / pinch.d0), 1, 8);
        var lp = localPoint((pair.a.x + pair.b.x) / 2, (pair.a.y + pair.b.y) / 2);
        S.zoom = Math.round(z * 100) / 100;
        S.panX = lp.x - pinch.bx * S.zoom;
        S.panY = lp.y - pinch.by * S.zoom;
        clampPan();
        updateZoomLabel();
        requestDraw();
      }

      function onWheel(e) {
        if (!S.img || S.over || sheetOpen) return;
        if (!e.deltaY) return;
        if (e.preventDefault) e.preventDefault();
        var lp = localPoint(e.clientX || 0, e.clientY || 0);
        var f = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        setZoom(S.zoom * f, lp.x, lp.y);
      }

      /* ---------------- 设置 ---------------- */
      function setMode(m) {
        m = m === 'jigsaw' ? 'jigsaw' : 'classic';
        if (m !== S.mode) {
          userStarted = true;
          S.mode = m;
          store.set('mode', m);
          newRound(false);
        }
        syncControls();
      }
      function setCount(n) {
        n = Number(n);
        if (COUNTS.indexOf(n) < 0) n = COUNTS[2];
        if (n !== S.count) {
          userStarted = true;
          S.count = n;
          store.set('count', n);
          newRound(false);
          if (n >= 200) phone.toast('片数很多：已经帮你放大到 ' + Math.round(S.zoom * 100) + '%，用 🔍 / 滚轮 / 双指调整', '');
        }
        syncControls();
      }
      function togglePreview() {
        S.preview = !S.preview;
        syncControls();
        drawBoard();
      }
      function setHoverBox(on, silent) {
        S.showHover = !!on;
        store.set('hoverBox', S.showHover ? 1 : 0);
        if (!S.showHover) S.hover = -1;
        syncControls();
        drawBoard();
        if (!silent) phone.toast(S.showHover ? '绿色吸附提示已打开' : '绿色吸附提示已关闭（要靠自己找位置了）', '');
      }
      function focusPiece(pi) {
        var p = S.pieces[pi];
        if (!p) return;
        var sx = S.panX + p.cx * S.zoom;
        var sy = S.panY + p.cy * S.zoom;
        if (sx < 40 || sy < 40 || sx > S.stageW - 40 || sy > S.stageH - 40) {
          S.panX = S.stageW / 2 - p.cx * S.zoom;
          S.panY = S.stageH / 2 - p.cy * S.zoom;
          clampPan();
          drawBoard();
        }
      }
      function showHint() {
        if (S.over) return;
        if (S.preview) { S.preview = false; syncControls(); }
        var pool = S.order.filter(function (i) { return S.pieces[i] && !S.pieces[i].placed; });
        if (!pool.length) return;
        var pi = pool[Math.floor(Math.random() * pool.length)];
        S.hint = pi;
        S.selected = pi;
        renderTray();
        scrollToPiece(pi);
        focusPiece(pi);
        drawBoard();
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = setTimeout(function () {
          hintTimer = 0;
          S.hint = -1;
          drawBoard();
        }, 2600);
        phone.toast('这一片的家在闪金框的地方', '');
      }

      /* ---------------- 尺寸变化 ---------------- */
      function relayout() {
        if (!S.img || !S.pieces.length) return;
        var size = stageSize();
        var fit = fitBox(S.imgW, S.imgH, size.w - 12, size.h - 12);
        var nw = Math.max(60, Math.round(fit.w));
        var nh = Math.max(60, Math.round(fit.h));
        var needRebuild = Math.abs(nw - S.boardW) > 1 || Math.abs(nh - S.boardH) > 1;
        if (!needRebuild && size.w === S.stageW && size.h === S.stageH) return;
        if (needRebuild) {
          buildAll(true);
        } else {
          S.stageW = size.w;
          S.stageH = size.h;
          applyCanvasSize();
          clampPan();
        }
        drawBoard();
      }
      function onResize() {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(function () {
          resizeRaf = 0;
          if (!closed) relayout();
        });
      }

      /* ---------------- 事件绑定 ---------------- */
      btnClassic.addEventListener('click', function () { setMode('classic'); });
      btnJigsaw.addEventListener('click', function () { setMode('jigsaw'); });
      btnHover.addEventListener('click', function () { setHoverBox(!S.showHover); });
      btnHint.addEventListener('click', function () { showHint(); });
      btnEye.addEventListener('click', function () { togglePreview(); });
      btnZoomOut.addEventListener('click', function () { zoomStep(-1); });
      btnZoomIn.addEventListener('click', function () { zoomStep(1); });
      btnZoomLabel.addEventListener('click', function () { resetZoom(); });
      btnSave.addEventListener('click', function () {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
        saveGame(false);
      });
      btnPrev.addEventListener('click', function () { scrollTray(-1); });
      btnNext.addEventListener('click', function () { scrollTray(1); });
      sheetX.addEventListener('click', function () { closeSheet(); });
      sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
      importBtn.addEventListener('click', function () { pickImage(); });
      overAgain.addEventListener('click', function () { userStarted = true; newRound(false); });
      overNew.addEventListener('click', function () { openSheet(); });
      canvas.addEventListener('pointerdown', onBoardDown);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      var onCtxMenu = function (e) { if (e && e.preventDefault) e.preventDefault(); };
      canvas.addEventListener('contextmenu', onCtxMenu);

      strip.addEventListener('scroll', function () {
        if (trayRaf) return;
        trayRaf = requestAnimationFrame(function () {
          trayRaf = 0;
          if (!closed) renderTrayWindow(false);
        });
      });

      var onDragOver = function (e) { if (e && e.preventDefault) e.preventDefault(); };
      var onDrop = function (e) {
        if (!e) return;
        if (e.preventDefault) e.preventDefault();
        var dt = e.dataTransfer;
        var f = dt && dt.files && dt.files[0];
        if (f) importFile(f);
      };
      wrap.addEventListener('dragover', onDragOver);
      wrap.addEventListener('drop', onDrop);

      ctx.addAction('🖼 换图', function () { openSheet(); });
      ctx.addAction('↻ 重开', function () { userStarted = true; newRound(false); });

      window.addEventListener('resize', onResize);

      ctx.onKey(function (e) {
        if (!e) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = String(e.key || '').toLowerCase();
        if (k === 'escape' && sheetOpen) { if (e.preventDefault) e.preventDefault(); closeSheet(); return; }
        if (k === 'h') { if (e.preventDefault) e.preventDefault(); showHint(); return; }
        if (k === 'p') { if (e.preventDefault) e.preventDefault(); togglePreview(); return; }
        if (k === 'g') { if (e.preventDefault) e.preventDefault(); setHoverBox(!S.showHover, true); return; }
        if (k === '0') { if (e.preventDefault) e.preventDefault(); resetZoom(); return; }
        if (k === 'r') { if (e.preventDefault) e.preventDefault(); newRound(false); }
      });

      /* ---------------- 启动：先试恢复上次进度，没有就用示例图 ---------------- */
      S.mode = store.get('mode', 'classic') === 'jigsaw' ? 'jigsaw' : 'classic';
      var savedCount = Number(store.get('count', 24));
      S.count = COUNTS.indexOf(savedCount) >= 0 ? savedCount : 24;
      S.showHover = store.get('hoverBox', 1) !== 0;
      S.sampleKey = store.get('sample', 'sunset');

      function maybeShowTip(restored) {
        if (restored || store.get('seenTip', 0)) return;
        store.set('seenTip', 1);
        tipTimer = setTimeout(function () {
          tipTimer = 0;
          if (!closed) phone.toast('把碎片拖到虚线框里，靠近会自动吸住；片数多可以用 🔍 放大拼', '');
        }, 700);
      }

      var initPromise = (function () {
        var p;
        try { p = loadSaved(); } catch (e) { p = Promise.resolve(null); }
        return p.then(function (saved) {
          if (closed) return false;
          if (userStarted) {
            /* 存档还没读完用户就动了手：尊重眼前这局，别再覆盖回去 */
            if (!S.pieces.length) loadSample(S.sampleKey, true);
            return false;
          }
          if (saved && restoreSaved(saved)) return true;
          loadSample(S.sampleKey, true);
          return false;
        }).catch(function () {
          if (closed) return false;
          loadSample(S.sampleKey, true);
          return false;
        }).then(function (restored) {
          if (closed) return false;
          if (!S.pieces.length) loadSample(S.sampleKey, true);
          syncControls();
          if (restored && S.placed > 0) {
            phone.toast('已恢复上次的拼图：' + S.placed + '/' + S.pieces.length + ' 片（' + fmtTime(S.elapsed) + '）', '');
          }
          maybeShowTip(restored);
          return true;
        });
      })();

      layoutRaf = requestAnimationFrame(function () { layoutRaf = 0; if (!closed) relayout(); });

      ctx.onCleanup(function () {
        closed = true;
        stopClock();
        unbindDoc();
        unbindBoard();
        hideGhost();
        if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
        if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
        if (chipRaf) { cancelAnimationFrame(chipRaf); chipRaf = 0; }
        if (drawRaf) { cancelAnimationFrame(drawRaf); drawRaf = 0; }
        if (trayRaf) { cancelAnimationFrame(trayRaf); trayRaf = 0; }
        clearRoundTimers();
        if (tipTimer) { clearTimeout(tipTimer); tipTimer = 0; }
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
        window.removeEventListener('resize', onResize);
        wrap.removeEventListener('dragover', onDragOver);
        wrap.removeEventListener('drop', onDrop);
        canvas.removeEventListener('pointerdown', onBoardDown);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onCtxMenu);
        if (S.placed > 0 && !S.over) saveGame(true);
      });

      /* ---------------- 测试把手（挂在 mount 上，注册表浅拷贝会保留它） ---------------- */
      var controller = {
        ready: function () { return initPromise; },
        state: function () {
          return {
            mode: S.mode, count: S.count, total: S.pieces.length, placed: S.placed, moves: S.moves,
            cols: S.cols, rows: S.rows, boardW: S.boardW, boardH: S.boardH,
            cellW: S.cellW, cellH: S.cellH, stageW: S.stageW, stageH: S.stageH,
            zoom: S.zoom, panX: S.panX, panY: S.panY,
            elapsed: S.elapsed, over: S.over, selected: S.selected, hover: S.hover,
            preview: S.preview, showHover: S.showHover, slots: slotsVisible(),
            order: S.order.slice(),
            imgName: S.imgName, imgW: S.imgW, imgH: S.imgH, sampleKey: S.sampleKey,
            best: store.get('best', {})
          };
        },
        board: function () { return { w: S.boardW, h: S.boardH, cols: S.cols, rows: S.rows, cellW: S.cellW, cellH: S.cellH }; },
        piece: function (i) {
          var p = S.pieces[i];
          if (!p) return null;
          return {
            i: i, r: p.r, c: p.c, placed: p.placed, pts: p.pts, minX: p.minX, minY: p.minY,
            maxX: p.maxX, maxY: p.maxY, cx: p.cx, cy: p.cy, boxW: p.boxW, boxH: p.boxH
          };
        },
        target: function (i) { var p = S.pieces[i]; return p ? { x: p.cx, y: p.cy } : null; },
        trayCount: function () { return S.order.length; },
        trayWindow: function () {
          return {
            first: trayFirst, last: trayLast,
            rendered: track ? track.children.length : 0,
            total: S.order.length, step: ITEM_STEP,
            scrollLeft: strip.scrollLeft || 0
          };
        },
        trayScroll: function (left) {
          strip.scrollLeft = Math.max(0, Number(left) || 0);
          renderTrayWindow(true);
          return strip.scrollLeft || 0;
        },
        select: function (i) { selectPiece(i); },
        drop: function (i, x, y) { return tryPlace(i, { x: x, y: y }); },
        placeAll: function () {
          while (S.order.length) placePiece(S.order[0]);
          return S.placed;
        },
        placeOne: function (i) { placePiece(i); },
        setMode: setMode,
        setCount: setCount,
        sample: function (k) { loadSample(k, true); },
        importFile: importFile,
        apply: function (src, w, h, name, dataUrl) { return applyImage(src, w, h, name, dataUrl); },
        openSheet: openSheet,
        closeSheet: closeSheet,
        sheetOpen: function () { return sheetOpen; },
        hint: showHint,
        preview: function () { togglePreview(); },
        hoverBox: function (on) {
          if (typeof on === 'boolean') setHoverBox(on, true);
          else setHoverBox(!S.showHover, true);
          return S.showHover;
        },
        zoom: function () { return S.zoom; },
        setZoom: function (z, ax, ay) { setZoom(z, ax, ay); return S.zoom; },
        resetZoom: resetZoom,
        zoomStep: zoomStep,
        panBy: function (dx, dy) {
          S.panX += Number(dx) || 0;
          S.panY += Number(dy) || 0;
          clampPan();
          drawBoard();
          return { x: S.panX, y: S.panY };
        },
        relayout: relayout,
        newRound: function () { newRound(false); },
        save: function () {
          if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
          return saveGame(false);
        },
        clearSave: clearSave,
        boardPointToClient: boardPointToClient,
        toBoard: function (cx, cy) { return clientToBoard(cx, cy); }
      };

      mount.__test = {
        css: CSS,
        counts: COUNTS.slice(),
        samples: SAMPLES.map(function (s) { return { key: s.key, name: s.name, w: s.w, h: s.h }; }),
        planGrid: planGrid,
        fitBox: fitBox,
        edgePoints: edgePoints,
        buildPuzzle: buildPuzzle,
        snapTol: snapTol,
        fmtTime: fmtTime,
        controller: function () { return controller; }
      };
    }

    return {
      id: 'puzzle',
      name: '拼图',
      icon: 'svg:puzzle',
      desc: '导入图片，切成经典或异形拼图（最多 1000 片）',
      order: 14,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'puzzle', createApp: createApp, code: '' });
})();
