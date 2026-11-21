/**
 * 产物验收：直接解析 phone.html，抽取 <style>/<script>，
 * 1) 结构检查（占位符残留、标签配对、script 数量）
 * 2) 每个内联脚本语法编译
 * 3) 用假 DOM 真跑一遍产物（与 smoke.mjs 同一套桩），验证桌面渲染与全部应用可挂载
 * 运行：node tests/verify-html.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'phone.html'), 'utf8');
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; failures.push(n + (e ? ' → ' + e : '')); console.log('  ✗ ' + n + (e ? ' → ' + e : '')); } };
const section = t => console.log('\n' + t);

section('一、HTML 结构');
ok('有 DOCTYPE 与 html lang=zh-CN', /^<!DOCTYPE html>/i.test(html) && /<html lang="zh-CN">/.test(html));
ok('charset 为 utf-8', /<meta charset="utf-8">/i.test(html));
ok('无 BOM', html.charCodeAt(0) !== 0xFEFF);
ok('无占位符残留', !/__CORE_CSS__|__CORE_JS__|__APP_SCRIPTS__/.test(html));
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
ok('style 块唯一', styles.length === 1, styles.length + ' 个');
ok('script 块数量正确（2 基础 + 13 插件）', scripts.length === 15, scripts.length + ' 个');
ok('script 开闭配对', (html.match(/<script/gi) || []).length === (html.match(/<\/script/gi) || []).length + (html.match(/<\\\/script/gi) || []).length);
ok('没有内联事件处理器（onclick= 等）', !/\son[a-z]+\s*=\s*"/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, '')));
ok('没有外部资源引用（http/https/src=）', !/(src|href)\s*=\s*["']https?:/i.test(html));
ok('没有外部字体/CDN', !/fonts\.googleapis|cdn\.|unpkg|jsdelivr/i.test(html));

section('二、内联脚本语法');
scripts.forEach((s, i) => {
  try { new vm.Script(s, { filename: 'inline-' + i + '.js' }); ok('script #' + i + ' 语法正确（' + s.length + ' 字节）', true); }
  catch (e) { ok('script #' + i + ' 语法正确', false, e.message); }
});

section('三、用假 DOM 真跑产物');
/* --- 与 smoke.mjs 相同的假 DOM --- */
const CANVAS_METHODS = ['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'fillText', 'strokeText', 'quadraticCurveTo', 'bezierCurveTo', 'clip', 'setLineDash', 'drawImage', 'ellipse', 'roundRect', 'putImageData'];
const matches = (node, sel) => {
  sel = sel.trim();
  const m = sel.match(/^([a-zA-Z]*)((?:[.#][\w-]+)*)$/);
  if (m) {
    if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
    for (const p of (m[2].match(/[.#][\w-]+/g) || [])) {
      if (p[0] === '.' && !node.classList.contains(p.slice(1))) return false;
      if (p[0] === '#' && node.id !== p.slice(1)) return false;
    }
    return true;
  }
  const a = sel.match(/^\[([\w-]+)\]$/); if (a) return node._attrs[a[1]] != null;
  return false;
};
const byId = Object.create(null);
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
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this._cls = new Set();
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.dataset = makeDataset(this); this._text = ''; this._html = ''; this._attrs = {}; this._listeners = {};
    this.scrollTop = 0; this.value = ''; this.disabled = false; this.files = null; this.type = ''; this.title = '';
    this.open = false; this.width = 368; this.height = 640;
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)), remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, on) => { const w = on === undefined ? !this._cls.has(c) : !!on; w ? this._cls.add(c) : this._cls.delete(c); return w; },
      contains: c => this._cls.has(c)
    };
    Object.defineProperty(this, 'id', { get() { return this._id || ''; }, set(v) { this._id = v; if (v) byId[v] = this; }, configurable: true });
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
  appendChild(n) { if (n && n.parentNode) { const i = n.parentNode.children.indexOf(n); if (i >= 0) n.parentNode.children.splice(i, 1); } n.parentNode = this; this.children.push(n); return n; }
  append(...ns) { ns.forEach(n => this.appendChild(n)); }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertBefore(n) { return this.appendChild(n); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { const a = this._listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  dispatch(t, ev) { (this._listeners[t] || []).slice().forEach(fn => fn(Object.assign({ preventDefault() { }, stopPropagation() { }, target: this }, ev))); }
  setAttribute(k, v) { this._attrs[k] = v; } getAttribute(k) { return this._attrs[k]; }
  closest(sel) { let n = this; while (n) { if (matchSel(n, sel)) return n; n = n.parentNode; } return null; }
  focus() { } select() { } click() { this.dispatch('click', {}); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; }
  toDataURL() { return 'data:image/jpeg;base64,FAKE'; }
  getContext() {
    const o = {}, grad = {}; ['addColorStop'].forEach(m => grad[m] = () => grad);
    CANVAS_METHODS.forEach(m => o[m] = () => o);
    o.measureText = () => ({ width: 10 }); o.createLinearGradient = () => grad; o.createRadialGradient = () => grad;
    o.getImageData = () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }); o.canvas = this; return o;
  }
  snapshot() {
    return { tag: this.tagName, id: this.id || '', cls: [...this._cls].join(' '), text: this._text,
      attrs: { ...this._attrs }, children: this.children.map(c => c.snapshot ? c.snapshot() : String(c)) };
  }
  all(out = []) { this.children.forEach(c => { out.push(c); if (c.all) c.all(out); }); return out; }
  querySelector(sel) {
    const parts = String(sel).trim().split(/\s+/);
    let cur = [this];
    for (const p of parts) {
      const nx = [];
      cur.forEach(n => n.all().forEach(c => { if (matchSel(c, p)) nx.push(c); }));
      cur = nx;
    }
    return cur[0] || null;
  }
  querySelectorAll(sel) {
    const parts = String(sel).trim().split(/\s+/);
    let cur = [this];
    for (const p of parts) {
      const nx = [];
      cur.forEach(n => n.all().forEach(c => { if (matchSel(c, p)) nx.push(c); }));
      cur = nx;
    }
    return cur;
  }
  find(c) { return this.all().find(n => n.classList && n.classList.contains(c)) || null; }
  findAll(c) { return this.all().filter(n => n.classList && n.classList.contains(c)); }
}
/* 新结构：分页 / 文件夹浮层 */
const PAGE_IDS = ['wallpaper', 'phone', 'screen', 'statusbar', 'sb-time', 'sb-bat', 'home', 'pages', 'page-dots',
  'dock', 'apps', 'recents', 'rec-list', 'rec-close', 'lock', 'lock-time', 'lock-date', 'toast-layer',
  'modal-layer', 'boot-error', 'boot-error-msg', 'home-count', 'folder-pop', 'fp-name', 'fp-grid', 'fp-close', 'fp-edit', 'fp-del',
  'screensaver', 'ss-time', 'ss-date', 'ss-cat', 'ss-idx', 'ss-title', 'ss-summary', 'ss-src',
  'ss-progress', 'ss-regen', 'ss-setup', 'ss-close', 'ss-prev', 'ss-next', 'ss-more'];
PAGE_IDS.forEach(id => { const e = new FakeEl('div'); e.id = id; });
/* 页面容器预置三页（与 shell.html 一致） */
for (let i = 0; i < 3; i++) {
  const sec = new FakeEl('section');
  sec.classList.add('page');
  sec.dataset.page = String(i);
  const g1 = new FakeEl('div'); g1.classList.add('app-grid'); g1.dataset.grid = '';
  sec.appendChild(g1);
  byId['pages'].appendChild(sec);
}
byId['sb-bat'].appendChild(new FakeEl('i'));
/* pages 需要可测量的宽度，供翻页计算 */
byId['pages'].clientWidth = 368;
byId['pages'].scrollTo = function (opt) { this.scrollLeft = opt && opt.left ? opt.left : 0; };
const doc = {
  readyState: 'complete', documentElement: new FakeEl('html'), body: new FakeEl('body'), head: new FakeEl('head'),
  createElement: t => new FakeEl(t), createDocumentFragment: () => new FakeEl('fragment'),
  querySelector: s => (s && s[0] === '#' ? (byId[s.slice(1)] || null) : null),
  getElementById: id => byId[id] || null, querySelectorAll: () => [],
  addEventListener: () => { }, removeEventListener: () => { }
};
const storage = new Map();
const ls = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
const g = globalThis;
const d0 = (n, v) => Object.defineProperty(g, n, { value: v, writable: true, configurable: true });
g.window = g; g.self = g;
d0('navigator', { userAgent: 'verify', language: 'zh-CN' });
d0('localStorage', new Proxy(ls, { get(t, p) { return p === 'length' ? storage.size : t[p]; }, ownKeys: () => [...storage.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }));
d0('document', doc); d0('location', { protocol: 'file:', reload() { } });
d0('requestAnimationFrame', fn => setTimeout(() => fn(Date.now()), 0)); d0('cancelAnimationFrame', id => clearTimeout(id));
d0('Blob', class { }); d0('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() { } });
d0('AbortController', class { abort() { } }); d0('fetch', () => Promise.reject(new Error('no net')));
d0('FileReader', class { readAsText() { } }); d0('addEventListener', () => { }); d0('removeEventListener', () => { });
d0('devicePixelRatio', 1); d0('innerWidth', 420); d0('innerHeight', 900);
g.module = { exports: {} };

let threw = null;
/* 选择器探针：保留给排查用（当前仅在断言失败时才有意义，不打印） */
const selLog = [];
const _origQS = doc.querySelector;
doc.querySelector = (s) => { const r = _origQS(s); if (selLog.length < 40) selLog.push(s + '→' + (r ? 'OK' : 'null')); return r; };
try {
  /* 按产物里的顺序执行全部脚本（模拟浏览器加载），逐个定位出错脚本 */
  scripts.forEach((s, i) => {
    try { vm.runInThisContext(s, { filename: 'phone.html:script#' + i }); }
    catch (e) { if (!threw) { threw = e; threw.__idx = i; } }
  });
} catch (e) { threw = e; }
ok('产物脚本整体执行无异常', !threw, threw && ('script#' + threw.__idx + ' ' + threw.message));

const phone = g.Phone;
ok('window.Phone 暴露成功', !!phone);
/* 假 DOM 下 readyState 保持 complete，boot 会在 core 脚本执行时就跑完，
   此时插件还没注册，需要按内核提供的 rebind() 重载一次注册表（真实浏览器无需此步） */
if (phone) phone.rebind();
if (phone) {
  const apps = phone.getApps();
  section('四、应用注册结果');
  ok('注册应用数 = 13', apps.length === 13, apps.length + ' 个：' + apps.map(a => a.id).join(','));
  ['g2048', 'gomoku', 'uno', 'snake', 'puzzle', 'clock', 'notes', 'bedtime', 'reader', 'calc', 'appstore', 'aigen', 'settings'].forEach(id => {
    const a = apps.find(x => x.id === id);
    ok('应用 ' + id + ' 已注册' + (a ? '（' + a.name + '）' : ''), !!a && a.builtin === true);
    if (a) ok('  ' + id + ' 图标可渲染', /<svg|emoji/.test(phone.icons.html(a.icon, '#fff')));
  });
  ok('桌面渲染出应用图标（含添加按钮）', byId['pages'].querySelectorAll('.app-item').length >= apps.length - 3 + 1,
    byId['pages'].querySelectorAll('.app-item').length + ' 项');
  ok('页码圆点已生成', byId['page-dots'].children.length === 3, String(byId['page-dots'].children.length));
  ok('图标分布在前三页', (() => {
    const pages = byId['pages'].querySelectorAll('.page');
    return pages.length === 3 && pages.some(p => p.querySelectorAll('.app-item').length > 0);
  })());
  ok('dock 渲染 3 个固定应用', byId['dock'].children.length === 3, byId['dock'].children.length + ' 项');

  section('五、逐个打开应用（真实 openApp 路径）');
  apps.forEach(a => {
    try {
      phone.unlock();
      phone.openApp(a.id);
      const host = byId['apps'].children.find(h => h.dataset.appId === a.id);
      const nodes = host ? host.all().length : 0;
      ok(a.id + '（' + a.name + '）打开并渲染', !!host && nodes > 2, nodes + ' 个节点');
      phone.closeApp();
    } catch (e) { ok(a.id + ' 打开并渲染', false, e.message); }
  });

  section('六、存档与卸载');
  ok('存档写入 localStorage', (() => { phone.store('calc').set('history', [1, 2]); return phone.store('calc').get('history').length === 2; })());
  const bundle = phone.exportAll();
  ok('导出备份包含全部应用与存档', bundle.apps.length === 13 && !!bundle.storage);
  ok('卸载内置应用被拒绝', phone.removeApp('g2048') === false);
  ok('插件安装/卸载闭环', (() => {
    phone.addApp({ id: 'vtest', name: '验收插件', icon: 'emoji:✅' }, { code: 'function createApp(phone){ return { id:"vtest", name:"验收插件", icon:"emoji:✅", mount:function(p,root,ctx){ root.appendChild(p.utils.el("div","ui-card","ok")); } }; }', silent: true });
    return !!phone.getApp('vtest') && phone.removeApp('vtest') === true;
  })());
}

console.log('\n' + '='.repeat(52));
console.log('产物验收：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (failures.length) { console.log('\n失败清单：'); failures.forEach(f => console.log(' - ' + f)); }
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
