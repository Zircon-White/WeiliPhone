/* ============================================================
   内置应用 · 时钟（纯代码绘制，无外部资源）
   三个标签页：时钟 / 秒表 / 番茄钟
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var POMO_PRESETS = { focus: [25, 45], rest: [5, 15] };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function createApp(phone) {
    var U = phone.utils;

    /* ---------------- 通用小工具 ---------------- */
    function tabBar(tabs, active, onPick) {
      var bar = U.el('div', 'ui-row');
      bar.style.gap = '6px';
      bar.style.background = 'rgba(13,19,48,.06)';
      bar.style.padding = '4px';
      bar.style.borderRadius = '16px';
      tabs.forEach(function (t) {
        var b = U.el('button', 'ui-btn' + (t.key === active ? '' : ' ghost'), t.name);
        b.style.flex = '1';
        b.style.padding = '8px 6px';
        b.style.fontSize = '12.5px';
        b.style.borderRadius = '12px';
        if (t.key !== active) { b.style.background = 'transparent'; b.style.boxShadow = 'none'; }
        b.addEventListener('click', function () { onPick(t.key); });
        bar.appendChild(b);
      });
      return bar;
    }

    /* 按容器实测宽度决定画布逻辑尺寸，随窗口变化重算 */
    function fitCanvas(cv, box, ratio) {
      var w = Math.max(140, Math.round((box.clientWidth || 320) - 4));
      var s = Math.min(w, 300);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(s * dpr);
      cv.height = Math.round(s * ratio * dpr);
      cv.style.width = s + 'px';
      cv.style.height = Math.round(s * ratio) + 'px';
      var g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { g: g, w: s, h: Math.round(s * ratio) };
    }

    function watchResize(cv, draw) {
      function onResize() { draw(); }
      window.addEventListener('resize', onResize);
      ctxApi.onCleanup(function () { window.removeEventListener('resize', onResize); });
    }

    var ctxApi = null;

    /* ============================================================
       标签页一：时钟 —— 低多边形卡通表盘
       ============================================================ */
    function buildClock(host) {
      var wrap = U.el('div');
      var box = U.el('div');
      box.style.display = 'flex';
      box.style.justifyContent = 'center';
      var cv = U.el('canvas');
      cv.style.display = 'block';
      box.appendChild(cv);
      wrap.appendChild(box);

      var digital = U.el('div');
      digital.style.textAlign = 'center';
      digital.style.margin = '12px 0 2px';
      digital.style.fontSize = '30px';
      digital.style.fontWeight = '800';
      digital.style.letterSpacing = '1px';
      digital.style.fontVariantNumeric = 'tabular-nums';
      wrap.appendChild(digital);

      var dateLine = U.el('div', 'ui-muted');
      dateLine.style.textAlign = 'center';
      wrap.appendChild(dateLine);

      var zone = U.el('div', 'ui-muted');
      zone.style.textAlign = 'center';
      zone.style.marginTop = '6px';
      zone.textContent = '当前位置：本机时区 · ' + (-new Date().getTimezoneOffset() / 60) + ' 时区';
      wrap.appendChild(zone);

      host.appendChild(wrap);

      function drawFace() {
        var f = fitCanvas(cv, box, 1);
        var g = f.g, w = f.w, h = f.h;
        var cx = w / 2, cy = h / 2, R = w * 0.46;

        var now = new Date();
        var hh = now.getHours() % 12, mm = now.getMinutes(), ss = now.getSeconds();

        /* 柔和投影 */
        g.save();
        g.globalAlpha = 0.16;
        g.fillStyle = '#4a3a86';
        g.beginPath(); g.ellipse(cx, cy + R * 0.14, R, R * 0.98, 0, 0, Math.PI * 2); g.fill();
        g.restore();

        /* 外壳 */
        g.save();
        g.fillStyle = '#2b2f52';
        g.beginPath(); g.arc(cx, cy, R + 5, 0, Math.PI * 2); g.fill();
        g.restore();

        /* 表盘底：低多边形扇面 */
        var sides = 12;
        var tints = ['#fdfcff', '#f4f7ff', '#e9eefc', '#f7f4ff', '#eef3ff', '#f9fbff'];
        for (var i = 0; i < sides; i++) {
          var a0 = (Math.PI * 2 / sides) * i - Math.PI / 2;
          var a1 = (Math.PI * 2 / sides) * (i + 1) - Math.PI / 2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
          g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
          g.closePath();
          g.fillStyle = i % 2 === 0 ? tints[i % tints.length] : '#ffffff';
          g.fill();
          g.strokeStyle = 'rgba(43,47,82,.07)';
          g.lineWidth = 1;
          g.stroke();
        }

        /* 刻度 */
        for (var k = 0; k < 12; k++) {
          var ak = (Math.PI * 2 / 12) * k - Math.PI / 2;
          var big = k % 3 === 0;
          var r0 = R * (big ? 0.74 : 0.81);
          var r1 = R * 0.9;
          g.beginPath();
          g.moveTo(cx + Math.cos(ak) * r0, cy + Math.sin(ak) * r0);
          g.lineTo(cx + Math.cos(ak) * r1, cy + Math.sin(ak) * r1);
          g.lineWidth = big ? Math.max(4, R * 0.055) : Math.max(2, R * 0.028);
          g.lineCap = 'round';
          g.strokeStyle = big ? '#3b3f6b' : 'rgba(59,63,107,.45)';
          g.stroke();
        }
        /* 四角配色三角，增加低多边形质感 */
        var ACC = ['#3ddc97', '#5cc8ff', '#ffb457', '#ff7a8a'];
        for (var q = 0; q < 4; q++) {
          var aq = (Math.PI / 2) * q + Math.PI / 4 - Math.PI / 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(aq) * R * 0.99, cy + Math.sin(aq) * R * 0.99);
          g.lineTo(cx + Math.cos(aq - 0.26) * R * 0.7, cy + Math.sin(aq - 0.26) * R * 0.7);
          g.lineTo(cx + Math.cos(aq + 0.26) * R * 0.7, cy + Math.sin(aq + 0.26) * R * 0.7);
          g.closePath();
          g.globalAlpha = 0.16;
          g.fillStyle = ACC[q];
          g.fill();
          g.globalAlpha = 1;
        }

        var hand = function (angle, len, width, color) {
          var ex = cx + Math.cos(angle) * len, ey = cy + Math.sin(angle) * len;
          g.save();
          g.globalAlpha = 0.18;
          g.strokeStyle = '#2b2f52';
          g.lineWidth = width;
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(cx + 2, cy + 3); g.lineTo(ex + 2, ey + 3); g.stroke();
          g.restore();
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(ex, ey);
          g.lineWidth = width;
          g.lineCap = 'round';
          g.strokeStyle = color;
          g.stroke();
        };

        var aHour = ((hh + mm / 60) / 12) * Math.PI * 2 - Math.PI / 2;
        var aMin = ((mm + ss / 60) / 60) * Math.PI * 2 - Math.PI / 2;
        var aSec = (ss / 60) * Math.PI * 2 - Math.PI / 2;

        hand(aHour, R * 0.46, Math.max(7, R * 0.10), '#3b3f6b');
        hand(aMin, R * 0.66, Math.max(5, R * 0.072), '#5b648f');
        hand(aSec, R * 0.78, Math.max(2, R * 0.032), '#ff7a8a');

        /* 中心圆点 */
        g.beginPath(); g.arc(cx, cy, Math.max(7, R * 0.1), 0, Math.PI * 2);
        g.fillStyle = '#2b2f52'; g.fill();
        g.beginPath(); g.arc(cx - R * 0.02, cy - R * 0.03, Math.max(3, R * 0.035), 0, Math.PI * 2);
        g.fillStyle = '#3ddc97'; g.fill();

        digital.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
        dateLine.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + WEEK[now.getDay()];
      }

      drawFace();
      var timer = setInterval(drawFace, 1000);
      ctxApi.onCleanup(function () { clearInterval(timer); });
      watchResize(cv, drawFace);
    }

    /* ============================================================
       标签页二：秒表
       ============================================================ */
    function buildStopwatch(host) {
      var st = { base: 0, t0: 0, running: false, laps: [] };
      var tick = null;

      var card = U.el('div', 'ui-card');
      card.style.textAlign = 'center';
      card.style.padding = '22px 15px';
      var timeEl = U.el('div');
      timeEl.style.fontSize = '40px';
      timeEl.style.fontWeight = '800';
      timeEl.style.fontVariantNumeric = 'tabular-nums';
      timeEl.style.letterSpacing = '1px';
      card.appendChild(timeEl);
      card.appendChild(U.el('div', 'ui-muted', '秒 . 厘秒（1/100 秒）'));
      host.appendChild(card);

      var row = U.el('div', 'ui-row');
      row.style.margin = '12px 0';
      var bMain = U.el('button', 'ui-btn', '开始');
      bMain.style.flex = '1';
      var bLap = U.el('button', 'ui-btn ghost', '分圈');
      var bReset = U.el('button', 'ui-btn ghost', '清零');
      row.appendChild(bMain); row.appendChild(bLap); row.appendChild(bReset);
      host.appendChild(row);

      host.appendChild(U.el('div', 'ui-label', '分圈记录'));
      var list = U.el('div', 'ui-list');
      host.appendChild(list);

      function elapsed() { return st.base + (st.running ? Date.now() - st.t0 : 0); }
      function fmt(ms) {
        var cs = Math.floor(ms / 10) % 100;
        var s = Math.floor(ms / 1000) % 60;
        var m = Math.floor(ms / 60000) % 60;
        var h = Math.floor(ms / 3600000);
        var head = h > 0 ? h + ':' + pad2(m) : String(m);
        return head + ':' + pad2(s) + '.' + pad2(cs);
      }
      function paintTime() { timeEl.textContent = fmt(elapsed()); }

      function paintLaps() {
        list.innerHTML = '';
        if (!st.laps.length) {
          list.appendChild(U.el('div', 'ui-hint', '还没有分圈记录。计时中点「分圈」可以记下一圈，最快的一圈会标成绿色。'));
          return;
        }
        var best = 0;
        st.laps.forEach(function (L, i) { if (L.split < st.laps[best].split) best = i; });
        st.laps.slice().reverse().forEach(function (L) {
          var idx = st.laps.indexOf(L);
          var li = U.el('div', 'li');
          var main = U.el('div', 'li-main');
          var b = U.el('b', null, '第 ' + (idx + 1) + ' 圈' + (idx === best && st.laps.length > 1 ? ' · 最快' : ''));
          if (idx === best && st.laps.length > 1) b.style.color = '#12a86f';
          main.appendChild(b);
          main.appendChild(U.el('small', null, '分圈 ' + fmt(L.split) + ' · 总时 ' + fmt(L.total)));
          li.appendChild(main);
          list.appendChild(li);
        });
      }

      function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
      function startTick() {
        stopTick();
        tick = setInterval(paintTime, 31);
        ctxApi.onCleanup(stopTick);
      }
      function refresh() {
        paintTime(); paintLaps();
        bMain.textContent = st.running ? '暂停' : (elapsed() > 0 ? '继续' : '开始');
      }

      bMain.addEventListener('click', function () {
        if (st.running) {
          st.base = elapsed();
          st.running = false;
          stopTick();
        } else {
          st.t0 = Date.now();
          st.running = true;
          startTick();
        }
        refresh();
      });
      bLap.addEventListener('click', function () {
        if (!st.running && elapsed() === 0) return phone.toast('先开始计时再分圈', 'bad');
        var total = elapsed();
        var prev = st.laps.length ? st.laps[st.laps.length - 1].total : 0;
        st.laps.push({ split: total - prev, total: total });
        paintTime();
        paintLaps();
      });
      bReset.addEventListener('click', function () {
        if (elapsed() === 0 && !st.laps.length) return;
        st.base = 0; st.running = false; st.laps = [];
        stopTick();
        refresh();
        phone.toast('秒表已清零', 'ok');
      });

      refresh();
    }

    /* ============================================================
       标签页三：番茄钟
       ============================================================ */
    function buildPomodoro(host) {
      var cfg = ctxApi.store.get('pomo', {});
      var conf = {
        focus: typeof cfg.focus === 'number' ? cfg.focus : 25,
        rest: typeof cfg.rest === 'number' ? cfg.rest : 5
      };
      var P = { phase: 'focus', running: false, endAt: 0, left: conf.focus * 60000, done: 0 };

      var phaseEl = U.el('div');
      phaseEl.style.textAlign = 'center';
      phaseEl.style.fontWeight = '800';
      phaseEl.style.fontSize = '13px';
      phaseEl.style.letterSpacing = '2px';
      host.appendChild(phaseEl);

      var box = U.el('div');
      box.style.display = 'flex';
      box.style.justifyContent = 'center';
      box.style.margin = '10px 0 0';
      var cv = U.el('canvas');
      cv.style.display = 'block';
      box.appendChild(cv);
      host.appendChild(box);

      var meta = U.el('div', 'ui-muted');
      meta.style.textAlign = 'center';
      meta.style.marginTop = '8px';
      host.appendChild(meta);

      var row = U.el('div', 'ui-row');
      row.style.margin = '12px 0';
      var bMain = U.el('button', 'ui-btn', '开始专注');
      bMain.style.flex = '1';
      var bSkip = U.el('button', 'ui-btn ghost', '重置');
      row.appendChild(bMain); row.appendChild(bSkip);
      host.appendChild(row);

      host.appendChild(U.el('div', 'ui-label', '专注时长（分钟）'));
      var rowF = U.el('div', 'ui-row');
      rowF.style.flexWrap = 'wrap';
      host.appendChild(rowF);

      host.appendChild(U.el('div', 'ui-label', '休息时长（分钟）'));
      var rowR = U.el('div', 'ui-row');
      rowR.style.flexWrap = 'wrap';
      host.appendChild(rowR);

      host.appendChild(U.el('div', 'ui-hint',
        '番茄工作法：专注一段时间后短暂休息，循环几轮效率更高。时长设置会自动保存，下次打开还在。'));

      function presetBtn(kind, m) {
        var on = conf[kind] === m;
        var b = U.el('button', 'ui-btn' + (on ? '' : ' ghost'), m + ' 分钟');
        if (on) { b.style.boxShadow = '0 6px 12px -8px rgba(13,19,48,.9)'; }
        b.addEventListener('click', function () {
          conf[kind] = m;
          ctxApi.store.set('pomo', { focus: conf.focus, rest: conf.rest });
          phone.toast((kind === 'focus' ? '专注' : '休息') + '时长设为 ' + m + ' 分钟', 'ok');
          P.phase = kind;
          stop();
          P.left = totalMs();
          paintPresets();
          paint();
        });
        return b;
      }

      function paintPresets() {
        rowF.innerHTML = '';
        POMO_PRESETS.focus.forEach(function (m) { rowF.appendChild(presetBtn('focus', m)); });
        rowR.innerHTML = '';
        POMO_PRESETS.rest.forEach(function (m) { rowR.appendChild(presetBtn('rest', m)); });
      }

      function totalMs() { return conf[P.phase] * 60000; }
      function remain() { return P.running ? Math.max(0, P.endAt - Date.now()) : P.left; }
      function fmt(ms) {
        var s = Math.ceil(ms / 1000);
        return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
      }

      function resetPhase(phase) {
        stop();
        P.phase = phase;
        P.left = totalMs();
        paintPresets();
        paint();
      }

      function drawRing() {
        var f = fitCanvas(cv, box, 1);
        var g = f.g, w = f.w, h = f.h;
        var cx = w / 2, cy = h / 2, R = w * 0.38, lw = Math.max(11, R * 0.17);
        var pct = totalMs() > 0 ? 1 - remain() / totalMs() : 0;
        pct = U.clamp(pct, 0, 1);
        var isFocus = P.phase === 'focus';
        var c1 = isFocus ? '#ff7a8a' : '#3ddc97';
        var c2 = isFocus ? '#ffb457' : '#5cc8ff';

        g.save();
        g.globalAlpha = 0.14;
        g.fillStyle = isFocus ? '#ff7a8a' : '#3ddc97';
        g.beginPath(); g.arc(cx, cy + R * 0.1, R + lw, 0, Math.PI * 2); g.fill();
        g.restore();

        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
        g.lineWidth = lw; g.strokeStyle = 'rgba(13,19,48,.09)'; g.stroke();

        if (pct > 0.001) {
          var grad = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
          grad.addColorStop(0, c1); grad.addColorStop(1, c2);
          g.beginPath();
          g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
          g.lineWidth = lw; g.lineCap = 'round';
          g.strokeStyle = grad;
          g.stroke();
        }

        g.textAlign = 'center';
        g.fillStyle = '#0d1330';
        g.font = '800 ' + Math.round(R * 0.46) + 'px "PingFang SC","Microsoft YaHei UI",system-ui,sans-serif';
        g.fillText(fmt(remain()), cx, cy + R * 0.17);
        g.fillStyle = '#5b648f';
        g.font = '700 ' + Math.round(R * 0.16) + 'px "PingFang SC","Microsoft YaHei UI",system-ui,sans-serif';
        g.fillText(isFocus ? '专注中' : '休息中', cx, cy + R * 0.53);
      }

      function paint() {
        drawRing();
        phaseEl.textContent = P.phase === 'focus' ? '🍅 专 注' : '☕ 休 息';
        phaseEl.style.color = P.phase === 'focus' ? '#e03b63' : '#12a86f';
        bMain.textContent = P.running ? '暂停' : (P.left < totalMs() ? '继续' : (P.phase === 'focus' ? '开始专注' : '开始休息'));
        meta.textContent = '本阶段 ' + conf[P.phase] + ' 分钟 · 已完成 ' + P.done + ' 个专注段';
      }

      var iv = null;
      function stop() {
        if (iv) { clearInterval(iv); iv = null; }
        if (P.running) { P.left = Math.max(0, P.endAt - Date.now()); P.running = false; }
      }
      function play() {
        P.endAt = Date.now() + P.left;
        P.running = true;
        if (iv) clearInterval(iv);
        iv = setInterval(function () {
          if (remain() <= 0) { finish(); return; }
          paint();
        }, 250);
      }
      ctxApi.onCleanup(function () { if (iv) clearInterval(iv); });

      function finish() {
        stop();
        var wasFocus = P.phase === 'focus';
        if (wasFocus) P.done += 1;
        P.left = 0;
        paint();
        phone.toast(wasFocus ? '专注结束，去休息一下吧！' : '休息结束，继续加油！', 'ok');
        phone.alert(wasFocus ? '🍅 专注完成' : '☕ 休息结束',
          wasFocus ? '你已完成 ' + P.done + ' 个专注段。\n\n接下来进入 ' + conf.rest + ' 分钟休息。'
            : '休息结束，准备开始下一段 ' + conf.focus + ' 分钟专注。')
          .then(function () { resetPhase(wasFocus ? 'rest' : 'focus'); });
      }

      bMain.addEventListener('click', function () {
        if (P.running) { stop(); paint(); }
        else { if (P.left <= 0) P.left = totalMs(); play(); paint(); }
      });
      bSkip.addEventListener('click', function () {
        stop();
        P.left = totalMs();
        paint();
        phone.toast('已重置本阶段计时', 'ok');
      });

      paintPresets();
      paint();
      watchResize(cv, drawRing);
    }

    /* ============================================================
       mount
       ============================================================ */
    function mount(phoneApi, root, ctx) {
      ctxApi = ctx;
      var view = ctx.store.get('tab', 'clock') || 'clock';
      if (['clock', 'stopwatch', 'pomodoro'].indexOf(view) < 0) view = 'clock';

      function render() {
        root.innerHTML = '';
        ctx.setTitle(view === 'clock' ? '时钟' : (view === 'stopwatch' ? '秒表' : '番茄钟'));
        var wrap = U.el('div');
        wrap.appendChild(tabBar([
          { key: 'clock', name: '时钟' },
          { key: 'stopwatch', name: '秒表' },
          { key: 'pomodoro', name: '番茄钟' }
        ], view, function (k) {
          if (k === view) return;
          view = k;
          ctx.store.set('tab', k);
          render();
        }));
        var inner = U.el('div');
        inner.style.marginTop = '14px';
        wrap.appendChild(inner);
        root.appendChild(wrap);
        if (view === 'clock') buildClock(inner);
        else if (view === 'stopwatch') buildStopwatch(inner);
        else buildPomodoro(inner);
      }

      render();
    }

    return {
      id: 'clock',
      name: '时钟',
      icon: 'emoji:⏰',
      desc: '时钟 / 秒表 / 番茄钟',
      order: 20,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'clock', createApp: createApp, code: '' });
})();
