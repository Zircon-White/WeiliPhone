/* ============================================================
   内置应用 · AI 现场创作（OpenAI 兼容接口，独立 API）
   通过文字描述生成一个可安装的应用插件，自动加入手机
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var DEFAULTS = {
    format: 'json',
    timeout: 180
  };

  /* ---------------- 系统提示词：约束 AI 产出可运行插件 ---------------- */
  function buildSystemPrompt() {
    return [
      '你是一个为「PhoneShell 小手机」编写插件（=一个应用/小游戏）的资深前端工程师。',
      'PhoneShell 是一个单文件 HTML 手机模拟器外壳，应用通过插件 API 注册进来。',
      '',
      '【硬性输出格式】',
      '只输出一个 JSON 对象，不要输出任何解释、不要说多余的话、不要用 markdown 代码围栏。',
      'JSON 结构：',
      '{',
      '  "id": "小写字母数字短横线，2-32位，字母开头",',
      '  "name": "应用名，中文优先，不超过8个字",',
      '  "icon": "emoji:🎯 或 svg:grid",',
      '  "desc": "一句话描述，不超过20字",',
      '  "code": "完整可运行的 JS 源码字符串"',
      '}',
      'icon 的 svg 名字只能从这个列表里选：' + phone.icons.list.join(', ') + ' （也可以直接用任意 emoji）。',
      '',
      '【code 字段的写法】',
      'code 必须是这样的源码（注意：字符串里的换行要写成 \\n）：',
      'function createApp(phone){',
      '  return {',
      '    id:"myapp", name:"我的应用", icon:"emoji:🎯", desc:"一句话描述",',
      '    mount: function(phone, root, ctx){',
      '      // root 是应用内容区容器；在这里渲染界面、绑定事件',
      '      // 需要时用 ctx.onCleanup(fn) 注册清理函数（清除计时器/动画帧/事件）',
      '    }',
      '  };',
      '}',
      '',
      '【可用 API】',
      'phone.utils.$ / phone.utils.$$(sel, root) 查元素；phone.utils.el("div","cls","文本") 建元素；phone.utils.esc(s) 转义；phone.utils.md(s) 简易 markdown；phone.utils.download(name, text)。',
      'phone.icons.html("svg:star"|"emoji:🎯", "#fff") 返回图标 HTML；phone.grad(id) 返回一个好看的渐变 CSS。',
      'ctx.store.get(key, 默认值) / ctx.store.set(key, 值) / ctx.store.all()：该应用的永久存档（对象，自动 JSON 化，重启后仍在）。',
      'ctx.setTitle("标题")、ctx.addAction("按钮文字", 回调)、ctx.close()、ctx.useFullBody()（去掉内边距，适合画布游戏）、ctx.onCleanup(fn)、ctx.onKey(handler)（自动在关闭时解绑）。',
      'phone.toast("提示", "ok"|"bad")、phone.alert(title, msg)、phone.confirm(title, msg)->Promise<bool>、phone.prompt(title, 默认值)->Promise<string|null>。',
      'phone.openApp(id)、phone.closeApp()、phone.icons.list、phone.colors。',
      '【重要】如果应用需要调用大模型或联网检索，必须使用外壳统一的接口管理，绝对不要在应用里自己填地址与密钥：',
      '  phone.apis.resolve("chat") 取当前绑定的对话接口（可能为 null）；phone.apis.resolve("search") 取联网检索接口；',
      '  phone.apis.resolve("write", {fallbackChat:false}) 取「长文创作」接口（专门写长文，可能为 null）；phone.apis.resolve("tts") 取「语音合成」接口；',
      '  phone.apis.ask("问题文本", {system:"系统提示词"}) 返回 Promise<string>，是问对话模型最简单的办法；',
      '  phone.apis.chat(api, [{role:"system",content:"..."},{role:"user",content:"..."}]) 返回 Promise<string>；',
      '  phone.apis.write(api, [{role:"user",content:"..."}], {maxTokens:4000}) 返回 Promise<string>（长文创作）；',
      '  phone.apis.search(api, "关键词", {count:3}) 返回 Promise<{items:[{title,url,snippet}]}>。',
      '  要念出声音就用语音接口（本地 GPT-SoVITS）：phone.tts.synth(api, "一段文字") 返回 Promise<{url,blob,bytes}>，然后 new Audio(url).play()；',
      '  也可以 phone.tts.url(api, "一段文字") 拿到直连播放地址（不需要跨域）；长文先用 phone.tts.split(文本, 60) 切成小段再逐段合成。',
      '  取不到接口时要友好提示用户去「设置 → API 管理」配置，不要报错崩掉。',
      '',
      '【界面规范】',
      '可用现成样式类：ui-btn（主按钮）、ui-btn ghost、ui-btn warn、ui-field、ui-label、ui-card、ui-row、ui-list/li/li-main、ui-hint、ui-muted、ui-bar>i（进度条）、ui-pre。',
      '内容区宽约 330~400px，高约 640px，界面要自适应、可滚动；按钮和可点区域不小于 40px。',
      '美术风格：低多边形卡通、圆角、明亮配色、手机手感。可以内联 SVG、CSS 渐变、Canvas 作画。',
      '',
      '【禁止事项】',
      '禁止任何外部网络资源：不能有 fetch/XMLHttpRequest、不能引用外部图片/字体/CDN，美术素材必须用代码画出来（emoji、内联 SVG、CSS、Canvas 均可）。',
      '不要用 ES module 的 import/export，不要用顶层 await，不要用可选链以外的实验语法，目标浏览器是 Chrome/Edge。',
      '不要 require、不要访问 document.cookie。所有状态都走 ctx.store。',
      '',
      '【质量要求】',
      '代码要完整、可直接运行、没有占位符。若做游戏：要有开始/重开逻辑、分数、结束判定，键盘与触摸都要能操作，分数写入 ctx.store。',
      '代码尽量控制在 250 行以内，风格紧凑但可读。',
      '只需要输出 JSON，不要输出 JSON 以外的任何字符。'
    ].join('\n');
  }

  /* ---------------- 交付格式：只要源码（便于用任意模型） ---------------- */
  function buildCodeOnlyPrompt() {
    return [
      '你是为「PhoneShell 小手机」写插件（应用/小游戏）的前端工程师。',
      '只输出一段 JS 源码，不要任何解释，不要 markdown 代码围栏。',
      '源码格式：',
      'function createApp(phone){ return { id:"myapp", name:"名字", icon:"emoji:🎯", desc:"描述", mount:function(phone, root, ctx){ /* 渲染界面 */ } }; }',
      '可用：phone.utils.el/$/$$/esc/md/download、phone.icons.html、phone.grad(id)、ctx.store.get/set/all、ctx.setTitle/addAction/close/useFullBody/onCleanup/onKey、phone.toast/alert/confirm/prompt。',
      '需要大模型或联网检索时用 phone.apis.resolve("chat"/"search"/"write"/"tts") 与 phone.apis.ask(...)/phone.apis.write(...)，不要把接口地址和密钥写进应用里。',
      '要出声就用 phone.tts.synth(api, 文本) 或 phone.tts.url(api, 文本)（本地 GPT-SoVITS），长文先用 phone.tts.split(文本, 60) 切段。',
      '样式类可用：ui-btn、ui-btn ghost、ui-field、ui-label、ui-card、ui-row、ui-list、ui-hint、ui-muted、ui-bar。',
      '禁止一切外部网络与外部素材，美术用 emoji / 内联 SVG / CSS / Canvas 自己画；不要 import/export。',
      '代码必须完整可运行、无占位符，控制在 250 行内。做完立刻开始输出源码，不要前言后语。'
    ].join('\n');
  }

  /* ---------------- 解析模型返回 ---------------- */
  function stripFence(t) {
    var s = String(t || '').trim();
    var m = s.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    if (m) return m[1].trim();
    s = s.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
    return s.trim();
  }
  function extractJson(t) {
    var s = stripFence(t);
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j <= i) throw new Error('模型没有返回 JSON 对象');
    var raw = s.slice(i, j + 1);
    try { return JSON.parse(raw); } catch (e) { }
    /* 容错：模型把换行直接写进了字符串 */
    var fixed = raw.replace(/"((?:[^"\\]|\\.)*)"/g, function (_, body) {
      return '"' + body.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t') + '"';
    });
    try { return JSON.parse(fixed); } catch (e2) { }
    /* 再容错：当成 JS 对象字面量求值 */
    try { return (new Function('return (' + fixed + ')'))(); } catch (e3) { }
    throw new Error('JSON 解析失败：' + e.message);
  }

  function createApp(phone) {
    var U = phone.utils;
    var S = phone.settings;
    var state = { busy: false, result: null, raw: '', err: '', log: [] };

    function cfg(key) {
      var v = S.get('ai.' + key, null);
      return v === null || v === '' ? DEFAULTS[key] : v;
    }
    function setCfg(key, v) { S.set('ai.' + key, v); }

    function mount(phoneApi, root, ctx) {
      var statusEl, outEl, runBtn, descEl, promptEl;

      function pushLog(s) {
        state.log.push(new Date().toLocaleTimeString() + '  ' + s);
        if (state.log.length > 60) state.log.shift();
        var l = U.$('#ai-log', root);
        if (l) l.textContent = state.log.join('\n');
      }

      function render() {
        root.innerHTML = '';
        var frag = document.createDocumentFragment();

        var hint = U.el('div', 'ui-hint');
        hint.innerHTML = '用一句中文描述你想要的应用或小游戏，AI 会现场写出插件源码并直接安装到桌面上。' +
          '接口统一在「设置 → API 管理」里配置与保存（支持 DeepSeek / OpenAI / 通义 / 本地 Ollama 等 OpenAI 兼容接口），本应用不再单独填写地址和密钥。';
        frag.appendChild(hint);

        /* --- 需求描述 --- */
        frag.appendChild(U.el('div', 'ui-label', '① 描述你要的应用'));
        descEl = U.el('textarea', 'ui-field');
        descEl.rows = 3;
        descEl.style.minHeight = '78px';
        descEl.style.resize = 'vertical';
        descEl.placeholder = '例如：一个猜数字小游戏，1~100，提示太大或太小，记录最少猜测次数';
        descEl.value = S.get('ai.lastDesc', '');
        frag.appendChild(descEl);
        var chips = U.el('div', 'ui-row');
        chips.style.flexWrap = 'wrap'; chips.style.marginTop = '8px';
        ['一个打砖块小游戏，难度递增', '一个骰子+随机决策小工具', '一个番茄钟，25分钟倒计时，自动存档',
          '一个翻牌记忆配对游戏', '一个像素画板，能保存作品', '一个每日待办清单，可勾选完成'].forEach(function (t) {
            var c = U.el('button', 'ui-btn ghost', t.length > 12 ? t.slice(0, 12) + '…' : t);
            c.style.fontSize = '11.5px'; c.style.padding = '6px 10px';
            c.title = t;
            c.addEventListener('click', function () { descEl.value = t; S.set('ai.lastDesc', t); });
            chips.appendChild(c);
          });
        frag.appendChild(chips);

        /* --- 使用的接口（统一在「设置 → API 管理」里配置，这里只展示状态） --- */
        var api = phone.apis.resolve('chat');
        var det = U.el('details');
        det.style.margin = '14px 0 4px';
        det.open = !api;
        var sum = U.el('summary', null, '② 使用的接口' + (api ? '（' + api.name + '）' : '（还没有配置）'));
        sum.style.fontSize = '12.5px'; sum.style.fontWeight = '700'; sum.style.cursor = 'pointer';
        sum.style.color = 'var(--ink-soft)';
        det.appendChild(sum);

        var box = U.el('div', 'ui-card');
        box.style.marginTop = '8px';
        if (api) {
          box.appendChild(U.el('div', 'ui-muted',
            '当前使用：<b>' + U.esc(api.name) + '</b><br>' + U.esc(api.baseUrl) + '<br>模型：' + U.esc(api.model || '—')));
          box.appendChild(U.el('div', 'ui-muted',
            '接口由「设置 → API 管理」统一保存，任何应用都不再单独填写地址和密钥；想换接口请去那里改绑定。'));
        } else {
          box.appendChild(U.el('div', 'ui-hint',
            '还没有配置对话接口。请打开「设置 → API 管理」，新增一个 OpenAI 兼容的对话模型（DeepSeek / OpenAI / 通义 / 本地 Ollama 都行）并绑定到「对话模型」，' +
            '然后回到这里就能开始创作了。'));
        }
        var r3 = U.el('div', 'ui-row');
        r3.style.marginTop = '10px'; r3.style.flexWrap = 'wrap';
        var bGo = U.el('button', 'ui-btn', '去「设置 → API 管理」');
        bGo.style.fontSize = '11.5px'; bGo.style.padding = '6px 10px';
        bGo.addEventListener('click', function () { phone.openApp('settings'); });
        r3.appendChild(bGo);
        box.appendChild(r3);

        var r4 = U.el('div', 'ui-row');
        r4.style.marginTop = '10px';
        var lFormat = U.el('div', 'ui-muted', '返回格式：');
        var bFmt = U.el('button', 'ui-btn ghost', cfg('format') === 'json' ? 'JSON + 源码' : '只要源码');
        bFmt.style.fontSize = '11.5px'; bFmt.style.padding = '5px 9px';
        bFmt.addEventListener('click', function () {
          var v = cfg('format') === 'json' ? 'code' : 'json';
          setCfg('format', v);
          bFmt.textContent = v === 'json' ? 'JSON + 源码' : '只要源码';
          pushLog('返回格式切换为 ' + v);
        });
        var bTest = U.el('button', 'ui-btn ghost', '测试接口');
        bTest.style.fontSize = '11.5px'; bTest.style.padding = '5px 9px';
        bTest.addEventListener('click', function () {
          var a = phone.apis.resolve('chat');
          if (!a) return phone.toast('还没有配置对话接口', 'bad');
          phone.toast('正在测试「' + a.name + '」…');
          phone.apis.test(a.id).then(function (msg) { phone.alert('测试通过', msg); })
            .catch(function (e) { phone.alert('测试失败', '```\n' + (e && e.message ? e.message : e) + '\n```'); });
        });
        r4.appendChild(lFormat); r4.appendChild(bFmt); r4.appendChild(bTest);
        box.appendChild(r4);
        det.appendChild(box);
        frag.appendChild(det);

        /* --- 生成 --- */
        var r5 = U.el('div', 'ui-row');
        r5.style.margin = '14px 0 8px';
        runBtn = U.el('button', 'ui-btn', '✨ 开始创作');
        runBtn.addEventListener('click', run);
        var bCancel = U.el('button', 'ui-btn ghost', '清空输出');
        bCancel.addEventListener('click', function () { state.result = null; state.raw = ''; state.err = ''; outEl.innerHTML = ''; });
        r5.appendChild(runBtn); r5.appendChild(bCancel);
        frag.appendChild(r5);

        statusEl = U.el('div', 'ui-muted');
        frag.appendChild(statusEl);
        ctx.setTitle('AI 现场创作');

        outEl = U.el('div');
        outEl.style.marginTop = '12px';
        frag.appendChild(outEl);
        root.appendChild(frag);

        if (state.result) showResult(state.result);
        else if (state.err) showError(state.err, state.raw);
      }

      function showError(msg, raw) {
        outEl.innerHTML = '';
        var d = U.el('div', 'ui-hint');
        d.style.background = 'rgba(255,122,138,.16)';
        d.style.borderColor = 'rgba(255,122,138,.5)';
        d.style.color = '#7a1024';
        d.innerHTML = '<b>出错了：</b>' + U.esc(msg);
        outEl.appendChild(d);
        if (raw) {
          outEl.appendChild(U.el('div', 'ui-label', '模型原始返回（可复制排查）'));
          var pre = U.el('pre', 'ui-pre', String(raw).slice(0, 6000));
          outEl.appendChild(pre);
        }
      }

      function showResult(res) {
        outEl.innerHTML = '';
        var card = U.el('div', 'ui-card');
        var head = U.el('div', 'ui-row');
        var ic = U.el('div', 'app-icon');
        ic.style.background = phone.grad(res.def.id);
        ic.style.width = ic.style.height = '46px';
        ic.style.borderRadius = '14px';
        var g = U.el('span', 'glyph');
        g.innerHTML = phone.icons.html(res.def.icon, '#fff');
        ic.appendChild(g);
        head.appendChild(ic);
        var m = U.el('div', 'li-main');
        m.appendChild(U.el('b', null, res.def.name));
        m.appendChild(U.el('small', null, res.def.desc || '（无描述）'));
        head.appendChild(m);
        card.appendChild(head);

        var acts = U.el('div', 'ui-row');
        acts.style.marginTop = '12px'; acts.style.flexWrap = 'wrap';
        var bInst = U.el('button', 'ui-btn', res.installed ? '重新安装（覆盖）' : '安装到桌面');
        bInst.addEventListener('click', function () {
          try {
            phone.addApp({ id: res.def.id, name: res.def.name, icon: res.def.icon, desc: res.def.desc }, { code: res.code });
            res.installed = true;
            phone.alert('安装成功', '「' + res.def.name + '」已经出现在桌面上了，点图标即可打开。');
            showResult(res);
          } catch (e) {
            phone.alert('安装失败', '```\n' + e.message + '\n```');
          }
        });
        var bRun = U.el('button', 'ui-btn ghost', '立即试玩');
        bRun.addEventListener('click', function () {
          try {
            if (!phone.getApp(res.def.id)) phone.addApp({ id: res.def.id, name: res.def.name, icon: res.def.icon, desc: res.def.desc }, { code: res.code, silent: true });
            phone.openApp(res.def.id);
          } catch (e) { phone.alert('打开失败', '```\n' + e.message + '\n```'); }
        });
        var bNew = U.el('button', 'ui-btn ghost', '换个版本');
        bNew.addEventListener('click', function () { run(); });
        var bCsv = U.el('button', 'ui-btn ghost', '导出');
        bCsv.addEventListener('click', function () {
          U.download(res.def.id + '.phoneapp.json', JSON.stringify({
            schema: 'phoneshell.app/1', id: res.def.id, name: res.def.name,
            icon: res.def.icon, desc: res.def.desc, code: res.code
          }, null, 2));
        });
        acts.appendChild(bInst); acts.appendChild(bRun); acts.appendChild(bNew); acts.appendChild(bCsv);
        card.appendChild(acts);
        outEl.appendChild(card);

        var det = U.el('details');
        det.style.marginTop = '12px';
        var sum = U.el('summary', null, '查看生成的源码（' + res.code.split('\n').length + ' 行）');
        sum.style.fontSize = '12.5px'; sum.style.fontWeight = '700'; sum.style.cursor = 'pointer';
        sum.style.color = 'var(--ink-soft)';
        det.appendChild(sum);
        var ta = U.el('textarea', 'ui-field');
        ta.style.minHeight = '220px';
        ta.style.marginTop = '8px';
        ta.style.fontFamily = 'ui-monospace,Consolas,monospace';
        ta.style.fontSize = '11.5px';
        ta.value = res.code;
        det.appendChild(ta);
        var bRe = U.el('button', 'ui-btn ghost', '用编辑后的源码重新安装');
        bRe.style.marginTop = '8px';
        bRe.addEventListener('click', function () {
          try {
            var probe = phone.compile(ta.value);
            var d2 = probe(phone, U.el('div'), { store: phone.store('probe'), onKey: function () { }, onCleanup: function () { }, setTitle: function () { }, addAction: function () { }, close: function () { } });
            phone.addApp({ id: d2.id, name: d2.name, icon: d2.icon, desc: d2.desc || '' }, { code: ta.value });
            phone.toast('已重新安装', 'ok');
          } catch (e) { phone.alert('源码有误', '```\n' + e.message + '\n```'); }
        });
        det.appendChild(bRe);
        outEl.appendChild(det);

        var det2 = U.el('details');
        det2.style.marginTop = '10px';
        var sum2 = U.el('summary', null, '接口日志');
        sum2.style.fontSize = '12.5px'; sum2.style.cursor = 'pointer'; sum2.style.color = 'var(--ink-soft)';
        det2.appendChild(sum2);
        var pre = U.el('pre', 'ui-pre', state.log.join('\n') || '（暂无）');
        pre.id = 'ai-log';
        pre.style.marginTop = '8px';
        det2.appendChild(pre);
        outEl.appendChild(det2);
      }

      function run() {
        if (state.busy) return;
        var desc = (descEl.value || '').trim();
        if (!desc) return phone.toast('先描述一下你想要什么', 'bad');
        S.set('ai.lastDesc', desc);
        var api = phone.apis.resolve('chat');
        if (!api) {
          phone.alert('还没有配置接口', '请到「设置 → API 管理」新增一个 OpenAI 兼容的对话模型并绑定到「对话模型」。\n' +
            '地址与密钥统一在那里保存，本应用不再单独填写。');
          return;
        }
        if (!api.baseUrl || !api.model) {
          return phone.alert('接口信息不完整', '接口「' + api.name + '」还缺接口地址或模型名，请到「设置 → API 管理」里补全。');
        }
        doFetch(api, desc);
      }

      function doFetch(api, desc) {
        state.busy = true;
        state.err = ''; state.raw = '';
        runBtn.disabled = true;
        runBtn.innerHTML = '<span class="ui-spin"></span> 正在创作…';
        statusEl.textContent = '已通过「' + api.name + '」发送请求，等待模型返回（长代码可能需要 1~3 分钟）…';
        pushLog('POST ' + api.baseUrl + '/chat/completions  model=' + api.model);

        var useJson = cfg('format') === 'json';
        var sys = useJson ? buildSystemPrompt() : buildCodeOnlyPrompt();
        var messages = [
          { role: 'system', content: sys },
          { role: 'user', content: '请创作这个应用：' + desc }
        ];

        phone.apis.chat(api, messages, { json: useJson }).then(function (content) {
          state.raw = content;
          pushLog('收到返回，长度 ' + content.length + ' 字符');
          var res = parseResult(content, useJson, desc);
          state.result = res;
          state.busy = false;
          runBtn.disabled = false;
          runBtn.textContent = '✨ 开始创作';
          statusEl.textContent = '完成：' + res.def.name;
          showResult(res);
        }).catch(function (e) {
          state.busy = false;
          runBtn.disabled = false;
          runBtn.textContent = '✨ 开始创作';
          var m = e && e.message ? e.message : String(e);
          state.err = m;
          statusEl.textContent = '失败';
          pushLog('失败：' + m);
          showError(m, state.raw);
        });
      }

      function parseResult(content, useJson, desc) {
        var def, code;
        if (useJson) {
          var o = extractJson(content);
          def = {
            id: String(o.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || ('ai' + Date.now().toString(36)),
            name: String(o.name || 'AI 应用').slice(0, 20),
            icon: String(o.icon || 'emoji:✨'),
            desc: String(o.desc || desc).slice(0, 40)
          };
          code = String(o.code || '');
          if (!code) throw new Error('返回的 JSON 里没有 code 字段');
        } else {
          code = stripFence(content);
          code = code.replace(/^\s*(```|~~~)[a-zA-Z]*/, '').replace(/(```|~~~)\s*$/, '').trim();
          var idm = code.match(/id\s*:\s*["']([^"']+)["']/);
          var nm = code.match(/name\s*:\s*["']([^"']+)["']/);
          var im = code.match(/icon\s*:\s*["']([^"']+)["']/);
          var dm = code.match(/desc\s*:\s*["']([^"']+)["']/);
          def = {
            id: (idm ? idm[1] : 'ai' + Date.now().toString(36)).toLowerCase().replace(/[^a-z0-9_-]/g, ''),
            name: nm ? nm[1].slice(0, 20) : 'AI 应用',
            icon: im ? im[1] : 'emoji:✨',
            desc: dm ? dm[1].slice(0, 40) : desc
          };
        }
        /* 编译校验：确保能跑起来，失败也仍然展示源码供手工修 */
        try {
          var probe = phone.compile(code);
          var made = probe(phone, U.el('div'), {
            store: phone.store('probe'), onKey: function () { }, onCleanup: function () { },
            setTitle: function () { }, addAction: function () { }, close: function () { }
          });
          def.id = made.id || def.id;
          def.name = made.name || def.name;
          def.icon = made.icon || def.icon;
          def.desc = made.desc || def.desc;
          pushLog('源码校验通过：' + def.id);
        } catch (e) {
          pushLog('源码校验失败：' + e.message);
          phone.toast('生成的源码有语法问题，可在下方手动修正', 'bad');
        }
        return { def: def, code: code, installed: false };
      }

      render();
    }

    return {
      id: 'aigen',
      name: 'AI 创作',
      icon: 'svg:spark',
      desc: '描述需求，AI 现场写新应用',
      order: 81,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'aigen', createApp: createApp, code: '' });
})();
