/* ============================================================
   内置应用 · 贪吃蛇（Canvas 手绘卡通，无外部资源）
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var CSS_ID = 'snake-style';
  var CSS = [
    '.snake-wrap{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:10px 12px;box-sizing:border-box;font-family:inherit;color:#0d1330}',
    '.snake-hud{display:flex;gap:8px;flex:0 0 auto}',
    '.snake-score{flex:1;background:#fff;border-radius:14px;padding:6px 10px 7px;text-align:center;border:1px solid rgba(255,255,255,.85);box-shadow:0 10px 20px -18px rgba(13,19,48,.75)}',
    '.snake-score span{display:block;font-size:10.5px;font-weight:700;color:#5b648f;letter-spacing:.6px}',
    '.snake-score b{font-size:18px;font-weight:800;line-height:1.15}',
    '.snake-arena{position:relative;flex:1;min-height:0;display:grid;place-items:center}',
    '.snake-canvas{display:block;border-radius:18px;box-shadow:0 16px 30px -22px rgba(13,19,48,.85);touch-action:none}',
    '.snake-over{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.70);backdrop-filter:blur(3px);border-radius:18px;z-index:4}',
    '.snake-over.show{display:grid}',
    '.snake-over .box{display:flex;flex-direction:column;align-items:center;gap:10px;background:#fff;border-radius:20px;padding:16px 20px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.75)}',
    '.snake-over b{font-size:17px;font-weight:800}',
    '.snake-over small{font-size:12px;color:#5b648f}',
    '.snake-pad{flex:0 0 auto;display:none;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:8px;height:150px}',
    '.snake-pad.show{display:grid}',
    '.snake-pad button{border:0;font:inherit;font-size:20px;font-weight:800;color:#0d1330;background:rgba(255,255,255,.88);border-radius:16px;box-shadow:0 10px 18px -14px rgba(13,19,48,.8);cursor:pointer;display:grid;place-items:center;padding:0}',
    '.snake-pad button:active{background:#3ddc97;transform:translateY(1px)}',
    '.snake-pad .pk-up{grid-area:1/2/2/3}',
    '.snake-pad .pk-left{grid-area:2/1/3/2}',
    '.snake-pad .pk-mid{grid-area:2/2/3/3;font-size:12px;font-weight:700;color:#5b648f;background:transparent;box-shadow:none}',
    '.snake-pad .pk-right{grid-area:2/3/3/4}',
    '.snake-pad .pk-down{grid-area:3/2/4/3}',
    '.snake-foot{flex:0 0 auto;text-align:center;font-size:11.5px;color:#5b648f;line-height:1.45}'
  ].join('');

  var KEY_DIR = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    a: { x: -1, y: 0 }, d: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
    h: { x: -1, y: 0 }, l: { x: 1, y: 0 }, k: { x: 0, y: -1 }, j: { x: 0, y: 1 }
  };

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
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixColor(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b), out = '#', i, v;
    for (i = 0; i < 3; i++) {
      v = Math.round(A[i] + (B[i] - A[i]) * t);
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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

  function createApp(phone) {
    var U = phone.utils;

    function scoreBox(label) {
      var box = U.el('div', 'snake-score');
      box.appendChild(U.el('span', null, label));
      var val = U.el('b', null, '0');
      box.appendChild(val);
      return { box: box, val: val };
    }

    function mount(phoneApi, root, ctx) {
      injectCss();
      ctx.useFullBody();
      var store = ctx.store;

      /* ---------- 游戏状态 ---------- */
      var gridW = 16, gridH = 18, cellSize = 20;
      var snake = [], food = null;
      var dir = { x: 1, y: 0 }, queued = { x: 1, y: 0 };
      var score = 0, best = 0;
      var phase = 'play';            /* play | pause | over */
      var rafId = 0, lastTs = 0, acc = 0, layoutRaf = 0;

      /* ---------- 界面 ---------- */
      var wrap = U.el('div', 'snake-wrap');
      var hud = U.el('div', 'snake-hud');
      var sScore = scoreBox('得分');
      var sBest = scoreBox('最高分');
      hud.appendChild(sScore.box);
      hud.appendChild(sBest.box);

      var arena = U.el('div', 'snake-arena');
      var canvas = U.el('canvas', 'snake-canvas');
      var overEl = U.el('div', 'snake-over');
      var obox = U.el('div', 'box');
      var otitle = U.el('b', null, '游戏结束');
      var osub = U.el('small');
      var obtn = U.el('button', 'ui-btn', '再来一局');
      obtn.type = 'button';
      obox.appendChild(otitle);
      obox.appendChild(osub);
      obox.appendChild(obtn);
      overEl.appendChild(obox);
      arena.appendChild(canvas);
      arena.appendChild(overEl);

      var pad = U.el('div', 'snake-pad');
      function padBtn(cls, label, fn) {
        var b = U.el('button', cls, label);
        b.type = 'button';
        b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
        b.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
        pad.appendChild(b);
        return b;
      }
      padBtn('pk-up', '▲', function () { turn(0, -1); });
      padBtn('pk-left', '◀', function () { turn(-1, 0); });
      var bMid = padBtn('pk-mid', '暂停', function () { tapMid(); });
      padBtn('pk-right', '▶', function () { turn(1, 0); });
      padBtn('pk-down', '▼', function () { turn(0, 1); });

      var foot = U.el('div', 'snake-foot', '方向键 / WASD 转向 · 空格暂停 · 撞墙或撞到自己就结束');
      wrap.appendChild(hud);
      wrap.appendChild(arena);
      wrap.appendChild(pad);
      wrap.appendChild(foot);
      root.appendChild(wrap);

      var g2d = canvas.getContext('2d');
      var bg = document.createElement('canvas');

      /* 触摸设备（或出现过触摸事件）才显示方向键 */
      var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isTouch) pad.classList.add('show');

      ctx.addAction('重开', function () { restart(); });

      /* ---------- 尺寸自适应 ---------- */
      function layout() {
        var aw = arena.clientWidth || 0;
        var ah = arena.clientHeight || 0;
        if (!aw || !ah) return;
        var cs = Math.floor(Math.min(aw / 15, ah / 18));
        cs = Math.max(10, Math.min(cs, 30));
        gridW = Math.max(10, Math.min(26, Math.floor(aw / cs)));
        gridH = Math.max(12, Math.min(32, Math.floor(ah / cs)));
        cellSize = cs;
        var w = gridW * cs, h = gridH * cs;
        var dpr = Math.min(3, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildBg(dpr, w, h);
      }
      function buildBg(dpr, w, h) {
        bg.width = Math.round(w * dpr);
        bg.height = Math.round(h * dpr);
        var g = bg.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (var y = 0; y < gridH; y++) {
          for (var x = 0; x < gridW; x++) {
            g.fillStyle = ((x + y) % 2 === 0) ? '#f1f5fd' : '#e3eaf9';
            g.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
      function clampToGrid() {
        for (var i = 0; i < snake.length; i++) {
          snake[i].x = U.clamp(snake[i].x, 0, gridW - 1);
          snake[i].y = U.clamp(snake[i].y, 0, gridH - 1);
        }
        if (food && (food.x >= gridW || food.y >= gridH)) spawnFood();
      }
      function onResize() {
        if (layoutRaf) return;
        layoutRaf = requestAnimationFrame(function () {
          layoutRaf = 0;
          layout();
          clampToGrid();
          draw(0);
        });
      }
      window.addEventListener('resize', onResize);
      window.addEventListener('touchstart', enablePad, { passive: true, once: true });
      function enablePad() {
        if (!pad.classList.contains('show')) {
          pad.classList.add('show');
          onResize();
        }
      }

      /* ---------- 绘制 ---------- */
      function draw(ts) {
        var W = gridW * cellSize, H = gridH * cellSize;
        g2d.clearRect(0, 0, W, H);
        if (bg.width && bg.height) g2d.drawImage(bg, 0, 0, W, H);
        drawFood(ts || 0);
        drawSnake();
        g2d.lineWidth = 2;
        g2d.strokeStyle = 'rgba(13,19,48,.16)';
        roundRectPath(g2d, 1, 1, W - 2, H - 2, 16);
        g2d.stroke();
      }
      function drawSnake() {
        if (!snake.length) return;
        var cs = cellSize;
        var inset = Math.max(1, cs * 0.09);
        var size = cs - inset * 2;
        var rad = Math.max(3, cs * 0.34);
        var lw = Math.max(1, cs * 0.06);
        var n = snake.length, i, t;
        for (i = n - 1; i >= 1; i--) {
          t = n > 1 ? i / (n - 1) : 0;
          g2d.fillStyle = mixColor('#0e9d68', '#84f2c0', t);
          roundRectPath(g2d, snake[i].x * cs + inset, snake[i].y * cs + inset, size, size, rad);
          g2d.fill();
          g2d.lineWidth = lw;
          g2d.strokeStyle = 'rgba(4,50,31,.16)';
          g2d.stroke();
        }
        roundRectPath(g2d, snake[0].x * cs + inset, snake[0].y * cs + inset, size, size, rad);
        g2d.fillStyle = '#0b8a5b';
        g2d.fill();
        g2d.lineWidth = lw;
        g2d.strokeStyle = 'rgba(4,50,31,.22)';
        g2d.stroke();
        drawEyes(snake[0].x, snake[0].y);
      }
      function drawEyes(gx, gy) {
        var cs = cellSize;
        var cx = gx * cs + cs / 2, cy = gy * cs + cs / 2;
        var px = -dir.y, py = dir.x;
        var fwd = cs * 0.16, side = cs * 0.19;
        var rw = Math.max(1.6, cs * 0.15), rp = Math.max(0.9, cs * 0.075);
        for (var s = -1; s <= 1; s += 2) {
          var ex = cx + dir.x * fwd + px * side * s;
          var ey = cy + dir.y * fwd + py * side * s;
          g2d.fillStyle = '#ffffff';
          g2d.beginPath();
          g2d.arc(ex, ey, rw, 0, Math.PI * 2);
          g2d.fill();
          g2d.fillStyle = '#0d1330';
          g2d.beginPath();
          g2d.arc(ex + dir.x * cs * 0.05, ey + dir.y * cs * 0.05, rp, 0, Math.PI * 2);
          g2d.fill();
        }
      }
      function drawFood(ts) {
        if (!food) return;
        var cs = cellSize;
        var ph = (ts % 1200) / 1200;
        var sc = 0.84 + 0.16 * Math.sin(ph * Math.PI * 2);
        var cx = food.x * cs + cs / 2, cy = food.y * cs + cs / 2;
        var r = cs * 0.36 * sc;
        g2d.fillStyle = 'rgba(13,19,48,.13)';
        g2d.beginPath();
        g2d.arc(cx, cy + cs * 0.08, r, 0, Math.PI * 2);
        g2d.fill();
        var grd = g2d.createRadialGradient(cx - r * 0.36, cy - r * 0.42, r * 0.12, cx, cy, r * 1.15);
        grd.addColorStop(0, '#ffd9a0');
        grd.addColorStop(0.45, '#ff8a5c');
        grd.addColorStop(1, '#e03b63');
        g2d.fillStyle = grd;
        g2d.beginPath();
        g2d.arc(cx, cy, r, 0, Math.PI * 2);
        g2d.fill();
        g2d.strokeStyle = 'rgba(120,20,50,.28)';
        g2d.lineWidth = Math.max(1, cs * 0.05);
        g2d.stroke();
        /* 果柄 */
        g2d.strokeStyle = '#7a4a08';
        g2d.lineWidth = Math.max(1.2, cs * 0.09);
        g2d.lineCap = 'round';
        g2d.beginPath();
        g2d.moveTo(cx, cy - r * 0.9);
        g2d.lineTo(cx + r * 0.16, cy - r * 1.42);
        g2d.stroke();
        /* 叶子 */
        g2d.fillStyle = '#3ddc97';
        g2d.save();
        g2d.translate(cx + r * 0.18, cy - r * 1.15);
        g2d.rotate(-0.5);
        g2d.beginPath();
        g2d.moveTo(0, 0);
        g2d.quadraticCurveTo(r * 0.7, -r * 0.5, r * 1.15, 0);
        g2d.quadraticCurveTo(r * 0.7, r * 0.5, 0, 0);
        g2d.closePath();
        g2d.fill();
        g2d.restore();
        /* 高光 */
        g2d.fillStyle = 'rgba(255,255,255,.88)';
        g2d.beginPath();
        g2d.arc(cx - r * 0.34, cy - r * 0.36, Math.max(1.2, r * 0.22), 0, Math.PI * 2);
        g2d.fill();
      }

      /* ---------- 规则 ---------- */
      function stepMs() { return Math.max(85, 150 - score * 4); }
      function spawnFood() {
        var free = [], x, y, i, hit;
        for (y = 0; y < gridH; y++) {
          for (x = 0; x < gridW; x++) {
            hit = false;
            for (i = 0; i < snake.length; i++) {
              if (snake[i].x === x && snake[i].y === y) { hit = true; break; }
            }
            if (!hit) free.push({ x: x, y: y });
          }
        }
        food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
      }
      function resetRound() {
        var cx = Math.floor(gridW / 2), cy = Math.floor(gridH / 2);
        snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        dir = { x: 1, y: 0 };
        queued = { x: 1, y: 0 };
        score = 0;
        spawnFood();
      }
      function turn(dx, dy) {
        if (phase !== 'play') return;
        if (dx === -queued.x && dy === -queued.y) return;   /* 禁止 180 度掉头 */
        if (dx === queued.x && dy === queued.y) return;
        queued = { x: dx, y: dy };
      }
      function updateHud() {
        sScore.val.textContent = String(score);
        sBest.val.textContent = String(best);
      }
      function updatePad() {
        bMid.textContent = phase === 'play' ? '暂停' : (phase === 'pause' ? '继续' : '重开');
      }
      function showOverlay(title, sub, btn, fn) {
        otitle.textContent = title;
        osub.textContent = sub || '';
        obtn.textContent = btn;
        obtn.onclick = function (e) { e.preventDefault(); fn(); };
        overEl.classList.add('show');
      }
      function hideOverlay() { overEl.classList.remove('show'); }
      function die() {
        phase = 'over';
        if (score > best) best = score;
        store.set('best', best);
        updateHud();
        updatePad();
        showOverlay('游戏结束', '本局得分 ' + score + ' · 最高分 ' + best, '再来一局', restart);
        stopLoop();
        draw(0);
        phone.toast('撞到了！本局结束', 'bad');
      }
      function stepOnce() {
        dir = queued;
        var head = snake[0];
        var nx = head.x + dir.x, ny = head.y + dir.y;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) { die(); return; }
        var eating = !!(food && food.x === nx && food.y === ny);
        var limit = snake.length - (eating ? 0 : 1);
        for (var i = 0; i < limit; i++) {
          if (snake[i].x === nx && snake[i].y === ny) { die(); return; }
        }
        snake.unshift({ x: nx, y: ny });
        if (eating) {
          score += 1;
          if (score > best) { best = score; store.set('best', best); }
          updateHud();
          spawnFood();
        } else {
          snake.pop();
        }
      }

      /* ---------- 主循环（暂停 / 结束时彻底停下，不空转） ---------- */
      function frame(ts) {
        rafId = requestAnimationFrame(frame);
        if (!lastTs) lastTs = ts;
        var dt = Math.min(160, ts - lastTs);
        lastTs = ts;
        acc += dt;
        var step = stepMs();
        while (acc >= step) {
          acc -= step;
          stepOnce();
          if (phase !== 'play') break;
        }
        draw(ts);
      }
      function startLoop() {
        if (rafId) return;
        lastTs = 0;
        acc = 0;
        rafId = requestAnimationFrame(frame);
      }
      function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      }
      function pause() {
        if (phase !== 'play') return;
        phase = 'pause';
        stopLoop();
        updatePad();
        showOverlay('已暂停', '按空格键或点下面的按钮继续', '继续', resume);
      }
      function resume() {
        if (phase !== 'pause') return;
        phase = 'play';
        hideOverlay();
        updatePad();
        startLoop();
      }
      function tapMid() {
        if (phase === 'play') pause();
        else if (phase === 'pause') resume();
        else restart();
      }
      function restart() {
        resetRound();
        phase = 'play';
        hideOverlay();
        updateHud();
        updatePad();
        draw(0);
        startLoop();
      }

      /* ---------- 键盘 ---------- */
      ctx.onKey(function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = String(e.key || '');
        var low = k.toLowerCase();
        if (k === ' ' || k === 'Spacebar' || low === 'p') {
          e.preventDefault();
          if (phase === 'over') restart(); else tapMid();
          return;
        }
        if (low === 'r') {
          e.preventDefault();
          restart();
          return;
        }
        if (low === 'enter') {
          if (phase === 'over') { e.preventDefault(); restart(); }
          return;
        }
        var d = KEY_DIR[k] || KEY_DIR[low];
        if (!d) return;
        e.preventDefault();
        turn(d.x, d.y);
      });

      /* ---------- 画布上滑动转向 ---------- */
      var sx = 0, sy = 0, touching = false;
      var SWIPE = 22;
      function onCanvasTouchStart(e) {
        if (e.touches.length !== 1) { touching = false; return; }
        touching = true;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      }
      function onCanvasTouchMove(e) {
        if (!touching) return;
        if (e.cancelable) e.preventDefault();
        var t = e.touches[0];
        if (!t) return;
        var dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
        if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
        else turn(0, dy > 0 ? 1 : -1);
        sx = t.clientX;
        sy = t.clientY;
      }
      canvas.addEventListener('touchstart', onCanvasTouchStart, { passive: true });
      canvas.addEventListener('touchmove', onCanvasTouchMove, { passive: false });
      canvas.addEventListener('touchend', function () { touching = false; }, { passive: true });
      canvas.addEventListener('touchcancel', function () { touching = false; }, { passive: true });

      ctx.onCleanup(function () {
        stopLoop();
        if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
        window.removeEventListener('resize', onResize);
        window.removeEventListener('touchstart', enablePad);
        canvas.removeEventListener('touchstart', onCanvasTouchStart);
        canvas.removeEventListener('touchmove', onCanvasTouchMove);
      });

      /* ---------- 启动 ---------- */
      best = toInt(store.get('best', 0));
      layout();
      resetRound();
      updateHud();
      updatePad();
      draw(0);
      startLoop();
    }

    return {
      id: 'snake',
      name: '贪吃蛇',
      icon: 'emoji:🐍',
      desc: '经典贪吃蛇，越吃越长',
      order: 11,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'snake', createApp: createApp, code: '' });
})();
