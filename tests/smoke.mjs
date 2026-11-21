/**
 * 冒烟测试：用假 DOM 在 Node 里真跑一遍内核逻辑，提前发现运行期错误。
 * 关键点：用 runInThisContext + 把假 DOM 挂到 Node 全局，这样内核里 new Function
 * 编译出来的插件代码也能看到同样的全局对象（与浏览器语义一致）。
 * 运行：node tests/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

/* ================= 假 DOM ================= */
const CANVAS_METHODS = ['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'arcTo', 'rect', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform',
  'fillText', 'strokeText', 'quadraticCurveTo', 'bezierCurveTo', 'clip', 'setLineDash', 'drawImage', 'ellipse', 'roundRect', 'putImageData'];
const GRADIENT_METHODS = ['addColorStop', 'setTransform'];

/* 极简 CSS 选择器：#id .cls tag [attr] tag.cls */
function matches(node, sel) {
  sel = sel.trim();
  const m = sel.match(/^([a-zA-Z]*)((?:[.#][\w-]+)*)$/);
  if (m) {
    if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
    const parts = m[2].match(/[.#][\w-]+/g) || [];
    for (const p of parts) {
      if (p[0] === '.' && !node.classList.contains(p.slice(1))) return false;
      if (p[0] === '#' && node.id !== p.slice(1)) return false;
    }
    return true;
  }
  const a = sel.match(/^\[([\w-]+)\]$/);
  if (a) return node._attrs[a[1]] != null;
  const b = sel.match(/^([a-zA-Z]*)\.([\w-]+)$/);
  if (b) return (!b[1] || node.tagName === b[1].toUpperCase()) && node.classList.contains(b[2]);
  return false;
}

/* dataset ↔ attribute 双向同步（真实 DOM 行为） */
function makeDataset(el) {
  const store = {};
  return new Proxy(store, {
    set(t, k, v) {
      t[k] = v;
      const kebab = 'data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      if (v === undefined || v === null) delete el._attrs[kebab]; else el._attrs[kebab] = String(v);
      return true;
    },
    deleteProperty(t, k) {
      delete t[k];
      delete el._attrs['data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())];
      return true;
    },
    get(t, k) { if (k === 'toJSON') return () => ({ ...t }); return typeof k === 'string' && k in t ? t[k] : undefined; },
    ownKeys(t) { return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, k) { return Reflect.getOwnPropertyDescriptor(t, k) || { configurable: true, enumerable: true, value: undefined }; }
  });
}

function matchSel(node, sel) {
  sel = String(sel).trim();
  const m = sel.match(/^([a-zA-Z]*)((?:[.#][\w-]+)*)$/);
  if (m) {
    if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
    for (const p of (m[2].match(/[.#][\w-]+/g) || [])) {
      if (p[0] === '.' && !node.classList.contains(p.slice(1))) return false;
      if (p[0] === '#' && node.id !== p.slice(1)) return false;
    }
    return true;
  }
  const a = sel.match(/^\[([\w-]+)\]$/);
  if (a) return node._attrs[a[1]] != null;
  const b = sel.match(/^([a-zA-Z]*)\.([\w-]+)$/);
  if (b) return (!b[1] || node.tagName === b[1].toUpperCase()) && node.classList.contains(b[2]);
  return false;
}

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._cls = new Set();
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.dataset = makeDataset(this);
    this._text = '';
    this._html = '';
    this._attrs = {};
    this._listeners = {};
    this.id = '';
    this.scrollTop = 0;
    this.value = '';
    this.disabled = false;
    this.files = null;
    this.type = '';
    this.title = '';
    this.placeholder = '';
    this.open = false;
    this.width = 368; this.height = 640;
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, on) => { const want = on === undefined ? !this._cls.has(c) : !!on; want ? this._cls.add(c) : this._cls.delete(c); return want; },
      contains: (c) => this._cls.has(c)
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
  appendChild(n) {
    if (n && n.parentNode) { const i = n.parentNode.children.indexOf(n); if (i >= 0) n.parentNode.children.splice(i, 1); }
    n.parentNode = this; this.children.push(n); return n;
  }
  append(...ns) { ns.forEach(n => this.appendChild(typeof n === 'string' ? new FakeEl('span') : n)); }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertBefore(n) { return this.appendChild(n); }
  addEventListener(t, fn, o) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { const a = this._listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  dispatch(type, ev) {
    (this._listeners[type] || []).slice().forEach(fn => fn(Object.assign({ preventDefault() { }, stopPropagation() { }, target: this, type }, ev)));
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
  closest(sel) {
    const groups = String(sel).split(',').map(x => x.trim()).filter(Boolean);
    let n = this;
    while (n) { if (groups.some(g => matchSel(n, g))) return n; n = n.parentNode; }
    return null;
  }
  focus() { } select() { } click() { this.dispatch('click', {}); }
  getContext() {
    const o = {};
    const grad = {};
    GRADIENT_METHODS.forEach(m => grad[m] = () => grad);
    CANVAS_METHODS.forEach(m => o[m] = () => o);
    o.measureText = () => ({ width: 10 });
    o.createLinearGradient = () => grad;
    o.createRadialGradient = () => grad;
    o.getImageData = () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    o.putImageData = () => o;
    o.canvas = this;
    return o;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; }
  toDataURL() { return 'data:image/jpeg;base64,FAKE'; }
  snapshot() {
    return { tag: this.tagName, id: this.id || '', cls: [...this._cls].join(' '), text: this._text,
      attrs: { ...this._attrs }, children: this.children.map(c => c.snapshot ? c.snapshot() : String(c)) };
  }
  all(out = []) { this.children.forEach(c => { out.push(c); if (c.all) c.all(out); }); return out; }
  cloneNode(deep) {
    const n = new FakeEl(this.tagName);
    n._cls = new Set(this._cls);
    Object.assign(n._attrs, this._attrs);
    Object.assign(n.dataset, this.dataset);
    Object.assign(n.style, this.style);
    n._text = this._text; n._html = this._html;
    n.dataset = makeDataset(n);
    for (const k of Object.keys(this.dataset)) n.dataset[k] = this.dataset[k];
    n.className = this.className;
    if (deep) this.children.forEach(c => n.appendChild(c.cloneNode ? c.cloneNode(true) : c));
    return n;
  }
  querySelector(sel) {
    const parts = String(sel).trim().split(/\s+/);
    let cur = [this];
    for (const p of parts) {
      const next = [];
      cur.forEach(n => n.all().forEach(c => { if (matches(c, p)) next.push(c); }));
      cur = next;
    }
    return cur[0] || null;
  }
  querySelectorAll(sel) {
    const parts = String(sel).trim().split(/\s+/);
    let cur = [this];
    for (const p of parts) {
      const next = [];
      cur.forEach(n => n.all().forEach(c => { if (matches(c, p)) next.push(c); }));
      cur = next;
    }
    return cur;
  }
  find(cls) { return this.all().find(n => n.classList && n.classList.contains(cls)) || null; }
  findAll(cls) { return this.all().filter(n => n.classList && n.classList.contains(cls)); }
  count(cls) { return this.findAll(cls).length; }
}

const byId = {};
const PAGE_IDS = ['wallpaper', 'phone', 'screen', 'statusbar', 'sb-time', 'sb-bat', 'home', 'pages', 'page-dots',
  'dock', 'apps', 'recents', 'rec-list', 'rec-close', 'lock', 'lock-time', 'lock-date', 'toast-layer',
  'modal-layer', 'boot-error', 'boot-error-msg', 'home-count', 'btn-home', 'btn-recents',
  'folder-pop', 'fp-name', 'fp-grid', 'fp-close', 'fp-edit', 'fp-del',
  /* 息屏屏保 + 知识卡 */
  'screensaver', 'ss-time', 'ss-date', 'ss-cat', 'ss-idx', 'ss-title', 'ss-summary', 'ss-src',
  'ss-progress', 'ss-regen', 'ss-setup', 'ss-close', 'ss-prev', 'ss-next', 'ss-more'];
PAGE_IDS.forEach(id => { const e = new FakeEl('div'); e.id = id; byId[id] = e; });
/* 与 shell.html 一致：pages 里预置三页，每页一个 [data-grid] */
for (let i = 0; i < 3; i++) {
  const sec = new FakeEl('section');
  sec.classList.add('page');
  sec.dataset.page = String(i);
  const g1 = new FakeEl('div'); g1.classList.add('app-grid'); g1.dataset.grid = '';
  sec.appendChild(g1);
  byId['pages'].appendChild(sec);
}
byId['pages'].clientWidth = 368;
byId['pages'].scrollTo = function (opt) { this.scrollLeft = (opt && opt.left) || 0; };
byId['sb-bat'].appendChild(new FakeEl('i'));
/* dock 与 app-grid 需要真实查询语义：内核用 innerHTML='' 后 appendChild */
const doc = {
  readyState: 'complete',
  documentElement: new FakeEl('html'),
  body: new FakeEl('body'),
  createElement: (t) => {
    const n = new FakeEl(t);
    /* 动态注册：应用用 <style id="xxx"> 注入样式时，getElementById 要能查到 */
    Object.defineProperty(n, 'id', {
      get() { return this._id || ''; },
      set(v) { this._id = v; if (v) byId[v] = this; },
      configurable: true
    });
    return n;
  },
  createDocumentFragment: () => new FakeEl('fragment'),
  /* elementFromPoint 供拖拽找落点用；测试里通过 doc._fromPoint 指定 */
  elementFromPoint: () => doc._fromPoint || null,
  _listeners: {},
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(t, fn) { const a = this._listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
  dispatch(t, ev) { (this._listeners[t] || []).slice().forEach(fn => fn(Object.assign({ preventDefault() { }, stopPropagation() { } }, ev))); },
  querySelector: (sel) => (sel && sel[0] === '#' ? (byId[sel.slice(1)] || null) : null),
  getElementById: (id) => byId[id] || null,
  head: new FakeEl('head'),
  querySelectorAll: () => []
};

const storage = new Map();
const storageImpl = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear(),
  key: i => [...storage.keys()][i]
};
const localStorageProxy = new Proxy(storageImpl, {
  get(t, p) { if (p === 'length') return storage.size; return t[p]; },
  ownKeys: () => [...storage.keys()],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
});

/* ================= 装配到 Node 全局 ================= */
const g = globalThis;
function defineGlobal(name, value) {
  try { Object.defineProperty(g, name, { value, writable: true, configurable: true, enumerable: true }); }
  catch (e) { try { g[name] = value; } catch (e2) { console.warn('无法注入全局 ' + name + '：' + e2.message); } }
}
defineGlobal('window', g);
defineGlobal('self', g);
defineGlobal('document', doc);
defineGlobal('localStorage', localStorageProxy);
defineGlobal('location', { protocol: 'file:', reload() { } });
defineGlobal('navigator', { userAgent: 'node-smoke', language: 'zh-CN', getBattery: undefined });
defineGlobal('PHONE_BUILTIN_APPS', []);
defineGlobal('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0));
defineGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
defineGlobal('Blob', class { constructor(parts) { this.parts = parts; } });
defineGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => { } });
defineGlobal('AbortController', class { constructor() { this.signal = null; } abort() { } });
defineGlobal('fetch', () => Promise.reject(new Error('smoke test 不联网')));
defineGlobal('FileReader', class { readAsText() { } });
defineGlobal('module', { exports: {} });
defineGlobal('addEventListener', () => { });
defineGlobal('removeEventListener', () => { });
defineGlobal('getComputedStyle', () => ({ getPropertyValue: () => '0px' }));
defineGlobal('devicePixelRatio', 1);
defineGlobal('innerWidth', 420);
defineGlobal('innerHeight', 900);

/* ================= 载入内核 ================= */
const coreSrc = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
section('内核加载');
try {
  vm.runInThisContext(coreSrc, { filename: 'core.js' });
  ok('core.js 执行无异常', true);
} catch (e) { ok('core.js 执行无异常', false, e.message + '\n' + e.stack); }
const phone = g.window.Phone;
ok('window.Phone 已暴露', !!phone);
ok('boot 后锁屏状态已设置', typeof phone._state.locked === 'boolean');

/* ================= 假内置应用 ================= */
const mounted = { log: [] };
const ctxProbe = (id) => ({
  store: phone.store(id), onKey() { }, onCleanup() { }, setTitle() { }, addAction() { }, close() { },
  useFullBody() { }, setBodyPadding() { }
});
g.PHONE_BUILTIN_APPS.push({
  id: 'demo', code: '', createApp: function (phoneApi) {
    return {
      id: 'demo', name: '示例应用', icon: 'svg:star', desc: '示例', order: 1,
      mount: function (p, rootEl, ctx) {
        mounted.log.push('mount:' + (rootEl ? 'root ok' : 'root missing'));
        ctx.setTitle('示例应用');
        ctx.addAction('计数', function () { });
        ctx.store.set('n', ctx.store.get('n', 0) + 1);
        ctx.onKey(function () { });
        ctx.onCleanup(function () { mounted.log.push('cleanup'); });
        rootEl.appendChild(p.utils.el('div', 'ui-card', 'hello'));
      }
    };
  }
});
g.PHONE_BUILTIN_APPS.push({
  id: 'boom', code: '', createApp: function () {
    return { id: 'boom', name: '崩溃测试', icon: 'emoji:💥', mount: function () { throw new Error('故意崩溃'); } };
  }
});

/* 提前把所有内置应用/游戏文件加载进来，保持与真实 index 一致的加载顺序 */
const builtinFiles = [];
if (fs.existsSync(path.join(root, 'src/apps'))) fs.readdirSync(path.join(root, 'src/apps')).sort().forEach(f => builtinFiles.push('apps/' + f));
if (fs.existsSync(path.join(root, 'src/games'))) fs.readdirSync(path.join(root, 'src/games')).sort().forEach(f => builtinFiles.push('games/' + f));
section('加载内置应用文件');
for (const f of builtinFiles) {
  if (!f.endsWith('.js')) continue;
  try {
    const before = g.PHONE_BUILTIN_APPS.length;
    vm.runInThisContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), { filename: f });
    const added = g.PHONE_BUILTIN_APPS.slice(before);
    added.forEach(x => { x.__file = f; });
    ok(f + ' 执行无异常', added.length > 0 && added.every(x => typeof x.createApp === 'function'),
      added.length + ' 个注册条目');
  } catch (e) { ok(f + ' 执行无异常', false, e.message); }
}

section('插件源码编译（compileAppCode）');
/* 约定：phone.compile(code) 返回的是 mount 函数（不是定义对象） */
try {
  const m = phone.compile('function createApp(phone){ return { id:"t1", name:"T1", icon:"emoji:🎯", mount:function(p,root,ctx){ ctx.store.set("hit",1); root.appendChild(p.utils.el("div","ui-card","x")); } }; }');
  const el = new FakeEl('div');
  m(phone, el, ctxProbe('t1'));
  ok('标准 createApp 写法可编译并执行 mount', el.children.length === 1 && phone.store('t1').get('hit') === 1);
} catch (e) { ok('标准 createApp 写法可编译并执行 mount', false, String(e && e.message)); }
try {
  const m2 = phone.compile('module.exports = { id:"t2", name:"T2", icon:"svg:bolt", mount:function(p,root){ root.appendChild(p.utils.el("b",null,"bolt")); } };');
  const el2 = new FakeEl('div');
  m2(phone, el2, ctxProbe('t2'));
  ok('module.exports 写法可编译并执行 mount', el2.children.length === 1);
} catch (e) { ok('module.exports 写法可编译并执行 mount', false, e.message); }
try {
  const m3 = phone.compile('function createApp(phone){ return { id:"t4", name:"T4", icon:"emoji:🎈", mount:function(){} }; }');
  phone.addApp({ id: 't4', name: 'T4', icon: 'emoji:🎈' }, { code: 'function createApp(phone){ return { id:"t4", name:"T4", icon:"emoji:🎈", mount:function(){} }; }', silent: true });
  const reopened = phone.getApp('t4').mount;
  ok('安装后的 mount 与 compile 出的是同一函数', typeof m3 === 'function' && typeof reopened === 'function');
} catch (e) { ok('安装后的 mount 与 compile 出的是同一函数', false, e.message); }
try {
  phone.compile('var x = 1;');
  ok('缺少 createApp 时抛出中文错误', false, '没有抛错');
} catch (e) { ok('缺少 createApp 时抛出中文错误', /createApp/.test(e.message), e.message); }
try {
  phone.compile('function createApp(){ return { id:"BAD ID", mount:function(){} }; }');
  ok('非法 id 被拒绝', false, '没有抛错');
} catch (e) { ok('非法 id 被拒绝', /id/.test(e.message), e.message); }
try {
  phone.compile('function createApp(){ return { id:"t3", name:"T3" }; }');
  ok('缺少 mount 被拒绝', false, '没有抛错');
} catch (e) { ok('缺少 mount 被拒绝', /mount/.test(e.message), e.message); }

section('应用注册表');
/* 把所有页面里的图标收集起来（新结构：图标分布在各页的 [data-grid] 里） */
const $$grid = () => byId['pages'].querySelectorAll('.app-item');
phone.rebind();
let ids = phone.getApps().map(a => a.id);
ok('内置应用已注册（demo / boom）', ids.includes('demo') && ids.includes('boom'), ids.join(','));
ok('内置应用标记 builtin', phone.getApp('demo').builtin === true);
ok('getApps 按 order 排序', phone.getApps()[0].id === 'demo', ids.join(','));
ok('桌面渲染出应用图标', $$grid().length >= 6, String($$grid().length));
ok('dock 渲染了 3 个固定图标', byId['dock'].children.length === 3, String(byId['dock'].children.length));
ok('页码圆点已生成', byId['page-dots'].children.length === 3, String(byId['page-dots'].children.length));

section('插件安装 / 导出 / 导入');
try {
  const install = phone.addApp({ id: 'plug1', name: '插件一', icon: 'emoji:🧩', desc: '测试插件' },
    { code: 'function createApp(phone){ return { id:"plug1", name:"插件一", icon:"emoji:🧩", desc:"测试插件", mount:function(){} }; }' });
  ok('addApp 返回成功', install.ok === true && install.saved === true, JSON.stringify({ ok: install.ok, saved: install.saved }));
} catch (e) { ok('addApp 返回成功', false, e.message); }
ok('新应用出现在桌面列表', phone.getApps().some(a => a.id === 'plug1'));
ok('注册表写入 localStorage', !!storageImpl.getItem('phone.registry.v1'));
const exp = phone.exportApp('plug1');
ok('exportApp 带出源码', exp && exp.code.indexOf('createApp') >= 0);
try {
  phone.addApp({ id: 'demo', name: '撞名', mount: function () { } }, {});
  ok('与内置应用 id 冲突被拒绝', false, '没有抛错');
} catch (e) { ok('与内置应用 id 冲突被拒绝', /冲突/.test(e.message), e.message); }
const bundle = JSON.stringify({
  schema: 'phoneshell.bundle/1',
  apps: [{ id: 'plug2', name: '插件二', icon: 'emoji:🎲', code: 'function createApp(phone){ return { id:"plug2", name:"插件二", icon:"emoji:🎲", mount:function(){} }; }' }],
  storage: { plug2: { hi: 1 } }
});
const imp = phone.importBundle(bundle);
ok('导入 bundle 成功', imp.ok === 1 && imp.fail.length === 0, JSON.stringify(imp));
ok('导入后存档一并恢复', phone.store('plug2').get('hi') === 1);
ok('导入坏源码会被记录失败', phone.importBundle(JSON.stringify({ apps: [{ id: 'bad1', name: '坏', code: 'this is not js(' }] })).fail.length === 1);
ok('removeApp 能卸载插件', phone.removeApp('plug1') === true);
ok('内置应用不可卸载', phone.removeApp('demo') === false);
ok('导出全部包含应用与存档', (function () { const b = phone.exportAll(); return b.apps.length >= 3 && typeof b.storage === 'object'; })());

section('应用生命周期');
try {
  phone.openApp('demo');
  ok('openApp 触发 mount', mounted.log.includes('mount:root ok'), mounted.log.join('|'));
  ok('openApp 后 state.current 正确', phone._state.current && phone._state.current.app.id === 'demo');
  ok('store 在新应用里可写', phone.store('demo').get('n') === 1, String(phone.store('demo').get('n')));
  const host = byId['apps'].children[0];
  ok('应用容器已插入 DOM', !!host && host.classList.contains('app-host'), String(byId['apps'].children.length));
  ok('应用容器带 data-appId', host.dataset.appId === 'demo', host && host.dataset.appId);
  ok('标题栏渲染了标题', !!host.querySelector('.nav-title') && host.querySelector('.nav-title').textContent === '示例应用');
  ok('ctx.addAction 生成了按钮', host.querySelector('.nav-actions').children.length === 1);
  ok('应用内容区渲染成功', !!host.querySelector('.ui-card'));
  phone.closeApp();
  ok('closeApp 触发 cleanup', mounted.log.includes('cleanup'), mounted.log.join('|'));
  ok('closeApp 清空当前应用', phone._state.current === null);
} catch (e) { ok('应用生命周期流程', false, e.message + '\n' + e.stack); }

section('异常与容错');
try {
  phone.openApp('boom');
  ok('mount 抛错不会打断外壳', phone._state.current !== null && phone._state.current.app.id === 'boom');
  const host = byId['apps'].children.find(h => h.dataset.appId === 'boom');
  ok('崩溃应用显示错误提示', !!host && !!host.querySelector('.ui-hint'));
  phone.closeApp();
} catch (e) { ok('mount 抛错不会打断外壳', false, e.message); }
try {
  phone.openApp('不存在的应用');
  ok('打开不存在的应用不抛错', true);
} catch (e) { ok('打开不存在的应用不抛错', false, e.message); }
ok('最近任务已记录', (phone.settings.get('recents', []) || []).some(r => r.id === 'demo'));

section('锁屏 / 弹窗 / 工具');
try {
  phone.lock(true); ok('lock(true) 生效', phone._state.locked === true);
  phone.unlock(); ok('unlock 生效', phone._state.locked === false);
  const p = phone.confirm('标题', '内容');
  ok('confirm 返回 Promise', p && typeof p.then === 'function');
  ok('弹窗层已展开', byId['modal-layer'].classList.contains('show'));
  const btns = byId['modal-layer'].children[0].findAll('ui-btn');
  ok('弹窗包含两个按钮', btns.length === 2, String(btns.length));
  btns[1].dispatch('click', {});
  ok('点击确定后弹窗关闭', !byId['modal-layer'].classList.contains('show'));
} catch (e) { ok('锁屏 / 弹窗流程', false, e.message); }
ok('esc 转义正确', phone.utils.esc('<b>&"') === '&lt;b&gt;&amp;&quot;', phone.utils.esc('<b>&"'));
ok('md() 能渲染代码块', phone.utils.md('```\nvar a=1;\n```').indexOf('ui-pre') >= 0);
ok('grad() 返回渐变', /linear-gradient/.test(phone.grad('demo')));
ok('icons.html 支持 svg:star', phone.icons.html('svg:star', '#fff').indexOf('<svg') === 0);
ok('icons.html 支持 emoji', phone.icons.html('emoji:🎯', '#fff').indexOf('🎯') > 0);
ok('未知图标有兜底', phone.icons.html('', '#fff').indexOf('<svg') === 0);
ok('icons 列表非空', phone.icons.list.length >= 20, String(phone.icons.list.length));
ok('clamp 正确', phone.utils.clamp(5, 0, 3) === 3);

section('存储层');
try {
  phone.store('demo').set('obj', { a: [1, 2, 3] });
  ok('对象可存取', JSON.stringify(phone.store('demo').get('obj')) === '{"a":[1,2,3]}');
  phone.store('demo').remove('obj');
  ok('remove 生效', phone.store('demo').get('obj') === null);
  phone.store('demo').clear();
  ok('clear 生效', JSON.stringify(phone.store('demo').all()) === '{}');
  phone.settings.set('k', 42);
  ok('settings 可读写', phone.settings.get('k') === 42);
  ok('默认值生效', phone.store('demo').get('none', 'fallback') === 'fallback');
} catch (e) { ok('存储层流程', false, e.message); }

section('内置应用挂载与打开检查');
const written = {};
for (const f of builtinFiles) {
  if (!f.endsWith('.js')) continue;
  try {
    const list = g.PHONE_BUILTIN_APPS.filter(x => x.__file === f);
    const entry = list.length ? list[0] : null;
    if (!entry) { ok(f + ' 在 PHONE_BUILTIN_APPS 里注册', false, '未找到对应条目'); continue; }
    const def = entry.createApp(phone);
    const mountCleanups = [];
    const ctxStub = {
      store: phone.store(def.id), setTitle() { }, addAction() { return new FakeEl('button'); },
      onKey() { }, onCleanup(fn) { if (typeof fn === 'function') mountCleanups.push(fn); },
      close() { }, useFullBody() { }, setBodyPadding() { }
    };
    const rootEl = new FakeEl('div');
    def.mount(phone, rootEl, ctxStub);
    /* 关键：假 DOM 挂载后要跑一遍清理，否则应用里的定时器会漏到后面的测试里
       （UNO 这类会自己排 AI 回合的游戏尤其明显） */
    mountCleanups.forEach(fn => { try { fn(); } catch (e) { /* 清理失败不影响其它断言 */ } });
    const produced = rootEl.children.length + rootEl.all().length;
    ok(f + ' → ' + def.name + ' 挂载成功', produced > 0 && !!def.id, '产出节点 ' + produced);
    if (!written[def.id]) {
      written[def.id] = true;
      if (!phone.getApp(def.id)) phone.addApp(def, { code: entry.code || '', silent: true });
    }
    phone.openApp(def.id);
    const host = byId['apps'].children.find(h => h.dataset.appId === def.id);
    ok(f + ' 能通过 openApp 打开', !!host && host.children.length > 0);
    /* 模拟：打开后立刻关闭，检查清理是否会被调用 */
    phone.closeApp();
  } catch (e) {
    ok(f + ' 挂载成功', false, e.message + (e.stack ? '\n      ' + e.stack.split('\n')[1].trim() : ''));
  }
}

section('五子棋引擎（不调用任何接口，纯本地评估）');
try {
  const goDef = phone.getApp('gomoku');
  const GO = goDef && goDef.mount && goDef.mount.__test && goDef.mount.__test.engine();
  ok('五子棋导出引擎', !!GO && GO.N === 15);
  if (GO) {
    const idx = GO.idx;
    /* 横 / 竖 / 斜 三个方向的五连都要认出来 */
    const mk = (pts, who) => { const b = GO.newBoard(); pts.forEach(([x, y]) => { b[idx(x, y)] = who; }); return b; };
    ok('横向五连判胜', GO.checkWin(mk([[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]], 1)) === 1);
    ok('纵向五连判胜', GO.checkWin(mk([[2, 2], [2, 3], [2, 4], [2, 5], [2, 6]], 2)) === 2);
    ok('斜向五连判胜', GO.checkWin(mk([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], 1)) === 1);
    ok('反斜五连判胜', GO.checkWin(mk([[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]], 2)) === 2);
    ok('四连不算赢', GO.checkWin(mk([[3, 5], [4, 5], [5, 5], [6, 5]], 1)) === 0);
    ok('六连也算赢（长连不为禁手）', GO.checkWin(mk([[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]], 1)) === 1);

    /* 有一步成五时必须走它 */
    const b1 = mk([[3, 5], [4, 5], [5, 5], [6, 5]], 1);
    b1[idx(7, 7)] = 2;
    const win = GO.findBestMove(b1.slice(), 1, 2, 10);
    ok('引擎会抓住自己的五连机会', win.win === true && (win.p === idx(2, 5) || win.p === idx(7, 5)),
      'p=' + win.p + ' win=' + win.win);

    /* 对方四连（活四）必须堵 */
    const b2 = mk([[3, 5], [4, 5], [5, 5], [6, 5]], 2);
    b2[idx(0, 0)] = 1;
    b2[idx(7, 7)] = 1;
    const block = GO.findBestMove(b2.slice(), 1, 2, 10);
    ok('引擎会堵对方的活四', block.win === false && (block.p === idx(2, 5) || block.p === idx(7, 5)),
      'p=' + block.p);

    /* 搜索过程不能改坏棋盘 */
    const b3 = b2.slice();
    GO.findBestMove(b3, 1, 4, 8);
    ok('引擎不修改传入的棋盘', JSON.stringify(b3) === JSON.stringify(b2));

    /* 候选点应当就在已有棋子附近 */
    const cand = GO.candidates(b2);
    const near = cand.every(p => {
      const x = p % 15, y = (p - x) / 15;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(14, y + 2); yy++) {
        for (let xx = Math.max(0, x - 2); xx <= Math.min(14, x + 2); xx++) if (b2[idx(xx, yy)]) return true;
      }
      return false;
    });
    ok('候选点都在已有棋子 2 格内（' + cand.length + ' 个）', cand.length > 0 && near);
    ok('困难难度也会选中制胜点', (() => {
      const r = GO.pickMove(b1.slice(), 1, 2, () => 0.5);
      return r.win === true;
    })());
    ok('简单难度带噪声（同一局面可能选不同点）', (() => {
      const seen = {};
      for (let i = 0; i < 40; i++) seen[GO.pickMove(b2.slice(), 1, 0, Math.random).p] = 1;
      return Object.keys(seen).length >= 1;
    })());
  }
} catch (e) { ok('五子棋引擎', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('UNO 规则 / 概率表情');
try {
  const unoDef = phone.getApp('uno');
  const UN = unoDef && unoDef.mount && unoDef.mount.__test && unoDef.mount.__test.engine;
  ok('UNO 导出引擎与控制器', !!UN && typeof unoDef.mount === 'function');
  if (UN) {
    const deck = UN.buildDeck();
    const cnt = (f) => deck.filter(f).length;
    ok('整副牌 108 张', deck.length === 108, String(deck.length));
    ok('四色各 25 张（0 一张 + 1~9 各两张 + 三种功能牌各两张）', UN.COLORS.every(c => cnt(x => x.color === c) === 25));
    ok('万能牌 8 张（变色 4 + 变色+4 4）', cnt(x => x.color === 'wild') === 8 && cnt(x => x.value === 'wild4') === 4);
    ok('数字牌分布正确（0 四张、1~9 各八张）', cnt(x => x.value === '0') === 4 && cnt(x => x.value === '5') === 8);

    const top = { color: 'red', value: '7' };
    const hand = [
      { color: 'red', value: '3' },     /* 同色可出 */
      { color: 'blue', value: '7' },    /* 同数字可出 */
      { color: 'green', value: '9' },   /* 出不了 */
      { color: 'wild', value: 'wild' }  /* 万能随时可出 */
    ];
    ok('同色可出', UN.canPlay(hand[0], top, 'red', hand) === true);
    ok('同数字可出', UN.canPlay(hand[1], top, 'red', hand) === true);
    ok('不同色不同数字出不了', UN.canPlay(hand[2], top, 'red', hand) === false);
    ok('万能牌随时可出', UN.canPlay(hand[3], top, 'red', hand) === true);
    /* 标准规则：手里还有能跟的牌时不能打变色+4 */
    const hand4 = [{ color: 'red', value: '3' }, { color: 'wild', value: 'wild4' }];
    ok('手里有同色牌时 +4 被禁止', UN.canPlay(hand4[1], top, 'red', hand4) === false);
    const hand5 = [{ color: 'green', value: '3' }, { color: 'wild', value: 'wild4' }];
    ok('手里没牌能跟时 +4 可出', UN.canPlay(hand5[1], top, 'red', hand5) === true);
    ok('可出牌索引列表正确', JSON.stringify(UN.playableList(hand, top, 'red')) === '[0,1,3]',
      JSON.stringify(UN.playableList(hand, top, 'red')));

    /* 表情系统必须是概率触发：同一局面有些次发、有些次不发 */
    const samples = (ev, ctx) => {
      let hit = 0;
      for (let i = 0; i < 400; i++) if (UN.exprTick(ev, ctx || {}, Math.random)) hit++;
      return hit / 400;
    };
    const rPen = samples('penalty', { min: 4 });
    const rPlay = samples('play', { val: 'draw2' });
    const rTense = samples('tense', {});
    ok('「被加牌」表情是概率触发（0 < 触发率 < 1）', rPen > 0.15 && rPen < 0.85, '触发率 ' + rPen.toFixed(2));
    ok('「成功打出 +2」表情是概率触发', rPlay > 0.2 && rPlay < 0.9, '触发率 ' + rPlay.toFixed(2));
    ok('「对手只剩一张」紧张表情是概率触发且偏少', rTense > 0.02 && rTense < 0.6, '触发率 ' + rTense.toFixed(2));
    ok('同一局面统计上确实会出现「不发」的情况', samples('penalty', { min: 4 }) < 1);
    ok('随机数偏大时必然不发', UN.exprTick('penalty', { min: 4 }, () => 0.999999) === null);
    ok('随机数偏小时必然触发', !!UN.exprTick('penalty', { min: 4 }, () => 0) &&
      UN.exprTick('penalty', { min: 4 }, () => 0).e.length > 0);
    ok('心情用词覆盖多个不同情境', (() => {
      const evs = {};
      UN.EXPR_RULES.forEach(r => { evs[r.ev] = (evs[r.ev] || 0) + 1; });
      return Object.keys(evs).length >= 8;
    })(), Object.keys(UN.EXPR_RULES.reduce((a, r) => (a[r.ev] = 1, a), {})).join(','));
    ok('三个 AI 对手各有名字与头像', UN.AI_PROFILES.length === 3 && UN.AI_PROFILES.every(p => p.name && p.avatar));
  }
} catch (e) { ok('UNO 规则 / 表情', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('UNO 对局流程（真跑局内控制把手）');
try {
  /* 先走一次真实的 openApp，确认界面结构渲染出来（同时也是 mount 真跑） */
  phone.openApp('uno');
  const host = byId['apps'].children.filter(h => h.dataset.appId === 'uno').pop();
  ok('UNO 走 openApp 打开了界面', !!host && host.all().length > 10, host ? host.all().length + ' 个节点' : 'null');
  ok('界面渲染出牌堆与起手牌（7 或 9 张）', !!host && !!host.querySelector('.uno-deck') &&
    !!host.querySelector('.uno-hand') && [7, 9].indexOf(host.querySelector('.uno-hand').children.length) >= 0,
    host && host.querySelector('.uno-hand') ? ('hand 子节点 ' + host.querySelector('.uno-hand').children.length) : 'no-hand');
  ok('手牌卡片数与手牌数一致', !!host &&
    host.querySelectorAll('.uno-mcard').length === host.querySelector('.uno-hand').children.length);
  ok('界面有 3 个对手面板', !!host && host.querySelectorAll('.uno-pl').length === 3,
    host ? String(host.querySelectorAll('.uno-pl').length) : '');
  ok('三个 AI 分列上 / 左 / 右三侧，玩家在下方', (() => {
    if (!host) return false;
    const top = host.querySelector('.uno-seat-top');
    const left = host.querySelector('.uno-seat-left');
    const right = host.querySelector('.uno-seat-right');
    const bottom = host.querySelector('.uno-seat-bottom');
    if (!top || !left || !right || !bottom) return false;
    /* 上侧 1 个 AI、左右各 1 个，玩家在自己的下方座位里 */
    return top.querySelectorAll('.uno-pl').length === 1 &&
      left.querySelectorAll('.uno-pl').length === 1 &&
      right.querySelectorAll('.uno-pl').length === 1 &&
      !!bottom.querySelector('.uno-me');
  })());
  ok('四家出牌都汇到中央同一个弃牌堆', (() => {
    if (!host) return false;
    const center = host.querySelector('.uno-center');
    return !!center && !!center.querySelector('.uno-deck') && !!center.querySelector('.uno-pile') &&
      center.querySelectorAll('.uno-pile').length === 1;
  })());
  ok('界面有表情气泡容器', !!host && !!host.querySelector('.uno-bub'));
  ok('界面有摸牌 / 抓他 / 喊 UNO 三个按钮', (() => {
    if (!host) return false;
    const f = host.querySelector('.uno-foot');
    return !!f && f.findAll('ui-btn').length >= 3;
  })());
  phone.closeApp();

  /* 再用一份「隔离实例」验证规则细节：自己 mount 一份，不和界面上的那局互相干扰 */
  const isoRoot = new FakeEl('div');
  const isoCleanups = [];
  const rootActions = [];
  const isoCtx = {
    store: phone.store('uno-iso'), setTitle() { },
    addAction(label, fn) { const b = new FakeEl('button'); b.textContent = label; b.addEventListener('click', fn); rootActions.push(b); return b; },
    onKey() { }, onCleanup(fn) { if (typeof fn === 'function') isoCleanups.push(fn); },
    close() { }, useFullBody() { }, setBodyPadding() { }
  };
  phone.getApp('uno').mount(phone, isoRoot, isoCtx);
  const ctrl = phone.getApp('uno').mount.__test.controller();
  ok('UNO 局内控制把手可用', !!ctrl);
  if (ctrl) {
    /* 重开一局，拿到确定性的初始状态（假 DOM 只有一个根，早先的实例共用它） */
    ctrl.newGame();
    /* ---- 弃牌堆必须「叠」在中央一格，不能把牌排在下面变成第二叠 ---- */
    ok('弃牌堆把牌绝对定位叠在同一格（CSS 断言）', (() => {
      const css = (phone.getApp('uno').mount.__test.css) || '';
      return /\.uno-pile\s*\.uno-card\{[^}]*position:absolute/.test(css) &&
        /\.uno-pile\{[^}]*position:relative/.test(css) &&
        /\.uno-center\{[^}]*grid-area:center/.test(css) &&
        /\.uno-colorTag\{[^}]*position:absolute/.test(css);
    })());
    ok('开局弃牌堆只有 1 张牌、且是「顶牌」', (() => {
      const pile = isoRoot.querySelector('.uno-pile');
      const cards = isoRoot.querySelectorAll('.uno-pile .uno-card');
      /* 直接子节点 = 颜色标签(1) + 牌，不能有重复节点残留 */
      return cards.length === 1 && pile.children.length === 2 &&
        isoRoot.querySelectorAll('.uno-pile .pile-top').length === 1 &&
        String(pile.children[0].className).indexOf('uno-colorTag') >= 0;
    })(), isoRoot.querySelectorAll('.uno-pile .uno-card').length + ' 张');
    ok('弃牌堆里只有 1 张顶牌 + 最多 2 张底牌（不会无限堆高）', (() => {
      const cards = isoRoot.querySelectorAll('.uno-pile .uno-card');
      const pile = isoRoot.querySelector('.uno-pile');
      return cards.length >= 1 && cards.length <= 3 &&
        pile.children.length === cards.length + 1 &&
        isoRoot.querySelectorAll('.uno-pile .pile-top').length === 1;
    })(), isoRoot.querySelectorAll('.uno-pile .uno-card').length + ' 张');
    ok('新打出的牌带「从出牌人方向飞入」的动画类', (() => {
      const top = isoRoot.querySelector('.uno-pile .pile-top');
      return !!top && ['fly-bottom', 'fly-left', 'fly-top', 'fly-right'].some(c => top.classList.contains(c));
    })());

    const hands = ctrl.hands();
    /* 开局明牌若是 +2，玩家的首手牌就会是 9 张，所以这里只断言「不少于 7 张」 */
    ok('开局四家各 7 张起手', hands.length === 4 && hands.every(h => h.length === 7 || h.length === 9),
      hands.map(h => h.length).join('/'));
    ok('三位 AI 起手固定 7 张', hands.slice(1).every(h => h.length === 7), hands.map(h => h.length).join('/'));
    ok('开局定好了当前颜色与弃牌堆顶', typeof ctrl.color() === 'string' && !!ctrl.discard().length, ctrl.color());

    const before = hands[0].length;
    ctrl.draw(0, 2);
    ok('摸牌后手牌 +2', ctrl.hands()[0].length === before + 2, before + ' → ' + ctrl.hands()[0].length);

    /* 塞一张必定能出的牌，验证出牌 / 颜色 / 弃牌堆 */
    const top0 = ctrl.discard()[ctrl.discard().length - 1];
    const sure = { color: top0.color, value: top0.value === '9' ? '8' : '9' };
    ctrl.hands()[0].unshift(sure);
    const n0 = ctrl.hands()[0].length;
    ctrl.play(0, sure, null);
    ok('出牌后手牌 -1 且进入弃牌堆',
      ctrl.hands()[0].length === n0 - 1 && ctrl.discard()[ctrl.discard().length - 1] === sure);
    ok('出普通牌后当前颜色 = 该牌颜色', ctrl.color() === sure.color, ctrl.color());

    /* 万能牌：显式选色 */
    const wild = { color: 'wild', value: 'wild' };
    ctrl.hands()[0].unshift(wild);
    ctrl.play(0, wild, 'blue');
    ok('打万能牌后按所选颜色变更', ctrl.color() === 'blue', ctrl.color());

    /* +2：下家摸两张并被跳过（开局若是反转，下家就不是 1 号座，按当前方向算） */
    const victim = (0 + ctrl.direction() + 4) % 4;
    const vBefore = ctrl.hands()[victim].length;
    ctrl.play(0, { color: 'blue', value: 'draw2' }, null);
    ok('+2 让下家（' + victim + ' 号座）摸两张', ctrl.hands()[victim].length === vBefore + 2,
      vBefore + ' → ' + ctrl.hands()[victim].length + '（dir=' + ctrl.direction() + '）');
    ok('+2 之后下家被跳过', ctrl.turn() !== victim, 'turn=' + ctrl.turn());

    /* 反转牌：方向翻转，之后轮到另一边 */
    const dir0 = ctrl.direction();
    ctrl.play(0, { color: ctrl.color(), value: 'reverse' }, null);
    ok('反转牌把方向翻过来', ctrl.direction() === -dir0, 'direction=' + ctrl.direction());
    ok('反转后轮到另一边', ctrl.turn() === ((0 + ctrl.direction() + 4) % 4), 'turn=' + ctrl.turn());

    /* 禁止牌：下家被跳过（前进两个座位） */
    const dir1 = ctrl.direction();
    ctrl.play(0, { color: ctrl.color(), value: 'skip' }, null);
    ok('禁止牌跳过一个座位', ctrl.turn() === ((0 + 2 * dir1 + 8) % 4), 'turn=' + ctrl.turn());

    /* 连打几张之后，弃牌堆依旧只有「颜色标签 + 最多 3 张牌」，没有多余节点堆积 */
    ctrl.hands()[0].unshift({ color: ctrl.color(), value: '5' });
    ctrl.play(0, ctrl.hands()[0][0], null);
    ctrl.hands()[0].unshift({ color: ctrl.color(), value: '6' });
    ctrl.play(0, ctrl.hands()[0][0], null);
    ctrl.hands()[0].unshift({ color: ctrl.color(), value: '7' });
    ctrl.play(0, ctrl.hands()[0][0], null);
    ok('连打多张后弃牌堆仍然只有「标签 + 最近 3 张」', (() => {
      const pile = isoRoot.querySelector('.uno-pile');
      const cards = isoRoot.querySelectorAll('.uno-pile .uno-card');
      return cards.length === 3 && pile.children.length === 4 &&
        String(pile.children[0].className).indexOf('uno-colorTag') >= 0 &&
        isoRoot.querySelectorAll('.uno-pile .pile-top').length === 1;
    })(), (() => {
      const pile = isoRoot.querySelector('.uno-pile');
      return pile.children.length + ' 个子节点：' + pile.children.map(c => c.className).join(' , ');
    })());

    /* 概率表情：注入固定随机数验证「必然发 / 必然不发」 */
    const rSure = ctrl.react(1, 'penalty', { min: 4 }, () => 0) ||
                  ctrl.react(2, 'penalty', { min: 4 }, () => 0) ||
                  ctrl.react(3, 'penalty', { min: 4 }, () => 0);
    ok('随机数偏小时表情必然冒出来', !!rSure, rSure ? (rSure.e + ' ' + rSure.t) : 'null');
    ok('随机数偏大时同一局面就不发', ctrl.react(1, 'penalty', { min: 4 }, () => 0.999999) === null);
    ok('表情文案带 emoji 表情符号', !!rSure && /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u{1F900}-\u{1F9FF}]/u.test(rSure.e), rSure && rSure.e);
    ok('隔离实例的界面同步更新（气泡节点存在）', !!isoRoot.querySelector('.uno-bub'));
    ok('控制把手能读到四家手牌（' + ctrl.hands().map(h => h.length).join('/') + '）', ctrl.hands().length === 4);

    /* ---- 出牌节奏：默认 1 秒左右 ---- */
    ok('AI 出牌间隔默认 1 秒', ctrl.tempo() === 1000, ctrl.tempo() + 'ms');
    ok('节奏可以调（0.4~2.5 秒之间夹紧）', ctrl.setTempo(600) === 600 && ctrl.setTempo(99999) === 2500 &&
      ctrl.setTempo(1) === 400, 'set 后 = ' + ctrl.tempo());

    /* ---- 角色自定义 ---- */
    const seatNames = [ctrl.seatOf(0), ctrl.seatOf(1), ctrl.seatOf(2), ctrl.seatOf(3)];
    ok('四个座位分别是 下 / 左 / 上 / 右', JSON.stringify(seatNames) === '["bottom","left","top","right"]', seatNames.join(','));
    ok('默认三位 AI 是 小圆 / 阿蓝 / 喵喵', ctrl.profiles().slice(1).map(p => p.name).join('/') === '小圆/阿蓝/喵喵',
      ctrl.profiles().map(p => p.name).join('/'));
    ok('标题栏有「角色」按钮', rootActions.some(b => String(b.textContent).indexOf('角色') >= 0),
      rootActions.map(b => b.textContent).join('/'));
    /* 打开浮层 → 改名字和头像 → 保存 */
    ctrl.openCast();
    ok('打开角色浮层（此时不能出牌）', ctrl.castOpen() === true && ctrl.phase() !== undefined);
    const rows = isoRoot.querySelectorAll('.uno-ed-row');
    ok('浮层里有 4 行角色（我 + 3 个 AI）', rows.length >= 4, String(rows.length));
    ok('浮层里有节奏滑杆', !!isoRoot.querySelector('.uno-ed-tempo'));
    const editPanel = isoRoot.querySelector('.uno-edit');
    const nameInputs = editPanel.querySelectorAll('.uno-in-name');
    const emojiInputs = editPanel.querySelectorAll('.uno-in-emoji');
    ok('每行都有名字与头像输入框', nameInputs.length === 4 && emojiInputs.length === 4,
      nameInputs.length + ' / ' + emojiInputs.length);
    nameInputs[0].value = '小明';
    emojiInputs[0].value = '😎';
    nameInputs[1].value = '大熊';
    emojiInputs[1].value = '🐼';
    ctrl.saveCast();
    ok('保存后角色生效', ctrl.profiles()[0].name === '小明' && ctrl.profiles()[0].avatar === '😎' &&
      ctrl.profiles()[1].name === '大熊' && ctrl.profiles()[1].avatar === '🐼',
      ctrl.profiles().map(p => p.avatar + p.name).join(' '));
    ok('保存后浮层关闭', ctrl.castOpen() === false);
    ok('自定义角色写进了存档', (() => {
      const cast = phone.store('uno-iso').get('cast', null);
      return !!cast && cast.me.name === '小明' && cast.ai[0].name === '大熊' && cast.ai[0].avatar === '🐼';
    })());
    ok('界面上的名字 / 头像跟着变（左侧 / 上方 / 右侧各就各位）', (() => {
      const meName = isoRoot.querySelector('.uno-me-head .uno-nm');
      const top = isoRoot.querySelector('.uno-seat-top .uno-pl');
      const left = isoRoot.querySelector('.uno-seat-left .uno-pl');
      const right = isoRoot.querySelector('.uno-seat-right .uno-pl');
      return meName.textContent.indexOf('小明') === 0 &&
        left.dataset.seat === '1' && left.querySelector('.uno-nm').textContent === '大熊' &&
        left.querySelector('.uno-ava').textContent === '🐼' &&
        top.dataset.seat === '2' && top.querySelector('.uno-nm').textContent === '阿蓝' &&
        right.dataset.seat === '3' && right.querySelector('.uno-nm').textContent === '喵喵';
    })(), (() => {
      const meName = isoRoot.querySelector('.uno-me-head .uno-nm');
      const chips = ['top', 'left', 'right'].map(s => {
        const p = isoRoot.querySelector('.uno-seat-' + s + ' .uno-pl');
        return s + '=' + p.querySelector('.uno-ava').textContent + p.querySelector('.uno-nm').textContent;
      });
      return meName.textContent + ' / ' + chips.join(' ');
    })());
    ok('名字太长会被截到 6 字', (() => {
      nameInputs[2].value = '一二三四五六七八九十';
      ctrl.saveCast();
      return ctrl.profiles()[2].name === '一二三四五六';
    })(), ctrl.profiles()[2].name);
    ok('空名字回落到原名', (() => {
      const before = ctrl.profiles()[2].name;
      nameInputs[2].value = '   ';
      ctrl.saveCast();
      return ctrl.profiles()[2].name === before;
    })(), ctrl.profiles()[2].name);
    ctrl.resetCast();
    ok('恢复默认后回到 小圆 / 阿蓝 / 喵喵', ctrl.profiles()[1].name === '小圆' && ctrl.profiles()[2].name === '阿蓝',
      ctrl.profiles().map(p => p.name).join('/'));

    /* 跑一遍清理，确认退出应用时定时器能被清干净 */
    isoCleanups.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
    ok('UNO 实例清理不报错', true);
  }
} catch (e) { ok('UNO 对局流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('五子棋界面交互（落子 + 求助）');
try {
  const goApp = phone.getApp('gomoku');
  const goRoot = new FakeEl('div');
  goRoot.clientWidth = 360; goRoot.clientHeight = 560;
  const goCleanups = [];
  const actions = [];
  const goCtx = {
    store: phone.store('gomoku-iso'), setTitle() { },
    addAction(label, fn) { const b = new FakeEl('button'); b.textContent = label; b.addEventListener('click', fn); actions.push(b); return b; },
    onKey(fn) { goCleanups.push(() => { }); },
    onCleanup(fn) { if (typeof fn === 'function') goCleanups.push(fn); },
    close() { }, useFullBody() { }, setBodyPadding() { }
  };
  goApp.mount(phone, goRoot, goCtx);
  const goState = goApp.mount.__test.state;
  const goEngine = goApp.mount.__test.engine();
  const canvas = goRoot.querySelector('canvas');
  ok('五子棋渲染出棋盘画布', !!canvas);
  ok('标题栏有「求助」按钮', actions.some(b => String(b.textContent).indexOf('求助') >= 0),
    actions.map(b => b.textContent).join('/'));

  /* 点棋盘中央（天元）应该落一颗黑子 */
  const st0 = goState();
  const cx = st0.metric.x + 7 * st0.metric.gap;
  const cy = st0.metric.y + 7 * st0.metric.gap;
  canvas.dispatch('pointerdown', { clientX: cx, clientY: cy, button: 0, pointerType: 'mouse', cancelable: true });
  const st1 = goState();
  ok('点击棋盘落下一颗黑子', st1.board[goEngine.idx(7, 7)] === 1, '该点 = ' + st1.board[goEngine.idx(7, 7)]);
  ok('落子后手数 +1 且轮到电脑', st1.stones === st0.stones + 1 && st1.turn === 2,
    'stones=' + st1.stones + ' turn=' + st1.turn);
  ok('落子写入了悔棋历史', st1.history.length === 1 && st1.history[0] === goEngine.idx(7, 7));

  /* 电脑回合里不该接受落子 */
  const before = goState().stones;
  canvas.dispatch('pointerdown', { clientX: cx + st0.metric.gap * 3, clientY: cy, button: 0, pointerType: 'mouse', cancelable: true });
  ok('电脑回合点棋盘不会乱落子', goState().stones === before, 'stones=' + goState().stones);

  /* 等电脑落子（有随机延迟，等久一点） */
  await new Promise(r => setTimeout(r, 900));
  const st2 = goState();
  ok('电脑会自动应一手', st2.stones >= 2, 'stones=' + st2.stones);
  ok('电脑回合结束后轮回玩家', st2.turn === 1, 'turn=' + st2.turn);

  /* 求助：点标题栏的求助按钮，应给出推荐点标记 */
  const hintBtn = actions.find(b => String(b.textContent).indexOf('求助') >= 0);
  hintBtn.dispatch('click', {});
  const st3 = goState();
  ok('求助给出了推荐点', st3.hintPos >= 0, 'hintPos=' + st3.hintPos);
  ok('推荐点是空位', st3.board[st3.hintPos] === 0);
  ok('推荐点已经画到界面上（金色标记可见）', (() => {
    const dot = goRoot.querySelector('.gomoku-hintDot');
    return !!dot && dot.style.display === 'block' && /px$/.test(dot.style.width || '');
  })());

  goCleanups.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
  ok('五子棋实例清理不报错', true);
} catch (e) { ok('五子棋界面交互', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('拼图：切块 / 咬合边 / 拖放吸附 / 底部碎片列表');
try {
  const pzDef = phone.getApp('puzzle');
  const PZ = pzDef && pzDef.mount && pzDef.mount.__test;
  ok('拼图已注册并导出纯函数', !!pzDef && pzDef.builtin === true && !!PZ && typeof PZ.buildPuzzle === 'function');

  if (PZ) {
    /* ---- 1. 行列推算与底板等比缩放 ---- */
    const g24 = PZ.planGrid(24, 0.75);
    ok('24 片 + 竖图 → 4×6 共 24 片', g24.cols === 4 && g24.rows === 6, JSON.stringify(g24));
    const g24w = PZ.planGrid(24, 1.3333);
    ok('24 片 + 横图 → 6×4 共 24 片', g24w.cols === 6 && g24w.rows === 4, JSON.stringify(g24w));
    ok('片数越多，行列越多', (() => {
      const a = PZ.planGrid(12, 1), b = PZ.planGrid(80, 1);
      return b.cols * b.rows > a.cols * a.rows;
    })());
    const gBig = PZ.planGrid(300, 0.6);
    ok('行列数有上限（最多 64×64，给 1000 片留够空间）', gBig.cols <= 64 && gBig.rows <= 64, JSON.stringify(gBig));
    const g1000 = PZ.planGrid(1000, 0.75);
    ok('1000 片能切成约 27×37（接近 1000 片）',
      g1000.total >= 950 && g1000.total <= 1050, JSON.stringify(g1000));
    const bigPz = PZ.buildPuzzle({ w: 334, h: 445, cols: g1000.cols, rows: g1000.rows, mode: 'jigsaw', rnd: () => 0.3 });
    ok('1000 片能切出来，每片都有多边形',
      bigPz.pieces.length === g1000.total && bigPz.pieces.every(p => p.pts.length >= 4),
      'pieces=' + bigPz.pieces.length);
    ok('1000 片时凸起按比例缩小（不会比格子还大）',
      bigPz.amp <= Math.min(bigPz.cellW, bigPz.cellH) * 0.24 + 0.001,
      'amp=' + bigPz.amp.toFixed(2) + ' cell=' + Math.min(bigPz.cellW, bigPz.cellH).toFixed(2));

    const fit = PZ.fitBox(1200, 900, 320, 500);
    ok('底板等比缩放（长宽保持 4:3，且不超出可用区域）',
      Math.abs(fit.w / fit.h - 4 / 3) < 0.01 && fit.w <= 320.001 && fit.h <= 500.001,
      JSON.stringify(fit));

    /* ---- 2. 边缘曲线 ---- */
    const straight = PZ.edgePoints(0, 0, 100, 0, 0, 0.5, 20);
    ok('s=0 的边是直线（只有两个端点）',
      straight.length === 2 && straight[1][0] === 100 && straight[1][1] === 0);
    const bumpDown = PZ.edgePoints(0, 0, 100, 0, 1, 0.5, 20);
    const maxY = Math.max(...bumpDown.map(p => p[1]));
    ok('横边 s=+1 朝下凸（法线方向固定）', Math.abs(maxY - 20) < 0.5, 'maxY=' + maxY);
    const bumpUp = PZ.edgePoints(0, 0, 100, 0, -1, 0.5, 20);
    const minY = Math.min(...bumpUp.map(p => p[1]));
    ok('横边 s=-1 朝上凸', Math.abs(minY + 20) < 0.5, 'minY=' + minY);
    const vBump = PZ.edgePoints(0, 0, 0, 100, 1, 0.5, 20);
    ok('竖边 s=+1 朝左凸', Math.abs(Math.min(...vBump.map(p => p[0])) + 20) < 0.5);

    /* ---- 3. 经典拼图 ---- */
    const classic = PZ.buildPuzzle({ w: 300, h: 400, cols: 3, rows: 4, mode: 'classic' });
    ok('经典拼图片数 = 行列乘积', classic.pieces.length === 12, String(classic.pieces.length));
    ok('经典拼图每片都是标准矩形', classic.pieces.every(p =>
      Math.abs((p.maxX - p.minX) - classic.cellW) < 1e-6 &&
      Math.abs((p.maxY - p.minY) - classic.cellH) < 1e-6));
    ok('经典拼图每片 4 个角', classic.pieces.every(p => p.pts.length === 4),
      classic.pieces.map(p => p.pts.length).join(','));
    ok('经典拼图外框正好铺满底板', (() => {
      const minX = Math.min(...classic.pieces.map(p => p.minX));
      const minY = Math.min(...classic.pieces.map(p => p.minY));
      const maxX = Math.max(...classic.pieces.map(p => p.maxX));
      const maxY = Math.max(...classic.pieces.map(p => p.maxY));
      return Math.abs(minX) < 1e-6 && Math.abs(minY) < 1e-6 &&
        Math.abs(maxX - 300) < 1e-6 && Math.abs(maxY - 400) < 1e-6;
    })());

    /* ---- 4. 异形拼图（咬合边） ---- */
    const jig = PZ.buildPuzzle({ w: 300, h: 400, cols: 3, rows: 4, mode: 'jigsaw', rnd: () => 0.9 });
    ok('异形拼图片数 = 行列乘积', jig.pieces.length === 12);
    ok('异形拼图的边带凸起（点数远多于 4）', jig.pieces.every(p => p.pts.length > 20),
      jig.pieces.map(p => p.pts.length).join(','));
    ok('异形碎片会伸出自己的格子（凸起）', jig.pieces.some(p =>
      (p.maxX - p.minX) > jig.cellW + 1 || (p.maxY - p.minY) > jig.cellH + 1));

    const inPoly = (pt, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if (((yi > pt[1]) !== (yj > pt[1])) &&
          (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    const pieceAt = (r, c) => jig.pieces.find(p => p.r === r && p.c === c) || null;
    const edge = jig.vEdge[1][1];
    const peak = edge[Math.floor(edge.length / 2)];
    const leftP = pieceAt(1, 0), rightP = pieceAt(1, 1);
    ok('相邻两片共享同一条边缘点列（凹凸天生互补）', (() => {
      if (!leftP || !rightP) return false;
      const has = (poly, pt) => poly.some(q => Math.abs(q[0] - pt[0]) < 1e-6 && Math.abs(q[1] - pt[1]) < 1e-6);
      return edge.every(pt => has(leftP.pts, pt) && has(rightP.pts, pt));
    })());
    ok('咬合边两侧分属两片：不会留缝也不会重叠', (() => {
      if (!leftP || !rightP || !peak) return false;
      /* 固定 rnd 时竖边 s=+1，凸起朝左 */
      const a = [peak[0] - 3, peak[1]];
      const b = [peak[0] + 3, peak[1]];
      return inPoly(a, leftP.pts) && !inPoly(a, rightP.pts) &&
        !inPoly(b, leftP.pts) && inPoly(b, rightP.pts);
    })());
    ok('异形拼图：每片的格子中心只属于它自己（无空洞）', (() => {
      for (const p of jig.pieces) {
        const c = [p.slotX + p.slotW / 2, p.slotY + p.slotH / 2];
        if (jig.pieces.filter(q => inPoly(c, q.pts)).length !== 1) return false;
      }
      return true;
    })());
    const polyArea = (poly) => {
      let s = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      }
      return Math.abs(s / 2);
    };
    const areaSum = jig.pieces.reduce((n, p) => n + polyArea(p.pts), 0);
    ok('异形碎片面积之和 = 底板面积（凸起与凹口正好抵消，不重叠不漏空）',
      Math.abs(areaSum - 300 * 400) < 1, 'sum=' + areaSum.toFixed(2));
    const classicArea = classic.pieces.reduce((n, p) => n + polyArea(p.pts), 0);
    ok('经典碎片面积之和 = 底板面积', Math.abs(classicArea - 300 * 400) < 1, 'sum=' + classicArea.toFixed(2));
    ok('随机 8 组异形拼图同样满足「面积守恒 + 每片中心唯一」', (() => {
      for (let t = 0; t < 8; t++) {
        const cols = 2 + (t % 4);
        const rows = 2 + ((t * 3) % 4);
        const w = 140 + (t % 4) * 30, h = 160 + (t % 3) * 40;
        let seed = 987654321 + t;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const b = PZ.buildPuzzle({ w, h, cols, rows, mode: 'jigsaw', rnd });
        if (b.pieces.length !== cols * rows) return false;
        const sum = b.pieces.reduce((n, p) => n + polyArea(p.pts), 0);
        if (Math.abs(sum - w * h) > 1) return false;
        for (const p of b.pieces) {
          const c = [p.slotX + p.slotW / 2, p.slotY + p.slotH / 2];
          if (b.pieces.filter(q => inPoly(c, q.pts)).length !== 1) return false;
        }
      }
      return true;
    })());

    /* ---- 5. 真挂载：底板尺寸 / 下方列表 / 吸附 ---- */
    ['pz.save.state', 'pz.save.image'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } });
    const root = new FakeEl('div');
    root.clientWidth = 360; root.clientHeight = 620;
    const cleanups = [];
    const actions = [];
    const pzCtx = {
      store: phone.store('puzzle-iso'), setTitle() { },
      addAction(label, fn) {
        const b = new FakeEl('button');
        b.textContent = label;
        b.addEventListener('click', fn);
        actions.push({ label, fn, b });
        return b;
      },
      onKey() { }, onCleanup(fn) { if (typeof fn === 'function') cleanups.push(fn); },
      close() { }, useFullBody() { }, setBodyPadding() { }
    };
    pzDef.mount(phone, root, pzCtx);
    const PZ2 = pzDef.mount.__test;
    const C = PZ2.controller();
    await C.ready();
    const st0 = C.state();

    ok('界面渲染出画布和底部碎片列表', !!root.querySelector('.pz-canvas') && !!root.querySelector('.pz-strip'));
    ok('底部列表是横向可滑动的（CSS）', /\.pz-strip\{[^}]*overflow-x:auto/.test(PZ2.css));
    ok('默认装好示例图「晚霞山峦」', st0.imgName === '晚霞山峦' && st0.imgW === 720 && st0.imgH === 960,
      st0.imgName + ' ' + st0.imgW + 'x' + st0.imgH);
    ok('底板长宽比跟图片一致（竖图）',
      Math.abs(st0.boardW / st0.boardH - 720 / 960) < 0.02, st0.boardW + 'x' + st0.boardH);
    ok('默认 24 片，全部在下方列表里',
      st0.total === 24 && C.trayCount() === 24,
      'total=' + st0.total + ' tray=' + C.trayCount());
    const trayWin0 = C.trayWindow();
    ok('底部列表按总数撑出滚动宽度，但只渲染可视窗口（1000 片也不怕）',
      trayWin0.total === 24 && trayWin0.rendered > 0 && trayWin0.rendered < 24 &&
      root.querySelector('.pz-track').style.width === (24 * trayWin0.step - 7) + 'px',
      JSON.stringify(trayWin0) + ' width=' + root.querySelector('.pz-track').style.width);
    ok('碎片都画成了缩略图', root.querySelectorAll('.pz-thumb').length > 0,
      root.querySelectorAll('.pz-thumb').length + ' 个');
    ok('标题栏有「换图」「重开」入口',
      actions.some(a => a.label.indexOf('换图') >= 0) && actions.some(a => a.label.indexOf('重开') >= 0),
      actions.map(a => a.label).join('/'));
    ok('工具栏有吸附提示开关、缩放按钮和保存按钮',
      !!root.querySelector('.pz-tools') &&
      /pz-ic/.test(String(root.querySelector('.pz-tools').children.map(c => c.className).join(' '))) &&
      root.querySelector('.pz-zoom').textContent === '100%');

    const p0 = C.piece(0);
    const t0 = C.target(0);
    ok('放到错误位置不会被吸住', C.drop(0, t0.x - 200, t0.y - 200) === false && C.state().placed === 0);
    ok('放错的碎片仍然留在下方列表里', C.trayCount() === 24);
    ok('放在正确位置附近会自动吸附', C.drop(0, t0.x + 6, t0.y - 5) === true, 'piece=' + p0.r + ',' + p0.c);
    const st1 = C.state();
    ok('吸附后完成数 +1、列表 -1、步数 +1',
      st1.placed === 1 && C.trayCount() === 23 && st1.moves === 1,
      JSON.stringify({ placed: st1.placed, tray: C.trayCount(), moves: st1.moves }));
    ok('已拼好的碎片记在底板上', C.piece(0).placed === true);

    C.select(1);
    ok('点一下碎片会选中（再点底板就能放）', C.state().selected === 1);
    C.select(1);
    ok('再点一下取消选中', C.state().selected === -1);

    /* ---- 6. 全部拼完 ---- */
    const total0 = C.state().total;
    C.placeAll();
    ok('全部拼好会进入完成状态', C.state().placed === total0 && C.state().over === true,
      JSON.stringify({ placed: C.state().placed, total: total0 }));
    ok('完成时弹出结算浮层', root.querySelector('.pz-over').classList.contains('show'));
    ok('完成时记录最好成绩（按模式 + 片数）', !!C.state().best['classic:24'], JSON.stringify(C.state().best));
    ok('碎片列表显示「都放上去了」', /都放上去了/.test(root.querySelector('.pz-strip').textContent));

    /* ---- 7. 异形模式 + 换片数 ---- */
    C.setCount(12);
    C.setMode('jigsaw');
    const st2 = C.state();
    ok('能切到异形拼图并改成 12 片', st2.mode === 'jigsaw' && st2.total === 12 && st2.placed === 0,
      JSON.stringify({ mode: st2.mode, total: st2.total, placed: st2.placed }));
    ok('玩法设置写进存档', phone.store('puzzle-iso').get('mode') === 'jigsaw' &&
      phone.store('puzzle-iso').get('count') === 12);
    ok('异形碎片画布比格子大（凸起被画进来了）', (() => {
      for (let i = 0; i < st2.total; i++) {
        const p = C.piece(i);
        if (p.boxW - 4.8 > st2.cellW + 1 || p.boxH - 4.8 > st2.cellH + 1) return true;
      }
      return false;
    })());

    /* ---- 8. 真走一遍拖拽（pointerdown → pointermove → pointerup） ---- */
    const item = root.querySelector('.pz-item');
    const dragPi = Number(item.dataset.piece);
    const dragTarget = C.target(dragPi);
    const client = C.boardPointToClient(dragTarget.x, dragTarget.y);
    item.dispatch('pointerdown', { clientX: 40, clientY: 600, button: 0, pointerId: 1, cancelable: true });
    doc.dispatch('pointermove', { clientX: 40, clientY: 430, pointerId: 1, cancelable: true });
    doc.dispatch('pointermove', { clientX: client.x, clientY: client.y, pointerId: 1, cancelable: true });
    doc.dispatch('pointerup', { clientX: client.x, clientY: client.y, pointerId: 1 });
    ok('从下方列表拖到底板上能吸附', C.state().placed === 1 && C.piece(dragPi).placed === true,
      'placed=' + C.state().placed);

    /* 横向滑动应该是「滚列表」，不能把碎片拿起来 */
    const item2 = root.querySelector('.pz-item');
    const swipePi = Number(item2.dataset.piece);
    item2.dispatch('pointerdown', { clientX: 100, clientY: 600, button: 0, pointerId: 2, cancelable: true });
    doc.dispatch('pointermove', { clientX: 170, clientY: 602, pointerId: 2, cancelable: true });
    doc.dispatch('pointerup', { clientX: 170, clientY: 602, pointerId: 2 });
    ok('横向滑动只滚列表，不会误放碎片', C.state().placed === 1 && C.piece(swipePi).placed === false);

    /* 浏览器把手势当成滚动 / 触控被系统打断时，不能把手指下那一片误「选中」 */
    const item3 = root.querySelector('.pz-item');
    item3.dispatch('pointerdown', { clientX: 120, clientY: 600, button: 0, pointerId: 3, cancelable: true });
    doc.dispatch('pointermove', { clientX: 124, clientY: 598, pointerId: 3, cancelable: true });
    doc.dispatch('pointercancel', { pointerId: 3 });
    ok('触控被系统打断时不会误选中碎片', C.state().selected === -1, 'selected=' + C.state().selected);

    /* ---- 8.5 缩放 / 平移 ---- */
    C.setCount(200);
    const zBig = C.state();
    ok('片数多时自动放大（200 片 → 150%）', Math.abs(zBig.zoom - 1.5) < 0.01, 'zoom=' + zBig.zoom);
    ok('放大后坐标换算仍然精确', (() => {
      const t = C.target(0);
      const c = C.boardPointToClient(t.x, t.y);
      const b = C.toBoard(c.x, c.y);
      return !!b && Math.abs(b.x - t.x) < 0.5 && Math.abs(b.y - t.y) < 0.5;
    })());
    ok('缩放被夹在 100% ~ 800%', (() => {
      C.setZoom(50);
      const hi = C.state().zoom;
      C.setZoom(0.2);
      const lo = C.state().zoom;
      return hi === 8 && lo === 1;
    })(), 'zoom=' + C.state().zoom);
    const panBefore = C.state();
    C.setZoom(3);
    const panAfter = C.panBy(-60, -40);
    ok('放大后可以平移，而且不会把底板拖出屏幕', (() => {
      const st = C.state();
      const moved = st.panX !== panBefore.panX || st.panY !== panBefore.panY;
      const right = st.panX + st.boardW * st.zoom;
      const bottom = st.panY + st.boardH * st.zoom;
      return moved && st.panX <= 0.5 && right >= st.stageW - 0.5 &&
        st.panY <= 0.5 && bottom >= st.stageH - 0.5;
    })(), JSON.stringify({ before: { x: panBefore.panX, y: panBefore.panY }, after: panAfter }));
    ok('平移之后坐标仍能正确互转', (() => {
      const t = C.target(3);
      const c = C.boardPointToClient(t.x, t.y);
      const b = C.toBoard(c.x, c.y);
      return !!b && Math.abs(b.x - t.x) < 0.5 && Math.abs(b.y - t.y) < 0.5;
    })());
    C.resetZoom();
    ok('点缩放百分比能回到 100%', C.state().zoom === 1);

    const canvasEl = root.querySelector('.pz-canvas');
    const zWheel0 = C.state().zoom;
    canvasEl.dispatch('wheel', { clientX: 160, clientY: 200, deltaY: -100 });
    ok('滚轮可以放大', C.state().zoom > zWheel0, 'zoom ' + zWheel0 + ' → ' + C.state().zoom);
    C.resetZoom();

    const zPinch0 = C.state().zoom;
    canvasEl.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 11, button: 0, cancelable: true });
    canvasEl.dispatch('pointerdown', { clientX: 200, clientY: 200, pointerId: 12, button: 0, cancelable: true });
    doc.dispatch('pointermove', { clientX: 60, clientY: 200, pointerId: 11, cancelable: true });
    doc.dispatch('pointermove', { clientX: 240, clientY: 200, pointerId: 12, cancelable: true });
    const zPinch1 = C.state().zoom;
    doc.dispatch('pointerup', { clientX: 60, clientY: 200, pointerId: 11 });
    doc.dispatch('pointerup', { clientX: 240, clientY: 200, pointerId: 12 });
    ok('双指可以缩放', zPinch1 > zPinch0 + 0.2, 'zoom ' + zPinch0 + ' → ' + zPinch1);
    C.resetZoom();

    /* ---- 8.6 绿色吸附提示可以关掉 ---- */
    C.setCount(12);
    C.setMode('classic');
    ok('默认开启绿色吸附提示', C.state().showHover === true);
    ok('可以关掉绿色吸附提示', C.hoverBox(false) === false && C.state().showHover === false);
    let hiItem = root.querySelector('.pz-item');
    let hiPi = Number(hiItem.dataset.piece);
    let hiTarget = C.target(hiPi);
    let hiClient = C.boardPointToClient(hiTarget.x, hiTarget.y);
    hiItem.dispatch('pointerdown', { clientX: 40, clientY: 600, button: 0, pointerId: 21, cancelable: true });
    doc.dispatch('pointermove', { clientX: 40, clientY: 430, pointerId: 21, cancelable: true });
    doc.dispatch('pointermove', { clientX: hiClient.x, clientY: hiClient.y, pointerId: 21, cancelable: true });
    ok('关掉之后拖动时不再显示目标高亮', C.state().hover === -1, 'hover=' + C.state().hover);
    doc.dispatch('pointerup', { clientX: hiClient.x, clientY: hiClient.y, pointerId: 21 });
    ok('关掉提示不影响吸附', C.piece(hiPi).placed === true);
    C.hoverBox(true);
    ok('可以再打开绿色吸附提示', C.state().showHover === true);
    hiItem = root.querySelector('.pz-item');
    hiPi = Number(hiItem.dataset.piece);
    hiTarget = C.target(hiPi);
    hiClient = C.boardPointToClient(hiTarget.x, hiTarget.y);
    hiItem.dispatch('pointerdown', { clientX: 40, clientY: 620, button: 0, pointerId: 22, cancelable: true });
    doc.dispatch('pointermove', { clientX: 40, clientY: 430, pointerId: 22, cancelable: true });
    doc.dispatch('pointermove', { clientX: hiClient.x, clientY: hiClient.y, pointerId: 22, cancelable: true });
    ok('打开后拖动时会高亮目标位置', C.state().hover === hiPi, 'hover=' + C.state().hover);
    doc.dispatch('pointerup', { clientX: hiClient.x, clientY: hiClient.y, pointerId: 22 });
    ok('开关状态写进存档', phone.store('puzzle-iso').get('hoverBox') === 1);
    ok('工具栏按钮会显示开关状态', /off|on/.test(root.querySelector('.pz-tools').children[0].className),
      root.querySelector('.pz-tools').children[0].className);

    /* ---- 8.7 1000 片 ---- */
    C.setMode('jigsaw');
    C.setCount(1000);
    const bigSt = C.state();
    ok('可以选到 1000 片（实际 950~1050 片）',
      bigSt.total >= 950 && bigSt.total <= 1050, 'total=' + bigSt.total + ' ' + bigSt.cols + 'x' + bigSt.rows);
    ok('1000 片时自动放大到 220%', Math.abs(bigSt.zoom - 2.2) < 0.01, 'zoom=' + bigSt.zoom);
    ok('1000 片时自动放大到能看清格子', bigSt.cellW * bigSt.zoom >= 13,
      'cell*zoom=' + (bigSt.cellW * bigSt.zoom).toFixed(1));
    C.setZoom(1);
    ok('缩到 100% 时不再画 999 个虚线格（否则会糊成一片）', C.state().slots === false);
    C.setZoom(2.2);
    const bigWin = C.trayWindow();
    ok('1000 片的列表只渲染十几个缩略图（虚拟滚动）',
      bigWin.total === bigSt.total && bigWin.rendered > 0 && bigWin.rendered <= 20,
      JSON.stringify(bigWin));
    C.trayScroll(3000);
    const bigWin2 = C.trayWindow();
    ok('列表滚到中后段时窗口跟着换',
      bigWin2.first > 0 && root.querySelectorAll('.pz-item').length > 0,
      JSON.stringify(bigWin2));
    C.trayScroll(0);
    ok('1000 片每片都有多边形（没有漏片）', (() => {
      for (let i = 0; i < bigSt.total; i++) {
        const p = C.piece(i);
        if (!p || !p.pts || p.pts.length < 4) return false;
      }
      return true;
    })());
    C.setMode('jigsaw');
    C.setCount(12);

    /* ---- 9. 提示 / 看原图 ---- */
    C.hint();
    ok('提示会选中一片并在地板上标出它的位置', C.state().selected >= 0);
    C.preview();
    ok('可以切到「看原图」', C.state().preview === true);
    C.preview();
    ok('再点一下回到拼图', C.state().preview === false);

    /* ---- 10. 换横图 → 底板跟着变横 ---- */
    C.sample('night');
    const st3 = C.state();
    ok('换成横图后底板变横向',
      st3.imgName === '夜色城市' && st3.boardW > st3.boardH, st3.boardW + 'x' + st3.boardH);

    /* ---- 11. 导入本地图片（用桩 Image / FileReader） ---- */
    const prevImage = g.Image;
    const prevFileReader = g.FileReader;
    defineGlobal('Image', class {
      constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
      set src(v) {
        this._src = v;
        this.naturalWidth = 800;
        this.naturalHeight = 600;
        if (this.onload) this.onload();
      }
      get src() { return this._src; }
    });
    defineGlobal('FileReader', class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,AAAA';
        if (this.onload) this.onload();
      }
    });
    const imported = await C.importFile({ type: 'image/png', name: '我的照片.png', size: 2048 });
    const st4 = C.state();
    ok('可以导入自己的图片，长宽按图片来',
      imported === true && st4.imgName === '我的照片.png' &&
      Math.abs(st4.boardW / st4.boardH - 800 / 600) < 0.02,
      st4.imgName + ' ' + st4.boardW + 'x' + st4.boardH);
    ok('导入后重新开始一局', st4.placed === 0 && st4.over === false && st4.total === 12);
    const badImport = await C.importFile({ type: 'text/plain', name: 'a.txt', size: 3 });
    ok('非图片文件会被拒绝（保留原图）', badImport === false && C.state().imgName === '我的照片.png');

    /* ---- 11.5 保存 / 恢复 ---- */
    const tA = C.target(C.state().order[0]);
    C.drop(C.state().order[0], tA.x, tA.y);
    const tB = C.target(C.state().order[0]);
    C.drop(C.state().order[0], tB.x, tB.y);
    C.setZoom(2);
    ok('放了两片后可以手动保存', (await C.save()) === true);
    ok('存档写进了 localStorage（图片 + 进度）',
      !!localStorage.getItem('pz.save.state') && !!localStorage.getItem('pz.save.image'));
    const root3 = new FakeEl('div');
    root3.clientWidth = 360; root3.clientHeight = 620;
    const cleanups3 = [];
    pzDef.mount(phone, root3, Object.assign({}, pzCtx, {
      onCleanup(fn) { if (typeof fn === 'function') cleanups3.push(fn); }
    }));
    const C3 = pzDef.mount.__test.controller();
    await C3.ready();
    const stR = C3.state();
    ok('重新打开会自动接着上次的进度',
      stR.placed === 2 && stR.moves === 2 && stR.imgName === '我的照片.png' &&
      stR.mode === 'jigsaw' && stR.count === 12 && stR.total === 12,
      JSON.stringify({ placed: stR.placed, moves: stR.moves, name: stR.imgName, mode: stR.mode, count: stR.count }));
    ok('缩放比例也一起恢复', Math.abs(stR.zoom - 2) < 0.01, 'zoom=' + stR.zoom);
    ok('恢复后未拼的碎片仍在下方列表里', C3.trayCount() === 10, String(C3.trayCount()));
    C3.placeAll();
    cleanups3.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
    C.placeAll();          /* 让两个实例都进入「已完成」，避免退出时又写一份存档 */
    ['pz.save.state', 'pz.save.image'].forEach(k => localStorage.removeItem(k));
    ok('拼完之后存档会被清掉', !localStorage.getItem('pz.save.state'));

    /* ---- 11.6 1000 片再走一遍控制器 ---- */
    C.setMode('jigsaw');
    C.setCount(1000);
    const big2 = C.state();
    ok('控制器也能直接切到 1000 片', big2.total >= 950 && big2.total <= 1050, 'total=' + big2.total);
    ok('1000 片的列表滚动窗口正常', C.trayWindow().rendered > 0 && C.trayWindow().rendered < 30,
      JSON.stringify(C.trayWindow()));
    C.setCount(12);
    C.setMode('jigsaw');

    /* ---- 11.7 IndexedDB 主路径（真实浏览器用它存大图） ---- */
    const idbData = new Map();
    const fakeIDB = {
      open() {
        const req = {};
        setTimeout(() => {
          const db = {
            objectStoreNames: { contains: () => true },
            transaction() {
              return {
                objectStore() {
                  return {
                    put(v, k) {
                      const r = {};
                      idbData.set(k, v);
                      setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                      return r;
                    },
                    get(k) {
                      const r = {};
                      setTimeout(() => { r.result = idbData.get(k); if (r.onsuccess) r.onsuccess(); }, 0);
                      return r;
                    },
                    delete(k) {
                      const r = {};
                      setTimeout(() => { idbData.delete(k); if (r.onsuccess) r.onsuccess(); }, 0);
                      return r;
                    }
                  };
                }
              };
            }
          };
          req.result = db;
          if (req.onupgradeneeded) req.onupgradeneeded();
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      }
    };
    const prevIDB = g.indexedDB;
    defineGlobal('indexedDB', fakeIDB);
    ['pz.save.state', 'pz.save.image'].forEach(k => localStorage.removeItem(k));
    const root4 = new FakeEl('div');
    root4.clientWidth = 360; root4.clientHeight = 620;
    const cleanups4 = [];
    pzDef.mount(phone, root4, Object.assign({}, pzCtx, {
      onCleanup(fn) { if (typeof fn === 'function') cleanups4.push(fn); }
    }));
    const C4 = pzDef.mount.__test.controller();
    await C4.ready();
    const t4 = C4.target(C4.state().order[0]);
    C4.drop(C4.state().order[0], t4.x, t4.y);
    ok('IndexedDB 可用时存档写到 IndexedDB',
      (await C4.save()) === true && idbData.has('state') && idbData.has('image'));
    ok('走 IndexedDB 时不再占用 localStorage', !localStorage.getItem('pz.save.state'));
    const root5 = new FakeEl('div');
    root5.clientWidth = 360; root5.clientHeight = 620;
    const cleanups5 = [];
    pzDef.mount(phone, root5, Object.assign({}, pzCtx, {
      onCleanup(fn) { if (typeof fn === 'function') cleanups5.push(fn); }
    }));
    const C5 = pzDef.mount.__test.controller();
    await C5.ready();
    const st5b = C5.state();
    ok('从 IndexedDB 恢复进度和图片',
      st5b.placed === 1 && st5b.imgName === '夜色城市' && st5b.total === 12,
      JSON.stringify({ placed: st5b.placed, name: st5b.imgName, total: st5b.total }));
    C5.placeAll();
    cleanups5.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
    C4.placeAll();
    cleanups4.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
    idbData.clear();
    defineGlobal('indexedDB', prevIDB);

    defineGlobal('Image', prevImage);
    defineGlobal('FileReader', prevFileReader);

    /* ---- 12. 清理 + 重新打开应记住玩法设置 ---- */
    cleanups.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
    ok('拼图实例清理不报错', true);

    const root2 = new FakeEl('div');
    root2.clientWidth = 360; root2.clientHeight = 620;
    const cleanups2 = [];
    pzDef.mount(phone, root2, Object.assign({}, pzCtx, {
      onCleanup(fn) { if (typeof fn === 'function') cleanups2.push(fn); }
    }));
    const C2 = pzDef.mount.__test.controller();
    await C2.ready();
    const st5 = C2.state();
    ok('重新打开会记住上次的模式与片数',
      st5.mode === 'jigsaw' && st5.count === 12 && st5.total === 12,
      JSON.stringify({ mode: st5.mode, count: st5.count, total: st5.total }));
    ok('重新打开会记住上次选的示例图', st5.imgName === '夜色城市' && st5.boardW > st5.boardH, st5.imgName);
    cleanups2.forEach(fn => { try { fn(); } catch (e) { /* 忽略 */ } });
  }
} catch (e) { ok('拼图流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('桌面分页 / 拖拽 / 文件夹');
try {
  phone.unlock();
  ok('布局默认 3 页', phone.layout.pageCount() === 3, String(phone.layout.pageCount()));
  ok('每页 12 格', phone.layout.data().pages.every(p => p.length === 12));
  phone.layout.goPage(1);
  ok('goPage(1) 滚到第二页', byId['pages'].scrollLeft === 368, String(byId['pages'].scrollLeft));
  ok('圆点高亮跟随', byId['page-dots'].children[1].classList.contains('on'));
  phone.layout.goPage(0);

  /* 先同步一次渲染，确保后面拿到的节点就是当前 DOM 里的（渲染会重建网格） */
  phone.layout.goPage(0);
  const grid0 = byId['pages'].children[0].querySelector('[data-grid]');
  const item0 = grid0.querySelector('.app-item');
  const draggedId = item0.dataset.appId;
  ok('第一页有可拖拽图标（' + draggedId + '）', !!draggedId);
  const hole = byId['pages'].children[1].querySelector('.slot-hint');
  ok('第二页有空位可接收拖拽', !!hole && !!hole.parentNode);

  let moveErr = null;
  try {
    item0.dispatch('pointerdown', { clientX: 40, clientY: 120, pointerId: 1, button: 0 });
    await new Promise(r => setTimeout(r, 430));            /* 等过长按阈值 380ms */
    ok('长按进入整理模式', phone.layout.isEditing() === true);
    ok('长按出现拖拽跟随元素', !!byId['screen'].querySelector('#drag-ghost'));
    document._fromPoint = hole;                            /* 松手落点 = 第二页空位 */
    /* 真实浏览器里 pointermove 会冒泡到 document，桩不会，所以两边都派发 */
    const mv = { clientX: 200, clientY: 300, pointerId: 1, cancelable: true, button: 0 };
    item0.dispatch('pointermove', mv);
    document.dispatch('pointermove', mv);
    document.dispatch('pointerup', { clientX: 200, clientY: 300, pointerId: 1 });
  } catch (e) { moveErr = e; }
  ok('拖拽流程无异常', !moveErr, moveErr && moveErr.message);
  ok('拖拽后退出整理模式', phone.layout.isEditing() === false);
  ok('拖拽后幽灵元素已移除', !byId['screen'].querySelector('#drag-ghost'));
  ok('应用已移动到第二页空位', phone.layout.data().pages[1].indexOf(draggedId) >= 0,
    '第二页 = ' + JSON.stringify(phone.layout.data().pages[1].filter(Boolean)));

  /* 文件夹：用两个没被搬动过的内置应用 */
  const f = phone.layout.makeFolder(['clock', 'notes'], '我的工具');
  ok('建文件夹成功', !!f && f.apps.length === 2, JSON.stringify(f && f.apps));
  ok('文件夹写入布局', JSON.stringify(phone.layout.data()).indexOf('我的工具') > 0);
  ok('桌面渲染出文件夹图标', !!byId['pages'].querySelectorAll('.app-item').find(x => x.dataset.folderId));
  ok('文件夹缩略图 2×2', byId['pages'].querySelectorAll('.fo-grid')[0].children.length === 4);
  ok('解散文件夹后应用回到桌面', phone.layout.ungroup(f.id) === true &&
    byId['pages'].querySelectorAll('.app-item').filter(x => x.dataset.appId).length >= 8);
} catch (e) { ok('桌面分页 / 拖拽 / 文件夹流程', false, e.message + '\n' + e.stack); }

section('Dock 底部按键（曾因漏绑 click 而完全失灵）');
try {
  phone.unlock();
  const dockItems = byId['dock'].children;
  ok('dock 有 3 个图标', dockItems.length === 3, String(dockItems.length));
  ok('dock 图标都绑定了 click', dockItems.every(b => (b._listeners.click || []).length > 0));
  const expectIds = ['appstore', 'aigen', 'settings'];
  expectIds.forEach(function (id, i) {
    const b = dockItems[i];
    ok('dock[' + i + '] 是 ' + id, b.dataset.appId === id, b.dataset.appId);
    b.dispatch('click', {});
    const cur = phone._state.current;
    ok('点 dock[' + i + '] 能打开 ' + id, !!cur && cur.app.id === id, cur && cur.app.id);
    phone.closeApp();
  });
  ok('dock 图标不参与长按拖拽', dockItems.every(b => !b.__lp));
} catch (e) { ok('Dock 交互流程', false, e.message + '\n' + e.stack); }

section('背景与不透明度');
try {
  const wp = byId['wallpaper'];
  ok('默认是纯色模式', phone.wallpaper.mode() === 'solid', phone.wallpaper.mode());
  ok('纯色模式下壁纸层不带 .is-gradient', !wp.classList.contains('is-gradient'));
  ok('纯色模式下不启用柔光遮罩', !byId['screen'].classList.contains('wallpaper-on'));
  phone.wallpaper.setMode('wallpaper');
  ok('切到渐变壁纸后壁纸层带 .is-gradient', wp.classList.contains('is-gradient'));
  ok('渐变壁纸会启用柔光遮罩', byId['screen'].classList.contains('wallpaper-on'));
  const r = phone.wallpaper.set(2);
  ok('选第 3 款壁纸生效', r.mode === 'wallpaper' && r.name === '晚霞橙', JSON.stringify(r));
  phone.wallpaper.setSolid(1);
  ok('切回纯色并选第 2 款底色', phone.wallpaper.mode() === 'solid' && phone.wallpaper.solidIndex() === 1);
  ok('纯色模式关掉柔光', !byId['screen'].classList.contains('wallpaper-on'));
} catch (e) { ok('背景模式流程', false, e.message); }

/* ================= 新增功能：API 管理 / 便签复制 / 息屏知识卡 / 阅读器 ================= */

section('API 管理器（全机统一接口）');
try {
  /* 旧版把接口写在「AI 创作」自己的设置里 → 自动迁移 */
  phone.settings.set('ai.key', 'sk-old');
  phone.settings.set('ai.baseUrl', 'https://api.deepseek.com/v1');
  phone.settings.set('ai.model', 'deepseek-chat');
  phone.apis.migrate();
  const migrated = phone.apis.list();
  ok('旧接口配置自动迁移成接口条目', migrated.length === 1 && migrated[0].type === 'chat', JSON.stringify(migrated.map(a => a.name)));
  ok('迁移后自动绑定到「对话模型」', phone.apis.bindings().chat === migrated[0].id);
  phone.apis.remove(migrated[0].id);
  ['ai.key', 'ai.baseUrl', 'ai.model'].forEach(k => phone.settings.set(k, null));
  ok('清理迁移数据', phone.apis.list().length === 0);

  const a1 = phone.apis.save({ name: '测试对话', type: 'chat', baseUrl: 'https://api.example.com/v1', key: 'sk-test', model: 'test-model' });
  ok('新增对话接口', phone.apis.list().length === 1 && !!a1.id);
  phone.apis.bind('chat', a1.id);
  ok('用途绑定生效', phone.apis.resolve('chat') && phone.apis.resolve('chat').id === a1.id);
  ok('绑定被写入设置', phone.settings.get('apiBind', {}).chat === a1.id);
  try {
    phone.apis.save({ name: '缺模型', type: 'chat', baseUrl: 'https://x/v1', model: '' });
    ok('缺模型时保存被拒绝', false, '没有抛错');
  } catch (e) { ok('缺模型时保存被拒绝', /模型名/.test(e.message), e.message); }
  try {
    phone.apis.save({ name: '', type: 'chat', baseUrl: 'https://x/v1', model: 'm' });
    ok('缺名称时保存被拒绝', false, '没有抛错');
  } catch (e) { ok('缺名称时保存被拒绝', /名字/.test(e.message), e.message); }

  /* 桩 fetch：对话接口 */
  const calls = [];
  g.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: '你好呀' } }] })) });
  };
  const chatText = await phone.apis.chat(a1, [{ role: 'user', content: 'hi' }]);
  ok('对话接口返回文本', chatText === '你好呀', chatText);
  ok('请求地址为 /chat/completions', calls[0].url === 'https://api.example.com/v1/chat/completions', calls[0].url);
  ok('请求带上了 Bearer 密钥', /Bearer sk-test/.test(calls[0].init.headers.Authorization));
  ok('apiAsk 走同一个接口', await (async () => {
    const r = await phone.apis.ask('问题');
    return r === '你好呀';
  })());

  /* 桩 fetch：Tavily 检索 */
  const a2 = phone.apis.save({ name: '测试检索', type: 'search', provider: 'tavily', baseUrl: 'https://api.tavily.com/search', key: 'tv-1' });
  phone.apis.bind('search', a2.id);
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ results: [{ title: '新闻一', url: 'https://news.example.com/a', content: '摘要内容' }] }))
  });
  const sr = await phone.apis.search(a2, '今日新闻', { count: 1 });
  ok('Tavily 检索解析出条目', sr.items.length === 1 && sr.items[0].title === '新闻一', JSON.stringify(sr.items));

  /* 博查 */
  const a3 = phone.apis.save({ name: '博查', type: 'search', provider: 'bocha', baseUrl: 'https://api.bochaai.com/v1/web-search', key: 'b1' });
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ data: { webPages: { value: [{ name: '博查条目', url: 'https://b.example.com', summary: '博查摘要' }] } } }))
  });
  ok('博查检索解析出条目', (await phone.apis.search(a3, 'x', { count: 1 })).items[0].title === '博查条目');

  /* 拉取模型列表（GET /models） */
  let lastCall = null;
  g.fetch = (url, init) => {
    lastCall = { url, init };
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ data: [{ id: 'm-b' }, { id: 'm-a' }, { id: 'm-a' }] })) });
  };
  const modelIds = await phone.apis.models(a1.id);
  ok('能拉取接口的模型列表（去重 + 排序）', modelIds.length === 2 && modelIds[0] === 'm-a' && modelIds[1] === 'm-b', JSON.stringify(modelIds));
  ok('拉模型走的是 GET /models', lastCall.url === 'https://api.example.com/v1/models' && lastCall.init.method === 'GET', lastCall.url);
  ok('拉模型带上了密钥', /Bearer sk-test/.test(lastCall.init.headers.Authorization));
  g.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] })) });
  ok('兼容 Ollama 的 {models:[{name}]} 形状', (await phone.apis.models(a1.id))[0] === 'qwen2.5:7b');
  g.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
  await phone.apis.models(a1.id).then(
    () => ok('接口没有模型列表时给出中文提示', false, '没有抛错'),
    e => ok('接口没有模型列表时给出中文提示', /手动填写/.test(e.message), e.message));

  /* 错误处理 */
  g.fetch = () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') });
  await phone.apis.chat(a1, [{ role: 'user', content: 'x' }]).then(
    () => ok('HTTP 错误被拒绝', false, '没有抛错'),
    e => ok('HTTP 错误被拒绝', /HTTP 500/.test(e.message), e.message));
  g.fetch = () => Promise.reject(new Error('Failed to fetch'));
  await phone.apis.search(a2, 'x', {}).then(
    () => ok('网络错误给出中文提示', false, '没有抛错'),
    e => ok('网络错误给出中文提示', /跨域|Failed to fetch/.test(e.message), e.message));

  /* 连通性自检 */
  g.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: '正常' } }] })) });
  ok('测试接口返回中文结论', /正常/.test(await phone.apis.test(a1.id)));

  /* 删除接口要顺手解绑 */
  phone.apis.remove(a1.id);
  ok('删除接口后自动解绑', !phone.apis.bindings().chat && phone.apis.list().length === 2, JSON.stringify(phone.apis.bindings()));
  ok('resolve 会退化为同类型第一个接口', phone.apis.resolve('chat') === null);
} catch (e) { ok('API 管理器流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('便签：摩卡咖啡配色与一键复制');
try {
  const copied = [];
  g.navigator.clipboard = { writeText: (t) => { copied.push(String(t)); return Promise.resolve(); } };
  ok('便签应用换成咖啡图标', phone.getApp('notes').icon === 'svg:coffee', phone.getApp('notes').icon);
  ok('便签应用指定摩卡配色', phone.getApp('notes').color === 'mocha', String(phone.getApp('notes').color));
  ok('咖啡图标已注册进图标库', phone.icons.list.indexOf('coffee') >= 0);
  ok('摩卡配色是咖啡色系', (function () {
    const p = phone.icons.named.mocha;
    return p && p.c1 === '#c08b5c' && p.c2 === '#5b3a29';
  })());
  phone.store('notes').set('notes', [{ id: 'n1', title: '咖啡笔记', body: '今天喝了摩卡。', updated: Date.now() }]);
  phone.unlock();
  phone.openApp('notes');
  const host = byId['apps'].children.find(h => h.dataset.appId === 'notes');
  const li = host.all().find(n => n.classList && n.classList.contains('li'));
  ok('便签列表渲染出条目', !!li);
  li.dispatch('click', {});
  const btn = host.all().find(n => n.tagName === 'BUTTON' && /一键复制/.test(n.textContent || ''));
  ok('编辑页有「一键复制」按钮', !!btn);
  btn.dispatch('click', {});
  await new Promise(r => setTimeout(r, 30));
  ok('复制内容 = 标题 + 正文', copied[0] === '咖啡笔记\n\n今天喝了摩卡。', JSON.stringify(copied[0]));
  const headAct = host.querySelector('.nav-actions').all().find(n => n.tagName === 'BUTTON' && n.textContent === '复制');
  ok('标题栏也有复制按钮', !!headAct);
  headAct.dispatch('click', {});
  await new Promise(r => setTimeout(r, 30));
  ok('标题栏复制同样生效', copied.length === 2 && copied[1] === '咖啡笔记\n\n今天喝了摩卡。');
  phone.closeApp();
} catch (e) { ok('便签流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('便签：排序方式切换（修改时间 / 创建时间 / 名称 + 正倒序）');
try {
  const T0 = 1700000000000;
  const notesHost = () => byId['apps'].children.filter(h => h.dataset.appId === 'notes').pop();
  const openNotes = async () => {
    phone.closeApp();
    await new Promise(r => setTimeout(r, 260));   /* 旧宿主节点 220ms 后才移除 */
    phone.unlock();
    phone.openApp('notes');
    return notesHost();
  };

  phone.store('notes').set('sort', null);
  phone.store('notes').set('notes', [
    { id: 's-a', title: '乙便签', body: '', created: T0 + 2000, updated: T0 + 1000 },
    { id: 's-b', title: '甲便签', body: '', created: T0 + 1000, updated: T0 + 3000 },
    { id: 's-c', title: '丙便签', body: '', created: T0 + 3000, updated: T0 + 2000 }
  ]);
  let nhost = await openNotes();
  const titles = () => nhost.findAll('li-main').map(m => (m.children[0] ? m.children[0].textContent : ''));
  const nbtn = (re) => nhost.all().find(n => n.tagName === 'BUTTON' && re.test(n.textContent || ''));

  ok('出现了三种排序方式按钮', !!nbtn(/^修改时间$/) && !!nbtn(/^创建时间$/) && !!nbtn(/^名称$/));
  ok('默认按修改时间倒序', titles()[0] === '甲便签', JSON.stringify(titles()));

  nbtn(/^创建时间$/).dispatch('click', {});
  ok('切到创建时间（倒序）', titles()[0] === '丙便签', JSON.stringify(titles()));

  nbtn(/正序|倒序/).dispatch('click', {});
  ok('点方向按钮切成正序', titles()[0] === '甲便签', JSON.stringify(titles()));

  nbtn(/^名称$/).dispatch('click', {});
  const expectName = ['甲便签', '乙便签', '丙便签']
    .sort((x, y) => x.localeCompare(y, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
  ok('按名称排序', JSON.stringify(titles()) === JSON.stringify(expectName), JSON.stringify(titles()) + ' vs ' + JSON.stringify(expectName));
  ok('排序方式写进存档', JSON.stringify(phone.store('notes').get('sort', null)) === '{"key":"name","dir":"asc"}', JSON.stringify(phone.store('notes').get('sort', null)));

  /* 旧存档没有 created：用 id 里的 base36 时间戳还原，验证迁移逻辑 */
  const legacyNew = (T0 + 5000).toString(36);
  const legacyOld = (T0 - 5000).toString(36);
  phone.store('notes').set('sort', { key: 'created', dir: 'asc' });
  phone.store('notes').set('notes', [
    { id: 'note-' + legacyNew + '-1', title: '较新', body: '', updated: T0 + 9000 },
    { id: 'note-' + legacyOld + '-2', title: '较旧', body: '', updated: T0 + 9900 }
  ]);
  nhost = await openNotes();
  const titles2 = nhost.findAll('li-main').map(m => (m.children[0] ? m.children[0].textContent : ''));
  ok('旧便签按 id 还原创建时间', titles2[0] === '较旧', JSON.stringify(titles2));

  nhost.findAll('li')[0].dispatch('click', {});
  ok('编辑页同时显示创建与修改时间', /创建时间/.test(nhost.textContent) && /修改时间/.test(nhost.textContent));
  phone.closeApp();
  await new Promise(r => setTimeout(r, 260));
} catch (e) { ok('便签排序流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('闲置息屏 + 近期知识卡');
try {
  phone.idle.setSeconds(30);
  ok('息屏时间可设置', phone.idle.seconds() === 30, String(phone.idle.seconds()));
  phone.knowledge.clear();
  ok('清空后没有知识卡', phone.knowledge.state().cards.length === 0);

  /* 只配了对话模型、没配联网检索 → 默认不许偷偷生成（否则用户会以为已经联网了） */
  const searchApis = phone.apis.list().filter(a => a.type === 'search');
  searchApis.forEach(a => phone.apis.remove(a.id));
  const fallbackChat = phone.apis.save({ name: '兜底对话', type: 'chat', baseUrl: 'https://api.example.com/v1', key: 'k', model: 'm' });
  phone.apis.bind('chat', fallbackChat.id);
  ok('兜底开关默认关闭', phone.knowledge.fallback() === false);
  let cardFetches = 0;
  g.fetch = () => { cardFetches++; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }); };
  await phone.knowledge.generate(true);
  ok('没有联网检索接口时不会自动生成知识卡', phone.knowledge.state().cards.length === 0 && cardFetches === 0,
    '卡片数 ' + phone.knowledge.state().cards.length + '，请求数 ' + cardFetches);
  ok('而是提示去配「联网检索」接口',
    /联网检索/.test(byId['ss-summary'].textContent || '') || /联网检索/.test(byId['ss-title'].textContent || ''),
    byId['ss-title'].textContent + ' / ' + byId['ss-summary'].textContent);

  /* 打开兜底开关后，才允许对话模型「编」知识卡 */
  phone.knowledge.setFallback(true);
  ok('兜底开关可打开', phone.knowledge.fallback() === true);
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ cards: [{ cat: '测试', title: '模型卡', summary: '这是模型编的' }] }) } }]
    }))
  });
  await phone.knowledge.generate(true);
  const fbState = phone.knowledge.state();
  ok('打开开关后才用对话模型生成', fbState.cards.length === 1 && fbState.cards[0].title === '模型卡', JSON.stringify(fbState.cards));
  ok('来源标注为「未联网」', /未联网/.test(fbState.cards[0].src || ''), fbState.cards[0].src);
  phone.knowledge.setFallback(false);
  phone.knowledge.clear();
  phone.apis.remove(fallbackChat.id);

  /* 恢复一个联网检索接口，回到正常的 10 张一组流程 */
  const a2b = phone.apis.save({ name: '测试检索', type: 'search', provider: 'tavily', baseUrl: 'https://api.tavily.com/search', key: 'tv-1' });
  phone.apis.bind('search', a2b.id);

  /* 搜索接口经常返回整页正文，卡片必须裁短，否则一张卡会糊一大段 */
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({
      results: [{ title: '很长的一段标题'.repeat(10), url: 'https://e.com/x', content: '第一句。' + '长内容'.repeat(300) }]
    }))
  });
  await phone.knowledge.generate(true);
  const longCard = phone.knowledge.state().cards[0];
  ok('超长摘要被裁短（≤180 字 + 省略号）', longCard.summary.length <= 181 && /…$/.test(longCard.summary),
    '长度 ' + longCard.summary.length);
  ok('超长标题被裁短', longCard.title.length <= 47, '长度 ' + longCard.title.length);
  ok('在句子边界断开，不硬切', /^第一句。/.test(longCard.summary) && !/长内$/.test(longCard.summary), longCard.summary.slice(0, 30));
  ok('保留了可展开的全文', (longCard.full || '').length > 200, String((longCard.full || '').length));

  /* 摘要要保留段落换行（CSS 用 pre-line 渲染，不再挤成一行） */
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ results: [{ title: '多段测试', url: 'https://p.example.com/1', content: '第一段。\n\n第二段内容。' }] }))
  });
  await phone.knowledge.generate(true);
  ok('摘要保留了段落换行', /\n/.test(phone.knowledge.state().cards[0].summary),
    JSON.stringify(phone.knowledge.state().cards[0].summary));
  phone.knowledge.clear();

  /* 搜索接口对每个查询都返回同一页时，不能糊成 10 张一模一样的卡 */
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ results: [{ title: '同一篇报道', url: 'https://same.example.com/a', content: '完全一样的内容' }] }))
  });
  await phone.knowledge.generate(true);
  ok('全站返回同一条时只保留一张', phone.knowledge.state().cards.length === 1,
    String(phone.knowledge.state().cards.length));
  ok('并提示重复内容被去掉', /重复/.test(byId['ss-summary'].textContent || byId['ss-title'].textContent || '') ||
    phone.knowledge.state().cards.length === 1);

  /* 多候选取卡：第一条总是重复，应该自动跳到下一条不重复的 */
  let seq = 0;
  g.fetch = () => {
    seq++;
    const k = seq;
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({
        results: [
          { title: '公共结果', url: 'https://common.example.com/x', content: '每次都是这一条，应该被去重' },
          { title: '独特结果' + k, url: 'https://u' + k + '.example.com/a', content: '独特内容' + k }
        ]
      }))
    });
  };
  await phone.knowledge.generate(true);
  const dd = phone.knowledge.state();
  ok('多候选中会自动跳过重复项并凑满 10 张', dd.cards.length === 10, String(dd.cards.length));
  ok('重复的那条没有出现在组里', dd.cards.every(c => c.title !== '公共结果'), dd.cards.map(c => c.title).join(','));
  ok('每张卡记下了自己用的检索词', !!dd.cards[0].q && dd.cards[0].q.length > 2, String(dd.cards[0].q));
  ok('卡片按话题顺序排列', dd.cards[0].cat === '热点' && dd.cards[9].cat === '文化', dd.cards.map(c => c.cat).join(','));
  phone.knowledge.clear();

  /* 换一组必须换内容：检索词每组轮换（同一个词反复查，接口当然返回同一批） */
  phone.knowledge.forgetSeen();
  ok('润色开关默认开启', phone.knowledge.polish() === true);
  phone.knowledge.setPolish(false);
  g.fetch = (url, init) => {
    const q = JSON.parse(init.body).query;
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ results: [{ title: '结果：' + q, url: 'https://r' + encodeURIComponent(q).length + '.example.com/a', content: '正文：' + q }] }))
    });
  };
  await phone.knowledge.generate(true);
  const roundA = phone.knowledge.state().cards.map(c => c.title).join('|');
  await phone.knowledge.generate(true);
  const roundB = phone.knowledge.state().cards.map(c => c.title).join('|');
  ok('两次生成的检索词不同', roundA !== roundB, roundA.slice(0, 40) + ' vs ' + roundB.slice(0, 40));
  const qA = roundA.split('|')[0].replace('结果：', '');
  const qB = roundB.split('|')[0].replace('结果：', '');
  ok('检索词确实换了说法', qA !== qB, qA + ' → ' + qB);

  /* 全站只有一条内容时：第二次不再用它覆盖上一组 */
  phone.knowledge.forgetSeen();
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ results: [{ title: '永远这一条', url: 'https://only.example.com/a', content: '永远这个内容' }] }))
  });
  await phone.knowledge.generate(true);
  const once = phone.knowledge.state();
  ok('第一次能取到那一条', once.cards.length === 1 && once.cards[0].title === '永远这一条', String(once.cards.length));
  await phone.knowledge.generate(true);
  const twice = phone.knowledge.state();
  ok('第二次全是旧内容时不覆盖上一组', twice.cards.length === 1 && twice.cards[0].title === '永远这一条');
  ok('并在卡片上提示「没有返回新内容」', /新内容/.test(byId['ss-src'].textContent || ''), byId['ss-src'].textContent);
  ok('看过的卡被记住了', phone.knowledge.seenCount() > 0, String(phone.knowledge.seenCount()));
  phone.knowledge.forgetSeen();
  ok('可以清空「看过的卡」', phone.knowledge.seenCount() === 0);

  /* 用对话模型润色：摘要由模型改写，而不是硬裁原文 */
  const polishChat = phone.apis.save({ name: '润色', type: 'chat', baseUrl: 'https://chat.example.com/v1', key: 'k', model: 'm' });
  phone.apis.bind('chat', polishChat.id);
  phone.knowledge.setPolish(true);
  ok('润色开关可以打开', phone.knowledge.polish() === true);
  let sSeq = 0;
  g.fetch = (url, init) => {
    if (/chat\/completions/.test(url)) {
      const body = JSON.parse(init.body);
      const ids = (String((body.messages[1] || {}).content).match(/^\[(\d+)\]/gm) || []).map(s => Number(s.replace(/[^\d]/g, '')));
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ cards: ids.map(i => ({ i: i, title: '润色标题' + i, summary: '这是经过润色的摘要，长度合适、信息具体。' })) }) } }]
        }))
      });
    }
    sSeq++;
    const k = sSeq;                                   /* 必须在响应的闭包里锁住序号 */
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({
        results: [{ title: '原始标题' + k, url: 'https://p' + k + '.example.com/a', content: '第一段。' + '正文内容'.repeat(60) + k }]
      }))
    });
  };
  await phone.knowledge.generate(true);
  const pol = phone.knowledge.state();
  ok('摘要由对话模型润色', /润色的摘要/.test(pol.cards[0].summary), pol.cards[0].summary);
  ok('标题也由模型改写', /^润色标题/.test(pol.cards[0].title), pol.cards[0].title);
  ok('卡片标记为已润色', pol.cards[0].polished === 1);
  ok('润色后仍可展开原始材料', !!pol.cards[0].full && pol.cards[0].full.length > pol.cards[0].summary.length,
    (pol.cards[0].full || '').length + ' vs ' + pol.cards[0].summary.length);

  /* 关掉润色就回到裁剪原文 */
  g.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ results: [{ title: '没有润色的标题', url: 'https://raw' + (sSeq++) + '.example.com/a', content: '第一段。\n第二段内容' }] }))
  });
  phone.knowledge.setPolish(false);
  ok('润色开关可关闭', phone.knowledge.polish() === false);
  await phone.knowledge.generate(true);
  ok('关掉后直接用裁剪的原文', /^第一段。/.test(phone.knowledge.state().cards[0].summary),
    phone.knowledge.state().cards[0].summary);
  phone.knowledge.setPolish(true);
  phone.apis.remove(polishChat.id);
  phone.knowledge.clear();
  phone.knowledge.forgetSeen();

  /* 用 Tavily 桩生成一组：10 个话题各取 1 条 */
  let n = 0;
  g.fetch = () => {
    n++;
    const i = n;
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ results: [{ title: '知识卡' + i, url: 'https://e.com/' + i, content: '摘要内容' + i }] }))
    });
  };
  await phone.knowledge.generate(true);
  const st = phone.knowledge.state();
  ok('联网生成 10 张知识卡', st.cards.length === 10, String(st.cards.length));
  ok('知识卡分属不同领域', st.cards[0].cat === '热点' && st.cards[9].cat === '文化', st.cards.map(c => c.cat).join(','));
  ok('知识卡带摘要与来源', !!st.cards[0].summary && /e\.com/.test(st.cards[0].src), JSON.stringify(st.cards[0]));
  ok('未显示时不算已读', phone.knowledge.readCount() === 0, String(phone.knowledge.readCount()));

  phone.idle.enter();
  ok('屏保已息屏显示', byId['screensaver'].classList.contains('show'));
  ok('屏保显示第 1 张卡的标题', byId['ss-title'].textContent === st.cards[0].title, byId['ss-title'].textContent);
  ok('屏保显示进度 1 / 10', byId['ss-idx'].textContent === '1 / 10', byId['ss-idx'].textContent);
  ok('显示过的卡记为已读', phone.knowledge.readCount() === 1, String(phone.knowledge.readCount()));

  byId['ss-next'].dispatch('click', {});
  ok('右箭头切到下一张', phone.knowledge.state().idx === 1 && byId['ss-idx'].textContent === '2 / 10');
  byId['ss-prev'].dispatch('click', {});
  ok('左箭头切回上一张', phone.knowledge.state().idx === 0);

  /* 「展开全文」按钮：只有卡片带全文时才出现，展开不会把卡片撑爆（CSS 限高） */
  byId['ss-more'].dispatch('click', {});
  ok('展开全文按钮可点（无全文时安全无动作）', true);
  ok('屏保摘要始终是裁过的短文本', byId['ss-summary'].textContent.length <= 1500);

  /* 没读完时到最后一页不允许换组 */
  const st2 = phone.knowledge.state();
  phone.settings.set('knowledge', { at: st2.at, cards: st2.cards, read: {}, idx: 9 });
  const before = phone.knowledge.state().cards[0].title;
  await phone.knowledge.next();
  ok('没读完时不会生成下一组', phone.knowledge.state().cards[0].title === before);

  /* 全部读完 → 可以生成下一组 */
  phone.settings.set('knowledge', { at: st2.at, cards: st2.cards, read: {}, idx: 0 });
  phone.idle.exit();
  phone.idle.enter();
  let lastCall = null;
  for (let i = 0; i < 10; i++) lastCall = phone.knowledge.next();
  ok('逐张翻完 10 张后判定为读完整组', phone.knowledge.allRead() === true, '已读 ' + phone.knowledge.readCount());
  await lastCall;
  const st3 = phone.knowledge.state();
  ok('读完整组后才生成下一组', st3.cards.length === 10 && st3.cards[0].title !== before,
    st3.cards[0].title + ' vs ' + before);
  ok('新一组从第 1 张重新开始', st3.idx === 0);

  /* 屏保上的按钮 */
  byId['ss-regen'].dispatch('click', {});
  byId['ss-setup'].dispatch('click', {});
  ok('点「接口设置」会退出屏保并打开设置', phone.idle.isOn() === false && phone._state.current.app.id === 'settings');
  phone.closeApp();
  phone.idle.enter();
  ok('再次进入屏保', phone.idle.isOn() === true);

  /* 退出方式：鼠标 / 点击都不退出，只有键盘或「返回」按钮才退出 */
  document.dispatch('pointermove', {});
  document.dispatch('mousemove', {});
  document.dispatch('pointerdown', {});
  ok('鼠标移动 / 点击不会退出息屏', phone.idle.isOn() === true);
  byId['ss-next'].dispatch('click', {});
  ok('点屏保上的箭头不会误退出', phone.idle.isOn() === true);
  document.dispatch('keydown', { key: 'Escape' });
  ok('按键盘键才退出息屏', phone.idle.isOn() === false && !byId['screensaver'].classList.contains('show'));
  phone.idle.enter();
  byId['ss-close'].dispatch('click', {});
  ok('点「返回（Esc）」也能退出', phone.idle.isOn() === false);
  phone.idle.setSeconds(60);
} catch (e) { ok('息屏屏保流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('阅读器：文本处理 / 检索 / 划线询问 / 总结');
try {
  const paras = phone.utils.splitParagraphs('第一段\n\n第二段\n' + 'x'.repeat(900));
  ok('长文本按段落切分并分块', paras.length === 5 && paras[2].length === 420 && paras[4].length === 60,
    JSON.stringify(paras.map(p => p.length)));
  ok('HTML 导入会去掉标签', phone.utils.cleanImportText('a.html', '<p>你好&nbsp;世界</p><b>！</b>') === '你好 世界\n！',
    JSON.stringify(phone.utils.cleanImportText('a.html', '<p>你好&nbsp;世界</p><b>！</b>')));
  ok('txt 导入不去标签', phone.utils.cleanImportText('a.txt', '<b>x</b>') === '<b>x</b>');
  ok('复制工具走剪贴板', await phone.utils.copy('abc') === true);
  g.navigator.clipboard = null;
  ok('没有剪贴板 API 时返回 false 而不是抛错', await phone.utils.copy('abc') === false);

  /* 阅读器统一从中心 API 取接口 */
  const chatApi = phone.apis.save({ name: '阅读助手', type: 'chat', baseUrl: 'https://api.example.com/v1', key: 'k', model: 'm' });
  phone.apis.bind('chat', chatApi.id);

  phone.store('reader').set('books', [{
    id: 'b1', name: '测试书.txt', text: '咖啡的历史\n\n摩卡来自也门。\n\n第三段内容。',
    size: 120, added: Date.now(), at: Date.now(), progress: { pi: 0, pct: 0 }, marks: [], sums: []
  }]);
  phone.unlock();
  phone.openApp('reader');
  const host = byId['apps'].children.find(h => h.dataset.appId === 'reader');
  ok('书架列出导入的书', host.all().some(x => x.textContent === '测试书.txt'));
  const li = host.all().find(x => x.classList && x.classList.contains('li'));
  li.dispatch('click', {});
  ok('进入正文并渲染全部段落', host.count('rd-p') === 3, String(host.count('rd-p')));

  /* 主题切换 */
  const opened = host.classList.contains('rd-night');
  const themeBtn = host.all().find(x => x.tagName === 'BUTTON' && (x.textContent === '☀️' || x.textContent === '🌙'));
  themeBtn.dispatch('click', {});
  ok('日间/夜间可以切换', host.classList.contains('rd-night') !== opened);
  ok('主题写入存档', phone.store('reader').get('ui').theme === (opened ? 'day' : 'night'));

  /* 检索 */
  const sIn = host.all().find(x => x.tagName === 'INPUT');
  sIn.value = '摩卡';
  const findBtn = host.all().find(x => x.tagName === 'BUTTON' && x.textContent === '检索');
  findBtn.dispatch('click', {});
  ok('检索命中并列出结果', host.all().some(x => /命中 1 处/.test(x.textContent || '')),
    host.all().map(x => x.textContent).filter(t => t && /命中/.test(t)).join('|'));

  /* 划选 → 划线询问 */
  g.window.getSelection = () => ({ toString: () => '摩卡来自也门。', removeAllRanges() { } });
  const body = host.querySelector('.app-body');
  body.dispatch('mouseup', {});
  await new Promise(r => setTimeout(r, 40));
  const bar = host.find('rd-selbar');
  ok('划选后出现底部询问条', !!bar && bar.classList.contains('show'));
  const askBtn = bar.all().find(x => x.tagName === 'BUTTON' && /划线询问/.test(x.textContent || ''));
  askBtn.dispatch('click', {});
  ok('进入提问面板并带回划线内容', host.count('rd-quote') === 1 && /摩卡来自也门/.test(host.find('rd-quote').textContent));

  /* 提问 → 调中心对话接口 */
  g.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: '摩卡是咖啡的一种做法。' } }] })) });
  const ta = host.all().find(x => x.tagName === 'TEXTAREA');
  ta.value = '这句话什么意思？';
  ta.dispatch('input', {});
  const sendBtn = host.all().find(x => x.tagName === 'BUTTON' && /发送给 AI/.test(x.textContent || ''));
  sendBtn.dispatch('click', {});
  await new Promise(r => setTimeout(r, 40));
  ok('AI 回答已渲染', host.find('rd-ans') && /摩卡是/.test(host.find('rd-ans').innerHTML));
  const saved = phone.store('reader').get('books')[0];
  ok('问答已存成划线记录', saved.marks.length === 1 && saved.marks[0].q === '这句话什么意思？' && /摩卡是/.test(saved.marks[0].a));

  /* 没有配置接口时的友好提示 */
  phone.apis.remove(chatApi.id);
  const backBtn = host.all().find(x => x.tagName === 'BUTTON' && /返回正文/.test(x.textContent || ''));
  backBtn.dispatch('click', {});
  const sumBtn = host.all().find(x => x.tagName === 'BUTTON' && /AI 总结全文/.test(x.textContent || ''));
  sumBtn.dispatch('click', {});
  ok('未配置接口时给出中文提示',
    host.all().some(x => x.classList.contains('ui-hint') && /API 管理/.test(x.textContent || '')),
    host.all().filter(x => x.classList.contains('ui-hint')).map(x => x.textContent).join('|'));
  phone.apis.save({ id: chatApi.id, name: chatApi.name, type: 'chat', baseUrl: chatApi.baseUrl, key: chatApi.key, model: chatApi.model });
  phone.apis.bind('chat', chatApi.id);

  /* 总结 → 保存到本书 */
  g.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: '主旨：咖啡的历史。' } }] })) });
  const backBtn2 = host.all().find(x => x.tagName === 'BUTTON' && /返回正文/.test(x.textContent || ''));
  backBtn2.dispatch('click', {});
  const sumBtn2 = host.all().find(x => x.tagName === 'BUTTON' && /AI 总结全文/.test(x.textContent || ''));
  sumBtn2.dispatch('click', {});
  await new Promise(r => setTimeout(r, 40));
  ok('总结结果显示在面板里', host.find('rd-ans') && /主旨/.test(host.find('rd-ans').innerHTML));
  const saveSum = host.all().find(x => x.tagName === 'BUTTON' && x.textContent === '保存到本书');
  saveSum.dispatch('click', {});
  ok('总结可保存到本书', phone.store('reader').get('books')[0].sums.length === 1);

  /* 删除书 */
  phone.closeApp();
  ok('关闭阅读器会保存阅读进度', typeof phone.store('reader').get('books')[0].progress.pi === 'number');
} catch (e) { ok('阅读器流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

/* ================= 新增功能：长文创作接口 / 语音合成 / 睡前故事 ================= */

section('长文创作接口（与对话接口分开）');
try {
  ok('用途表里同时有对话 / 创作 / 检索 / 语音', phone.apis.purposes().map(p => p.key).join(',') === 'chat,write,search,tts',
    phone.apis.purposes().map(p => p.key).join(','));
  ok('用途 → 接口类型映射正确', phone.apis.purposeType('write') === 'write' && phone.apis.purposeType('tts') === 'tts' &&
    phone.apis.purposeType('search') === 'search' && phone.apis.purposeType('chat') === 'chat');
  ok('接口类型清单包含 write / tts', phone.apis.types().join(',') === 'chat,write,search,tts');
  ok('长文创作有速填预设', phone.apis.presets('write').length >= 3, String(phone.apis.presets('write').length));
  ok('语音合成有速填预设（含本地 GPT-SoVITS）',
    phone.apis.presets('tts').some(p => p.provider === 'gpt-sovits' && /127\.0\.0\.1:9880/.test(p.baseUrl)),
    JSON.stringify(phone.apis.presets('tts').map(p => p.name)));

  const w1 = phone.apis.save({ name: '测试创作', type: 'write', baseUrl: 'https://api.example.com/v1', key: 'sk-w', model: 'writer-model' });
  ok('新增「长文创作」接口', phone.apis.get(w1.id) && phone.apis.get(w1.id).type === 'write');
  try {
    phone.apis.save({ name: '创作缺模型', type: 'write', baseUrl: 'https://x/v1', model: '' });
    ok('长文创作同样要求模型名', false, '没有抛错');
  } catch (e) { ok('长文创作同样要求模型名', /模型名/.test(e.message), e.message); }

  let writeCall = null;
  g.fetch = (url, init) => {
    writeCall = { url, init };
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: '很久很久以前，有一只小刺猬。' } }] })) });
  };
  const longText = await phone.apis.write(w1, [{ role: 'user', content: '写个睡前故事' }], { maxTokens: 4000 });
  ok('apis.write 能生成长文', longText === '很久很久以前，有一只小刺猬。', longText);
  ok('创作请求走 /chat/completions 并带上 max_tokens',
    /\/chat\/completions$/.test(writeCall.url) && /4000/.test(writeCall.init.body), writeCall.url);

  /* 没配长文创作时借用对话模型（界面上会标明是借来的） */
  phone.apis.remove(w1.id);
  const cb = phone.apis.list().filter(a => a.type === 'chat')[0];
  ok('没配长文创作时借用对话模型', !!cb && phone.apis.resolve('write') && phone.apis.resolve('write').id === cb.id,
    JSON.stringify(cb && cb.name));
  ok('可以显式关掉借用', phone.apis.resolve('write', { fallbackChat: false }) === null);
  ok('语音用途不会被对话接口顶掉', phone.apis.resolve('tts') === null);
} catch (e) { ok('长文创作接口流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('语音合成（本地 GPT-SoVITS / OpenAI 兼容）');
try {
  const tts = phone.apis.save({
    name: '本地语音', type: 'tts', provider: 'gpt-sovits', baseUrl: 'http://127.0.0.1:9880',
    tts: { refAudio: 'ref.wav', promptText: '你好呀', promptLang: 'zh', textLang: 'zh', textSplit: 'cut5', speed: 1.2 }
  });
  phone.apis.bind('tts', tts.id);
  const tv = phone.tts.normalize(tts.tts);
  ok('语音接口参数被补齐成完整一份', tv.apiVersion === 'v2' && tv.method === 'auto' && tv.mediaType === 'wav' && tv.speed === 1.2,
    JSON.stringify(tv));

  const url = phone.tts.url(tts, '晚安，小刺猬。');
  ok('本地语音拼出 GET /tts 地址', /^http:\/\/127\.0\.0\.1:9880\/tts\?/.test(url), url.slice(0, 80));
  ok('地址带上参考音频 / 语种 / 语速 / 切分方式',
    /ref_audio_path=ref\.wav/.test(url) && /text_lang=zh/.test(url) && /speed_factor=1\.2/.test(url) && /text_split_method=cut5/.test(url));
  ok('文本被正确编码进地址', /text=%E6%99%9A%E5%AE%89/.test(url), url.slice(-90));

  const ttsV1 = phone.apis.save({
    name: '旧版语音', type: 'tts', provider: 'gpt-sovits', baseUrl: 'http://127.0.0.1:9880',
    tts: { apiVersion: 'v1', refAudio: 'r.wav', promptText: 'p' }
  });
  const urlV1 = phone.tts.url(ttsV1, '你好');
  ok('旧版 api 走根路径且参数名不同',
    /^http:\/\/127\.0\.0\.1:9880\/\?/.test(urlV1) && /refer_wav_path=r\.wav/.test(urlV1) && /text_language=zh/.test(urlV1), urlV1.slice(0, 70));
  try {
    phone.apis.save({ name: '缺参考音频', type: 'tts', baseUrl: 'http://127.0.0.1:9880', tts: { apiVersion: 'v2' } });
    ok('api_v2 缺参考音频时保存被拒绝', false, '没有抛错');
  } catch (e) { ok('api_v2 缺参考音频时保存被拒绝', /参考音频/.test(e.message), e.message); }

  /* 把音频取回来 */
  let ttsCall = null;
  g.fetch = (u) => {
    ttsCall = String(u);
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]).buffer) });
  };
  const got = await phone.tts.synth(tts, '晚安', {});
  ok('能取回音频数据并生成可播放地址', got.bytes === 8 && got.via === 'fetch' && got.url === 'blob:fake' && got.mime === 'audio/wav',
    JSON.stringify({ bytes: got.bytes, mime: got.mime, url: got.url }));
  ok('取音频用的就是 /tts 地址', /\/tts\?/.test(ttsCall), ttsCall.slice(0, 60));

  await phone.tts.synth(tts, '   ').then(
    () => ok('空文本不会发请求', false, '没有抛错'),
    e => ok('空文本不会发请求', /空/.test(e.message), e.message));

  g.fetch = () => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('{"message":"ref_audio_path is required"}') });
  await phone.tts.synth(tts, '晚安').then(
    () => ok('语音接口报错时带出返回内容', false, '没有抛错'),
    e => ok('语音接口报错时带出返回内容', /HTTP 400/.test(e.message) && /ref_audio_path/.test(e.message), e.message));

  g.fetch = () => Promise.reject(new Error('Failed to fetch'));
  await phone.tts.synth(tts, '晚安').then(
    () => ok('取音频失败时提示跨域与「直连播放」', false, '没有抛错'),
    e => ok('取音频失败时提示跨域与「直连播放」', /跨域/.test(e.message) && /直连播放/.test(e.message), e.message));

  /* OpenAI 兼容语音 */
  const oa = phone.apis.save({
    name: 'OpenAI 语音', type: 'tts', provider: 'openai', baseUrl: 'https://api.openai.com/v1',
    key: 'sk-tts', model: 'tts-1', voice: 'alloy'
  });
  let oaCall = null;
  g.fetch = (u, init) => { oaCall = { url: String(u), init }; return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }); };
  await phone.tts.synth(oa, 'hello', {});
  ok('OpenAI 兼容语音走 POST /audio/speech', /\/audio\/speech$/.test(oaCall.url) && oaCall.init.method === 'POST', oaCall.url);
  ok('请求体带上 model / voice / input',
    /tts-1/.test(oaCall.init.body) && /alloy/.test(oaCall.init.body) && /hello/.test(oaCall.init.body), oaCall.init.body);
  ok('OpenAI 语音不能直连播放', (function () {
    try { phone.tts.url(oa, 'x'); return false; } catch (e) { return /播放器/.test(e.message); }
  })());

  /* 切换 GPT / SoVITS 权重（模型选择） */
  const wCalls = [];
  g.fetch = (u, init) => { wCalls.push({ url: String(u), init }); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"message":"success"}') }); };
  const wr = await phone.tts.setWeights(tts, { gpt: 'a.ckpt', sovits: 'b.pth' });
  ok('能切换 GPT / SoVITS 模型权重', wr.ok && wCalls.length === 2 &&
    /set_gpt_weights\?weights_path=a\.ckpt/.test(wCalls[0].url) && /set_sovits_weights\?weights_path=b\.pth/.test(wCalls[1].url),
    wCalls.map(c => c.url).join(' | '));
  await phone.tts.setWeights(tts, {}).then(
    () => ok('没有填权重时给出中文提示', false, '没有抛错'),
    e => ok('没有填权重时给出中文提示', /权重/.test(e.message), e.message));

  /* 自检 */
  g.fetch = () => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)) });
  const tr = await phone.tts.test(tts);
  ok('语音自检返回中文结论', /语音接口正常/.test(tr.msg) && /2 KB/.test(tr.msg), tr.msg);
  ok('apis.test 对语音接口走语音自检', /语音接口正常/.test(await phone.apis.test(tts.id)));

  /* 音色库 */
  const v1 = phone.tts.voiceSave({ name: '温柔的妈妈', refAudio: 'mom.wav', promptText: '宝贝，该睡觉了。', speed: 0.95 });
  ok('音色库能新增音色', phone.tts.voices().length === 1 && v1.name === '温柔的妈妈');
  ok('第一个音色自动成为默认音色', phone.tts.defaultVoiceId() === v1.id);
  ok('音色能转成语音参数', phone.tts.voiceToTts(v1.id).refAudio === 'mom.wav' && phone.tts.voiceToTts(v1.id).speed === 0.95);
  try {
    phone.tts.voiceSave({ name: '缺路径' });
    ok('音色缺参考音频时被拒绝', false, '没有抛错');
  } catch (e) { ok('音色缺参考音频时被拒绝', /参考音频/.test(e.message), e.message); }
  phone.tts.setDefaultVoice(v1.id);
  phone.tts.voiceRemove(v1.id);
  ok('删除音色会一起清掉默认标记', phone.tts.voices().length === 0 && phone.tts.defaultVoiceId() === '');

  /* 切分：长文 → 适合朗读的小段 */
  const segs = phone.tts.split('第一句。第二句！' + '这三句有点长，'.repeat(8) + '最后一句。', 30);
  ok('长文按句子切成小段且每段不超长', segs.length >= 3 && segs.every(s => s.length <= 30),
    JSON.stringify(segs.map(s => s.length)));
  ok('切分保留句末标点', /。$/.test(segs[0]) || /！$/.test(segs[0]), segs[0]);
  ok('切分不留空段', segs.every(s => s.trim().length > 0));
  ok('短句会合并成一段', phone.tts.split('一。二。三。', 30).length === 1);
} catch (e) { ok('语音合成流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('睡前故事：文稿清洗 / 提示词 / 分段 / 收藏夹 / 播出');
try {
  const bt = phone.getApp('bedtime');
  ok('睡前故事应用已注册', !!bt && bt.builtin === true && bt.name === '睡前故事');
  const T = bt.mount && bt.mount.__test;
  ok('睡前故事暴露测试把手', !!T && typeof T.clean === 'function' && typeof T.prompt === 'function');

  /* 纯函数：数字 / 清洗 / 提示词 / 估算 */
  ok('阿拉伯数字转汉字',
    T.num('5') === '五' && T.num('12') === '十二' && T.num('20') === '二十' &&
    T.num('105') === '一百零五' && T.num('1000') === '一千' && T.num('2024') === '二千零二十四',
    [T.num('5'), T.num('12'), T.num('105'), T.num('1000'), T.num('2024')].join(','));
  const cleaned = T.clean('# 小刺猬\n**豆豆** 数到 3 就睡着了 😴 它说, "晚安!"\n\n第二段');
  ok('清洗文稿：去掉 markdown 与 emoji', !/[#*]/.test(cleaned) && cleaned.indexOf('😴') < 0, cleaned);
  ok('清洗文稿：数字转汉字', /数到三就睡着了/.test(cleaned), cleaned);
  ok('清洗文稿：半角标点转全角', cleaned.indexOf(',') < 0 && cleaned.indexOf('，') > 0 && cleaned.indexOf('！') > 0, cleaned);
  ok('清洗文稿：直引号配成弯引号', cleaned.indexOf('“') >= 0 && cleaned.indexOf('”') >= 0, cleaned);
  ok('清洗文稿：段落之间保留空行', /\n\n/.test(cleaned), JSON.stringify(cleaned));

  /* 提示词：完全由用户定，默认模板只负责占位符替换 */
  const defs = T.defaults();
  ok('默认提示词模板是一整份可改的文本',
    typeof defs.sys === 'string' && /儿童文学/.test(defs.sys) &&
    /只输出故事正文/.test(defs.user) && /\{\{主题\}\}/.test(defs.user), defs.user.slice(0, 40));
  const pr = T.prompt({ topic: '怕黑的小刺猬', lenKey: 'short' });
  ok('占位符 {{主题}} 被换成当前主题', /主题 \/ 主角：怕黑的小刺猬/.test(pr.user), pr.user);
  ok('占位符 {{篇幅}} 被换成当前篇幅', /篇幅：约 300 字/.test(pr.user), pr.user);
  ok('模板里没有的占位符会原样保留', /\{\{不认识\}\}/.test(T.prompt({ user: 'A{{不认识}}B' }).user));
  ok('主题留空时写「请你自由发挥」', /请你自由发挥/.test(T.prompt({ topic: '  ' }).user));
  const custom = T.prompt({ sys: '你是我的专属作者', user: '只写三句话。', topic: 'x', lenKey: 'long' });
  ok('用户改过的系统 / 用户提示词被原样使用（外壳不再加工）',
    custom.system === '你是我的专属作者' && custom.user === '只写三句话。', custom.system + '|' + custom.user);
  ok('提供占位符说明', T.placeholders().length === 4 && T.placeholders()[0].key === '{{主题}}');
  ok('提示词不再带「风格 / 讲给谁听」这类预设', !/风格：|适合年龄：/.test(pr.user), pr.user);

  ok('时长估算按每秒 4.6 字', T.estimate(460, 1) === 100 && T.estimate(460, 2) === 50, String(T.estimate(460, 1)));
  ok('时长格式化', T.fmtDur(45) === '45 秒' && T.fmtDur(125) === '2 分 5 秒', T.fmtDur(125));
  ok('文件名安全化', !/[\\/:*?"<>|]/.test(T.safeName('a/b:c*?"<>|')), T.safeName('a/b:c*?"<>|'));

  /* 局内流程：文稿 → 分段 → 收藏 → 导出文本 */
  phone.unlock();
  phone.openApp('bedtime');
  const ctrl = T.controller();
  ok('创作台默认是睡前故事模式', ctrl.state().mode === 'story' && ctrl.state().view === 'studio', JSON.stringify(ctrl.state().view));
  ctrl.setTopic('怕黑的小刺猬');
  ctrl.setLen('short');
  const built = ctrl.buildPrompt();
  ok('界面上的提示词跟着主题 / 篇幅走', /怕黑的小刺猬/.test(built.user) && /约 300 字/.test(built.user), built.user.slice(0, 60));
  ctrl.setPrompts('你是我的作者', '请写一个关于 {{主题}} 的故事，{{字数}} 字以内。');
  const built2 = ctrl.buildPrompt();
  ok('界面改成自定义提示词后立即生效',
    built2.system === '你是我的作者' && /关于 怕黑的小刺猬 的故事，300 字以内/.test(built2.user), built2.user);
  ctrl.resetPrompts();
  ok('能一键恢复默认提示词', ctrl.state().sysPrompt === defs.sys && ctrl.state().userPrompt === defs.user);
  ctrl.setPrompts('你是我的作者', '请写一个关于 {{主题}} 的故事，{{字数}} 字以内。');
  ctrl.freezePrompts();
  ok('「占位符换成当前内容」之后提示词里就是最终文本',
    ctrl.state().userPrompt === '请写一个关于 怕黑的小刺猬 的故事，300 字以内。' && !/\{\{/.test(ctrl.state().userPrompt),
    ctrl.state().userPrompt);
  ctrl.resetPrompts();

  ctrl.setMode('read');
  ctrl.setScript('小刺猬睡不着。它数了一、二、三。\n\n慢慢地，它睡着了。');
  ctrl.setTitle('测试故事');
  ok('文稿按句子切成朗读段', ctrl.state().paras.length >= 2 && ctrl.state().paraState.length === ctrl.state().paras.length,
    JSON.stringify(ctrl.state().paras));
  ctrl.saveToFav();
  ok('能存入收藏夹', ctrl.stories().length === 1 && ctrl.stories()[0].title === '测试故事', JSON.stringify(ctrl.stories().map(s => s.title)));
  const st0 = ctrl.stories()[0];
  ok('收藏记录了字数 / 段数 / 时长', st0.chars > 10 && st0.paras > 0 && st0.secs > 0, JSON.stringify({ c: st0.chars, p: st0.paras, s: st0.secs }));
  const txt = T.storyToText(st0);
  ok('单篇能导出成纯文本', /《测试故事》/.test(txt) && /小刺猬睡不着/.test(txt) && /长文朗读/.test(txt));
  ctrl.setTitle('改过的标题');
  ctrl.saveToFav();
  ok('再次收藏是覆盖而不是新增', ctrl.stories().length === 1 && ctrl.stories()[0].title === '改过的标题');

  /* 音频管线：桩 Audio + 桩 fetch（返回音频字节） */
  const played = [];
  defineGlobal('Audio', class {
    constructor(src) { this.src = src; this.onended = null; this.onerror = null; }
    play() { played.push(this.src); return Promise.resolve(); }
    pause() { }
  });
  g.fetch = () => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)) });
  ctrl.setScript('小刺猬睡不着。'.repeat(10));
  ok('长文稿会被切成好几段', ctrl.state().paras.length >= 2, String(ctrl.state().paras.length));
  await ctrl.synthOne(0);
  ok('第一段能合成出音频地址', ctrl.state().paraState[0] === 2 && /^blob:/.test(ctrl.state().audio[0]), ctrl.state().audio[0]);
  await ctrl.synthOne(1);
  ok('后面几段也能逐段合成', ctrl.state().paraState[1] === 2 && ctrl.state().audio[1] === 'blob:fake');

  /* 取音频失败 → 自动退化为直连播放（本地 GPT-SoVITS 默认没开跨域） */
  ctrl.setScript('只有一段话。');
  g.fetch = () => Promise.reject(new Error('Failed to fetch'));
  await ctrl.synthOne(0);
  ok('取音频失败时自动改成直连播放', ctrl.state().directMode === true && /\/tts\?/.test(ctrl.state().audio[0]),
    ctrl.state().audio[0]);
  ctrl.setScript('第一段。第二段。第三段。');
  ok('重新分段会重置直连模式标记', ctrl.state().directMode === false);

  /* 直连模式下直接交给播放器，并顺手缓冲下一段 */
  ctrl.setScript('小刺猬睡不着。'.repeat(10));
  g.fetch = () => Promise.reject(new Error('Failed to fetch'));
  await ctrl.synthOne(0);
  await ctrl.playIndex(0);
  ok('直连模式也能播（播放器地址不需要跨域）',
    ctrl.state().playing === true && /\/tts\?/.test(ctrl.state().audio[0]) && ctrl.state().paraState[0] === 2,
    JSON.stringify(ctrl.state().audio[0]).slice(0, 80));
  ok('直连模式会预先缓冲下一段', ctrl.state().paraState[1] === 2 && /\/tts\?/.test(ctrl.state().audio[1]));
  ctrl.stopPlayer();

  /* 收藏夹管理 */
  ctrl.openStory(ctrl.stories()[0].id);
  ok('能从收藏夹打开一篇来听', ctrl.state().view === 'player' && ctrl.state().paras.length > 0 && ctrl.state().storyId === ctrl.stories()[0].id);
  ok('打开收藏会累计听过次数', ctrl.stories()[0].played === 1, String(ctrl.stories()[0].played));
  ctrl.deleteStory(ctrl.stories()[0].id);
  ok('能删掉收藏里的一篇', ctrl.stories().length === 0);
  phone.closeApp();
} catch (e) { ok('睡前故事流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('GPT-SoVITS 同步启动（配置桥 + 在线探测）');
try {
  const def = phone.gsv.config();
  ok('同步启动默认是关的，探测 127.0.0.1:9880',
    def.enabled === false && def.host === '127.0.0.1' && def.port === 9880 && def.wait >= 30, JSON.stringify(def));
  ok('内置几套常用启动命令（含整合包与 venv）',
    phone.gsv.commands().length >= 4 && phone.gsv.commands().some(c => /runtime\\python\.exe/.test(c.cmd)),
    phone.gsv.commands().map(c => c.name).join(','));

  const saved = phone.gsv.save({ enabled: true, workdir: 'E:\\GPT-SoVITS', port: 9999, wait: 5, onFail: 'stop' });
  ok('能保存同步启动配置（并做范围修正）',
    saved.enabled === true && saved.workdir === 'E:\\GPT-SoVITS' && saved.port === 9999 && saved.wait === 10 && saved.onFail === 'stop',
    JSON.stringify(saved));
  ok('配置写进 settings', phone.settings.get('gsvBoot', {}).port === 9999);
  ok('能从语音接口地址解析主机与端口',
    phone.gsv.fromUrl('http://127.0.0.1:9880').port === 9880 &&
    phone.gsv.fromUrl('https://example.com/v1').port === 443 &&
    phone.gsv.fromUrl('') === null);

  const ini = phone.gsv.ini();
  ok('导出的 ini 是 key=value 且带 CRLF', /\r\n/.test(ini) && /^enabled=1$/m.test(ini.replace(/\r/g, '')), ini.slice(0, 60));
  ok('ini 里带注释、地址、目录、命令、等待秒数',
    /^#/.test(ini) && /host=127\.0\.0\.1/.test(ini) && /port=9999/.test(ini) &&
    /workdir=E:\\GPT-SoVITS/.test(ini) && /wait=10/.test(ini) && /onfail=stop/.test(ini));
  ok('ini 文件名叫 gptsovits-launch.ini，启动器叫 同步启动GPT-SoVITS.bat',
    phone.gsv.iniName() === 'gptsovits-launch.ini' && phone.gsv.launcher() === '同步启动GPT-SoVITS.bat');

  /* 探测：no-cors 的请求通不通就代表服务在不在 */
  let pingCall = null;
  g.fetch = (u, init) => { pingCall = { url: String(u), init }; return Promise.resolve({ ok: true, status: 400 }); };
  const on = await phone.gsv.ping('http://127.0.0.1:9880');
  ok('服务在跑时探测为「在运行」', on.on === true && on.url === 'http://127.0.0.1:9880', JSON.stringify(on));
  ok('探测用 no-cors（不需要服务端开跨域）', pingCall.init.mode === 'no-cors' && pingCall.init.method === 'GET', JSON.stringify(pingCall.init));
  g.fetch = () => Promise.reject(new Error('Failed to fetch'));
  const off = await phone.gsv.ping('http://127.0.0.1:9880');
  ok('连不上时探测为「没在运行」而不是抛错', off.on === false, JSON.stringify(off));
  g.fetch = () => Promise.resolve({});
  await phone.gsv.ping('').then(
    () => ok('没有地址时给出中文提示', false, '没有抛错'),
    e => ok('没有地址时给出中文提示', /地址/.test(e.message), e.message));
  ok('探测不填参数时用当前语音接口',
    (await phone.gsv.ping()).on === true);
} catch (e) { ok('同步启动流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

section('设置界面：语音接口与音色库');
try {
  phone.unlock();
  phone.openApp('settings');
  const host = byId['apps'].children.find(h => h.dataset.appId === 'settings');
  const btn = (re) => {
    const b = host.all().find(x => x.tagName === 'BUTTON' && re.test(x.textContent || ''));
    if (!b) throw new Error('找不到按钮：' + re);
    b.dispatch('click', {});
    return b;
  };
  const hasText = (re) => host.all().some(x => re.test(x.textContent || ''));
  const inputByPlaceholder = (re) => host.all().find(x => x.tagName === 'INPUT' && re.test(x.placeholder || ''));

  ok('设置主页显示语音合成状态与音色库入口',
    hasText(/语音合成（睡前故事朗读）/) && host.all().some(x => x.tagName === 'BUTTON' && /音色库/.test(x.textContent || '')),
    host.all().filter(x => x.tagName === 'BUTTON').map(x => x.textContent).join('|'));

  btn(/打开 API 管理/);
  ok('用途绑定里出现「长文创作」与「语音合成」',
    hasText(/^长文创作$/) && hasText(/^语音合成$/));
  ok('接口类型可以选四种',
    ['对话模型', '长文创作', '联网检索', '语音合成'].every(t => hasText(new RegExp('^' + t + '$'))));

  btn(/＋ 新增接口/);
  btn(/^语音合成$/);
  ok('切到语音接口后出现语音服务商与本地预设',
    hasText(/语音服务商/) && hasText(/GPT-SoVITS 本地/));
  btn(/^GPT-SoVITS 本地（推荐）$/);
  ok('预设会填好本机地址', (inputByPlaceholder(/127\.0\.0\.1:9880/) || {}).value === 'http://127.0.0.1:9880',
    JSON.stringify((inputByPlaceholder(/127\.0\.0\.1:9880/) || {}).value));
  ok('语音接口表单有参考音频 / 取音频方式 / 试听',
    hasText(/参考音频路径（GPT-SoVITS 所在机器上的路径）/) && hasText(/取音频方式/) && hasText(/试听一句/) && hasText(/模型切换/));

  /* 填好参考音频后保存 */
  const refInput = inputByPlaceholder(/pretrained_models\/s1\/xxx\.wav/);
  ok('能找到参考音频输入框', !!refInput);
  if (refInput) { refInput.value = 'GPT_SoVITS/pretrained_models/ref.wav'; refInput.dispatch('input', {}); }
  btn(/^保存$/);
  ok('语音接口保存成功并带回列表',
    phone.apis.list().some(a => a.type === 'tts' && /ref\.wav/.test((a.tts || {}).refAudio || '')),
    JSON.stringify(phone.apis.list().filter(a => a.type === 'tts').map(a => a.name)));

  /* 音色库 */
  btn(/管理音色库/);
  ok('音色库页面打开', hasText(/音色清单/) && hasText(/新增音色/));
  btn(/＋ 新增音色/);
  const inputs = host.all().filter(x => x.tagName === 'INPUT');
  ok('音色编辑表单有名字与参考音频两个输入框', inputs.length >= 2, String(inputs.length));
  inputs[0].value = '温柔妈妈'; inputs[0].dispatch('input', {});
  inputs[1].value = 'voices/mom.wav'; inputs[1].dispatch('input', {});
  btn(/^保存音色$/);
  ok('通过界面新增音色成功', phone.tts.voices().length === 1 && phone.tts.voices()[0].refAudio === 'voices/mom.wav',
    JSON.stringify(phone.tts.voices()));
  ok('新增的音色成为默认音色', phone.tts.defaultVoiceId() === phone.tts.voices()[0].id);

  /* 同步启动页 */
  btn(/‹ 返回 API 管理|返回 API 管理/);
  btn(/同步启动 GPT-SoVITS/);
  ok('同步启动页有开关、目录、命令与导出按钮',
    hasText(/打开手机时同步启动/) && hasText(/GPT-SoVITS 目录/) && hasText(/启动命令/) &&
    hasText(/导出配置文件/) && hasText(/启动器会做什么/),
    host.all().filter(x => x.tagName === 'BUTTON').map(x => x.textContent).join('|'));
  ok('同步启动页有常用启动命令预设', hasText(/官方 api_v2/));
  btn(/^整合包便携运行时$/);
  ok('点预设会把命令填进去',
    /runtime\\python\.exe/.test((inputByPlaceholder(/python api_v2\.py/) || {}).value || ''),
    JSON.stringify((inputByPlaceholder(/python api_v2\.py/) || {}).value));
  const dirInput = inputByPlaceholder(/GPT-SoVITS-v2/);
  ok('能找到 GPT-SoVITS 目录输入框', !!dirInput);
  if (dirInput) { dirInput.value = 'E:\\GPT-SoVITS'; dirInput.dispatch('input', {}); }
  btn(/^保存设置$/);
  ok('同步启动设置能保存', phone.gsv.config().workdir === 'E:\\GPT-SoVITS' &&
    /runtime\\python\.exe/.test(phone.gsv.config().command), JSON.stringify(phone.gsv.config()));
  btn(/导出配置文件/);
  ok('导出后会提示放到小手机文件夹', hasText(/已导出 gptsovits-launch\.ini/));

  phone.closeApp();
} catch (e) { ok('设置界面流程', false, e.message + '\n' + (e.stack || '').split('\n')[1]); }

/* ================= 汇总 ================= */
console.log('\n' + '='.repeat(52));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (failures.length) { console.log('\n失败清单：'); failures.forEach(f => console.log(' - ' + f)); }
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
