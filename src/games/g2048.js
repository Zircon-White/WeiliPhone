/* ============================================================
   内置应用 · 2048（纯代码绘制，无外部资源）
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var SIZE = 4;
  var CELLS = SIZE * SIZE;
  var CSS_ID = 'g2048-style';
  var CSS = [
    '.g2048-wrap{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:10px 12px;box-sizing:border-box;font-family:inherit;color:#0d1330}',
    '.g2048-hud{display:flex;gap:8px;flex:0 0 auto}',
    '.g2048-score{flex:1;background:#fff;border-radius:14px;padding:6px 10px 7px;text-align:center;border:1px solid rgba(255,255,255,.85);box-shadow:0 10px 20px -18px rgba(13,19,48,.75)}',
    '.g2048-score span{display:block;font-size:10.5px;font-weight:700;color:#5b648f;letter-spacing:.6px}',
    '.g2048-score b{font-size:18px;font-weight:800;line-height:1.15}',
    '.g2048-boardWrap{position:relative;flex:1;min-height:0;display:grid;place-items:center}',
    '.g2048-board{position:relative;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);gap:var(--gp,8px);padding:var(--gp,8px);background:rgba(13,19,48,.10);border-radius:20px;box-shadow:inset 0 2px 6px rgba(13,19,48,.10);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}',
    '.g2048-cell{background:rgba(255,255,255,.55);border-radius:calc(var(--gp,8px) * 1.8);display:grid;place-items:center;overflow:hidden}',
    '.g2048-tile{width:100%;height:100%;border-radius:calc(var(--gp,8px) * 1.8);display:grid;place-items:center;font-weight:800;line-height:1;box-shadow:inset 0 -3px 0 rgba(0,0,0,.10),0 2px 5px -2px rgba(13,19,48,.35)}',
    '@keyframes g2048Appear{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes g2048Merge{0%{transform:scale(1)}45%{transform:scale(1.2)}100%{transform:scale(1)}}',
    '.g2048-tile.appear{animation:g2048Appear .14s ease-out both}',
    '.g2048-tile.merge{animation:g2048Merge .17s cubic-bezier(.3,1.5,.5,1) both}',
    '.g2048-foot{flex:0 0 auto;text-align:center;font-size:11.5px;color:#5b648f;line-height:1.45;min-height:16px}',
    '.g2048-over{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.70);backdrop-filter:blur(3px);border-radius:20px;z-index:4}',
    '.g2048-over.show{display:grid}',
    '.g2048-over .box{display:flex;flex-direction:column;align-items:center;gap:10px;background:#fff;border-radius:20px;padding:16px 20px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.75)}',
    '.g2048-over b{font-size:17px;font-weight:800}',
    '.g2048-over small{font-size:12px;color:#5b648f}'
  ].join('');

  /* 每种数值一套配色：[底色, 字色] */
  var TILE_COLORS = {
    2: ['#ffe9c7', '#8a5a10'],
    4: ['#ffd79a', '#7a4a08'],
    8: ['#ffb457', '#5a2f00'],
    16: ['#ff9a5c', '#ffffff'],
    32: ['#ff7a8a', '#ffffff'],
    64: ['#e03b63', '#ffffff'],
    128: ['#a98bff', '#ffffff'],
    256: ['#6c4bd8', '#ffffff'],
    512: ['#5cc8ff', '#0b3a63'],
    1024: ['#2b6de0', '#ffffff'],
    2048: ['#3ddc97', '#04321f'],
    4096: ['#12a86f', '#ffffff'],
    8192: ['#0d1330', '#ffd79a']
  };
  var BIG_COLOR = ['#0d1330', '#ffd79a'];

  var KEY_DIR = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    h: 'left', l: 'right', k: 'up', j: 'down'
  };

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function colorOf(v) { return TILE_COLORS[v] || BIG_COLOR; }
  function fontRatio(v) {
    var len = String(v).length;
    if (len <= 2) return 0.44;
    if (len === 3) return 0.34;
    if (len === 4) return 0.27;
    if (len === 5) return 0.22;
    return 0.18;
  }
  function newGrid() {
    var a = [], i;
    for (i = 0; i < CELLS; i++) a.push(0);
    return a;
  }
  function toInt(v) {
    var n = Math.floor(Number(v));
    return (isFinite(n) && n > 0) ? n : 0;
  }
  function hasTile(g) {
    for (var i = 0; i < g.length; i++) if (g[i]) return true;
    return false;
  }
  function maxOf(g) {
    var m = 0;
    for (var i = 0; i < g.length; i++) if (g[i] > m) m = g[i];
    return m;
  }
  /* 还能不能走：有空位，或有相邻同值 */
  function canMove(g) {
    var r, c, i, v;
    for (i = 0; i < g.length; i++) if (!g[i]) return true;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        v = g[r * SIZE + c];
        if (c + 1 < SIZE && g[r * SIZE + c + 1] === v) return true;
        if (r + 1 < SIZE && g[(r + 1) * SIZE + c] === v) return true;
      }
    }
    return false;
  }
  /* 把一条线往「前」压缩合并；merged 记录结果线里被合并出来的下标 */
  function slide(vals) {
    var packed = [], line = [], merged = [], gained = 0, i;
    for (i = 0; i < vals.length; i++) if (vals[i]) packed.push(vals[i]);
    for (i = 0; i < packed.length; i++) {
      if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
        var nv = packed[i] * 2;
        line.push(nv);
        merged.push(line.length - 1);
        gained += nv;
        i++;
      } else {
        line.push(packed[i]);
      }
    }
    while (line.length < vals.length) line.push(0);
    return { line: line, merged: merged, gained: gained };
  }
  /* 第 line 条线（从移动方向的一端算起）的 4 个格子下标 */
  function lineIdx(dir, line) {
    var out = [], k;
    for (k = 0; k < SIZE; k++) {
      if (dir === 'left') out.push(line * SIZE + k);
      else if (dir === 'right') out.push(line * SIZE + (SIZE - 1 - k));
      else if (dir === 'up') out.push(k * SIZE + line);
      else out.push((SIZE - 1 - k) * SIZE + line);
    }
    return out;
  }

  function createApp(phone) {
    var U = phone.utils;

    function scoreBox(label) {
      var box = U.el('div', 'g2048-score');
      box.appendChild(U.el('span', null, label));
      var val = U.el('b', null, '0');
      box.appendChild(val);
      return { box: box, val: val };
    }

    function mount(phoneApi, root, ctx) {
      injectCss();
      ctx.useFullBody();
      var store = ctx.store;

      /* ---------- 游戏状态（存档在 ctx.store） ---------- */
      var grid = newGrid();
      var score = 0, best = 0, won = false, over = false;
      var newIdx = [], mergeIdx = [];
      var metric = { cell: 60, gap: 8 };
      var layoutRaf = 0;

      /* ---------- 界面 ---------- */
      var wrap = U.el('div', 'g2048-wrap');
      var hud = U.el('div', 'g2048-hud');
      var sScore = scoreBox('得分');
      var sBest = scoreBox('最高分');
      hud.appendChild(sScore.box);
      hud.appendChild(sBest.box);

      var boardWrap = U.el('div', 'g2048-boardWrap');
      var board = U.el('div', 'g2048-board');
      var cells = [], i, cell;
      for (i = 0; i < CELLS; i++) {
        cell = U.el('div', 'g2048-cell');
        cells.push(cell);
        board.appendChild(cell);
      }
      var overEl = U.el('div', 'g2048-over');
      var obox = U.el('div', 'box');
      var otitle = U.el('b', null, '无法移动了');
      var osub = U.el('small');
      var obtn = U.el('button', 'ui-btn', '重开');
      obtn.type = 'button';
      obtn.addEventListener('click', function () { newGame(); });
      obox.appendChild(otitle);
      obox.appendChild(osub);
      obox.appendChild(obtn);
      overEl.appendChild(obox);
      boardWrap.appendChild(board);
      boardWrap.appendChild(overEl);

      var foot = U.el('div', 'g2048-foot', '方向键 / WASD 移动 · 触摸滑动、鼠标拖拽也能玩');
      wrap.appendChild(hud);
      wrap.appendChild(boardWrap);
      wrap.appendChild(foot);
      root.appendChild(wrap);

      ctx.addAction('新游戏', function () { newGame(); });

      /* ---------- 存档读取 ---------- */
      function save() {
        store.set('state', { grid: grid.slice(), won: won, over: over });
        store.set('score', score);
        store.set('best', best);
      }
      function load() {
        best = toInt(store.get('best', 0));
        var sc = toInt(store.get('score', 0));
        var st = store.get('state', null);
        var g = st && st.grid && st.grid.length === CELLS ? st.grid : null;
        if (!g) return false;
        var out = [], i2, v;
        for (i2 = 0; i2 < CELLS; i2++) {
          v = toInt(g[i2]);
          out.push((v > 0 && (v & (v - 1)) === 0) ? v : 0);
        }
        if (!hasTile(out)) return false;
        grid = out;
        score = sc;
        won = !!st.won;
        over = !!st.over;
        return true;
      }

      /* ---------- 渲染 ---------- */
      function render() {
        for (var k = 0; k < CELLS; k++) {
          var c = cells[k];
          c.innerHTML = '';
          var v = grid[k];
          if (!v) continue;
          var t = U.el('div', 'g2048-tile', String(v));
          var col = colorOf(v);
          t.style.background = col[0];
          t.style.color = col[1];
          t.style.fontSize = Math.max(11, Math.round(metric.cell * fontRatio(v))) + 'px';
          if (newIdx.indexOf(k) >= 0) t.classList.add('appear');
          if (mergeIdx.indexOf(k) >= 0) t.classList.add('merge');
          c.appendChild(t);
        }
        updateHud();
        renderOver();
      }
      function updateHud() {
        sScore.val.textContent = String(score);
        sBest.val.textContent = String(best);
      }
      function renderOver() {
        if (over) {
          otitle.textContent = maxOf(grid) >= 2048 ? '这局很精彩！' : '无法移动了';
          osub.textContent = '本局得分 ' + score + ' · 最高分 ' + best;
          overEl.classList.add('show');
        } else {
          overEl.classList.remove('show');
        }
        foot.textContent = won
          ? '已达成 2048！可以继续挑战更高分 🎉'
          : '方向键 / WASD 移动 · 触摸滑动、鼠标拖拽也能玩';
      }

      /* ---------- 自适应尺寸 ---------- */
      function layout() {
        var w = root.clientWidth || 0;
        var h = root.clientHeight || 0;
        if (!w || !h) return;
        var hudH = hud.offsetHeight || 44;
        var footH = foot.offsetHeight || 16;
        var availH = h - hudH - footH - 44;
        var availW = w - 24;
        var size = Math.floor(Math.min(availW, availH));
        size = Math.max(120, size);
        var gap = Math.max(5, Math.round(size * 0.032));
        metric.gap = gap;
        metric.cell = (size - gap * (SIZE + 1)) / SIZE;
        board.style.width = size + 'px';
        board.style.height = size + 'px';
        board.style.setProperty('--gp', gap + 'px');
        render();
      }
      function onResize() {
        if (layoutRaf) return;
        layoutRaf = requestAnimationFrame(function () { layoutRaf = 0; layout(); });
      }
      window.addEventListener('resize', onResize);

      /* ---------- 规则 ---------- */
      function spawn() {
        var empty = [], k;
        for (k = 0; k < CELLS; k++) if (!grid[k]) empty.push(k);
        if (!empty.length) return -1;
        var p = empty[Math.floor(Math.random() * empty.length)];
        grid[p] = Math.random() < 0.9 ? 2 : 4;
        return p;
      }
      function seed() {
        newIdx = [];
        mergeIdx = [];
        var a = spawn();
        var b = spawn();
        if (a >= 0) newIdx.push(a);
        if (b >= 0) newIdx.push(b);
      }
      function startNew() {
        grid = newGrid();
        score = 0;
        won = false;
        over = false;
        seed();
        render();
        save();
      }
      function newGame() {
        startNew();
        phone.toast('已开新局，加油！', 'ok');
      }
      function checkEnd() {
        if (!won && maxOf(grid) >= 2048) {
          won = true;
          phone.toast('🎉 达成 2048！可以继续挑战', 'ok');
        }
        if (!over && !canMove(grid)) {
          over = true;
          phone.toast('无法移动了，本局结束', 'bad');
        }
      }
      function move(dir) {
        if (over) return;
        var gained = 0, merges = [], changed = false, line, k, m;
        for (line = 0; line < SIZE; line++) {
          var idx = lineIdx(dir, line);
          var vals = [grid[idx[0]], grid[idx[1]], grid[idx[2]], grid[idx[3]]];
          var res = slide(vals);
          for (k = 0; k < SIZE; k++) {
            if (grid[idx[k]] !== res.line[k]) changed = true;
            grid[idx[k]] = res.line[k];
          }
          gained += res.gained;
          for (m = 0; m < res.merged.length; m++) merges.push(idx[res.merged[m]]);
        }
        if (!changed) return;
        score += gained;
        if (score > best) best = score;
        mergeIdx = merges;
        var sp = spawn();
        newIdx = sp >= 0 ? [sp] : [];
        checkEnd();
        render();
        save();
      }

      /* ---------- 键盘 ---------- */
      ctx.onKey(function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = String(e.key || '');
        var low = k.toLowerCase();
        if (low === 'r') {
          e.preventDefault();
          newGame();
          return;
        }
        var dir = KEY_DIR[k] || KEY_DIR[low];
        if (!dir) return;
        e.preventDefault();
        move(dir);
      });

      /* ---------- 触摸 / 鼠标滑动 ---------- */
      var THRESH = 24;
      var sx = 0, sy = 0, tracking = false, dragging = false;
      function begin(x, y) { sx = x; sy = y; tracking = true; }
      function stepAt(x, y) {
        if (!tracking) return;
        var dx = x - sx, dy = y - sy;
        if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
        else move(dy > 0 ? 'down' : 'up');
        sx = x;
        sy = y;
      }
      function stopTrack() { tracking = false; dragging = false; }
      function onTouchStart(e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        begin(e.touches[0].clientX, e.touches[0].clientY);
      }
      function onTouchMove(e) {
        if (!tracking) return;
        if (e.cancelable) e.preventDefault();
        var t = e.touches[0];
        if (t) stepAt(t.clientX, t.clientY);
      }
      function onTouchEnd(e) {
        var t = e.changedTouches && e.changedTouches[0];
        if (t && tracking) stepAt(t.clientX, t.clientY);
        tracking = false;
      }
      function onMouseDown(e) {
        dragging = true;
        begin(e.clientX, e.clientY);
        e.preventDefault();
      }
      function onMouseMove(e) { if (dragging) stepAt(e.clientX, e.clientY); }
      function onMouseUp() { stopTrack(); }

      board.addEventListener('touchstart', onTouchStart, { passive: true });
      board.addEventListener('touchmove', onTouchMove, { passive: false });
      board.addEventListener('touchend', onTouchEnd, { passive: true });
      board.addEventListener('touchcancel', stopTrack, { passive: true });
      board.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      ctx.onCleanup(function () {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        board.removeEventListener('touchstart', onTouchStart);
        board.removeEventListener('touchmove', onTouchMove);
        board.removeEventListener('touchend', onTouchEnd);
        board.removeEventListener('touchcancel', stopTrack);
        board.removeEventListener('mousedown', onMouseDown);
        if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      });

      /* ---------- 启动 ---------- */
      if (!load()) {
        grid = newGrid();
        score = 0;
        won = false;
        over = false;
        seed();
      }
      layout();
      save();
    }

    return {
      id: 'g2048',
      name: '2048',
      icon: 'emoji:🔢',
      desc: '合并数字方块，冲 2048',
      order: 10,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'g2048', createApp: createApp, code: '' });
})();
