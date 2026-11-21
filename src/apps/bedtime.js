/* ============================================================
   内置应用 · 睡前故事
   一条流水线：自定义提示词 → 「长文创作」接口写出长篇朗读文稿
              → 按句子切成小段 → 本地 GPT-SoVITS 逐段合成
              → 边生成边播；成品可存入收藏夹，独立管理 / 导出。

   接口一律来自「设置 → API 管理」：
     · 长文创作（type=write，没配时借用对话模型）
     · 语音合成（type=tts，默认本地 GPT-SoVITS）
   本应用内不填任何地址与密钥。所有素材仍由代码生成，无外部资源。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var BEDTIME_CSS_ID = 'bedtime-theme-css';
  /* 深夜配色：窗口本身完全不透明，只是整体偏暗，适合睡前用 */
  var BEDTIME_CSS = [
    '#apps .app-host[data-app-id="bedtime"]{background:linear-gradient(180deg,#1c1a34 0%,#251b31 52%,#150e21 100%)}',
    '#apps .app-host[data-app-id="bedtime"] .app-nav{background:#221d3a;border-bottom-color:rgba(255,255,255,.08)}',
    '#apps .app-host[data-app-id="bedtime"] .nav-title{color:#f4ecdc}',
    '#apps .app-host[data-app-id="bedtime"] .nav-btn{background:rgba(255,255,255,.1);color:#f4ecdc}',
    '#apps .app-host[data-app-id="bedtime"] .ui-btn{background:#e2b269;color:#2c1c06;box-shadow:0 6px 16px -10px rgba(226,178,105,.95)}',
    '#apps .app-host[data-app-id="bedtime"] .ui-btn.ghost{background:rgba(255,255,255,.09);color:#efe3cd;box-shadow:none}',
    '#apps .app-host[data-app-id="bedtime"] .ui-btn.warn{background:#c96a5f;color:#2d0e0a}',
    '#apps .app-host[data-app-id="bedtime"] .ui-field{background:#2b2444;border-color:rgba(255,255,255,.16);color:#f4ecdc}',
    '#apps .app-host[data-app-id="bedtime"] .ui-label{color:#b6a7c8}',
    '#apps .app-host[data-app-id="bedtime"] .ui-muted{color:#a294b8}',
    '#apps .app-host[data-app-id="bedtime"] .ui-card{background:#2a2342;border-color:rgba(255,255,255,.09);color:#e9dfcc}',
    '#apps .app-host[data-app-id="bedtime"] .ui-list .li{background:#2a2342;border-color:rgba(255,255,255,.09)}',
    '#apps .app-host[data-app-id="bedtime"] .ui-list .li b{color:#f4ecdc}',
    '#apps .app-host[data-app-id="bedtime"] .ui-list .li small{color:#a294b8}',
    '#apps .app-host[data-app-id="bedtime"] .ui-hint{background:rgba(226,178,105,.16);border-color:rgba(226,178,105,.42);color:#f0d7a8}',
    '#apps .app-host[data-app-id="bedtime"] .ui-pre{background:#221c39;color:#ddd2ec}',
    '#apps .app-host[data-app-id="bedtime"] .ui-bar{background:rgba(255,255,255,.14)}',
    '#apps .app-host[data-app-id="bedtime"] .ui-bar>i{background:#e2b269}',
    '#apps .app-host[data-app-id="bedtime"] .ui-spin{border-color:rgba(44,28,6,.3);border-top-color:#2c1c06}',
    /* 应用内部件 */
    '#apps .app-host[data-app-id="bedtime"] .bt-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-chip{border:0;font:inherit;font-size:11.5px;font-weight:700;padding:6px 11px;',
    '  border-radius:999px;background:rgba(255,255,255,.09);color:#e6d9c2;cursor:pointer}',
    '#apps .app-host[data-app-id="bedtime"] .bt-chip.on{background:#e2b269;color:#2c1c06}',
    '#apps .app-host[data-app-id="bedtime"] .bt-line{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border-radius:14px;',
    '  background:#2a2342;margin-bottom:7px;cursor:pointer;border:1px solid transparent}',
    '#apps .app-host[data-app-id="bedtime"] .bt-line.cur{border-color:#e2b269;box-shadow:0 0 0 2px rgba(226,178,105,.25)}',
    '#apps .app-host[data-app-id="bedtime"] .bt-line.bad{border-color:#c96a5f}',
    '#apps .app-host[data-app-id="bedtime"] .bt-no{flex:0 0 26px;font-size:11px;font-weight:800;color:#b6a7c8;padding-top:2px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-tx{flex:1;min-width:0;font-size:12.5px;line-height:1.65;color:#e9dfcc}',
    '#apps .app-host[data-app-id="bedtime"] .bt-st{flex:0 0 auto;font-size:11px;color:#a294b8;padding-top:2px;white-space:nowrap}',
    '#apps .app-host[data-app-id="bedtime"] .bt-bar{position:sticky;bottom:0;z-index:6;margin:14px -16px -22px;padding:10px 16px 14px;',
    '  background:#221d3a;border-top:1px solid rgba(255,255,255,.1)}',
    '#apps .app-host[data-app-id="bedtime"] .bt-bar .ui-row{flex-wrap:wrap;gap:6px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-now{font-size:12px;color:#cbbfa6;line-height:1.6;margin-bottom:8px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-seg{font-size:12px;color:#e9dfcc;background:#2a2342;border-radius:12px;padding:8px 10px;margin-bottom:6px;cursor:pointer}',
    '#apps .app-host[data-app-id="bedtime"] .bt-empty{text-align:center;padding:30px 14px;color:#a294b8}',
    '#apps .app-host[data-app-id="bedtime"] .bt-empty .bt-big{font-size:44px;line-height:1;margin-bottom:8px}',
    '#apps .app-host[data-app-id="bedtime"] .bt-star{font-size:12px;color:#d8c9a6}'
  ].join('\n');

  function injectTheme(doc) {
    try {
      if (doc.getElementById(BEDTIME_CSS_ID)) return;
      var s = doc.createElement('style');
      s.id = BEDTIME_CSS_ID;
      s.textContent = BEDTIME_CSS;
      (doc.head || doc.body || doc.documentElement).appendChild(s);
    } catch (e) { /* 注入失败不影响功能 */ }
  }

  /* ============================================================
     一、纯函数区（不碰 DOM，测试直接调 mount.__test 里的这几个）
     ============================================================ */

  var CN_DIGITS = '零一二三四五六七八九';
  /** 阿拉伯数字转汉字（0~9999，故事里够用了；超范围原样返回） */
  function numToCn(str) {
    var n = parseInt(str, 10);
    if (!isFinite(n) || n < 0 || n > 9999) return str;
    if (n < 10) return CN_DIGITS[n];
    if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
    if (n < 100) return CN_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
    if (n < 1000) {
      var h = Math.floor(n / 100), r = n % 100;
      return CN_DIGITS[h] + '百' + (r ? (r < 10 ? '零' + CN_DIGITS[r] : numToCn(String(r))) : '');
    }
    var th = Math.floor(n / 1000), r2 = n % 1000;
    return CN_DIGITS[th] + '千' + (r2 ? (r2 < 100 ? '零' + numToCn(String(r2)) : numToCn(String(r2))) : '');
  }

  /**
   * 把模型写出来的文稿整理成「适合朗读」的纯文本：
   * 去掉 markdown / emoji / 多余符号，半角标点转全角，阿拉伯数字转汉字。
   * 这一步很关键 —— 直接拿带 *、#、😀 的文本去合成，念出来会很怪。
   */
  function cleanScript(text) {
    var s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    s = s.replace(/```[a-zA-Z]*\n?/g, '');                       /* 代码围栏 */
    s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');                    /* markdown 标题 */
    s = s.replace(/\*\*([^*]*)\*\*/g, '$1').replace(/\*([^*]*)\*/g, '$1');
    s = s.replace(/^\s*[-*+•]\s+/gm, '');                        /* 列表符号 */
    s = s.replace(/[`~_^|<>]/g, '');
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');        /* emoji（代理对） */
    s = s.replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u2190-\u21FF]/g, '');
    /* 半角标点转全角：语音前端对全角标点更友好 */
    s = s.replace(/([!?;:,])\s*/g, function (m, p) {
      return ({ '!': '！', '?': '？', ';': '；', ':': '：', ',': '，' })[p];
    });
    s = s.replace(/\.(?=\s|$)/g, '。');
    s = s.replace(/\s*—\s*/g, '，');
    /* 直引号配成中文弯引号（TTS 前端读弯引号更自然） */
    var openQuote = false;
    s = s.replace(/"/g, function () { openQuote = !openQuote; return openQuote ? '“' : '”'; });
    s = s.replace(/'/g, '');
    /* 数字转汉字 */
    s = s.replace(/\d+/g, function (m) { return numToCn(m); });
    /* 空白整理：中文之间不留空格（TTS 会把空格当成停顿，读起来断断续续） */
    s = s.replace(/[ \t\u3000]+/g, ' ');
    s = s.replace(/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/g, '$1$2');
    s = s.replace(/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/g, '$1$2');
    s = s.replace(/ *\n */g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]+$/gm, '');
    s = s.replace(/^\s+|\s+$/g, '');
    return s;
  }

  var LENGTHS = [
    { key: 'short', label: '短 · 约 300 字', chars: 300 },
    { key: 'medium', label: '中 · 约 600 字', chars: 600 },
    { key: 'long', label: '长 · 约 1000 字', chars: 1000 },
    { key: 'xlong', label: '超长 · 约 1800 字', chars: 1800 }
  ];

  /* 提示词完全交给用户：下面两份只是「初始模板」，
     界面上可以随便改，改完的版本会存进本机存档。
     模板里可以用占位符，生成时替换成当前的输入：
       {{主题}} {{字数}} {{篇幅}} {{日期}} */
  var PROMPT_SYS_DEFAULT = '你是一位专门为孩子写睡前故事的儿童文学作者。你的文字温柔、有画面感、懂孩子的心理，' +
    '写出来的故事都是可以直接念出来听的。';
  var PROMPT_USER_DEFAULT = [
    '请创作一个可以念给孩子听的睡前故事。',
    '',
    '主题 / 主角：{{主题}}',
    '篇幅：{{篇幅}}',
    '',
    '输出要求（很重要）：',
    '1. 只输出故事正文，不要标题、不要 markdown、不要解释、不要小标题。',
    '2. 用自然的口语短句，每句尽量不超过 25 个字，句子之间要有呼吸感，适合朗读。',
    '3. 不要出现括号、星号、emoji、英文缩写和阿拉伯数字（数字请写成汉字）。',
    '4. 段落之间空一行，每段 2~4 句。',
    '5. 结尾温柔收束，让孩子安心入睡。'
  ].join('\n');

  var PLACEHOLDERS = [
    { key: '{{主题}}', desc: '① 里填的主题 / 主角（没填时写「请你自由发挥」）' },
    { key: '{{字数}}', desc: '篇幅的字数，例如 600' },
    { key: '{{篇幅}}', desc: '篇幅的完整说法，例如 中 · 约 600 字' },
    { key: '{{日期}}', desc: '今天的日期' }
  ];

  function pickByKey(list, key, fallbackIdx) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[fallbackIdx || 0];
  }
  function lenOf(key) { return pickByKey(LENGTHS, key, 1); }

  /** 把模板里的 {{占位符}} 换成当前输入（这就是最终发出去的内容） */
  function renderPrompt(tpl, vars) {
    var v = vars || {};
    return String(tpl == null ? '' : tpl).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, k) {
      if (k === '主题') return String(v.topic || '').trim() || '请你自由发挥';
      if (k === '字数') return String(v.chars == null ? '' : v.chars);
      if (k === '篇幅') return String(v.lenLabel || '');
      if (k === '日期') return String(v.date || '');
      return m;   /* 不认识的占位符原样留着，用户看得出来 */
    });
  }

  /**
   * 组装「长文创作」接口要的两条消息。
   * 直接吃用户编辑过的两份提示词模板，只做占位符替换，不做任何隐藏加工。
   */
  function buildStoryPrompt(o) {
    o = o || {};
    var len = lenOf(o.lenKey);
    var vars = {
      topic: o.topic,
      chars: len.chars,
      lenLabel: len.label.replace(/^[^\s]+\s*·\s*/, ''),
      date: new Date().toLocaleDateString()
    };
    var sysTpl = (o.sys == null || o.sys === '') ? PROMPT_SYS_DEFAULT : o.sys;
    var userTpl = (o.user == null || o.user === '') ? PROMPT_USER_DEFAULT : o.user;
    return { system: renderPrompt(sysTpl, vars), user: renderPrompt(userTpl, vars), vars: vars };
  }

  /** 估算朗读时长（秒）：中文正常语速约每秒 4.6 字 */
  function estimateSeconds(chars, speed) {
    var sp = Number(speed) > 0 ? Number(speed) : 1;
    return Math.max(1, Math.round(Number(chars || 0) / (4.6 * sp)));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec < 60) return sec + ' 秒';
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ' 分' + (s ? ' ' + s + ' 秒' : '');
  }
  function fmtChars(n) {
    n = Number(n) || 0;
    return n >= 10000 ? (n / 10000).toFixed(1) + ' 万字' : n + ' 字';
  }
  /** 文件名安全化 */
  function safeName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 40) || '睡前故事';
  }
  /** 收藏夹里一条记录导出成 txt */
  function storyToText(st) {
    return '《' + (st.title || '未命名') + '》\n' +
      '（' + (st.mode === 'read' ? '长文朗读' : '睡前故事') + ' · ' + new Date(st.added || Date.now()).toLocaleString() +
      ' · 约 ' + fmtChars(st.chars) + ' · 约 ' + fmtDur(st.secs) + ' · 音色：' + (st.voiceName || '未记录') + '）\n\n' +
      String(st.text || '') + '\n\n—— 由小手机 PhoneShell「睡前故事」生成\n';
  }
  function uid() {
    return 'st-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* ============================================================
     二、应用本体
     ============================================================ */
  function createApp(phone) {
    var U = phone.utils;
    injectTheme(document);

    var MAX_PARAS = 400;        /* 单篇最多切多少段（防止误导入一本书把浏览器拖死） */
    var MAX_STORIES = 80;       /* 收藏夹最多存多少篇 */
    var SEG_CHARS = 60;         /* 每段朗读文字的目标长度 */
    var MAX_CHARS = 6000;       /* 单篇文稿最多保留多少字 */

    function mount(phoneApi, root, ctx) {
      /* ---------------- 状态 ---------------- */
      var S = {
        view: 'studio', mode: 'story',
        topic: '', lenKey: 'medium',
        sysPrompt: PROMPT_SYS_DEFAULT, userPrompt: PROMPT_USER_DEFAULT,
        templateId: '', rawText: '',
        title: '', script: '', busy: false, err: '', status: '',
        storyId: null, fromFav: false,
        paras: [], paraState: [], paraErr: [], audio: [], blob: [], preload: [],
        pending: {}, cur: -1, playing: false, autoNext: true, stopMode: 'off',
        directMode: false, genStop: false, genDone: 0, failed: 0,
        pingMsg: '', pingOk: null
      };
      var stories = [];
      var templates = [];
      var ui = {};
      var urls = [];               /* 本会话创建过的 objectURL，关闭时统一回收 */
      var player = null;
      var timerHandle = null;
      var timerEnd = 0;
      var listEl = null;
      var barEl = null;
      var statusEl = null;

      /* ---------------- 存档 ---------------- */
      function loadStories() {
        var raw = ctx.store.get('stories', []);
        var out = [];
        if (Object.prototype.toString.call(raw) === '[object Array]') {
          raw.forEach(function (s) {
            if (!s || typeof s !== 'object' || typeof s.text !== 'string') return;
            out.push({
              id: String(s.id || uid()),
              title: String(s.title || '未命名'),
              text: s.text,
              mode: s.mode === 'read' ? 'read' : 'story',
              topic: String(s.topic || ''),
              lenKey: String(s.lenKey || ''),
              promptSys: String(s.promptSys || ''),
              promptUser: String(s.promptUser || ''),
              voiceId: String(s.voiceId || ''),
              voiceName: String(s.voiceName || ''),
              ttsName: String(s.ttsName || ''),
              chars: Number(s.chars) || s.text.length,
              paras: Number(s.paras) || 0,
              secs: Number(s.secs) || 0,
              added: Number(s.added) || Date.now(),
              at: Number(s.at) || Number(s.added) || Date.now(),
              played: Number(s.played) || 0
            });
          });
        }
        return out.reverse(); /* 新的在前 */
      }
      function saveStories() {
        try { ctx.store.set('stories', stories); }
        catch (e) { phone.toast('收藏夹保存失败（可能本地存储满了）', 'bad'); }
      }
      function loadTemplates() {
        var raw = ctx.store.get('templates', []);
        var out = [];
        if (Object.prototype.toString.call(raw) === '[object Array]') {
          raw.forEach(function (t) {
            if (!t || typeof t !== 'object') return;
            out.push({
              id: String(t.id || uid()),
              name: String(t.name || '未命名模板').slice(0, 20),
              sys: String(t.sys || PROMPT_SYS_DEFAULT),
              text: String(t.text || PROMPT_USER_DEFAULT)
            });
          });
        }
        return out;
      }
      function saveTemplates() { ctx.store.set('templates', templates); }
      function saveUi() {
        ctx.store.set('ui', {
          mode: S.mode, lenKey: S.lenKey, topic: S.topic,
          sysPrompt: S.sysPrompt, userPrompt: S.userPrompt,
          voiceId: S.voiceId, autoNext: S.autoNext, stopMode: S.stopMode
        });
      }

      stories = loadStories();
      templates = loadTemplates();
      ui = ctx.store.get('ui', null) || {};
      if (ui.mode === 'read' || ui.mode === 'story') S.mode = ui.mode;
      if (ui.lenKey) S.lenKey = ui.lenKey;
      if (ui.voiceId) S.voiceId = ui.voiceId;
      if (ui.autoNext === false) S.autoNext = false;
      if (ui.stopMode) S.stopMode = ui.stopMode;
      if (ui.topic) S.topic = ui.topic;
      if (typeof ui.sysPrompt === 'string' && ui.sysPrompt.trim()) S.sysPrompt = ui.sysPrompt;
      if (typeof ui.userPrompt === 'string' && ui.userPrompt.trim()) S.userPrompt = ui.userPrompt;
      function resetPrompts() { S.sysPrompt = PROMPT_SYS_DEFAULT; S.userPrompt = PROMPT_USER_DEFAULT; saveUi(); }
      /** 把占位符一次性换成当前内容 —— 之后这两份提示词就是「最终文本」，外壳不再做任何替换 */
      function freezePrompts() {
        var p = buildStoryPrompt({ sys: S.sysPrompt, user: S.userPrompt, topic: S.topic, lenKey: S.lenKey });
        S.sysPrompt = p.system;
        S.userPrompt = p.user;
        saveUi();
        return p;
      }

      /* ---------------- 接口 ---------------- */
      function writeApi() { return phone.apis.resolve('write'); }
      function ttsApi() { return phone.apis.resolve('tts'); }
      /** 当前音色：优先用用户选的，其次默认音色 */
      function curVoice() {
        var v = phone.tts.voiceGet(S.voiceId) || phone.tts.voiceGet(phone.tts.defaultVoiceId());
        return v;
      }
      /** 合成时用的语音参数：音色覆盖接口里的参考音频 */
      function ttsOpts() {
        var v = curVoice();
        return v ? {
          refAudio: v.refAudio, promptText: v.promptText, promptLang: v.promptLang,
          textLang: v.textLang, textSplit: v.textSplit, speed: v.speed
        } : {};
      }
      function curSpeed() {
        var v = curVoice();
        if (v && Number(v.speed) > 0) return Number(v.speed);
        var api = ttsApi();
        return api ? phone.tts.normalize(api.tts).speed : 1;
      }

      /* ---------------- 播放器 ---------------- */
      function trackUrl(u) { if (u) urls.push(u); }
      function stopPlayer() {
        if (player) { try { player.onended = null; player.onerror = null; player.pause(); } catch (e) { } }
        player = null;
        S.playing = false;
        stopTimer();
      }
      function clearPreloads() {
        (S.preload || []).forEach(function (a) { if (a) { try { a.src = ''; } catch (e) { } } });
        S.preload = (S.paras || []).map(function () { return null; });
      }
      function stopTimer() {
        if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
        timerEnd = 0;
      }
      function startTimer() {
        stopTimer();
        if (S.stopMode === 'off' || S.stopMode === 'para') return;
        var min = Number(S.stopMode);
        if (!isFinite(min) || min <= 0) return;
        timerEnd = Date.now() + min * 60000;
        timerHandle = setInterval(function () {
          if (Date.now() >= timerEnd) {
            stopPlayer();
            phone.toast('定时到了，已经停下来啦', 'ok');
            renderBar();
          }
        }, 5000);
      }
      function haveAudio() { return typeof Audio === 'function'; }

      /** 合成第 i 段（有缓存就直接用；结果写进 S.audio[i]） */
      function synthOne(i) {
        if (S.paraState[i] === 2) return Promise.resolve(S.audio[i]);
        if (S.pending[i]) return S.pending[i];
        var api = ttsApi();
        if (!api) return Promise.reject(new Error('还没有配置语音合成接口。请到「设置 → API 管理」新增一个「语音合成」（本地 GPT-SoVITS 即可）。'));
        if (!haveAudio()) return Promise.reject(new Error('当前环境不支持播放音频'));
        var mode = S.directMode ? 'direct' : phone.tts.normalize(api.tts).method;
        S.paraState[i] = 1;
        S.paraErr[i] = '';
        paintLine(i);

        var p;
        if (mode === 'direct') {
          try {
            S.audio[i] = phone.tts.url(api, S.paras[i], ttsOpts());
            S.paraState[i] = 2;
            paintLine(i);
            p = Promise.resolve(S.audio[i]);
          } catch (e) {
            S.paraState[i] = 3; S.paraErr[i] = e.message;
            paintLine(i);
            p = Promise.reject(e);
          }
        } else {
          p = phone.tts.synth(api, S.paras[i], ttsOpts()).then(function (r) {
            trackUrl(r.url);
            S.audio[i] = r.url;
            S.blob[i] = r.blob;
            S.paraState[i] = 2;
            paintLine(i);
            return r.url;
          }).catch(function (e) {
            delete S.pending[i];
            /* 自动模式：取不回来多半是跨域，退化成直连播放再试一次 */
            if (mode === 'auto') {
              S.directMode = true;
              phone.toast('取音频失败，已改成直连播放（本地接口一般没开跨域）', 'bad');
              return synthOne(i);
            }
            S.paraState[i] = 3;
            S.paraErr[i] = e && e.message ? e.message : String(e);
            paintLine(i);
            throw e;
          });
        }
        S.pending[i] = p;
        p.then(function () { delete S.pending[i]; }, function () { delete S.pending[i]; });
        return p;
      }

      /** 提前把下一段准备好，播放就不容易断 */
      function prefetch(i) {
        if (i < 0 || i >= S.paras.length) return;
        if (S.paraState[i] === 2 || S.pending[i]) return;
        if (S.directMode) {
          /* 直连模式没法用 fetch 预取，但可以让播放器先把这一段缓冲下来 */
          var api = ttsApi();
          if (!api || !haveAudio()) return;
          try {
            var durl = phone.tts.url(api, S.paras[i], ttsOpts());
            var a = new Audio(durl);
            a.preload = 'auto';
            if (typeof a.load === 'function') { try { a.load(); } catch (e2) { } }
            S.preload[i] = a;
            S.audio[i] = durl;
            S.paraState[i] = 2;
            paintLine(i);
          } catch (e) { /* 拼不出地址就等播放时再报错 */ }
          return;
        }
        synthOne(i).catch(function () { });
      }

      function playIndex(i) {
        if (i < 0 || i >= S.paras.length) return Promise.resolve();
        if (!ttsApi()) {
          phone.alert('还没有语音接口', '请到「设置 → API 管理」新增一个「语音合成」接口（本地 GPT-SoVITS 默认在 http://127.0.0.1:9880）。');
          return Promise.resolve();
        }
        var pre = null;
        if (S.preload[i]) { pre = S.preload[i]; S.preload[i] = null; }
        var started = pre ? Promise.resolve(S.audio[i] || pre.src) : synthOne(i);
        return started.then(function (url) {
          stopPlayer();
          S.cur = i;
          S.playing = true;
          if (pre) { try { pre.currentTime = 0; } catch (e) { } }
          player = pre || new Audio(url);
          player.onended = function () { onEnded(i); };
          player.onerror = function () {
            S.paraState[i] = 3;
            S.paraErr[i] = '播放失败：音频地址不可用（接口没启动，或跨域被拦）';
            S.playing = false;
            renderBar(); renderList();
          };
          var pr = player.play();
          if (pr && typeof pr.catch === 'function') {
            pr.catch(function (e) {
              S.playing = false;
              renderBar();
              phone.toast('浏览器拦下了自动播放，点一下播放键即可：' + (e && e.message ? e.message : e), 'bad');
            });
          }
          prefetch(i + 1);
          startTimer();
          renderList(); renderBar();
        }).catch(function (e) {
          S.playing = false;
          renderBar(); renderList();
          phone.alert('这一段没合成成功', '```\n' + (e && e.message ? e.message : e) + '\n```\n可以直接再点这一段重试。');
        });
      }
      function onEnded(i) {
        S.playing = false;
        if (S.stopMode === 'para') {
          S.stopMode = 'off';
          phone.toast('这一段念完了，按你设的停下来了', 'ok');
          renderBar();
          return;
        }
        if (S.autoNext && i + 1 < S.paras.length) return playIndex(i + 1);
        S.cur = i;
        renderBar(); renderList();
      }
      function togglePlay() {
        if (S.playing) { stopPlayer(); renderBar(); renderList(); return; }
        playIndex(S.cur >= 0 ? S.cur : 0);
      }

      /** 一次性把剩下的都合成出来（不播放） */
      function synthAll() {
        var api = ttsApi();
        if (!api) return phone.alert('还没有语音接口', '请先到「设置 → API 管理」配置「语音合成」接口。');
        if (!S.paras.length) return;
        S.genStop = false;
        S.genDone = 0; S.failed = 0;
        renderBar();
        var i = 0;
        function step() {
          if (S.genStop) { phone.toast('已停止合成', 'ok'); renderBar(); return; }
          while (i < S.paras.length && S.paraState[i] === 2) i++;
          if (i >= S.paras.length) {
            phone.toast(S.failed ? ('合成完成，' + S.failed + ' 段失败，可点那几段重试') : '全部合成完成', S.failed ? 'bad' : 'ok');
            S.genDone = 0;
            renderBar(); renderList();
            return;
          }
          var idx = i;
          S.genDone++;
          renderBar();
          synthOne(idx).then(function () { step(); }, function () { S.failed++; step(); });
        }
        step();
      }

      /* ---------------- 渲染 ---------------- */
      function render() {
        root.innerHTML = '';
        listEl = null; barEl = null; statusEl = null;
        if (S.view === 'studio') renderStudio();
        else if (S.view === 'script') renderScript();
        else if (S.view === 'player') renderPlayer();
        else renderFav();
      }
      function go(v) { S.view = v; render(); }

      function chips(parent, items, curKey, onPick, labelOf) {
        var row = U.el('div', 'bt-chips');
        items.forEach(function (it) {
          var b = U.el('button', 'bt-chip' + (it.key === curKey ? ' on' : ''), labelOf ? labelOf(it) : it.label);
          b.title = it.desc || '';
          b.type = 'button';
          b.addEventListener('click', function () { onPick(it); });
          row.appendChild(b);
        });
        parent.appendChild(row);
        return row;
      }
      function card(title) {
        var c = U.el('div', 'ui-card');
        if (title) {
          var t = U.el('div', null, title);
          t.style.fontWeight = '800';
          t.style.fontSize = '13.5px';
          t.style.marginBottom = '8px';
          t.style.color = '#f4ecdc';
          c.appendChild(t);
        }
        root.appendChild(c);
        return c;
      }

      /* ---------------- 创作台 ---------------- */
      function renderStudio() {
        ctx.setTitle('睡前故事');
        var api = writeApi();
        var ta = ttsApi();
        var hint = U.el('div', 'ui-hint');
        hint.innerHTML = '填主题 → <b>下面③的提示词由你自己定</b>（默认给了一份能用的模板，随便改）→ 由「长文创作」接口写出文稿 → ' +
          '自动切成一小段一小段 → 交给本地语音接口念出来（边生成边播）。<br>' +
          '当前创作接口：' + (api ? ('<b>' + U.esc(api.name) + '</b>' + (api.type === 'write' ? '' : '（借用的对话模型）'))
            : '<span style="color:#e89b8f">未配置</span>') +
          ' · 当前语音接口：' + (ta ? ('<b>' + U.esc(ta.name) + '</b>') : '<span style="color:#e89b8f">未配置</span>') +
          ' · 音色：' + (curVoice() ? U.esc(curVoice().name) : '未设置');
        root.appendChild(hint);

        /* 语音服务在不在？顺便给个「同步启动」的指路 */
        var pingRow = U.el('div', 'ui-row');
        pingRow.style.marginTop = '8px'; pingRow.style.flexWrap = 'wrap';
        var bPing = U.el('button', 'ui-btn ghost', '🔍 检测语音服务');
        bPing.style.fontSize = '11.5px'; bPing.style.padding = '6px 10px';
        bPing.addEventListener('click', function () {
          var a = ttsApi();
          if (!a) return phone.toast('还没有配置语音接口', 'bad');
          S.pingMsg = '检测中…'; S.pingOk = null;
          render();
          phone.gsv.ping(a).then(function (r) {
            S.pingOk = r.on;
            S.pingMsg = r.on ? ('运行中：' + r.url) : ('没连上 ' + r.url + ' —— 先手动启动，或在「设置 → 同步启动」里配好，让「启动小手机.bat」代劳');
            render();
          });
        });
        pingRow.appendChild(bPing);
        var pingInfo = U.el('div', 'ui-muted', S.pingMsg || '');
        pingInfo.style.flex = '1';
        pingInfo.style.minWidth = '160px';
        pingRow.appendChild(pingInfo);
        root.appendChild(pingRow);

        /* 模式 */
        var mRow = U.el('div', 'ui-row');
        mRow.style.marginTop = '10px'; mRow.style.flexWrap = 'wrap';
        [['story', '🛏 睡前故事（AI 创作）'], ['read', '📖 长文朗读（已有文本）']].forEach(function (m) {
          var b = U.el('button', 'ui-btn' + (S.mode === m[0] ? '' : ' ghost'), m[1]);
          b.style.fontSize = '12.5px'; b.style.padding = '9px 13px';
          b.addEventListener('click', function () {
            if (S.mode === m[0]) return;
            S.mode = m[0]; saveUi(); render();
          });
          mRow.appendChild(b);
        });
        root.appendChild(mRow);

        if (S.mode === 'story') renderStoryForm();
        else renderReadForm();

        if (S.err) {
          var e = U.el('div', 'ui-hint');
          e.style.marginTop = '10px';
          e.style.background = 'rgba(201,106,95,.2)';
          e.style.borderColor = 'rgba(201,106,95,.5)';
          e.style.color = '#f3c6bf';
          e.textContent = '出错了：' + S.err;
          root.appendChild(e);
        }

        if (S.script) {
          var c = card('上一次的文稿');
          c.appendChild(U.el('div', 'ui-muted', (S.title || '未命名') + ' · ' + fmtChars(S.script.length) + ' · 约 ' + fmtDur(estimateSeconds(S.script.length, curSpeed()))));
          var r = U.el('div', 'ui-row');
          r.style.marginTop = '8px'; r.style.flexWrap = 'wrap';
          var bBack = U.el('button', 'ui-btn ghost', '继续编辑这篇');
          bBack.addEventListener('click', function () { go('script'); });
          var bNew = U.el('button', 'ui-btn ghost', '清空重来');
          bNew.addEventListener('click', function () {
            S.script = ''; S.title = ''; S.storyId = null; S.fromFav = false;
            S.paras = []; S.paraState = []; S.audio = []; S.blob = []; S.cur = -1;
            render();
          });
          r.appendChild(bBack); r.appendChild(bNew);
          c.appendChild(r);
        }

        /* 收藏夹入口 */
        var fc = card('收藏夹');
        fc.appendChild(U.el('div', 'ui-muted', stories.length
          ? ('已经收藏 ' + stories.length + ' 篇，共约 ' + fmtChars(stories.reduce(function (n, s) { return n + s.chars; }, 0)) + '。')
          : '还没有收藏。创作完成后点「存入收藏夹」就会出现在这里。'));
        var fr = U.el('div', 'ui-row');
        fr.style.marginTop = '8px'; fr.style.flexWrap = 'wrap';
        var bFav = U.el('button', 'ui-btn ghost', '📚 打开收藏夹（' + stories.length + '）');
        bFav.addEventListener('click', function () { go('fav'); });
        fr.appendChild(bFav);
        fc.appendChild(fr);
      }

      function renderStoryForm() {
        var c1 = card('① 主题 / 主角');
        var topic = U.el('textarea', 'ui-field');
        topic.rows = 2;
        topic.style.minHeight = '56px';
        topic.placeholder = '例如：一只怕黑的小刺猬，第一次自己睡觉（也可以留空，让模型自己定）';
        topic.value = S.topic;
        topic.addEventListener('input', function () { S.topic = topic.value; });
        c1.appendChild(topic);
        chips(c1, [
          { key: 't1', label: '怕黑的小刺猬', topic: '一只怕黑的小刺猬，第一次自己睡觉' },
          { key: 't2', label: '月亮上的兔子', topic: '住在月亮上的小兔子想看看地球' },
          { key: 't3', label: '会唱歌的鲸鱼', topic: '一条会唱歌的小鲸鱼，用歌声帮朋友入睡' },
          { key: 't4', label: '修星星的爷爷', topic: '一位在夜里修星星的老爷爷' },
          { key: 't5', label: '云朵小床', topic: '一朵云变成了小动物们的床' },
          { key: 't6', label: '晚安小火车', topic: '每到夜里就出发的晚安小火车' }
        ], null, function (it) {
          S.topic = it.topic;
          saveUi();
          render();
        });

        var c2 = card('② 篇幅');
        chips(c2, LENGTHS, S.lenKey, function (it) { S.lenKey = it.key; saveUi(); render(); });

        /* ---- 提示词：完全由用户定，这里显示的就是最终发出去的内容 ---- */
        var c3 = card('③ 最终提示词（可以随便改）');
        c3.appendChild(U.el('div', 'ui-muted',
          '下面两份就是真正发给「长文创作」接口的内容，除了把 {{占位符}} 换成当前的输入，外壳不会再做任何加工。' +
          '改完自动记住，下次打开还是你改过的版本。'));

        /* 模板 */
        var tRow0 = U.el('div', 'ui-row');
        tRow0.style.marginTop = '10px'; tRow0.style.flexWrap = 'wrap';
        var tsel = U.el('select', 'ui-field');
        tsel.style.flex = '1'; tsel.style.minWidth = '140px';
        var op0 = U.el('option', null, templates.length ? '载入已保存的提示词模板…' : '（还没有保存过模板）');
        op0.value = '';
        tsel.appendChild(op0);
        templates.forEach(function (t) {
          var op = U.el('option', null, t.name);
          op.value = t.id;
          tsel.appendChild(op);
        });
        tsel.value = S.templateId || '';
        var bLoad = U.el('button', 'ui-btn ghost', '载入');
        bLoad.style.padding = '8px 11px'; bLoad.style.fontSize = '12px';
        bLoad.addEventListener('click', function () {
          var t = null;
          templates.forEach(function (x) { if (x.id === tsel.value) t = x; });
          if (!t) return phone.toast('先选一个模板', 'bad');
          S.sysPrompt = t.sys; S.userPrompt = t.text; S.templateId = t.id;
          saveUi();
          phone.toast('已载入模板：' + t.name, 'ok');
          render();
        });
        tRow0.appendChild(tsel); tRow0.appendChild(bLoad);
        c3.appendChild(tRow0);

        /* 系统提示词 */
        c3.appendChild(U.el('label', 'ui-label', '系统提示词（给模型定身份）'));
        var sysTa = U.el('textarea', 'ui-field');
        sysTa.rows = 3;
        sysTa.style.minHeight = '64px';
        sysTa.style.lineHeight = '1.7';
        sysTa.value = S.sysPrompt;
        sysTa.addEventListener('input', function () { S.sysPrompt = sysTa.value; saveUi(); if (previewEl) previewEl.textContent = previewText(); });
        c3.appendChild(sysTa);

        /* 用户提示词 */
        c3.appendChild(U.el('label', 'ui-label', '用户提示词（真正的创作要求）'));
        var userTa = U.el('textarea', 'ui-field');
        userTa.rows = 12;
        userTa.style.minHeight = '230px';
        userTa.style.lineHeight = '1.7';
        userTa.value = S.userPrompt;
        userTa.addEventListener('input', function () { S.userPrompt = userTa.value; saveUi(); if (previewEl) previewEl.textContent = previewText(); });
        c3.appendChild(userTa);

        /* 占位符 */
        var phRow = U.el('div', 'bt-chips');
        PLACEHOLDERS.forEach(function (p) {
          var b = U.el('button', 'bt-chip', p.key);
          b.title = p.desc + '（点一下插到用户提示词末尾）';
          b.type = 'button';
          b.addEventListener('click', function () {
            S.userPrompt = String(S.userPrompt || '') + p.key;
            userTa.value = S.userPrompt;
            saveUi();
            if (previewEl) previewEl.textContent = previewText();
            phone.toast('已插入 ' + p.key, 'ok');
          });
          phRow.appendChild(b);
        });
        c3.appendChild(phRow);
        c3.appendChild(U.el('div', 'ui-muted',
          '占位符：' + PLACEHOLDERS.map(function (p) { return p.key + '＝' + p.desc; }).join('；') +
          '。不想要的占位符直接删掉即可 —— 删了就不会被替换，原样发出去。'));

        /* 最终预览 */
        var previewEl = U.el('pre', 'ui-pre', '');
        function previewText() {
          var p = buildStoryPrompt({ sys: S.sysPrompt, user: S.userPrompt, topic: S.topic, lenKey: S.lenKey });
          return p.system + '\n\n———— 实际发送 ————\n\n' + p.user;
        }
        var det = U.el('details');
        det.style.margin = '10px 0 4px';
        var sum = U.el('summary', null, '预览：现在发出去到底是什么');
        sum.style.fontSize = '12.5px'; sum.style.fontWeight = '700'; sum.style.cursor = 'pointer';
        sum.style.color = '#b6a7c8';
        det.appendChild(sum);
        previewEl.textContent = previewText();
        previewEl.style.marginTop = '8px';
        previewEl.style.maxHeight = '240px';
        previewEl.style.overflow = 'auto';
        det.appendChild(previewEl);
        c3.appendChild(det);

        var tRow = U.el('div', 'ui-row');
        tRow.style.marginTop = '8px'; tRow.style.flexWrap = 'wrap';
        var bSaveT = U.el('button', 'ui-btn ghost', '存成模板');
        bSaveT.style.fontSize = '11.5px'; bSaveT.style.padding = '6px 10px';
        bSaveT.addEventListener('click', function () {
          if (!String(S.userPrompt || '').trim()) return phone.toast('用户提示词是空的，先写点内容', 'bad');
          phone.prompt('模板名字', '我的睡前故事提示词').then(function (name) {
            if (!name) return;
            templates.push({ id: uid(), name: String(name).slice(0, 20), sys: S.sysPrompt, text: S.userPrompt });
            saveTemplates();
            phone.toast('模板已保存', 'ok');
            render();
          });
        });
        var bDelT = U.el('button', 'ui-btn ghost', '删除这个模板');
        bDelT.style.fontSize = '11.5px'; bDelT.style.padding = '6px 10px';
        bDelT.addEventListener('click', function () {
          if (!S.templateId) return phone.toast('先在上面选一个模板', 'bad');
          templates = templates.filter(function (t) { return t.id !== S.templateId; });
          S.templateId = '';
          saveTemplates();
          phone.toast('模板已删除', 'ok');
          render();
        });
        var bResetP = U.el('button', 'ui-btn ghost', '恢复默认提示词');
        bResetP.style.fontSize = '11.5px'; bResetP.style.padding = '6px 10px';
        bResetP.addEventListener('click', function () {
          phone.confirm('恢复默认提示词？', '你现在改过的系统 / 用户提示词会被覆盖，已存成模板的不受影响。').then(function (yes) {
            if (!yes) return;
            resetPrompts();
            S.templateId = '';
            phone.toast('已恢复默认提示词', 'ok');
            render();
          });
        });
        var bFreeze = U.el('button', 'ui-btn ghost', '占位符换成当前内容');
        bFreeze.title = '点一下就把 {{主题}} 这类占位符替换成当前的输入，之后你看到的就是真正发出去的内容';
        bFreeze.style.fontSize = '11.5px'; bFreeze.style.padding = '6px 10px';
        bFreeze.addEventListener('click', function () {
          freezePrompts();
          phone.toast('已替换：现在提示词里就是最终文本了', 'ok');
          render();
        });
        tRow.appendChild(bSaveT); tRow.appendChild(bDelT); tRow.appendChild(bResetP); tRow.appendChild(bFreeze);
        c3.appendChild(tRow);

        var run = U.el('div', 'ui-row');
        run.style.margin = '12px 0 4px'; run.style.flexWrap = 'wrap';
        var bRun = U.el('button', 'ui-btn', S.busy ? '正在创作…' : '✨ 生成文稿');
        bRun.disabled = !!S.busy;
        bRun.addEventListener('click', createScript);
        run.appendChild(bRun);
        if (S.busy) {
          var sp = U.el('div', 'ui-muted');
          sp.innerHTML = '<span class="ui-spin"></span> 已经发给创作接口，长文可能要 1~2 分钟…';
          run.appendChild(sp);
        }
        root.appendChild(run);
        if (S.status) {
          var st = U.el('div', 'ui-muted', S.status);
          st.style.marginTop = '6px';
          root.appendChild(st);
        }
      }

      function renderReadForm() {
        var c = card('把要朗读的文字放进来');
        var ta = U.el('textarea', 'ui-field');
        ta.rows = 8;
        ta.style.minHeight = '170px';
        ta.placeholder = '直接粘贴文章、课文、绘本文字……一句话一行也可以。';
        ta.value = S.rawText;
        ta.addEventListener('input', function () { S.rawText = ta.value; });
        c.appendChild(ta);
        var r = U.el('div', 'ui-row');
        r.style.marginTop = '8px'; r.style.flexWrap = 'wrap';
        var bImp = U.el('button', 'ui-btn ghost', '📂 导入文件');
        bImp.addEventListener('click', function () {
          U.readTextFile().then(function (f) {
            if (!f) return;
            S.rawText = U.cleanImportText(f.name, f.text).slice(0, MAX_CHARS * 2);
            phone.toast('已导入 ' + fmtChars(S.rawText.length), 'ok');
            render();
          });
        });
        var bReader = U.el('button', 'ui-btn ghost', '📚 从阅读器取一篇');
        bReader.addEventListener('click', pickFromReader);
        r.appendChild(bImp); r.appendChild(bReader);
        c.appendChild(r);

        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '12px'; r2.style.flexWrap = 'wrap';
        var len = String(S.rawText || '').length;
        var bGo = U.el('button', 'ui-btn', '下一步：分段并合成');
        bGo.disabled = !len;
        bGo.addEventListener('click', function () {
          if (!String(S.rawText || '').trim()) return phone.toast('先放点文字进来', 'bad');
          var t = S.rawText;
          S.script = cleanScript(t);
          S.title = (S.title && S.fromFav) ? S.title : ('朗读 · ' + new Date().toLocaleDateString());
          S.storyId = null; S.fromFav = false;
          prepParas();
          go('script');
        });
        r2.appendChild(bGo);
        var cnt = U.el('div', 'ui-muted', len ? ('当前 ' + fmtChars(len) + ' · 约 ' + fmtDur(estimateSeconds(len, curSpeed())) + '') : '还没有内容');
        r2.appendChild(cnt);
        c.appendChild(r2);
      }

      function pickFromReader() {
        var books = [];
        try {
          var raw = phone.store('reader').get('books', []);
          if (Object.prototype.toString.call(raw) === '[object Array]') books = raw;
        } catch (e) { books = []; }
        if (!books.length) return phone.alert('阅读器里还没有书', '先去「阅读器」导入一个 txt，再回来这里就能直接取用。');
        var names = books.slice(0, 10).map(function (b, i) {
          return '[' + (i + 1) + '] ' + String(b.name || '未命名') + '（' + fmtChars(String(b.text || '').length) + '）';
        }).join('\n');
        phone.prompt('从阅读器取一篇（输入序号）\n\n' + names, '1').then(function (v) {
          var i = parseInt(v, 10) - 1;
          if (!(i >= 0 && i < books.length && i < 10)) return;
          S.rawText = String(books[i].text || '').slice(0, MAX_CHARS * 2);
          phone.toast('已取入《' + books[i].name + '》', 'ok');
          render();
        });
      }

      /* ---------------- 文稿 ---------------- */
      function prepParas() {
        clearPreloads();
        S.paras = U.splitForTTS(S.script, SEG_CHARS).slice(0, MAX_PARAS);
        S.paraState = S.paras.map(function () { return 0; });
        S.paraErr = S.paras.map(function () { return ''; });
        S.audio = S.paras.map(function () { return ''; });
        S.blob = S.paras.map(function () { return null; });
        S.preload = S.paras.map(function () { return null; });
        S.pending = {};
        S.cur = -1;
        S.directMode = false;
        S.err = '';
      }

      function renderScript() {
        ctx.setTitle('文稿');
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px'; back.style.flexWrap = 'wrap';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回创作台');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { go('studio'); });
        back.appendChild(bBack);
        root.appendChild(back);

        var c = card();
        addField(c, '标题', S.title, function (v) { S.title = v; }, '例如：小刺猬的第一个夜晚');
        var ta = U.el('textarea', 'ui-field');
        ta.rows = 10;
        ta.style.minHeight = '200px';
        ta.style.lineHeight = '1.8';
        ta.value = S.script;
        ta.addEventListener('input', function () {
          S.script = ta.value;
          if (metaEl) metaEl.textContent = metaText();
        });
        var lab = U.el('label', 'ui-label', '正文（可以直接改，改完点「重新分段」）');
        c.appendChild(lab);
        c.appendChild(ta);

        var metaEl = U.el('div', 'ui-muted', '');
        function metaText() {
          return fmtChars(S.script.length) + ' · 预计 ' + fmtDur(estimateSeconds(S.script.length, curSpeed())) +
            ' · 将切成 ' + U.splitForTTS(S.script, SEG_CHARS).length + ' 段朗读';
        }
        metaEl.textContent = metaText();
        metaEl.style.marginTop = '6px';
        c.appendChild(metaEl);

        /* 音色 */
        var voices = phone.tts.voices();
        addSelectRow(c, '音色', voices.map(function (v) { return [v.id, v.name]; }), S.voiceId || phone.tts.defaultVoiceId(),
          function (v) { S.voiceId = v; saveUi(); render(); }, '还没有音色预设',
          function () { view_voices(); });

        var row = U.el('div', 'ui-row');
        row.style.marginTop = '12px'; row.style.flexWrap = 'wrap';
        var bSeg = U.el('button', 'ui-btn ghost', '重新分段');
        bSeg.addEventListener('click', function () {
          S.script = String(S.script || '');
          prepParas();
          phone.toast('已切成 ' + S.paras.length + ' 段', 'ok');
          render();
        });
        var bPlay = U.el('button', 'ui-btn', '🎧 合成并播放');
        bPlay.addEventListener('click', function () {
          if (!String(S.script || '').trim()) return phone.toast('文稿是空的', 'bad');
          S.script = String(S.script);
          prepParas();
          go('player');
          setTimeout(function () { playIndex(0); }, 60);
        });
        var bSave = U.el('button', 'ui-btn ghost', '💾 存入收藏夹');
        bSave.addEventListener('click', function () { saveToFav(); });
        row.appendChild(bSeg); row.appendChild(bPlay); row.appendChild(bSave);
        c.appendChild(row);
        c.appendChild(U.el('div', 'ui-muted',
          '每段大约 ' + SEG_CHARS + ' 字，一段一段合成：第一段出来就能听，后面的会在你听的时候悄悄准备好。'));

        /* 分段预览 */
        var pre = card('分段预览（' + S.paras.length + ' 段）');
        S.paras.slice(0, 8).forEach(function (p, i) {
          pre.appendChild(U.el('div', 'bt-seg', (i + 1) + '. ' + p));
        });
        if (S.paras.length > 8) pre.appendChild(U.el('div', 'ui-muted', '…… 还有 ' + (S.paras.length - 8) + ' 段'));
      }

      function addField(parent, labelText, value, onInput, placeholder) {
        parent.appendChild(U.el('label', 'ui-label', labelText));
        var f = U.el('input', 'ui-field');
        f.type = 'text';
        f.value = value == null ? '' : value;
        if (placeholder) f.placeholder = placeholder;
        f.addEventListener('input', function () { onInput(f.value); });
        parent.appendChild(f);
        return f;
      }
      function addSelectRow(parent, labelText, options, value, onChange, emptyHint, onSetup) {
        parent.appendChild(U.el('label', 'ui-label', labelText));
        var row = U.el('div', 'ui-row');
        if (!options.length) {
          var msg = U.el('div', 'ui-muted', emptyHint || '（没有可选内容）');
          msg.style.flex = '1';
          row.appendChild(msg);
          if (onSetup) {
            var b = U.el('button', 'ui-btn ghost', '去设置');
            b.style.padding = '7px 11px'; b.style.fontSize = '12px';
            b.addEventListener('click', onSetup);
            row.appendChild(b);
          }
        } else {
          var sel = U.el('select', 'ui-field');
          sel.style.flex = '1';
          options.forEach(function (o) {
            var op = U.el('option', null, o[1]);
            op.value = String(o[0]);
            sel.appendChild(op);
          });
          sel.value = String(value || '');
          sel.addEventListener('change', function () { onChange(sel.value); });
          row.appendChild(sel);
        }
        parent.appendChild(row);
        return row;
      }
      function view_voices() {
        phone.toast('正在打开设置 → 音色库');
        phone.closeApp();
        setTimeout(function () { phone.openApp('settings'); }, 120);
      }

      /* ---------------- 播放页 ---------------- */
      function renderPlayer() {
        ctx.setTitle(S.title || '朗读');
        var head = U.el('div', 'bt-head');
        var bBack = U.el('button', 'ui-btn ghost', '‹ 文稿');
        bBack.style.padding = '7px 11px'; bBack.style.fontSize = '12px';
        bBack.addEventListener('click', function () { stopPlayer(); go('script'); });
        head.appendChild(bBack);
        var info = U.el('div', 'ui-muted');
        info.style.flex = '1';
        info.textContent = (S.title || '未命名') + ' · ' + S.paras.length + ' 段 · 约 ' + fmtDur(estimateSeconds(String(S.script || '').length, curSpeed()));
        head.appendChild(info);
        root.appendChild(head);

        statusEl = U.el('div', 'ui-muted');
        root.appendChild(statusEl);

        listEl = U.el('div');
        listEl.style.marginTop = '8px';
        root.appendChild(listEl);
        renderList();

        barEl = U.el('div', 'bt-bar');
        root.appendChild(barEl);
        renderBar();
      }

      function paraStatusText(i) {
        if (S.paraState[i] === 2) return (S.directMode ? '直连' : '✅');
        if (S.paraState[i] === 1) return '合成中…';
        if (S.paraState[i] === 3) return '⚠️ 重试';
        return '待合成';
      }
      function renderList() {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (statusEl) {
          var ready = 0;
          S.paraState.forEach(function (s) { if (s === 2) ready++; });
          statusEl.textContent = '已就绪 ' + ready + ' / ' + S.paras.length + ' 段' +
            (S.directMode ? ' · 直连播放模式（不缓存音频）' : '') +
            (S.cur >= 0 ? ' · 正在第 ' + (S.cur + 1) + ' 段' : '');
        }
        S.paras.forEach(function (p, i) {
          var line = U.el('div', 'bt-line' + (i === S.cur ? ' cur' : '') + (S.paraState[i] === 3 ? ' bad' : ''));
          line.dataset.idx = String(i);
          line.appendChild(U.el('div', 'bt-no', String(i + 1)));
          var tx = U.el('div', 'bt-tx', p);
          line.appendChild(tx);
          line.appendChild(U.el('div', 'bt-st', i === S.cur && S.playing ? '▶ 播放中' : paraStatusText(i)));
          line.addEventListener('click', function () {
            S.cur = i;
            playIndex(i);
          });
          listEl.appendChild(line);
        });
        if (S.cur >= 0 && listEl.children[S.cur] && typeof listEl.children[S.cur].scrollIntoView === 'function') {
          try { listEl.children[S.cur].scrollIntoView({ block: 'nearest' }); } catch (e) { }
        }
      }
      function paintLine(i) {
        if (!listEl || !listEl.children[i]) return renderList();
        var line = listEl.children[i];
        var st = line.children[2];
        if (st) st.textContent = paraStatusText(i);
        if (line.classList) {
          line.classList.toggle('bad', S.paraState[i] === 3);
          line.classList.toggle('cur', i === S.cur);
        }
        if (statusEl) {
          var ready = 0;
          S.paraState.forEach(function (s) { if (s === 2) ready++; });
          statusEl.textContent = '已就绪 ' + ready + ' / ' + S.paras.length + ' 段' +
            (S.directMode ? ' · 直连播放模式（不缓存音频）' : '') +
            (S.cur >= 0 ? ' · 正在第 ' + (S.cur + 1) + ' 段' : '');
        }
      }
      function renderBar() {
        if (!barEl) return;
        barEl.innerHTML = '';
        var now = U.el('div', 'bt-now');
        now.textContent = (S.cur >= 0 ? ('第 ' + (S.cur + 1) + ' / ' + S.paras.length + ' 段') : '还没开始') +
          (S.playing ? ' · 正在朗读' : '') +
          (S.stopMode === 'para' ? ' · 念完这段就停' : (timerEnd ? ' · 定时 ' + Math.max(0, Math.round((timerEnd - Date.now()) / 60000)) + ' 分钟后停' : ''));
        barEl.appendChild(now);

        var r1 = U.el('div', 'ui-row');
        var bPrev = U.el('button', 'ui-btn ghost', '⏮ 上一段');
        bPrev.addEventListener('click', function () { if (S.cur > 0) playIndex(S.cur - 1); });
        var bPlay = U.el('button', 'ui-btn', S.playing ? '⏸ 暂停' : '▶ 播放');
        bPlay.addEventListener('click', function () { togglePlay(); });
        var bNext = U.el('button', 'ui-btn ghost', '⏭ 下一段');
        bNext.addEventListener('click', function () { if (S.cur + 1 < S.paras.length) playIndex(S.cur + 1); });
        var bStop = U.el('button', 'ui-btn ghost', '⏹ 停止');
        bStop.addEventListener('click', function () { stopPlayer(); renderBar(); renderList(); });
        r1.appendChild(bPrev); r1.appendChild(bPlay); r1.appendChild(bNext); r1.appendChild(bStop);
        barEl.appendChild(r1);

        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '7px';
        var bAll = U.el('button', 'ui-btn ghost', S.genDone ? ('合成中… ' + S.genDone) : '⬇ 全部合成');
        bAll.addEventListener('click', function () {
          if (S.genDone) { S.genStop = true; return; }
          synthAll();
        });
        var bAuto = U.el('button', 'ui-btn ghost', S.autoNext ? '连续播放：开' : '连续播放：关');
        bAuto.addEventListener('click', function () { S.autoNext = !S.autoNext; saveUi(); renderBar(); });
        var bTimer = U.el('button', 'ui-btn ghost', '⏱ 定时：' + stopLabel());
        bTimer.addEventListener('click', function () {
          var opts = [['off', '不停止'], ['15', '15 分钟'], ['30', '30 分钟'], ['60', '60 分钟'], ['para', '念完这段就停']];
          var names = opts.map(function (o) { return o[1]; }).join(' / ');
          phone.prompt('多久后自动停止？\n' + names, stopLabel()).then(function (v) {
            if (!v) return;
            var hit = null;
            opts.forEach(function (o) { if (o[1] === String(v).trim() || o[0] === String(v).trim()) hit = o[0]; });
            if (hit === null) return phone.toast('没看懂，输入 15 / 30 / 60 / 念完这段就停 / 不停止', 'bad');
            S.stopMode = hit;
            saveUi();
            if (S.playing) startTimer(); else stopTimer();
            renderBar();
          });
        });
        var bSave = U.el('button', 'ui-btn ghost', '💾 存收藏');
        bSave.addEventListener('click', function () { saveToFav(); });
        var bExp = U.el('button', 'ui-btn ghost', '⬇ 导出音频');
        bExp.addEventListener('click', function () { exportAudio(); });
        r2.appendChild(bAll); r2.appendChild(bAuto); r2.appendChild(bTimer); r2.appendChild(bSave); r2.appendChild(bExp);
        barEl.appendChild(r2);
      }
      function stopLabel() {
        if (S.stopMode === 'para') return '念完这段就停';
        if (S.stopMode === 'off' || !S.stopMode) return '不停止';
        return S.stopMode + ' 分钟';
      }

      /* ---------------- 收藏夹 ---------------- */
      function renderFav() {
        ctx.setTitle('收藏夹');
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px'; back.style.flexWrap = 'wrap';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回创作台');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { go('studio'); });
        back.appendChild(bBack);
        var bExp = U.el('button', 'ui-btn ghost', '导出全部（JSON）');
        bExp.style.padding = '8px 12px'; bExp.style.fontSize = '12.5px';
        bExp.addEventListener('click', function () {
          if (!stories.length) return phone.toast('收藏夹是空的', 'bad');
          U.download('睡前故事收藏-' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify({ schema: 'phoneshell.bedtime/1', exportedAt: Date.now(), stories: stories }, null, 2));
          phone.toast('已导出 ' + stories.length + ' 篇', 'ok');
        });
        back.appendChild(bExp);
        root.appendChild(back);

        var total = stories.reduce(function (n, s) { return n + s.chars; }, 0);
        root.appendChild(U.el('div', 'ui-muted', stories.length
          ? ('共 ' + stories.length + ' 篇 · 约 ' + fmtChars(total) + ' · 合计时长约 ' + fmtDur(stories.reduce(function (n, s) { return n + s.secs; }, 0)))
          : '收藏夹是空的'));

        if (!stories.length) {
          var empty = U.el('div', 'bt-empty');
          empty.appendChild(U.el('div', 'bt-big', '🌙'));
          empty.appendChild(U.el('div', null, '还没有收藏的故事'));
          var e2 = U.el('div', 'ui-muted', '创作或朗读一篇，然后点「存入收藏夹」，就能在这里管理、导出。');
          e2.style.marginTop = '6px';
          empty.appendChild(e2);
          root.appendChild(empty);
          return;
        }

        var ul = U.el('div', 'ui-list');
        ul.style.marginTop = '10px';
        stories.forEach(function (s) {
          var li = U.el('div', 'li');
          li.style.alignItems = 'flex-start';
          var main = U.el('div', 'li-main');
          var b = U.el('b', null, s.title);
          main.appendChild(b);
          main.appendChild(U.el('small', null,
            (s.mode === 'read' ? '长文朗读' : '睡前故事') + ' · ' + new Date(s.added).toLocaleString()));
          main.appendChild(U.el('small', null,
            fmtChars(s.chars) + ' · ' + (s.paras || U.splitForTTS(s.text, SEG_CHARS).length) + ' 段 · 约 ' + fmtDur(s.secs) +
            (s.voiceName ? (' · ' + s.voiceName) : '') + (s.played ? (' · 听过 ' + s.played + ' 次') : '')));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          acts.style.gap = '5px'; acts.style.flexWrap = 'wrap';
          var bPlay = U.el('button', 'ui-btn', '▶');
          bPlay.title = '播放这一篇';
          bPlay.style.padding = '6px 10px'; bPlay.style.fontSize = '11.5px';
          bPlay.addEventListener('click', function () { openStory(s); });
          var bTxt = U.el('button', 'ui-btn ghost', '⬇ TXT');
          bTxt.style.padding = '6px 9px'; bTxt.style.fontSize = '11.5px';
          bTxt.addEventListener('click', function () {
            U.download(safeName(s.title) + '.txt', storyToText(s), 'text/plain');
            phone.toast('已导出文本', 'ok');
          });
          var bJson = U.el('button', 'ui-btn ghost', '⬇ JSON');
          bJson.style.padding = '6px 9px'; bJson.style.fontSize = '11.5px';
          bJson.addEventListener('click', function () {
            U.download(safeName(s.title) + '.json', JSON.stringify(s, null, 2));
            phone.toast('已导出 JSON', 'ok');
          });
          var bDel = U.el('button', 'ui-btn warn', '删');
          bDel.style.padding = '6px 9px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function () {
            phone.confirm('删除《' + s.title + '》？', '只删收藏里的这一篇，不影响别的内容。').then(function (yes) {
              if (!yes) return;
              stories = stories.filter(function (x) { return x.id !== s.id; });
              saveStories();
              phone.toast('已删除', 'ok');
              render();
            });
          });
          acts.appendChild(bPlay); acts.appendChild(bTxt); acts.appendChild(bJson); acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);
        });
        root.appendChild(ul);
        root.appendChild(U.el('div', 'ui-muted',
          '音频不会存进收藏（太大，会撑爆浏览器本地存储）：每次播放时按需现合成。' +
          '想要音频文件，在播放页点「导出音频」逐段保存 wav。'));
      }

      function openStory(s) {
        if (typeof s === 'string') {
          var hit = null;
          stories.forEach(function (x) { if (x.id === s) hit = x; });
          s = hit;
        }
        if (!s) return phone.toast('这篇收藏找不到了', 'bad');
        S.storyId = s.id;
        S.fromFav = true;
        S.title = s.title;
        S.script = s.text;
        S.mode = s.mode;
        if (s.voiceId && phone.tts.voiceGet(s.voiceId)) S.voiceId = s.voiceId;
        prepParas();
        s.played = (s.played || 0) + 1;
        s.at = Date.now();
        saveStories();
        go('player');
        setTimeout(function () { playIndex(0); }, 60);
      }

      function saveToFav() {
        if (!String(S.script || '').trim()) return phone.toast('还没有文稿可以收藏', 'bad');
        var v = curVoice();
        var api = ttsApi();
        var pv = U.splitForTTS(S.script, SEG_CHARS);
        var rec = {
          id: S.storyId || uid(),
          title: S.title || ('睡前故事 · ' + new Date().toLocaleDateString()),
          text: String(S.script).slice(0, MAX_CHARS),
          mode: S.mode,
          topic: S.topic,
          lenKey: S.lenKey,
          promptSys: String(S.sysPrompt || '').slice(0, 1500),
          promptUser: String(S.userPrompt || '').slice(0, 1500),
          voiceId: v ? v.id : '', voiceName: v ? v.name : '',
          ttsName: api ? api.name : '',
          chars: String(S.script).length,
          paras: pv.length,
          secs: estimateSeconds(String(S.script).length, curSpeed()),
          added: Date.now(), at: Date.now(), played: 0
        };
        var hit = false;
        stories = stories.map(function (x) {
          if (x.id !== rec.id) return x;
          hit = true;
          rec.added = x.added;       /* 覆盖保存时保留原始收藏时间 */
          rec.played = x.played || 0;
          return rec;
        });
        if (!hit) {
          if (stories.length >= MAX_STORIES) {
            return phone.alert('收藏夹满了', '最多保存 ' + MAX_STORIES + ' 篇。先删掉几篇不再听的，再收藏新的。');
          }
          stories.unshift(rec);
        }
        S.storyId = rec.id;
        saveStories();
        phone.toast(hit ? '已更新收藏' : '已存入收藏夹（共 ' + stories.length + ' 篇）', 'ok');
        render();
      }

      /* ---------------- 音频导出 ---------------- */
      function exportAudio() {
        var ready = 0;
        S.blob.forEach(function (b) { if (b) ready++; });
        if (!ready) {
          return phone.alert('现在没有可导出的音频', S.directMode
            ? '当前是「直连播放」模式，音频没有存进浏览器，没法导出。\n想要音频文件：把语音接口的「取音频方式」改成「只取回音频数据（fetch）」，并让 GPT-SoVITS 打开跨域，然后重新合成。'
            : '先把段落合成出来（点「全部合成」），再导出音频。');
        }
        var base = safeName(S.title || '睡前故事');
        var api = ttsApi();
        var ext = (api && phone.tts.normalize(api.tts).mediaType) || 'wav';
        if (['wav', 'ogg', 'aac', 'mp3'].indexOf(ext) < 0) ext = 'wav';
        phone.confirm('导出 ' + ready + ' 个音频片段？', '浏览器可能会询问是否允许下载多个文件，选「允许」即可。文件名形如 ' +
          base + '-01.' + ext + '。').then(function (yes) {
          if (!yes) return;
          var n = 0;
          S.blob.forEach(function (b, i) {
            if (!b) return;
            n++;
            setTimeout(function () {
              U.downloadBlob(base + '-' + (i + 1 < 10 ? '0' : '') + (i + 1) + '.' + ext, b);
            }, n * 350);
          });
          phone.toast('开始下载 ' + ready + ' 个片段', 'ok');
        });
      }

      /* ---------------- 创作（调用长文创作接口） ---------------- */
      function createScript() {
        if (S.busy) return;
        var api = writeApi();
        if (!api) {
          phone.alert('还没有长文创作接口', '请到「设置 → API 管理」新增一个「长文创作」接口（DeepSeek / Kimi / 本地 Ollama 都行），' +
            '它专门用来写长篇朗读文稿，和「对话模型」是分开的。');
          return;
        }
        if (!api.baseUrl || !api.model) {
          return phone.alert('接口信息不完整', '接口「' + api.name + '」还缺接口地址或模型名，请到「设置 → API 管理」补全。');
        }
        if (S.mode === 'story' && !String(S.userPrompt || '').trim()) {
          return phone.toast('用户提示词是空的，先在③里写点创作要求', 'bad');
        }
        S.busy = true; S.err = ''; S.status = '正在请求「' + api.name + '」…';
        render();
        var p = buildStoryPrompt({ sys: S.sysPrompt, user: S.userPrompt, topic: S.topic, lenKey: S.lenKey });
        phone.apis.write(api, [
          { role: 'system', content: p.system },
          { role: 'user', content: p.user }
        ], { maxTokens: 4000 }).then(function (text) {
          S.busy = false;
          var clean = cleanScript(text);
          if (!clean) throw new Error('模型返回的内容是空的，换个说法再试一次');
          S.script = clean;
          S.title = suggestTitle(clean, S.topic);
          S.storyId = null; S.fromFav = false;
          S.status = '完成：' + fmtChars(clean.length) + ' · 约 ' + fmtDur(estimateSeconds(clean.length, curSpeed()));
          prepParas();
          go('script');
          phone.toast('文稿写好了，' + S.paras.length + ' 段', 'ok');
        }).catch(function (e) {
          S.busy = false;
          S.err = e && e.message ? e.message : String(e);
          S.status = '生成失败';
          render();
        });
      }
      /** 用主题或第一句当标题 */
      function suggestTitle(text, topic) {
        var t = String(topic || '').trim();
        if (t) return t.replace(/^[，,。.\s]+/, '').slice(0, 18);
        var first = String(text).split(/[。！？\n]/)[0] || '';
        first = first.replace(/^[，,。.\s]+/, '').trim();
        return (first ? first.slice(0, 16) : ('睡前故事 · ' + new Date().toLocaleDateString()));
      }

      /* ---------------- 生命周期 ---------------- */
      ctx.addAction('📚 收藏', function () { stopPlayer(); go('fav'); });
      ctx.addAction('设置', function () { phone.closeApp(); setTimeout(function () { phone.openApp('settings'); }, 120); }, { ghost: true });

      ctx.onCleanup(function () {
        stopPlayer();
        clearPreloads();
        S.genStop = true;
        urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { } });
        urls = [];
        S.pending = {};
      });

      /* 测试把手：纯函数 + 一份可控的局内状态（挂在 mount 上，注册表浅拷贝不会丢） */
      mount.__test = {
        clean: cleanScript,
        num: numToCn,
        prompt: buildStoryPrompt,
        render: renderPrompt,
        estimate: estimateSeconds,
        fmtDur: fmtDur,
        storyToText: storyToText,
        safeName: safeName,
        css: BEDTIME_CSS,
        lengths: function () { return LENGTHS.slice(); },
        placeholders: function () { return PLACEHOLDERS.slice(); },
        defaults: function () { return { sys: PROMPT_SYS_DEFAULT, user: PROMPT_USER_DEFAULT }; },
        controller: function () {
          return {
            state: function () {
              return {
                view: S.view, mode: S.mode, title: S.title, script: S.script,
                paras: S.paras.slice(), paraState: S.paraState.slice(), audio: S.audio.slice(),
                cur: S.cur, playing: S.playing, autoNext: S.autoNext, stopMode: S.stopMode,
                directMode: S.directMode, storyId: S.storyId, busy: S.busy, err: S.err,
                sysPrompt: S.sysPrompt, userPrompt: S.userPrompt, lenKey: S.lenKey, topic: S.topic
              };
            },
            stories: function () { return stories.slice(); },
            templates: function () { return templates.slice(); },
            setTopic: function (t) { S.topic = t; },
            setLen: function (k) { S.lenKey = k; },
            setPrompts: function (sys, user) { if (sys != null) S.sysPrompt = sys; if (user != null) S.userPrompt = user; saveUi(); },
            resetPrompts: resetPrompts,
            freezePrompts: freezePrompts,
            setMode: function (m) { S.mode = m; },
            setScript: function (t) { S.script = t; prepParas(); },
            setTitle: function (t) { S.title = t; },
            setVoice: function (id) { S.voiceId = id; },
            go: go,
            saveToFav: saveToFav,
            openStory: openStory,
            deleteStory: function (id) {
              stories = stories.filter(function (x) { return x.id !== id; });
              saveStories();
            },
            synthOne: synthOne,
            playIndex: playIndex,
            togglePlay: togglePlay,
            stopPlayer: stopPlayer,
            exportAudio: exportAudio,
            saveTemplates: saveTemplates,
            pushTemplate: function (t) { templates.push(t); saveTemplates(); },
            buildPrompt: function () {
              return buildStoryPrompt({ sys: S.sysPrompt, user: S.userPrompt, topic: S.topic, lenKey: S.lenKey });
            },
            ttsOpts: ttsOpts
          };
        }
      };

      render();
    }

    return {
      id: 'bedtime',
      name: '睡前故事',
      icon: 'emoji:🌙',
      desc: 'AI 写故事，本地语音念给你听',
      order: 23,
      color: 'espresso',
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'bedtime', createApp: createApp, code: '' });
})();
