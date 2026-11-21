/* ============================================================
   内置应用 · 阅读器
   - 导入 / 删除常见纯文本文件（txt / md / csv / json / html …）
   - 内容检索、AI 总结、划线询问（划选内容后向中心 API 提问）
   - 日间 / 夜间两套配色
   接口一律来自「设置 → API 管理」，本应用内不再单独填写。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var READER_CSS_ID = 'reader-theme-css';
  var READER_CSS = [
    '/* 阅读器：日间为米色纸感，夜间为深色护眼（只作用于 reader 应用窗口） */',
    '#apps .app-host[data-app-id="reader"]{background:linear-gradient(180deg,#fbf7f0 0%,#f2ebdf 100%)}',
    '#apps .app-host[data-app-id="reader"] .app-nav{background:#f7f2e9;border-bottom-color:rgba(90,70,50,.14)}',
    '#apps .app-host[data-app-id="reader"] .nav-title{color:#3a2f21}',
    '#apps .app-host[data-app-id="reader"] .nav-btn{background:rgba(90,70,50,.09);color:#3a2f21}',
    '#apps .app-host[data-app-id="reader"] .ui-btn{background:#8a6a4a;color:#fdf8f0;box-shadow:0 6px 14px -8px rgba(90,70,50,.9)}',
    '#apps .app-host[data-app-id="reader"] .ui-btn.ghost{background:rgba(90,70,50,.09);color:#4a3a26;box-shadow:none}',
    '#apps .app-host[data-app-id="reader"] .ui-btn.warn{background:#c05a48;color:#fff4f0}',
    '#apps .app-host[data-app-id="reader"] .ui-field{background:#fffdf9;border-color:rgba(90,70,50,.2);color:#3a2f21}',
    '#apps .app-host[data-app-id="reader"] .ui-card{background:#fffdf9;border-color:rgba(90,70,50,.12)}',
    '#apps .app-host[data-app-id="reader"] .ui-list .li{background:#fffdf9;border-color:rgba(90,70,50,.12)}',
    '#apps .app-host[data-app-id="reader"] .ui-muted,#apps .app-host[data-app-id="reader"] .ui-label{color:#8a7358}',
    '#apps .app-host[data-app-id="reader"].rd-night{background:linear-gradient(180deg,#14161d 0%,#0d0f14 100%)}',
    '#apps .app-host[data-app-id="reader"].rd-night .app-nav{background:#1a1d26;border-bottom-color:rgba(255,255,255,.08)}',
    '#apps .app-host[data-app-id="reader"].rd-night .nav-title{color:#e9e4db}',
    '#apps .app-host[data-app-id="reader"].rd-night .nav-btn{background:rgba(255,255,255,.08);color:#e9e4db}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-btn{background:#39404f;color:#f2ede5;box-shadow:none}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-btn.ghost{background:rgba(255,255,255,.08);color:#ddd7cc}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-field{background:#1a1d26;border-color:rgba(255,255,255,.14);color:#e9e4db}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-card{background:#1a1d26;border-color:rgba(255,255,255,.08);color:#ddd7cc}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-list .li{background:#1a1d26;border-color:rgba(255,255,255,.08)}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-list .li b{color:#e9e4db}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-muted,#apps .app-host[data-app-id="reader"].rd-night .ui-label{color:#98a0b2}',
    '#apps .app-host[data-app-id="reader"].rd-night .ui-hint{background:rgba(214,163,110,.14);border-color:rgba(214,163,110,.34);color:#e6cdaf}',
    '#apps .app-host[data-app-id="reader"] .rd-tools{position:sticky;top:0;z-index:6;padding:10px 16px 8px;',
    '  background:#fbf7f0;box-shadow:0 8px 14px -10px rgba(90,70,50,.35)}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-tools{background:#14161d;box-shadow:0 8px 14px -10px rgba(0,0,0,.7)}',
    '#apps .app-host[data-app-id="reader"] .rd-pane{padding:14px 16px 26px}',
    '#apps .app-host[data-app-id="reader"] .rd-name{flex:1;min-width:0;font-size:13px;font-weight:800;color:#3a2f21;',
    '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-name{color:#e9e4db}',
    '#apps .app-host[data-app-id="reader"] .rd-prog{font-size:11px;color:#8a7358;white-space:nowrap}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-prog{color:#98a0b2}',
    '#apps .app-host[data-app-id="reader"] .rd-p{font-size:var(--rd-size,15.5px);line-height:1.95;margin:0 0 15px;',
    '  text-indent:2em;color:#33291c;word-break:break-word}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-p{color:#c9cedb}',
    '#apps .app-host[data-app-id="reader"] .rd-p.rd-first{text-indent:0;font-weight:700;font-size:calc(var(--rd-size,15.5px) + 2px);margin-bottom:20px}',
    '#apps .app-host[data-app-id="reader"] .rd-mark{background:rgba(192,139,92,.34);border-bottom:2px solid #a5744f;border-radius:3px}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-mark{background:rgba(214,163,110,.24);border-bottom-color:#c08b5c}',
    '#apps .app-host[data-app-id="reader"] .rd-hit{background:#ffe58a;color:#4a3a10;border-radius:3px}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-hit{background:#6b5a1f;color:#ffe9a8}',
    '#apps .app-host[data-app-id="reader"] .rd-selbar{position:sticky;bottom:0;z-index:7;display:none;align-items:center;',
    '  gap:7px;padding:9px 11px;margin:16px 0 0;border-radius:16px;background:rgba(58,42,28,.95);color:#fff;',
    '  box-shadow:0 10px 24px -12px rgba(0,0,0,.7)}',
    '#apps .app-host[data-app-id="reader"] .rd-selbar.show{display:flex}',
    '#apps .app-host[data-app-id="reader"] .rd-selinfo{flex:1;min-width:0;font-size:11.5px;line-height:1.5;',
    '  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '#apps .app-host[data-app-id="reader"] .rd-meta{font-size:11.5px;color:#8a7358}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-meta{color:#98a0b2}',
    '#apps .app-host[data-app-id="reader"] .rd-quote{margin:0 0 10px;padding:10px 12px;border-left:3px solid #a5744f;',
    '  border-radius:0 12px 12px 0;background:rgba(192,139,92,.14);font-size:13px;line-height:1.75;color:#4a3a26;white-space:pre-wrap}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-quote{background:rgba(214,163,110,.12);color:#ddd7cc;border-left-color:#c08b5c}',
    '#apps .app-host[data-app-id="reader"] .rd-ans{font-size:13.5px;line-height:1.8;color:#33291c;word-break:break-word}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-ans{color:#c9cedb}',
    '#apps .app-host[data-app-id="reader"] .rd-ans code{background:rgba(90,70,50,.14);padding:1px 5px;border-radius:5px;font-size:12px}',
    '#apps .app-host[data-app-id="reader"] .rd-ans pre{white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:12px;',
    '  background:rgba(90,70,50,.12);padding:10px;border-radius:12px;overflow:auto}',
    '#apps .app-host[data-app-id="reader"].rd-night .rd-ans code,#apps .app-host[data-app-id="reader"].rd-night .rd-ans pre{background:rgba(255,255,255,.08)}',
    '#apps .app-host[data-app-id="reader"] .rd-empty{text-align:center;padding:34px 16px}',
    '#apps .app-host[data-app-id="reader"] .rd-empty .rd-big{font-size:46px;line-height:1}'
  ].join('\n');

  function injectTheme(doc) {
    try {
      if (doc.getElementById(READER_CSS_ID)) return;
      var s = doc.createElement('style');
      s.id = READER_CSS_ID;
      s.textContent = READER_CSS;
      (doc.head || doc.body || doc.documentElement).appendChild(s);
    } catch (e) { /* 注入失败不影响功能 */ }
  }

  /* ---------- 纯函数：检索高亮与划线标记 ---------- */
  function markHTML(text, needles, kw) {
    var raw = String(text == null ? '' : text);
    var spans = [];
    function collect(needle, cls) {
      needle = String(needle == null ? '' : needle);
      if (!needle) return;
      var from = 0, i;
      while ((i = raw.indexOf(needle, from)) >= 0) {
        spans.push({ s: i, e: i + needle.length, cls: cls });
        from = i + needle.length;
      }
    }
    (needles || []).forEach(function (n) { collect(n, 'rd-mark'); });
    collect(kw, 'rd-hit');
    spans.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var out = '', pos = 0;
    spans.forEach(function (sp) {
      if (sp.s < pos) return;
      if (sp.s > pos) out += escHTML(raw.slice(pos, sp.s));
      out += '<span class="' + sp.cls + '">' + escHTML(raw.slice(sp.s, sp.e)) + '</span>';
      pos = sp.e;
    });
    out += escHTML(raw.slice(pos));
    return out;
  }
  function escHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function looksBinary(t) {
    var s = String(t || '').slice(0, 4000);
    if (!s) return false;
    var bad = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0) return true;
      if (c < 9 || (c > 13 && c < 32)) bad++;
    }
    return bad > s.length * 0.05;
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function createApp(phone) {
    var U = phone.utils;
    injectTheme(document);

    var LIMIT_CHARS = 1200000;   /* 单本书最多保存的字符数（本地存储有限） */
    var PAGE_STEP = 60;          /* 每次渲染的段落数 */
    var SEARCH_MAX = 200;        /* 检索最多返回的命中数 */

    function mount(phoneApi, root, ctx) {
      var S = {
        view: 'shelf', bookId: null, limit: PAGE_STEP, query: '', hits: [],
        jumpTo: -1, sel: '', panel: null, list: '', busy: false, keepScroll: false
      };
      var runtime = {};                      /* 段落缓存（只放内存，不写存档） */
      var books = [];
      var pane = null;                       /* 当前视图的内容容器 */
      var ui = ctx.store.get('ui', null) || {};
      var theme = (ui.theme === 'night' || ui.theme === 'day') ? ui.theme
        : ((new Date().getHours() >= 19 || new Date().getHours() < 7) ? 'night' : 'day');
      var fontSize = Number(ui.fontSize) > 0 ? Number(ui.fontSize) : 15.5;
      var scrollTimer = null;

      /* ---------------- 存档 ---------------- */
      function loadBooks() {
        var raw = ctx.store.get('books', []);
        var list = [];
        if (Object.prototype.toString.call(raw) === '[object Array]') {
          raw.forEach(function (b) {
            if (!b || typeof b !== 'object' || typeof b.text !== 'string') return;
            list.push({
              id: b.id || U.uid('book'),
              name: String(b.name || '未命名'),
              text: b.text,
              size: Number(b.size) || b.text.length,
              added: Number(b.added) || Date.now(),
              at: Number(b.at) || Date.now(),
              progress: b.progress && typeof b.progress === 'object' ? { pi: Number(b.progress.pi) || 0, pct: Number(b.progress.pct) || 0 } : { pi: 0, pct: 0 },
              marks: Object.prototype.toString.call(b.marks) === '[object Array]' ? b.marks : [],
              sums: Object.prototype.toString.call(b.sums) === '[object Array]' ? b.sums : []
            });
          });
        }
        return list;
      }
      function saveBooks() {
        var json = JSON.stringify(books);
        if (json.length > 3200000) phone.toast('书籍占用接近本地存储上限（约 3 MB），建议删掉不再看的书', 'bad');
        ctx.store.set('books', books);
      }
      function saveUi() {
        ctx.store.set('ui', { theme: theme, fontSize: fontSize });
      }
      books = loadBooks();
      function findBook(id) {
        for (var i = 0; i < books.length; i++) if (books[i].id === id) return books[i];
        return null;
      }
      function parasOf(book) {
        if (!book) return [];
        if (!runtime[book.id]) runtime[book.id] = U.splitParagraphs(book.text);
        return runtime[book.id];
      }
      function cur() { return findBook(S.bookId); }

      /* ---------------- 渲染入口 ---------------- */
      function render() {
        var host = root.parentNode;
        if (host && host.classList) host.classList.toggle('rd-night', theme === 'night');
        root.style.setProperty('--rd-size', fontSize + 'px');
        /* 「继续加载」这类重绘要保住当前滚动位置，其它情况回到顶部 */
        var keep = S.keepScroll ? (Number(root.scrollTop) || 0) : 0;
        S.keepScroll = false;
        root.innerHTML = '';
        /* pane 承载正文/列表（自带左右留白）；工具条由 renderRead 直接挂在 root 上以便吸顶 */
        pane = U.el('div', 'rd-pane');
        if (S.view === 'shelf') renderShelf();
        else if (S.view === 'panel') renderPanel();
        else if (S.view === 'marks') renderList('marks');
        else if (S.view === 'sums') renderList('sums');
        else renderRead();
        root.appendChild(pane);
        if (keep) root.scrollTop = keep;
      }
      function go(view) { S.view = view; render(); }

      /* ---------------- 书架 ---------------- */
      function renderShelf() {
        ctx.setTitle('阅读器');
        var total = 0;
        books.forEach(function (b) { total += b.text.length; });

        var head = U.el('div', 'ui-row');
        head.style.justifyContent = 'space-between';
        head.style.marginBottom = '10px';
        head.appendChild(U.el('div', 'ui-muted', books.length
          ? ('共 ' + books.length + ' 本 · 约 ' + (total / 10000).toFixed(1) + ' 万字')
          : '书架还是空的'));
        var bImp = U.el('button', 'ui-btn', '＋ 导入文件');
        bImp.style.padding = '8px 13px'; bImp.style.fontSize = '12.5px';
        bImp.addEventListener('click', importFile);
        head.appendChild(bImp);
        pane.appendChild(head);

        pane.appendChild(U.el('div', 'ui-hint',
          '支持常见纯文本：txt、md、csv、json、log、srt、html（会自动去标签）等。' +
          'PDF / Word / EPUB 这类二进制格式不做兼容，请不要导入。内容全部存在本机浏览器里。'));

        if (!books.length) {
          var empty = U.el('div', 'rd-empty');
          empty.appendChild(U.el('div', 'rd-big', '📖'));
          var t = U.el('div', null, '还没有书');
          t.style.fontWeight = '800'; t.style.margin = '10px 0 4px';
          empty.appendChild(t);
          empty.appendChild(U.el('div', 'ui-muted', '点右上角「＋ 导入文件」，选一个 txt 试试；导入后可以检索、总结、划线询问。'));
          pane.appendChild(empty);
          return;
        }

        var ul = U.el('div', 'ui-list');
        books.forEach(function (b) {
          var li = U.el('div', 'li');
          li.style.cursor = 'pointer';
          li.addEventListener('click', function () { openBook(b.id); });

          var main = U.el('div', 'li-main');
          main.appendChild(U.el('b', null, b.name));
          var pct = b.text.length ? Math.min(100, Math.round((b.progress.pct || 0))) : 0;
          main.appendChild(U.el('small', null,
            fmtSize(b.size) + ' · ' + (b.text.length / 10000).toFixed(1) + ' 万字 · 已读 ' + pct + '%' +
            (b.marks.length ? ' · 划线 ' + b.marks.length : '') +
            (b.sums.length ? ' · 总结 ' + b.sums.length : '')));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          acts.style.gap = '5px';
          var bRead = U.el('button', 'ui-btn ghost', b.progress.pi > 0 ? '继续' : '阅读');
          bRead.style.padding = '6px 10px'; bRead.style.fontSize = '11.5px';
          bRead.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); openBook(b.id); });
          var bDel = U.el('button', 'ui-btn warn', '删除');
          bDel.style.padding = '6px 9px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); delBook(b); });
          acts.appendChild(bRead); acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);
        });
        pane.appendChild(ul);
        pane.appendChild(U.el('div', 'ui-muted', '提示：在正文里用鼠标划选一段文字，底部会出现「划线询问」，可以针对划选的内容向 AI 提问。'));
      }

      /* ---------------- 导入 / 删除 ---------------- */
      function importFile() {
        if (S.busy) return;
        S.busy = true;
        U.readTextFile().then(function (f) {
          S.busy = false;
          if (!f) return;
          if (!f.text || !f.text.trim()) {
            return phone.alert('这个文件没有可读文本', '如果是 PDF / Word / EPUB 等二进制格式，本阅读器不支持。');
          }
          var go = function () {
            var text = U.cleanImportText(f.name, f.text);
            var truncated = false;
            if (text.length > LIMIT_CHARS) { text = text.slice(0, LIMIT_CHARS); truncated = true; }
            var book = {
              id: U.uid('book'), name: f.name, text: text, size: f.size || text.length,
              added: Date.now(), at: Date.now(), progress: { pi: 0, pct: 0 }, marks: [], sums: []
            };
            books.unshift(book);
            saveBooks();
            if (truncated) phone.alert('文件比较长', '受浏览器本地存储限制，只保存了前 ' + LIMIT_CHARS + ' 个字符（约 ' + (LIMIT_CHARS / 10000).toFixed(0) + ' 万字）。');
            phone.toast('已导入：' + book.name, 'ok');
            openBook(book.id);
          };
          if (looksBinary(f.text)) {
            phone.confirm('这个文件看起来不是纯文本', '可能是 PDF / Word / EPUB 之类的二进制格式，强行当文本打开会是乱码。仍然要导入吗？')
              .then(function (yes) { if (yes) go(); });
            return;
          }
          go();
        });
      }
      function delBook(b) {
        phone.confirm('删除《' + b.name + '》？', '整本书、划线记录与总结都会一起删掉，无法恢复。').then(function (yes) {
          if (!yes) return;
          books = books.filter(function (x) { return x.id !== b.id; });
          delete runtime[b.id];
          if (S.bookId === b.id) { S.bookId = null; S.view = 'shelf'; }
          saveBooks();
          phone.toast('已删除', 'ok');
          render();
        });
      }

      /* ---------------- 打开一本书 ---------------- */
      function openBook(id) {
        var b = findBook(id);
        if (!b) return;
        S.bookId = id;
        S.query = ''; S.hits = []; S.sel = ''; S.panel = null; S.list = '';
        var pi = Math.max(0, Number(b.progress.pi) || 0);
        S.limit = Math.max(PAGE_STEP, Math.min(pi + 20, parasOf(b).length));
        S.jumpTo = pi > 0 ? pi : -1;
        go('read');
      }
      function saveProgress() {
        var b = cur();
        if (!b || S.view !== 'read') return;
        var total = parasOf(b).length || 1;
        var pi = visiblePi();
        /* 位置没变就不重复写存档（大部头每次写 1 MB 的 JSON 会很卡） */
        if (b.progress && Number(b.progress.pi) === pi && Number(b.progress.pct) === Math.round(pi / total * 100)) return;
        b.progress = { pi: pi, pct: Math.round(pi / total * 100) };
        b.at = Date.now();
        saveBooks();
      }
      function visiblePi() {
        var list = U.$$('.rd-p', root);
        var top = Number(root.scrollTop) || 0;
        for (var i = 0; i < list.length; i++) {
          var off = Number(list[i].offsetTop) || 0;
          if (off >= top) return Number(list[i].dataset.pi) || 0;
        }
        return list.length ? (Number(list[list.length - 1].dataset.pi) || 0) : 0;
      }
      function scrollToPara(pi) {
        var list = U.$$('.rd-p', root);
        for (var i = 0; i < list.length; i++) {
          if (Number(list[i].dataset.pi) === Number(pi)) {
            if (typeof list[i].scrollIntoView === 'function') list[i].scrollIntoView({ block: 'start' });
            else if (typeof root.scrollTo === 'function') root.scrollTo({ top: Number(list[i].offsetTop) || 0 });
            return true;
          }
        }
        return false;
      }

      /* ---------------- 正文 ---------------- */
      function renderRead() {
        var b = cur();
        if (!b) { S.view = 'shelf'; return renderShelf(); }
        ctx.setTitle('阅读');

        var tools = U.el('div', 'rd-tools');

        /* 第一行：返回 / 书名 / 主题 / 字号 */
        var r1 = U.el('div', 'ui-row');
        var bBack = U.el('button', 'ui-btn ghost', '‹ 书架');
        bBack.style.padding = '6px 10px'; bBack.style.fontSize = '12px';
        bBack.addEventListener('click', function () { saveProgress(); S.bookId = null; go('shelf'); });
        r1.appendChild(bBack);
        var nm = U.el('div', 'rd-name', b.name);
        nm.title = b.name;
        r1.appendChild(nm);
        var bTheme = U.el('button', 'ui-btn ghost', theme === 'night' ? '🌙' : '☀️');
        bTheme.style.padding = '6px 9px'; bTheme.style.fontSize = '13px';
        bTheme.title = '切换日间 / 夜间模式';
        bTheme.addEventListener('click', function () {
          theme = theme === 'night' ? 'day' : 'night';
          saveUi(); render();
          phone.toast(theme === 'night' ? '已切到夜间模式' : '已切到日间模式', 'ok');
        });
        r1.appendChild(bTheme);
        var bMinus = U.el('button', 'ui-btn ghost', 'A-');
        bMinus.style.padding = '6px 8px'; bMinus.style.fontSize = '12px';
        bMinus.addEventListener('click', function () { fontSize = Math.max(12, fontSize - 1); saveUi(); render(); });
        var bPlus = U.el('button', 'ui-btn ghost', 'A+');
        bPlus.style.padding = '6px 8px'; bPlus.style.fontSize = '12px';
        bPlus.addEventListener('click', function () { fontSize = Math.min(24, fontSize + 1); saveUi(); render(); });
        r1.appendChild(bMinus); r1.appendChild(bPlus);
        tools.appendChild(r1);

        /* 第二行：检索 */
        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '7px';
        var qIn = U.el('input', 'ui-field');
        qIn.type = 'text';
        qIn.placeholder = '在本书里检索…';
        qIn.value = S.query;
        qIn.style.flex = '1';
        var doSearch = function () { search(qIn.value); };
        qIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
        var bFind = U.el('button', 'ui-btn ghost', '检索');
        bFind.style.padding = '8px 12px'; bFind.style.fontSize = '12.5px';
        bFind.addEventListener('click', doSearch);
        r2.appendChild(qIn); r2.appendChild(bFind);
        tools.appendChild(r2);

        /* 第三行：划线 / 总结 / 复制 / 进度 */
        var r3 = U.el('div', 'ui-row');
        r3.style.marginTop = '7px';
        r3.style.flexWrap = 'wrap';
        var bMarks = U.el('button', 'ui-btn ghost', '划线 ' + b.marks.length);
        bMarks.style.padding = '6px 10px'; bMarks.style.fontSize = '11.5px';
        bMarks.addEventListener('click', function () { go('marks'); });
        var bSums = U.el('button', 'ui-btn ghost', '总结 ' + b.sums.length);
        bSums.style.padding = '6px 10px'; bSums.style.fontSize = '11.5px';
        bSums.addEventListener('click', function () { go('sums'); });
        var bSum = U.el('button', 'ui-btn ghost', 'AI 总结全文');
        bSum.style.padding = '6px 10px'; bSum.style.fontSize = '11.5px';
        bSum.addEventListener('click', function () { doSummary('all'); });
        var bCopy = U.el('button', 'ui-btn ghost', '复制全文');
        bCopy.style.padding = '6px 10px'; bCopy.style.fontSize = '11.5px';
        bCopy.addEventListener('click', function () {
          U.copy(b.text).then(function (ok) {
            phone.toast(ok ? '已复制全文（' + b.text.length + ' 字）' : '复制失败，请在正文里手动选中复制', ok ? 'ok' : 'bad');
          });
        });
        r3.appendChild(bMarks); r3.appendChild(bSums); r3.appendChild(bSum); r3.appendChild(bCopy);
        tools.appendChild(r3);

        var paras = parasOf(b);
        var meta = U.el('div', 'ui-row');
        meta.style.marginTop = '6px';
        meta.style.justifyContent = 'space-between';
        var pct = paras.length ? Math.round(Math.min(paras.length, S.limit) / paras.length * 100) : 0;
        meta.appendChild(U.el('div', 'rd-prog', '共 ' + paras.length + ' 段 · 已载入 ' + Math.min(paras.length, S.limit) + ' 段（' + pct + '%）'));
        var bJump = U.el('button', 'ui-btn ghost', '回到上次位置');
        bJump.style.padding = '4px 9px'; bJump.style.fontSize = '11px';
        bJump.addEventListener('click', function () {
          var pi = b.progress.pi || 0;
          if (pi + 1 > S.limit) S.limit = Math.min(paras.length, pi + PAGE_STEP);
          render();
          scrollToPara(pi);
          phone.toast('已跳到第 ' + (pi + 1) + ' 段');
        });
        meta.appendChild(bJump);
        tools.appendChild(meta);
        root.appendChild(tools);

        /* 检索结果 */
        if (S.query && S.hits.length) {
          var box = U.el('div', 'ui-card');
          box.style.marginBottom = '12px';
          box.appendChild(U.el('div', 'ui-label', '检索「' + S.query + '」：命中 ' + S.hits.length + ' 处'));
          S.hits.slice(0, 30).forEach(function (h) {
            var item = U.el('div');
            item.style.padding = '7px 0';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px dashed rgba(90,70,50,.2)';
            var label = U.el('div', 'rd-meta', '第 ' + (h.pi + 1) + ' 段');
            var body = U.el('div');
            body.style.fontSize = '12.5px';
            body.style.lineHeight = '1.6';
            body.innerHTML = markHTML(snippet(h.text, h.at, S.query.length), null, S.query);
            item.appendChild(label); item.appendChild(body);
            item.addEventListener('click', function () {
              if (h.pi + 1 > S.limit) S.limit = Math.min(paras.length, h.pi + 1 + PAGE_STEP);
              S.jumpTo = h.pi;
              render();
              scrollToPara(h.pi);
            });
            box.appendChild(item);
          });
          if (S.hits.length > 30) box.appendChild(U.el('div', 'ui-muted', '（只列出前 30 处，输入更长的关键词可以缩小范围）'));
          pane.appendChild(box);
        } else if (S.query) {
          pane.appendChild(U.el('div', 'ui-hint', '没有检索到「' + S.query + '」。'));
        }

        /* 正文段落 */
        var marks = b.marks.map(function (m) { return m.text; });
        var n = Math.min(paras.length, S.limit);
        for (var i = 0; i < n; i++) {
          var p = U.el('p', 'rd-p' + (i === 0 ? ' rd-first' : ''));
          p.dataset.pi = i;
          p.innerHTML = markHTML(paras[i], marks, S.query);
          pane.appendChild(p);
        }
        if (n < paras.length) {
          var more = U.el('button', 'ui-btn ghost', '继续加载下面的 ' + Math.min(PAGE_STEP, paras.length - n) + ' 段（还有 ' + (paras.length - n) + ' 段）');
          more.style.width = '100%';
          more.style.marginTop = '6px';
          more.addEventListener('click', function () {
            saveProgress();
            S.keepScroll = true;
            S.limit = Math.min(paras.length, S.limit + PAGE_STEP);
            render();
          });
          pane.appendChild(more);
        } else {
          var end = U.el('div', 'ui-muted', '—— 全文完（共 ' + paras.length + ' 段） ——');
          end.style.textAlign = 'center';
          end.style.margin = '14px 0 6px';
          pane.appendChild(end);
        }

        /* 底部：划选提示条 */
        var bar = U.el('div', 'rd-selbar');
        bar.style.display = 'none';
        pane.appendChild(bar);
        renderSelBar();

        if (S.jumpTo >= 0) {
          var target = S.jumpTo;
          S.jumpTo = -1;
          setTimeout(function () { scrollToPara(target); }, 40);
        }
      }

      function snippet(text, at, len) {
        var s = Math.max(0, at - 24);
        var e = Math.min(text.length, at + len + 40);
        return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
      }

      function search(q) {
        q = String(q || '').trim();
        S.query = q;
        S.hits = [];
        if (q) {
          var b = cur();
          var paras = parasOf(b);
          var low = q.toLowerCase();
          for (var i = 0; i < paras.length && S.hits.length < SEARCH_MAX; i++) {
            var at = paras[i].toLowerCase().indexOf(low);
            if (at >= 0) S.hits.push({ pi: i, text: paras[i], at: at });
          }
          if (S.hits.length) S.jumpTo = S.hits[0].pi;
        }
        render();
        if (q && !S.hits.length) phone.toast('没有找到「' + q + '」', 'bad');
        else if (q) phone.toast('找到 ' + S.hits.length + ' 处', 'ok');
      }

      /* ---------------- 划选 ---------------- */
      function renderSelBar() {
        var bar = U.$('.rd-selbar', root);
        if (!bar) return;
        bar.innerHTML = '';
        if (!S.sel) { bar.classList.remove('show'); bar.style.display = 'none'; return; }
        bar.classList.add('show');
        bar.style.display = 'flex';
        bar.appendChild(U.el('div', 'rd-selinfo', '已选中 ' + S.sel.length + ' 字：' + S.sel.slice(0, 60) + (S.sel.length > 60 ? '…' : '')));
        var bAsk = U.el('button', 'ui-btn', '划线询问');
        bAsk.style.padding = '7px 11px'; bAsk.style.fontSize = '12px';
        bAsk.addEventListener('click', openAsk);
        var bOnly = U.el('button', 'ui-btn ghost', '仅划线');
        bOnly.style.padding = '7px 10px'; bOnly.style.fontSize = '12px';
        bOnly.addEventListener('click', function () { addMark('', ''); render(); });
        var bNo = U.el('button', 'ui-btn ghost', '✕');
        bNo.style.padding = '7px 10px'; bNo.style.fontSize = '12px';
        bNo.addEventListener('click', clearSel);
        bar.appendChild(bAsk); bar.appendChild(bOnly); bar.appendChild(bNo);
      }
      function clearSel() {
        S.sel = '';
        try { if (window.getSelection) { var s = window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); } } catch (e) { }
        renderSelBar();
      }
      function captureSelection() {
        if (S.view !== 'read' || S.panel) return;
        var t = '';
        try { if (window.getSelection) t = String(window.getSelection().toString() || ''); } catch (e) { t = ''; }
        t = t.replace(/\s+/g, ' ').trim().slice(0, 2000);
        if (t === S.sel) return;
        S.sel = t;
        renderSelBar();
      }
      function locatePi(q) {
        var paras = parasOf(cur());
        if (q) for (var i = 0; i < paras.length; i++) if (paras[i].indexOf(q) >= 0) return i;
        return visiblePi();
      }
      function addMark(q, a) {
        var b = cur();
        if (!b || !S.sel) return;
        var pi = locatePi(S.sel);
        b.marks.push({ pi: pi, text: S.sel, q: q || '', a: a || '', at: Date.now() });
        saveBooks();
        S.jumpTo = pi;                 /* 重绘后停在划线所在的那一段 */
        clearSel();
        phone.toast('已划线：' + S.sel.slice(0, 16) + (S.sel.length > 16 ? '…' : ''), 'ok');
      }

      /* ---------------- 划线询问 / 总结面板 ---------------- */
      function openAsk() {
        if (!S.sel) return;
        S.panel = { kind: 'ask', quote: S.sel, pi: locatePi(S.sel), q: '', a: '', busy: false, err: '', at: Date.now() };
        go('panel');
      }
      function doSummary(scope) {
        var b = cur();
        if (!b) return;
        if (scope === 'sel' && !S.sel) return phone.toast('先在正文里划选一段内容', 'bad');
        var api = phone.apis.resolve('chat');
        if (!api) {
          S.panel = {
            kind: 'sum', scope: scope, a: '', busy: false, at: Date.now(),
            err: '还没有配置对话接口。请到「设置 → API 管理」里添加一个对话模型（本阅读器不再单独保存接口）。'
          };
          return go('panel');
        }
        var text;
        if (scope === 'sel') text = S.sel;
        else {
          text = b.text;
          if (text.length > 12000) text = text.slice(0, 9000) + '\n\n……（中间省略）……\n\n' + text.slice(-2000);
        }
        S.panel = { kind: 'sum', scope: scope, quote: scope === 'sel' ? S.sel : '', a: '', busy: true, err: '', at: Date.now(), api: api.name };
        go('panel');
        phone.apis.ask('请总结下面的内容（书名《' + b.name + '》）：\n\n' + text, {
          system: '你是中文阅读助手。请输出：1) 一句话主旨；2) 5~8 条要点（Markdown 列表）；3) 3 个值得继续追问的问题。'
        }).then(function (ans) {
          if (!S.panel || S.panel.kind !== 'sum') return;
          S.panel.busy = false; S.panel.a = ans;
          render();
        }).catch(function (e) {
          if (!S.panel || S.panel.kind !== 'sum') return;
          S.panel.busy = false; S.panel.err = (e && e.message) ? e.message : String(e);
          render();
        });
      }
      function sendAsk() {
        var p = S.panel;
        if (!p || p.kind !== 'ask' || p.busy) return;
        var q = String(p.q || '').trim();
        if (!q) return phone.toast('先写一句想问的问题', 'bad');
        var api = phone.apis.resolve('chat');
        if (!api) { p.err = '还没有配置对话接口。请到「设置 → API 管理」里添加一个对话模型（本阅读器不再单独保存接口）。'; return render(); }
        var b = cur();
        p.busy = true; p.err = ''; p.a = '';
        render();
        var paras = parasOf(b);
        var context = paras.slice(Math.max(0, p.pi - 1), p.pi + 2).join('\n').slice(0, 1500);
        var text = '我正在读《' + b.name + '》。\n\n【我划线选中的内容】\n' + p.quote +
          '\n\n【附近上下文】\n' + context + '\n\n【我的问题】\n' + q;
        phone.apis.ask(text, {
          system: '你是一位博学的阅读助手。针对读者划线的内容回答问题：先直接回答，再补必要的背景或不同看法，中文分点，简洁。'
        }).then(function (ans) {
          if (!S.panel || S.panel.kind !== 'ask') return;
          p.busy = false; p.a = ans;
          b.marks.push({ pi: p.pi, text: p.quote, q: q, a: ans, at: Date.now() });
          saveBooks();
          render();
        }).catch(function (e) {
          if (!S.panel || S.panel.kind !== 'ask') return;
          p.busy = false; p.err = (e && e.message) ? e.message : String(e);
          render();
        });
      }
      function renderPanel() {
        var p = S.panel;
        if (!p) { S.view = 'read'; return renderRead(); }
        ctx.setTitle(p.kind === 'ask' ? '划线询问' : 'AI 总结');
        var b = cur();

        var back = U.el('div', 'ui-row');
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回正文');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () {
          if (p.kind === 'ask' && !p.q && !p.a) clearSel();
          S.panel = null;
          S.jumpTo = p.pi != null ? p.pi : -1;
          go('read');
        });
        back.appendChild(bBack);
        if (b) {
          var bOpen = U.el('button', 'ui-btn ghost', '去「设置 → API 管理」');
          bOpen.style.padding = '8px 12px'; bOpen.style.fontSize = '11.5px';
          bOpen.addEventListener('click', function () { phone.openApp('settings'); });
          if (p.err) back.appendChild(bOpen);
        }
        pane.appendChild(back);

        if (p.quote) {
          pane.appendChild(U.el('div', 'ui-label', p.kind === 'ask' ? '划选的内容' : '总结范围'));
          pane.appendChild(U.el('div', 'rd-quote', p.quote));
        } else if (p.kind === 'sum') {
          pane.appendChild(U.el('div', 'ui-muted', '范围：' + (p.scope === 'sel' ? '划选内容' : '全文（超长时取开头 + 结尾）')));
        }

        if (p.kind === 'ask') {
          pane.appendChild(U.el('div', 'ui-label', '你想问什么'));
          var ta = U.el('textarea', 'ui-field');
          ta.style.minHeight = '70px';
          ta.placeholder = '例如：这句话是什么意思？作者为什么这么说？有哪些反例？';
          ta.value = p.q || '';
          ta.addEventListener('input', function () { p.q = ta.value; });
          pane.appendChild(ta);
          var row = U.el('div', 'ui-row');
          row.style.marginTop = '10px';
          var bSend = U.el('button', 'ui-btn', p.busy ? '提问中…' : '发送给 AI');
          bSend.disabled = !!p.busy;
          bSend.addEventListener('click', function () { p.q = ta.value; sendAsk(); });
          var bOnly = U.el('button', 'ui-btn ghost', '只划线，不提问');
          bOnly.addEventListener('click', function () { addMark('', ''); S.panel = null; go('read'); });
          row.appendChild(bSend); row.appendChild(bOnly);
          pane.appendChild(row);
        }

        if (p.busy) {
          var wait = U.el('div', 'ui-hint');
          wait.style.marginTop = '12px';
          wait.textContent = '正在请求对话接口' + (p.api ? '（' + p.api + '）' : '') + '，请稍候…';
          pane.appendChild(wait);
        }
        if (p.err) {
          var er = U.el('div', 'ui-hint');
          er.style.marginTop = '12px';
          er.style.background = 'rgba(255,122,138,.16)';
          er.style.borderColor = 'rgba(255,122,138,.5)';
          er.style.color = theme === 'night' ? '#ffd7dd' : '#7a1024';
          er.textContent = p.err;
          pane.appendChild(er);
        }
        if (p.a) {
          pane.appendChild(U.el('div', 'ui-label', 'AI 的回答'));
          var ans = U.el('div', 'rd-ans');
          ans.innerHTML = U.md(p.a);
          pane.appendChild(ans);
          var row2 = U.el('div', 'ui-row');
          row2.style.marginTop = '12px';
          var bCopy = U.el('button', 'ui-btn ghost', '复制回答');
          bCopy.addEventListener('click', function () {
            U.copy(p.a).then(function (ok) { phone.toast(ok ? '已复制回答' : '复制失败，请手动选择复制', ok ? 'ok' : 'bad'); });
          });
          row2.appendChild(bCopy);
          if (p.kind === 'sum') {
            var bSave = U.el('button', 'ui-btn', '保存到本书');
            bSave.addEventListener('click', function () {
              if (!b) return;
              b.sums.push({ at: Date.now(), title: (p.scope === 'sel' ? '选中内容总结' : '全文总结'), text: p.a, quote: p.quote || '' });
              saveBooks();
              phone.toast('总结已保存（共 ' + b.sums.length + ' 条）', 'ok');
            });
            row2.appendChild(bSave);
          }
          if (p.kind === 'ask') {
            row2.appendChild(U.el('div', 'ui-muted', '这条问答已经作为划线记录保存，可在「划线」列表里回看。'));
          }
          pane.appendChild(row2);
        }
      }

      /* ---------------- 划线 / 总结 列表 ---------------- */
      function renderList(kind) {
        var b = cur();
        if (!b) { S.view = 'shelf'; return renderShelf(); }
        var isMarks = kind === 'marks';
        ctx.setTitle(isMarks ? '划线记录' : '总结记录');
        var items = isMarks ? b.marks : b.sums;

        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回正文');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { S.jumpTo = -1; go('read'); });
        back.appendChild(bBack);
        if (isMarks && S.sel) {
          var bAdd = U.el('button', 'ui-btn', '把刚才划选的内容存下来');
          bAdd.style.padding = '8px 12px'; bAdd.style.fontSize = '12px';
          bAdd.addEventListener('click', function () { addMark('', ''); render(); });
          back.appendChild(bAdd);
        }
        pane.appendChild(back);

        if (!items.length) {
          pane.appendChild(U.el('div', 'ui-hint', isMarks
            ? '还没有划线。在正文里用鼠标划选一段文字，底部会出现「划线询问」。'
            : '还没有总结。回到正文点「AI 总结全文」，或划选一段后总结选中内容。'));
          return;
        }

        var ul = U.el('div', 'ui-list');
        items.slice().reverse().forEach(function (m) {
          var li = U.el('div', 'li');
          li.style.cursor = 'pointer';
          li.style.alignItems = 'flex-start';
          li.addEventListener('click', function () {
            S.jumpTo = Number(m.pi) || 0;
            if (S.jumpTo + 1 > S.limit) S.limit = Math.min(parasOf(b).length, S.jumpTo + PAGE_STEP);
            go('read');
          });
          var main = U.el('div', 'li-main');
          main.appendChild(U.el('b', null, isMarks ? (m.text ? m.text.slice(0, 40) : '（划线）') : (m.title || '总结')));
          if (isMarks && m.q) main.appendChild(U.el('small', null, '问：' + String(m.q).slice(0, 40)));
          if (!isMarks) main.appendChild(U.el('small', null, String(m.text || '').replace(/\s+/g, ' ').slice(0, 60) + '…'));
          main.appendChild(U.el('small', null, '第 ' + ((Number(m.pi) || 0) + 1) + ' 段 · ' + new Date(m.at || Date.now()).toLocaleString()));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          var bDel = U.el('button', 'ui-btn warn', '删');
          bDel.style.padding = '6px 10px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (isMarks) b.marks = b.marks.filter(function (x) { return x !== m; });
            else b.sums = b.sums.filter(function (x) { return x !== m; });
            saveBooks();
            render();
          });
          acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);

          if (isMarks && m.a) {
            var det = U.el('details');
            det.style.padding = '0 12px 10px';
            var sum = U.el('summary', null, '查看 AI 的回答');
            sum.style.fontSize = '12px';
            sum.style.cursor = 'pointer';
            sum.style.color = 'var(--ink-soft)';
            det.appendChild(sum);
            var ans = U.el('div', 'rd-ans');
            ans.style.marginTop = '8px';
            ans.innerHTML = U.md(m.a);
            det.appendChild(ans);
            ul.appendChild(det);
          }
        });
        pane.appendChild(ul);
      }

      /* ---------------- 事件 ---------------- */
      ['mouseup', 'touchend', 'keyup'].forEach(function (t) {
        root.addEventListener(t, function (e) {
          /* 点到底部询问条 / 按钮 / 输入框上时不要重新取选区：
             那一下 mouseup 往往已经把选区收起来了，会误清掉刚划好的内容 */
          var tg = e && e.target;
          if (tg && tg.closest && tg.closest('.rd-selbar, button, input, textarea, select, .ui-btn')) return;
          setTimeout(captureSelection, 12);
        });
      });
      root.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(saveProgress, 1200);
      }, { passive: true });

      ctx.onCleanup(function () {
        if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
        saveProgress();
        try { if (window.getSelection && window.getSelection().removeAllRanges) window.getSelection().removeAllRanges(); } catch (e) { }
      });

      /* 自己管内外边距：正文用 pane 的留白，工具条要能贴着顶部吸住 */
      ctx.setBodyPadding('0');
      render();
    }

    return {
      id: 'reader',
      name: '阅读器',
      icon: 'svg:reader',
      desc: '导入 txt 等文本，检索 / 总结 / 划线询问',
      order: 22,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'reader', createApp: createApp, code: '' });
})();
