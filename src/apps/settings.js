/* ============================================================
   内置应用 · 设置
   桌面背景 / 交互与息屏 / API 管理（全机统一）/ 存储备份 / 关于
   ——  所有需要外部接口的应用，都到这里来配置接口，
        应用内部不再单独填写地址与密钥。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  function describeScrim(v) {
    if (v <= 0.06) return '当前：壁纸完全显示，文字靠阴影保证可读。';
    if (v <= 0.3) return '当前：均衡，壁纸清晰且文字舒服（推荐）。';
    if (v <= 0.6) return '当前：壁纸淡淡一层，接近纯色观感。';
    return '当前：壁纸几乎看不见，只剩一点色调。';
  }
  function fmtKB(n) {
    n = Number(n) || 0;
    return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
  }

  function createApp(phone) {
    var U = phone.utils;
    var S = phone.settings;

    function mount(phoneApi, root, ctx) {
      var view = 'main';      /* main | apis | api | voices | voice | boot */
      var editId = null;      /* 正在编辑的接口 id（null = 新建） */
      var draft = null;
      var testMsg = '';
      var keyVisible = false; /* API Key 是否明文显示 */
      var modelList = null;   /* 从 /models 拉到的模型名列表 */
      var modelMsg = '';
      var voiceEditId = null; /* 正在编辑的音色 id */
      var voiceDraft = null;
      var voiceMsg = '';
      var bootDraft = null;   /* GPT-SoVITS 同步启动配置草稿 */
      var bootMsg = '';
      var bootPing = '';
      var audioEl = null;     /* 试听用的播放器 */

      function resetEditState() {
        testMsg = '';
        keyVisible = false;
        modelList = null;
        modelMsg = '';
      }
      function stopPreview() {
        try { if (audioEl) { audioEl.pause(); audioEl = null; } } catch (e) { }
      }
      /* 试听：能取回音频就直接播，取不回（多半是跨域）就退化成直连播放 */
      function playPreview(api, text) {
        stopPreview();
        if (typeof Audio !== 'function') return phone.toast('当前环境不支持播放音频', 'bad');
        var direct = function () {
          var url;
          try { url = phone.tts.url(api, text); } catch (e) { return phone.toast(e.message, 'bad'); }
          audioEl = new Audio(url);
          audioEl.play().catch(function () { phone.toast('播放失败，请检查接口与浏览器音量', 'bad'); });
        };
        var mode = (phone.tts.normalize(api.tts).method) || 'auto';
        if (mode === 'direct') return direct();
        phone.tts.synth(api, text).then(function (r) {
          audioEl = new Audio(r.url);
          audioEl.play().catch(function () { });
        }).catch(function (e) {
          if (mode === 'auto') { phone.toast('取音频失败，改用直连播放', 'bad'); direct(); }
          else phone.alert('试听失败', '```\n' + (e && e.message ? e.message : e) + '\n```');
        });
      }

      /* ---------------- 渲染入口 ---------------- */
      function render() {
        root.innerHTML = '';
        var frag = document.createDocumentFragment();
        if (view === 'apis') renderApiList(frag);
        else if (view === 'api') renderApiEdit(frag);
        else if (view === 'voices') renderVoiceList(frag);
        else if (view === 'voice') renderVoiceEdit(frag);
        else if (view === 'boot') renderBoot(frag);
        else renderMain(frag);
        root.appendChild(frag);
      }

      /* ================= 主页 ================= */
      function renderMain(frag) {
        ctx.setTitle('设置');

        /* ---- 桌面背景 ---- */
        var mode = phone.wallpaper.mode();
        frag.appendChild(U.el('div', 'ui-label', '桌面背景'));
        var modeRow = U.el('div', 'ui-row');
        var bSolid = U.el('button', 'ui-btn' + (mode === 'solid' ? '' : ' ghost'), '纯色');
        var bGrad = U.el('button', 'ui-btn' + (mode === 'wallpaper' ? '' : ' ghost'), '渐变壁纸');
        bSolid.addEventListener('click', function () { phone.wallpaper.setMode('solid'); phone.toast('已切换到纯色背景', 'ok'); render(); });
        bGrad.addEventListener('click', function () { phone.wallpaper.setMode('wallpaper'); phone.toast('已切换到渐变壁纸', 'ok'); render(); });
        modeRow.appendChild(bSolid); modeRow.appendChild(bGrad);
        frag.appendChild(modeRow);
        var modeHint = U.el('div', 'ui-muted', mode === 'solid'
          ? '当前：纯色。打开应用后是完全不透明的浅色背景，壁纸不会透出来。'
          : '当前：渐变壁纸（只在桌面与锁屏可见；应用窗口仍是不透明纯色）。');
        modeHint.style.marginTop = '6px';
        frag.appendChild(modeHint);

        if (mode === 'solid') {
          var snames = phone.wallpaper.solidList();
          var scur = phone.wallpaper.solidIndex();
          frag.appendChild(U.el('div', 'ui-label', '底色配色（' + snames.length + ' 款）'));
          var srow = U.el('div', 'ui-row');
          srow.style.flexWrap = 'wrap';
          snames.forEach(function (name, i) {
            var sw = U.el('button', 'ui-btn ghost');
            sw.style.width = '58px'; sw.style.height = '58px'; sw.style.padding = '0';
            sw.style.borderRadius = '16px';
            sw.style.background = phone.wallpaper.solidCss(i);
            sw.title = name;
            if (Number(scur) === i) { sw.style.outline = '3px solid var(--accent)'; sw.style.outlineOffset = '2px'; }
            sw.addEventListener('click', function () {
              var r = phone.wallpaper.setSolid(i);
              phone.toast('底色已切换：' + r.name, 'ok');
              render();
            });
            srow.appendChild(sw);
          });
          frag.appendChild(srow);
        } else {
          var names = phone.wallpaper.list();
          var curIdx = phone.wallpaper.index();
          frag.appendChild(U.el('div', 'ui-label', '壁纸（低多边形渐变，共 ' + names.length + ' 款）'));
          var row = U.el('div', 'ui-row');
          row.style.flexWrap = 'wrap';
          names.forEach(function (name, i) {
            var sw = U.el('button', 'ui-btn ghost');
            sw.style.width = '58px'; sw.style.height = '58px'; sw.style.padding = '0';
            sw.style.borderRadius = '16px';
            sw.style.background = phone.wallpaper.css(i);
            sw.title = name;
            if (Number(curIdx) === i) { sw.style.outline = '3px solid var(--accent)'; sw.style.outlineOffset = '2px'; }
            sw.addEventListener('click', function () {
              var r = phone.wallpaper.set(i);
              phone.toast('壁纸已切换：' + r.name, 'ok');
              render();
            });
            row.appendChild(sw);
          });
          frag.appendChild(row);

          frag.appendChild(U.el('div', 'ui-label', '壁纸强度（越往左壁纸越明显）'));
          var sc = U.el('input', 'ui-field');
          sc.type = 'range';
          sc.min = '0'; sc.max = '0.8'; sc.step = '0.02';
          sc.value = String(phone.wallpaper.getScrim());
          sc.style.padding = '0';
          sc.style.height = '28px';
          var hintEl = U.el('div', 'ui-muted', describeScrim(phone.wallpaper.getScrim()));
          hintEl.style.marginTop = '4px';
          sc.addEventListener('input', function () {
            phone.wallpaper.setScrim(sc.value);
            hintEl.textContent = describeScrim(Number(sc.value));
          });
          frag.appendChild(sc);
          frag.appendChild(hintEl);
          var pre = U.el('div', 'ui-row');
          pre.style.marginTop = '8px';
          [['最清晰', 0], ['均衡', 0.16], ['淡一点', 0.5]].forEach(function (p) {
            var b = U.el('button', 'ui-btn ghost', p[0]);
            b.style.fontSize = '11.5px'; b.style.padding = '5px 10px';
            b.addEventListener('click', function () {
              phone.wallpaper.setScrim(p[1]); sc.value = String(p[1]);
              hintEl.textContent = describeScrim(p[1]);
            });
            pre.appendChild(b);
          });
          frag.appendChild(pre);
        }

        /* ---- 交互与息屏 ---- */
        frag.appendChild(U.el('div', 'ui-label', '交互与息屏'));
        var card = U.el('div', 'ui-card');
        card.appendChild(toggle('启动时显示锁屏', S.get('skipLock', false) === false, function (on) {
          S.set('skipLock', !on);
          phone.toast(on ? '下次启动会显示锁屏' : '下次启动直接进桌面', 'ok');
        }));

        var idleRow = U.el('div', 'ui-row');
        idleRow.style.marginTop = '12px';
        var idleTxt = U.el('div', null, '闲置息屏');
        idleTxt.style.flex = '1'; idleTxt.style.fontSize = '13.5px'; idleTxt.style.fontWeight = '600';
        idleRow.appendChild(idleTxt);
        var idleSel = U.el('select', 'ui-field');
        idleSel.style.width = '130px';
        [[0, '关闭'], [30, '30 秒'], [60, '1 分钟'], [120, '2 分钟'], [300, '5 分钟'], [600, '10 分钟']].forEach(function (o) {
          var op = U.el('option', null, o[1]);
          op.value = String(o[0]);
          idleSel.appendChild(op);
        });
        idleSel.value = String(phone.idle.seconds());
        idleSel.addEventListener('change', function () {
          var v = phone.idle.setSeconds(idleSel.value);
          phone.toast(v ? ('闲置 ' + v + ' 秒后息屏并显示知识卡') : '已关闭闲置息屏', 'ok');
          render();
        });
        idleRow.appendChild(idleSel);
        card.appendChild(idleRow);
        card.appendChild(U.el('div', 'ui-muted',
          '闲置超过设定时间没有任何操作，屏幕会自动进入息屏状态并显示近期知识卡；' +
          '点左右箭头切换卡片，本组全部读完后才会联网生成下一组。'));

        var tb = U.el('div', 'ui-row');
        tb.style.marginTop = '12px'; tb.style.flexWrap = 'wrap';
        var bPreview = U.el('button', 'ui-btn ghost', '预览息屏');
        bPreview.addEventListener('click', function () { phone.idle.enter(); });
        var bLock = U.el('button', 'ui-btn ghost', '立即锁屏');
        bLock.addEventListener('click', function () { phone.closeApp(); phone.lock(true); });
        var bHome = U.el('button', 'ui-btn ghost', '回到桌面');
        bHome.addEventListener('click', function () { phone.home(); });
        tb.appendChild(bPreview); tb.appendChild(bLock); tb.appendChild(bHome);
        card.appendChild(tb);
        card.appendChild(U.el('div', 'ui-muted', '快捷键：Esc 返回桌面 / 从主屏上滑呼出最近任务 / Alt+H 回桌面。'));
        frag.appendChild(card);

        /* ---- API 管理 ---- */
        frag.appendChild(U.el('div', 'ui-label', 'API 管理（全机统一）'));
        var cardApi = U.el('div', 'ui-card');
        var apis = phone.apis.list();
        var binds = phone.apis.bindings();
        cardApi.appendChild(U.el('div', 'ui-muted',
          '已经保存 ' + apis.length + ' 个接口。AI 创作、阅读器的问答与总结、息屏知识卡都从这里取接口，' +
          '应用内部不再单独填地址和密钥。'));
        var bindInfo = U.el('div', 'ui-muted');
        bindInfo.style.marginTop = '8px';
        bindInfo.innerHTML = phone.apis.purposes().map(function (p) {
          var a = binds[p.key] ? phone.apis.get(binds[p.key]) : null;
          return '· ' + p.label + '：' + (a ? ('<b>' + U.esc(a.name) + '</b>') : '<span style="color:#c05a48">未绑定</span>');
        }).join('<br>');
        cardApi.appendChild(bindInfo);
        var apiRow = U.el('div', 'ui-row');
        apiRow.style.marginTop = '12px'; apiRow.style.flexWrap = 'wrap';
        var bApi = U.el('button', 'ui-btn', '打开 API 管理');
        bApi.addEventListener('click', function () { view = 'apis'; render(); });
        var bAdd = U.el('button', 'ui-btn ghost', '＋ 新增接口');
        bAdd.addEventListener('click', function () { editId = null; draft = blankApi('chat'); resetEditState(); view = 'api'; render(); });
        apiRow.appendChild(bApi); apiRow.appendChild(bAdd);
        cardApi.appendChild(apiRow);

        /* ---- 语音合成（睡前故事用） ---- */
        var ttsApi = phone.apis.resolve('tts');
        var voices = phone.tts.voices();
        var dVoice = phone.tts.voiceGet(phone.tts.defaultVoiceId());
        cardApi.appendChild(U.el('div', 'ui-label', '语音合成（睡前故事朗读）'));
        cardApi.appendChild(U.el('div', 'ui-muted',
          '当前语音接口：' + (ttsApi ? ('<b>' + U.esc(ttsApi.name) + '</b>（' + U.esc(ttsApi.baseUrl) + '）')
            : '<span style="color:#c05a48">未配置</span>') +
          '<br>默认音色：' + (dVoice ? ('<b>' + U.esc(dVoice.name) + '</b> · ' + U.esc(dVoice.refAudio)) : '（还没有音色预设）') +
          '<br>本地 GPT-SoVITS 用法：先跑 <code>python api_v2.py -a 127.0.0.1 -p 9880</code>，再把参考音频路径填进接口或音色预设。'));
        var ttsRow = U.el('div', 'ui-row');
        ttsRow.style.marginTop = '10px'; ttsRow.style.flexWrap = 'wrap';
        var bVoice = U.el('button', 'ui-btn ghost', '🎙 音色库（' + voices.length + '）');
        bVoice.addEventListener('click', function () { view = 'voices'; render(); });
        var bGoStory = U.el('button', 'ui-btn ghost', '打开睡前故事');
        bGoStory.addEventListener('click', function () { phone.openApp('bedtime'); });
        ttsRow.appendChild(bVoice); ttsRow.appendChild(bGoStory);
        cardApi.appendChild(ttsRow);

        /* ---- GPT-SoVITS 同步启动 ---- */
        var gsvCfg = phone.gsv.config();
        cardApi.appendChild(U.el('div', 'ui-label', 'GPT-SoVITS 同步启动'));
        cardApi.appendChild(U.el('div', 'ui-muted',
          '状态：' + (gsvCfg.enabled ? '<b>已开启</b>' : '未开启') +
          ' · 探测 ' + U.esc(gsvCfg.host) + ':' + gsvCfg.port +
          '<br>开启后，把导出的 <code>' + U.esc(phone.gsv.iniName()) + '</code> 放到 phone.html 同一个文件夹里，' +
          '双击「启动小手机.bat」时会先探测 GPT-SoVITS，没在跑就按你填的命令拉起来，等它就绪再打开手机。'));
        var gsvRow = U.el('div', 'ui-row');
        gsvRow.style.marginTop = '10px'; gsvRow.style.flexWrap = 'wrap';
        var bBoot = U.el('button', 'ui-btn ghost', '⚡ 配置同步启动');
        bBoot.addEventListener('click', function () { bootDraft = phone.gsv.config(); bootMsg = ''; bootPing = ''; view = 'boot'; render(); });
        var bPingHome = U.el('button', 'ui-btn ghost', '🔍 检测是否在运行');
        bPingHome.addEventListener('click', function () {
          phone.toast('正在探测 ' + gsvCfg.host + ':' + gsvCfg.port + ' …');
          phone.gsv.ping('http://' + gsvCfg.host + ':' + gsvCfg.port).then(function (r) {
            phone.alert(r.on ? 'GPT-SoVITS 在运行' : '没连上 GPT-SoVITS',
              r.url + '\n\n' + (r.on ? '可以直接用语音合成。' : '先在「配置同步启动」里填好目录与启动命令，导出配置文件放进小手机文件夹，之后双击「启动小手机.bat」就会自动把它拉起来。'));
          });
        });
        gsvRow.appendChild(bBoot); gsvRow.appendChild(bPingHome);
        cardApi.appendChild(gsvRow);

        var kn = phone.knowledge.state();
        cardApi.appendChild(U.el('div', 'ui-muted', '知识卡：本组 ' + kn.cards.length + ' 张，已读 ' + phone.knowledge.readCount() + ' 张' +
          (kn.at ? '（' + new Date(kn.at).toLocaleString() + ' 生成）' : '')));
        if (phone.knowledge.fallback()) {
          var warn = U.el('div', 'ui-hint', '注意：你打开了「用对话模型生成知识卡（不联网）」，没有检索接口时知识卡是模型编的，不算联网。');
          warn.style.marginTop = '8px';
          cardApi.appendChild(warn);
        }
        var kRow = U.el('div', 'ui-row');
        kRow.style.marginTop = '8px'; kRow.style.flexWrap = 'wrap';
        var bKg = U.el('button', 'ui-btn ghost', '立即生成一组知识卡');
        bKg.addEventListener('click', function () {
          phone.toast('开始联网取知识卡…', 'ok');
          phone.knowledge.generate(true).then(function () { render(); });
        });
        var bKc = U.el('button', 'ui-btn ghost', '清空知识卡');
        bKc.addEventListener('click', function () { phone.knowledge.clear(); phone.toast('已清空知识卡', 'ok'); render(); });
        kRow.appendChild(bKg); kRow.appendChild(bKc);
        cardApi.appendChild(kRow);
        frag.appendChild(cardApi);

        /* ---- 存储与备份 ---- */
        frag.appendChild(U.el('div', 'ui-label', '存储与备份'));
        var card2 = U.el('div', 'ui-card');
        var apps = phone.getApps();
        var total = 0;
        apps.forEach(function (a) { total += JSON.stringify(phone.store(a.id).dump()).length; });
        var settingsSize = JSON.stringify(S.all()).length;
        card2.appendChild(U.el('div', 'ui-muted',
          '已安装 ' + apps.length + ' 个应用（' + apps.filter(function (a) { return a.builtin; }).length + ' 个内置，' +
          apps.filter(function (a) { return !a.builtin; }).length + ' 个插件），应用存档约 ' + fmtKB(total) +
          '，设置与接口配置约 ' + fmtKB(settingsSize) + '。'));
        var r2 = U.el('div', 'ui-row');
        r2.style.marginTop = '12px'; r2.style.flexWrap = 'wrap';
        var bExp = U.el('button', 'ui-btn', '导出全部备份');
        bExp.addEventListener('click', function () {
          U.download('phoneshell-backup-' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify(phone.exportAll(), null, 2));
          phone.toast('备份已导出（含接口配置）', 'ok');
        });
        var bImp = U.el('button', 'ui-btn ghost', '导入备份');
        bImp.addEventListener('click', function () {
          U.readFile().then(function (f) {
            if (!f) return;
            try {
              var res = phone.importBundle(f.text);
              phone.alert('导入完成', '成功 ' + res.ok + ' 个' + (res.fail.length ? '，失败 ' + res.fail.length + ' 个' : '') + '。');
              render();
            } catch (e) { phone.alert('导入失败', '```\n' + e.message + '\n```'); }
          });
        });
        var bStore = U.el('button', 'ui-btn ghost', '应用与插件管理');
        bStore.addEventListener('click', function () { phone.openApp('appstore'); });
        r2.appendChild(bExp); r2.appendChild(bImp); r2.appendChild(bStore);
        card2.appendChild(r2);
        frag.appendChild(card2);

        /* ---- 关于 ---- */
        frag.appendChild(U.el('div', 'ui-label', '关于'));
        var card3 = U.el('div', 'ui-card');
        card3.appendChild(U.el('b', null, '小手机 PhoneShell ' + phone.version));
        var p = U.el('div', 'ui-muted');
        p.innerHTML = '单文件运行的手机模拟器外壳：所有图标、壁纸、游戏美术都由代码实时绘制，不依赖任何外部图片或网络资源。<br>' +
          '应用以插件形式存在，可以导入、导出，也可以让 AI 现场写一个再装进来。';
        card3.appendChild(p);
        var bDbg = U.el('button', 'ui-btn ghost', '查看运行环境');
        bDbg.style.marginTop = '10px';
        bDbg.addEventListener('click', function () {
          phone.alert('运行环境', [
            '- 协议：' + location.protocol,
            '- 内核：' + navigator.userAgent,
            '- 本地存储：可用',
            '- 已注册图标：' + phone.icons.list.length + ' 个矢量图标',
            '- 应用数：' + phone.getApps().length,
            '- 已配置接口：' + phone.apis.list().length + ' 个'
          ].join('\n'));
        });
        card3.appendChild(bDbg);
        frag.appendChild(card3);

        var bReset = U.el('button', 'ui-btn warn', '恢复出厂设置');
        bReset.style.margin = '16px 0 4px';
        bReset.addEventListener('click', function () {
          phone.confirm('恢复出厂设置？', '会删除所有插件、全部存档与接口配置，且无法撤销。内置应用不受影响。').then(function (yes) {
            if (!yes) return;
            try {
              Object.keys(localStorage).filter(function (k) { return k.indexOf('phone.') === 0; })
                .forEach(function (k) { localStorage.removeItem(k); });
            } catch (e) { }
            phone.alert('已重置', '正在重新加载…');
            setTimeout(function () { location.reload(); }, 900);
          });
        });
        frag.appendChild(bReset);
        var note = U.el('div', 'ui-muted', '框架版本 ' + phone.version + ' · 单文件 HTML');
        note.style.textAlign = 'center';
        note.style.marginTop = '10px';
        frag.appendChild(note);
      }

      /* ================= API 列表 ================= */
      function renderApiList(frag) {
        ctx.setTitle('API 管理');
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回设置');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { view = 'main'; render(); });
        back.appendChild(bBack);
        var bAdd = U.el('button', 'ui-btn', '＋ 新增接口');
        bAdd.style.padding = '8px 12px'; bAdd.style.fontSize = '12.5px';
        bAdd.addEventListener('click', function () { editId = null; draft = blankApi('chat'); resetEditState(); view = 'api'; render(); });
        back.appendChild(bAdd);
        frag.appendChild(back);

        frag.appendChild(U.el('div', 'ui-hint',
          '接口信息（含密钥）只保存在本机浏览器里，不会上传到任何地方。' +
          '对话模型 / 长文创作都用任意 OpenAI 兼容的 /chat/completions 接口；联网检索支持 Tavily、博查 Bocha、Serper；' +
          '语音合成支持本地 GPT-SoVITS（api_v2.py，默认 9880 端口）与 OpenAI 兼容的 /audio/speech。'));

        /* 用途绑定 */
        var apis = phone.apis.list();
        var binds = phone.apis.bindings();
        frag.appendChild(U.el('div', 'ui-label', '用途绑定'));
        var bindCard = U.el('div', 'ui-card');
        phone.apis.purposes().forEach(function (p) {
          var wantType = phone.apis.purposeType(p.key);
          var row = U.el('div', 'ui-row');
          row.style.marginBottom = '10px';
          var lab = U.el('div', null, p.label);
          lab.style.flex = '1'; lab.style.fontSize = '13px'; lab.style.fontWeight = '700';
          var sel = U.el('select', 'ui-field');
          sel.style.width = '150px';
          var op0 = U.el('option', null, '未绑定');
          op0.value = '';
          sel.appendChild(op0);
          apis.filter(function (a) { return a.type === wantType; }).forEach(function (a) {
            var op = U.el('option', null, a.name);
            op.value = a.id;
            sel.appendChild(op);
          });
          sel.value = binds[p.key] || '';
          sel.addEventListener('change', function () {
            phone.apis.bind(p.key, sel.value || '');
            phone.toast(sel.value ? '已绑定' : '已取消绑定', 'ok');
          });
          row.appendChild(lab); row.appendChild(sel);
          bindCard.appendChild(row);
          var ph = U.el('div', 'ui-muted', p.hint);
          ph.style.marginBottom = '12px';
          bindCard.appendChild(ph);
        });
        /* 音色库入口 */
        var vRow = U.el('div', 'ui-row');
        vRow.style.flexWrap = 'wrap';
        var bVoiceList = U.el('button', 'ui-btn ghost', '🎙 管理音色库（' + phone.tts.voices().length + '）');
        bVoiceList.style.fontSize = '12px'; bVoiceList.style.padding = '7px 11px';
        bVoiceList.addEventListener('click', function () { view = 'voices'; render(); });
        vRow.appendChild(bVoiceList);
        var bGoStory = U.el('button', 'ui-btn ghost', '打开睡前故事');
        bGoStory.style.fontSize = '12px'; bGoStory.style.padding = '7px 11px';
        bGoStory.addEventListener('click', function () { phone.openApp('bedtime'); });
        vRow.appendChild(bGoStory);
        var bBoot2 = U.el('button', 'ui-btn ghost', '⚡ 同步启动 GPT-SoVITS');
        bBoot2.style.fontSize = '12px'; bBoot2.style.padding = '7px 11px';
        bBoot2.addEventListener('click', function () { bootDraft = phone.gsv.config(); bootMsg = ''; bootPing = ''; view = 'boot'; render(); });
        vRow.appendChild(bBoot2);
        bindCard.appendChild(vRow);
        frag.appendChild(bindCard);

        /* 知识卡兜底开关 */
        frag.appendChild(U.el('div', 'ui-label', '知识卡'));
        var kCard = U.el('div', 'ui-card');
        kCard.appendChild(toggle('用对话模型润色知识卡（推荐，摘要更短更顺）', phone.knowledge.polish(), function (on) {
          phone.knowledge.setPolish(on);
          phone.toast(on ? '已开启：知识卡会先交给对话模型改写' : '已关闭：知识卡直接显示检索原文（裁剪后）', 'ok');
        }));
        var polHint = U.el('div', 'ui-muted',
          '开启后，联网取回的原文会交给「对话模型」改写成 20 字标题 + 60~100 字摘要（原材料仍可在卡片里「展开全文」查看）；' +
          '没配对话模型或调用失败时，自动退回裁剪原文。');
        polHint.style.marginBottom = '12px';
        kCard.appendChild(polHint);

        kCard.appendChild(toggle('没有联网检索接口时，用对话模型生成知识卡（不联网）', phone.knowledge.fallback(), function (on) {
          phone.knowledge.setFallback(on);
          phone.toast(on ? '已允许：没有检索接口时用对话模型编知识卡（不联网）' : '已关闭：知识卡只走联网检索接口', 'ok');
        }));
        var fbHint = U.el('div', 'ui-muted',
          '默认关闭。关着的时候，如果没有绑定「联网检索」接口，息屏屏保只会提示你去配置，' +
          '不会拿对话模型凭记忆编内容——避免看起来像联网了其实没有。');
        fbHint.style.marginBottom = '12px';
        kCard.appendChild(fbHint);

        kCard.appendChild(U.el('div', 'ui-muted',
          '已记住 ' + phone.knowledge.seenCount() + ' 张给你看过的卡，换新组时会避开它们（同一批内容不会再糊一遍）。'));
        var kSeenRow = U.el('div', 'ui-row');
        kSeenRow.style.marginTop = '8px';
        var bForget = U.el('button', 'ui-btn ghost', '忘记看过的卡');
        bForget.style.fontSize = '11.5px'; bForget.style.padding = '6px 10px';
        bForget.addEventListener('click', function () {
          phone.knowledge.forgetSeen();
          phone.toast('已清空记录，之后允许再次看到相同内容', 'ok');
          render();
        });
        kSeenRow.appendChild(bForget);
        kCard.appendChild(kSeenRow);
        frag.appendChild(kCard);

        /* 接口清单 */
        frag.appendChild(U.el('div', 'ui-label', '接口清单（' + apis.length + '）'));        if (!apis.length) {
          var empty = U.el('div', 'ui-card');
          empty.appendChild(U.el('b', null, '还没有任何接口'));
          empty.appendChild(U.el('div', 'ui-muted', '点右上角「＋ 新增接口」。绝大多数功能需要一个「对话模型」，' +
            '息屏知识卡还需要一个「联网检索」接口。'));
          frag.appendChild(empty);
          return;
        }
        var ul = U.el('div', 'ui-list');
        apis.forEach(function (a) {
          var li = U.el('div', 'li');
          li.style.cursor = 'pointer';
          li.addEventListener('click', function () { editId = a.id; draft = cloneApi(a); resetEditState(); view = 'api'; render(); });
          var main = U.el('div', 'li-main');
          main.appendChild(U.el('b', null, a.name));
          var info;
          if (a.type === 'search') info = phone.apis.typeLabel(a.type) + ' · ' + (a.provider || 'tavily') + ' · ' + (a.baseUrl || '未填地址');
          else if (a.type === 'tts') {
            var tv = phone.tts.normalize(a.tts);
            info = phone.apis.typeLabel(a.type) + ' · ' + phone.tts.providerLabel(a.provider) + ' · ' + (a.baseUrl || '未填地址') +
              (a.provider === 'openai' ? (' · ' + (a.model || '未填模型')) : (' · 参考音频：' + (tv.refAudio || '未填')));
          } else info = phone.apis.typeLabel(a.type) + ' · ' + (a.model || '未填模型') + ' · ' + (a.baseUrl || '未填地址');
          main.appendChild(U.el('small', null, info));
          main.appendChild(U.el('small', null, a.key ? ('密钥：' + a.key.slice(0, 4) + '****' + a.key.slice(-2)) : '密钥：未填（本地模型可留空）'));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          acts.style.gap = '5px';
          var bT = U.el('button', 'ui-btn ghost', a.type === 'tts' ? '试听' : '测试');
          bT.style.padding = '6px 10px'; bT.style.fontSize = '11.5px';
          bT.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (a.type === 'tts') { phone.toast('正在试听「' + a.name + '」…'); return playPreview(a, '你好，我是小 phone，语音接口已经连通了。'); }
            phone.toast('正在测试「' + a.name + '」…');
            phone.apis.test(a.id).then(function (msg) { phone.alert('测试通过', msg); })
              .catch(function (err) { phone.alert('测试失败', '```\n' + (err && err.message ? err.message : err) + '\n```'); });
          });
          var bDel = U.el('button', 'ui-btn warn', '删');
          bDel.style.padding = '6px 10px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            phone.confirm('删除接口「' + a.name + '」？', '使用了这个接口的应用会提示「还没有配置接口」。').then(function (yes) {
              if (!yes) return;
              phone.apis.remove(a.id);
              phone.toast('已删除', 'ok');
              render();
            });
          });
          acts.appendChild(bT); acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);
        });
        frag.appendChild(ul);
      }

      /* ================= API 编辑 ================= */
      var BLANK_BY_TYPE = {
        chat: { name: '对话模型', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        write: { name: '长文创作', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        search: { name: '联网检索', provider: 'tavily', baseUrl: 'https://api.tavily.com/search', model: '' },
        tts: { name: '本地语音（GPT-SoVITS）', provider: 'gpt-sovits', baseUrl: 'http://127.0.0.1:9880', model: '', voice: '', tts: null }
      };
      function blankApi(type) {
        if (phone.apis.types().indexOf(type) < 0) type = 'chat';
        var b = BLANK_BY_TYPE[type];
        return {
          id: '', name: b.name, type: type, provider: b.provider, baseUrl: b.baseUrl,
          key: '', model: b.model || '', temperature: null, timeout: type === 'tts' ? 180 : 120,
          enableSearch: false, voice: b.voice || '', tts: phone.tts.normalize(b.tts), note: ''
        };
      }
      function cloneApi(a) {
        return {
          id: a.id, name: a.name, type: a.type, provider: a.provider, baseUrl: a.baseUrl,
          key: a.key, model: a.model, temperature: a.temperature, timeout: a.timeout,
          enableSearch: a.enableSearch, voice: a.voice || '', tts: phone.tts.normalize(a.tts), note: a.note
        };
      }
      /** 把当前草稿整理成 phone.apis.save 能吃的记录 */
      function draftRecord() {
        var rec = {
          id: editId || undefined, name: draft.name, type: draft.type, provider: draft.provider,
          baseUrl: draft.baseUrl, key: draft.key, model: draft.model, temperature: draft.temperature,
          timeout: draft.timeout, enableSearch: draft.enableSearch, voice: draft.voice, note: draft.note
        };
        if (draft.type === 'tts') rec.tts = phone.tts.normalize(draft.tts);
        return rec;
      }

      /* 平铺式表单小工具：与原有写法一致（label 与控件直接挂在卡片上） */
      function addText(parent, labelText, value, onInput, placeholder) {
        parent.appendChild(U.el('label', 'ui-label', labelText));
        var f = U.el('input', 'ui-field');
        f.type = 'text'; f.value = value == null ? '' : value;
        if (placeholder) f.placeholder = placeholder;
        f.addEventListener('input', function () { onInput(f.value); });
        parent.appendChild(f);
        return f;
      }
      function addSelect(parent, labelText, options, value, onChange) {
        parent.appendChild(U.el('label', 'ui-label', labelText));
        var s = U.el('select', 'ui-field');
        options.forEach(function (o) {
          var op = U.el('option', null, o[1]);
          op.value = String(o[0]);
          s.appendChild(op);
        });
        s.value = String(value);
        s.addEventListener('change', function () { onChange(s.value); });
        parent.appendChild(s);
        return s;
      }
      function addNumber(parent, labelText, value, onInput, step, min, max) {
        parent.appendChild(U.el('label', 'ui-label', labelText));
        var f = U.el('input', 'ui-field');
        f.type = 'number';
        if (step) f.step = String(step);
        if (min !== undefined) f.min = String(min);
        if (max !== undefined) f.max = String(max);
        f.value = String(value);
        f.addEventListener('input', function () { onInput(Number(f.value)); });
        parent.appendChild(f);
        return f;
      }
      function hint(parent, text, cls) {
        var h = U.el('div', cls || 'ui-muted', text);
        h.style.marginTop = '6px';
        h.style.marginBottom = '4px';
        parent.appendChild(h);
        return h;
      }

      function renderApiEdit(frag) {
        if (!draft) { draft = blankApi('chat'); }
        ctx.setTitle(editId ? '编辑接口' : '新增接口');

        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回列表');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { view = 'apis'; render(); });
        back.appendChild(bBack);
        frag.appendChild(back);

        var isSearch = draft.type === 'search';
        var isTts = draft.type === 'tts';
        var isGsv = isTts && draft.provider !== 'openai';

        /* 类型 */
        frag.appendChild(U.el('div', 'ui-label', '接口类型'));
        var typeRow = U.el('div', 'ui-row');
        typeRow.style.flexWrap = 'wrap';
        [['chat', '对话模型'], ['write', '长文创作'], ['search', '联网检索'], ['tts', '语音合成']].forEach(function (t) {
          var b = U.el('button', 'ui-btn' + (draft.type === t[0] ? '' : ' ghost'), t[1]);
          b.style.padding = '8px 13px'; b.style.fontSize = '12.5px';
          b.addEventListener('click', function () {
            if (draft.type === t[0]) return;
            draft = blankApi(t[0]);
            resetEditState();
            render();
          });
          typeRow.appendChild(b);
        });
        frag.appendChild(typeRow);
        frag.appendChild(U.el('div', 'ui-muted', isTts
          ? '「语音合成」把文稿念成音频。默认按本地 GPT-SoVITS：先启动 python api_v2.py -a 127.0.0.1 -p 9880，再把参考音频路径填上。'
          : (draft.type === 'write'
            ? '「长文创作」专门用来生成长篇朗读文稿（睡前故事等），可以和对话模型分开配置、用不同的长文模型。'
            : '')));

        /* 预设 */
        frag.appendChild(U.el('div', 'ui-label', '快速预设'));
        var preRow = U.el('div', 'ui-row');
        preRow.style.flexWrap = 'wrap';
        phone.apis.presets(draft.type).forEach(function (p) {
          var b = U.el('button', 'ui-btn ghost', p.name);
          b.style.fontSize = '11.5px'; b.style.padding = '5px 10px';
          b.addEventListener('click', function () {
            draft.baseUrl = p.baseUrl;
            if (p.provider) draft.provider = p.provider;
            if (p.model) draft.model = p.model;
            if (p.voice) draft.voice = p.voice;
            /* 语音预设额外带上接口版本等参数 */
            if (p.tts) draft.tts = phone.tts.normalize(Object.assign({}, draft.tts, p.tts));
            if (!editId) draft.name = p.name;
            modelList = null; modelMsg = '';
            render();
          });
          preRow.appendChild(b);
        });
        frag.appendChild(preRow);

        var box = U.el('div', 'ui-card');
        box.style.marginTop = '10px';

        box.appendChild(U.el('label', 'ui-label', '名称（自己认得出就行）'));
        var fName = U.el('input', 'ui-field');
        fName.type = 'text'; fName.value = draft.name;
        fName.placeholder = '例如：DeepSeek 主力';
        fName.addEventListener('input', function () { draft.name = fName.value; });
        box.appendChild(fName);

        box.appendChild(U.el('label', 'ui-label',
          isSearch ? '接口地址（完整的检索接口 URL）'
            : (isTts ? '接口地址（GPT-SoVITS 一般就是 http://127.0.0.1:9880，不要带 /tts）'
              : '接口地址 Base URL（OpenAI 兼容，一般以 /v1 结尾）')));
        var fUrl = U.el('input', 'ui-field');
        fUrl.type = 'text'; fUrl.value = draft.baseUrl;
        fUrl.placeholder = isSearch ? 'https://api.tavily.com/search' : (isTts ? 'http://127.0.0.1:9880' : 'https://api.deepseek.com/v1');
        fUrl.addEventListener('input', function () { draft.baseUrl = fUrl.value; });
        box.appendChild(fUrl);

        if (isSearch) {
          box.appendChild(U.el('label', 'ui-label', '检索服务商'));
          var pSel = U.el('select', 'ui-field');
          [['tavily', 'Tavily'], ['bocha', '博查 Bocha'], ['serper', 'Serper (Google)'], ['openai', 'OpenAI 兼容（模型自带联网）']].forEach(function (o) {
            var op = U.el('option', null, o[1]);
            op.value = o[0];
            pSel.appendChild(op);
          });
          pSel.value = draft.provider || 'tavily';
          pSel.addEventListener('change', function () {
            draft.provider = pSel.value;
            if (pSel.value === 'openai' && !draft.model) { draft.model = 'deepseek-chat'; render(); }
          });
          box.appendChild(pSel);
          box.appendChild(U.el('div', 'ui-muted',
            'Tavily / 博查 / Serper 都是搜索接口，按各自的方式带上密钥；' +
            '选「OpenAI 兼容」则用对话模型自带联网能力来检索（模型不支持联网时会提示来源为模型生成）。'));
        }

        if (isTts) {
          addSelect(box, '语音服务商', phone.tts.providers().map(function (p) { return [p.key, p.label]; }), draft.provider, function (v) {
            draft.provider = v;
            if (v === 'openai' && !draft.model) draft.model = 'tts-1';
            if (v === 'openai' && !draft.voice) draft.voice = 'alloy';
            render();
          });
        }

        box.appendChild(U.el('label', 'ui-label', 'API Key'));
        var keyRow = U.el('div', 'ui-row');
        var fKey = U.el('input', 'ui-field');
        fKey.type = keyVisible ? 'text' : 'password';
        fKey.value = draft.key;
        fKey.style.flex = '1';
        fKey.placeholder = 'sk-...（本地模型可留空）';
        fKey.addEventListener('input', function () { draft.key = fKey.value; });
        var bEye = U.el('button', 'ui-btn ghost', keyVisible ? '🙈 隐藏' : '👁 显示');
        bEye.style.padding = '8px 11px'; bEye.style.fontSize = '12px'; bEye.style.minWidth = '76px';
        bEye.title = '切换密钥的显示 / 隐藏';
        bEye.addEventListener('click', function () {
          keyVisible = !keyVisible;
          fKey.type = keyVisible ? 'text' : 'password';
          bEye.textContent = keyVisible ? '🙈 隐藏' : '👁 显示';
          try { fKey.focus(); } catch (e) { }
        });
        keyRow.appendChild(fKey); keyRow.appendChild(bEye);
        box.appendChild(keyRow);

        if (!isSearch || draft.provider === 'openai') {
          box.appendChild(U.el('label', 'ui-label', '模型名'));
          var mRow = U.el('div', 'ui-row');
          var fModel = U.el('input', 'ui-field');
          fModel.type = 'text'; fModel.value = draft.model;
          fModel.style.flex = '1';
          fModel.placeholder = isTts ? 'tts-1 / gpt-4o-mini-tts …' : 'deepseek-chat / gpt-4o-mini / qwen-plus …';
          fModel.addEventListener('input', function () { draft.model = fModel.value; });
          var bFetch = U.el('button', 'ui-btn ghost', modelList ? '重新拉取' : '拉取列表');
          bFetch.style.padding = '8px 11px'; bFetch.style.fontSize = '12px'; bFetch.style.minWidth = '76px';
          bFetch.title = '调用接口的 GET /models 拉取可用模型，然后从下拉框里选';
          bFetch.addEventListener('click', function () {
            if (!String(draft.baseUrl || '').trim()) return phone.toast('请先填写接口地址', 'bad');
            /* 拉列表也要地址 + 密钥，先把当前草稿存下来 */
            var rec;
            try {
              rec = phone.apis.save(draftRecord(), { allowIncomplete: true });
            } catch (e) { modelMsg = '❌ ' + e.message; return render(); }
            editId = rec.id;
            modelMsg = '正在拉取模型列表…';
            render();
            phone.apis.models(rec.id).then(function (list) {
              modelList = list;
              if (list.indexOf(draft.model) < 0) draft.model = list[0];
              modelMsg = '✅ 拉到 ' + list.length + ' 个模型' + (list.length > 40 ? '（列表很长，下拉框里挑一个）' : '') + '，已在下面列出';
              render();
            }).catch(function (e) {
              modelMsg = '❌ ' + (e && e.message ? e.message : e) + '（也可以直接手填模型名）';
              render();
            });
          });
          mRow.appendChild(fModel); mRow.appendChild(bFetch);
          box.appendChild(mRow);

          if (modelMsg) {
            var mm = U.el('div', modelMsg.indexOf('❌') === 0 ? 'ui-hint' : 'ui-muted', modelMsg);
            mm.style.marginTop = '6px';
            box.appendChild(mm);
          }
          if (modelList && modelList.length) {
            var mSel = U.el('select', 'ui-field');
            mSel.style.marginTop = '8px';
            modelList.forEach(function (name) {
              var op = U.el('option', null, name);
              op.value = name;
              mSel.appendChild(op);
            });
            mSel.value = draft.model;
            mSel.addEventListener('change', function () {
              draft.model = mSel.value;
              phone.toast('已选择模型：' + mSel.value, 'ok');
              render();
            });
            box.appendChild(mSel);
            var cnt = U.el('div', 'ui-muted', '共 ' + modelList.length + ' 个模型可选，选定后记得点下面的「保存」。');
            cnt.style.marginTop = '4px';
            box.appendChild(cnt);
          }
        }

        if (isTts) {
          var tv = phone.tts.normalize(draft.tts);
          draft.tts = tv;
          var voices = phone.tts.voices();

          /* --- 音色（= 参考音频预设）--- */
          box.appendChild(U.el('label', 'ui-label', '音色（参考音频）'));
          if (voices.length) {
            var vRow = U.el('div', 'ui-row');
            var vSel = U.el('select', 'ui-field');
            vSel.style.flex = '1';
            var op0 = U.el('option', null, '（不改动，手动填下面的路径）');
            op0.value = '';
            vSel.appendChild(op0);
            voices.forEach(function (v) {
              var op = U.el('option', null, v.name + ' · ' + v.refAudio);
              op.value = v.id;
              vSel.appendChild(op);
            });
            /* 若当前参考音频正好等于某个音色，直接选中它 */
            voices.forEach(function (v) { if (v.refAudio === tv.refAudio && v.promptText === tv.promptText) vSel.value = v.id; });
            var bUse = U.el('button', 'ui-btn ghost', '套用');
            bUse.style.padding = '8px 11px'; bUse.style.fontSize = '12px';
            bUse.addEventListener('click', function () {
              var v = phone.tts.voiceGet(vSel.value);
              if (!v) return phone.toast('先选一个音色', 'bad');
              draft.tts = phone.tts.normalize(Object.assign({}, draft.tts, {
                refAudio: v.refAudio, promptText: v.promptText, promptLang: v.promptLang,
                textLang: v.textLang, textSplit: v.textSplit, speed: v.speed
              }));
              phone.toast('已套用音色：' + v.name, 'ok');
              render();
            });
            vRow.appendChild(vSel); vRow.appendChild(bUse);
            box.appendChild(vRow);
          } else {
            hint(box, '还没有音色预设。可以点下面的「管理音色库」添加（音色 = 一段参考音频 + 它对应的文本）。');
          }
          var vRow2 = U.el('div', 'ui-row');
          vRow2.style.marginTop = '8px';
          var bVoices = U.el('button', 'ui-btn ghost', '🎙 管理音色库');
          bVoices.style.fontSize = '11.5px'; bVoices.style.padding = '6px 10px';
          bVoices.addEventListener('click', function () { view = 'voices'; render(); });
          vRow2.appendChild(bVoices);
          box.appendChild(vRow2);

          if (isGsv) {
            addText(box, '参考音频路径（GPT-SoVITS 所在机器上的路径）', tv.refAudio, function (v) { draft.tts.refAudio = v; },
              'GPT_SoVITS/pretrained_models/s1/xxx.wav 或 D:\\voices\\ref.wav');
            addText(box, '参考文本（参考音频里说的那句话）', tv.promptText, function (v) { draft.tts.promptText = v; },
              '例如：我是「罗浮」云骑将军景元。');

            var langOpts = phone.tts.langs().map(function (l) { return [l.key, l.label]; });
            var lr = U.el('div', 'ui-row');
            var c1 = U.el('div'); c1.style.flex = '1';
            addSelect(c1, '参考音频语种', langOpts, tv.promptLang, function (v) { draft.tts.promptLang = v; });
            var c2 = U.el('div'); c2.style.flex = '1';
            addSelect(c2, '要合成的语种', langOpts, tv.textLang, function (v) { draft.tts.textLang = v; });
            lr.appendChild(c1); lr.appendChild(c2);
            box.appendChild(lr);

            addSelect(box, '文本切分方式（GPT-SoVITS 内部的切分）',
              phone.tts.splitMethods().map(function (m) { return [m.key, m.label]; }), tv.textSplit,
              function (v) { draft.tts.textSplit = v; });

            var sr = U.el('div', 'ui-row');
            var s1 = U.el('div'); s1.style.flex = '1';
            addNumber(s1, '语速（0.5~2）', tv.speed, function (v) { draft.tts.speed = v; }, 0.05, 0.5, 2);
            var s2 = U.el('div'); s2.style.flex = '1';
            addSelect(s2, '返回格式', [['wav', 'wav（推荐）'], ['ogg', 'ogg'], ['aac', 'aac']], tv.mediaType,
              function (v) { draft.tts.mediaType = v; });
            sr.appendChild(s1); sr.appendChild(s2);
            box.appendChild(sr);

            addSelect(box, '取音频方式', [
              ['auto', '自动：先取回音频，失败就直连播放（推荐）'],
              ['fetch', '只取回音频数据（能缓存、能导出，需要接口开跨域）'],
              ['direct', '只直连播放（不需要跨域，但不能缓存与导出）']
            ], tv.method, function (v) { draft.tts.method = v; });
            hint(box, '本地 GPT-SoVITS 默认没开跨域（CORS），浏览器会拦下「取回音频」的请求；' +
              '这时用「自动」或「直连播放」就能正常出声。');

            addSelect(box, '接口版本', [
              ['v2', 'api_v2.py（推荐，走 /tts）'],
              ['v1', 'api.py 旧版（走根路径 /，参考音频可在启动参数里预设）']
            ], tv.apiVersion, function (v) { draft.tts.apiVersion = v; });

            /* --- 模型（GPT / SoVITS 权重）--- */
            box.appendChild(U.el('div', 'ui-label', '模型切换（GPT / SoVITS 权重）'));
            addText(box, 'GPT 权重路径（可留空，不改）', tv.gptWeights, function (v) { draft.tts.gptWeights = v; },
              'GPT_SoVITS/pretrained_models/s1bert25hz-2kh-longer-epoch=68e-step=50232.ckpt');
            addText(box, 'SoVITS 权重路径（可留空，不改）', tv.sovitsWeights, function (v) { draft.tts.sovitsWeights = v; },
              'GPT_SoVITS/pretrained_models/s2G488k.pth');
            var bW = U.el('button', 'ui-btn ghost', '切换模型');
            bW.style.marginTop = '8px';
            bW.addEventListener('click', function () {
              if (!tv.gptWeights && !tv.sovitsWeights) return phone.toast('先填写要切换的权重路径', 'bad');
              phone.toast('正在切换模型…');
              phone.tts.setWeights(Object.assign({}, draft, { tts: phone.tts.normalize(draft.tts) }), {
                gpt: draft.tts.gptWeights, sovits: draft.tts.sovitsWeights
              }).then(function (r) {
                phone.alert('模型切换结果', r.lines.map(function (x) {
                  return (x.kind === 'gpt' ? 'GPT：' : 'SoVITS：') + (x.ok === false ? '❌ ' : (x.ok === null ? '⚠️ ' : '✅ ')) + x.msg;
                }).join('\n'));
              }).catch(function (e) { phone.alert('切换失败', String(e && e.message ? e.message : e)); });
            });
            box.appendChild(bW);

            /* --- 高级采样参数 --- */
            var det = U.el('details');
            det.style.margin = '10px 0 2px';
            var sum = U.el('summary', null, '高级：采样与流式');
            sum.style.fontSize = '12.5px'; sum.style.fontWeight = '700'; sum.style.cursor = 'pointer';
            sum.style.color = 'var(--ink-soft)';
            det.appendChild(sum);
            var ar = U.el('div', 'ui-row');
            ar.style.flexWrap = 'wrap';
            var g1 = U.el('div'); g1.style.flex = '1';
            addNumber(g1, 'top_k', tv.topK, function (v) { draft.tts.topK = v; }, 1, 1, 100);
            var g2 = U.el('div'); g2.style.flex = '1';
            addNumber(g2, 'top_p', tv.topP, function (v) { draft.tts.topP = v; }, 0.05, 0.05, 1);
            var g3 = U.el('div'); g3.style.flex = '1';
            addNumber(g3, 'temperature', tv.temperature, function (v) { draft.tts.temperature = v; }, 0.05, 0.05, 2);
            ar.appendChild(g1); ar.appendChild(g2); ar.appendChild(g3);
            det.appendChild(ar);
            var br2 = U.el('div', 'ui-row');
            br2.style.marginTop = '8px';
            var g4 = U.el('div'); g4.style.flex = '1';
            addNumber(g4, 'batch_size', tv.batchSize, function (v) { draft.tts.batchSize = v; }, 1, 1, 20);
            br2.appendChild(g4);
            det.appendChild(br2);
            det.appendChild(toggle('流式返回（streaming_mode，长句更快出声）', !!tv.streaming, function (on) {
              draft.tts.streaming = on;
            }));
            box.appendChild(det);
          }

          if (draft.provider === 'openai') {
            addText(box, '音色名 voice（OpenAI 兼容语音用）', draft.voice, function (v) { draft.voice = v; }, 'alloy / echo / fable / onyx / nova / shimmer');
          }

          var ttsTestRow = U.el('div', 'ui-row');
          ttsTestRow.style.marginTop = '10px'; ttsTestRow.style.flexWrap = 'wrap';
          var bPreview = U.el('button', 'ui-btn ghost', '🔊 试听一句');
          bPreview.addEventListener('click', function () {
            var probe = Object.assign({}, draftRecord(), { id: editId || 'preview', type: 'tts' });
            probe.tts = phone.tts.normalize(draft.tts);
            playPreview(probe, '你好，我是小手机，这是我的声音。');
          });
          ttsTestRow.appendChild(bPreview);
          box.appendChild(ttsTestRow);
          hint(box, '提示：一段话越长合成越慢，睡前故事会按句子切成一小段一小段来合成，边生成边播。', 'ui-muted');
        }

        var rowX = U.el('div', 'ui-row');
        rowX.style.marginTop = '10px'; rowX.style.flexWrap = 'wrap';
        if (!isSearch && !isTts) {
          rowX.appendChild(toggle('开启联网搜索（通义 / 智谱等支持 enable_search 的接口）', !!draft.enableSearch, function (on) {
            draft.enableSearch = on;
          }));
        }
        var tRow = U.el('div', 'ui-row');
        tRow.style.marginTop = '10px';
        var tLab = U.el('div', null, '超时（秒）');
        tLab.style.flex = '1'; tLab.style.fontSize = '13px'; tLab.style.fontWeight = '600';
        var fTo = U.el('input', 'ui-field');
        fTo.type = 'number'; fTo.value = String(draft.timeout || 120);
        fTo.style.width = '90px';
        fTo.addEventListener('input', function () { draft.timeout = Number(fTo.value) || 120; });
        tRow.appendChild(tLab); tRow.appendChild(fTo);
        box.appendChild(tRow);
        if (!isSearch && !isTts) box.appendChild(rowX);

        box.appendChild(U.el('label', 'ui-label', '备注（可选）'));
        var fNote = U.el('input', 'ui-field');
        fNote.type = 'text'; fNote.value = draft.note || '';
        fNote.placeholder = '例如：额度用完了要换一个';
        fNote.addEventListener('input', function () { draft.note = fNote.value; });
        box.appendChild(fNote);

        frag.appendChild(box);

        if (testMsg) {
          var tm = U.el('div', 'ui-hint');
          tm.style.marginTop = '10px';
          tm.textContent = testMsg;
          frag.appendChild(tm);
        }

        var acts = U.el('div', 'ui-row');
        acts.style.marginTop = '14px'; acts.style.flexWrap = 'wrap';
        var bSave = U.el('button', 'ui-btn', '保存');
        bSave.addEventListener('click', function () {
          try {
            var rec = phone.apis.save(draftRecord());
            editId = rec.id;
            draft = cloneApi(rec);
            phone.toast('接口已保存', 'ok');
            view = 'apis';
            render();
          } catch (e) { phone.alert('保存失败', e.message); }
        });
        var bTest = U.el('button', 'ui-btn ghost', isTts ? '保存并自检' : '保存并测试');
        bTest.addEventListener('click', function () {
          var rec;
          try {
            rec = phone.apis.save(draftRecord());
          } catch (e) { return phone.alert('保存失败', e.message); }
          editId = rec.id;
          if (isTts) {
            testMsg = '正在合成一句测试语音…';
            render();
            return phone.tts.test(rec).then(function (r) {
              testMsg = '✅ ' + r.msg;
              render();
              if (typeof Audio === 'function' && r.url) { try { audioEl = new Audio(r.url); audioEl.play().catch(function () { }); } catch (e) { } }
            }).catch(function (err) {
              testMsg = '❌ ' + (err && err.message ? err.message : err);
              render();
            });
          }
          testMsg = '正在测试「' + rec.name + '」…';
          render();
          phone.apis.test(rec.id).then(function (msg) {
            testMsg = '✅ ' + msg;
            render();
          }).catch(function (err) {
            testMsg = '❌ ' + (err && err.message ? err.message : err);
            render();
          });
        });
        acts.appendChild(bSave); acts.appendChild(bTest);
        if (editId) {
          var bDel = U.el('button', 'ui-btn warn', '删除这个接口');
          bDel.addEventListener('click', function () {
            phone.confirm('删除接口？', '删除后用到它的应用会提示未配置。').then(function (yes) {
              if (!yes) return;
              phone.apis.remove(editId);
              phone.toast('已删除', 'ok');
              editId = null; draft = null; view = 'apis';
              render();
            });
          });
          acts.appendChild(bDel);
        }
        frag.appendChild(acts);
      }

      /* ================= 音色库（参考音频预设） ================= */
      function blankVoice() {
        var tv = phone.tts.normalize(null);
        return {
          id: '', name: '', refAudio: '', promptText: '',
          promptLang: tv.promptLang, textLang: tv.textLang, textSplit: tv.textSplit, speed: tv.speed, note: ''
        };
      }
      function renderVoiceList(frag) {
        ctx.setTitle('音色库');
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回 API 管理');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { view = 'apis'; render(); });
        var bAdd = U.el('button', 'ui-btn', '＋ 新增音色');
        bAdd.style.padding = '8px 12px'; bAdd.style.fontSize = '12.5px';
        bAdd.addEventListener('click', function () { voiceEditId = null; voiceDraft = blankVoice(); voiceMsg = ''; view = 'voice'; render(); });
        back.appendChild(bBack); back.appendChild(bAdd);
        frag.appendChild(back);

        frag.appendChild(U.el('div', 'ui-hint',
          '「音色」就是 GPT-SoVITS 的一段参考音频（含它对应的文本）。睡前故事应用会在这里挑音色来朗读。' +
          '参考音频路径是 **GPT-SoVITS 那台机器上的路径**，不是本机的，所以要填服务端能读到的路径。'));

        if (voiceMsg) {
          var vm = U.el('div', 'ui-muted', voiceMsg);
          vm.style.margin = '8px 0';
          frag.appendChild(vm);
        }

        var voices = phone.tts.voices();
        var defId = phone.tts.defaultVoiceId();
        frag.appendChild(U.el('div', 'ui-label', '音色清单（' + voices.length + '）'));
        if (!voices.length) {
          var empty = U.el('div', 'ui-card');
          empty.appendChild(U.el('b', null, '还没有音色'));
          empty.appendChild(U.el('div', 'ui-muted', '点右上角「＋ 新增音色」，填上参考音频路径与参考文本即可。'));
          frag.appendChild(empty);
          return;
        }
        var ul = U.el('div', 'ui-list');
        voices.forEach(function (v) {
          var li = U.el('div', 'li');
          li.style.cursor = 'pointer';
          li.addEventListener('click', function () { voiceEditId = v.id; voiceDraft = Object.assign({}, v); voiceMsg = ''; view = 'voice'; render(); });
          var main = U.el('div', 'li-main');
          main.appendChild(U.el('b', null, v.name + (v.id === defId ? ' · 默认' : '')));
          main.appendChild(U.el('small', null, v.refAudio));
          main.appendChild(U.el('small', null, '参考文本：' + (v.promptText ? v.promptText.slice(0, 30) : '（空）') +
            ' · ' + v.promptLang + '→' + v.textLang + ' · 语速 ' + v.speed));
          li.appendChild(main);

          var acts = U.el('div', 'ui-row');
          acts.style.gap = '5px';
          var bDef = U.el('button', 'ui-btn ghost', v.id === defId ? '已设为默认' : '设为默认');
          bDef.style.padding = '6px 10px'; bDef.style.fontSize = '11.5px';
          bDef.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            phone.tts.setDefaultVoice(v.id);
            phone.toast('默认音色：' + v.name, 'ok');
            render();
          });
          var bInto = U.el('button', 'ui-btn ghost', '写进接口');
          bInto.style.padding = '6px 10px'; bInto.style.fontSize = '11.5px';
          bInto.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            var ttsApi = phone.apis.resolve('tts');
            if (!ttsApi) return phone.toast('还没有语音合成接口，先去新增一个', 'bad');
            phone.apis.save(Object.assign({}, ttsApi, {
              tts: Object.assign({}, ttsApi.tts, {
                refAudio: v.refAudio, promptText: v.promptText, promptLang: v.promptLang,
                textLang: v.textLang, textSplit: v.textSplit, speed: v.speed
              })
            }));
            phone.toast('已把「' + v.name + '」写进语音接口「' + ttsApi.name + '」', 'ok');
            render();
          });
          var bDel = U.el('button', 'ui-btn warn', '删');
          bDel.style.padding = '6px 10px'; bDel.style.fontSize = '11.5px';
          bDel.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            phone.confirm('删除音色「' + v.name + '」？', '已经在用它的故事不受影响，但下次朗读要重新选音色。').then(function (yes) {
              if (!yes) return;
              phone.tts.voiceRemove(v.id);
              phone.toast('已删除', 'ok');
              render();
            });
          });
          acts.appendChild(bDef); acts.appendChild(bInto); acts.appendChild(bDel);
          li.appendChild(acts);
          ul.appendChild(li);
        });
        frag.appendChild(ul);
        frag.appendChild(U.el('div', 'ui-muted', '提示：GPT-SoVITS 换 GPT / SoVITS 权重（换「模型」）在具体语音接口的编辑页里，' +
          '因为权重是服务端全局的，不属于某个音色。'));
      }

      function renderVoiceEdit(frag) {
        if (!voiceDraft) voiceDraft = blankVoice();
        ctx.setTitle(voiceEditId ? '编辑音色' : '新增音色');
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回音色库');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { view = 'voices'; render(); });
        back.appendChild(bBack);
        frag.appendChild(back);

        var box = U.el('div', 'ui-card');
        addText(box, '音色名字', voiceDraft.name, function (v) { voiceDraft.name = v; }, '例如：温柔的妈妈 / 低沉大叔 / 小圆');
        addText(box, '参考音频路径（服务端路径）', voiceDraft.refAudio, function (v) { voiceDraft.refAudio = v; },
          'GPT_SoVITS/pretrained_models/xxx.wav 或 D:\\voices\\ref.wav');
        var ta = U.el('textarea', 'ui-field');
        ta.rows = 2;
        ta.style.minHeight = '60px';
        ta.placeholder = '参考音频里说的那句话（要和音频完全一致，GPT-SoVITS 靠它对齐音色）';
        ta.value = voiceDraft.promptText;
        ta.addEventListener('input', function () { voiceDraft.promptText = ta.value; });
        box.appendChild(U.el('label', 'ui-label', '参考文本'));
        box.appendChild(ta);
        var langOpts = phone.tts.langs().map(function (l) { return [l.key, l.label]; });
        var lr = U.el('div', 'ui-row');
        var c1 = U.el('div'); c1.style.flex = '1';
        addSelect(c1, '参考音频语种', langOpts, voiceDraft.promptLang, function (v) { voiceDraft.promptLang = v; });
        var c2 = U.el('div'); c2.style.flex = '1';
        addSelect(c2, '默认朗读语种', langOpts, voiceDraft.textLang, function (v) { voiceDraft.textLang = v; });
        lr.appendChild(c1); lr.appendChild(c2);
        box.appendChild(lr);
        var sr = U.el('div', 'ui-row');
        var s1 = U.el('div'); s1.style.flex = '1';
        addNumber(s1, '语速（0.5~2）', voiceDraft.speed, function (v) { voiceDraft.speed = v; }, 0.05, 0.5, 2);
        var s2 = U.el('div'); s2.style.flex = '1';
        addSelect(s2, '文本切分方式', phone.tts.splitMethods().map(function (m) { return [m.key, m.label]; }),
          voiceDraft.textSplit, function (v) { voiceDraft.textSplit = v; });
        sr.appendChild(s1); sr.appendChild(s2);
        box.appendChild(sr);
        addText(box, '备注（可选）', voiceDraft.note, function (v) { voiceDraft.note = v; }, '例如：适合讲童话');
        frag.appendChild(box);

        var acts = U.el('div', 'ui-row');
        acts.style.marginTop = '14px'; acts.style.flexWrap = 'wrap';
        var bSave = U.el('button', 'ui-btn', '保存音色');
        bSave.addEventListener('click', function () {
          try {
            var rec = phone.tts.voiceSave(Object.assign({}, voiceDraft, { id: voiceEditId || undefined }));
            if (!phone.tts.defaultVoiceId()) phone.tts.setDefaultVoice(rec.id);
            phone.toast('音色已保存', 'ok');
            view = 'voices';
            render();
          } catch (e) { phone.alert('保存失败', e.message); }
        });
        var bSave2 = U.el('button', 'ui-btn ghost', '保存并设为默认');
        bSave2.addEventListener('click', function () {
          try {
            var rec = phone.tts.voiceSave(Object.assign({}, voiceDraft, { id: voiceEditId || undefined }));
            phone.tts.setDefaultVoice(rec.id);
            phone.toast('已保存并设为默认音色', 'ok');
            view = 'voices';
            render();
          } catch (e) { phone.alert('保存失败', e.message); }
        });
        acts.appendChild(bSave); acts.appendChild(bSave2);
        if (voiceEditId) {
          var bDel = U.el('button', 'ui-btn warn', '删除音色');
          bDel.addEventListener('click', function () {
            phone.confirm('删除这个音色？', '删除后可以在音色库里重新添加。').then(function (yes) {
              if (!yes) return;
              phone.tts.voiceRemove(voiceEditId);
              voiceEditId = null; voiceDraft = null; view = 'voices';
              phone.toast('已删除', 'ok');
              render();
            });
          });
          acts.appendChild(bDel);
        }
        frag.appendChild(acts);
        frag.appendChild(U.el('div', 'ui-muted',
          '参考音频建议 3~10 秒、干净无背景音。为了最好的效果，参考文本要和音频里说的一字不差。'));
      }

      /* ================= GPT-SoVITS 同步启动 ================= */
      function renderBoot(frag) {
        ctx.setTitle('同步启动');
        if (!bootDraft) bootDraft = phone.gsv.config();
        var back = U.el('div', 'ui-row');
        back.style.marginBottom = '10px'; back.style.flexWrap = 'wrap';
        var bBack = U.el('button', 'ui-btn ghost', '‹ 返回');
        bBack.style.padding = '8px 12px'; bBack.style.fontSize = '12.5px';
        bBack.addEventListener('click', function () { view = 'apis'; render(); });
        back.appendChild(bBack);
        var bSave = U.el('button', 'ui-btn', '保存设置');
        bSave.style.padding = '8px 12px'; bSave.style.fontSize = '12.5px';
        bSave.addEventListener('click', function () {
          bootDraft = phone.gsv.save(bootDraft);
          bootMsg = '✅ 设置已保存';
          phone.toast('同步启动设置已保存', 'ok');
          render();
        });
        back.appendChild(bSave);
        frag.appendChild(back);

        frag.appendChild(U.el('div', 'ui-hint',
          '浏览器不能直接启动本机程序，所以「开机顺便拉起 GPT-SoVITS」这件事由启动器脚本完成：' +
          '在这里填好目录与启动命令 → 点「导出配置文件」→ 把下载到的 ' + phone.gsv.iniName() +
          ' 放进 phone.html 同一个文件夹（和「启动小手机.bat」放一起）→ 以后双击启动器，它会先探测、没在跑就拉起来，等它就绪再打开手机。'));

        var box = U.el('div', 'ui-card');
        box.style.marginTop = '10px';

        box.appendChild(toggle('打开手机时同步启动 GPT-SoVITS', !!bootDraft.enabled, function (on) {
          bootDraft.enabled = on;
          bootDraft = phone.gsv.save(bootDraft);
          phone.toast(on ? '已开启：启动器会顺便拉起 GPT-SoVITS' : '已关闭：启动器只打开手机', 'ok');
        }));
        var h0 = U.el('div', 'ui-muted', '关着的时候启动器什么都不做，和以前一样只打开 phone.html。');
        h0.style.marginBottom = '10px';
        box.appendChild(h0);

        /* 探测地址 */
        addSelect(box, '探测哪个地址（也就是语音接口的地址）', [
          ['127.0.0.1', '127.0.0.1（本机，推荐）'],
          ['localhost', 'localhost'],
          ['0.0.0.0', '0.0.0.0（注意：探测用 127.0.0.1 更靠谱）']
        ], bootDraft.host, function (v) {
          bootDraft.host = v;
          bootDraft = phone.gsv.save(bootDraft);
          render();
        });
        addNumber(box, '端口', bootDraft.port, function (v) { bootDraft.port = Number(v) || 9880; }, 1, 1, 65535);
        var rFrom = U.el('div', 'ui-row');
        rFrom.style.flexWrap = 'wrap';
        var bFrom = U.el('button', 'ui-btn ghost', '从当前语音接口读取主机与端口');
        bFrom.style.fontSize = '11.5px'; bFrom.style.padding = '6px 10px';
        bFrom.addEventListener('click', function () {
          var a = phone.apis.resolve('tts');
          if (!a || !a.baseUrl) return phone.toast('还没有配置语音接口地址', 'bad');
          var g = phone.gsv.fromUrl(a.baseUrl);
          if (!g) return phone.toast('这个地址解析不出主机和端口', 'bad');
          bootDraft.host = g.host;
          bootDraft.port = g.port;
          bootDraft = phone.gsv.save(bootDraft);
          phone.toast('已读取：' + g.host + ':' + g.port, 'ok');
          render();
        });
        rFrom.appendChild(bFrom);
        box.appendChild(rFrom);

        /* 工作目录 + 启动命令 */
        addText(box, 'GPT-SoVITS 目录（启动命令会在这个目录里跑）', bootDraft.workdir, function (v) { bootDraft.workdir = v; },
          '例如：E:\\GPT-SoVITS 或 D:\\AI\\GPT-SoVITS-v2');
        addText(box, '启动命令', bootDraft.command, function (v) { bootDraft.command = v; },
          '例如：python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml');
        var pre = U.el('div', 'ui-row');
        pre.style.flexWrap = 'wrap'; pre.style.marginTop = '6px';
        phone.gsv.commands().forEach(function (c) {
          var b = U.el('button', 'ui-btn ghost', c.name);
          b.style.fontSize = '11.5px'; b.style.padding = '5px 10px';
          b.title = c.cmd;
          b.addEventListener('click', function () {
            bootDraft.command = c.cmd;
            bootDraft = phone.gsv.save(bootDraft);
            phone.toast('已套用：' + c.name, 'ok');
            render();
          });
          pre.appendChild(b);
        });
        box.appendChild(pre);
        hint(box, '整合包通常用 runtime\\python.exe 或 go-webui.bat；命令里不要带 & | < > 这些符号，' +
          '否则批处理会解析错。工作目录留空就在小手机文件夹里执行命令。');

        /* 等待与超时 */
        var wr = U.el('div', 'ui-row');
        var w1 = U.el('div'); w1.style.flex = '1';
        addNumber(w1, '最多等多少秒', bootDraft.wait, function (v) { bootDraft.wait = Number(v) || 90; }, 5, 10, 600);
        var w2 = U.el('div'); w2.style.flex = '1';
        addSelect(w2, '等超时了怎么办', [['open', '照样打开手机（推荐）'], ['stop', '先别开，让我看看日志']],
          bootDraft.onFail, function (v) { bootDraft.onFail = v; bootDraft = phone.gsv.save(bootDraft); });
        wr.appendChild(w1); wr.appendChild(w2);
        box.appendChild(wr);
        hint(box, 'GPT-SoVITS 首次加载模型可能要几十秒到几分钟，等不及就先把「最多等多少秒」调大。');

        frag.appendChild(box);

        /* 导出 */
        var act = U.el('div', 'ui-row');
        act.style.marginTop = '12px'; act.style.flexWrap = 'wrap';
        var bIni = U.el('button', 'ui-btn', '⬇ 导出配置文件（' + phone.gsv.iniName() + '）');
        bIni.addEventListener('click', function () {
          bootDraft = phone.gsv.save(bootDraft);
          U.download(phone.gsv.iniName(), phone.gsv.ini(bootDraft), 'text/plain');
          bootMsg = '✅ 已导出 ' + phone.gsv.iniName() + '，把它放到 phone.html 同一个文件夹里就行。';
          render();
        });
        var bCopy = U.el('button', 'ui-btn ghost', '复制配置内容');
        bCopy.addEventListener('click', function () {
          U.copy(phone.gsv.ini(bootDraft)).then(function (ok) {
            phone.toast(ok ? '配置已复制' : '复制失败，可以直接导出文件', ok ? 'ok' : 'bad');
          });
        });
        var bPing = U.el('button', 'ui-btn ghost', '🔍 检测现在是否在运行');
        bPing.addEventListener('click', function () {
          bootPing = '检测中…';
          render();
          phone.gsv.ping('http://' + bootDraft.host + ':' + bootDraft.port).then(function (r) {
            bootPing = r.on ? ('✅ 在运行：' + r.url) : ('❌ 没连上：' + r.url);
            render();
          });
        });
        act.appendChild(bIni); act.appendChild(bCopy); act.appendChild(bPing);
        frag.appendChild(act);

        if (bootPing) {
          var bp = U.el('div', 'ui-muted', bootPing);
          bp.style.marginTop = '8px';
          frag.appendChild(bp);
        }
        if (bootMsg) {
          var bm = U.el('div', 'ui-hint', bootMsg);
          bm.style.marginTop = '8px';
          frag.appendChild(bm);
        }

        var how = U.el('div', 'ui-card');
        how.style.marginTop = '12px';
        how.appendChild(U.el('b', null, '启动器会做什么'));
        var ol = U.el('div', 'ui-muted');
        ol.innerHTML = '1. 读小手机文件夹里的 <code>' + U.esc(phone.gsv.iniName()) + '</code>（没有就跳过这一步）；<br>' +
          '2. 探测 <b>' + U.esc(bootDraft.host) + ':' + bootDraft.port + '</b> —— 已经在跑就不重复启动；<br>' +
          '3. 没在跑，就在工作目录里执行启动命令（新开一个窗口，日志看得见）；<br>' +
          '4. 最多等 ' + bootDraft.wait + ' 秒，端口一通就继续，' +
          (bootDraft.onFail === 'stop' ? '超时则停下来，让你先看日志。' : '超时也照样打开手机（语音可能会失败，可以稍后重试）。') +
          '<br><br>顺带一提：<code>' + U.esc(phone.gsv.launcher()) + '</code> 也可以单独双击，用来手动拉起 GPT-SoVITS。';
        how.appendChild(ol);
        frag.appendChild(how);
        frag.appendChild(U.el('div', 'ui-muted',
          '改完这里的设置后记得再点一次「导出配置文件」并覆盖文件夹里的旧文件 —— 启动器读的是那个文件，不是浏览器里的存档。'));
      }

      function toggle(label, on, onChange) {
        var wrap = U.el('div', 'ui-row');
        var t = U.el('div', null, label);
        t.style.flex = '1'; t.style.fontSize = '13px'; t.style.fontWeight = '600';
        var sw = U.el('button', 'ui-btn' + (on ? '' : ' ghost'));
        sw.style.minWidth = '72px';
        sw.textContent = on ? '已开启' : '已关闭';
        sw.addEventListener('click', function () {
          on = !on;
          sw.className = 'ui-btn' + (on ? '' : ' ghost');
          sw.textContent = on ? '已开启' : '已关闭';
          onChange && onChange(on);
        });
        wrap.appendChild(t); wrap.appendChild(sw);
        return wrap;
      }

      render();

      /* 关闭设置页时把试听的播放器停掉，免得音频还在响 */
      ctx.onCleanup(function () { stopPreview(); });
    }

    return {
      id: 'settings',
      name: '设置',
      icon: 'svg:gear',
      desc: '壁纸、息屏、API 管理、备份与关于',
      order: 82,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'settings', createApp: createApp, code: '' });
})();
