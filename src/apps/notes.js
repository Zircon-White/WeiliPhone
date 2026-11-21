/* ============================================================
   内置应用 · 便签（随手记事，本地存档，纯代码实现）
   摩卡咖啡色系：整体换色只作用于便签自己的窗口
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var NOTES_CSS_ID = 'notes-mocha-css';
  var NOTES_CSS = [
    '/* 摩卡咖啡色系（只作用于 notes 应用窗口，不影响其它应用） */',
    '#apps .app-host[data-app-id="notes"]{background:linear-gradient(180deg,#fdf8f3 0%,#f0e2d5 100%)}',
    '#apps .app-host[data-app-id="notes"] .app-nav{background:#f4e8dd;border-bottom-color:rgba(111,78,55,.16)}',
    '#apps .app-host[data-app-id="notes"] .nav-btn{background:rgba(111,78,55,.10);color:#4a2f1d}',
    '#apps .app-host[data-app-id="notes"] .nav-title{color:#3f2716}',
    '#apps .app-host[data-app-id="notes"] .ui-card{background:#fffaf5;border-color:rgba(111,78,55,.14);box-shadow:0 10px 24px -18px rgba(74,47,29,.55)}',
    '#apps .app-host[data-app-id="notes"] .ui-list .li{background:#fffaf5;border-color:rgba(111,78,55,.14)}',
    '#apps .app-host[data-app-id="notes"] .ui-btn{background:#8a5a3b;color:#fff6ee;box-shadow:0 6px 14px -8px rgba(90,58,41,.9)}',
    '#apps .app-host[data-app-id="notes"] .ui-btn.ghost{background:rgba(111,78,55,.10);color:#5b3a29;box-shadow:none}',
    '#apps .app-host[data-app-id="notes"] .ui-btn.warn{background:#b4523f;color:#fff2ec}',
    '#apps .app-host[data-app-id="notes"] .ui-field{background:#fffdfa;border-color:rgba(111,78,55,.22);color:#3f2716}',
    '#apps .app-host[data-app-id="notes"] .ui-field:focus{border-color:#8a5a3b;box-shadow:0 0 0 3px rgba(138,90,59,.18)}',
    '#apps .app-host[data-app-id="notes"] .ui-label,#apps .app-host[data-app-id="notes"] .ui-muted{color:#8a6a52}',
    '#apps .app-host[data-app-id="notes"] .ui-hint{background:rgba(192,139,92,.16);border-color:rgba(192,139,92,.45);color:#6b4326}',
    '#apps .app-host[data-app-id="notes"] .ui-list .li b{color:#3f2716}',
    '#apps .app-host[data-app-id="notes"] .ui-list .li small{color:#8a6a52}',
    '#apps .app-host[data-app-id="notes"] .nt-dot{width:6px;height:40px;flex:0 0 auto;border-radius:5px;background:linear-gradient(180deg,#c08b5c,#5b3a29)}',
    '#apps .app-host[data-app-id="notes"] .nt-cup{font-size:42px;line-height:1}',
    '/* 排序控制条 */',
    '#apps .app-host[data-app-id="notes"] .nt-sort{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px}',
    '#apps .app-host[data-app-id="notes"] .nt-sort .ui-btn{padding:6px 10px;font-size:11.5px}',
    '#apps .app-host[data-app-id="notes"] .nt-sort-on{outline:2px solid rgba(138,90,59,.45);outline-offset:1px}'
  ].join('\n');

  function injectTheme(doc) {
    try {
      if (doc.getElementById(NOTES_CSS_ID)) return;
      var s = doc.createElement('style');
      s.id = NOTES_CSS_ID;
      s.textContent = NOTES_CSS;
      (doc.head || doc.body || doc.documentElement).appendChild(s);
    } catch (e) { /* 注入失败不影响功能 */ }
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function createApp(phone) {
    var U = phone.utils;
    injectTheme(document);

    function fullTime(ts) {
      var d = new Date(ts || Date.now());
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
        ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function shortTime(ts) {
      var d = Date.now() - (ts || 0);
      if (d < 60000) return '刚刚';
      if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
      if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
      if (d < 86400000 * 7) return Math.floor(d / 86400000) + ' 天前';
      return fullTime(ts);
    }
    function firstLine(body) {
      var s = String(body || '').replace(/\r/g, '').split('\n');
      for (var i = 0; i < s.length; i++) if (s[i].trim()) return s[i].trim();
      return '';
    }
    function plainPreview(body, n) {
      return String(body || '').replace(/\s+/g, ' ').trim().slice(0, n || 46);
    }
    function showTitle(note) {
      return (note.title && note.title.trim()) || firstLine(note.body) || '无标题';
    }
    function safeName(s) {
      return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 30);
    }

    function mount(phoneApi, root, ctx) {
      var view = 'list';     /* list | edit */
      var currentId = null;
      var saveTimer = null;
      var savedHint = null;
      var relTimer = null;
      var flushEdit = null;  /* 编辑页的「立即保存」，供一键复制等外层逻辑调用 */

      /* ---------------- 数据 ---------------- */
      /* 旧存档没有 created 字段：优先从 id（note-<base36 时间戳>-<序号>）还原创建时间，再退回 updated */
      function createdFromId(id) {
        var m = /^note-([0-9a-z]+)-/.exec(String(id || ''));
        if (!m) return 0;
        var t = parseInt(m[1], 36);
        return isFinite(t) && t > 0 ? t : 0;
      }
      function load() {
        var raw = ctx.store.get('notes', []);
        var list = [];
        if (Object.prototype.toString.call(raw) === '[object Array]') {
          raw.forEach(function (n) {
            if (!n || typeof n !== 'object') return;
            var id = n.id || U.uid('note');
            var updated = typeof n.updated === 'number' ? n.updated : Date.now();
            var created = (typeof n.created === 'number' && n.created > 0) ? n.created : (createdFromId(id) || updated);
            list.push({
              id: id,
              title: typeof n.title === 'string' ? n.title : '',
              body: typeof n.body === 'string' ? n.body : '',
              created: created,
              updated: updated
            });
          });
        }
        return list;
      }
      function save(list) { ctx.store.set('notes', list); }
      function getNote(id) {
        var list = load();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
      }

      /* ---------------- 排序：修改时间 / 创建时间 / 名称，支持正序倒序 ---------------- */
      var SORT_STORE_KEY = 'sort';
      var SORT_MODES = [
        { key: 'updated', label: '修改时间' },
        { key: 'created', label: '创建时间' },
        { key: 'name', label: '名称' }
      ];
      function sortModeOf(key) {
        for (var i = 0; i < SORT_MODES.length; i++) if (SORT_MODES[i].key === key) return SORT_MODES[i];
        return SORT_MODES[0];
      }
      function loadSort() {
        var raw = ctx.store.get(SORT_STORE_KEY, null);
        var key = (raw && typeof raw.key === 'string') ? raw.key : 'updated';
        if (sortModeOf(key).key !== key) key = 'updated';
        var dir = (raw && raw.dir === 'asc') ? 'asc' : 'desc';
        return { key: key, dir: dir };
      }
      function saveSort(s) { ctx.store.set(SORT_STORE_KEY, { key: s.key, dir: s.dir }); }
      function sortCaption(s) {
        return '按' + sortModeOf(s.key).label + (s.dir === 'asc' ? '正序' : '倒序');
      }
      function compareName(a, b) {
        try {
          if (typeof a.localeCompare === 'function') {
            return a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
          }
        } catch (e) { /* 旧浏览器不支持带参数的语言比较，退回逐字比较 */ }
        return a < b ? -1 : (a > b ? 1 : 0);
      }
      function sortNotes(list, s) {
        var arr = list.slice();
        arr.sort(function (a, b) {
          var r;
          if (s.key === 'name') r = compareName(showTitle(a), showTitle(b));
          else if (s.key === 'created') r = a.created - b.created;
          else r = a.updated - b.updated;
          if (r === 0) r = a.updated - b.updated;              /* 同一时刻按修改时间兜底，保证顺序稳定 */
          if (r === 0) r = compareName(String(a.id), String(b.id));
          return s.dir === 'asc' ? r : -r;
        });
        return arr;
      }

      /* ---------------- 渲染入口 ---------------- */
      function render() {
        if (relTimer) { clearInterval(relTimer); relTimer = null; }
        flushEdit = null;
        var acts = U.$('.nav-actions', root.parentNode);
        if (acts) acts.innerHTML = '';
        root.innerHTML = '';
        if (view === 'edit') renderEdit();
        else renderList();
      }

      /* ---------------- 列表页 ---------------- */
      function renderList() {
        if (relTimer) { clearInterval(relTimer); relTimer = null; }
        ctx.setTitle('便签');
        savedHint = null;
        root.innerHTML = '';   /* 切换排序时会直接重绘列表，先清空避免内容叠加 */
        var sort = loadSort();
        var list = sortNotes(load(), sort);

        function setSort(key, dir) {
          var next = loadSort();
          if (key) next.key = key;
          if (dir) next.dir = dir;
          saveSort(next);
          renderList();
        }

        var wrap = U.el('div');

        var head = U.el('div', 'ui-row');
        head.style.justifyContent = 'space-between';
        head.style.flexWrap = 'wrap';
        head.style.gap = '8px';
        head.style.marginBottom = '8px';
        var cnt = U.el('div', 'ui-muted', '共 ' + list.length + ' 条便签 · ' + sortCaption(sort));
        var bNew = U.el('button', 'ui-btn', '＋ 新建便签');
        bNew.style.padding = '8px 13px';
        bNew.style.fontSize = '12.5px';
        bNew.addEventListener('click', newNote);
        head.appendChild(cnt); head.appendChild(bNew);
        wrap.appendChild(head);

        /* 排序条：点一下切换排序依据（修改时间 / 创建时间 / 名称），最后那个按钮切换正序/倒序 */
        var sortBar = U.el('div', 'nt-sort');
        SORT_MODES.forEach(function (mode) {
          var on = mode.key === sort.key;
          var b = U.el('button', 'ui-btn' + (on ? ' nt-sort-on' : ' ghost'), mode.label);
          b.type = 'button';
          b.title = '按' + mode.label + '排序' + (on ? '（当前）' : '');
          b.addEventListener('click', function () {
            if (on && mode.key === sort.key) return;
            setSort(mode.key, null);
          });
          sortBar.appendChild(b);
        });
        var bDir = U.el('button', 'ui-btn ghost', sort.dir === 'asc' ? '↑ 正序' : '↓ 倒序');
        bDir.type = 'button';
        bDir.title = '点击切换正序 / 倒序';
        bDir.addEventListener('click', function () {
          setSort(null, sort.dir === 'asc' ? 'desc' : 'asc');
        });
        sortBar.appendChild(bDir);
        wrap.appendChild(sortBar);

        if (!list.length) {
          var empty = U.el('div', 'ui-card');
          empty.style.textAlign = 'center';
          empty.style.padding = '30px 18px';
          var em = U.el('div', 'nt-cup', '☕');
          empty.appendChild(em);
          var t1 = U.el('div', null, '还没有任何便签');
          t1.style.fontWeight = '800';
          t1.style.margin = '8px 0 4px';
          empty.appendChild(t1);
          empty.appendChild(U.el('div', 'ui-muted', '点上面的「新建便签」，像在咖啡馆的纸巾上随手写一句。'));
          var bNew2 = U.el('button', 'ui-btn', '开始记一条');
          bNew2.style.marginTop = '14px';
          bNew2.addEventListener('click', newNote);
          empty.appendChild(bNew2);
          wrap.appendChild(empty);
          root.appendChild(wrap);
          return;
        }

        var ul = U.el('div', 'ui-list');
        list.forEach(function (n) {
          var li = U.el('div', 'li');
          li.dataset.noteId = n.id;
          li.style.cursor = 'pointer';
          li.addEventListener('click', function () { openNote(n.id); });
          li.appendChild(U.el('div', 'nt-dot'));

          var main = U.el('div', 'li-main');
          var b = U.el('b', null, showTitle(n));
          main.appendChild(b);
          var pv = plainPreview(n.body);
          main.appendChild(U.el('small', null, (pv ? pv : '（空白便签）') + '  ·  ' + shortTime(n.updated)));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          acts.style.gap = '5px';
          var bCopy = U.el('button', 'ui-btn ghost', '复制');
          bCopy.style.padding = '6px 9px'; bCopy.style.fontSize = '11.5px';
          bCopy.title = '一键复制这条便签的标题与正文';
          bCopy.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            copyNote(n);
          });
          var bExp = U.el('button', 'ui-btn ghost', '导出');
          bExp.style.padding = '6px 9px'; bExp.style.fontSize = '11.5px';
          bExp.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            exportNote(n);
          });
          var bDel = U.el('button', 'ui-btn warn', '删除');
          bDel.style.padding = '6px 9px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            removeNote(n);
          });
          acts.appendChild(bCopy); acts.appendChild(bExp); acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);
        });
        wrap.appendChild(ul);

        wrap.appendChild(U.el('div', 'ui-muted', '点便签进入编辑，内容会在你停下输入后自动保存；「复制」把这条便签整段放进剪贴板。上面的按钮可以切换排序方式与正/倒序。'));
        root.appendChild(wrap);

        relTimer = setInterval(function () {
          if (view !== 'list') return;
          var cur = sortNotes(load(), loadSort());
          var items = U.$$('.li', root);
          var same = items.length === cur.length;
          for (var k = 0; same && k < items.length; k++) {
            if (!items[k].dataset || items[k].dataset.noteId !== cur[k].id) same = false;
          }
          if (!same) { render(); return; }   /* 顺序变了就整页重排，避免文案与条目错位 */
          var lis = U.$$('.li-main small', root);
          for (var i = 0; i < lis.length && i < cur.length; i++) {
            var pv = plainPreview(cur[i].body);
            lis[i].textContent = (pv ? pv : '（空白便签）') + '  ·  ' + shortTime(cur[i].updated);
          }
        }, 30000);
      }

      /* ---------------- 编辑页 ---------------- */
      function renderEdit() {
        var note = getNote(currentId);
        if (!note) { view = 'list'; renderList(); return; }
        savedHint = null;
        ctx.setTitle('编辑便签');

        var wrap = U.el('div');

        var bar = U.el('div', 'ui-row');
        bar.style.marginBottom = '12px';
        bar.style.flexWrap = 'wrap';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回列表');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', backToList);
        var bCopy = U.el('button', 'ui-btn', '📋 一键复制');
        bCopy.style.padding = '8px 13px'; bCopy.style.fontSize = '12.5px';
        bCopy.title = '把标题与正文一起复制到剪贴板';
        bCopy.addEventListener('click', function () { copyCurrent(); });
        var bExp = U.el('button', 'ui-btn ghost', '导出 .txt');
        bExp.style.padding = '8px 12px'; bExp.style.fontSize = '12.5px';
        bExp.addEventListener('click', function () { flush(); exportNote(getNote(currentId)); });
        bar.appendChild(bBack); bar.appendChild(bCopy); bar.appendChild(bExp);
        wrap.appendChild(bar);

        var info = U.el('div', 'ui-muted');
        info.textContent = '创建时间：' + fullTime(note.created) + '　·　修改时间：' + fullTime(note.updated);
        info.style.marginBottom = '6px';
        wrap.appendChild(info);

        wrap.appendChild(U.el('div', 'ui-label', '标题'));
        var titleIn = U.el('input', 'ui-field');
        titleIn.type = 'text';
        titleIn.placeholder = '给这条便签起个标题';
        titleIn.value = note.title || '';
        titleIn.maxLength = 80;
        wrap.appendChild(titleIn);

        wrap.appendChild(U.el('div', 'ui-label', '正文'));
        var bodyTa = U.el('textarea', 'ui-field');
        bodyTa.style.minHeight = '190px';
        bodyTa.style.lineHeight = '1.6';
        bodyTa.placeholder = '随手写点什么……';
        bodyTa.value = note.body || '';
        wrap.appendChild(bodyTa);

        var hint = U.el('div', 'ui-hint');
        hint.style.marginTop = '10px';
        hint.textContent = '标题留空时，会自动用正文的第一行作为标题。写完点「📋 一键复制」可整段复制走（或在输入框里选中一部分，只复制选中的内容）。';
        wrap.appendChild(hint);

        var status = U.el('div', 'ui-muted');
        status.style.marginTop = '8px';
        status.textContent = '自动保存已开启 · 输入停止 0.5 秒后写入本地存档';
        wrap.appendChild(status);
        savedHint = status;

        function commit(touch) {
          var list = load();
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === currentId) {
              list[i].title = titleIn.value.trim();
              list[i].body = bodyTa.value;
              list[i].updated = Date.now();
              break;
            }
          }
          save(list);
          return touch !== false;
        }

        function flush() {
          if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
          commit(true);
        }
        flushEdit = flush;

        function schedule() {
          if (saveTimer) clearTimeout(saveTimer);
          if (savedHint) { savedHint.textContent = '正在输入……'; savedHint.style.color = 'var(--ink-soft)'; }
          saveTimer = setTimeout(function () {
            saveTimer = null;
            commit(true);
            if (savedHint) {
              savedHint.textContent = '已保存 ' + fullTime(Date.now());
              savedHint.style.color = '#12a86f';
            }
          }, 500);
        }

        titleIn.addEventListener('input', schedule);
        bodyTa.addEventListener('input', schedule);
        titleIn.addEventListener('blur', flush);
        bodyTa.addEventListener('blur', flush);
        titleIn.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); bodyTa.focus(); }
        });

        ctx.addAction('复制', function () { copyCurrent(); });
        ctx.addAction('保存', function () {
          flush();
          phone.toast('已保存', 'ok');
        }, { ghost: true });
        ctx.addAction('删除', function () { removeNote(getNote(currentId), backToList); }, { ghost: true });

        root.appendChild(wrap);
        setTimeout(function () {
          if (!titleIn.value) titleIn.focus(); else bodyTa.focus();
        }, 30);
      }

      /* ---------------- 行为 ---------------- */
      function newNote() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        var list = load();
        var now = Date.now();
        var n = { id: U.uid('note'), title: '', body: '', created: now, updated: now };
        list.push(n);
        save(list);
        currentId = n.id;
        view = 'edit';
        render();
      }

      function openNote(id) {
        currentId = id;
        view = 'edit';
        render();
      }

      function backToList() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; commitIfEditing(); }
        currentId = null;
        view = 'list';
        render();
      }
      function commitIfEditing() {
        if (view !== 'edit' || !currentId || !root) return;
        var list = load();
        var changed = false;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === currentId) {
            var ti = U.$('input.ui-field', root);
            var ta = U.$('textarea.ui-field', root);
            if (!ti || !ta) return;
            var nt = ti.value.trim(), nb = ta.value;
            if (list[i].title !== nt || list[i].body !== nb) {
              list[i].title = nt;
              list[i].body = nb;
              list[i].updated = Date.now();
              changed = true;
            }
            break;
          }
        }
        if (changed) save(list);
      }

      function removeNote(n, after) {
        if (!n) return;
        phone.confirm('删除这条便签？', '「' + showTitle(n) + '」将被永久删除，无法恢复。').then(function (yes) {
          if (!yes) return;
          var list = load().filter(function (x) { return x.id !== n.id; });
          save(list);
          phone.toast('已删除便签', 'ok');
          if (typeof after === 'function') after();
          else render();
        });
      }

      function exportNote(n) {
        if (!n) return;
        var txt = '【' + showTitle(n) + '】\n修改时间：' + fullTime(n.updated) + '\n\n' + (n.body || '') + '\n';
        var name = '便签-' + (safeName(showTitle(n)) || '无标题') + '.txt';
        var ok = U.download(name, txt, 'text/plain');
        if (ok) phone.toast('已导出：' + name, 'ok');
      }

      /* ---------------- 一键复制 ---------------- */
      function doCopy(text, what) {
        text = String(text == null ? '' : text);
        if (!text.trim()) return phone.toast('这条便签是空的，没有可复制的内容', 'bad');
        U.copy(text).then(function (ok) {
          if (ok) phone.toast('已复制' + (what || '') + '到剪贴板（' + text.length + ' 字）', 'ok');
          else phone.toast('复制失败：浏览器不允许自动复制，请在输入框里手动选中后按 Ctrl+C', 'bad');
        });
      }
      function selectedIn(el) {
        try {
          if (!el || el.selectionStart == null || el.selectionEnd == null) return '';
          if (el.selectionEnd <= el.selectionStart) return '';
          return String(el.value || '').slice(el.selectionStart, el.selectionEnd);
        } catch (e) { return ''; }
      }
      function noteText(n) {
        if (!n) return '';
        var t = String(n.title || '').trim();
        return (t ? t + '\n\n' : '') + String(n.body || '');
      }
      /* 编辑页：有选中就只复制选中的，否则整条复制 */
      function copyCurrent() {
        if (flushEdit) flushEdit();
        var n = getNote(currentId);
        if (!n) return;
        var ti = U.$('input.ui-field', root);
        var ta = U.$('textarea.ui-field', root);
        var sel = selectedIn(ta) || selectedIn(ti);
        if (sel) return doCopy(sel, '选中的内容');
        doCopy(noteText(n), '这条便签');
      }
      /* 列表页：直接整条复制 */
      function copyNote(n) {
        if (!n) return;
        doCopy(noteText(n), '这条便签');
      }

      /* 关闭应用前兜底保存（只注册一次） */
      ctx.onCleanup(function () {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (relTimer) { clearInterval(relTimer); relTimer = null; }
        commitIfEditing();
      });

      render();
    }

    return {
      id: 'notes',
      name: '便签',
      icon: 'svg:coffee',
      color: 'mocha',
      desc: '摩卡色便签，随手记事可一键复制',
      order: 21,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'notes', createApp: createApp, code: '' });
})();
