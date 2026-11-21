/* ============================================================
   内置应用 · 计算器（自写安全解析器，无 eval / 无外部资源）
   四列大按键 + 历史记录 + 键盘支持
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  /* ---------------- 安全表达式求值（分词 + 双栈，含优先级） ---------------- */
  var NUM = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  var OPS = '+-*/%';

  function tokenize(src) {
    var s = String(src == null ? '' : src);
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\u00d7/g, '*');
    s = s.replace(/[，,]/g, '');
    var out = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === ' ') { i++; continue; }
      if (c === '(' || c === ')') { out.push(c); i++; continue; }
      if (OPS.indexOf(c) >= 0) { out.push(c); i++; continue; }
      if (c >= '0' && c <= '9' || c === '.') {
        var j = i, dots = 0;
        while (j < s.length && (s.charAt(j) >= '0' && s.charAt(j) <= '9' || s.charAt(j) === '.')) {
          if (s.charAt(j) === '.') dots++;
          j++;
        }
        var t = s.slice(i, j);
        if (dots > 1) throw new Error('数字格式错误：' + t);
        out.push(t);
        i = j;
        continue;
      }
      throw new Error('无法识别的字符：' + c);
    }
    return out;
  }

  function evaluate(src) {
    var tk = tokenize(src);
    if (!tk.length) throw new Error('算式为空');
    var values = [], ops = [];
    function peekOp() { return ops.length ? ops[ops.length - 1] : null; }
    function prec(op) { return (op === '*' || op === '/' || op === '%') ? 2 : 1; }
    function applyTop() {
      var op = ops.pop();
      var b = values.pop();
      var a = values.pop();
      if (a === undefined || b === undefined) throw new Error('算式不完整');
      if ((op === '/' || op === '%') && b === 0) throw new Error('除数不能为 0');
      var r;
      if (op === '+') r = a + b;
      else if (op === '-') r = a - b;
      else if (op === '*') r = a * b;
      else if (op === '/') r = a / b;
      else r = a % b;
      if (!isFinite(r) || isNaN(r)) throw new Error('结果无效');
      values.push(r);
    }
    var expectValue = true;
    for (var i = 0; i < tk.length; i++) {
      var t = tk[i];
      if (NUM.test(t)) {
        values.push(parseFloat(t));
        expectValue = false;
        continue;
      }
      if (t === '(') { ops.push(t); expectValue = true; continue; }
      if (t === ')') {
        while (ops.length && peekOp() !== '(') applyTop();
        if (!ops.length) throw new Error('括号不匹配');
        ops.pop();
        expectValue = false;
        continue;
      }
      /* 运算符 */
      if (expectValue) {
        if (t === '-') { values.push(0); ops.push(t); expectValue = true; continue; }
        throw new Error('运算符位置不正确');
      }
      while (ops.length && peekOp() !== '(' && prec(peekOp()) >= prec(t)) applyTop();
      ops.push(t);
      expectValue = true;
    }
    if (expectValue) throw new Error('算式不完整');
    while (ops.length) {
      if (peekOp() === '(') throw new Error('括号不匹配');
      applyTop();
    }
    if (values.length !== 1) throw new Error('算式非法');
    var v = values[0];
    if (!isFinite(v) || isNaN(v)) throw new Error('结果无效');
    return v;
  }

  function fmtNum(v) {
    if (!isFinite(v) || isNaN(v)) return '错误';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e');
    var s = String(Math.round(v * 1e10) / 1e10);
    return s;
  }
  function group(s) {
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  function createApp(phone) {
    var U = phone.utils;

    function mount(phoneApi, root, ctx) {
      var expr = '';
      var result = '';
      var isErr = false;
      var fresh = true;       /* 结果出来后，下一个数字键开始新算式 */
      var showHistory = false;

      function history() {
        var h = ctx.store.get('history', []);
        return Object.prototype.toString.call(h) === '[object Array]' ? h : [];
      }
      function pushHistory(exprText, resText) {
        var h = history();
        h.unshift({ e: exprText, r: resText, t: Date.now() });
        ctx.store.set('history', h.slice(0, 50));
      }

      function calc(text) {
        var v = evaluate(text);
        return fmtNum(v);
      }
      function refreshPreview() {
        if (!expr.trim()) return '';
        try { return fmtNum(evaluate(expr)); } catch (e) { return ''; }
      }

      /* ---------------- 交互 ---------------- */
      function input(ch) {
        if (isErr) { expr = ''; result = ''; isErr = false; fresh = false; }
        if (fresh) { expr = ''; result = ''; fresh = false; }
        if (OPS.indexOf(ch) >= 0 || ch === '×' || ch === '÷') {
          var last = expr.slice(-1);
          if (!expr && (ch === '-' || ch === '−')) { expr = '-'; render(); return; }
          if (!expr) return;
          if (OPS.indexOf(last) >= 0) expr = expr.slice(0, -1) + ch;
          else expr += ch;
          render();
          return;
        }
        if (ch === '.') {
          var seg = expr.split(/[+\-*/%()]/).pop();
          if (seg.indexOf('.') >= 0) return;
          if (!seg) expr += '0';
          expr += '.';
          render();
          return;
        }
        expr += ch;
        render();
      }

      function backspace() {
        if (isErr) { expr = ''; result = ''; isErr = false; render(); return; }
        if (fresh) { expr = ''; result = ''; fresh = false; render(); return; }
        expr = expr.slice(0, -1);
        render();
      }

      function clearAll() {
        expr = ''; result = ''; isErr = false; fresh = true;
        render();
      }

      function toggleSign() {
        if (isErr) return;
        if (!expr) { expr = '-'; render(); return; }
        var m = expr.match(/(\d+\.?\d*|\.\d+)$/);
        if (!m) { expr += '-'; render(); return; }
        var start = expr.length - m[1].length;
        if (expr.charAt(start - 1) === '-') {
          var before = expr.charAt(start - 2);
          if (start - 1 === 0 || OPS.indexOf(before) >= 0 || before === '(') {
            expr = expr.slice(0, start - 1) + expr.slice(start);
            render();
            return;
          }
        }
        expr = expr.slice(0, start) + '(-' + m[1] + ')';
        render();
      }

      function equals() {
        if (!expr.trim()) return;
        var text = expr;
        try {
          var v = evaluate(text);
          isErr = false;
          result = fmtNum(v);
          pushHistory(text, result);
          fresh = true;
        } catch (e) {
          isErr = true;
          result = '错误';
          fresh = false;
        }
        render();
      }

      function press(k) {
        if (k === 'C') return clearAll();
        if (k === 'back') return backspace();
        if (k === '=') return equals();
        if (k === '+/−') return toggleSign();
        if (k === '( )') {
          if (isErr) return;
          if (fresh) { expr = ''; result = ''; fresh = false; }
          var opens = (expr.match(/\(/g) || []).length;
          var closes = (expr.match(/\)/g) || []).length;
          var last = expr.slice(-1);
          if (opens > closes && /[\d).%]/.test(last)) expr += ')';
          else expr += '(';
          render();
          return;
        }
        input(k);
      }

      /* ---------------- 视图 ---------------- */
      function syncHistBtn() {
        if (!bHist) return;
        bHist.className = 'ui-btn' + (showHistory ? '' : ' ghost');
        bHist.textContent = showHistory ? '收起历史' : '历史';
      }

      function render() {
        syncHistBtn();
        root.innerHTML = '';

        var wrap = U.el('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.height = '100%';
        wrap.style.minHeight = '0';

        /* 显示区 */
        var disp = U.el('div', 'ui-card');
        disp.style.padding = '12px 14px';
        disp.style.textAlign = 'right';
        disp.style.flex = '0 0 auto';

        var eLine = U.el('div');
        eLine.style.fontSize = '15px';
        eLine.style.fontWeight = '700';
        eLine.style.color = isErr ? '#e03b63' : 'var(--ink-soft)';
        eLine.style.minHeight = '21px';
        eLine.style.wordBreak = 'break-all';
        eLine.style.fontVariantNumeric = 'tabular-nums';
        eLine.textContent = expr || '0';
        disp.appendChild(eLine);

        var rLine = U.el('div');
        rLine.style.fontSize = '34px';
        rLine.style.fontWeight = '800';
        rLine.style.letterSpacing = '.5px';
        rLine.style.marginTop = '2px';
        rLine.style.overflow = 'hidden';
        rLine.style.textOverflow = 'ellipsis';
        rLine.style.whiteSpace = 'nowrap';
        rLine.style.fontVariantNumeric = 'tabular-nums';
        rLine.style.color = isErr ? '#e03b63' : 'var(--ink)';
        var shown = result !== '' ? group(result) : (fresh ? '' : group(refreshPreview()) || '0');
        if (isErr) shown = '错误';
        rLine.textContent = shown || '0';
        disp.appendChild(rLine);
        wrap.appendChild(disp);

        /* 历史面板 */
        if (showHistory) {
          var hp = U.el('div', 'ui-card');
          hp.style.marginTop = '10px';
          hp.style.padding = '10px 12px';
          hp.style.maxHeight = '132px';
          hp.style.overflow = 'auto';
          hp.style.flex = '0 0 auto';
          var hh = U.el('div', 'ui-row');
          hh.style.justifyContent = 'space-between';
          hh.appendChild(U.el('div', 'ui-label', '历史记录'));
          var bClr = U.el('button', 'ui-btn ghost', '清空');
          bClr.style.padding = '4px 10px'; bClr.style.fontSize = '11.5px';
          bClr.addEventListener('click', function () {
            ctx.store.set('history', []);
            phone.toast('历史记录已清空', 'ok');
            render();
          });
          hh.appendChild(bClr);
          hp.appendChild(hh);

          var h = history();
          if (!h.length) {
            hp.appendChild(U.el('div', 'ui-muted', '还没有计算记录。'));
          } else {
            var hl = U.el('div', 'ui-list');
            h.forEach(function (item) {
              var li = U.el('div', 'li');
              li.style.padding = '8px 10px';
              li.style.cursor = 'pointer';
              li.title = '点一下把结果填回算式';
              var main = U.el('div', 'li-main');
              var b = U.el('b', null, group(item.r));
              b.style.fontSize = '14px';
              main.appendChild(b);
              main.appendChild(U.el('small', null, String(item.e).replace(/\*/g, '×').replace(/\//g, '÷')));
              li.appendChild(main);
              li.addEventListener('click', function () {
                expr = String(item.r);
                result = '';
                isErr = false;
                fresh = false;
                render();
                phone.toast('已填入结果 ' + group(item.r), 'ok');
              });
              hl.appendChild(li);
            });
            hp.appendChild(hl);
          }
          wrap.appendChild(hp);
        }

        /* 键盘区 */
        var pad = U.el('div');
        pad.style.flex = '0 0 auto';
        pad.style.minHeight = '298px';
        pad.style.display = 'grid';
        pad.style.gridTemplateColumns = 'repeat(4,1fr)';
        pad.style.gridTemplateRows = 'repeat(6,1fr)';
        pad.style.gap = '9px';
        pad.style.marginTop = '12px';
        pad.style.paddingBottom = '4px';

        var KEYS = [
          { k: 'C', label: 'AC', cls: 'ghost' },
          { k: '( )', label: '( )', cls: 'ghost' },
          { k: '%', label: '%', cls: 'ghost' },
          { k: '/', label: '÷', cls: 'op' },
          { k: '7', label: '7' }, { k: '8', label: '8' }, { k: '9', label: '9' },
          { k: '*', label: '×', cls: 'op' },
          { k: '4', label: '4' }, { k: '5', label: '5' }, { k: '6', label: '6' },
          { k: '-', label: '−', cls: 'op' },
          { k: '1', label: '1' }, { k: '2', label: '2' }, { k: '3', label: '3' },
          { k: '+', label: '+', cls: 'op' },
          { k: '+/−', label: '±', cls: 'ghost' },
          { k: '0', label: '0' },
          { k: '.', label: '.' },
          { k: '=', label: '=', cls: 'eq' }
        ];
        KEYS.forEach(function (it) {
          var b = U.el('button', 'ui-btn' + (it.cls === 'ghost' ? ' ghost' : ''));
          b.textContent = it.label;
          b.style.padding = '0';
          b.style.fontSize = it.cls === 'op' || it.cls === 'eq' ? '20px' : '18px';
          b.style.borderRadius = '16px';
          b.style.minHeight = '42px';
          b.style.transition = 'transform .07s, filter .12s';
          if (it.cls === 'op') b.style.background = 'rgba(92,200,255,.9)';
          if (it.cls === 'eq') { b.style.background = phone.grad('calc'); b.style.fontSize = '21px'; }
          b.addEventListener('pointerdown', function () {
            b.style.transform = 'scale(.92)';
            b.style.filter = 'brightness(.92)';
          });
          var release = function () {
            b.style.transform = '';
            b.style.filter = '';
          };
          b.addEventListener('pointerup', release);
          b.addEventListener('pointercancel', release);
          b.addEventListener('pointerleave', release);
          b.addEventListener('click', function () { press(it.k); });
          pad.appendChild(b);
        });

        var back = U.el('button', 'ui-btn ghost', '⌫ 退格');
        back.style.gridColumn = 'span 2';
        back.style.padding = '0';
        back.style.minHeight = '42px';
        back.style.borderRadius = '16px';
        back.addEventListener('click', backspace);
        pad.appendChild(back);

        var pct2 = U.el('button', 'ui-btn ghost', '清除');
        pct2.style.gridColumn = 'span 2';
        pct2.style.padding = '0';
        pct2.style.minHeight = '42px';
        pct2.style.borderRadius = '16px';
        pct2.addEventListener('click', clearAll);
        pad.appendChild(pct2);

        wrap.appendChild(pad);
        root.appendChild(wrap);
      }

      /* ---------------- 导航栏动作 ---------------- */
      var acts = U.$('.nav-actions', root.parentNode);
      if (acts) acts.innerHTML = '';
      var bHist = U.el('button', 'ui-btn' + (showHistory ? '' : ' ghost'), '历史');
      bHist.style.padding = '7px 13px';
      bHist.style.fontSize = '12.5px';
      bHist.addEventListener('click', function () {
        showHistory = !showHistory;
        render();
      });
      if (acts) acts.appendChild(bHist);
      else ctx.addAction('历史', function () { showHistory = !showHistory; render(); });

      /* ---------------- 键盘 ---------------- */
      ctx.onKey(function (e) {
        var k = e.key;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k >= '0' && k <= '9') { input(k); e.preventDefault(); return; }
        if (k === '.' || k === ',') { input('.'); e.preventDefault(); return; }
        if (k === '+') { input('+'); e.preventDefault(); return; }
        if (k === '-') { input('-'); e.preventDefault(); return; }
        if (k === '*' || k === 'x' || k === 'X' || k === '×') { input('*'); e.preventDefault(); return; }
        if (k === '/' || k === '÷') { input('/'); e.preventDefault(); return; }
        if (k === '%') { input('%'); e.preventDefault(); return; }
        if (k === '(' || k === ')') { press('( )'); e.preventDefault(); return; }
        if (k === 'Enter' || k === '=') { equals(); e.preventDefault(); return; }
        if (k === 'Backspace') { backspace(); e.preventDefault(); return; }
        if (k === 'Delete') { clearAll(); e.preventDefault(); return; }
        if (k === 'Escape' || k === 'c' || k === 'C') { clearAll(); e.preventDefault(); return; }
      });

      render();
    }

    return {
      id: 'calc',
      name: '计算器',
      icon: 'emoji:🧮',
      desc: '顺手好用的计算器',
      order: 22,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'calc', createApp: createApp, code: '' });
})();
