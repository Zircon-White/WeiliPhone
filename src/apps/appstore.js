/* ============================================================
   内置应用 · 应用商店 / 插件管理（含导入、导出、卸载、代码注入）
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  function createApp(phone) {
    var U = phone.utils;

    function row(app, opts) {
      opts = opts || {};
      var li = U.el('div', 'li');
      var ic = U.el('div', 'app-icon');
      ic.style.background = phone.grad(app.id);
      ic.style.width = ic.style.height = '42px';
      ic.style.borderRadius = '13px';
      ic.style.fontSize = '20px';
      var g = U.el('span', 'glyph');
      g.innerHTML = phone.icons.html(app.icon, '#fff');
      ic.appendChild(g);
      li.appendChild(ic);
      var main = U.el('div', 'li-main');
      main.appendChild(U.el('b', null, app.name + (app.builtin ? '' : ' · 插件')));
      main.appendChild(U.el('small', null, (app.desc || '无描述') + '  ·  ' + app.id));
      li.appendChild(main);
      var acts = U.el('div', 'ui-row');
      li.appendChild(acts);
      return { li: li, acts: acts, main: main };
    }

    function mount(phoneApi, root, ctx) {
      var view = 'list';

      function render() {
        root.innerHTML = '';
        if (view === 'list') renderList();
        else if (view === 'code') renderCode();
        else if (view === 'data') renderData();
      }

      function renderList() {
        var wrap = U.el('div');
        var hint = U.el('div', 'ui-hint');
        hint.innerHTML = '插件即应用：任何应用都可以用一段 JS 源码安装进来。' +
          '点下面「AI 现场创作」用文字描述让 AI 直接写一个新应用，也可以导入别人分享的 <b>.json</b> 插件包。';
        wrap.appendChild(hint);

        var r1 = U.el('div', 'ui-row');
        r1.style.margin = '12px 0';
        var bAI = U.el('button', 'ui-btn', '✨ AI 现场创作');
        bAI.addEventListener('click', function () { phone.openApp('aigen'); });
        var bImp = U.el('button', 'ui-btn ghost', '📥 导入插件');
        bImp.addEventListener('click', doImport);
        r1.appendChild(bAI); r1.appendChild(bImp);
        wrap.appendChild(r1);

        wrap.appendChild(U.el('div', 'ui-label', '已安装应用（' + phone.getApps().length + '）'));
        var list = U.el('div', 'ui-list');
        phone.getApps().forEach(function (app) {
          var r = row(app);
          if (app.builtin) {
            var tag = U.el('small', null, '内置');
            tag.style.color = 'var(--ink-soft)';
            r.acts.appendChild(tag);
          } else {
            var bx = U.el('button', 'ui-btn ghost', '导出');
            bx.style.padding = '6px 10px'; bx.style.fontSize = '12px';
            bx.addEventListener('click', function () { doExport(app); });
            var bd = U.el('button', 'ui-btn warn', '卸载');
            bd.style.padding = '6px 10px'; bd.style.fontSize = '12px';
            bd.addEventListener('click', function () { doRemove(app); });
            r.acts.appendChild(bx); r.acts.appendChild(bd);
          }
          list.appendChild(r.li);
        });
        wrap.appendChild(list);

        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '14px'; r2.style.flexWrap = 'wrap';
        var bCode = U.el('button', 'ui-btn ghost', '⌨ 粘贴源码安装');
        bCode.addEventListener('click', function () { view = 'code'; render(); });
        var bData = U.el('button', 'ui-btn ghost', '💾 数据与备份');
        bData.addEventListener('click', function () { view = 'data'; render(); });
        r2.appendChild(bCode); r2.appendChild(bData);
        wrap.appendChild(r2);

        wrap.appendChild(U.el('div', 'ui-muted', '提示：卸载只删掉插件本体，它的存档会保留；想彻底清空可在「数据与备份」里操作。'));
        root.appendChild(wrap);
      }

      function renderCode() {
        var wrap = U.el('div');
        wrap.appendChild(U.el('div', 'ui-hint',
          '在下面粘贴插件源码。格式：必须定义 function createApp(phone){ ... return { name, icon, mount }; }。'));
        var ta = U.el('textarea', 'ui-field');
        ta.style.minHeight = '210px';
        ta.style.fontFamily = 'ui-monospace,Consolas,monospace';
        ta.style.fontSize = '12px';
        ta.placeholder = 'function createApp(phone){ return { name:"我的应用", icon:"emoji:🎯", mount:function(phone, root, ctx){} }; }';
        wrap.appendChild(ta);
        var r = U.el('div', 'ui-row');
        r.style.marginTop = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '返回');
        bBack.addEventListener('click', function () { view = 'list'; render(); });
        var bDo = U.el('button', 'ui-btn', '安装');
        bDo.addEventListener('click', function () {
          var code = ta.value.trim();
          if (!code) return phone.toast('请先粘贴源码', 'bad');
          try {
            var probe = phone.compile(code);
            var def = probe(phone, U.el('div'), { store: phone.store('probe'), onKey: function () { }, onCleanup: function () { }, setTitle: function () { }, addAction: function () { }, close: function () { } });
            var res = phone.addApp({ id: def.id, name: def.name, icon: def.icon, desc: def.desc || '手动安装的插件' }, { code: code });
            phone.toast('安装成功：' + def.name, 'ok');
            view = 'list'; render();
          } catch (e) {
            phone.alert('安装失败', '错误信息：\n\n```\n' + e.message + '\n```');
          }
        });
        r.appendChild(bBack); r.appendChild(bDo);
        wrap.appendChild(r);
        root.appendChild(wrap);
      }

      function renderData() {
        var wrap = U.el('div');
        wrap.appendChild(U.el('div', 'ui-hint', '导出会把全部应用（含内置）与所有存档打包成一个 JSON 文件，换电脑时导入即可恢复。'));
        var r = U.el('div', 'ui-row');
        r.style.margin = '12px 0';
        var bExp = U.el('button', 'ui-btn', '导出全部');
        bExp.addEventListener('click', function () {
          var bundle = phone.exportAll();
          var ok = U.download('phoneshell-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(bundle, null, 2));
          if (ok) phone.toast('已导出备份文件', 'ok');
        });
        var bImp = U.el('button', 'ui-btn ghost', '导入备份');
        bImp.addEventListener('click', doImport);
        r.appendChild(bExp); r.appendChild(bImp);
        wrap.appendChild(r);

        wrap.appendChild(U.el('div', 'ui-label', '各应用存档大小'));
        var list = U.el('div', 'ui-list');
        var total = 0;
        phone.getApps().forEach(function (app) {
          var dump = JSON.stringify(phone.store(app.id).dump());
          total += dump.length;
          var li = U.el('div', 'li');
          var main = U.el('div', 'li-main');
          main.appendChild(U.el('b', null, app.name));
          main.appendChild(U.el('small', null, dump.length + ' 字节 · ' + (dump === '{}' ? '暂无存档' : '有存档')));
          li.appendChild(main);
          var bClear = U.el('button', 'ui-btn ghost', '清空');
          bClear.style.padding = '6px 10px'; bClear.style.fontSize = '12px';
          bClear.addEventListener('click', function () {
            phone.store(app.id).clear();
            phone.toast(app.name + ' 的存档已清空', 'ok');
            render();
          });
          li.appendChild(bClear);
          list.appendChild(li);
        });
        wrap.appendChild(list);
        wrap.appendChild(U.el('div', 'ui-muted', '全部存档合计约 ' + total + ' 字节。浏览器本地存储上限通常 5MB，够用很久。'));

        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '14px';
        var bBack = U.el('button', 'ui-btn ghost', '返回');
        bBack.addEventListener('click', function () { view = 'list'; render(); });
        r2.appendChild(bBack);
        wrap.appendChild(r2);
        root.appendChild(wrap);
      }

      function doExport(app) {
        var data = phone.exportApp(app.id);
        if (!data) return;
        if (!data.code) {
          phone.alert('无法导出源码', '「' + app.name + '」是内置应用，其源码已内置在外壳文件中，不需要单独导出。');
          return;
        }
        U.download(app.id + '.phoneapp.json', JSON.stringify(data, null, 2));
        phone.toast('已导出：' + app.name, 'ok');
      }

      function doRemove(app) {
        phone.confirm('卸载 ' + app.name + '？', '插件源码会被删除，它的存档数据会保留。').then(function (yes) {
          if (!yes) return;
          if (phone.removeApp(app.id)) { phone.toast('已卸载：' + app.name, 'ok'); render(); }
        });
      }

      function doImport() {
        U.readFile('.json,application/json').then(function (f) {
          if (!f) return;
          var res;
          try { res = phone.importBundle(f.text); }
          catch (e) { return phone.alert('导入失败', '文件解析出错：\n\n```\n' + e.message + '\n```'); }
          var msg = '成功导入 ' + res.ok + ' 个应用。';
          if (res.fail.length) msg += '\n\n失败 ' + res.fail.length + ' 个：\n' + res.fail.map(function (x) { return '- ' + x; }).join('\n');
          phone.alert('导入完成', msg);
          render();
        });
      }

      render();
    }

    return {
      id: 'appstore',
      name: '应用商店',
      icon: 'svg:grid',
      desc: '安装 / 卸载 / 导入插件',
      order: 80,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'appstore', createApp: createApp, code: '' });
})();
