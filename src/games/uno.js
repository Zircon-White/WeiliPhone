/* ============================================================
   内置游戏 · UNO（纯代码绘制的卡牌，3 个 AI 对手，不调用任何接口）
   ------------------------------------------------------------------
   规则：标准 UNO —— 出与牌堆顶同色或同数字/同功能的牌；
         万能牌（变色 / 变色+4）随时可出；+2 与 +4 会让下家摸牌并跳过；
         反转、禁止同理；手里只剩 1 张要喊 UNO，被抓到罚摸 2 张。
   特色：AI 会在各种局面下「概率」冒表情气泡（被罚摸会哭、成功打出 +2 会得意……），
         同一局面触发时也可能什么都不发，不是必然触发。
   ============================================================ */
(function () {
  'use strict';
  if (!window.PHONE_BUILTIN_APPS) window.PHONE_BUILTIN_APPS = [];

  var COLORS = ['red', 'yellow', 'green', 'blue'];
  var COLOR_CN = { red: '红', yellow: '黄', green: '绿', blue: '蓝', wild: '万能' };
  var COLOR_HEX = { red: '#e0435a', yellow: '#f2b32c', green: '#2fae6d', blue: '#2f7ae5', wild: '#20263f' };
  var VALUE_CN = { skip: '禁止', reverse: '反转', draw2: '+2', wild: '变色', wild4: '变色+4' };
  var MAX_HAND = 12;          /* 手上牌再多，气泡也按这个上限画，避免糊成一片 */

  var CSS_ID = 'uno-style';
  var CSS = [
    '.uno-wrap{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px;box-sizing:border-box;font-family:inherit;color:#0d1330;overflow:hidden}',
    /* ---- 牌桌：四个人的牌都汇到正中央，三个 AI 分列左 / 上 / 右三侧 ---- */
    '.uno-table{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.05fr) auto minmax(0,1.05fr);grid-template-rows:minmax(0,1.2fr) auto minmax(0,1.2fr);grid-template-areas:". top ." "left center right" ". bottom .";align-items:center;justify-items:center;gap:4px 6px;padding:2px}',
    '.uno-seat{min-width:0;max-width:100%;box-sizing:border-box}',
    '.uno-seat-top{grid-area:top}',
    '.uno-seat-left{grid-area:left}',
    '.uno-seat-right{grid-area:right}',
    '.uno-seat-bottom{grid-area:bottom}',
    /* 三个 AI 的紧凑面板 */
    '.uno-pl{position:relative;min-width:0;max-width:100%;background:#fff;border-radius:13px;padding:5px 6px 6px;border:1px solid rgba(255,255,255,.85);box-shadow:0 10px 20px -18px rgba(13,19,48,.75)}',
    '.uno-seat-top .uno-pl{width:168px}',
    '.uno-seat-left .uno-pl,.uno-seat-right .uno-pl{width:98px}',
    '.uno-pl.turn{border-color:#3ddc97;box-shadow:0 0 0 2px rgba(61,220,151,.55),0 10px 20px -18px rgba(13,19,48,.75)}',
    '.uno-pl.uno-warn{border-color:#ffb457;box-shadow:0 0 0 2px rgba(255,180,87,.6)}',
    '.uno-pl-top{display:flex;align-items:center;gap:4px;min-width:0}',
    '.uno-ava{font-size:17px;line-height:1;flex:0 0 auto}',
    '.uno-nm{flex:1;min-width:0;font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.uno-cnt{flex:0 0 auto;font-size:10.5px;font-weight:800;color:#fff;background:#5b648f;border-radius:9px;padding:1px 6px}',
    '.uno-pl.uno-warn .uno-cnt{background:#f0793a}',
    '.uno-unoTag{display:none;flex:0 0 auto;font-size:9px;font-weight:800;color:#7a4a08;background:#ffd79a;border-radius:8px;padding:1px 4px}',
    '.uno-pl.uno-warn .uno-unoTag{display:inline-block}',
    /* 三个 AI 的手牌背面：在名字下面像小扇子一样叠着排 */
    '.uno-cards{display:flex;align-items:center;height:22px;margin-top:3px;padding-left:2px;overflow:hidden}',
    '.uno-bk{position:relative;flex:0 0 auto;width:15px;height:21px;border-radius:4px;background:linear-gradient(150deg,#2b3550,#0d1330);border:1.2px solid #fff;box-shadow:0 2px 5px -3px rgba(13,19,48,.8);box-sizing:border-box}',
    '.uno-bk + .uno-bk{margin-left:-6px}',
    '.uno-bk::after{content:"";position:absolute;left:2px;right:2px;top:2px;bottom:2px;border:1px solid rgba(255,255,255,.45);border-radius:2px}',
    '.uno-bk.w{background:linear-gradient(150deg,#e0435a 0%,#f2b32c 34%,#2fae6d 66%,#2f7ae5 100%)}',
    '.uno-more{flex:0 0 auto;font-size:9.5px;font-weight:800;color:#5b648f;margin-left:4px}',
    /* 表情气泡：按座位朝向牌桌中心 */
    '.uno-bub{position:absolute;max-width:112px;background:#fff;border-radius:10px;padding:2px 7px;font-size:11px;line-height:1.35;box-shadow:0 8px 18px -10px rgba(13,19,48,.9);border:1px solid rgba(13,19,48,.08);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:6;animation:unoBub 2.4s ease-out both}',
    '.uno-seat-top .uno-bub{left:50%;transform:translateX(-50%);top:-16px}',
    '.uno-seat-left .uno-bub{left:calc(100% + 4px);top:50%;transform:translateY(-50%)}',
    '.uno-seat-right .uno-bub{right:calc(100% + 4px);top:50%;transform:translateY(-50%)}',
    '.uno-me-head .uno-bub{position:static;transform:none;margin-right:2px;animation:unoBub 2.4s ease-out both}',
    '@keyframes unoBub{0%{opacity:0;transform:translateY(4px) scale(.8)}12%{opacity:1;transform:none}78%{opacity:1}100%{opacity:0;transform:translateY(-4px)}}',
    /* 牌桌中央：摸牌堆 + 弃牌堆。四人打出的牌都「叠」在弃牌堆这一格上 */
    '.uno-center{grid-area:center;display:flex;align-items:center;justify-content:center;gap:10px}',
    '.uno-deck{position:relative;flex:0 0 auto;width:56px;height:80px;border-radius:10px;background:linear-gradient(150deg,#2b3550,#0d1330);border:2px solid #fff;box-shadow:0 12px 22px -14px rgba(13,19,48,.95);cursor:pointer;box-sizing:border-box;z-index:1}',
    '.uno-deck::after{content:"";position:absolute;left:5px;right:5px;top:6px;bottom:6px;border:1.5px solid rgba(255,255,255,.55);border-radius:7px}',
    '.uno-deck b{position:absolute;left:0;right:0;top:30px;text-align:center;font-size:13px;color:#ffd79a;font-weight:800}',
    '.uno-deckSign{position:absolute;left:0;right:0;bottom:7px;text-align:center;font-size:9.5px;color:#fff;font-weight:700;opacity:.85}',
    /* 弃牌堆：里面所有牌都绝对定位叠在同一格，先画的在下面、最后一张在最上面 */
    '.uno-pile{position:relative;flex:0 0 auto;width:58px;height:84px;z-index:2}',
    '.uno-pile .uno-card{position:absolute;left:0;top:0}',
    '.uno-pile .uno-card.pile-back{z-index:1}',
    '.uno-pile .uno-card.pile-top{z-index:3}',
    '.uno-colorTag{position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);font-size:10px;font-weight:800;color:#fff;border-radius:9px;padding:1px 7px;box-shadow:0 4px 10px -6px rgba(13,19,48,.9);white-space:nowrap;z-index:5}',
      '.uno-centerInfo{flex:0 0 auto;text-align:center;font-size:10.5px;color:#5b648f;line-height:1.35}',
    '.uno-centerInfo b{display:block;font-size:12px;color:#0d1330}',
    /* 出牌动画：四个人都从自己的方向飞到中央 */
    '.uno-pile .uno-card.fly-bottom{animation:unoFlyB .36s ease-out both}',
    '.uno-pile .uno-card.fly-top{animation:unoFlyT .36s ease-out both}',
    '.uno-pile .uno-card.fly-left{animation:unoFlyL .36s ease-out both}',
    '.uno-pile .uno-card.fly-right{animation:unoFlyR .36s ease-out both}',
    '@keyframes unoFlyB{0%{transform:translateY(44px) scale(.72);opacity:.35}100%{transform:none;opacity:1}}',
    '@keyframes unoFlyT{0%{transform:translateY(-44px) scale(.72);opacity:.35}100%{transform:none;opacity:1}}',
    '@keyframes unoFlyL{0%{transform:translateX(-40px) scale(.72);opacity:.35}100%{transform:none;opacity:1}}',
    '@keyframes unoFlyR{0%{transform:translateX(40px) scale(.72);opacity:.35}100%{transform:none;opacity:1}}',
    /* ---- 卡牌 ---- */
    '.uno-card{position:relative;width:58px;height:84px;border-radius:10px;background:#fff;box-sizing:border-box;border:2.5px solid #fff;box-shadow:0 10px 18px -12px rgba(13,19,48,.9);overflow:hidden;user-select:none;-webkit-user-select:none}',
    '.uno-card .oval{position:absolute;left:50%;top:50%;width:112%;height:66%;transform:translate(-50%,-50%) rotate(-28deg);background:#fff;border-radius:50%}',
    '.uno-card .big{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:27px;font-weight:900;line-height:1;text-shadow:0 1px 0 rgba(0,0,0,.18)}',
    '.uno-card .cnr{position:absolute;font-size:10.5px;font-weight:800;line-height:1}',
    '.uno-card .cnr.tl{left:4px;top:3px}',
    '.uno-card .cnr.br{right:4px;bottom:3px;transform:rotate(180deg)}',
    '.uno-card.wild4 .oval{background:linear-gradient(90deg,#e0435a 0 25%,#f2b32c 25% 50%,#2fae6d 50% 75%,#2f7ae5 75% 100%)}',
    '.uno-card.wild4 .big{color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.55)}',
    '.uno-card.wild4 .cnr{color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)}',
    '.uno-card.tiny{width:34px;height:50px;border-width:2px;border-radius:7px}',
    '.uno-card.tiny .big{font-size:15px}',
    '.uno-card.tiny .cnr{font-size:7px}',
    '.uno-card.tiny .cnr.tl{left:2px;top:2px}',
    '.uno-card.tiny .cnr.br{right:2px;bottom:2px}',
    /* ---- 玩家手牌 ---- */
    '.uno-me{flex:0 0 auto;background:#fff;border-radius:13px;padding:5px 5px 6px;border:1px solid rgba(255,255,255,.85);box-shadow:0 10px 20px -18px rgba(13,19,48,.75)}',
    '.uno-me.turn{border-color:#3ddc97;box-shadow:0 0 0 2px rgba(61,220,151,.55),0 10px 20px -18px rgba(13,19,48,.75)}',
    '.uno-me-head{display:flex;align-items:center;gap:6px;margin-bottom:4px}',
    '.uno-me-head .uno-nm{font-size:12px}',
    '.uno-me-head .hint{flex:1;min-width:0;font-size:11px;color:#5b648f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.uno-hand{display:flex;gap:5px;overflow-x:auto;overflow-y:hidden;padding:4px 2px 5px;min-height:98px;-webkit-overflow-scrolling:touch}',
    '.uno-hand::-webkit-scrollbar{height:5px}',
    '.uno-hand::-webkit-scrollbar-thumb{background:rgba(13,19,48,.22);border-radius:3px}',
    '.uno-mcard{flex:0 0 auto;cursor:pointer;transition:transform .12s ease}',
    '.uno-mcard:active{transform:translateY(2px)}',
    '.uno-mcard.playable .uno-card{box-shadow:0 0 0 2.5px #ffb457,0 10px 18px -12px rgba(13,19,48,.9)}',
    '.uno-mcard.dim{opacity:.72}',
    '.uno-mcard.dim .uno-card{filter:saturate(.72)}',
    /* ---- 底部按钮 / 提示 ---- */
    '.uno-foot{flex:0 0 auto;display:flex;gap:6px;align-items:center}',
    '.uno-foot .ui-btn{flex:1;min-width:0;padding:9px 8px;font-size:12.5px}',
    '.uno-msg{flex:0 0 auto;min-height:15px;text-align:center;font-size:11.5px;color:#5b648f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* ---- 选色浮层 ---- */
    '.uno-pick{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.82);z-index:9}',
    '.uno-pick.show{display:grid}',
    '.uno-pick .box{background:#fff;border-radius:18px;padding:14px 16px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.8);max-width:230px}',
    '.uno-pick .box b{display:block;font-size:14px;margin-bottom:10px}',
    '.uno-pick .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.uno-pick button{border:0;font:inherit;font-weight:800;color:#fff;font-size:13px;border-radius:12px;padding:12px 6px;cursor:pointer}',
    /* ---- 结束浮层 ---- */
    '.uno-over{position:absolute;left:0;right:0;top:0;bottom:0;display:none;place-items:center;background:rgba(238,242,251,.82);z-index:10}',
    '.uno-over.show{display:grid}',
    '.uno-over .box{background:#fff;border-radius:20px;padding:18px 22px;text-align:center;box-shadow:0 24px 44px -24px rgba(13,19,48,.8);max-width:250px}',
    '.uno-over b{display:block;font-size:18px;margin-bottom:6px}',
    '.uno-over small{display:block;font-size:12px;color:#5b648f;margin-bottom:12px;line-height:1.5}',
    /* ---- 角色自定义浮层 ---- */
    '.uno-edit{position:absolute;left:0;right:0;top:0;bottom:0;display:none;background:rgba(238,242,251,.9);z-index:11;padding:10px;box-sizing:border-box}',
    '.uno-edit.show{display:block}',
    '.uno-edit .box{height:100%;box-sizing:border-box;overflow-y:auto;background:#fff;border-radius:18px;padding:12px;box-shadow:0 24px 44px -24px rgba(13,19,48,.8);-webkit-overflow-scrolling:touch}',
    '.uno-edit h4{margin:0 0 3px;font-size:14px}',
    '.uno-edit .tip{font-size:11px;color:#5b648f;line-height:1.5;margin-bottom:10px}',
    '.uno-ed-row{background:#f4f6fc;border-radius:14px;padding:9px 10px;margin-bottom:8px}',
    '.uno-ed-row .who{display:flex;align-items:center;gap:6px;margin-bottom:7px}',
    '.uno-ed-row .who .cur{font-size:19px;line-height:1}',
    '.uno-ed-row .who .lbl{flex:1;min-width:0;font-size:12.5px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.uno-ed-row .who .me-tag{font-size:9.5px;color:#7a4a08;background:#ffd79a;border-radius:8px;padding:1px 6px}',
    '.uno-ed-row .row-fields{display:flex;gap:6px}',
    '.uno-ed-row input{border:1px solid rgba(13,19,48,.14);background:#fff;border-radius:10px;padding:7px 9px;font:inherit;font-size:12.5px;min-width:0;box-sizing:border-box}',
    '.uno-ed-row input.uno-in-emoji{width:54px;text-align:center;font-size:16px;padding:5px 4px}',
    '.uno-ed-row input.uno-in-name{flex:1}',
    '.uno-ed-row input.rng{flex:1}',
    '.uno-ed-row .tip.lite{font-size:10.5px;color:#5b648f;margin:0}',
    '.uno-ed-emojis{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}',
    '.uno-ed-emojis button{border:1px solid rgba(13,19,48,.12);background:#fff;border-radius:9px;font-size:15px;line-height:1;padding:4px 5px;cursor:pointer}',
    '.uno-ed-emojis button.on{border-color:#ffb457;background:#fff5e6;box-shadow:0 0 0 2px rgba(255,180,87,.45)}',
    '.uno-ed-actions{display:flex;gap:8px;margin-top:4px;position:sticky;bottom:-12px;background:#fff;padding:8px 0 2px}',
    '.uno-ed-actions .ui-btn{flex:1}'
  ].join('');

  /* ============================================================
     表情系统：AI 在不同局面下「概率」发一句表情/短句
     规则表按顺序匹配，第一条命中的生效；prob 是该情境的基础权重（百分比）：
       触发概率 = min(95, prob + 角色话痨度)
     所以同一局面可能发、也可能不发，绝不是必然触发。
     ============================================================ */
  var EXPR_RULES = [
    /* 被加了牌 */
    { ev: 'penalty', min: 4, prob: 34, base: 0, e: '😱', t: '四张？！' },
    { ev: 'penalty', min: 4, prob: 24, base: 0, e: '🤬', t: '你们串通好的吧！' },
    { ev: 'penalty', min: 1, prob: 38, base: 0, e: '😭', t: '又摸牌…' },
    { ev: 'penalty', min: 1, prob: 22, base: 0, e: '😤', t: '记仇了。' },
    /* 自己打出了 +2 / +4 */
    { ev: 'play', val: 'wild4', prob: 55, base: 0, e: '😈', t: '变色+4，接好！' },
    { ev: 'play', val: 'draw2', prob: 42, base: 0, e: '😏', t: '给你加两张～' },
    { ev: 'play', val: 'draw2', prob: 26, base: 0, e: '😎', t: '这就是实力。' },
    { ev: 'play', val: 'skip', prob: 38, base: 0, e: '😜', t: '跳过你！' },
    { ev: 'play', val: 'reverse', prob: 28, base: 0, e: '🔄', t: '方向反啦～' },
    { ev: 'play', val: 'wild', prob: 24, base: 0, e: '🎨', t: '换成我喜欢的颜色' },
    /* 只剩一张 / UNO / 抓牌 */
    { ev: 'uno', prob: 40, base: 0, e: '😏', t: 'UNO！' },
    { ev: 'uno', prob: 16, base: 0, e: '😰', t: '差点忘了喊…' },
    { ev: 'safe', prob: 40, base: 0, e: '😌', t: '好险好险' },
    { ev: 'caught', prob: 62, base: 0, e: '😩', t: '被抓住了…' },
    { ev: 'catch', prob: 52, base: 0, e: '😈', t: '抓到你了！' },
    { ev: 'someoneUno', prob: 30, base: 0, e: '😳', t: '等等，他只剩一张了！' },
    /* 出一张普通牌 */
    { ev: 'play', prob: 9, base: 0, e: '🙂', t: '这手不错' },
    { ev: 'play', prob: 6, base: 0, e: '😐', t: '随便出一张' },
    /* 摸牌 */
    { ev: 'draw', prob: 26, base: 0, e: '🫠', t: '没牌能出啊' },
    { ev: 'draw', prob: 16, base: 0, e: '😑', t: '摸一张过渡' },
    /* 被禁止 / 被跳过 */
    { ev: 'skipped', prob: 40, base: 0, e: '😵', t: '哎？跳过我？' },
    { ev: 'skipped', prob: 14, base: 0, e: '🙃', t: '行吧' },
    /* 紧张 */
    { ev: 'tense', prob: 20, base: 0, e: '😬', t: '你只剩一张了…' },
    { ev: 'tense', prob: 12, base: 0, e: '👀', t: '盯紧你' },
    /* 胜利 / 失败 */
    { ev: 'win', prob: 92, base: 0, e: '🥳', t: '我赢啦！' },
    { ev: 'win', prob: 35, base: 0, e: '🎉', t: '收工～' },
    { ev: 'lose', prob: 60, base: 0, e: '😢', t: '下次一定' },
    { ev: 'lose', prob: 30, base: 0, e: '😤', t: '再来一局！' },
    /* 兜底：任何事件都可能冒一句碎碎念 */
    { ev: '*', prob: 3, base: 0, e: '🤔', t: '嗯…' }
  ];

  /* 角色性格：话痨度（加到每条规则的概率上）/ 抓 UNO 的积极度 / 头像 / 名字
     注：名字与头像是默认值，玩家可以在「角色」按钮里改成自己的（存 store 的 cast 键） */
  var AI_PROFILES = [
    { key: 'a', name: '小圆', avatar: '🐻', chat: 6, catchy: 0.40 },
    { key: 'b', name: '阿蓝', avatar: '🐧', chat: -4, catchy: 0.30 },
    { key: 'c', name: '喵喵', avatar: '🐱', chat: 14, catchy: 0.55 }
  ];
  var HUMAN_DEFAULT = { name: '你', avatar: '🙋' };
  var HUMAN_AVATAR = HUMAN_DEFAULT.avatar;
  var SEAT_NAMES = ['bottom', 'left', 'top', 'right'];   /* 玩家 / AI1 / AI2 / AI3 在牌桌上的方位 */
  var EMOJI_CHOICES = ['🙋', '🙂', '😎', '🤠', '🧑‍🚀', '🐻', '🐼', '🐯', '🦊', '🐧', '🐰', '🐱', '🐶', '🐸', '🦄', '🐲', '👻', '🤖', '🐵', '🐨', '🐷', '🦁'];
  var MAX_NAME = 6;
  /* 名字限制长度、去空白；空字符串回落到默认值 */
  function cleanName(v, fallback) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!s) return fallback;
    return s.slice(0, MAX_NAME);
  }
  /* 头像取第一个字素（emoji 可能是多码点，这里简单按码点取第一个，够用） */
  function cleanEmoji(v, fallback) {
    var s = String(v == null ? '' : v).replace(/\s+/g, '');
    if (!s) return fallback;
    try { return Array.from(s).slice(0, 2).join(''); } catch (e) { return s.slice(0, 2); }
  }
  /* 把存档里的自定义角色套到默认配置上 */
  function applyCast(profiles, cast) {
    cast = cast || {};
    var me = profiles[0];
    if (cast.me) {
      me.name = cleanName(cast.me.name, HUMAN_DEFAULT.name);
      me.avatar = cleanEmoji(cast.me.avatar, HUMAN_DEFAULT.avatar);
    }
    var list = cast.ai;
    if (list && list.length) {
      for (var i = 0; i < profiles.length; i++) {
        var c = list[i];
        if (!c) continue;
        profiles[i].name = cleanName(c.name, profiles[i].name);
        profiles[i].avatar = cleanEmoji(c.avatar, profiles[i].avatar);
      }
    }
    return profiles;
  }
  function defaultCast() {
    var out = { me: { name: HUMAN_DEFAULT.name, avatar: HUMAN_DEFAULT.avatar }, ai: [] };
    for (var i = 0; i < AI_PROFILES.length; i++) {
      out.ai.push({ name: AI_PROFILES[i].name, avatar: AI_PROFILES[i].avatar });
    }
    return out;
  }

  function allRules() {
    return EXPR_RULES;
  }
  /* 在一组规则里按权重挑一条并算出触发概率（整数百分比） */
  function chooseRule(ev, ctx, rules) {
    ctx = ctx || {};
    var pool = [], i, r, w, total = 0;
    for (i = 0; i < rules.length; i++) {
      r = rules[i];
      if (r.ev !== ev) continue;
      if (r.min != null && !(ctx.min >= r.min)) continue;
      if (r.max != null && !(ctx.max <= r.max)) continue;
      if (r.val != null && ctx.val !== r.val) continue;
      w = r.prob + (ctx.base || 0);
      if (w <= 0) continue;
      pool.push({ r: r, w: w });
      total += w;
    }
    if (!pool.length) return null;
    var pick = Math.random() * total;
    for (i = 0; i < pool.length; i++) {
      pick -= pool[i].w;
      if (pick <= 0) return pool[i].r;
    }
    return pool[pool.length - 1].r;
  }
  function exprTick(ev, ctx, rnd) {
    rnd = rnd || Math.random;
    var rules = allRules();
    var r = chooseRule(ev, ctx, rules);
    if (!r) return null;
    var p = Math.min(95, (r.prob || 0) + (ctx && ctx.base ? ctx.base : 0));
    return rnd() * 100 < p ? r : null;
  }

  /* ============================================================
     牌堆与规则
     ============================================================ */
  function buildDeck() {
    var deck = [], ci, v, i, c;
    for (ci = 0; ci < COLORS.length; ci++) {
      c = COLORS[ci];
      deck.push({ color: c, value: '0' });
      for (v = 1; v <= 9; v++) {
        deck.push({ color: c, value: String(v) });
        deck.push({ color: c, value: String(v) });
      }
      for (i = 0; i < 2; i++) {
        deck.push({ color: c, value: 'skip' });
        deck.push({ color: c, value: 'reverse' });
        deck.push({ color: c, value: 'draw2' });
      }
    }
    for (i = 0; i < 4; i++) {
      deck.push({ color: 'wild', value: 'wild' });
      deck.push({ color: 'wild', value: 'wild4' });
    }
    return deck;
  }
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function isWild(c) { return c && (c.value === 'wild' || c.value === 'wild4'); }
  function canPlay(card, top, color, hand) {
    if (!card || !top) return false;
    if (isWild(card)) {
      if (card.value !== 'wild4') return true;
      /* 标准规则：手里还有能跟的牌时不能打 +4 */
      for (var i = 0; i < hand.length; i++) {
        var c = hand[i];
        if (c === card || isWild(c)) continue;
        if (c.color === color || c.value === top.value) return false;
      }
      return true;
    }
    return card.color === color || card.value === top.value;
  }
  function playableList(hand, top, color) {
    var out = [], i;
    for (i = 0; i < hand.length; i++) if (canPlay(hand[i], top, color, hand)) out.push(i);
    return out;
  }
  function valueText(card) {
    if (!card) return '';
    if (card.value === 'skip') return '⊘';
    if (card.value === 'reverse') return '⇄';
    if (card.value === 'draw2') return '+2';
    if (card.value === 'wild') return '★';
    if (card.value === 'wild4') return '+4';
    return card.value;
  }
  function cornerText(card) {
    if (!card) return '';
    if (card.value === 'skip') return '⊘';
    if (card.value === 'reverse') return '⇄';
    if (card.value === 'draw2') return '+2';
    if (card.value === 'wild') return '★';
    if (card.value === 'wild4') return '+4';
    return card.value;
  }
  function cardName(card) {
    if (!card) return '？';
    if (card.color === 'wild') return VALUE_CN[card.value] || '万能';
    return COLOR_CN[card.color] + (VALUE_CN[card.value] || card.value);
  }

  function toInt(v) {
    var n = Math.floor(Number(v));
    return (isFinite(n) && n > 0) ? n : 0;
  }
  function clampNum(v, a, b) {
    var n = Number(v);
    if (!isFinite(n)) return a;
    return Math.max(a, Math.min(b, Math.round(n)));
  }
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  /* UNO 喊牌状态（0 = 玩家，1..3 = AI） */
  var UNO = { said: [false, false, false, false] };

  /* ============================================================
     应用
     ============================================================ */
  function createApp(phone) {
    var U = phone.utils;

    function mount(phoneApi, root, ctx) {
      injectCss();
      ctx.useFullBody();
      var store = ctx.store;

      /* ---------- 状态 ---------- */
      var hands = [[], [], [], []];       /* 0 = 玩家，1..3 = AI */
      var deck = [], discard = [], color = 'red';
      var turn = 0, direction = 1, phase = 'idle';   /* idle|human|ai|over */
      var pendingCatch = null;            /* { who, timer, done } */
      var lastPlayer = -1;                /* 最近一次出牌的人（用于让牌「飞」向中央，-1 表示不播动画） */
      var castOpen = false;               /* 角色自定义浮层是否打开（打开时暂停操作） */
      var aiTempo = clampNum(store.get('tempo', 1000), 400, 2500);   /* AI 出牌间隔（毫秒，默认 1 秒） */
      var timers = [], disposed = false;
      var msg = '开局！出与牌堆顶同色或同数字的牌，没有就摸一张。';
      var wins = toInt(store.get('wins', 0)), loses = toInt(store.get('loses', 0));
      var catchRatio = { caught: toInt(store.get('caught', 0)), missed: toInt(store.get('missed', 0)) };

      /* ---------- 角色（可在「角色」按钮里自定义，存在 store 的 cast 键） ---------- */
      /* profiles[0] 是玩家，1..3 是三位 AI；性格（chat/catchy）从默认配置拷过来 */
      var profiles = [{ key: 'me', name: HUMAN_DEFAULT.name, avatar: HUMAN_DEFAULT.avatar, chat: 8, catchy: 0 }];
      (function initProfiles() {
        for (var i = 0; i < AI_PROFILES.length; i++) {
          var p = AI_PROFILES[i];
          profiles.push({ key: p.key, name: p.name, avatar: p.avatar, chat: p.chat, catchy: p.catchy });
        }
        applyCast(profiles, store.get('cast', null));
      })();

      function later(fn, ms) {
        var t = setTimeout(function () {
          var i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
          if (!disposed) fn();
        }, ms);
        timers.push(t);
        return t;
      }
      function clearTimers() {
        for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
        timers = [];
        if (pendingCatch) { pendingCatch.done = true; pendingCatch = null; }
      }
      /* AI 出牌间隔：默认 1 秒（可在「角色」里调快 / 调慢），再叠 ±0.2 秒随机，别打得太机械 */
      function aiDelay(base) {
        var ms = Math.max(250, Math.round(aiTempo * (base == null ? 1 : base)));
        return ms + Math.floor(Math.random() * ms * 0.4);
      }

      /* ---------- 界面骨架 ---------- */
      var wrap = U.el('div', 'uno-wrap');

      /* 牌桌：三个 AI 分列 左 / 上 / 右，玩家在下方，所有牌都汇到正中央 */
      var table = U.el('div', 'uno-table');

      function seatBox(seat) {
        var d = U.el('div', 'uno-seat uno-seat-' + seat);
        return d;
      }
      var seatEls = {
        top: seatBox('top'), left: seatBox('left'), right: seatBox('right'), bottom: seatBox('bottom')
      };

      /* 三个 AI 的紧凑面板 */
      var oppNodes = [];
      (function buildOpps() {
        for (var i = 0; i < 3; i++) {
          var box = U.el('div', 'uno-pl');
          box.dataset.seat = String(i + 1);
          var top = U.el('div', 'uno-pl-top');
          var ava = U.el('span', 'uno-ava', profiles[i].avatar);
          var nm = U.el('span', 'uno-nm', profiles[i].name);
          var tag = U.el('span', 'uno-unoTag', 'UNO');
          var cnt = U.el('span', 'uno-cnt', '7');
          top.appendChild(ava);
          top.appendChild(nm);
          top.appendChild(tag);
          top.appendChild(cnt);
          var cards = U.el('div', 'uno-cards');
          var bub = U.el('div', 'uno-bub');
          bub.style.display = 'none';
          box.appendChild(top);
          box.appendChild(cards);
          box.appendChild(bub);
          seatEls[SEAT_NAMES[i + 1]].appendChild(box);
          oppNodes.push({
            box: box, count: cnt, avatar: ava, name: nm, cards: cards, bub: bub, backs: []
          });
        }
      })();

      /* 中央：摸牌堆 + 弃牌堆（所有人打出的牌都落在这里） */
      var center = U.el('div', 'uno-center');
      var deckEl = U.el('div', 'uno-deck');
      deckEl.appendChild(U.el('b', null, 'UNO'));
      var deckSign = U.el('div', 'uno-deckSign', '摸牌');
      deckEl.appendChild(deckSign);

      var pile = U.el('div', 'uno-pile');
      var pileCards = [];              /* 当前画在弃牌堆里的牌节点（重绘时逐张移除） */
      var colorTag = U.el('span', 'uno-colorTag', '当前颜色：红');
      pile.appendChild(colorTag);

      var centerInfo = U.el('div', 'uno-centerInfo');
      var ciDir = U.el('b', null, '顺时针');
      var ciInfo = U.el('span', null, '剩 0 张');
      centerInfo.appendChild(ciDir);
      centerInfo.appendChild(ciInfo);

      center.appendChild(deckEl);
      center.appendChild(pile);
      table.appendChild(center);
      table.appendChild(seatEls.top);
      table.appendChild(seatEls.left);
      table.appendChild(seatEls.right);
      wrap.appendChild(table);

      /* 玩家区（我这边在牌桌下方；面板本身是底部的手牌 + 按钮） */
      var meBox = U.el('div', 'uno-me');
      var meHead = U.el('div', 'uno-me-head');
      var meAva = U.el('span', 'uno-ava', profiles[0].avatar);
      var meName = U.el('span', 'uno-nm', profiles[0].name);
      var meTip = U.el('span', 'hint', '');
      var meBub = U.el('div', 'uno-bub');
      meBub.style.display = 'none';
      meHead.appendChild(meAva);
      meHead.appendChild(meName);
      meHead.appendChild(meBub);
      meHead.appendChild(meTip);
      var handEl = U.el('div', 'uno-hand');
      meBox.appendChild(meHead);
      meBox.appendChild(handEl);
      seatEls.bottom.appendChild(meBox);

      /* 「本局信息」条 + 底部按钮都放在牌桌下方 */
      var msgEl = U.el('div', 'uno-msg', msg);
      wrap.appendChild(centerInfo);
      wrap.appendChild(msgEl);
      wrap.appendChild(seatEls.bottom);

      /* 底部按钮 */
      var foot = U.el('div', 'uno-foot');
      var drawBtn = U.el('button', 'ui-btn', '摸一张');
      drawBtn.type = 'button';
      var catchBtn = U.el('button', 'ui-btn warn', '🙋 抓他！');
      catchBtn.type = 'button';
      catchBtn.style.display = 'none';
      var unoBtn = U.el('button', 'ui-btn ghost', '喊 UNO');
      unoBtn.type = 'button';
      foot.appendChild(drawBtn);
      foot.appendChild(catchBtn);
      foot.appendChild(unoBtn);
      wrap.appendChild(foot);

      /* 选色浮层 */
      var pickEl = U.el('div', 'uno-pick');
      var pickBox = U.el('div', 'box');
      var pickTitle = U.el('b', null, '选一个颜色');
      var pickGrid = U.el('div', 'grid');
      pickBox.appendChild(pickTitle);
      pickBox.appendChild(pickGrid);
      pickEl.appendChild(pickBox);
      wrap.appendChild(pickEl);

      /* 结束浮层 */
      var overEl = U.el('div', 'uno-over');
      var overBox = U.el('div', 'box');
      var overTitle = U.el('b', null, '本局结束');
      var overSub = U.el('small', null, '');
      var overBtn = U.el('button', 'ui-btn', '再来一局');
      overBtn.type = 'button';
      overBtn.addEventListener('click', function () { newGame(); });
      overBox.appendChild(overTitle);
      overBox.appendChild(overSub);
      overBox.appendChild(overBtn);
      overEl.appendChild(overBox);
      wrap.appendChild(overEl);

      /* 角色自定义浮层 */
      var editEl = U.el('div', 'uno-edit');
      var editBox = U.el('div', 'box');
      var editTitle = U.el('h4', null, '🎭 角色自定义');
      var editTip = U.el('div', 'tip', '给四位玩家起名字、选头像（也可以直接粘贴自己的 emoji）。设置会在下一局生效并永久保存。');
      editBox.appendChild(editTitle);
      editBox.appendChild(editTip);
      var editRows = [];
      (function buildCastRows() {
        for (var i = 0; i < 4; i++) {
          (function (seat) {
            var isMe = seat === 0;
            var row = U.el('div', 'uno-ed-row');
            row.dataset.seat = String(seat);
            var who = U.el('div', 'who');
            var cur = U.el('span', 'cur', profiles[seat].avatar);
            var lbl = U.el('span', 'lbl', isMe ? '我（你）' : ('AI ' + seat + ' · ' + SEAT_NAMES[seat] + '侧'));
            who.appendChild(cur);
            who.appendChild(lbl);
            if (isMe) who.appendChild(U.el('span', 'me-tag', '我'));
            var fields = U.el('div', 'row-fields');
            var emojiInput = U.el('input', 'uno-in-emoji');
            emojiInput.type = 'text';
            emojiInput.value = profiles[seat].avatar;
            emojiInput.maxLength = 4;
            emojiInput.setAttribute('aria-label', '头像');
            var nameInput = U.el('input', 'uno-in-name');
            nameInput.type = 'text';
            nameInput.value = profiles[seat].name;
            nameInput.maxLength = MAX_NAME;
            nameInput.setAttribute('placeholder', '名字（最多 ' + MAX_NAME + ' 字）');
            nameInput.setAttribute('aria-label', '名字');
            fields.appendChild(emojiInput);
            fields.appendChild(nameInput);
            var emojis = U.el('div', 'uno-ed-emojis');
            var btns = [];
            (function buildEmojis() {
              for (var k = 0; k < EMOJI_CHOICES.length; k++) {
                (function (ch) {
                  var b = U.el('button', null, ch);
                  b.type = 'button';
                  b.addEventListener('click', function () {
                    emojiInput.value = ch;
                    cur.textContent = ch;
                    for (var m = 0; m < btns.length; m++) btns[m].classList.toggle('on', btns[m].textContent === ch);
                  });
                  btns.push(b);
                  emojis.appendChild(b);
                })(EMOJI_CHOICES[k]);
              }
            })();
            emojiInput.addEventListener('input', function () {
              cur.textContent = emojiInput.value || '❓';
              for (var m = 0; m < btns.length; m++) btns[m].classList.toggle('on', btns[m].textContent === emojiInput.value);
            });
            /* 名字改完立刻在面板标题上看到（保存时才算最终生效） */
            nameInput.addEventListener('input', function () {
              lbl.textContent = (isMe ? '我（你）· ' : ('AI ' + seat + ' · ' + SEAT_NAMES[seat] + '侧 · ')) +
                cleanName(nameInput.value, profiles[seat].name);
            });
            row.appendChild(who);
            row.appendChild(fields);
            row.appendChild(emojis);
            editBox.appendChild(row);
            editRows.push({ row: row, cur: cur, emoji: emojiInput, name: nameInput, btns: btns, seat: seat });
          })(i);
        }
      })();
      var editActions = U.el('div', 'uno-ed-actions');
      var resetBtn = U.el('button', 'ui-btn ghost', '恢复默认');
      resetBtn.type = 'button';
      var cancelBtn = U.el('button', 'ui-btn ghost', '取消');
      cancelBtn.type = 'button';
      var saveBtn = U.el('button', 'ui-btn', '保存');
      saveBtn.type = 'button';
      editActions.appendChild(resetBtn);
      editActions.appendChild(cancelBtn);
      editActions.appendChild(saveBtn);
      editBox.appendChild(editActions);

      /* 出牌节奏：AI 出牌间隔（可在「角色」里调） */
      var tempoRow = U.el('div', 'uno-ed-row uno-ed-tempo');
      var tempoWho = U.el('div', 'who');
      tempoWho.appendChild(U.el('span', 'cur', '⏱'));
      tempoWho.appendChild(U.el('span', 'lbl', 'AI 出牌间隔'));
      var tempoVal = U.el('span', 'me-tag', (aiTempo / 1000).toFixed(1) + ' 秒');
      tempoWho.appendChild(tempoVal);
      var tempoInput = U.el('input', 'rng');
      tempoInput.type = 'range';
      tempoInput.min = '400';
      tempoInput.max = '2500';
      tempoInput.step = '100';
      tempoInput.value = String(aiTempo);
      tempoInput.setAttribute('aria-label', 'AI 出牌间隔');
      tempoInput.addEventListener('input', function () {
        aiTempo = clampNum(tempoInput.value, 400, 2500);
        tempoVal.textContent = (aiTempo / 1000).toFixed(1) + ' 秒';
      });
      tempoRow.appendChild(tempoWho);
      tempoRow.appendChild(tempoInput);
      var tempoHint = U.el('div', 'tip', '默认 1 秒。往左拖会更快，往右拖会慢一些（最小 0.4 秒、最大 2.5 秒）。');
      /* 节奏两项排在「保存」按钮之前 */
      editBox.insertBefore(tempoRow, editActions);
      editBox.insertBefore(tempoHint, editActions);

      editEl.appendChild(editBox);
      wrap.appendChild(editEl);

      root.appendChild(wrap);

      var pickCard = null;
      (function buildPick() {
        for (var i = 0; i < COLORS.length; i++) {
          var c = COLORS[i];
          (function (cc) {
            var b = U.el('button', null, COLOR_CN[cc] + '色');
            b.type = 'button';
            b.style.background = COLOR_HEX[cc];
            b.addEventListener('click', function () { resolveWild(cc); });
            pickGrid.appendChild(b);
          })(c);
        }
      })();

      /* ---------- 标题栏 / 键盘 ---------- */
      ctx.addAction('🎭 角色', function () { openCast(); });
      ctx.addAction('重开', function () { newGame(); });
      ctx.onKey(function (e) {
        var k = String(e.key || '').toLowerCase();
        if (k === 'r') { e.preventDefault(); newGame(); }
        else if (e.key === ' ') { e.preventDefault(); if (canHumanAct()) drawForHuman(); }
      });
      ctx.onCleanup(function () {
        disposed = true;
        clearTimers();
      });

      /* ---------- 小工具 ---------- */
      function me() { return hands[0]; }
      function topCard() { return discard.length ? discard[discard.length - 1] : null; }
      function nameOf(i) { return profiles[i] ? profiles[i].name : '？'; }
      function avatarOf(i) { return profiles[i] ? profiles[i].avatar : '❓'; }
      function baseOf(i) { return profiles[i] ? profiles[i].chat : 0; }
      function setMsg(t) { msg = t; msgEl.textContent = t; }

      /* ---------- 发牌 / 开局 ---------- */
      function newGame() {
        clearTimers();
        deck = shuffle(buildDeck());
        discard = [];
        hands = [[], [], [], []];
        direction = 1;
        phase = 'idle';
        pickCard = null;
        UNO.said = [false, false, false, false];
        pickEl.classList.remove('show');
        overEl.classList.remove('show');
        catchBtn.style.display = 'none';
        var i, k;
        for (k = 0; k < 7; k++) {
          for (i = 0; i < 4; i++) hands[i].push(deck.pop());
        }
        /* 第一张明牌不能是万能牌（简化处理：抽到万能就塞回牌堆重抽） */
        var first = deck.pop();
        var guard = 0;
        while (isWild(first) && guard++ < 40) { deck.unshift(first); first = deck.pop(); }
        discard.push(first);
        color = first.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : first.color;
        turn = 0;
        setMsg('开局！你先出牌 —— 点一张能出的牌，或点牌堆摸牌。');
        renderAll();
        /* 明牌若是功能牌，效果照常（作用于第一位玩家） */
        if (first.value === 'skip') {
          setMsg('开局的明牌是「禁止」，你被跳过了，由 ' + nameOf(1) + ' 先出。');
          turn = 1;
          beginTurn();
        } else if (first.value === 'reverse') {
          direction = -1;
          turn = 3;
          setMsg('开局反转，方向改为逆时针，由 ' + nameOf(3) + ' 先出。');
          renderAll();
          scheduleAi();
        } else if (first.value === 'draw2') {
          setMsg('开局的明牌是「+2」，你先摸两张，然后由 ' + nameOf(1) + ' 出牌。');
          drawCards(0, 2);
          turn = 1;
          renderAll();
          scheduleAi();
        } else {
          beginTurn();
        }
      }

      /* ---------- 渲染 ---------- */
      function cardNode(card, tiny) {
        var d = U.el('div', 'uno-card' + (tiny ? ' tiny' : '') + (card.color === 'wild' ? ' wild4' : ''));
        var fill = COLOR_HEX[card.color] || COLOR_HEX.wild;
        d.style.background = fill;
        d.style.borderColor = '#fff';
        var oval = U.el('div', 'oval');
        d.appendChild(oval);
        var big = U.el('div', 'big', valueText(card));
        big.style.color = card.color === 'yellow' ? '#5a3c00' : (card.color === 'wild' ? '#fff' : '#fff');
        d.appendChild(big);
        var tl = U.el('div', 'cnr tl', cornerText(card));
        var br = U.el('div', 'cnr br', cornerText(card));
        tl.style.color = big.style.color;
        br.style.color = big.style.color;
        d.appendChild(tl);
        d.appendChild(br);
        return d;
      }
      function renderOpps() {
        var i, k, node, n;
        for (i = 0; i < 3; i++) {
          node = oppNodes[i];
          n = hands[i + 1].length;
          node.count.textContent = String(n);
          node.box.classList.toggle('turn', turn === i + 1 && phase !== 'over');
          node.box.classList.toggle('uno-warn', n === 1);
          /* 名字 / 头像跟随自定义设置 */
          node.name.textContent = profiles[i + 1].name;
          node.avatar.textContent = profiles[i + 1].avatar;
          node.box.title = profiles[i + 1].name + '（' + SEAT_NAMES[i + 1] + '侧）· 手牌 ' + n + ' 张';
          /* 牌背：像小扇子一样叠着显示，最多 MAX_HAND 张（超出的用 +N 表示） */
          var show = Math.min(n, MAX_HAND);
          for (k = 0; k < node.backs.length; k++) node.backs[k].style.display = 'none';
          for (k = 0; k < show; k++) {
            if (!node.backs[k]) {
              var b = U.el('div', 'uno-bk' + (k === 0 ? ' w' : ''));
              node.cards.appendChild(b);
              node.backs[k] = b;
            }
            node.backs[k].style.display = 'block';
          }
          if (n > MAX_HAND) {
            if (!node.more) {
              node.more = U.el('span', 'uno-more');
              node.cards.appendChild(node.more);
            }
            node.more.textContent = '+' + (n - MAX_HAND);
            node.more.style.display = 'inline-block';
          } else if (node.more) {
            node.more.style.display = 'none';
          }
        }
      }
      function renderPile() {
        /* 弃牌堆：所有牌都绝对定位叠在同一格里（最多画最近 3 张，做出「一叠」的厚度感），
           新打出的那张在最上面，并从出牌人的方向飞进来。
           注意：清理时要按「上次画出来的那几张牌」逐张移除，不能依赖 children[0] 的位置
           （否则颜色标签会被误删，剩下的牌就再也清不掉 → 越叠越多）。 */
        var i;
        for (i = 0; i < pileCards.length; i++) pile.removeChild(pileCards[i]);
        pileCards = [];
        var from = lastPlayer;
        lastPlayer = -1;
        var n = discard.length;
        var firstShown = Math.max(0, n - 3);
        for (var k = firstShown; k < n; k++) {
          var isTop = k === n - 1;
          var node = cardNode(discard[k], false);
          node.classList.add(isTop ? 'pile-top' : 'pile-back');
          if (isTop) {
            node.classList.add('fly-' + SEAT_NAMES[from >= 0 ? from : 0]);
          } else {
            /* 下面几张稍微歪一点、暗一点，看起来是同一叠牌 */
            var off = (n - 1 - k);
            node.style.transform = 'rotate(' + (off === 1 ? -3 : 3) + 'deg) translate(' + (off * 1.5) + 'px,' + (off * -1.5) + 'px)';
            node.style.filter = 'brightness(.93)';
          }
          pile.appendChild(node);
          pileCards.push(node);
        }
        var col = COLOR_HEX[color] || '#5b648f';
        colorTag.textContent = '当前颜色：' + (COLOR_CN[color] || '万能');
        colorTag.style.background = col;
        ciDir.textContent = direction > 0 ? '顺时针' : '逆时针';
        ciInfo.textContent = '牌堆剩 ' + deck.length + ' 张';
        deckSign.textContent = deck.length ? '摸牌' : '重整';
      }
      function renderHand() {
        handEl.innerHTML = '';
        var playable = (turn === 0 && phase === 'human') ? playableList(me(), topCard(), color) : [];
        for (var i = 0; i < me().length; i++) {
          var card = me()[i];
          var wrapCard = U.el('div', 'uno-mcard' + (playable.indexOf(i) >= 0 ? ' playable' : (turn === 0 && phase === 'human' ? ' dim' : '')));
          wrapCard.appendChild(cardNode(card, false));
          (function (cardRef) {
            wrapCard.addEventListener('click', function () { onCardClick(cardRef); });
          })(card);
          handEl.appendChild(wrapCard);
        }
      }
      function renderMe() {
        meBox.classList.toggle('turn', turn === 0 && phase !== 'over');
        var n = me().length;
        meAva.textContent = profiles[0].avatar;
        if (phase === 'over') meTip.textContent = '';
        else if (turn !== 0) meTip.textContent = '等待 ' + nameOf(turn) + ' 出牌…';
        else if (n === 1) meTip.textContent = '你就剩 1 张了，快出掉！';
        else {
          var pl = playableList(me(), topCard(), color);
          if (!pl.length) meTip.textContent = '没有能出的牌，点「摸一张」';
          else meTip.textContent = '轮到你出牌（' + pl.length + ' 张可出）';
        }
        drawBtn.textContent = deck.length ? ('摸一张（剩 ' + deck.length + '）') : '重整牌堆';
        meName.textContent = profiles[0].name + ' · ' + n + ' 张';
      }
      function renderAll() {
        renderOpps();
        renderPile();
        renderHand();
        renderMe();
        msgEl.textContent = msg;
      }

      /* ---------- 气泡 ---------- */
      function showBubble(node, text) {
        node.bub.textContent = text;
        node.bub.style.display = 'block';
        /* 重新触发动画 */
        node.bub.style.animation = 'none';
        /* 读取一次布局属性强制重排（假 DOM 下这些属性不存在，做兜底） */
        void (node.bub.offsetWidth || 0);
        node.bub.style.animation = '';
        var b = node.bub;
        later(function () { b.style.display = 'none'; }, 2400);
      }
      function bubbleFor(seat, text) {
        if (seat === 0) { showBubble({ bub: meBub }, text); return; }
        var node = oppNodes[seat - 1];
        if (node) showBubble(node, text);
      }
      /* 概率触发：命中规则才冒气泡，没命中就什么都不说（同一局面不是必然发） */
      function reactWith(seat, ev, ctx2, rnd, delay) {
        if (disposed) return null;
        var c = ctx2 || {};
        c.base = (c.base || 0) + baseOf(seat);
        var r = exprTick(ev, c, rnd || Math.random);
        if (!r) return null;
        var text = r.e + ' ' + r.t;
        if (delay) later(function () { bubbleFor(seat, text); }, delay);
        else bubbleFor(seat, text);
        return r;
      }
      function react(seat, ev, ctx2, delay) {
        return reactWith(seat, ev, ctx2, Math.random, delay);
      }

      /* ---------- 牌堆操作 ---------- */
      function drawOne(who) {
        if (!deck.length) {
          if (discard.length <= 1) return null;
          var top = discard.pop();
          deck = shuffle(discard);
          discard = [top];
          setMsg(nameOf(who) + ' 洗了一次弃牌堆。');
        }
        return deck.pop() || null;
      }
      function drawCards(who, n) {
        var got = 0;
        for (var i = 0; i < n; i++) {
          var c = drawOne(who);
          if (!c) break;
          hands[who].push(c);
          got++;
        }
        return got;
      }
      function nextSeat(step, from) {
        var i = (from == null ? turn : from) + direction * (step || 1);
        return ((i % 4) + 4) % 4;
      }
      function skipSeat(seat) { return (seat + direction + 4) % 4; }

      /* ---------- 出牌 ---------- */
      function onCardClick(card) {
        if (!canHumanAct()) {
          if (phase === 'over') return;
          phone.toast('还没轮到你出牌', 'info');
          return;
        }
        if (!canPlay(card, topCard(), color, me())) {
          phone.toast('这张出不了：要和牌堆顶同色或同数字', 'bad');
          return;
        }
        if (card.value === 'wild' || card.value === 'wild4') {
          pickCard = card;
          pickEl.classList.add('show');
          return;
        }
        playCard(0, card, null);
      }
      function resolveWild(c) {
        pickEl.classList.remove('show');
        var card = pickCard;
        pickCard = null;
        if (!card) return;
        if (!canHumanAct()) return;
        playCard(0, card, c);
      }
      function canHumanAct() {
        return phase === 'human' && turn === 0 && !disposed && !castOpen;
      }
      function removeCard(who, card) {
        var i = hands[who].indexOf(card);
        if (i >= 0) hands[who].splice(i, 1);
      }
      function resolveEffect(who, card) {
        var victim, cc;
        if (card.value === 'draw2') {
          victim = (who + direction + 4) % 4;
          var g2n = drawCards(victim, 2);
          react(victim, 'penalty', { min: 2, base: 0 }, 380);
          if (victim !== 0) setMsg(nameOf(who) + ' 打出 +2，' + nameOf(victim) + ' 摸了 2 张并被跳过。');
          else setMsg(nameOf(who) + ' 打出 +2，你摸了 2 张并被跳过。');
          direction = direction; /* 方向不变 */
          return skipSeat(victim);
        }
        if (card.value === 'wild4') {
          victim = (who + direction + 4) % 4;
          drawCards(victim, 4);
          react(victim, 'penalty', { min: 4, base: 0 }, 380);
          setMsg(nameOf(who) + ' 打出变色+4（' + (COLOR_CN[color] || '') + '色），' + nameOf(victim) + ' 摸 4 张并被跳过。');
          return skipSeat(victim);
        }
        if (card.value === 'skip') {
          victim = (who + direction + 4) % 4;
          react(victim, 'skipped', {}, 320);
          setMsg(nameOf(who) + ' 打出「禁止」，' + nameOf(victim) + ' 被跳过。');
          return skipSeat(victim);
        }
        if (card.value === 'reverse') {
          direction = -direction;
          setMsg(nameOf(who) + ' 打出「反转」，方向改为' + (direction > 0 ? '顺时针' : '逆时针') + '。');
          /* 两人局时反转等于跳过；这里固定 4 人，正常反转 */
        }
        return null;
      }
      function playCard(who, card, newColor) {
        /* 人类玩家打出功能牌 / 只剩一张时也会冒气泡（同样按概率） */
        if (who === 0) {
          if (card.value === 'draw2') react(0, 'play', { val: 'draw2' }, 0);
          else if (card.value === 'wild4') react(0, 'play', { val: 'wild4' }, 0);
          else if (card.value === 'skip') react(0, 'play', { val: 'skip' }, 0);
          else if (card.value === 'reverse') react(0, 'play', { val: 'reverse' }, 0);
          else if (card.value === 'wild') react(0, 'play', { val: 'wild' }, 0);
        }
        removeCard(who, card);
        discard.push(card);
        lastPlayer = who;                 /* 让这张牌从出牌人的方向飞向中央 */
        if (isWild(card)) color = newColor || COLORS[Math.floor(Math.random() * 4)];
        else color = card.color;
        var skipTo = resolveEffect(who, card);
        /* UNO：出完牌只剩 1 张（AI 有概率忘记喊，玩家由按钮负责，忘了就会被人抓） */
        var forgot = null;
        if (hands[who].length === 1) {
          forgot = unoCheck(who);
        } else if (hands[who].length === 0) {
          finish(who);
          return;
        }
        if (skipTo != null) turn = skipTo;
        else turn = (who + direction + 4) % 4;
        renderAll();
        if (forgot) openCatchWindow(forgot);
        afterMove();
      }
      function afterMove() {
        if (phase === 'over' || disposed) return;
        if (turn === 0) beginTurn();
        else scheduleAi();
      }
      function beginTurn() {
        if (phase === 'over' || disposed) return;
        if (turn === 0) {
          phase = 'human';
          renderAll();
          /* 只剩一张还没喊 UNO 时提示一下 */
          if (me().length === 1) setMsg('你就剩一张了 —— 记得喊 UNO，否则会被别人抓。');
          else if (!playableList(me(), topCard(), color).length) setMsg('没有能出的牌，点「摸一张」。');
        } else {
          phase = 'ai';
          renderAll();
        }
      }

      /* ---------- UNO 喊牌 / 抓牌 ---------- */
      /* AI 有 30% 概率忘记喊 UNO；返回「忘记喊」的信息，玩家则由按钮决定喊不喊 */
      function unoCheck(who) {
        if (who === 0) {
          UNO.said[0] = false;
          setMsg('你就剩 1 张了 —— 点「喊 UNO」保平安，不然可能被他们抓罚 2 张。');
          return { who: 0 };
        }
        var forget = Math.random() < 0.30;
        UNO.said[who] = !forget;
        var prof = AI_PROFILES[who - 1];
        if (!forget) {
          react(who, 'uno', {}, 200);
          setMsg(nameOf(who) + ' 喊了 UNO！（只剩 1 张）');
          return null;
        }
        setMsg(nameOf(who) + ' 只剩 1 张，好像忘了喊 UNO…');
        return { who: who };
      }

      function openCatchWindow(info) {
        var who = info.who;
        pendingCatch = { who: who, done: false, timer: 0, caught: false };
        var all = [0, 1, 2, 3].filter(function (s) { return s !== who; });
        var i;
        /* AI 尝试抓：各自按性格掷骰子；谁都不抓，这一局就放过他 */
        for (i = 0; i < all.length; i++) {
          (function (seat) {
            if (seat === 0) return;
            var prof = AI_PROFILES[seat - 1];
            if (Math.random() < prof.catchy) {
              later(function () { attemptCatch(seat, who); }, 900 + Math.floor(Math.random() * 1600));
            }
          })(all[i]);
        }
        if (who !== 0) {
          showCatchButton(who);
          setMsg(nameOf(who) + ' 忘了喊 UNO —— 趁现在点「抓他！」，能罚他摸 2 张。');
        }
        var t = later(function () {
          if (!pendingCatch || pendingCatch.done) return;
          pendingCatch.done = true;
          pendingCatch = null;
          hideCatchButton();
          if (who !== 0 && hands[who].length === 1) {
            react(who, 'safe', {}, 0);
            setMsg(nameOf(who) + ' 蒙混过关了…');
          } else if (who === 0 && hands[0].length === 1) {
            setMsg('还好没人抓你，这轮算你过关。');
          }
        }, 3400);
        if (pendingCatch) pendingCatch.timer = t;
      }
      function showCatchButton(who) {
        catchBtn.style.display = '';
        catchBtn.textContent = '🙋 抓 ' + nameOf(who) + '！';
        catchBtn.dataset.target = String(who);
      }
      function hideCatchButton() {
        catchBtn.style.display = 'none';
        delete catchBtn.dataset.target;
      }
      function attemptCatch(seat, who) {
        if (!pendingCatch || pendingCatch.done || pendingCatch.who !== who) return;
        if (hands[who].length !== 1) {
          pendingCatch.done = true;
          pendingCatch = null;
          hideCatchButton();
          return;
        }
        pendingCatch.done = true;
        pendingCatch.caught = true;
        if (pendingCatch.timer) clearTimeout(pendingCatch.timer);
        pendingCatch = null;
        hideCatchButton();
        drawCards(who, 2);
        react(seat, 'catch', {}, 120);
        react(who, 'caught', {}, 260);
        if (seat === 0) {
          catchRatio.caught++;
          store.set('caught', catchRatio.caught);
        }
        setMsg('抓到了！' + nameOf(who) + ' 忘喊 UNO，罚摸 2 张。');
        renderAll();
      }
      function humanCatch() {
        if (!pendingCatch || pendingCatch.done) { phone.toast('现在没有可以抓的人', 'info'); return; }
        var who = pendingCatch.who;
        if (who === 0) { phone.toast('那是你自己…', 'info'); return; }
        attemptCatch(0, who);
      }
      function humanSayUno() {
        if (me().length !== 1) {
          phone.toast(me().length > 1 ? ('手上还有 ' + me().length + ' 张，不用喊 UNO') : '你已经出完了', 'info');
          return;
        }
        UNO.said[0] = true;
        bubbleFor(0, '😤 UNO！');
        if (pendingCatch && pendingCatch.who === 0) {
          /* 及时自救：抓牌窗口作废 */
          pendingCatch.done = true;
          if (pendingCatch.timer) clearTimeout(pendingCatch.timer);
          pendingCatch = null;
          hideCatchButton();
          setMsg('你及时喊了 UNO，安全！');
        } else {
          setMsg('你喊了 UNO！现在别人抓不到你了。');
        }
        renderAll();
      }

      /* ---------- 玩家操作 ---------- */
      function drawForHuman() {
        if (phase === 'over') return;
        if (!canHumanAct()) { phone.toast('还没轮到你', 'info'); return; }
        if (!playableList(me(), topCard(), color).length) {
          var got = drawCards(0, 1);
          if (!got) { phone.toast('牌堆空了，跳过这一轮', 'info'); passTurn(); return; }
          setMsg('你摸了一张：' + cardName(me()[me().length - 1]) + '。');
          react(0, 'draw', {}, 150);
          renderAll();
          /* 摸到的牌能出就直接出（简化：自动出，符合手机上的顺手体验） */
          var c = me()[me().length - 1];
          if (canPlay(c, topCard(), color, me())) {
            later(function () {
              if (!canHumanAct()) return;
              if (c.value === 'wild' || c.value === 'wild4') {
                pickCard = c;
                pickEl.classList.add('show');
                setMsg('摸到万能牌，选一个颜色吧。');
                renderAll();
              } else {
                playCard(0, c, null);
              }
            }, 420);
          } else {
            setMsg('摸到的是 ' + cardName(c) + '，出不了，轮到下一位。');
            later(function () { passTurn(); }, 500);
          }
          return;
        }
        /* 还有能出的牌：仍然允许主动摸一张（标准规则） */
        var got2 = drawCards(0, 1);
        if (!got2) { phone.toast('牌堆空了', 'info'); return; }
        react(0, 'draw', {}, 150);
        setMsg('你摸了一张：' + cardName(me()[me().length - 1]) + '。');
        renderAll();
        later(function () { passTurn(); }, 460);
      }
      function passTurn() {
        if (phase === 'over' || disposed) return;
        turn = (turn + direction + 4) % 4;
        renderAll();
        afterMove();
      }

      /* ---------- AI ---------- */
      function aiChoose(seat) {
        var h = hands[seat], top = topCard();
        var idxs = playableList(h, top, color);
        if (!idxs.length) return null;
        var nextP = (seat + direction + 4) % 4;
        var threat = hands[nextP].length <= 2;         /* 下家快出完了 → 优先攻击牌 */
        var best = null, bestScore = -1;
        for (var k = 0; k < idxs.length; k++) {
          var c = h[idxs[k]], s = 0;
          if (c.value === 'draw2' || c.value === 'wild4') s += threat ? 70 : 50;
          if (c.value === 'skip' || c.value === 'reverse') s += 25;
          if (c.value === 'wild') s += 8;
          if (c.color === color) s += 12;              /* 顺着当前颜色打 */
          if (isWild(c)) s -= 6;                       /* 万能牌留一留 */
          /* 手里同色越多越愿意出这个颜色，方便后续接牌 */
          var same = 0;
          for (var m = 0; m < h.length; m++) if (h[m].color === c.color) same++;
          s += same * 2;
          s += Math.random() * 12;                     /* 一点点随机，避免每局一模一样 */
          if (s > bestScore) { bestScore = s; best = { card: c, kind: isWild(c) ? 'wild' : 'normal' }; }
        }
        return best;
      }
      function aiColorChoice(seat, card) {
        var counts = { red: 0, yellow: 0, green: 0, blue: 0 };
        var h = hands[seat], i;
        for (i = 0; i < h.length; i++) if (counts[h[i].color] != null) counts[h[i].color]++;
        var best = COLORS[0], bn = -1;
        for (i = 0; i < COLORS.length; i++) {
          if (counts[COLORS[i]] > bn) { bn = counts[COLORS[i]]; best = COLORS[i]; }
        }
        return best;
      }
      function scheduleAi() {
        if (phase === 'over' || disposed) return;
        if (turn === 0) { beginTurn(); return; }
        var seat = turn;
        /* 下家只剩一张时的紧张感 */
        if (hands[0].length === 1 && Math.random() < 0.35) react(seat, 'tense', {}, 0);
        /* 出牌节奏：默认约 1 秒（另有「节奏」设置，可在 0.6~2 秒内调），别打太快 */
        later(function () {
          if (phase === 'over' || disposed || turn !== seat) return;
          var pick = aiChoose(seat);
          if (pick) {
            var newColor = pick.kind === 'wild' ? aiColorChoice(seat, pick.card) : null;
            /* 出牌前先来一句（概率） */
            if (pick.card.value === 'draw2') react(seat, 'play', { val: 'draw2' }, 0);
            else if (pick.card.value === 'wild4') react(seat, 'play', { val: 'wild4' }, 0);
            else if (pick.card.value === 'skip') react(seat, 'play', { val: 'skip' }, 0);
            else if (pick.card.value === 'reverse') react(seat, 'play', { val: 'reverse' }, 0);
            else if (pick.card.value === 'wild') react(seat, 'play', { val: 'wild' }, 0);
            else react(seat, 'play', {}, 0);
            setMsg(nameOf(seat) + ' 打出 ' + cardName(pick.card) + (newColor ? '（选了' + COLOR_CN[newColor] + '色）' : '') + '。');
            playCard(seat, pick.card, newColor);
            return;
          }
          /* 没牌可出：摸一张 */
          var got = drawCards(seat, 1);
          react(seat, 'draw', {}, 260);
          if (!got) {
            setMsg(nameOf(seat) + ' 摸不到牌，跳过。');
            later(function () { passTurn(); }, aiDelay(0.6));
            return;
          }
          var drawn = hands[seat][hands[seat].length - 1];
          renderAll();
          if (canPlay(drawn, topCard(), color, hands[seat])) {
            setMsg(nameOf(seat) + ' 摸到一张能出的牌，直接出了。');
            later(function () {
              if (phase === 'over' || disposed || turn !== seat) return;
              var nc = isWild(drawn) ? aiColorChoice(seat, drawn) : null;
              playCard(seat, drawn, nc);
            }, aiDelay(0.9));
          } else {
            setMsg(nameOf(seat) + ' 摸了一张，还是出不了，轮到下一位。');
            later(function () { passTurn(); }, aiDelay(0.7));
          }
        }, aiDelay(1));
      }

      /* ---------- 结束 ---------- */
      function finish(winner) {
        phase = 'over';
        clearTimers();
        var humanWin = winner === 0;
        if (humanWin) { wins++; store.set('wins', wins); }
        else { loses++; store.set('loses', loses); }
        store.set('said', UNO.said.slice());
        for (var s = 1; s <= 3; s++) {
          if (s !== winner) react(s, 'lose', {}, s * 260);
        }
        if (!humanWin) react(winner, 'win', {}, 200);
        bubbleFor(0, humanWin ? '🥳 我赢了！' : '😢 再来一局');
        overTitle.textContent = humanWin ? (profiles[0].name + ' 赢啦！🎉') : (nameOf(winner) + ' 赢了');
        overSub.textContent = '战绩：' + wins + ' 胜 ' + loses + ' 负 · 抓到别人 ' + catchRatio.caught + ' 次';
        overEl.classList.add('show');
        setMsg(humanWin ? '你把牌出完啦！' : (nameOf(winner) + ' 先出完了牌。'));
        renderAll();
      }

      /* ---------- 角色自定义 ---------- */
      function refreshCastRows() {
        for (var i = 0; i < editRows.length; i++) {
          var r = editRows[i];
          r.cur.textContent = profiles[r.seat].avatar;
          r.emoji.value = profiles[r.seat].avatar;
          r.name.value = profiles[r.seat].name;
          for (var k = 0; k < r.btns.length; k++) {
            r.btns[k].classList.toggle('on', r.btns[k].textContent === profiles[r.seat].avatar);
          }
        }
      }
      function openCast() {
        castOpen = true;
        refreshCastRows();
        editEl.classList.add('show');
      }
      function closeCast() {
        castOpen = false;
        editEl.classList.remove('show');
      }
      function saveCast() {
        for (var i = 0; i < editRows.length; i++) {
          var r = editRows[i], seat = r.seat;
          profiles[seat].name = cleanName(r.name.value, profiles[seat].name);
          profiles[seat].avatar = cleanEmoji(r.emoji.value, profiles[seat].avatar);
        }
        aiTempo = clampNum(tempoInput.value, 400, 2500);
        store.set('tempo', aiTempo);
        store.set('cast', {
          me: { name: profiles[0].name, avatar: profiles[0].avatar },
          ai: [
            { name: profiles[1].name, avatar: profiles[1].avatar },
            { name: profiles[2].name, avatar: profiles[2].avatar },
            { name: profiles[3].name, avatar: profiles[3].avatar }
          ]
        });
        renderAll();
        closeCast();
        phone.toast('角色已保存：' + profiles[0].name + ' vs ' + profiles[1].name + ' / ' + profiles[2].name + ' / ' + profiles[3].name, 'ok');
      }
      function resetCast() {
        var d = defaultCast();
        profiles[0].name = d.me.name; profiles[0].avatar = d.me.avatar;
        for (var i = 0; i < 3; i++) {
          profiles[i + 1].name = d.ai[i].name;
          profiles[i + 1].avatar = d.ai[i].avatar;
        }
        refreshCastRows();
        renderAll();
        phone.toast('已恢复默认角色（记得点保存）', 'info');
      }

      /* ---------- 绑定 ---------- */
      drawBtn.addEventListener('click', function () { drawForHuman(); });
      catchBtn.addEventListener('click', function () { humanCatch(); });
      unoBtn.addEventListener('click', function () { humanSayUno(); });
      deckEl.addEventListener('click', function () { drawForHuman(); });
      saveBtn.addEventListener('click', function () { saveCast(); });
      cancelBtn.addEventListener('click', function () { closeCast(); });
      resetBtn.addEventListener('click', function () { resetCast(); });

      /* ---------- 启动 ---------- */
      newGame();

      /* 局内控制把手：挂在 mount 上（内核注册时会剥掉自定义字段），方便自动化测试真跑一局 */
      mount.__controller = {
        hands: function () { return hands; },
        deck: function () { return deck; },
        discard: function () { return discard; },
        color: function () { return color; },
        turn: function () { return turn; },
        phase: function () { return phase; },
        direction: function () { return direction; },
        play: playCard,
        draw: drawCards,
        setMsg: setMsg,
        react: reactWith,
        newGame: newGame,
        humanDraw: drawForHuman,
        canPlay: canPlay,
        playableList: playableList,
        cardName: cardName,
        pendingCatch: function () { return pendingCatch; },
        catchHuman: humanCatch,
        sayUno: humanSayUno,
        /* 角色自定义 / 节奏（给自动化测试用） */
        profiles: function () { return profiles; },
        tempo: function () { return aiTempo; },
        setTempo: function (ms) { aiTempo = clampNum(ms, 400, 2500); store.set('tempo', aiTempo); return aiTempo; },
        openCast: openCast,
        saveCast: saveCast,
        resetCast: resetCast,
        castOpen: function () { return castOpen; },
        seatOf: function (i) { return SEAT_NAMES[i]; },
        avatarOf: avatarOf
      };
    }

    /* 测试把手：内核注册时会浅拷贝定义（只保留标准字段），所以挂在 mount 函数上 */
    mount.__test = {
      engine: {
        buildDeck: buildDeck, shuffle: shuffle, canPlay: canPlay,
        playableList: playableList, exprTick: exprTick, chooseRule: chooseRule,
        allRules: allRules, EXPR_RULES: EXPR_RULES, AI_PROFILES: AI_PROFILES,
        cardName: cardName, valueText: valueText, COLORS: COLORS
      },
      /* 局内控制把手（每次 mount 刷新），供测试真跑一局 */
      controller: function () { return mount.__controller; },
      /* 样式文本（假 DOM 里拿不到注入的 <style>，直接给测试看） */
      css: CSS
    };
    return {
      id: 'uno',
      name: 'UNO',
      icon: 'emoji:🃏',
      desc: '与 3 个 AI 玩 UNO · 它们会发表情',
      order: 13,
      mount: mount
    };
  }
  window.PHONE_BUILTIN_APPS.push({ id: 'uno', createApp: createApp, code: '' });
})();
