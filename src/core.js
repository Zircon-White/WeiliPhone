/* ============================================================
   PhoneShell Core —— 手机外壳内核
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var _uid = 0;
  function uid(p) { _uid += 1; return (p || 'id') + '-' + Date.now().toString(36) + '-' + _uid; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function iconOnly(str) { try { return String.fromCodePoint(str.codePointAt(0)); } catch (e) { return str; } }
  function relTime(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return Math.floor(d / 86400000) + ' 天前';
  }

  /* 极简 Markdown（先转义再渲染，只支持安全子集，用于展示 AI 文本） */
  function md(src) {
    var lines = esc(src).split('\n'), out = [], inCode = false, inList = false;
    function closeList() { if (inList) { out.push('</ul>'); inList = false; } }
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^```/.test(L.trim())) {
        if (!inCode) { closeList(); out.push('<pre class="ui-pre">'); inCode = true; }
        else { out.push('</pre>'); inCode = false; }
        continue;
      }
      if (inCode) { out.push(L); continue; }
      var t = L.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^\s*[-*]\s+/.test(L)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + t.replace(/^\s*[-*]\s+/, '') + '</li>');
        continue;
      }
      closeList();
      if (/^#{1,4}\s/.test(L)) out.push('<h4 style="margin:10px 0 4px">' + t.replace(/^#+\s*/, '') + '</h4>');
      else if (L.trim() === '') out.push('<div style="height:6px"></div>');
      else out.push('<div>' + t + '</div>');
    }
    closeList();
    if (inCode) out.push('</pre>');
    return out.join('');
  }

  /* ---------------- 配色与图标 ---------------- */
  var PALETTE = [
    { name: '薄荷', c1: '#3ddc97', c2: '#12a86f' },
    { name: '蜜橘', c1: '#ffb457', c2: '#f0793a' },
    { name: '莓红', c1: '#ff7a8a', c2: '#e03b63' },
    { name: '湖蓝', c1: '#5cc8ff', c2: '#2b6de0' },
    { name: '藤紫', c1: '#a98bff', c2: '#6c4bd8' },
    { name: '柠檬', c1: '#ffe066', c2: '#f0b429' },
    { name: '青松', c1: '#5ce1e6', c2: '#189eae' },
    { name: '石板', c1: '#9aa8c7', c2: '#5b648f' },
    { name: '砖橙', c1: '#ffa07a', c2: '#d9534f' },
    { name: '夜蓝', c1: '#4a5bd8', c2: '#1b2350' }
  ];
  /* 具名配色：应用可以在定义里写 color:"mocha"，图标就会用这一套色（不进 PALETTE，避免影响已有应用的哈希配色） */
  var NAMED_COLORS = {
    mocha: { name: '摩卡', c1: '#c08b5c', c2: '#5b3a29' },
    latte: { name: '拿铁', c1: '#e3c9a8', c2: '#a97c50' },
    espresso: { name: '浓缩', c1: '#7a5540', c2: '#33211a' }
  };
  function hashStr(s) { var h = 0, i; s = String(s); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function pickColor(id) {
    var app = appCache && appCache.map ? appCache.map[id] : null;
    var c = app && app.color;
    if (c) {
      if (typeof c === 'object' && c.c1) return c;
      if (NAMED_COLORS[c]) return NAMED_COLORS[c];
    }
    return PALETTE[hashStr(id) % PALETTE.length];
  }
  function gradCss(id) {
    var p = pickColor(id);
    return 'linear-gradient(160deg,' + p.c1 + ' 0%,' + p.c2 + ' 100%)';
  }

  /* 图标库（全部为本地内联矢量，无任何外部/生成素材） */
  var ICON_PATHS = {
    grid: ['M6 6h15v15H6z', 'M27 6h15v15H27z', 'M6 27h15v15H6z', 'M27 27h15v15H27z'],
    spark: ['M22 3l4.2 12.4L39 19l-12.8 3.6L22 35l-4.2-12.4L5 19l12.8-3.6z', 'M38 28l2.1 6.2L46 36l-5.9 1.8L38 44l-2.1-6.2L30 36l5.9-1.8z'],
    gear: ['M21 3h6l1.2 5.4 4.9 2 5-2.4 4.2 4.2-2.4 5 2 4.9L47 24v6l-5.4 1.2-2 4.9 2.4 5-4.2 4.2-5-2.4-4.9 2L27 47h-6l-1.2-5.4-4.9-2-5 2.4L5.7 37.8l2.4-5-2-4.9L1 27v-6l5.4-1.2 2-4.9-2.4-5 4.2-4.2 5 2.4 4.9-2zM24 16a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'],
    clock: ['M24 3a21 21 0 1 0 0 42 21 21 0 0 0 0-42zm0 5a16 16 0 1 1 0 32 16 16 0 0 1 0-32z', 'M22 12h4v12.4l8.4 5-2 3.4L22 26.4z'],
    note: ['M10 4h28a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z', 'M14 15h20v4H14z', 'M14 23h20v4H14z', 'M14 31h12v4H14z'],
    calc: ['M10 3h28a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z', 'M12 10h24v9H12z', 'M15 26a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M24 26a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M33 26a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M15 36a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M24 36a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M33 36a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
    snake: ['M8 8h13v13H8z', 'M23 8h13v13H23z', 'M38 8h6v6h-6z', 'M8 23h13v13H8z', 'M27 27h14v14H27z'],
    puzzle: ['M5 5h16v16H5z', 'M27 5h16v16H27z', 'M5 27h16v16H5z', 'M27 27h16v16H27z'],
    folder: ['M4 9a4 4 0 0 1 4-4h11l5 6h16a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z'],
    rocket: ['M24 3c8 6 11 15 11 24l-6 5v8l-5-4-5 4v-8l-6-5C13 18 16 9 24 3z', 'M18 33h12v5H18z'],
    star: ['M24 3l6.5 13.6L45 18.6l-10.5 10.4L37 44l-13-7.2L11 44l2.5-15L3 18.6l14.5-2z'],
    heart: ['M24 43S4 31 4 18.5A10.5 10.5 0 0 1 24 12a10.5 10.5 0 0 1 20 6.5C44 31 24 43 24 43z'],
    book: ['M6 6a3 3 0 0 1 3-3h13v38H9a3 3 0 0 1-3-3z', 'M29 3h13a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H29z'],
    music: ['M20 6l24-5v7l-20 4v22a6 6 0 1 1-4-5.6z'],
    camera: ['M4 12a4 4 0 0 1 4-4h5l3-5h16l3 5h5a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z', 'M24 15a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
    dice: ['M8 4h32a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z', 'M15 15a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M33 15a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M24 24a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M15 33a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M33 33a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
    bolt: ['M27 2L6 27h13l-2 19 21-25H25z'],
    flask: ['M18 4h12v14l10 20a4 4 0 0 1-3.6 6H11.6A4 4 0 0 1 8 38l10-20z', 'M15 32h18l4 8H13z'],
    chat: ['M6 8a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H20L8 42V8z'],
    chart: ['M6 30h7v14H6z', 'M18 20h7v24h-7z', 'M30 10h7v34h-7z', 'M3 44h42v3H3z'],
    target: ['M24 3a21 21 0 1 0 0 42 21 21 0 0 0 0-42zm0 7a14 14 0 1 1 0 28 14 14 0 0 1 0-28zm0 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14z'],
    cube: ['M24 3l19 10v22L24 45 5 35V13z', 'M24 3v20L5 13zM24 23l19-10'],
    map: ['M3 9l14-6 14 6 14-6v36l-14 6-14-6-14 6z', 'M17 3v36M31 9v36'],
    key: ['M30 3a15 15 0 1 0-10 26l3 3h4v4h4v4h8l3-3-12-12A15 15 0 0 0 30 3zm-6 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    dot: ['M24 14a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
    /* 摩卡咖啡（便签用）：外带咖啡杯 */
    coffee: ['M12 8h24v6H12z', 'M14 16h20l-2.6 22.4A3.2 3.2 0 0 1 28.2 41h-8.4a3.2 3.2 0 0 1-3.2-2.6z',
      'M15.5 22h17l-.8 7h-15.4z'],
    /* 阅读器：摊开的书 + 书签 */
    reader: ['M6 8a4 4 0 0 1 4-4h12v36H10a4 4 0 0 1-4-4z', 'M26 4h12a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H26z',
      'M20 14h8v10l-4-3.4L20 24z'],
    /* 检索：放大镜 */
    search: ['M20 7a13 13 0 1 0 0 26 13 13 0 0 0 0-26zm0 5a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
      'M30.5 30.5l11 11-3.5 3.5-11-11z'],
    /* 知识卡：一叠卡片 */
    cards: ['M9 5h24a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z', 'M12 12h18v3.6H12z',
      'M12 20h18v3.6H12z', 'M12 28h11v3.6H12z']
  };
  function svgIcon(name, color) {
    var p = ICON_PATHS[name] || ICON_PATHS.dot;
    var s = '<svg viewBox="0 0 48 48" fill="' + (color || '#ffffff') + '" xmlns="' + SVG_NS + '">';
    for (var i = 0; i < p.length; i++) s += '<path d="' + p[i] + '"/>';
    return s + '</svg>';
  }
  function iconHTML(spec, color) {
    spec = String(spec == null || spec === '' ? '' : spec);
    if (spec.indexOf('emoji:') === 0) return '<span class="emoji">' + esc(iconOnly(spec.slice(6))) + '</span>';
    if (spec.indexOf('svg:') === 0) return svgIcon(spec.slice(4), color);
    if (spec.length <= 6 && spec.indexOf(' ') < 0 && ICON_PATHS[spec]) return svgIcon(spec, color);
    if (/^[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}]/u.test(spec)) return '<span class="emoji">' + esc(iconOnly(spec)) + '</span>';
    if (spec) return '<span class="emoji" style="font-size:20px;font-weight:800">' + esc(spec.slice(0, 3)) + '</span>';
    return svgIcon('dot', color);
  }

  /* ---------------- 存储层 ---------------- */
  var LS_PREFIX = 'phone.data.';
  var LS_REGISTRY = 'phone.registry.v1';
  var LS_SETTINGS = 'phone.settings.v1';
  var memFallback = {};
  var canLS = (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; }
  })();
  function lsGet(k) { try { return canLS ? localStorage.getItem(k) : (k in memFallback ? memFallback[k] : null); } catch (e) { return null; } }
  function lsSet(k, v) {
    try { if (canLS) { localStorage.setItem(k, v); return true; } memFallback[k] = v; return true; }
    catch (e) { phone.toast('存储空间不足，数据未保存', 'bad'); return false; }
  }
  function lsDel(k) { try { if (canLS) localStorage.removeItem(k); else delete memFallback[k]; } catch (e) { } }

  function makeStore(appId) {
    var key = LS_PREFIX + appId;
    function readAll() { try { return JSON.parse(lsGet(key) || '{}') || {}; } catch (e) { return {}; } }
    function writeAll(o) { lsSet(key, JSON.stringify(o)); }
    return {
      get: function (k, d) { var o = readAll(); return (k in o) ? o[k] : (d === undefined ? null : d); },
      set: function (k, v) { var o = readAll(); o[k] = v; writeAll(o); return v; },
      remove: function (k) { var o = readAll(); delete o[k]; writeAll(o); },
      clear: function () { lsDel(key); },
      all: readAll,
      /** 导出该应用的全部存档（便于备份/迁移） */
      dump: function () { return readAll(); }
    };
  }
  var Settings = {
    all: function () { try { return JSON.parse(lsGet(LS_SETTINGS) || '{}') || {}; } catch (e) { return {}; } },
    get: function (k, d) { var o = Settings.all(); return (k in o) ? o[k] : (d === undefined ? null : d); },
    set: function (k, v) { var o = Settings.all(); o[k] = v; lsSet(LS_SETTINGS, JSON.stringify(o)); return v; }
  };

  /* ---------------- 应用名校验与注册表 ---------------- */
  var appCache = null;
  function normalizeApp(def) {
    if (!def || typeof def !== 'object') throw new Error('应用定义必须是对象');
    var id = String(def.id == null ? '' : def.id).trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,31}$/.test(id)) throw new Error('应用 id 不合法（2-32 位字母数字，需字母开头）: ' + id);
    if (typeof def.mount !== 'function') throw new Error('应用 ' + id + ' 缺少 mount(phone, root, ctx) 方法');
    var icon = def.icon == null || def.icon === '' ? 'svg:dot' : String(def.icon);
    if (!/^(emoji:|svg:)/.test(icon) && !ICON_PATHS[icon]) icon = 'emoji:' + icon;
    return {
      id: id,
      name: String(def.name || id).slice(0, 20),
      icon: icon,
      color: def.color || null,
      desc: String(def.desc || '').slice(0, 200),
      order: typeof def.order === 'number' ? def.order : 100,
      builtin: !!def.builtin,
      newAt: def.newAt || 0,
      mount: def.mount
    };
  }
  function loadRegistry() {
    var builtin = (window.PHONE_BUILTIN_APPS || []).map(function (d) {
      var def = d;
      if (typeof d.createApp === 'function') {
        var made = d.createApp(phone);
        def = Object.assign({}, made, { code: d.code || '' });
      }
      var c = Object.assign({}, def);
      c.builtin = true;
      var a = normalizeApp(c);
      a.__code = d.code || '';
      a.raw = { code: d.code || '' };
      return a;
    });
    var user = [];
    try {
      var raw = JSON.parse(lsGet(LS_REGISTRY) || '[]') || [];
      user = raw.map(function (r) {
        var fn = compileAppCode(r.code);
        return normalizeApp({
          id: r.id, name: r.name, icon: r.icon, desc: r.desc, color: r.color,
          order: r.order, newAt: r.newAt, builtin: false, mount: fn
        });
      }).filter(Boolean);
    } catch (e) { console.warn('[PhoneShell] 用户应用加载失败：', e); }
    var map = {};
    builtin.forEach(function (a) { map[a.id] = a; });
    user.forEach(function (a) { if (!map[a.id] || !map[a.id].builtin) map[a.id] = a; });
    appCache = { map: map, order: Object.keys(map) };
    return appCache;
  }
  function getApps() {
    if (!appCache) loadRegistry();
    return Object.keys(appCache.map).map(function (k) { return appCache.map[k]; })
      .sort(function (a, b) { return (a.order - b.order) || a.name.localeCompare(b.name, 'zh'); });
  }
  function saveUserApps() {
    if (!appCache) return;
    var list = Object.keys(appCache.map).filter(function (k) { return !appCache.map[k].builtin; }).map(function (k) {
      var r = appCache.map[k].raw || {};
      return { id: k, name: appCache.map[k].name, icon: appCache.map[k].icon, desc: appCache.map[k].desc, color: appCache.map[k].color, order: appCache.map[k].order, newAt: appCache.map[k].newAt, code: r.code || appCache.map[k].__code || '' };
    });
    var r2 = lsSet(LS_REGISTRY, JSON.stringify(list));
    return r2;
  }

  /**
   * 把一段“插件源码”编译成 mount 函数。
   * 约定：源码中必须定义 function createApp(phone) { ... return {name,icon,mount}; }
   * 支持两种写法：createApp(phone) 或 module.exports/export default。
   */
  function compileAppCode(code) {
    code = String(code || '');
    code = code.replace(/^\uFEFF/, '');
    /* 关键：包装器必须返回 “一个能被调用的工厂函数”，而不是 createApp 本身。
       只有在源码里真的写了 exports 赋值时才接受 module.exports 结果，避免把无关对象当成应用。 */
    var usesExports = /\.\s*exports\b|export\s+default/.test(code);
    var wrapped =
      '(function(){\n' + code + '\n;' +
      'if(typeof createApp==="function")return function(phone,body,ctx){return createApp(phone,body,ctx);};\n' +
      (usesExports
        ? 'if(typeof module!=="undefined"&&module.exports){var m=module.exports;' +
          'if(typeof m.createApp==="function")return function(phone,body,ctx){return m.createApp(phone,body,ctx);};' +
          'if(m&&typeof m==="object"&&typeof m.mount==="function")return function(){return m;};' +
          'if(m&&typeof m==="object"&&typeof m.default==="object"){var d=m.default;' +
          'if(typeof d.createApp==="function")return function(phone,body,ctx){return d.createApp(phone,body,ctx);};' +
          'if(typeof d.mount==="function")return function(){return d;};}}\n'
        : '') +
      'return null;})()';
    var factory = (new Function('return (' + wrapped + ');'))();
    if (!factory) throw new Error('源码里没有找到 createApp(phone) 工厂函数');
    var def = factory(phone);
    /* 允许 createApp 直接返回 mount 函数 */
    if (typeof def === 'function') return def;
    if (!def || typeof def !== 'object') throw new Error('createApp 必须返回应用定义对象');
    var app = normalizeApp(def);
    /* module.exports = {...} 这种写法会落到这里：返回对象本身，取它的 mount */
    if (typeof def.mount !== 'function') {
      if (typeof app.mount !== 'function') throw new Error('应用 ' + app.id + ' 缺少 mount(phone, root, ctx) 方法');
    }
    return app.mount;
  }

  /* ---------------- 应用状态机 ---------------- */
  var state = { current: null, hosts: {}, recents: [], locked: true, booted: false, editing: false, page: 0 };
  var $appLayer, $home, $pages, $pageDots, $screen, $dock, $lock, $recents, $toastLayer, $modal, $statusbar, $folderPop, $screensaver;

  /* ============================================================
     桌面布局：分页（每页 3×4）＋ 文件夹分组
     布局数据存在 settings 的 'layout' 键：
       { pages: [ [ 'appId' | {t:'folder', id, name, apps:[...]}, null, ... ] ] }
     每个槽位要么是应用 id、要么是文件夹对象、要么是 null（空位）。
     ============================================================ */
  var LAYOUT_KEY = 'layout';
  var PAGE_COUNT = 3;
  var PER_PAGE = 12;
  var DOCK_IDS = ['appstore', 'aigen', 'settings'];
  var layout = null;

  function freshLayout() {
    return { pages: [newSlotArr(), newSlotArr(), newSlotArr()] };
  }
  function newSlotArr() {
    var a = [];
    for (var i = 0; i < PER_PAGE; i++) a.push(null);
    return a;
  }
  function isFolderId(v) { return !!v && typeof v === 'object' && v.t === 'folder'; }
  function slotAppId(v) { return v == null ? null : (typeof v === 'string' ? v : null); }
  function slotFolder(v) { return isFolderId(v) ? v : null; }

  /* 布局自愈：清掉已卸载的应用、去掉重复占用、补齐页数、把没上桌面的应用放到空位 */
  function normalizeLayout(L) {
    var seen = {};
    var list = getApps();
    var known = {};
    list.forEach(function (a) { known[a.id] = true; });
    var result = { pages: [] };
    var pages = (L && L.pages) || [];
    for (var p = 0; p < Math.max(PAGE_COUNT, pages.length); p++) {
      var src = pages[p] || [];
      var slot = newSlotArr();
      for (var i = 0; i < PER_PAGE; i++) {
        var v = src[i];
        if (isFolderId(v)) {
          var kept = [];
          (v.apps || []).forEach(function (id) {
            if (known[id] && !seen[id] && DOCK_IDS.indexOf(id) < 0) { kept.push(id); seen[id] = true; }
          });
          if (kept.length > 1) slot[i] = { t: 'folder', id: String(v.id || uid('folder')), name: String(v.name || '文件夹').slice(0, 12), apps: kept };
          else if (kept.length === 1) slot[i] = kept[0];
        } else if (typeof v === 'string' && known[v] && !seen[v] && DOCK_IDS.indexOf(v) < 0) {
          slot[i] = v; seen[v] = true;
        }
      }
      result.pages.push(slot);
    }
    /* 没上桌面的应用（新装的）塞进空位 */
    list.forEach(function (a) {
      if (seen[a.id] || DOCK_IDS.indexOf(a.id) >= 0) return;
      var put = false;
      for (var p = 0; p < result.pages.length && !put; p++) {
        for (var i = 0; i < PER_PAGE; i++) {
          if (result.pages[p][i] == null) { result.pages[p][i] = a.id; seen[a.id] = true; put = true; break; }
        }
      }
      /* 三页也放不下就再开一页 */
      if (!put) {
        while (result.pages.length <= p) result.pages.push(newSlotArr());
        result.pages[p][0] = a.id; seen[a.id] = true;
      }
    });
    layout = result;
    return layout;
  }
  function loadLayout() {
    var raw = null;
    try { raw = Settings.get(LAYOUT_KEY, null); } catch (e) { }
    if (raw && typeof raw === 'object' && raw.pages && raw.pages.length) normalizeLayout(raw);
    else normalizeLayout(freshLayout());
    return layout;
  }
  function saveLayout() {
    try { Settings.set(LAYOUT_KEY, layout); } catch (e) { }
  }
  function findSlot(appId) {
    for (var p = 0; p < layout.pages.length; p++) {
      for (var i = 0; i < PER_PAGE; i++) {
        var v = layout.pages[p][i];
        if (v === appId) return { page: p, idx: i };
        var f = slotFolder(v);
        if (f && f.apps.indexOf(appId) >= 0) return { page: p, idx: i, folder: f };
      }
    }
    return null;
  }
  function countApps() {
    var n = 0;
    layout.pages.forEach(function (pg) { pg.forEach(function (v) { if (typeof v === 'string') n++; else if (isFolderId(v)) n += v.apps.length; }); });
    return n;
  }
  function pageOfApp(id) { var s = findSlot(id); return s ? s.page : 0; }

  /* ---------------- 图标 / 单元格 ---------------- */
  function appIconNode(app, size) {
    var n = el('div', 'app-icon');
    n.style.background = gradCss(app.id);
    n.style.width = n.style.height = (size || 64) + 'px';
    n.style.borderRadius = Math.round((size || 64) * 0.3) + 'px';
    var g = el('span', 'glyph');
    g.innerHTML = iconHTML(app.icon, '#ffffff');
    n.appendChild(g);
    if (app.newAt) n.appendChild(el('span', 'badge-new', 'NEW'));
    return n;
  }
  function folderIconNode(folder, size) {
    var n = el('div', 'app-icon');
    n.style.width = n.style.height = (size || 64) + 'px';
    n.style.borderRadius = Math.round((size || 64) * 0.3) + 'px';
    n.style.background = 'rgba(255,255,255,.26)';
    n.style.backdropFilter = 'blur(10px)';
    var grid = el('div', 'fo-grid');
    for (var i = 0; i < 4; i++) {
      var s = el('span');
      var id = folder.apps[i];
      var a = id && appCache.map[id];
      if (a) {
        s.style.background = gradCss(a.id);
        s.innerHTML = iconHTML(a.icon, '#ffffff');
      } else {
        s.style.background = 'rgba(255,255,255,.16)';
      }
      grid.appendChild(s);
    }
    n.appendChild(grid);
    return n;
  }
  function appItemNode(app, opts) {
    opts = opts || {};
    var b = el('button', 'app-item' + (opts.ghost ? ' is-ghost' : ''));
    b.type = 'button';
    b.title = app.name + (app.desc ? ' —— ' + app.desc : '');
    b.dataset.appId = app.id;
    b.appendChild(appIconNode(app, opts.size || 64));
    if (!opts.hideLabel) b.appendChild(el('span', 'ai-label', app.name));
    if (opts.dock) b.dataset.dock = '1';
    b.addEventListener('click', function () {
      if (state.locked) return;
      if (state.editing) return;                       /* 整理模式下不打开应用 */
      if (drag && drag.moved) return;                  /* 刚拖完不要误触打开 */
      openApp(app.id);
    });
    if (!opts.dock) attachLongPress(b, app.id);         /* dock 图标不参与整理拖拽 */
    return b;
  }
  function folderItemNode(folder, opts) {
    opts = opts || {};
    var b = el('button', 'app-item');
    b.type = 'button';
    b.dataset.folderId = folder.id;
    b.appendChild(folderIconNode(folder, opts.size || 64));
    b.appendChild(el('span', 'ai-label', folder.name));
    b.addEventListener('click', function () {
      if (state.locked) return;
      if (state.editing) return openFolder(folder.id);
      if (drag && drag.moved) return;
      openFolder(folder.id);
    });
    attachLongPress(b, null, folder.id);
    return b;
  }
  function emptySlotNode(pageIdx, slotIdx) {
    var d = el('div', 'slot-hint', state.editing ? '松手放到这里' : '');
    d.dataset.page = pageIdx; d.dataset.slot = slotIdx;
    return d;
  }

  /* ---------------- 首页渲染 ---------------- */
  function renderHome() {
    if (!$pages) return;
    if (!layout) return;   /* 布局由 loadLayout() 在启动时初始化（需先有注册表） */
    var dockApps = DOCK_IDS.map(function (id) { return appCache.map[id]; }).filter(Boolean);

    /* 分页 DOM */
    var pageEls = $$('.page', $pages);
    for (var p = 0; p < layout.pages.length; p++) {
      if (!pageEls[p]) {
        var sec = el('section', 'page');
        sec.dataset.page = p;
        sec.appendChild(el('div', 'home-title')).appendChild(el('h1', null, '第 ' + (p + 1) + ' 页'));
        sec.appendChild(el('div', 'app-grid'));
        sec.dataset.grid = '';
        $pages.appendChild(sec);
        pageEls = $$('.page', $pages);
      }
    }
    var groups = layout.pages.map(function (slots, pi) {
      var pageEl = pageEls[pi];
      var grid = $('[data-grid]', pageEl);
      grid.innerHTML = '';
      var n = 0;
      slots.forEach(function (v, si) {
        if (v == null) return;
        var f = slotFolder(v);
        if (f) { grid.appendChild(folderItemNode(f)); n++; }
        else if (appCache.map[v]) { grid.appendChild(appItemNode(appCache.map[v])); n++; }
      });
      /* 每页留一个可见空位（可拖入）；最后一页再补一个「添加应用」入口 */
      var freeIdx = slots.indexOf(null);
      if (freeIdx >= 0) grid.appendChild(emptySlotNode(pi, freeIdx));
      if (pi === layout.pages.length - 1 && layout.pages.length < 6) {
        var add = el('button', 'app-item is-ghost');
        add.type = 'button';
        add.title = '安装新的应用 / 新建文件夹入口';
        var gi = el('div', 'app-icon');
        gi.style.background = 'transparent';
        gi.style.boxShadow = 'none';
        gi.innerHTML = '<span class="glyph" style="color:rgba(255,255,255,.8);font-size:30px;font-weight:300">+</span>';
        add.appendChild(gi);
        add.appendChild(el('span', 'ai-label', '添加应用'));
        add.addEventListener('click', function () { if (!state.editing) openApp('appstore'); });
        grid.appendChild(add);
      }
      if (n === 0 && pi > 0 && freeIdx < 0) grid.appendChild(el('div', 'page-empty', '这一页还是空的，长按图标拖过来吧'));
      return { pageEl: pageEl, grid: grid, count: n };
    });

    /* 页码圆点 */
    $pageDots.innerHTML = '';
    for (var i = 0; i < layout.pages.length; i++) {
      var dot = el('i');
      dot.dataset.page = i;
      dot.addEventListener('click', function () { goPage(Number(this.dataset.page)); });
      $pageDots.appendChild(dot);
    }
    $pageDots.classList.toggle('show', layout.pages.length > 1);
    var cnt = $('#home-count');
    if (cnt) cnt.textContent = countApps() + ' 个应用 · ' + layout.pages.length + ' 页';

    /* dock */
    $dock.innerHTML = '';
    dockApps.forEach(function (a) { $dock.appendChild(appItemNode(a, { size: 56, hideLabel: true, dock: true })); });
    syncDots();
  }

  function syncDots() {
    if (!$pageDots) return;
    $$('i', $pageDots).forEach(function (d, i) { d.classList.toggle('on', i === state.page); });
  }
  function goPage(i) {
    if (!$pages) return;
    i = clamp(i, 0, layout.pages.length - 1);
    var w = $pages.clientWidth || $pages.offsetWidth || 0;
    if (w && $pages.scrollTo) $pages.scrollTo({ left: i * w, behavior: 'smooth' });
    else if (w) $pages.scrollLeft = i * w;
    state.page = i;
    syncDots();
  }
  function currentPage() {
    if (!$pages) return 0;
    var w = $pages.clientWidth || 0;
    if (!w) return 0;
    return clamp(Math.round($pages.scrollLeft / w), 0, layout.pages.length - 1);
  }

  /* ---------------- 整理模式 ---------------- */
  function setEditing(on) {
    state.editing = !!on;
    if ($home) $home.classList.toggle('editing', state.editing);
    $$('.slot-hint', $pages || document).forEach(function (s) { s.textContent = state.editing ? '松手放到这里' : ''; });
  }

  /* ---------------- 文件夹 ---------------- */
  function findFolder(id) {
    for (var p = 0; p < layout.pages.length; p++) {
      for (var i = 0; i < PER_PAGE; i++) {
        var f = slotFolder(layout.pages[p][i]);
        if (f && f.id === id) return { folder: f, page: p, idx: i };
      }
    }
    return null;
  }
  function newFolder(name, apps) {
    return { t: 'folder', id: uid('folder'), name: name || '文件夹', apps: apps.slice() };
  }
  /* 把一组应用从桌面（可能散落各处，也可能已在别的文件夹里）移进目标文件夹 */
  function detachToFolder(ids, folder) {
    ids.forEach(function (id) {
      var s = findSlot(id);
      if (!s) return;
      if (s.folder) {
        s.folder.apps = s.folder.apps.filter(function (x) { return x !== id; });
        if (s.folder.apps.length <= 1) layout.pages[s.page][s.idx] = s.folder.apps[0] || null;
      } else if (layout.pages[s.page][s.idx] === id) {
        layout.pages[s.page][s.idx] = null;
      }
      folder.apps.push(id);
    });
    return folder;
  }
  function openFolder(id) {
    var hit = findFolder(id);
    if (!hit || !$folderPop) return;
    var f = hit.folder;
    $folderPop.dataset.folderId = id;
    var nameEl = $('#fp-name');
    nameEl.value = f.name;
    nameEl.oninput = function () {
      f.name = (nameEl.value || '').trim().slice(0, 12) || '文件夹';
      saveLayout(); renderHome();
    };
    var grid = $('#fp-grid');
    grid.innerHTML = '';
    f.apps.forEach(function (appId) {
      var a = appCache.map[appId];
      if (!a) return;
      var b = el('button', 'app-item');
      b.type = 'button';
      b.dataset.appId = appId;
      b.appendChild(appIconNode(a, 60));
      b.appendChild(el('span', 'ai-label', a.name));
      b.addEventListener('click', function () {
        if (state.editing) return;
        closeFolder();
        openApp(appId);
      });
      attachLongPress(b, appId);
      grid.appendChild(b);
    });
    $folderPop.classList.add('show');
    if ($pages) $pages.style.overflow = 'hidden';
  }
  function closeFolder() {
    if (!$folderPop) return;
    $folderPop.classList.remove('show');
    $folderPop.dataset.folderId = '';
    if ($pages) $pages.style.overflow = '';
    if (layout) saveLayout();
  }
  function deleteFolder() {
    var id = $folderPop && $folderPop.dataset.folderId;
    var hit = id && findFolder(id);
    if (!hit) return;
    phone.confirm('删除文件夹「' + hit.folder.name + '」？', '里面的应用会回到桌面空位上，不会卸载。').then(function (yes) {
      if (!yes) return;
      var apps = hit.folder.apps.slice();
      layout.pages[hit.page][hit.idx] = null;
      apps.forEach(function (aid) { placeOnEmptySlot(aid); });
      saveLayout(); closeFolder(); renderHome();
      phone.toast('文件夹已删除', 'ok');
    });
  }
  function placeOnEmptySlot(appId) {
    for (var p = 0; p < layout.pages.length; p++) {
      for (var i = 0; i < PER_PAGE; i++) {
        if (layout.pages[p][i] == null) { layout.pages[p][i] = appId; return true; }
      }
    }
    layout.pages.push(newSlotArr());
    layout.pages[layout.pages.length - 1][0] = appId;
    return true;
  }

  /* ---------------- 长按拖拽 ---------------- */
  var drag = null;   /* { appId, folderId, ghost, fromPage, fromIdx, fromFolderId, moved, startX, startY, timer } */

  function attachLongPress(node, appId, folderId) {
    var timer = null, sx = 0, sy = 0, pid = null;
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    node.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      cancel();
      timer = setTimeout(function () {
        timer = null;
        startDrag(node, appId, folderId, sx, sy);
      }, 380);
    });
    node.addEventListener('pointermove', function (e) {
      if (!timer) return;
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      node.addEventListener(t, function () { cancel(); });
    });
    /* 拖动能力需要 pointer capture，交给全局 pointermove 处理 */
    node.__lp = { cancel: cancel };
  }

  function startDrag(node, appId, folderId, x, y) {
    if (!layout) return;
    var src;
    if (appId) {
      src = findSlot(appId);
      if (!src) return;
    } else {
      src = findFolder(folderId);
      if (!src) return;
    }
    var ghost = node.cloneNode(true);
    ghost.className = 'app-item';
    ghost.id = 'drag-ghost';
    ghost.style.width = node.offsetWidth ? node.offsetWidth + 'px' : '84px';
    var rect = $screen.getBoundingClientRect ? $screen.getBoundingClientRect() : { left: 0, top: 0 };
    ghost.style.left = (x - rect.left) + 'px';
    ghost.style.top = (y - rect.top) + 'px';
    $screen.appendChild(ghost);
    node.classList.add('is-dragging');
    drag = {
      appId: appId || null, folderId: folderId || null, ghost: ghost, node: node,
      fromPage: src.page, fromIdx: src.idx, fromFolderId: src.folder ? src.folder.id : null,
      moved: false, rect: rect, target: null, hoverTimer: null, hoverEl: null
    };
    setEditing(true);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { } }
  }

  function dragMove(x, y) {
    if (!drag) return;
    drag.moved = true;
    drag.ghost.style.left = (x - drag.rect.left) + 'px';
    drag.ghost.style.top = (y - drag.rect.top) + 'px';
    var under = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    var cell = under && under.closest ? under.closest('.app-item, .slot-hint, .page, .app-grid') : null;
    if (drag.target && drag.target !== cell) drag.target.classList.remove('drop-target');
    drag.target = cell;
    if (cell && cell.classList.contains('slot-hint')) cell.classList.add('drop-target');
    else if (cell && cell.classList.contains('app-item')) {
      var isFolder = !!cell.dataset.folderId;
      cell.classList.toggle('folder-accept', !isFolder && cell.dataset.appId !== drag.appId);
      cell.classList.toggle('drop-target', isFolder);
    }
    /* 拖到分页边缘自动翻页 */
    var pw = $pages.clientWidth || 0;
    if (pw) {
      var localX = x - (($pages.getBoundingClientRect ? $pages.getBoundingClientRect().left : 0));
      if (localX > pw - 34) goPage(currentPage() + 1);
      else if (localX < 34) goPage(currentPage() - 1);
    }
  }
  function clearDragMarks() {
    if (!drag) return;
    if (drag.target) drag.target.classList.remove('drop-target', 'folder-accept');
    drag.target = null;
  }
  function dragEnd(x, y) {
    if (!drag) return;
    var d = drag;
    /* 兜底：如果一次 pointermove 都没收到（触控笔/鼠标抖动等），用松手坐标补一次落点判定 */
    if (!d.moved && typeof x === 'number' && typeof y === 'number') dragMove(x, y);
    drag = null;
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (d.node) d.node.classList.remove('is-dragging');
    var target = d.target;
    if (!d.moved || !target) { setEditing(false); renderHome(); return; }

    var accepted = false;
    try {
      if (target.classList.contains('slot-hint')) {
        accepted = moveToSlot(d, Number(target.dataset.page), Number(target.dataset.slot));
      } else if (target.classList.contains('app-item')) {
        if (target.dataset.folderId) accepted = moveIntoFolder(d, target.dataset.folderId);
        else if (target.dataset.appId && target.dataset.appId !== d.appId) accepted = makeFolder(d, target.dataset.appId);
      } else {
        /* 落在空白处：放进该页第一个空位 */
        var pg = target.dataset && target.dataset.page != null ? Number(target.dataset.page) : currentPage();
        accepted = moveToFirstEmpty(d, pg);
      }
    } catch (e) { console.error(e); phone.toast('移动失败：' + e.message, 'bad'); }
    setEditing(false);
    renderHome();
    if (accepted) { saveLayout(); }
  }

  /* 从原位置摘掉被拖的东西 */
  function detachDragged(d) {
    if (d.appId) {
      var s = findSlot(d.appId);
      if (s) {
        if (s.folder) {
          s.folder.apps = s.folder.apps.filter(function (x) { return x !== d.appId; });
          if (s.folder.apps.length <= 1) {
            var rest = s.folder.apps[0];
            layout.pages[s.page][s.idx] = rest || null;
          }
        } else {
          layout.pages[s.page][s.idx] = null;
        }
      }
      return d.appId;
    }
    var hit = findFolder(d.folderId);
    if (hit) layout.pages[hit.page][hit.idx] = null;
    return null;
  }
  function moveToSlot(d, page, slot) {
    if (isNaN(page) || isNaN(slot)) return false;
    if (page < 0 || page >= layout.pages.length) return false;
    var occupant = layout.pages[page][slot];
    if (!d.appId && isFolderId(occupant)) return false;
    /* 拖到自己原来的位置 */
    if (d.appId && occupant === d.appId) return false;
    detachDragged(d);
    if (occupant != null) {
      if (isFolderId(occupant)) { occupant.apps.push(d.appId); }
      else { placeOnEmptySlot(occupant); layout.pages[page][slot] = d.appId; }
    } else {
      layout.pages[page][slot] = d.appId;
    }
    phone.toast(d.appId ? (appCache.map[d.appId].name + ' 已移动') : '文件夹已移动', 'ok');
    return true;
  }
  function moveToFirstEmpty(d, page) {
    page = clamp(page, 0, layout.pages.length - 1);
    for (var i = 0; i < PER_PAGE; i++) {
      if (layout.pages[page][i] == null) return moveToSlot(d, page, i);
    }
    for (var p = 0; p < layout.pages.length; p++) {
      for (var j = 0; j < PER_PAGE; j++) if (layout.pages[p][j] == null) return moveToSlot(d, p, j);
    }
    return false;
  }
  function moveIntoFolder(d, folderId) {
    var hit = findFolder(folderId);
    if (!hit) return false;
    if (d.folderId) return false;                       /* 文件夹不能塞进文件夹 */
    if (hit.folder.apps.indexOf(d.appId) >= 0) return false;
    detachDragged(d);
    hit.folder.apps.push(d.appId);
    phone.toast('已放进「' + hit.folder.name + '」', 'ok');
    return true;
  }
  function makeFolder(d, otherAppId) {
    if (!d.appId) return false;
    var s2 = findSlot(otherAppId);
    if (!s2 || s2.folder) return false;
    var page = s2.page, idx = s2.idx;
    /* 顺序很重要：先把两个应用都从原位置摘下来，再把文件夹放进槽位，
       否则当 otherAppId 就占着目标槽位时，摘除动作会把刚落位的文件夹一起清掉。 */
    detachDragged(d);
    var s3 = findSlot(otherAppId);
    if (s3) {
      if (s3.folder) {
        s3.folder.apps = s3.folder.apps.filter(function (x) { return x !== otherAppId; });
        if (s3.folder.apps.length <= 1) layout.pages[s3.page][s3.idx] = s3.folder.apps[0] || null;
      } else {
        layout.pages[s3.page][s3.idx] = null;
      }
    }
    var f = newFolder(appCache.map[d.appId].name + ' 等', [otherAppId, d.appId]);
    layout.pages[page][idx] = f;
    phone.toast('已创建文件夹「' + f.name + '」', 'ok');
    return true;
  }


  /* 壁纸 / 桌面底色
     模式 mode: 'solid' 纯色（默认） | 'wallpaper' 低多边形渐变壁纸
     渐变模式下 scrim 控制压在最上面的柔光强度（越大壁纸越淡） */
  var WALLPAPERS = [
    { name: '午夜紫', c: ['#1b2350', '#4a3a86', '#8d5fa8'] },
    { name: '松林湖', c: ['#0f2b3d', '#2f7f7a', '#8ecf9e'] },
    { name: '晚霞橙', c: ['#3a1c3f', '#8a2f5e', '#e0785f'] },
    { name: '深海蓝', c: ['#12203f', '#2b4b8f', '#5cc8ff'] },
    { name: '石墨灰', c: ['#2b2b2b', '#54504a', '#a89a86'] }
  ];
  var SOLIDS = [
    { name: '柔白', c: ['#eef2fb', '#dde5f7', '#cfd9f2'] },
    { name: '薄荷', c: ['#e6f7f0', '#d2f0e6', '#bfe8dc'] },
    { name: '天蓝', c: ['#e8f2fd', '#d6e7fa', '#c4dcf6'] },
    { name: '暖沙', c: ['#fdf6ec', '#f8ecdb', '#f2e2c9'] },
    { name: '浅灰', c: ['#f5f6fa', '#eaecf3', '#dfe2ec'] }
  ];
  function pick(arr, i) {
    var n = arr.length;
    return arr[((Number(i) || 0) % n + n) % n];
  }
  function applyWallpaper() {
    var mode = Settings.get('bgMode', 'solid') === 'wallpaper' ? 'wallpaper' : 'solid';
    var root = document.documentElement;
    var wp = $('#wallpaper');
    if (mode === 'wallpaper') {
      var p = pick(WALLPAPERS, Settings.get('themeIndex', 0)).c;
      root.style.setProperty('--bg1', p[0]);
      root.style.setProperty('--bg2', p[1]);
      root.style.setProperty('--bg3', p[2]);
      if (wp) { wp.classList.add('is-gradient'); wp.style.display = ''; }
    } else {
      var s = pick(SOLIDS, Settings.get('solidIndex', 0)).c;
      root.style.setProperty('--solid1', s[0]);
      root.style.setProperty('--solid2', s[1]);
      root.style.setProperty('--solid3', s[2]);
      if (wp) { wp.classList.remove('is-gradient'); wp.style.display = ''; }
    }
    var scrim = Number(Settings.get('scrim', 0.16));
    if (!(scrim >= 0)) scrim = 0.16;
    root.style.setProperty('--scrim', String(clamp(scrim, 0, 0.9)));
    /* 只有渐变壁纸模式才需要那层柔光；纯色模式保持干净 */
    if ($screen) $screen.classList.toggle('wallpaper-on', mode === 'wallpaper');
    if ($statusbar) $statusbar.classList.add('on-dark');
    return { mode: mode, name: mode === 'wallpaper' ? pick(WALLPAPERS, Settings.get('themeIndex', 0)).name : pick(SOLIDS, Settings.get('solidIndex', 0)).name };
  }

  /* ---------------- 状态栏 / 锁屏 ---------------- */
  function tickClock() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    var t = hh + ':' + mm;
    var sb = $('#sb-time'); if (sb) sb.textContent = t;
    var lt = $('#lock-time'); if (lt) lt.textContent = t;
    if (idle.on) { var sst = $('#ss-time'); if (sst) sst.textContent = t; }
    var ld = $('#lock-date');
    if (ld) ld.textContent = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] + ' ' +
      (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function updateBattery() {
    var n = navigator;
    var bi = $('#sb-bat i');
    if (!bi) return;
    if (typeof n.getBattery === 'function') {
      n.getBattery().then(function (b) {
        bi.style.width = Math.round(b.level * 100) + '%';
        bi.style.background = b.charging ? '#3ddc97' : '';
      }).catch(function () { });
    }
  }
  function lock(on) {
    state.locked = on !== false;
    if ($lock) $lock.classList.toggle('hidden', !state.locked);
    if ($statusbar) $statusbar.classList.toggle('on-dark', state.locked);
    if (state.locked) closeApp(true);
  }
  function unlock() { lock(false); }

  /* ---------------- 应用打开 / 关闭 ---------------- */
  function openApp(id) {
    var apps = appCache ? appCache.map : (loadRegistry(), appCache.map);
    var app = apps[id];
    if (!app) { phone.toast('找不到应用：' + id, 'bad'); return; }
    if (state.current && state.current.app.id === id) return;
    if (state.current) closeApp(true);
    if (state.locked) unlock();

    var host = el('section', 'app-host');
    host.dataset.appId = id;
    var header = null, body;
    if (app.mount.__noChrome) {
      body = host;
    } else {
      header = el('header', 'app-nav');
      var back = el('button', 'nav-btn', '‹');
      back.type = 'button'; back.title = '返回桌面';
      back.addEventListener('click', function () { closeApp(); });
      var title = el('div', 'nav-title', app.name);
      var actions = el('div', 'nav-actions');
      header.appendChild(back); header.appendChild(title); header.appendChild(actions);
      body = el('div', 'app-body');
      host.appendChild(header); host.appendChild(body);
    }
    $appLayer.appendChild(host);

    var cleanups = [];
    var ctx = {
      store: makeStore(app.id),
      setTitle: function (t) { if (header) $('.nav-title', header).textContent = String(t); },
      addAction: function (label, fn, opts) {
        if (!header) return function () { };
        var b = el('button', 'ui-btn' + (opts && opts.ghost ? ' ghost' : ''), label);
        b.style.padding = '7px 13px'; b.style.fontSize = '12.5px';
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      },
      onKey: function (handler) { window.addEventListener('keydown', handler); cleanups.push(function () { window.removeEventListener('keydown', handler); }); },
      onCleanup: function (fn) { cleanups.push(fn); },
      setBodyPadding: function (p) { if (body.classList.contains('app-body')) body.style.padding = p; },
      useFullBody: function () { if (body.classList.contains('app-body')) { body.classList.add('no-pad'); body.style.overflow = 'hidden'; } },
      close: function () { closeApp(); }
    };
    state.hosts[id] = host;
    state.current = { app: app, host: host, ctx: ctx, cleanups: cleanups, note: '' };

    host.classList.add('active');
    $home.classList.add('blurred');
    if ($recents) $recents.classList.remove('show');

    try {
      app.mount(phone, body, ctx);
    } catch (e) {
      console.error(e);
      body.innerHTML = '';
      body.appendChild(el('div', 'ui-hint', '应用启动出错：' + e.message));
      phone.toast('应用启动出错：' + e.message, 'bad');
    }
    pushRecent(id);
    var cnt = $('#home-count'); if (cnt) cnt.textContent = getApps().length + ' 个应用';
  }
  function closeApp(silent) {
    var cur = state.current;
    if (!cur) return;
    state.current = null;
    cur.cleanups.forEach(function (fn) { try { fn(); } catch (e) { } });
    var host = cur.host;
    host.classList.remove('active');
    setTimeout(function () { if (host.parentNode) host.parentNode.removeChild(host); }, 220);
    delete state.hosts[cur.app.id];
    if (!state.locked) $home.classList.remove('blurred');
    if (!silent) $home.classList.remove('blurred');
  }

  /* 最近任务 */
  function pushRecent(id) {
    var list = Settings.get('recents', []) || [];
    list = list.filter(function (r) { return r.id !== id; });
    list.unshift({ id: id, at: Date.now() });
    Settings.set('recents', list.slice(0, 12));
    renderRecents();
  }
  function renderRecents() {
    if (!$recents) return;
    var wrap = $('#rec-list', $recents);
    if (!wrap) return;
    var list = Settings.get('recents', []) || [];
    wrap.innerHTML = '';
    var valid = list.filter(function (r) { return appCache.map[r.id]; });
    if (!valid.length) { wrap.appendChild(el('div', 'rec-empty', '还没有打开过任何应用')); return; }
    valid.forEach(function (r) {
      var a = appCache.map[r.id];
      var b = el('button', 'rec-item');
      b.type = 'button';
      b.appendChild(appIconNode(a, 44));
      var m = el('div', 'li-main');
      m.appendChild(el('b', null, a.name));
      m.appendChild(el('small', null, relTime(r.at) + (a.desc ? ' · ' + a.desc : '')));
      b.appendChild(m);
      b.addEventListener('click', function () { toggleRecents(false); openApp(a.id); });
      wrap.appendChild(b);
    });
  }
  function toggleRecents(on) {
    if (!$recents) return;
    var show = on === undefined ? !$recents.classList.contains('show') : !!on;
    if (show) { closeApp(true); renderRecents(); }
    $recents.classList.toggle('show', show);
  }

  /* ---------------- 吐司 / 弹窗 ---------------- */
  function toast(msg, kind) {
    if (!$toastLayer) return;
    var t = el('div', 'toast' + (kind ? ' ' + kind : ''), String(msg));
    $toastLayer.appendChild(t);
    if (kind === 'bad') console.warn('[PhoneShell]', msg);
    setTimeout(function () {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, kind === 'bad' ? 3200 : 1800);
  }
  function openModal(build) {
    return new Promise(function (resolve) {
      if (!$modal) { resolve(null); return; }
      $modal.innerHTML = '';
      $modal.classList.add('show');
      var done = function (v) { $modal.classList.remove('show'); $modal.innerHTML = ''; resolve(v); };
      build($modal, done);
    });
  }
  function alertBox(title, msg) {
    return openModal(function (layer, done) {
      var box = el('div', 'modal');
      box.appendChild(el('h3', null, title));
      var p = el('p', 'modal-msg'); p.innerHTML = md(msg || ''); box.appendChild(p);
      var acts = el('div', 'modal-actions');
      var ok = el('button', 'ui-btn', '知道了'); ok.addEventListener('click', function () { done(true); });
      acts.appendChild(ok); box.appendChild(acts); layer.appendChild(box);
    });
  }
  function confirmBox(title, msg) {
    return openModal(function (layer, done) {
      var box = el('div', 'modal');
      box.appendChild(el('h3', null, title));
      box.appendChild(el('p', 'modal-msg', msg || ''));
      var acts = el('div', 'modal-actions');
      var no = el('button', 'ui-btn ghost', '取消'); no.addEventListener('click', function () { done(false); });
      var yes = el('button', 'ui-btn', '确定'); yes.addEventListener('click', function () { done(true); });
      acts.appendChild(no); acts.appendChild(yes); box.appendChild(acts); layer.appendChild(box);
    });
  }
  function promptBox(title, defValue, opts) {
    opts = opts || {};
    return openModal(function (layer, done) {
      var box = el('div', 'modal');
      box.appendChild(el('h3', null, title));
      if (opts.hint) box.appendChild(el('p', 'modal-msg', opts.hint));
      var f;
      if (opts.multiline) { f = el('textarea', 'ui-field'); f.value = defValue || ''; }
      else { f = el('input', 'ui-field'); f.type = 'text'; f.value = defValue || ''; }
      box.appendChild(f);
      var acts = el('div', 'modal-actions');
      var no = el('button', 'ui-btn ghost', '取消'); no.addEventListener('click', function () { done(null); });
      var yes = el('button', 'ui-btn', '确定'); yes.addEventListener('click', function () { done(f.value); });
      acts.appendChild(no); acts.appendChild(yes); box.appendChild(acts); layer.appendChild(box);
      setTimeout(function () { f.focus(); f.select && f.select(); }, 30);
      f.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); done(f.value); }
      });
    });
  }

  /* ---------------- 插件 API ---------------- */
  function addApp(def, opts) {
    opts = opts || {};
    var code = opts.code || '';
    var app;
    if (typeof def.mount === 'function') {
      app = normalizeApp(def);
    } else if (code) {
      app = normalizeApp(Object.assign({}, def, { mount: compileAppCode(code) }));
    } else {
      throw new Error('addApp 需要 mount 函数或 code 源码');
    }
    app.__code = code;
    app.raw = { code: code };
    if (!appCache) loadRegistry();
    var existed = !!appCache.map[app.id];
    if (existed && appCache.map[app.id].builtin && !opts.replaceBuiltin) {
      throw new Error('与内置应用 id 冲突：' + app.id);
    }
    app.builtin = false;
    app.newAt = Date.now();
    appCache.map[app.id] = app;
    var saved = saveUserApps();
    if (layout) { normalizeLayout(layout); saveLayout(); }
    renderHome(); renderRecents();
    if (opts.silent !== true) phone.toast((existed ? '已更新应用：' : '已安装应用：') + app.name, 'ok');
    return { ok: true, id: app.id, saved: saved, app: app };
  }
  function removeApp(id) {
    if (!appCache || !appCache.map[id]) return false;
    if (appCache.map[id].builtin) { phone.toast('内置应用无法卸载', 'bad'); return false; }
    delete appCache.map[id];
    saveUserApps();
    if (layout) { normalizeLayout(layout); saveLayout(); }
    renderHome();
    return true;
  }
  function exportApp(id) {
    var a = appCache && appCache.map[id];
    if (!a) return null;
    return {
      schema: 'phoneshell.app/1',
      id: a.id, name: a.name, icon: a.icon, desc: a.desc, color: a.color, order: a.order,
      builtin: !!a.builtin,
      code: (a.raw && a.raw.code) || a.__code || (a.builtin ? builtinCodeOf(a.id) : '')
    };
  }
  function builtinCodeOf(id) {
    var list = window.PHONE_BUILTIN_APPS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].code || '';
    return '';
  }
  function exportAll() {
    return {
      schema: 'phoneshell.bundle/1',
      exportedAt: new Date().toISOString(),
      apps: getApps().map(function (a) { return exportApp(a.id); }).filter(Boolean),
      storage: (function () {
        var o = {};
        getApps().forEach(function (a) { o[a.id] = makeStore(a.id).dump(); });
        return o;
      })(),
      settings: Settings.all()
    };
  }
  function importBundle(text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    var apps = data.apps || (data.id ? [data] : []);
    var ok = 0, fail = [];
    apps.forEach(function (a) {
      try {
        if (a.builtin && appCache.map[a.id] && appCache.map[a.id].builtin) { return; }
        addApp({ id: a.id, name: a.name, icon: a.icon, desc: a.desc, color: a.color, order: a.order }, { code: a.code, silent: true });
        ok++;
      } catch (e) { fail.push((a && a.name ? a.name : '?') + '：' + e.message); }
    });
    if (data.storage) {
      Object.keys(data.storage).forEach(function (k) { lsSet(LS_PREFIX + k, JSON.stringify(data.storage[k])); });
    }
    renderHome();
    return { ok: ok, fail: fail };
  }
  /** 导出一个 Blob（二进制也能导，音频/图片用它） */
  function downloadBlob(filename, blob) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
      return true;
    } catch (e) { phone.toast('导出失败：' + e.message, 'bad'); return false; }
  }
  function download(filename, text, mime) {
    try {
      return downloadBlob(filename, new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' }));
    } catch (e) { phone.toast('导出失败：' + e.message, 'bad'); return false; }
  }
  function readFile(accept) {
    return new Promise(function (resolve) {
      var i = document.createElement('input');
      i.type = 'file'; i.accept = accept || '.json,application/json';
      i.addEventListener('change', function () {
        var f = i.files && i.files[0];
        if (!f) return resolve(null);
        var r = new FileReader();
        r.onload = function () { resolve({ name: f.name, text: String(r.result) }); };
        r.readAsText(f, 'utf-8');
      });
      i.click();
    });
  }

  /* 常见纯文本格式（阅读器用）。二进制格式（pdf/docx/epub）不做兼容。 */
  var TEXT_ACCEPT = '.txt,.text,.md,.markdown,.log,.csv,.tsv,.json,.xml,.html,.htm,.js,.css,.ini,.conf,.cfg,.srt,.ass,.vtt,.yaml,.yml,.sql,.py,.java,.c,.cpp,.h,.bat,.ps1,.mjs,text/*';

  /**
   * 读取一个本地文本文件。
   * 先按 UTF-8 读；如果出现替换字符（U+FFFD），说明多半是 GBK 编码的中文文本，再按 GBK 读一遍。
   */
  function readTextFile(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var i = document.createElement('input');
      i.type = 'file';
      i.accept = opts.accept || TEXT_ACCEPT;
      i.addEventListener('change', function () {
        var f = i.files && i.files[0];
        if (!f) return resolve(null);
        var finish = function (text, encoding) {
          resolve({ name: f.name || '未命名文件', text: String(text == null ? '' : text), size: Number(f.size) || String(text || '').length, encoding: encoding });
        };
        var r = new FileReader();
        r.onload = function () {
          var t = String(r.result);
          if (t.indexOf('\uFFFD') < 0) return finish(t, 'utf-8');
          try {
            var r2 = new FileReader();
            r2.onload = function () { finish(String(r2.result), 'gbk'); };
            r2.onerror = function () { finish(t, 'utf-8'); };
            r2.readAsText(f, 'gbk');
          } catch (e) { finish(t, 'utf-8'); }
        };
        r.onerror = function () { resolve(null); };
        r.readAsText(f, opts.encoding || 'utf-8');
      });
      i.click();
    });
  }

  /** 简单的 HTML 转纯文本（用于导入网页另存的文件） */
  function htmlToText(s) {
    s = String(s || '');
    s = s.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&');
    return s;
  }

  /**
   * 把一段长文本整理成「段落数组」：优先按行切；没有换行的长文按长度切块。
   * 阅读器用它来渲染，便于做进度、检索与划线定位。
   */
  function splitParagraphs(text, maxLen) {
    maxLen = maxLen || 420;
    var raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ').replace(/\t/g, '  ');
    var lines = raw.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i].replace(/\s+$/, '');
      if (!L.trim()) continue;
      if (L.length <= maxLen) { out.push(L); continue; }
      for (var j = 0; j < L.length; j += maxLen) out.push(L.slice(j, j + maxLen));
    }
    if (!out.length && raw.trim()) out.push(raw.trim());
    return out;
  }

  /** 导入时的文本清洗：按扩展名做基础处理（HTML 去标签），并去掉 BOM 与首尾空白 */
  function cleanImportText(name, text) {
    var s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    if (/\.(html?|xhtml)$/i.test(String(name || ''))) s = htmlToText(s);
    /* 去掉连续 3 个以上的空行，避免阅读时大片空白 */
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.replace(/^\s+/, '').replace(/\s+$/, '');
    return s;
  }

  function hostOf(url) {
    try { return String(url).replace(/^https?:\/\//i, '').split('/')[0]; } catch (e) { return ''; }
  }

  /**
   * 把一段文本压到 max 字以内：优先在句子 / 词语边界断开，末尾加省略号。
   * 用于知识卡（搜索接口的 content 字段经常是整页正文，直接显示会把卡片撑爆）。
   */
  function trimText(text, max) {
    var s = String(text == null ? '' : text);
    if (s.length <= max) return s;
    var head = s.slice(0, max);
    var cut = Math.max(
      head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('；'),
      head.lastIndexOf('\n'), head.lastIndexOf('，'), head.lastIndexOf('、'),
      head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('; '),
      head.lastIndexOf(', '), head.lastIndexOf(' ')
    );
    if (cut >= max * 0.55) head = head.slice(0, cut);
    head = head.replace(/[\s，,、；;：:。.!！?？]+$/, '');
    return head + '…';
  }

  /** 归一化空白：统一换行、压缩空格，但**保留段落换行**（卡片里要能看出分段） */
  function normText(s) {
    return String(s == null ? '' : s)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\u00a0\u3000]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }

  /**
   * 复制文本到剪贴板：优先用 navigator.clipboard，失败时退回旧式 execCommand。
   * 返回 Promise<boolean>。
   */
  function copyText(text) {
    text = String(text == null ? '' : text);
    if (!text) return Promise.resolve(false);
    var nav = (typeof navigator !== 'undefined' && navigator) || {};
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        return Promise.resolve(nav.clipboard.writeText(text)).then(function () { return true; })
          .catch(function () { return fallbackCopy(text); });
      } catch (e) { return Promise.resolve(fallbackCopy(text)); }
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      if (typeof document.execCommand === 'function') ok = !!document.execCommand('copy');
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ============================================================
     API 管理器（全机统一）
     所有需要外部接口的应用（AI 创作 / 阅读器 / 知识卡 …）都从这里取配置，
     应用内部不再各自填地址与密钥。配置存在 settings 的 'apis' 键里。
     ============================================================ */
  var API_KEY = 'apis';
  var API_BIND_KEY = 'apiBind';
  var API_PURPOSES = [
    { key: 'chat', label: '对话模型', hint: 'AI 创作的问答、阅读器的总结与划线询问都走它' },
    { key: 'write', label: '长文创作', hint: '睡前故事这类长篇朗读文稿由它创作，建议单独配一个长文模型（没配时会借用对话模型）' },
    { key: 'search', label: '联网检索', hint: '息屏知识卡的联网检索走它' },
    { key: 'tts', label: '语音合成', hint: '本地 GPT-SoVITS 等语音接口，把文稿念成音频' }
  ];
  /* 用途 → 接口类型：一个用途只挑同类型的接口，免得「语音」被对话接口顶掉 */
  var API_PURPOSE_TYPE = { chat: 'chat', write: 'write', search: 'search', tts: 'tts' };
  var API_TYPES = ['chat', 'write', 'search', 'tts'];
  var API_PRESETS = {
    chat: [
      { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      { name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
      { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
      { name: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }
    ],
    /* 长文创作：优先长上下文 / 便宜的长文模型 */
    write: [
      { name: 'DeepSeek（长文）', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: '月之暗面 Kimi（长文）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
      { name: '通义千问 Qwen-Long', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-long' },
      { name: '智谱 GLM-4-Long', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-long' },
      { name: '本地 Ollama（长文）', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:14b' }
    ],
    search: [
      { name: 'Tavily（推荐）', provider: 'tavily', baseUrl: 'https://api.tavily.com/search', model: '' },
      { name: '博查 Bocha', provider: 'bocha', baseUrl: 'https://api.bochaai.com/v1/web-search', model: '' },
      { name: 'Serper (Google)', provider: 'serper', baseUrl: 'https://google.serper.dev/search', model: '' },
      { name: 'OpenAI 兼容（模型自带联网）', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }
    ],
    /* 语音合成：默认就是本地 GPT-SoVITS（api_v2.py，端口 9880） */
    tts: [
      { name: 'GPT-SoVITS 本地（推荐）', provider: 'gpt-sovits', baseUrl: 'http://127.0.0.1:9880', model: '', tts: { apiVersion: 'v2' } },
      { name: 'GPT-SoVITS 旧版 api', provider: 'gpt-sovits', baseUrl: 'http://127.0.0.1:9880', model: '', tts: { apiVersion: 'v1' } },
      { name: 'GPT-SoVITS 局域网', provider: 'gpt-sovits', baseUrl: 'http://192.168.1.100:9880', model: '', tts: { apiVersion: 'v2' } },
      { name: 'OpenAI 兼容语音', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'tts-1', voice: 'alloy' }
    ]
  };
  var API_TYPE_LABEL = { chat: '对话模型', write: '长文创作', search: '联网检索', tts: '语音合成' };

  /* ---------------- 语音合成（TTS）默认参数 ----------------
     默认按「本地 GPT-SoVITS api_v2.py」来：python api_v2.py -a 127.0.0.1 -p 9880 */
  var TTS_DEFAULTS = {
    apiVersion: 'v2',     /* v2 = api_v2.py（推荐，/tts 接口）；v1 = api.py（根路径 /） */
    method: 'auto',       /* auto = 先试着把音频取回来，失败就直连播放；fetch = 只取数据；direct = 只直连播放 */
    refAudio: '',         /* 参考音频路径（GPT-SoVITS 所在机器上的路径） */
    promptText: '',       /* 参考音频对应的文本 */
    promptLang: 'zh',     /* 参考音频语种 */
    textLang: 'zh',       /* 要合成的文本语种 */
    textSplit: 'cut5',    /* 文本切分方式 cut0~cut5 */
    mediaType: 'wav',     /* wav / ogg / aac */
    speed: 1,             /* 语速倍数 */
    topK: 15, topP: 1, temperature: 1,
    batchSize: 1,
    streaming: false,
    gptWeights: '',       /* GPT 模型权重路径（可切换） */
    sovitsWeights: '',    /* SoVITS 模型权重路径（可切换） */
    timeout: 180
  };
  var TTS_PROVIDERS = [
    { key: 'gpt-sovits', label: 'GPT-SoVITS（本地）' },
    { key: 'openai', label: 'OpenAI 兼容语音（/audio/speech）' }
  ];
  var TTS_LANGS = [
    { key: 'zh', label: '中文' }, { key: 'en', label: '英文' }, { key: 'ja', label: '日文' },
    { key: 'ko', label: '韩文' }, { key: 'yue', label: '粤语' }, { key: 'auto', label: '多语种自动识别' },
    { key: 'all_zh', label: '全部按中文（旧版 api）' }, { key: 'all_ja', label: '全部按日文（旧版 api）' },
    { key: 'all_ko', label: '全部按韩文（旧版 api）' }, { key: 'all_yue', label: '全部按粤语（旧版 api）' }
  ];
  var TTS_SPLIT_METHODS = [
    { key: 'cut5', label: 'cut5 · 按标点切并合并（推荐）' },
    { key: 'cut0', label: 'cut0 · 整段不切' },
    { key: 'cut1', label: 'cut1 · 每 4 句切一刀' },
    { key: 'cut2', label: 'cut2 · 每 2 句切一刀' },
    { key: 'cut3', label: 'cut3 · 按句号切' },
    { key: 'cut4', label: 'cut4 · 按所有标点切' }
  ];

  /** 语音接口参数归一化：把任意来源（存档 / 草稿 / 音色预设）补齐成完整一份 */
  function normTts(raw) {
    var o = Object.assign({}, TTS_DEFAULTS, (raw && typeof raw === 'object') ? raw : {});
    function num(v, d, lo, hi) { v = Number(v); if (!isFinite(v)) v = d; return clamp(v, lo, hi); }
    return {
      apiVersion: o.apiVersion === 'v1' ? 'v1' : 'v2',
      method: ['auto', 'fetch', 'direct'].indexOf(o.method) >= 0 ? o.method : 'auto',
      refAudio: String(o.refAudio || ''),
      promptText: String(o.promptText || ''),
      promptLang: String(o.promptLang || 'zh'),
      textLang: String(o.textLang || 'zh'),
      textSplit: String(o.textSplit || 'cut5'),
      mediaType: ['wav', 'ogg', 'aac', 'raw', 'mp3'].indexOf(o.mediaType) >= 0 ? o.mediaType : 'wav',
      speed: num(o.speed, 1, 0.5, 2),
      topK: num(o.topK, 15, 1, 100),
      topP: num(o.topP, 1, 0.05, 1),
      temperature: num(o.temperature, 1, 0.05, 2),
      batchSize: num(o.batchSize, 1, 1, 20),
      streaming: o.streaming === true,
      gptWeights: String(o.gptWeights || ''),
      sovitsWeights: String(o.sovitsWeights || ''),
      timeout: num(o.timeout, 180, 10, 1800)
    };
  }

  function normApi(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var type = API_TYPES.indexOf(raw.type) >= 0 ? raw.type : 'chat';
    var defProvider = type === 'search' ? 'tavily' : (type === 'tts' ? 'gpt-sovits' : 'openai');
    var rec = {
      id: String(raw.id || uid('api')),
      name: String(raw.name || API_TYPE_LABEL[type]).slice(0, 24),
      type: type,
      provider: String(raw.provider || defProvider),
      baseUrl: String(raw.baseUrl || '').replace(/\/+$/, ''),
      key: String(raw.key || ''),
      model: String(raw.model || ''),
      temperature: raw.temperature === undefined || raw.temperature === null || raw.temperature === '' ? null : Number(raw.temperature),
      timeout: Number(raw.timeout) > 0 ? Number(raw.timeout) : 120,
      enableSearch: raw.enableSearch === true,
      voice: String(raw.voice || ''),
      note: String(raw.note || '')
    };
    if (type === 'tts') rec.tts = normTts(raw.tts);
    return rec;
  }
  function apiList() {
    var raw = Settings.get(API_KEY, []);
    if (Object.prototype.toString.call(raw) !== '[object Array]') return [];
    var out = [];
    raw.forEach(function (r) { var a = normApi(r); if (a) out.push(a); });
    return out;
  }
  function apiFind(id) {
    var list = apiList();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function apiSave(def, opts) {
    def = def || {};
    opts = opts || {};
    var list = apiList();
    var type = API_TYPES.indexOf(def.type) >= 0 ? def.type : 'chat';
    if (!String(def.name || '').trim()) throw new Error('请给这个接口起个名字');
    if (!String(def.baseUrl || '').trim()) throw new Error('请填写接口地址（Base URL）');
    if (!opts.allowIncomplete) {
      /* 语音合成走 GPT-SoVITS 时用参考音频而不是模型名，所以只有 OpenAI 兼容才要求模型 */
      if (type === 'chat' || type === 'write' || def.provider === 'openai') {
        if (!String(def.model || '').trim()) throw new Error('请填写模型名（点右边的「拉取列表」可以从接口里取回来选）');
      }
      if (type === 'tts' && def.provider !== 'openai') {
        var v = normTts(def.tts);
        /* 旧版 api.py 可以在启动参数里指定默认参考音频，所以只有 api_v2 必须填 */
        if (v.apiVersion === 'v2' && !v.refAudio) {
          throw new Error('请填写参考音频路径（GPT-SoVITS 所在机器上的那段参考音频，例如 GPT_SoVITS/pretrained_models/xxx.wav）');
        }
      }
    }
    var rec = normApi(Object.assign({ id: def.id || uid('api'), type: type }, def));
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === rec.id) idx = i;
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    Settings.set(API_KEY, list);
    return rec;
  }
  function apiRemove(id) {
    var list = apiList().filter(function (a) { return a.id !== id; });
    Settings.set(API_KEY, list);
    var b = apiBindings();
    API_PURPOSES.forEach(function (p) { if (b[p.key] === id) delete b[p.key]; });
    Settings.set(API_BIND_KEY, b);
    return true;
  }
  function apiBindings() {
    var b = Settings.get(API_BIND_KEY, {});
    return (b && typeof b === 'object') ? b : {};
  }
  function apiBind(purpose, id) {
    var b = apiBindings();
    if (id) b[purpose] = id; else delete b[purpose];
    Settings.set(API_BIND_KEY, b);
    return b;
  }
  /**
   * 取某个用途当前使用的接口。
   * 优先看绑定；没绑定就退化为「该类型里的第一个」。
   * 「长文创作」额外允许借用对话模型（opts.fallbackChat !== false），
   * 调用方可以用 `api.type !== 'write'` 判断是不是借来的 —— 界面上要说明。
   */
  function apiResolve(purpose, opts) {
    opts = opts || {};
    var want = API_PURPOSE_TYPE[purpose] || 'chat';
    var b = apiBindings();
    if (b[purpose]) {
      var hit = apiFind(b[purpose]);
      if (hit) return hit;
    }
    var list = apiList(), i;
    for (i = 0; i < list.length; i++) if (list[i].type === want) return list[i];
    if (want === 'write' && opts.fallbackChat !== false) {
      for (i = 0; i < list.length; i++) if (list[i].type === 'chat') return list[i];
    }
    return null;
  }
  /** 老版本把接口填在「AI 创作」自己的设置里，这里做一次性迁移 */
  function apiMigrate() {
    if (apiList().length) return;
    var base = Settings.get('ai.baseUrl', '');
    var key = Settings.get('ai.key', '');
    var model = Settings.get('ai.model', '');
    if (!base && !key) return;
    try {
      var rec = apiSave({
        name: 'AI 创作（旧配置迁移）', type: 'chat', provider: 'openai',
        baseUrl: base || 'https://api.deepseek.com/v1', key: key, model: model || 'deepseek-chat',
        temperature: Settings.get('ai.temperature', null)
      });
      apiBind('chat', rec.id);
      phone.toast('已把「AI 创作」里的旧接口配置迁移到「设置 → API 管理」', 'ok');
    } catch (e) { console.warn('[PhoneShell] 旧接口配置迁移失败：', e); }
  }

  function netError(e) {
    var m = e && e.message ? e.message : String(e);
    if (e && e.name === 'AbortError') return new Error('请求超时或被取消（可在接口设置里调整超时时间）');
    if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(m)) {
      return new Error('网络请求被拒绝（Failed to fetch）。常见原因：1) 接口不允许浏览器跨域（CORS）；2) 用 file:// 打开被浏览器拦截；3) 接口地址不可达。');
    }
    return e instanceof Error ? e : new Error(m);
  }
  function apiHeader(extra) {
    var h = { 'Content-Type': 'application/json' };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function withTimeout(api, run) {
    var secs = Number(api && api.timeout) > 0 ? Number(api.timeout) : 120;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) { } } }, secs * 1000);
    return run(ctrl ? ctrl.signal : undefined).then(function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw netError(e); });
  }
  function readJson(res) {
    return res.text().then(function (t) {
      if (!res.ok) throw new Error('接口返回 HTTP ' + res.status + '：' + String(t).slice(0, 300));
      try { return JSON.parse(t); } catch (e) { throw new Error('接口返回的不是 JSON：' + String(t).slice(0, 200)); }
    });
  }

  /** 调用 OpenAI 兼容的 /chat/completions，返回模型文本 */
  function apiChat(api, messages, opts) {
    opts = opts || {};
    if (!api) return Promise.reject(new Error('还没有配置对话接口。请到「设置 → API 管理」里添加一个对话模型。'));
    if (!api.baseUrl) return Promise.reject(new Error('接口「' + api.name + '」还没有填接口地址'));
    if (!api.model) return Promise.reject(new Error('接口「' + api.name + '」还没有填模型名'));
    var body = { model: api.model, messages: messages };
    if (api.temperature !== null && isFinite(api.temperature)) body.temperature = api.temperature;
    if (opts.json) body.response_format = { type: 'json_object' };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (api.enableSearch) {
      /* 通义千问 / 智谱等兼容接口用这个开关打开联网 */
      body.enable_search = true;
    }
    return withTimeout(api, function (signal) {
      return fetch(api.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: apiHeader({ 'Authorization': 'Bearer ' + (api.key || 'none') }),
        body: JSON.stringify(body),
        signal: signal
      });
    }).then(readJson).then(function (data) {
      var c = (data.choices && data.choices[0] && (data.choices[0].message || {}).content) || data.output_text || '';
      if (!c) throw new Error('接口没有返回内容');
      return String(c);
    });
  }

  /** 调一次联网检索，返回 { items:[{title,url,snippet,date,source}], answer } */
  function apiSearch(api, query, opts) {
    opts = opts || {};
    if (!api) return Promise.reject(new Error('还没有配置联网检索接口。请到「设置 → API 管理」里添加一个（如 Tavily / 博查 / Serper）。'));
    var count = clamp(Number(opts.count) || 5, 1, 10);
    var provider = api.provider || 'tavily';
    var url = api.baseUrl;
    if (provider === 'openai') return apiSearchByModel(api, query, count);

    var body, headers;
    if (provider === 'bocha') {
      body = { query: query, count: count, summary: true, freshness: 'noLimit' };
      headers = apiHeader({ 'Authorization': 'Bearer ' + (api.key || '') });
    } else if (provider === 'serper') {
      body = { q: query, num: count };
      headers = apiHeader({ 'X-API-KEY': api.key || '' });
    } else {
      provider = 'tavily';
      body = { api_key: api.key || '', query: query, max_results: count, search_depth: 'basic', include_answer: true };
      headers = apiHeader();
    }
    return withTimeout(api, function (signal) {
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: signal });
    }).then(readJson).then(function (data) {
      return { items: parseSearchItems(provider, data), answer: String(data.answer || data.answer_text || '') };
    });
  }
  function parseSearchItems(provider, data) {
    var items = [];
    function push(title, u, snippet, date) {
      /* 标题压成一行；摘要用 normText：压缩空格但保留段落换行，卡片里要能看出分段 */
      title = normText(title).replace(/\n+/g, ' ');
      snippet = normText(snippet);
      if (!title && !snippet) return;
      items.push({ title: title || snippet.slice(0, 30), url: String(u || ''), snippet: snippet, date: normText(date) });
    }
    if (provider === 'bocha') {
      var pages = (data.data && data.data.webPages && data.data.webPages.value) || data.webPages || [];
      if (Object.prototype.toString.call(pages) !== '[object Array]') pages = [];
      pages.forEach(function (p) { push(p.name || p.title, p.url, p.summary || p.snippet, p.datePublished); });
    } else if (provider === 'serper') {
      (data.organic || []).forEach(function (p) { push(p.title, p.link, p.snippet, p.date); });
    } else {
      var arr = data.results || data.data || [];
      if (Object.prototype.toString.call(arr) !== '[object Array]') arr = [];
      arr.forEach(function (p) { push(p.title, p.url, p.content || p.snippet, p.published_date); });
    }
    return items;
  }
  /** 用「自带联网的对话模型」当检索接口：让它返回 JSON 条目 */
  function apiSearchByModel(api, query, count) {
    var sys = '你是联网检索助手。请检索最新信息，只输出 JSON，不要解释、不要 markdown 围栏。' +
      '格式：{"items":[{"title":"标题","url":"来源链接","snippet":"80字以内的摘要","date":"日期"}]}';
    var user = '检索「' + query + '」，给我 ' + count + ' 条最相关的结果，按相关度排序。' +
      '如果你无法真正联网，就基于你的知识给出最接近的条目，url 留空。';
    return apiChat(api, [{ role: 'system', content: sys }, { role: 'user', content: user }], { json: true })
      .then(function (text) {
        var o = null;
        try { o = parseLooseJson(text); } catch (e) { o = null; }
        var arr = (o && (o.items || o.results || o.data)) || [];
        if (Object.prototype.toString.call(arr) !== '[object Array]') arr = [];
        var items = [];
        arr.forEach(function (p) {
          if (!p || typeof p !== 'object') return;
          var t = String(p.title || '').trim(), s = String(p.snippet || p.summary || p.content || '').trim();
          if (!t && !s) return;
          items.push({ title: t || s.slice(0, 30), url: String(p.url || ''), snippet: s, date: String(p.date || '') });
        });
        return { items: items.slice(0, count), answer: '' };
      });
  }
  /** 宽松 JSON 解析：允许模型返回 ```json 围栏或前后废话 */
  function parseLooseJson(text) {
    var s = String(text || '').trim();
    var f = s.match(/```[a-zA-Z]*\s*([\s\S]*?)\s*```/);
    if (f) s = f[1].trim();
    try { return JSON.parse(s); } catch (e) { }
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) {
      var raw = s.slice(i, j + 1);
      try { return JSON.parse(raw); } catch (e2) { }
      var fixed = raw.replace(/"((?:[^"\\]|\\.)*)"/g, function (_, b) {
        return '"' + b.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t') + '"';
      });
      try { return JSON.parse(fixed); } catch (e3) { }
    }
    var a = s.indexOf('['), b2 = s.lastIndexOf(']');
    if (a >= 0 && b2 > a) { try { return { items: JSON.parse(s.slice(a, b2 + 1)) }; } catch (e4) { } }
    throw new Error('模型没有返回可解析的 JSON');
  }

  /** 询问对话接口：question 里可以带上下文（划线内容等） */
  function apiAsk(question, opts) {
    opts = opts || {};
    var api = opts.api || apiResolve(opts.purpose || 'chat');
    if (!api) return Promise.reject(new Error('还没有配置对话接口。请到「设置 → API 管理」里添加一个对话模型。'));
    var sys = opts.system || '你是一个中文助手。回答要准确、简洁、有条理，可用 Markdown 列表。';
    return apiChat(api, [{ role: 'system', content: sys }, { role: 'user', content: String(question) }], { json: opts.json, maxTokens: opts.maxTokens });
  }

  /** 接口连通性自检，返回一句中文结论 */
  function apiTest(id) {
    var api = typeof id === 'string' ? apiFind(id) : id;
    if (!api) return Promise.reject(new Error('找不到这个接口'));
    /* ttsTest 定义在后面，但函数声明会提升，这里可以直接用 */
    if (api.type === 'tts') return ttsTest(api).then(function (r) { return r.msg; });
    if (api.type === 'search') {
      return apiSearch(api, '今天的新闻', { count: 2 }).then(function (r) {
        if (!r.items.length) throw new Error('接口通了，但没有返回任何结果，请检查 Key 或查询参数');
        return '检索正常，返回 ' + r.items.length + ' 条；示例：' + r.items[0].title;
      });
    }
    return apiChat(api, [{ role: 'user', content: '只回复两个字：正常' }], {})
      .then(function (t) { return '对话正常，模型回复：' + String(t).trim().slice(0, 40); });
  }

  /**
   * 拉取接口支持的模型列表（OpenAI 兼容的 GET /models）。
   * 兼容 {data:[{id}]} / {models:[{name}]} / {data:["x"]} 几种返回形状。
   */
  function apiModels(idOrApi) {
    var api = typeof idOrApi === 'string' ? apiFind(idOrApi) : idOrApi;
    if (!api) return Promise.reject(new Error('找不到这个接口'));
    if (!api.baseUrl) return Promise.reject(new Error('请先填写接口地址'));
    /* 拉列表是轻量请求，超时压到 30 秒，免得干等 */
    var probe = Object.assign({}, api, { timeout: Math.min(Number(api.timeout) > 0 ? Number(api.timeout) : 120, 30) });
    var url = api.baseUrl.replace(/\/+$/, '') + '/models';
    return withTimeout(probe, function (signal) {
      return fetch(url, {
        method: 'GET',
        headers: apiHeader({ 'Authorization': 'Bearer ' + (api.key || 'none') }),
        signal: signal
      });
    }).then(readJson).then(function (data) {
      var arr = data.data || data.models || data.model_list || [];
      if (Object.prototype.toString.call(arr) !== '[object Array]') arr = [];
      var out = [];
      arr.forEach(function (m) {
        var id = (typeof m === 'string') ? m : (m && (m.id || m.name || m.model)) || '';
        id = String(id).trim();
        if (id && out.indexOf(id) < 0) out.push(id);
      });
      if (!out.length) throw new Error('这个接口没有返回模型列表（部分服务不提供 /models），请手动填写模型名');
      out.sort();
      return out;
    });
  }

  /* ============================================================
     语音合成（TTS）
     - 本地 GPT-SoVITS：api_v2.py 的 GET /tts（老版 api.py 用根路径 /）
       python api_v2.py -a 127.0.0.1 -p 9880
     - OpenAI 兼容：POST {baseUrl}/audio/speech
     浏览器直连本地服务有两个现实问题，这里都绕开了：
       ① 本地服务默认没开跨域（CORS）→ 可以改用「直连播放」把地址交给 <audio>
       ② 长文本一次合成慢且容易断 → 上层按句切段，逐段合成、边生成边播
     ============================================================ */
  function ttsProviderLabel(key) {
    for (var i = 0; i < TTS_PROVIDERS.length; i++) if (TTS_PROVIDERS[i].key === key) return TTS_PROVIDERS[i].label;
    return key || '';
  }
  function queryString(params) {
    var out = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    return out.join('&');
  }
  function ttsAudioMime(mediaType) {
    var m = String(mediaType || 'wav').toLowerCase();
    if (m === 'ogg') return 'audio/ogg';
    if (m === 'aac') return 'audio/aac';
    if (m === 'mp3') return 'audio/mpeg';
    return 'audio/wav';
  }
  /**
   * 拼一个「直连播放」用的语音地址（GPT-SoVITS 是 GET 接口）。
   * 这个地址直接丢给 <audio src> 就能播，**不需要接口开放跨域**。
   */
  function ttsUrl(api, text, opts) {
    if (!api) throw new Error('还没有配置语音合成接口。请到「设置 → API 管理」里添加一个（如本地 GPT-SoVITS）。');
    if (!api.baseUrl) throw new Error('接口「' + api.name + '」还没有填接口地址');
    if ((api.provider || 'gpt-sovits') === 'openai') {
      throw new Error('「OpenAI 兼容语音」只能通过接口把音频取回来，不能直接用播放器地址播放');
    }
    var o = Object.assign({}, normTts(api.tts), opts || {});
    var base = api.baseUrl.replace(/\/+$/, '');
    var seg = String(text == null ? '' : text);
    if (o.apiVersion === 'v1') {
      return base + '/?' + queryString({
        refer_wav_path: o.refAudio, prompt_text: o.promptText, prompt_language: o.promptLang,
        text: seg, text_language: o.textLang, speed: o.speed,
        top_k: o.topK, top_p: o.topP, temperature: o.temperature
      });
    }
    return base + '/tts?' + queryString({
      text: seg, text_lang: o.textLang, ref_audio_path: o.refAudio,
      prompt_lang: o.promptLang, prompt_text: o.promptText,
      text_split_method: o.textSplit, batch_size: o.batchSize,
      media_type: o.mediaType, streaming_mode: o.streaming ? 'true' : 'false',
      speed_factor: o.speed, top_k: o.topK, top_p: o.topP, temperature: o.temperature
    });
  }
  /** 把「取音频」阶段的报错翻成人话（尤其要点出跨域这回事） */
  function ttsNetError(e, api) {
    var m = e && e.message ? e.message : String(e);
    if (e && e.name === 'AbortError') return new Error('语音合成超时（可在接口里把超时时间调大，或把每段文字改短一点）');
    if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(m)) {
      return new Error('取不到音频：连不上「' + api.name + '」（' + api.baseUrl + '）。\n' +
        '① 先确认 GPT-SoVITS 已经启动、地址端口正确；② 如果服务是通的，多半是它没开放跨域（CORS），浏览器会拦下取音频的请求 —— ' +
        '把这个语音接口的「取音频方式」改成「直连播放」就行。\n' +
        '③ 嫌每次手动开麻烦：在「设置 → API 管理 → 同步启动」里填好 GPT-SoVITS 的目录与启动命令，导出配置文件放进小手机文件夹，' +
        '以后双击「启动小手机.bat」会自动把它一起拉起来。');
    }
    return e instanceof Error ? e : new Error(m);
  }
  /**
   * 合成一段语音，把音频真的取回来。成功返回 { url, blob, bytes, mime, via:'fetch' }。
   * 取不回来时抛中文错误（见 ttsNetError）。
   */
  function ttsSynth(api, text, opts) {
    opts = opts || {};
    if (!api) return Promise.reject(new Error('还没有配置语音合成接口。请到「设置 → API 管理」里添加一个（如本地 GPT-SoVITS）。'));
    if (!api.baseUrl) return Promise.reject(new Error('接口「' + api.name + '」还没有填接口地址'));
    var seg = String(text == null ? '' : text);
    if (!seg.trim()) return Promise.reject(new Error('这段文字是空的，没有可合成的内容'));
    var provider = api.provider || 'gpt-sovits';
    var o = Object.assign({}, normTts(api.tts), opts);
    var probe = Object.assign({}, api, { timeout: clamp(Number(o.timeout) || 180, 10, 1800) });
    var mime = ttsAudioMime(provider === 'openai' ? (o.mediaType === 'wav' ? 'wav' : o.mediaType) : o.mediaType);
    var req;
    try {
      if (provider === 'openai') {
        var url = api.baseUrl.replace(/\/+$/, '') + '/audio/speech';
        var body = {
          model: api.model || 'tts-1', input: seg,
          voice: api.voice || 'alloy',
          response_format: (o.mediaType === 'ogg' || o.mediaType === 'mp3' || o.mediaType === 'aac') ? o.mediaType : 'wav'
        };
        req = function (signal) {
          return fetch(url, {
            method: 'POST',
            headers: apiHeader({ 'Authorization': 'Bearer ' + (api.key || 'none') }),
            body: JSON.stringify(body), signal: signal
          });
        };
      } else {
        var gurl = ttsUrl(api, seg, opts);
        req = function (signal) { return fetch(gurl, { method: 'GET', signal: signal }); };
      }
    } catch (e) { return Promise.reject(e); }

    return withTimeout(probe, req).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('语音接口返回 HTTP ' + res.status + '：' + String(t).slice(0, 300));
        });
      }
      return res.arrayBuffer();
    }).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('语音接口返回了空音频（检查一下参考音频路径与文本语种）');
      var blob = new Blob([buf], { type: mime });
      return { url: URL.createObjectURL(blob), blob: blob, bytes: buf.byteLength, mime: mime, via: 'fetch' };
    }, function (e) { throw ttsNetError(e, api); });
  }
  /**
   * 切换 GPT / SoVITS 权重（模型选择）。
   * 本地接口多半没开跨域 → 先用普通请求读返回；读不到再补发一次 no-cors 的请求，只求把指令送到。
   */
  function ttsSetWeights(api, weights) {
    if (!api) return Promise.reject(new Error('还没有配置语音合成接口'));
    if (!api.baseUrl) return Promise.reject(new Error('请先填写接口地址'));
    weights = weights || {};
    var base = api.baseUrl.replace(/\/+$/, '');
    var probe = Object.assign({}, api, { timeout: 60 });
    var jobs = [];
    function one(kind, path) {
      var ep = kind === 'gpt' ? '/set_gpt_weights?weights_path=' : '/set_sovits_weights?weights_path=';
      var url = base + ep + encodeURIComponent(path);
      return withTimeout(probe, function (signal) { return fetch(url, { method: 'GET', signal: signal }); })
        .then(function (res) { return res.text(); })
        .then(function (t) {
          var bad = /fail|error|exception/i.test(String(t));
          return { kind: kind, ok: !bad, msg: bad ? ('切换失败：' + String(t).slice(0, 160)) : '切换成功' };
        })
        .catch(function () {
          /* 跨域读不到返回，但请求本身大概率已经发出去 → 再发一次 no-cors */
          try { fetch(url, { method: 'GET', mode: 'no-cors' }); } catch (e) { }
          return { kind: kind, ok: null, msg: '已发送切换请求，但本地接口没开放跨域，读不到返回结果' };
        });
    }
    if (weights.gpt) jobs.push(one('gpt', weights.gpt));
    if (weights.sovits) jobs.push(one('sovits', weights.sovits));
    if (!jobs.length) return Promise.reject(new Error('没有填写要切换的模型权重路径'));
    return Promise.all(jobs).then(function (list) {
      return { ok: list.every(function (x) { return x.ok !== false; }), lines: list };
    });
  }
  /** 语音接口自检：合成一句短话，返回 { msg, url, bytes, mime } */
  function ttsTest(api, text) {
    var probeText = text || '你好，我是小手机，语音接口已经连通了。';
    return ttsSynth(api, probeText, {}).then(function (r) {
      return {
        msg: '语音接口正常：取回 ' + Math.max(1, Math.round(r.bytes / 1024)) + ' KB 音频（' + r.mime + '）。',
        url: r.url, bytes: r.bytes, mime: r.mime
      };
    });
  }

  /* ---------------- 音色库（参考音频预设） ----------------
     换「音色」= 换参考音频 + 参考文本。存在 settings 的 ttsVoices 键里，
     设置页与睡前故事应用共用。 */
  var VOICE_KEY = 'ttsVoices';
  var VOICE_DEFAULT_KEY = 'ttsVoiceDefault';
  function voiceList() {
    var raw = Settings.get(VOICE_KEY, []);
    if (Object.prototype.toString.call(raw) !== '[object Array]') return [];
    var out = [];
    raw.forEach(function (v) {
      if (!v || typeof v !== 'object') return;
      out.push({
        id: String(v.id || uid('voice')),
        name: String(v.name || '未命名音色').slice(0, 20),
        refAudio: String(v.refAudio || ''),
        promptText: String(v.promptText || ''),
        promptLang: String(v.promptLang || 'zh'),
        textLang: String(v.textLang || 'zh'),
        textSplit: String(v.textSplit || 'cut5'),
        speed: Number(v.speed) > 0 ? clamp(Number(v.speed), 0.5, 2) : 1,
        note: String(v.note || '')
      });
    });
    return out;
  }
  function voiceGet(id) {
    var list = voiceList();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function voiceSave(def) {
    def = def || {};
    if (!String(def.name || '').trim()) throw new Error('请给这个音色起个名字');
    if (!String(def.refAudio || '').trim()) throw new Error('请填写参考音频路径');
    var list = voiceList();
    var rec = {
      id: String(def.id || uid('voice')),
      name: String(def.name).slice(0, 20),
      refAudio: String(def.refAudio),
      promptText: String(def.promptText || ''),
      promptLang: String(def.promptLang || 'zh'),
      textLang: String(def.textLang || 'zh'),
      textSplit: String(def.textSplit || 'cut5'),
      speed: Number(def.speed) > 0 ? clamp(Number(def.speed), 0.5, 2) : 1,
      note: String(def.note || '')
    };
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === rec.id) idx = i;
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    Settings.set(VOICE_KEY, list);
    return rec;
  }
  function voiceRemove(id) {
    Settings.set(VOICE_KEY, voiceList().filter(function (v) { return v.id !== id; }));
    if (Settings.get(VOICE_DEFAULT_KEY, '') === id) Settings.set(VOICE_DEFAULT_KEY, '');
    return true;
  }
  function voiceDefaultId() {
    var id = String(Settings.get(VOICE_DEFAULT_KEY, '') || '');
    if (id && voiceGet(id)) return id;
    var list = voiceList();
    return list.length ? list[0].id : '';
  }
  function setDefaultVoice(id) {
    Settings.set(VOICE_DEFAULT_KEY, id ? String(id) : '');
    return voiceDefaultId();
  }
  /** 取某个音色对应的语音参数（可直接合并进接口的 tts 字段） */
  function voiceToTts(id) {
    var v = voiceGet(id) || voiceGet(voiceDefaultId());
    if (!v) return null;
    return {
      id: v.id, name: v.name, refAudio: v.refAudio, promptText: v.promptText,
      promptLang: v.promptLang, textLang: v.textLang, textSplit: v.textSplit, speed: v.speed
    };
  }

  /**
   * 把长文切成适合语音合成的小段：
   * 先按段落分，再按句末标点分，然后把短句拼回 max 字左右的一段。
   * 直接按字数硬切会把句子拦腰截断，读出来会很怪，所以尽量在标点处断开。
   */
  function splitForTTS(text, max) {
    max = clamp(Number(max) || 60, 20, 400);
    var raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[\t\u3000]/g, ' ');
    var out = [];
    function push(s) {
      s = String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
      if (s) out.push(s);
    }
    function hardSplit(s) {
      while (s.length > max) {
        var head = s.slice(0, max);
        var cut = Math.max(
          head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf(','),
          head.lastIndexOf('；'), head.lastIndexOf(' '), head.lastIndexOf('：')
        );
        if (cut < Math.floor(max * 0.5)) cut = max - 1;
        push(s.slice(0, cut + 1));
        s = s.slice(cut + 1);
      }
      push(s);
    }
    raw.split(/\n+/).forEach(function (para) {
      para = para.replace(/[ \f\v]+/g, ' ').replace(/^\s+|\s+$/g, '');
      if (!para) return;
      /* 按句末标点切开，标点跟着上一句走 */
      var sentences = para.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) || [para];
      var buf = '';
      sentences.forEach(function (s) {
        s = s.replace(/^\s+|\s+$/g, '');
        if (!s) return;
        if (s.length > max) {
          if (buf) { push(buf); buf = ''; }
          hardSplit(s);
          return;
        }
        if ((buf + s).length > max) { push(buf); buf = s; }
        else buf += s;
      });
      if (buf) push(buf);
    });
    return out;
  }

  /* ============================================================
     GPT-SoVITS「同步启动」（配置桥）
     浏览器没法启动本机进程，所以「打开手机时顺便把 GPT-SoVITS 拉起来」
     这件事由启动器 .bat 干：
       设置页把下面这份配置导出成 gptsovits-launch.ini → 放进小手机文件夹
       → 启动器读它，先探测端口，没在跑就按 command 拉起来，等它就绪再打开手机。
     ============================================================ */
  var GSV_KEY = 'gsvBoot';
  var GSV_LAUNCHER = '同步启动GPT-SoVITS.bat';
  var GSV_INI_NAME = 'gptsovits-launch.ini';
  var GSV_DEFAULTS = {
    enabled: false,
    host: '127.0.0.1',
    port: 9880,
    workdir: '',
    command: 'python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml',
    wait: 90,
    onFail: 'open'          /* 等超时后：open = 照样打开手机；stop = 停下来等用户处理 */
  };
  var GSV_COMMANDS = [
    { name: '官方 api_v2（python）', cmd: 'python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml' },
    { name: '整合包便携运行时', cmd: 'runtime\\python.exe api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml' },
    { name: 'venv 虚拟环境', cmd: '.\\venv\\Scripts\\python.exe api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml' },
    { name: '旧版 api.py', cmd: 'python api.py -a 127.0.0.1 -p 9880' },
    { name: '整合包一键脚本（含 WebUI）', cmd: 'go-webui.bat' }
  ];
  function gsvConfig() {
    var raw = Settings.get(GSV_KEY, null);
    var o = Object.assign({}, GSV_DEFAULTS, (raw && typeof raw === 'object') ? raw : {});
    var port = parseInt(o.port, 10);
    return {
      enabled: o.enabled === true,
      host: String(o.host || GSV_DEFAULTS.host).replace(/^\s+|\s+$/g, ''),
      port: (isFinite(port) && port > 0 && port < 65536) ? port : GSV_DEFAULTS.port,
      workdir: String(o.workdir || '').replace(/^\s+|\s+$/g, ''),
      command: String(o.command || GSV_DEFAULTS.command).replace(/^\s+|\s+$/g, '') || GSV_DEFAULTS.command,
      wait: clamp(parseInt(o.wait, 10) || GSV_DEFAULTS.wait, 10, 600),
      onFail: o.onFail === 'stop' ? 'stop' : 'open'
    };
  }
  function gsvSave(patch) {
    var next = Object.assign(gsvConfig(), patch || {});
    Settings.set(GSV_KEY, next);
    return gsvConfig();
  }
  /** 从语音接口的地址里猜主机与端口（设置页有「从语音接口读取」按钮） */
  function gsvFromUrl(url) {
    var s = String(url || '').replace(/^\s+|\s+$/g, '');
    if (!s) return null;
    var m = s.match(/^[a-zA-Z]+:\/\/([^/:?#]+)(?::(\d+))?/);
    if (!m) return null;
    return { host: m[1], port: m[2] ? parseInt(m[2], 10) : (s.indexOf('https:') === 0 ? 443 : 80) };
  }
  /** 生成给启动器读的 ini（纯 key=value，方便 bat 解析） */
  function gsvIni(cfg) {
    var o = cfg ? Object.assign(gsvConfig(), cfg) : gsvConfig();
    return [
      '# 小手机 PhoneShell · GPT-SoVITS 同步启动配置',
      '# 由「设置 → API 管理 → 同步启动」生成。',
      '# 把这个文件放到 phone.html 同一个文件夹里，之后双击「启动小手机.bat」',
      '# 就会先探测下面的地址，没在跑就按 command 拉起来，等它就绪再打开手机。',
      '# 以 # 开头的行是注释；等号两边不要加多余空格。',
      'enabled=' + (o.enabled ? '1' : '0'),
      'host=' + o.host,
      'port=' + o.port,
      'workdir=' + o.workdir,
      'command=' + o.command,
      'wait=' + o.wait,
      'onfail=' + o.onFail,
      ''
    ].join('\r\n');
  }
  /**
   * 探测语音服务是否在跑。
   * 用 no-cors 的 GET：端口没开 → 请求直接失败；服务在跑 → 哪怕返回 400/404 也算通。
   * 所以这个探测**不需要服务端开跨域**。
   */
  function gsvPing(target) {
    var url = '';
    if (typeof target === 'string') {
      var guess = gsvFromUrl(target);
      url = guess ? (target.indexOf('://') >= 0 ? target : 'http://' + target) : '';
    } else if (target && target.baseUrl) {
      url = target.baseUrl;
    } else {
      var a = apiResolve('tts');
      url = a ? a.baseUrl : '';
    }
    if (!url) return Promise.reject(new Error('还没有配置语音接口地址'));
    var base = url.replace(/\/+$/, '');
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) { } } }, 4000);
    return fetch(base + '/control?command=probe', {
      method: 'GET', mode: 'no-cors', signal: ctrl ? ctrl.signal : undefined
    }).then(function () { clearTimeout(timer); return { on: true, url: base }; },
      function () { clearTimeout(timer); return { on: false, url: base }; });
  }

  var gsv = {
    config: gsvConfig,
    save: gsvSave,
    defaults: function () { return Object.assign({}, GSV_DEFAULTS); },
    commands: function () { return GSV_COMMANDS.slice(); },
    fromUrl: gsvFromUrl,
    ini: gsvIni,
    iniName: function () { return GSV_INI_NAME; },
    launcher: function () { return GSV_LAUNCHER; },
    ping: gsvPing
  };

  var apis = {
    list: apiList,
    get: apiFind,
    save: apiSave,
    remove: apiRemove,
    bindings: apiBindings,
    bind: apiBind,
    resolve: apiResolve,
    purposes: function () { return API_PURPOSES.slice(); },
    purposeType: function (p) { return API_PURPOSE_TYPE[p] || 'chat'; },
    types: function () { return API_TYPES.slice(); },
    presets: function (type) { return (API_PRESETS[type || 'chat'] || []).slice(); },
    typeLabel: function (t) { return API_TYPE_LABEL[t] || t; },
    chat: apiChat,
    /** 长文创作：与对话接口同协议，但用「长文创作」用途的接口 */
    write: function (api, messages, opts) {
      if (!api) return Promise.reject(new Error('还没有配置长文创作接口。请到「设置 → API 管理」里添加一个长文模型（也可以把「对话模型」绑定给它）。'));
      return apiChat(api, messages, opts);
    },
    search: apiSearch,
    ask: apiAsk,
    test: apiTest,
    models: apiModels,
    migrate: apiMigrate,
    parseLooseJson: parseLooseJson,
    tts: ttsSynth,
    ttsUrl: ttsUrl,
    ttsTest: ttsTest,
    setWeights: ttsSetWeights
  };

  /* 语音相关对外入口：phone.tts.* */
  var ttsApi = {
    defaults: function () { return Object.assign({}, TTS_DEFAULTS); },
    normalize: normTts,
    providerLabel: ttsProviderLabel,
    providers: function () { return TTS_PROVIDERS.slice(); },
    langs: function () { return TTS_LANGS.slice(); },
    splitMethods: function () { return TTS_SPLIT_METHODS.slice(); },
    url: ttsUrl,
    synth: ttsSynth,
    test: ttsTest,
    setWeights: ttsSetWeights,
    split: splitForTTS,
    voices: voiceList,
    voiceGet: voiceGet,
    voiceSave: voiceSave,
    voiceRemove: voiceRemove,
    defaultVoiceId: voiceDefaultId,
    setDefaultVoice: setDefaultVoice,
    voiceToTts: voiceToTts
  };

  /* ============================================================
     闲置息屏屏保 + 近期知识卡
     一段时间没有操作 → 屏幕进入息屏状态，同时显示一组知识卡。
     知识卡由「联网检索」接口取回，10 张为一组；本组全部读完后
     才会生成下一组。
     ============================================================ */
  var K_KEY = 'knowledge';
  var K_SEEN_KEY = 'knowledgeSeen';   /* 已经给用户看过的卡片（跨组去重用） */
  var K_ROUND_KEY = 'knowledgeRound';
  var IDLE_DEFAULT = 60;          /* 默认 60 秒无操作息屏 */
  var K_SUMMARY_MAX = 110;        /* 没润色时一张卡最多显示多少字的摘要 */
  var K_TITLE_MAX = 46;
  var K_FULL_MAX = 1500;          /* 「展开全文」最多保留多少字 */
  var K_SEEN_MAX = 120;           /* 最多记住多少张看过的卡 */
  var idle = { last: Date.now(), on: false, timer: null, bound: false };
  var kBusy = false, kErr = '', kGot = 0, kTotal = 0, kExpanded = false;
  /* 每个话题准备几种说法，每生成一组换一种 —— 同一个检索词反复查，接口自然返回同一批内容 */
  var K_TOPICS = [
    { cat: '热点', o: 0, qs: ['今天国内外的头条新闻', '最近一周的重要新闻', '当前最受关注的新闻事件'] },
    { cat: '科技', o: 1, qs: ['最近人工智能与科技领域的重要进展', '前沿科技的新突破', '科技行业最近发生了什么'] },
    { cat: '冷知识', o: 2, qs: ['有趣的冷知识', '少有人知的冷门知识', '生活里反直觉的小知识'] },
    { cat: '历史', o: 3, qs: ['历史上有意思的事件或人物', '被忽略的历史细节', '考古与史料里的新发现'] },
    { cat: '天文', o: 4, qs: ['天文与宇宙探索的最新发现', '航天领域最近的任务与成果', '天文学界的新观测结果'] },
    { cat: '自然', o: 5, qs: ['动物植物与自然界的奇闻', '生态与物种的有趣研究', '自然界的罕见现象'] },
    { cat: '地理', o: 6, qs: ['世界各地的地理与人文风物', '奇特的地理景观与冷门地点', '不同地区的风土人情'] },
    { cat: '健康', o: 7, qs: ['健康与生活的实用小常识', '医学与营养领域的新结论', '日常作息与身体的常见疑问'] },
    { cat: '财经', o: 8, qs: ['经济与商业领域的新动向', '产业与市场最近的变化', '财经领域值得关注的趋势'] },
    { cat: '文化', o: 9, qs: ['文化艺术与考古领域的新发现', '文学艺术圈最近的话题', '博物馆与文化遗产的新消息'] }
  ];

  function idleSeconds() {
    var v = Settings.get('idleSeconds', IDLE_DEFAULT);
    v = Number(v);
    if (!isFinite(v) || v < 0) v = IDLE_DEFAULT;
    return v;
  }
  function markActivity() {
    /* 只记录「有人在动」，退出息屏由键盘和屏保上的按钮负责：
       用户要求鼠标动一下不能退出，要按退出键才退出 */
    idle.last = Date.now();
  }
  function checkIdle() {
    if (idle.on) return;
    var sec = idleSeconds();
    if (!sec) return;
    if (Date.now() - idle.last < sec * 1000) return;
    enterScreensaver();
  }
  function enterScreensaver() {
    if (idle.on) return;
    idle.on = true;
    if ($screensaver) $screensaver.classList.add('show');
    renderScreenSaver();
    var st = knowledgeState();
    if (!st.cards.length) knowledgeGenerate(false);
  }
  function exitScreensaver() {
    if (!idle.on) return;
    idle.on = false;
    if ($screensaver) $screensaver.classList.remove('show');
    idle.last = Date.now();
  }

  /* ---------------- 知识卡数据 ---------------- */
  function knowledgeState() {
    var raw = Settings.get(K_KEY, null);
    var st = { at: 0, cards: [], read: {}, idx: 0 };
    if (raw && typeof raw === 'object') {
      if (Object.prototype.toString.call(raw.cards) === '[object Array]') st.cards = raw.cards.slice(0, 20);
      if (raw.read && typeof raw.read === 'object') st.read = raw.read;
      st.at = Number(raw.at) || 0;
      st.idx = clamp(Number(raw.idx) || 0, 0, Math.max(0, st.cards.length - 1));
    }
    return st;
  }
  function knowledgeSave(st) {
    Settings.set(K_KEY, { at: st.at, cards: st.cards, read: st.read, idx: st.idx });
  }
  function knowledgeReadCount() {
    var st = knowledgeState(), n = 0;
    for (var i = 0; i < st.cards.length; i++) if (st.read[i]) n++;
    return n;
  }
  function knowledgeAllRead() {
    var st = knowledgeState();
    return st.cards.length > 0 && knowledgeReadCount() >= st.cards.length;
  }
  function knowledgeGo(delta) {
    var st = knowledgeState();
    if (!st.cards.length) {
      if (kBusy) return phone.toast('正在联网取知识卡，稍等一下');
      return knowledgeGenerate(false);
    }
    kExpanded = false;
    var i = st.idx + delta;
    if (i < 0) i = 0;
    if (i >= st.cards.length) {
      if (knowledgeAllRead()) return knowledgeGenerate(true);
      phone.toast('这一组还有 ' + (st.cards.length - knowledgeReadCount()) + ' 张没看完，全部读完后才会生成下一组', 'bad');
      return null;
    }
    st.idx = i;
    knowledgeSave(st);
    renderKnowledgeCard();
    return st;
  }
  /** 把一条检索结果整理成一张知识卡：标题、摘要都裁剪过，避免整页正文糊进卡片 */
  function makeCard(cat, it) {
    it = it || {};
    var full = normText(it.snippet);
    var summary = trimText(full, K_SUMMARY_MAX);
    var card = {
      cat: String(cat || '知识').slice(0, 8),
      title: trimText(normText(it.title).replace(/\n+/g, ' '), K_TITLE_MAX) || '知识卡',
      summary: summary,
      url: String(it.url || ''),
      src: it.url ? hostOf(it.url) : '模型生成（未联网）'
    };
    if (full.length > summary.length) card.full = full.slice(0, K_FULL_MAX);
    return card;
  }

  /** 判断两张卡是不是同一份内容（标题 + 摘要去掉空白后比较） */
  function cardKey(c) {
    return (String(c.title || '') + '|' + String(c.summary || '')).replace(/\s+/g, '').slice(0, 240);
  }
  function cardUrl(c) {
    return String((c && c.url) || '').split('#')[0].split('?')[0];
  }

  /* ---------------- 跨组去重：记住已经给用户看过的卡 ---------------- */
  function knowledgeSeen() {
    var raw = Settings.get(K_SEEN_KEY, []);
    return Object.prototype.toString.call(raw) === '[object Array]' ? raw : [];
  }
  function knowledgeSeenSets() {
    var keys = {}, urls = {};
    knowledgeSeen().forEach(function (it) {
      if (!it) return;
      if (it.k) keys[it.k] = 1;
      if (it.u) urls[it.u] = 1;
    });
    return { keys: keys, urls: urls };
  }
  function knowledgeMarkSeen(cards) {
    var list = knowledgeSeen();
    (cards || []).forEach(function (c) {
      list.push({ k: String(c.k || cardKey(c)).slice(0, 60), u: String(c.u || cardUrl(c)), at: Date.now() });
    });
    Settings.set(K_SEEN_KEY, list.slice(-K_SEEN_MAX));
  }
  /** 这一组的话题查询词：每组换一种说法，避免每次查到同一批内容 */
  function knowledgeTopics() {
    var round = Number(Settings.get(K_ROUND_KEY, 0)) || 0;
    return K_TOPICS.map(function (t) {
      var qs = t.qs || [t.q];
      return { cat: t.cat, o: t.o, q: qs[round % qs.length] };
    });
  }
  function knowledgeNextRound() {
    var round = (Number(Settings.get(K_ROUND_KEY, 0)) || 0) + 1;
    Settings.set(K_ROUND_KEY, round);
    return round;
  }

  /**
   * 从「每个话题一组候选」里挑出这一组的 10 张卡。
   * 两层挑选：
   *   ① 同一组内不重复，并且尽量避开搜索接口的「万能页」（被多数话题同时命中的那一页）；
   *   ② 跨组也不重复 —— 已经给用户看过的内容（seen）排到最后，实在没新内容才会复用并打上 repeat 标记。
   */
  function chooseCards(board, seen) {
    seen = seen || { keys: {}, urls: {} };
    var list = (board || []).slice();
    /* 同一话题内的候选先去重 */
    list.forEach(function (b) {
      var dup = {};
      b.cands = (b.cands || []).filter(function (c) {
        var k = cardKey(c), u = cardUrl(c);
        if (dup[k] || (u && dup['u:' + u])) return false;
        dup[k] = 1;
        if (u) dup['u:' + u] = 1;
        return true;
      });
    });
    /* 统计「这条内容被多少个话题命中过」 */
    var freq = {};
    function bump(k) { if (k) freq[k] = (freq[k] || 0) + 1; }
    list.forEach(function (b) {
      b.cands.forEach(function (c) {
        bump(cardKey(c));
        var u = cardUrl(c);
        if (u) bump('u:' + u);
      });
    });
    var maxFreq = Math.max(2, Math.ceil(list.length / 3));
    function weight(c) {
      var u = cardUrl(c);
      return Math.max(freq[cardKey(c)] || 0, u ? (freq['u:' + u] || 0) : 0);
    }
    function isSeen(c) {
      return !!(seen.keys[cardKey(c)] || (cardUrl(c) && seen.urls[cardUrl(c)]));
    }
    list.sort(function (a, b) { return (Number(a.t.o) || 0) - (Number(b.t.o) || 0); });

    var usedKey = {}, usedUrl = {}, usedTopic = {}, out = [];
    list.forEach(function (b) {
      /* 一个话题只出一张卡：补检索会让同一话题在候选表里出现多次 */
      if (usedTopic[b.t.o]) return;
      var best = null, i, c;
      function free(c2) {
        var k = cardKey(c2), u = cardUrl(c2);
        return !usedKey[k] && !(u && usedUrl[u]);
      }
      /* 第一档：全新内容 + 不是万能页 */
      for (i = 0; i < b.cands.length; i++) {
        c = b.cands[i];
        if (!free(c) || isSeen(c) || weight(c) >= maxFreq) continue;
        best = c;
        break;
      }
      /* 第二档：全新内容（允许是万能页） */
      if (!best) {
        for (i = 0; i < b.cands.length; i++) {
          c = b.cands[i];
          if (!free(c) || isSeen(c)) continue;
          best = c;
          break;
        }
      }
      /* 第三档：实在没有新内容，复用以前看过的（会被标记，必要时整组不进存档） */
      if (!best) {
        for (i = 0; i < b.cands.length; i++) {
          c = b.cands[i];
          if (!free(c)) continue;
          best = c;
          break;
        }
      }
      if (!best) return;
      /* 记下这张卡的「原始身份」，润色之后还能用于跨组去重 */
      best.k = cardKey(best).slice(0, 60);
      best.u = cardUrl(best);
      best.repeat = isSeen(best) ? 1 : 0;
      usedKey[cardKey(best)] = 1;
      if (best.u) usedUrl[best.u] = 1;
      usedTopic[b.t.o] = 1;
      out.push(best);
    });
    return out;
  }

  /**
   * 用对话模型把每张卡润色成「短标题 + 60~100 字摘要」。
   * 没绑对话模型、开关关掉、或调用失败时，就沿用裁剪过的原文。
   */
  function polishCards(picked, board) {
    var chat = apiResolve('chat');
    if (!chat || Settings.get('knowledgePolish', true) !== true) return Promise.resolve(picked);
    var blocks = [];
    picked.forEach(function (c, i) {
      var b = null, j;
      for (j = 0; j < board.length; j++) if (board[j].t && board[j].t.o === c.o) { b = board[j]; break; }
      var cands = b ? (b.cands || []).slice(0, 2) : [];
      var body = cands.map(function (x) {
        return '· ' + (x.title || '') + '：' + normText(x.full || x.summary).slice(0, 400);
      }).join('\n');
      blocks.push('[' + i + '] 话题：' + c.cat + '（检索词：' + (c.q || '') + '）\n' + (body || '· ' + c.summary));
    });
    if (!blocks.length) return Promise.resolve(picked);

    var sys = '你是中文知识卡编辑。只输出 JSON，不要解释，不要 markdown 围栏。';
    var user = '下面是联网检索到的原始材料，请为每个编号改写一张知识卡：\n' +
      '- title：不超过 20 字的标题，具体一点，别用「关于……的介绍」这种空话\n' +
      '- summary：60~100 字的说明，一到三句话，通顺、具体，保留关键信息（时间、数字、结论）\n' +
      '- 不要出现「根据搜索结果」「本文介绍了」「数据显示」这类废话，不要 Markdown 符号，不要换行\n' +
      '- 编号必须和输入一一对应，不要增删\n' +
      '只输出：{"cards":[{"i":0,"title":"...","summary":"..."}]}\n\n' + blocks.join('\n\n');

    return apiChat(chat, [{ role: 'system', content: sys }, { role: 'user', content: user }], { json: true })
      .then(function (text) {
        var o = parseLooseJson(text);
        var arr = (o && (o.cards || o.items || o.data)) || [];
        if (Object.prototype.toString.call(arr) !== '[object Array]') return picked;
        var byI = {};
        arr.forEach(function (c) {
          var i = Number(c && c.i);
          if (!isFinite(i) || i < 0 || i >= picked.length || byI[i]) return;
          byI[i] = c;
        });
        var n = 0;
        var out = picked.map(function (c, i) {
          var p = byI[i];
          if (!p) return c;
          var title = normText(p.title).replace(/\n+/g, ' ').trim();
          var summary = normText(p.summary);
          if (!summary || summary.length < 10) return c;
          var card = makeCard(c.cat, { title: title || c.title, snippet: summary, url: c.url });
          /* 润色后仍保留可展开的原始材料 */
          var raw = normText(c.full || c.summary);
          if (raw && raw.length > card.summary.length) card.full = raw.slice(0, K_FULL_MAX);
          card.q = c.q; card.o = c.o; card.k = c.k; card.u = c.u; card.repeat = c.repeat;
          card.polished = 1;
          n++;
          return card;
        });
        if (!n) return picked;
        return out;
      })
      .catch(function (e) {
        console.warn('[PhoneShell] 知识卡润色失败，改用裁剪后的原文：', e);
        return picked;
      });
  }

  function knowledgeGenerate(force) {
    var st = knowledgeState();
    if (kBusy) return Promise.resolve(st);
    if (st.cards.length && !force) return Promise.resolve(st);
    var search = apiResolve('search');
    var chat = apiResolve('chat');
    /* 用对话模型「编」知识卡默认是关的：没有联网检索接口时应该先让用户去配，而不是悄悄生成一堆不联网的内容 */
    var allowModel = Settings.get('knowledgeFallback', false) === true;
    if (!search && !(allowModel && chat)) {
      kErr = chat
        ? '还没有配置「联网检索」接口，知识卡需要它才能联网取内容。请到「设置 → API 管理」新增一个（Tavily / 博查 / Serper）并绑定；' +
          '如果只是想先看看效果，可以在那里打开「用对话模型生成知识卡（不联网）」开关。'
        : '还没有配置任何接口。请到「设置 → API 管理」新增一个联网检索接口（Tavily / 博查 / Serper 等）并绑定，知识卡才能联网更新。';
      renderKnowledgeCard();
      return Promise.resolve(st);
    }
    kBusy = true; kErr = ''; kGot = 0; kTotal = K_TOPICS.length;
    renderKnowledgeCard();
    var board = [], fails = [], topics = knowledgeTopics();
    var seen = knowledgeSeenSets();
    knowledgeNextRound();     /* 换一组就换一种检索说法 */

    /* 每个话题把候选都收进来（先不急着选）：搜索接口对相近查询经常返回同一页，
       只看第一条会让整组知识卡长得一模一样。 */
    function collect(t, items) {
      var cands = [];
      (items || []).forEach(function (it) {
        var c = makeCard(t.cat, it);
        if (!c.summary && !c.title) return;
        c.q = t.q;
        c.o = t.o;
        cands.push(c);
      });
      if (cands.length) board.push({ t: t, cands: cands });
    }

    function runTopics(list) {
      var idx = 0;
      function worker() {
        if (idx >= list.length) return Promise.resolve();
        var t = list[idx++];
        var job = search ? apiSearch(search, t.q, { count: 3 }) : Promise.resolve(null);
        return job.then(function (res) { collect(t, res && res.items); kGot++; })
          .catch(function (e) { fails.push(t.cat + '：' + (e && e.message ? e.message : e)); })
          .then(function () { renderKnowledgeCard(); return worker(); });
      }
      var pool = [];
      for (var i = 0; i < Math.min(3, list.length); i++) pool.push(worker());
      return Promise.all(pool);
    }

    return runTopics(topics).then(function () {
      var picked = chooseCards(board, seen);
      /* 只有「仍然空着」的话题才补检索（换个说法），凑不满 10 张时才有这一步 */
      var have = {};
      picked.forEach(function (c) { have[c.o] = 1; });
      var extra = topics.filter(function (t) { return !have[t.o]; }).map(function (t) {
        return { cat: t.cat, q: t.q + ' 最新进展 相关报道', o: t.o };
      });
      if (!search || !picked.length || !extra.length) return picked;
      kGot = 0; kTotal = extra.length;
      return runTopics(extra).then(function () { return chooseCards(board, seen); });
    }).then(function (cards) {
      if (!cards || !cards.length) return null;
      /* 全网都是旧内容时，不要拿一模一样的一组去覆盖上一组 */
      var repeats = 0;
      cards.forEach(function (c) { if (c.repeat) repeats++; });
      if (repeats >= cards.length && knowledgeState().cards.length) {
        kBusy = false;
        kErr = '检索接口这次没有返回新内容（和上一组基本重复）。可以过一会儿再试，或换一个联网检索接口。';
        renderKnowledgeCard();
        phone.toast('这次没取到新内容，已保留上一组', 'bad');
        return knowledgeState();
      }
      return polishCards(cards, board).then(function (out) { return finishGroup(out, fails); });
    }).then(function (done) {
      if (done) return done;
      if (!(allowModel && chat)) {
        kBusy = false;
        kErr = fails.length
          ? ('联网检索失败：' + fails[0] + '（可以在「设置 → API 管理」里测一下这个接口）')
          : '联网检索没有返回任何内容，可以稍后重试。';
        renderKnowledgeCard();
        return knowledgeState();
      }
      if (fails.length) kErr = '联网检索没取到内容（' + fails[0] + '），改用对话模型生成这一组…';
      return modelCards(chat).then(function (list) { return finishGroup(list, []); })
        .catch(function (e) { kBusy = false; kErr = '生成知识卡失败：' + (e && e.message ? e.message : e); renderKnowledgeCard(); return knowledgeState(); });
    });
  }
  function finishGroup(list, fails) {
    kBusy = false;
    var clean = (list || []).filter(function (c) { return c && (c.title || c.summary); }).slice(0, 10);
    /* 按话题顺序排好，免得并发取卡时顺序乱跳 */
    clean.sort(function (a, b) { return (Number(a.o) || 0) - (Number(b.o) || 0); });
    if (!clean.length) {
      kErr = '这一组没取到内容，可以稍后重试。';
      renderKnowledgeCard();
      return knowledgeState();
    }
    var st = { at: Date.now(), cards: clean, read: {}, idx: 0 };
    knowledgeSave(st);
    knowledgeMarkSeen(clean);   /* 记住看过的内容，下次生成不会再拿它糊弄你 */
    if (fails && fails.length) phone.toast('知识卡：' + fails.length + ' 个话题检索失败，这一组用其余内容组成', 'bad');
    var repeats = 0;
    clean.forEach(function (c) { if (c.repeat) repeats++; });
    if (repeats) phone.toast('这一组有 ' + repeats + ' 张和以前看过的一样（检索接口没给新内容）', 'bad');
    else if (clean.length < K_TOPICS.length) {
      phone.toast('这一组取到 ' + clean.length + ' 张：检索接口返回的重复内容已自动去掉', 'bad');
    }
    renderKnowledgeCard();
    return st;
  }
  /** 没有检索接口时的兜底：让对话模型直接生成知识卡（标注未联网） */
  function modelCards(chat) {
    var sys = '你是知识卡编辑。只输出 JSON，不要解释，不要 markdown 围栏。';
    var user = '生成 10 张中文知识卡，涵盖近期新闻、冷知识，以及科技、历史、天文、自然、地理、健康、财经、文化等领域的信息。' +
      '每张卡的 summary 必须是 40~90 字的短说明（不要长段落），title 不超过 20 字。' +
      '格式：{"cards":[{"cat":"分类","title":"标题","summary":"40~90字的短说明","url":""}]}';
    return apiChat(chat, [{ role: 'system', content: sys }, { role: 'user', content: user }], { json: true })
      .then(function (text) {
        var o = parseLooseJson(text);
        var arr = (o && (o.cards || o.items || o.data)) || [];
        if (Object.prototype.toString.call(arr) !== '[object Array]') arr = [];
        return arr.map(function (c) {
          return makeCard(String(c.cat || '知识').slice(0, 6), {
            title: String(c.title || ''), snippet: String(c.summary || c.content || ''), url: String(c.url || '')
          });
        });
      });
  }

  /* ---------------- 屏保渲染 ---------------- */
  function renderScreenSaver() {
    if (!$screensaver) return;
    var d = new Date();
    var t = $('#ss-time');
    if (t) t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var dt = $('#ss-date');
    if (dt) {
      dt.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    }
    renderKnowledgeCard();
  }
  function renderKnowledgeCard() {
    if (!$screensaver) return;
    var st = knowledgeState();
    var catEl = $('#ss-cat'), titleEl = $('#ss-title'), sumEl = $('#ss-summary'),
      srcEl = $('#ss-src'), idxEl = $('#ss-idx'), progEl = $('#ss-progress'), regen = $('#ss-regen'),
      more = $('#ss-more');
    function showMore(on, expanded) {
      if (!more) return;
      more.classList.toggle('show', !!on);
      more.textContent = expanded ? '收起' : '展开全文';
    }
    if (kBusy) {
      if (catEl) catEl.textContent = '联网检索中';
      if (titleEl) titleEl.textContent = '正在为你取这一组知识卡…';
      if (sumEl) { sumEl.textContent = '已取到 ' + kGot + ' / ' + kTotal + ' 条，请稍候'; sumEl.classList.remove('expanded'); }
      if (srcEl) srcEl.textContent = '';
      if (idxEl) idxEl.textContent = '';
      if (progEl) progEl.textContent = '联网中…';
      if (regen) { regen.disabled = true; regen.textContent = '正在生成…'; }
      showMore(false);
      return;
    }
    if (!st.cards.length) {
      if (catEl) catEl.textContent = '知识卡';
      if (titleEl) titleEl.textContent = kErr ? '暂时取不到知识卡' : '还没有知识卡';
      if (sumEl) {
        sumEl.textContent = kErr || '配置好接口后，息屏时会自动联网取一组知识卡。';
        sumEl.classList.remove('expanded');
      }
      if (srcEl) srcEl.textContent = '';
      if (idxEl) idxEl.textContent = '';
      if (progEl) progEl.textContent = '';
      if (regen) { regen.disabled = false; regen.textContent = '立即生成一组'; }
      showMore(false);
      return;
    }
    var c = st.cards[st.idx] || {};
    if (catEl) catEl.textContent = c.cat || '知识';
    if (titleEl) titleEl.textContent = c.title || '';
    if (sumEl) {
      /* 有全文且已展开时显示全文，否则只显示裁好的短摘要 */
      var text = (kExpanded && c.full) ? c.full : (c.summary || '（这一条没有摘要）');
      sumEl.textContent = text;
      sumEl.classList.toggle('expanded', !!(kExpanded && c.full));
    }
    if (srcEl) {
      if (kErr) {
        /* 卡片还在，但有话要说（例如这次没取到新内容）→ 提示放在来源那一行 */
        srcEl.textContent = '⚠ ' + kErr;
        srcEl.title = kErr;
      } else {
        srcEl.textContent = (c.src ? ('来源：' + c.src) : '') + (c.q ? (' · 检索：' + c.q) : '');
        srcEl.title = c.url || '';      /* 鼠标悬停可以看到完整链接 */
      }
    }
    if (idxEl) idxEl.textContent = (st.idx + 1) + ' / ' + st.cards.length;
    showMore(!!c.full, kExpanded);
    /* 只有真正显示在息屏屏保上才算「读过」 */
    if (idle.on && !st.read[st.idx]) {
      st.read[st.idx] = 1;
      knowledgeSave(st);
    }
    var all = knowledgeAllRead();
    if (progEl) progEl.textContent = '已读 ' + Math.min(knowledgeReadCount(), st.cards.length) + ' / ' + st.cards.length;
    if (regen) {
      regen.disabled = !all;
      regen.textContent = all ? '本组读完了 · 生成下一组' : '读完才会生成下一组';
    }
  }
  function openSettingsForApi() {
    exitScreensaver();
    openApp('settings');
    phone.toast('在「API 管理」里添加接口并绑定用途', 'ok');
  }

  var knowledge = {
    state: knowledgeState,
    generate: knowledgeGenerate,
    next: function () { return knowledgeGo(1); },
    prev: function () { return knowledgeGo(-1); },
    readCount: knowledgeReadCount,
    allRead: knowledgeAllRead,
    render: renderKnowledgeCard,
    clear: function () { Settings.set(K_KEY, null); renderKnowledgeCard(); },
    /* 没有联网检索接口时，是否允许用对话模型「编」知识卡（默认关闭，避免用户以为已经联网了） */
    fallback: function () { return Settings.get('knowledgeFallback', false) === true; },
    setFallback: function (on) {
      Settings.set('knowledgeFallback', on === true);
      return Settings.get('knowledgeFallback', false) === true;
    },
    /* 是否用对话模型把取回的原文润色成短卡（默认开启，需要绑定对话模型） */
    polish: function () { return Settings.get('knowledgePolish', true) !== false; },
    setPolish: function (on) {
      Settings.set('knowledgePolish', on !== false);
      return Settings.get('knowledgePolish', true) !== false;
    },
    /* 忘记「看过哪些卡」：清掉之后允许再次看到相同内容 */
    seenCount: function () { return knowledgeSeen().length; },
    forgetSeen: function () { Settings.set(K_SEEN_KEY, []); return 0; },
    topics: function () { return K_TOPICS.map(function (t) { return t.cat; }); }
  };
  var idleApi = {
    seconds: idleSeconds,
    setSeconds: function (s) {
      var v = Number(s);
      if (!isFinite(v) || v < 0) v = IDLE_DEFAULT;
      Settings.set('idleSeconds', v);
      idle.last = Date.now();
      return idleSeconds();
    },
    reset: markActivity,
    enter: enterScreensaver,
    exit: exitScreensaver,
    isOn: function () { return idle.on; },
    tick: checkIdle
  };

  /* ---------------- 对外 API ---------------- */
  var phone = {
    version: '1.7.0',
    /* 注册应用（也可用 phone.register(def)） */
    addApp: addApp,
    register: addApp,
    removeApp: removeApp,
    getApps: getApps,
    getApp: function (id) { return appCache && appCache.map[id]; },
    exportApp: exportApp,
    exportAll: exportAll,
    importBundle: importBundle,
    openApp: openApp,
    closeApp: closeApp,
    home: function () { closeApp(); toggleRecents(false); },
    toast: toast,
    alert: alertBox,
    confirm: confirmBox,
    prompt: promptBox,
    store: makeStore,
    settings: Settings,
    icons: { svg: svgIcon, html: iconHTML, names: Object.keys(ICON_PATHS), list: Object.keys(ICON_PATHS), palette: PALETTE, named: NAMED_COLORS },
    colors: PALETTE,
    grad: gradCss,
    utils: {
      el: el, $: $, $$: $$, md: md, esc: esc, uid: uid, clamp: clamp,
      download: download, readFile: readFile, hash: hashStr,
      /* 阅读器与便签用到的通用能力 */
      copy: copyText, readTextFile: readTextFile, splitParagraphs: splitParagraphs,
      cleanImportText: cleanImportText, htmlToText: htmlToText, hostOf: hostOf,
      textAccept: TEXT_ACCEPT, parseLooseJson: parseLooseJson,
      /* 睡前故事用：二进制导出 + 按句子切成适合朗读的小段 */
      downloadBlob: downloadBlob, splitForTTS: splitForTTS, normText: normText, trimText: trimText
    },
    compile: compileAppCode,
    lock: lock, unlock: unlock,
    /* 全机统一的 API 管理：所有应用都从这里取接口配置 */
    apis: apis,
    /* 语音合成（本地 GPT-SoVITS 等）：音色库 / 合成 / 切分 / 模型切换 */
    tts: ttsApi,
    /* GPT-SoVITS 同步启动：配置 / 生成启动器配置 / 在线探测 */
    gsv: gsv,
    /* 闲置息屏屏保 */
    idle: idleApi,
    /* 近期知识卡 */
    knowledge: knowledge,
    rebind: function () { loadRegistry(); loadLayout(); renderHome(); },
    /* 桌面布局（分页 / 文件夹）对外接口 */
    layout: {
      data: function () { return layout; },
      reload: function () { loadLayout(); renderHome(); },
      save: saveLayout,
      goPage: goPage,
      page: currentPage,
      pageCount: function () { return layout ? layout.pages.length : 0; },
      setEditing: setEditing,
      isEditing: function () { return state.editing; },
      makeFolder: function (ids, name) {
        var list = (ids || []).filter(function (id) { return appCache.map[id]; });
        if (list.length < 2) throw new Error('建文件夹至少需要 2 个应用');
        var first = findSlot(list[0]);
        if (!first || first.folder) throw new Error('目标应用不在桌面上');
        var f = newFolder(name || (appCache.map[list[0]].name + ' 等'), []);
        detachToFolder(list, f);
        layout.pages[first.page][first.idx] = f;
        saveLayout(); renderHome();
        return f;
      },
      ungroup: function (folderId) {
        var hit = findFolder(folderId);
        if (!hit) return false;
        var apps = hit.folder.apps.slice();
        layout.pages[hit.page][hit.idx] = null;
        apps.forEach(placeOnEmptySlot);
        saveLayout(); renderHome();
        return true;
      },
      reset: function () { normalizeLayout(freshLayout()); saveLayout(); renderHome(); }
    },
    wallpaper: {
      apply: applyWallpaper,
      list: function () { return WALLPAPERS.map(function (w) { return w.name; }); },
      solidList: function () { return SOLIDS.map(function (w) { return w.name; }); },
      mode: function () { return Settings.get('bgMode', 'solid') === 'wallpaper' ? 'wallpaper' : 'solid'; },
      setMode: function (m) { Settings.set('bgMode', m === 'wallpaper' ? 'wallpaper' : 'solid'); return applyWallpaper(); },
      css: function (i) {
        var p = pick(WALLPAPERS, i).c;
        return 'linear-gradient(160deg,' + p[0] + ',' + p[1] + ' 55%,' + p[2] + ')';
      },
      solidCss: function (i) {
        var p = pick(SOLIDS, i).c;
        return 'linear-gradient(160deg,' + p[0] + ',' + p[1] + ' 55%,' + p[2] + ')';
      },
      index: function () { return Number(Settings.get('themeIndex', 0)) || 0; },
      solidIndex: function () { return Number(Settings.get('solidIndex', 0)) || 0; },
      set: function (i) { Settings.set('bgMode', 'wallpaper'); Settings.set('themeIndex', Number(i) || 0); return applyWallpaper(); },
      setSolid: function (i) { Settings.set('bgMode', 'solid'); Settings.set('solidIndex', Number(i) || 0); return applyWallpaper(); },
      setScrim: function (v) { Settings.set('scrim', clamp(Number(v), 0, 0.9)); return applyWallpaper(); },
      getScrim: function () { return clamp(Number(Settings.get('scrim', 0.16)), 0, 0.9); }
    },
    _state: state,
    _settings: Settings
  };
  window.Phone = phone;

  /* ---------------- 启动 ---------------- */
  function bindChrome() {
    $appLayer = $('#apps'); $home = $('#home'); $pages = $('#pages');
    $pageDots = $('#page-dots'); $screen = $('#screen'); $dock = $('#dock'); $lock = $('#lock');
    $recents = $('#recents'); $toastLayer = $('#toast-layer'); $modal = $('#modal-layer');
    $statusbar = $('#statusbar'); $folderPop = $('#folder-pop'); $screensaver = $('#screensaver');

    $lock.addEventListener('click', unlock);
    $lock.addEventListener('touchstart', unlock, { passive: true });
    $appLayer.addEventListener('pointermove', function (e) { if (drag) dragMove(e.clientX, e.clientY); });
    $appLayer.addEventListener('contextmenu', function (e) { if (drag) e.preventDefault(); });
    document.addEventListener('pointermove', function (e) { onGlobalPointerMove(e); });
    document.addEventListener('pointerup', function (e) { onGlobalPointerUp(e); });
    document.addEventListener('pointercancel', function (e) { onGlobalPointerUp(e); });
    /* 指针在元素外松开也要能结束拖拽 */
    window.addEventListener('blur', function () { if (drag) dragEnd(); });
    window.addEventListener('resize', onResize);
    var hb = $('#btn-home'); if (hb) hb.addEventListener('click', function () { closeApp(); toggleRecents(false); });
    var rb = $('#btn-recents'); if (rb) rb.addEventListener('click', function () { toggleRecents(); });
    var rc = $('#rec-close'); if (rc) rc.addEventListener('click', function () { toggleRecents(false); });

    /* 息屏屏保：鼠标移动 / 点击都只算「有人在动」，不会退出屏保；
       只有按键盘（退出键）或点屏保上的「返回」按钮才退出。 */
    if (!idle.bound) {
      idle.bound = true;
      ['pointerdown', 'mousedown', 'touchstart', 'pointermove', 'mousemove', 'wheel'].forEach(function (t) {
        document.addEventListener(t, markActivity, { passive: true });
      });
      /* 捕获阶段拦下按键：先退出屏保，并阻止这一下按键落到屏保下面的输入框里 */
      document.addEventListener('keydown', function (e) {
        if (!idle.on) return;
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        exitScreensaver();
        phone.toast('已退出息屏');
      }, true);
    }
    if ($screensaver) {
      /* 点屏保空白处不再退出（避免误触），只有 .ss-ctl 里的按钮生效 */
      var bindSs = function (sel, fn) {
        var b = $(sel);
        if (b) b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(); });
      };
      bindSs('#ss-prev', function () { knowledgeGo(-1); });
      bindSs('#ss-next', function () { knowledgeGo(1); });
      bindSs('#ss-regen', function () {
        if (knowledgeAllRead() || !knowledgeState().cards.length) knowledgeGenerate(true);
        else phone.toast('这一组还没读完，读完后才会生成下一组', 'bad');
      });
      bindSs('#ss-more', function () {
        var c = knowledgeState().cards[knowledgeState().idx];
        if (!c || !c.full) return;
        kExpanded = !kExpanded;
        renderKnowledgeCard();
      });
      bindSs('#ss-close', function () { exitScreensaver(); });
      bindSs('#ss-setup', function () { openSettingsForApi(); });
    }

    /* 分页：滚动同步圆点 */
    if ($pages) {
      var scrollTimer = null;
      $pages.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () { state.page = currentPage(); syncDots(); }, 60);
      }, { passive: true });
      /* 滚轮翻页（桌面浏览器） */
      var wheelLock = 0;
      $pages.addEventListener('wheel', function (e) {
        var dy = e.deltaY, dx = e.deltaX;
        var d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (Math.abs(d) < 2) return;
        e.preventDefault();
        var now = Date.now();
        if (now < wheelLock) return;
        wheelLock = now + 320;
        goPage(currentPage() + (d > 0 ? 1 : -1));
      }, { passive: false });
      /* 触摸滑动由原生滚动 + scroll-snap 处理；这里只处理「松手后归位」 */
      $pages.addEventListener('touchend', function () {
        setTimeout(function () { state.page = currentPage(); syncDots(); }, 80);
      }, { passive: true });
      /* 长按空白处 / 长按页面 → 进入整理模式 */
      attachEditGestures();
    }

    /* 文件夹浮层 */
    if ($folderPop) {
      $('#fp-close').addEventListener('click', function () { closeFolder(); });
      $('#fp-del').addEventListener('click', function () { deleteFolder(); });
      $('#fp-edit').addEventListener('click', function () { setEditing(!state.editing); phone.toast(state.editing ? '整理模式：拖动图标可移出文件夹' : '已退出整理模式'); });
      $('#fp-grid').addEventListener('pointerdown', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.app-item') : null;
        if (!item) return;
        /* 文件夹内长按：等长按计时器触发拖拽（attachLongPress 已绑定） */
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($modal.classList.contains('show')) return;
        if ($folderPop && $folderPop.classList.contains('show')) return closeFolder();
        if (state.editing) return setEditing(false);
        if ($recents.classList.contains('show')) return toggleRecents(false);
        if (state.current) return closeApp();
      }
      if (e.key === 'Home' || (e.altKey && e.key.toLowerCase() === 'h')) { e.preventDefault(); closeApp(); toggleRecents(false); }
      if (!state.current && !state.locked) {
        if (e.key === 'ArrowRight') goPage(currentPage() + 1);
        if (e.key === 'ArrowLeft') goPage(currentPage() - 1);
      }
    });
  }

  function onResize() {
    if (layout && $pages) goPage(state.page);
  }

  /* 全局指针：拖拽期间接管移动与松手 */
  function onGlobalPointerMove(e) {
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    dragMove(e.clientX, e.clientY);
  }
  function onGlobalPointerUp(e) {
    if (drag) dragEnd(e && e.clientX, e && e.clientY);
  }

  /* 长按桌面空白进入整理模式 */
  function attachEditGestures() {
    var t = null, sx = 0, sy = 0;
    $pages.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.app-item')) return;
      sx = e.clientX; sy = e.clientY;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; setEditing(!state.editing); if (navigator.vibrate) { try { navigator.vibrate(12); } catch (er) { } } }, 500);
    });
    $pages.addEventListener('pointermove', function (e) {
      if (!t) return;
      if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { clearTimeout(t); t = null; }
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      $pages.addEventListener(ev, function () { if (t) { clearTimeout(t); t = null; } });
    });
  }

  function boot() {
    try {
      bindChrome();
      applyWallpaper();
      apiMigrate();
      loadRegistry();
      loadLayout();
      renderHome();
      tickClock(); setInterval(tickClock, 1000);
      /* 闲置检测：4 秒看一次就够了 */
      idle.last = Date.now();
      setInterval(checkIdle, 4000);
      updateBattery();
      if (typeof navigator.getBattery === 'function') navigator.getBattery().then(function (b) { b.addEventListener('levelchange', updateBattery); b.addEventListener('chargingchange', updateBattery); }).catch(function () { });
      setTimeout(function () { goPage(0); }, 60);
      if (Settings.get('skipLock', false)) lock(false); else lock(true);
      state.booted = true;
      console.log('%c PhoneShell ' + phone.version + ' 就绪 ', 'background:#3ddc97;color:#08331f;font-weight:700;border-radius:4px',
        '共 ' + getApps().length + ' 个应用');
    } catch (e) {
      console.error(e);
      var be = $('#boot-error');
      if (be) { be.classList.add('show'); $('#boot-error-msg').textContent = e && e.message ? e.message : String(e); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
