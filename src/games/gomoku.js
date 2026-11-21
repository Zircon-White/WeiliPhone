/* ============================================================
   内置游戏 · 五子棋（纯代码绘制棋盘，AI 由本地评估函数驱动，不调用任何接口）
   ------------------------------------------------------------------
   规则：15×15 棋盘，黑先行，横竖斜任意方向先连成 5 子者胜。
   玩家执黑（默认先手），电脑执白。
   特色：标题栏「💡 求助」按钮 —— 用同一套引擎（最高难度）算出
         玩家当前的最佳一步，在棋盘上用金色标记提示出来。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var N = 15;                 /* 棋盘边长 */
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  var WIN = 10000000;

  /* 棋型分值：[连子数][活/死] —— 活 = 两端都空（open） */
  var PAT = [
    [0, 0, 0],        /* 0 连：占位 */
    [12, 6, 2],       /* 1 连 */
    [120, 70, 18],    /* 2 连 */
    [1400, 420, 90],  /* 3 连 */
    [WIN, 26000, 900],/* 4 连 */
    [WIN, WIN, WIN]   /* 5 连以上 */
  ];

  var CSS_ID = 'gomoku-style';
  var CSS = [
    '.gomoku-wrap{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:8px 10px 10px;box-sizing:border-box;font-family:inherit;color:#0d1330}',
    '.gomoku-hud{display:flex;gap:8px;flex:0 0 auto}',
    '.gomoku-card{flex:1;min-width:0;background:#fff;border-radius:14px;padding:5px 10px 6px;text-align:center;border:1px solid rgba(255,255,255,.85);box-shadow:0 10px 20px -18px rgba(13,19,48,.75)}',
    '.gomoku-card span{display:block;font-size:10px;font-weight:700;color:#5b648f;letter-spacing:.5px;white-space:nowrap}',
    '.gomoku-card b{font-size:15px;font-weight:800;line-height:1.2;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gomoku-card.diff .bwrap{position:relative}',
    '.gomoku-arena{position:relative;flex:1;min-height:0;display:grid;place-items:center}',
    '.gomoku-canvas{display:block;border-radius:16px;box-shadow:0 18px 32px -24px rgba(13,19,48,.9);touch-action:manipulation;cursor:pointer}',
    '.gomoku-hintLayer{position:absolute;pointer-events:none;z-index:5}',
    '.gomoku-hintDot{position:absolute;border-radius:50%;box-sizing:border-box;border:2px dashed #ffb457;background:rgba(255,220,140,.35);animation:goHint 1.05s ease-in-out infinite;box-shadow:0 0 0 3px rgba(255,255,255,.55)}',
    '@keyframes goHint{0%,100%{transform:scale(.78);opacity:.85}50%{transform:scale(1.12);opacity:1}}',
    '.gomoku-foot{flex:0 0 auto;text-align:center;font-size:11.5px;color:#5b648f;line-height:1.45;min-height:16px}',
    '.gomoku-over{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.72);backdrop-filter:blur(3px);border-radius:16px;z-index:6}',
    '.gomoku-over.show{display:grid}',
    '.gomoku-over .box{display:flex;flex-direction:column;align-items:center;gap:10px;background:#fff;border-radius:20px;padding:16px 20px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.75)}',
    '.gomoku-over b{font-size:17px;font-weight:800}',
    '.gomoku-over small{font-size:12px;color:#5b648f}',
    '.gomoku-shadow{opacity:.42}'
  ].join('');

  var DIFFS = [
    { name: '简单', depth: 2, noise: 0.40, alt: 6 },
    { name: '普通', depth: 2, noise: 0.12, alt: 3 },
    { name: '困难', depth: 4, noise: 0.00, alt: 1 }
  ];

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function toInt(v) {
    var n = Math.floor(Number(v));
    return (isFinite(n) && n > 0) ? n : 0;
  }

  /* ============================================================
     引擎部分（纯函数，只操作长度为 N*N 的数组；0 空 / 1 黑 / 2 白）
     ============================================================ */
  function idx(x, y) { return y * N + x; }
  function inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  function newBoard() {
    var b = [], i;
    for (i = 0; i < N * N; i++) b.push(0);
    return b;
  }
  function countStones(b) {
    var n = 0, i;
    for (i = 0; i < b.length; i++) if (b[i]) n++;
    return n;
  }
  /* 该点落子后是否连成 5 子（只看经过该点的四条线） */
  function isFive(b, x, y) {
    var p = b[idx(x, y)];
    if (!p) return false;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1], n = 1, k, nx, ny;
      for (k = 1; k < N; k++) {
        nx = x + dx * k; ny = y + dy * k;
        if (!inside(nx, ny) || b[idx(nx, ny)] !== p) break;
        n++;
      }
      for (k = 1; k < N; k++) {
        nx = x - dx * k; ny = y - dy * k;
        if (!inside(nx, ny) || b[idx(nx, ny)] !== p) break;
        n++;
      }
      if (n >= 5) return true;
    }
    return false;
  }
  function checkWin(b) {
    var i, x, y;
    for (i = 0; i < b.length; i++) {
      if (!b[i]) continue;
      x = i % N; y = (i - x) / N;
      if (isFive(b, x, y)) return b[i];
    }
    return 0;
  }

  /* 线型：从经过 (x,y) 的一条线上取一段（半径 4）的字符串，'.' 空 'x' 己方 'o' 对方 */
  function lineStr(b, x, y, dx, dy, me) {
    var s = '', k, nx, ny, v;
    for (k = -4; k <= 4; k++) {
      if (k === 0) { s += 'x'; continue; }
      nx = x + dx * k; ny = y + dy * k;
      if (!inside(nx, ny)) { s += '#'; continue; }
      v = b[idx(nx, ny)];
      s += v === 0 ? '.' : (v === me ? 'x' : 'o');
    }
    return s;
  }
  /* 把「.xxx.」这类的 (连子数, 活/死) 转成分值 */
  function patScore(run, open) {
    run = run > 5 ? 5 : run;
    var row = PAT[run] || PAT[5];
    if (run >= 5) return WIN;
    return open === 2 ? row[0] : (open === 1 ? row[1] : row[2]);
  }
  /* 单点分值：四条线里取最强的两种棋型（避免十字交叉被重复计分） */
  function pointScore(b, x, y, me) {
    var parts = [], d, s, k, run, open, a, bb;
    for (d = 0; d < 4; d++) {
      s = lineStr(b, x, y, DIRS[d][0], DIRS[d][1], me);
      run = 1; open = 0;
      for (k = 3; k >= 0; k--) {
        if (s.charAt(k) === 'x') run++;
        else { if (s.charAt(k) === '.') open++; break; }
      }
      for (k = 5; k <= 8; k++) {
        if (s.charAt(k) === 'x') run++;
        else { if (s.charAt(k) === '.') open++; break; }
      }
      parts.push(patScore(run, open));
    }
    parts.sort(function (p, q) { return q - p; });
    a = parts[0] || 0;
    bb = parts[1] || 0;
    return a + bb * 0.35;
  }
  /* 候选点：任意已有棋子周围 2 格以内的空点 */
  function candidates(b) {
    var out = [], i, x, y, dx, dy, nx, ny;
    for (i = 0; i < b.length; i++) {
      if (!b[i]) continue;
      x = i % N; y = (i - x) / N;
      for (dy = -2; dy <= 2; dy++) {
        for (dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          nx = x + dx; ny = y + dy;
          if (!inside(nx, ny)) continue;
          if (!b[idx(nx, ny)]) out.push(idx(nx, ny));
        }
      }
    }
    /* 去重 */
    var seen = {}, uniq = [];
    for (i = 0; i < out.length; i++) {
      if (seen[out[i]]) continue;
      seen[out[i]] = 1; uniq.push(out[i]);
    }
    return uniq;
  }
  /* 排序候选点：走子顺序 / 顶层决策都用它 */
  function ranked(b, me) {
    var opp = 3 - me;
    var xs = candidates(b), list = [], i, p, x, y, atk, def, mv;
    for (i = 0; i < xs.length; i++) {
      p = xs[i]; x = p % N; y = (p - x) / N;
      atk = pointScore(b, x, y, me);
      def = pointScore(b, x, y, opp);
      mv = atk + 0.9 * def;
      if (atk >= WIN) mv += WIN * 8;          /* 自己立刻成五 */
      else if (def >= WIN) mv += WIN * 7;     /* 必须堵对方的五 */
      else if (def >= 26000) mv += 300000;    /* 堵冲四 */
      list.push({ p: p, x: x, y: y, atk: atk, def: def, score: mv });
    }
    list.sort(function (a, c) { return c.score - a.score || a.p - c.p; });
    return list;
  }
  /* 单层搜索：找己方最佳一手（简单/普通难度与「求助」都用它） */
  function bestMoveSingle(b, me, limit) {
    if (!countStones(b)) return { p: idx(7, 7), win: false };
    var list = ranked(b, me);
    var top = list.slice(0, limit || 12), i, best = null;
    for (i = 0; i < top.length; i++) {
      b[top[i].p] = me;
      var w = isFive(b, top[i].x, top[i].y);
      var v = 2 * top[i].atk + 0.9 * top[i].def;
      b[top[i].p] = 0;
      if (w) return { p: top[i].p, win: true };
      if (!best || v > best.v) best = { p: top[i].p, win: false, v: v };
    }
    return best || { p: list.length ? list[0].p : idx(7, 7), win: false };
  }
  /* 极简 alpha-beta（深度 2/4），用于困难难度 */
  function alphabeta(b, depth, me, alpha, beta) {
    var w = checkWin(b);
    if (w) return w === me ? WIN + depth * 1000 : -(WIN + depth * 1000);
    if (depth <= 0) return 0;
    var list = ranked(b, me).slice(0, 8);
    if (!list.length) return 0;
    var bestVal = -Infinity, i, v;
    for (i = 0; i < list.length; i++) {
      b[list[i].p] = me;
      v = -alphabeta(b, depth - 1, 3 - me, -beta, -alpha);
      b[list[i].p] = 0;
      if (v > bestVal) bestVal = v;
      if (bestVal > alpha) alpha = bestVal;
      if (alpha >= beta) break;
    }
    return bestVal;
  }
  /* 对外统一入口：返回 {p,win,list}（list 已按分数排序，便于按难度加噪声） */
  function findBestMove(b, me, depth, limit) {
    if (!countStones(b)) return { p: idx(7, 7), win: false, list: [] };
    var list = ranked(b, me), i, x, y, v, w, top, out = [];
    top = list.slice(0, Math.min(limit || 8, 8));   /* 顶层最多 8 个候选：够强又能保证手机上够快 */
    if (!top.length) return { p: idx(7, 7), win: false, list: [] };
    for (i = 0; i < top.length; i++) {
      x = top[i].x; y = top[i].y;
      b[top[i].p] = me;
      w = isFive(b, x, y);
      if (w) { b[top[i].p] = 0; return { p: top[i].p, win: true, list: top }; }
      v = depth >= 4
        ? -alphabeta(b, depth - 1, 3 - me, -Infinity, Infinity)
        : (2 * top[i].atk + 0.9 * top[i].def);
      if (!isFinite(v)) v = -WIN * 10;
      b[top[i].p] = 0;
      out.push({ p: top[i].p, x: x, y: y, score: v });
    }
    out.sort(function (a, c) { return c.score - a.score || a.p - c.p; });
    return { p: out[0].p, win: false, list: out };
  }
  /* 按难度（含随机噪声）挑一手 */
  function pickMove(b, me, diff, rnd) {
    var d = DIFFS[diff] || DIFFS[1];
    var r = findBestMove(b, me, d.depth, 8);
    if (r.win || !r.list.length || d.noise <= 0) return r;
    if (rnd() < d.noise) {
      var k = 1 + Math.floor(rnd() * Math.max(1, d.alt - 1));
      var pick = r.list[Math.min(k, r.list.length - 1)];
      return { p: pick.p, win: false, list: r.list };
    }
    return r;
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

      /* ---------- 状态 ---------- */
      var board = newBoard();
      var turn = 1;               /* 1 黑（玩家） / 2 白（电脑） */
      var over = false, resultText = '';
      var stones = 0;
      var wins = toInt(store.get('wins', 0)), loses = toInt(store.get('loses', 0));
      var difficulty = toInt(store.get('difficulty', 1));
      if (difficulty > 2) difficulty = 0;
      var aiThinking = false, hintPos = -1;
      var history = [];           /* 落子顺序，供悔棋 */
      var metric = { x: 0, y: 0, size: 0, gap: 0 };
      var timers = [], rafId = 0, disposed = false;

      /* ---------- 定时器统一管理（退出时全部清掉，避免回调打到已销毁的界面） ---------- */
      function later(fn, ms) {
        var t = setTimeout(function () {
          var i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
          if (!disposed) fn();
        }, ms);
        timers.push(t);
        return t;
      }
      function clearTimers() {
        for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
        timers = [];
      }

      /* ---------- 界面 ---------- */
      var wrap = U.el('div', 'gomoku-wrap');
      var hud = U.el('div', 'gomoku-hud');
      function infoCard(label, val) {
        var c = U.el('div', 'gomoku-card');
        c.appendChild(U.el('span', null, label));
        var b = U.el('b', null, val);
        c.appendChild(b);
        return { box: c, val: b };
      }
      var cTurn = infoCard('当前回合', '你（黑）');
      var cDiff = infoCard('难度', DIFFS[difficulty].name);
      var cScore = infoCard('战绩', wins + ' 胜 ' + loses + ' 负');
      hud.appendChild(cTurn.box);
      hud.appendChild(cDiff.box);
      hud.appendChild(cScore.box);

      var arena = U.el('div', 'gomoku-arena');
      var canvas = U.el('canvas', 'gomoku-canvas');
      canvas.width = 300; canvas.height = 300;
      var hintLayer = U.el('div', 'gomoku-hintLayer');
      var hintDot = U.el('div', 'gomoku-hintDot');
      hintDot.style.display = 'none';
      hintLayer.appendChild(hintDot);

      var overEl = U.el('div', 'gomoku-over');
      var obox = U.el('div', 'box');
      var otitle = U.el('b', null, '本局结束');
      var osub = U.el('small', null, '');
      var obtn = U.el('button', 'ui-btn', '再来一局');
      obtn.type = 'button';
      obtn.addEventListener('click', function () { restart(); });
      obox.appendChild(otitle);
      obox.appendChild(osub);
      obox.appendChild(obtn);
      overEl.appendChild(obox);

      arena.appendChild(canvas);
      arena.appendChild(hintLayer);
      arena.appendChild(overEl);

      var foot = U.el('div', 'gomoku-foot', '点棋盘落子 · 先连成 5 子者胜 · 求助可推荐下一步');
      wrap.appendChild(hud);
      wrap.appendChild(arena);
      wrap.appendChild(foot);
      root.appendChild(wrap);

      var g2d = canvas.getContext('2d');

      /* ---------- 标题栏按钮 ---------- */
      var hintBtn = ctx.addAction('💡 求助', function () { doHint(); });
      if (hintBtn) hintBtn.title = '推荐你（黑棋）的下一步';
      ctx.addAction('重开', function () { restart(); });

      /* ---------- 存档 ---------- */
      function save() {
        store.set('board', board.slice());
        store.set('turn', turn);
        store.set('over', over);
        store.set('wins', wins);
        store.set('loses', loses);
        store.set('difficulty', difficulty);
        store.set('history', history.slice());
      }
      function load() {
        var b = store.get('board', null);
        if (!b || b.length !== N * N) return false;
        var out = [], i, v;
        for (i = 0; i < N * N; i++) {
          v = toInt(b[i]);
          out.push(v === 1 || v === 2 ? v : 0);
        }
        if (!countStones(out)) return false;
        board = out;
        stones = countStones(out);
        turn = toInt(store.get('turn', 1)) === 2 ? 2 : 1;
        over = !!store.get('over', false);
        if (over) {
          var w = checkWin(board);
          resultText = w === 1 ? '你赢了' : (w === 2 ? '电脑赢了' : '本局结束');
          /* 存档里 over 但没有胜者：当作未结束，避免卡死 */
          if (!w) over = false;
        }
        var hs = store.get('history', null);
        if (hs && hs.length) history = hs.slice();
        return true;
      }

      /* ---------- 坐标换算 ---------- */
      function layout() {
        var aw = arena.clientWidth || 0;
        var ah = arena.clientHeight || 0;
        if (!aw || !ah) { aw = 300; ah = 300; }
        var size = Math.max(180, Math.floor(Math.min(aw, ah)));
        var gap = Math.round(size / (N + 0.6));
        var cell = gap;
        var origin = (size - cell * (N - 1)) / 2;
        metric.size = size; metric.gap = gap; metric.x = origin; metric.y = origin;
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        hintLayer.style.width = size + 'px';
        hintLayer.style.height = size + 'px';
        draw();
        placeHintDot();
      }
      function onResize() {
        if (rafId) return;
        rafId = requestAnimationFrame(function () { rafId = 0; layout(); });
      }
      window.addEventListener('resize', onResize);

      function posOf(x, y) {
        return { cx: metric.x + x * metric.gap, cy: metric.y + y * metric.gap };
      }
      function cellFromPoint(px, py) {
        var gx = Math.round((px - metric.x) / metric.gap);
        var gy = Math.round((py - metric.y) / metric.gap);
        if (!inside(gx, gy)) return -1;
        var c = posOf(gx, gy);
        var d = Math.sqrt((c.cx - px) * (c.cx - px) + (c.cy - py) * (c.cy - py));
        if (d > metric.gap * 0.62) return -1;
        return idx(gx, gy);
      }
      function localPoint(e) {
        var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        var left = r && r.left ? r.left : 0, top = r && r.top ? r.top : 0;
        return { x: e.clientX - left, y: e.clientY - top };
      }

      /* ---------- 绘制 ---------- */
      function drawBoard() {
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        var s = metric.size, g = metric.gap, o = metric.x, i, j, p;
        /* 木色底 + 高光 */
        var grd = g2d.createLinearGradient(0, 0, s, s);
        grd.addColorStop(0, '#f7e3c2');
        grd.addColorStop(0.5, '#f0d5ab');
        grd.addColorStop(1, '#e8c795');
        g2d.fillStyle = grd;
        g2d.fillRect(0, 0, s, s);
        g2d.strokeStyle = 'rgba(120,80,40,.10)';
        g2d.lineWidth = 1;
        g2d.strokeRect(0.5, 0.5, s - 1, s - 1);
        /* 网格线 */
        g2d.strokeStyle = 'rgba(96,62,26,.62)';
        g2d.lineWidth = 1;
        for (i = 0; i < N; i++) {
          g2d.beginPath();
          g2d.moveTo(o, o + i * g); g2d.lineTo(o + (N - 1) * g, o + i * g);
          g2d.stroke();
          g2d.beginPath();
          g2d.moveTo(o + i * g, o); g2d.lineTo(o + i * g, o + (N - 1) * g);
          g2d.stroke();
        }
        /* 星位 */
        var stars = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
        g2d.fillStyle = 'rgba(96,62,26,.75)';
        for (i = 0; i < stars.length; i++) {
          p = posOf(stars[i][0], stars[i][1]);
          g2d.beginPath();
          g2d.arc(p.cx, p.cy, Math.max(1.6, g * 0.10), 0, Math.PI * 2);
          g2d.fill();
        }
        /* 已有棋子 */
        for (i = 0; i < board.length; i++) {
          if (!board[i]) continue;
          j = i % N;
          drawStone(j, (i - j) / N, board[i], false);
        }
        /* 最后一手标记 */
        if (history.length && !over) {
          var last = history[history.length - 1];
          if (last && last >= 0 && board[last]) {
            var lx = last % N, ly = (last - lx) / N;
            var lp = posOf(lx, ly);
            g2d.strokeStyle = 'rgba(224,59,99,.9)';
            g2d.lineWidth = 2;
            g2d.beginPath();
            g2d.arc(lp.cx, lp.cy, g * 0.42, 0, Math.PI * 2);
            g2d.stroke();
          }
        }
      }
      function drawStone(x, y, who, shadow) {
        var p = posOf(x, y), r = metric.gap * 0.42;
        g2d.save();
        if (shadow) g2d.globalAlpha = 0.45;
        var grd = g2d.createRadialGradient(p.cx - r * 0.35, p.cy - r * 0.4, r * 0.15, p.cx, p.cy, r * 1.1);
        if (who === 1) {
          grd.addColorStop(0, '#6a7690');
          grd.addColorStop(0.45, '#2b3550');
          grd.addColorStop(1, '#0a0f1e');
        } else {
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.6, '#f2f5fb');
          grd.addColorStop(1, '#c8d0e0');
        }
        g2d.fillStyle = grd;
        g2d.beginPath();
        g2d.arc(p.cx, p.cy, r, 0, Math.PI * 2);
        g2d.fill();
        g2d.strokeStyle = who === 1 ? 'rgba(0,0,0,.35)' : 'rgba(120,130,160,.45)';
        g2d.lineWidth = 1;
        g2d.stroke();
        g2d.restore();
      }
      function draw() {
        if (disposed) return;
        drawBoard();
        if (aiThinking) {
          /* 电脑思考中的幽灵子：轻描淡写地提示一下它会落在这里 */
          var p = posOf(7, 7);
          g2d.save();
          g2d.globalAlpha = 0.18;
          g2d.fillStyle = '#5b648f';
          g2d.beginPath();
          g2d.arc(p.cx, p.cy, metric.gap * 0.18, 0, Math.PI * 2);
          g2d.fill();
          g2d.restore();
        }
      }
      function placeHintDot() {
        if (hintPos < 0) { hintDot.style.display = 'none'; return; }
        var x = hintPos % N, y = (hintPos - x) / N;
        var p = posOf(x, y), d = metric.gap * 0.92;
        hintDot.style.display = 'block';
        hintDot.style.left = (p.cx - d / 2) + 'px';
        hintDot.style.top = (p.cy - d / 2) + 'px';
        hintDot.style.width = d + 'px';
        hintDot.style.height = d + 'px';
      }

      /* ---------- 渲染文字信息 ---------- */
      function refreshHud() {
        cTurn.val.textContent = over ? resultText : (turn === 1 ? '你（黑）' : '电脑（白）');
        cDiff.val.textContent = DIFFS[difficulty].name;
        cScore.val.textContent = wins + ' 胜 ' + loses + ' 负';
        if (over) {
          otitle.textContent = resultText;
          osub.textContent = '共 ' + stones + ' 手 · 战绩 ' + wins + ' 胜 ' + loses + ' 负';
          overEl.classList.add('show');
        } else {
          overEl.classList.remove('show');
        }
      }

      /* ---------- 落子 ---------- */
      function place(p, who) {
        var x = p % N, y = (p - x) / N;
        if (board[p]) return false;
        board[p] = who;
        stones++;
        history.push(p);
        return true;
      }
      function humanTurn() {
        return !over && turn === 1 && !aiThinking;
      }
      function tryHumanMove(p) {
        if (!humanTurn()) return;
        if (p < 0 || board[p]) return;
        place(p, 1);
        hintPos = -1;
        placeHintDot();
        save();
        var w = checkWin(board);
        if (w === 1) { finish('你赢了'); return; }
        if (stones >= N * N) { finish('平局'); return; }
        turn = 2;
        refreshHud();
        draw();
        save();
        scheduleAi();
      }
      function scheduleAi() {
        if (over || turn !== 2) return;
        aiThinking = true;
        refreshHud();
        draw();
        later(function () {
          aiThinking = false;
          if (over || turn !== 2) return;
          var mv = pickMove(board.slice(), 2, difficulty, Math.random);
          var p = mv.p;
          if (board[p]) {
            /* 兜底：随机挑一个空点 */
            var free = [];
            for (var i = 0; i < board.length; i++) if (!board[i]) free.push(i);
            if (!free.length) { finish('平局'); return; }
            p = free[Math.floor(Math.random() * free.length)];
          }
          place(p, 2);
          var x = p % N, y = (p - x) / N;
          hintPos = -1;
          placeHintDot();
          var w = checkWin(board);
          if (w === 2) { finish('电脑赢了'); return; }
          if (stones >= N * N) { finish('平局'); return; }
          turn = 1;
          refreshHud();
          draw();
          save();
          phone.toast('电脑落子：' + coordName(x, y), 'info');
        }, 260 + Math.floor(Math.random() * 320));
      }
      function coordName(x, y) {
        return String.fromCharCode(65 + x) + (N - y);
      }
      function finish(text) {
        over = true;
        resultText = text;
        if (text === '你赢了') wins++;
        else if (text === '电脑赢了') loses++;
        aiThinking = false;
        hintPos = -1;
        placeHintDot();
        refreshHud();
        draw();
        save();
        phone.toast(text === '平局' ? '平局，棋盘满了' : text, text === '你赢了' ? 'ok' : (text === '电脑赢了' ? 'bad' : 'info'));
      }
      function restart() {
        clearTimers();
        board = newBoard();
        history = [];
        stones = 0;
        turn = 1;
        over = false;
        resultText = '';
        aiThinking = false;
        hintPos = -1;
        placeHintDot();
        refreshHud();
        draw();
        save();
      }

      /* ---------- 求助 ---------- */
      function doHint() {
        if (over) { phone.toast('本局已经结束了，重开一局再求助吧', 'info'); return; }
        if (turn !== 1 || aiThinking) { phone.toast('现在是电脑的回合，等它下完再求助', 'info'); return; }
        if (stones === 0) {
          hintPos = idx(7, 7);
          placeHintDot();
          phone.toast('开局推荐下天元（H8）', 'ok');
          return;
        }
        var r = findBestMove(board.slice(), 1, 4, 8);
        if (r.p == null) { phone.toast('暂时没有可推荐的点', 'info'); return; }
        hintPos = r.p;
        placeHintDot();
        var hx = r.p % N, hy = (r.p - hx) / N;
        phone.toast(r.win ? ('推荐：' + coordName(hx, hy) + ' —— 直接连成五子！') : ('推荐下一步：' + coordName(hx, hy)), 'ok');
      }

      /* ---------- 交互 ---------- */
      function onPointer(e) {
        if (!humanTurn()) return;
        if (e.button != null && e.button !== 0 && e.pointerType !== 'touch') return;
        var pt = localPoint(e);
        var p = cellFromPoint(pt.x, pt.y);
        if (p < 0) return;
        if (e.cancelable) e.preventDefault();
        tryHumanMove(p);
      }
      function onTouch(e) {
        if (!humanTurn()) return;
        var t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : (e.touches && e.touches[0]);
        if (!t) return;
        if (e.cancelable) e.preventDefault();
        var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        var left = r && r.left ? r.left : 0, top = r && r.top ? r.top : 0;
        var p = cellFromPoint(t.clientX - left, t.clientY - top);
        if (p >= 0) tryHumanMove(p);
      }
      canvas.addEventListener('pointerdown', onPointer);
      canvas.addEventListener('touchstart', onTouch, { passive: false });

      /* ---------- 悔棋：把自己的最后一手与电脑的应手一起撤掉 ---------- */
      function popStone() {
        var p = history.pop();
        board[p] = 0;
        stones--;
        return p;
      }
      function undo() {
        if (over) { phone.toast('本局已经结束了，重开一局吧', 'info'); return; }
        if (aiThinking) { phone.toast('电脑正在思考，稍等一下', 'info'); return; }
        if (!history.length) { phone.toast('还没有落子', 'info'); return; }
        var n = 0;
        while (history.length && n < 2) {
          var top = history[history.length - 1];
          if (n === 0 && board[top] === 2) { popStone(); n++; continue; }
          if (board[top] === 1) { popStone(); n++; break; }
          break;
        }
        turn = 1;
        hintPos = -1;
        placeHintDot();
        refreshHud();
        draw();
        save();
        phone.toast('已悔棋，轮到你了', 'info');
      }

      /* ---------- 键盘：U 悔棋 / H 求助 / R 重开 ---------- */
      ctx.onKey(function (e) {
        var k = String(e.key || '').toLowerCase();
        if (k === 'h') { e.preventDefault(); doHint(); }
        else if (k === 'r') { e.preventDefault(); restart(); }
        else if (k === 'u') {
          e.preventDefault();
          undo();
        }
      });

      ctx.onCleanup(function () {
        disposed = true;
        clearTimers();
        window.removeEventListener('resize', onResize);
        canvas.removeEventListener('pointerdown', onPointer);
        canvas.removeEventListener('touchstart', onTouch);
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      });

      /* ---------- 启动 ---------- */
      if (!load()) {
        board = newBoard();
        history = [];
        stones = 0;
        turn = 1;
        over = false;
        resultText = '';
      }
      layout();
      refreshHud();
      draw();
      placeHintDot();
      save();
      if (turn === 2 && !over) scheduleAi();

      /* 测试把手：内核注册时会浅拷贝定义（只保留标准字段），所以挂在 mount 函数上，
         放在 mount 内部才能读到局内状态 */
      mount.__test = {
        engine: function () {
          return {
            N: N, WIN: WIN, idx: idx, newBoard: newBoard, countStones: countStones,
            isFive: isFive, checkWin: checkWin, pointScore: pointScore,
            candidates: candidates, ranked: ranked, findBestMove: findBestMove, pickMove: pickMove
          };
        },
        state: function () {
          return {
            board: board.slice(), turn: turn, over: over, stones: stones,
            hintPos: hintPos, history: history.slice(),
            metric: { x: metric.x, y: metric.y, gap: metric.gap, size: metric.size }
          };
        }
      };
    }

    return {
      id: 'gomoku',
      name: '五子棋',
      icon: 'svg:target',
      desc: '与电脑对弈五子棋 · 可向 AI 求助下一步',
      order: 12,
      color: 'espresso',
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'gomoku', createApp: createApp, code: '' });
})();
