/*!
 * AdQuiz v1.1.0
 * インタースティシャル広告パロディ風クイズ（小2〜小4向けの計算・漢字）
 * 依存なし・単一ファイル。<script src> でも require でも使えます。
 *
 *   AdQuiz.configure({ grade:[2,3], everyN:3 });
 *   AdQuiz.tick({ onClose: r => { if (r.correct) giveReward(); } });   // 節目ごとに呼ぶ
 *   const r = await AdQuiz.show();                                      // 直接出す（Promise）
 */
(function (root, factory) {
  var create = factory();
  var instance = create();
  instance.create = create; // 別設定のインスタンスが欲しいとき: AdQuiz.create({...})
  if (typeof module === 'object' && module.exports) module.exports = instance;
  else root.AdQuiz = instance;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  /* ---------- 既定値 ---------- */
  var DEFAULTS = {
    everyN: 3,            // tick() を何回呼んだら広告を出すか
    minIntervalSec: 0,    // 前回の広告から最低これだけ空ける（0=制限なし）
    skipAfterSec: 5,      // ✕が押せるようになるまでの秒数（答えたらすぐ押せる）
    grade: [2, 3],        // 出題する学年（1〜4。漢字データは1〜3年、4年は計算のみ）
    kinds: ['calc', 'kanjiRead', 'kanjiWrite'],
    customRatio: 0.3,     // 手作り問題がある場合、それを出す確率
    sound: true,          // 効果音（WebAudio）
    gameId: null,         // このゲームの識別子。手作り問題の games: [...] との照合に使う（例 'hockey'）
    zIndex: 99999,
    container: null,      // 広告を挿入する要素（null なら document.body）
    problemProvider: null,// () => ({label,q,choices,answer,big}) を返すと、内蔵の問題の代わりに使う
    onShow: null,         // 広告が出たとき（ゲームの一時停止などに）
    onClose: null         // 広告が閉じたとき（show/tick の onClose と両方呼ばれる）
  };

  var DEFAULT_TEXT = {
    badge: 'こうこく',
    correctFirst: 'せいかい！ すごい！ 🎉',
    correct: 'せいかい！ 🎉',
    wrong: 'ざんねん！ もういちど！',
    notYet: 'まだ とじられないよ！',
    timer: function (n) { return 'あと ' + n + 'びょう'; },
    closeLabel: 'とじる',
    customLabel: 'とくべつ もんだい',
    calcLabel: 'けいさん',
    kanjiReadLabel: 'かんじ よみ',
    kanjiWriteLabel: 'かんじ かき',
    kanjiReadQ: function (k) { return '「' + k + '」は なんて よむ？'; },
    kanjiWriteQ: function (y) { return '「' + y + '」の かんじは どれ？'; },
    blankSuffix: '　□は いくつ？'
  };

  /* ---------- 広告っぽい見た目 ---------- */
  var ADS_DEFAULT = [
    { brand: 'さんすう マート',        catch: 'いまなら けいさん ぜんぶ 0円！',                 cta: 'いますぐ けいさん！',          c1: '#ff6b6b', c2: '#feca57', icon: '🛒' },
    { brand: 'あたまが よくなる アプリ', catch: 'このアプリで あなたも てんさい（かも）',         cta: 'むりょうで あそぶ',            c1: '#54a0ff', c2: '#5f27cd', icon: '🧠' },
    { brand: 'ドリルくん',             catch: 'まいにち ３ぷんで ドヤ顔 まちがいなし！',        cta: 'ダウンロード…しないで こたえる', c1: '#1dd1a1', c2: '#10ac84', icon: '✏️' },
    { brand: 'かんじの もり',          catch: 'よめたら ヒーロー！ よめなくても ヒーロー！',    cta: 'もんだいを みる',              c1: '#a29bfe', c2: '#fd79a8', icon: '🌳' },
    { brand: 'ゲームを じゃまする会社',  catch: 'いいところで じゃまします ごめんね',             cta: 'ゆるす',                      c1: '#2d3436', c2: '#636e72', icon: '🚧' }
  ];

  /* ---------- 漢字データ ----------
     読みは重複させない方針（かきとりで正解が2つ見えるのを防ぐ）。
     日/火 は同じ「ひ」なので、選択肢には同じ読みの漢字を混ぜない処理をしている。 */
  var KANJI_DEFAULT = [
    // 1年（grade に 1 を入れたときだけ出る）
    {k:'山',y:'やま',g:1},{k:'川',y:'かわ',g:1},{k:'日',y:'ひ',g:1},{k:'月',y:'つき',g:1},
    {k:'火',y:'ひ',g:1},{k:'水',y:'みず',g:1},{k:'木',y:'き',g:1},{k:'空',y:'そら',g:1},
    {k:'花',y:'はな',g:1},{k:'犬',y:'いぬ',g:1},{k:'虫',y:'むし',g:1},{k:'雨',y:'あめ',g:1},
    {k:'目',y:'め',g:1},{k:'耳',y:'みみ',g:1},{k:'口',y:'くち',g:1},{k:'手',y:'て',g:1},
    {k:'足',y:'あし',g:1},{k:'森',y:'もり',g:1},{k:'人',y:'ひと',g:1},{k:'天気',y:'てんき',g:1},
    // 2年
    {k:'雪',y:'ゆき',g:2},{k:'朝',y:'あさ',g:2},{k:'魚',y:'さかな',g:2},{k:'星',y:'ほし',g:2},
    {k:'海',y:'うみ',g:2},{k:'友',y:'とも',g:2},{k:'母',y:'はは',g:2},{k:'父',y:'ちち',g:2},
    {k:'鳥',y:'とり',g:2},{k:'風',y:'かぜ',g:2},{k:'店',y:'みせ',g:2},{k:'姉',y:'あね',g:2},
    {k:'弟',y:'おとうと',g:2},{k:'牛',y:'うし',g:2},{k:'馬',y:'うま',g:2},{k:'雲',y:'くも',g:2},
    {k:'春',y:'はる',g:2},{k:'夏',y:'なつ',g:2},{k:'秋',y:'あき',g:2},{k:'冬',y:'ふゆ',g:2},
    {k:'兄',y:'あに',g:2},{k:'妹',y:'いもうと',g:2},{k:'米',y:'こめ',g:2},{k:'肉',y:'にく',g:2},
    {k:'道',y:'みち',g:2},{k:'池',y:'いけ',g:2},{k:'船',y:'ふね',g:2},{k:'光',y:'ひかり',g:2},
    {k:'紙',y:'かみ',g:2},{k:'岩',y:'いわ',g:2},{k:'歩く',y:'あるく',g:2},{k:'走る',y:'はしる',g:2},
    {k:'話す',y:'はなす',g:2},{k:'思う',y:'おもう',g:2},{k:'食べる',y:'たべる',g:2},{k:'公園',y:'こうえん',g:2},
    // 3年
    {k:'港',y:'みなと',g:3},{k:'湖',y:'みずうみ',g:3},{k:'橋',y:'はし',g:3},{k:'皿',y:'さら',g:3},
    {k:'坂',y:'さか',g:3},{k:'薬',y:'くすり',g:3},{k:'豆',y:'まめ',g:3},{k:'箱',y:'はこ',g:3},
    {k:'波',y:'なみ',g:3},{k:'指',y:'ゆび',g:3},{k:'命',y:'いのち',g:3},{k:'羽',y:'はね',g:3},
    {k:'泳ぐ',y:'およぐ',g:3},{k:'待つ',y:'まつ',g:3},{k:'投げる',y:'なげる',g:3},{k:'習う',y:'ならう',g:3},
    {k:'落ちる',y:'おちる',g:3},{k:'重い',y:'おもい',g:3},{k:'暑い',y:'あつい',g:3},{k:'悲しい',y:'かなしい',g:3},
    {k:'短い',y:'みじかい',g:3},{k:'運動',y:'うんどう',g:3},{k:'地図',y:'ちず',g:3},{k:'旅行',y:'りょこう',g:3},
    {k:'宿題',y:'しゅくだい',g:3},{k:'相談',y:'そうだん',g:3}
  ];

  /* ---------- ユーティリティ ---------- */
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function numChoices(ans) {
    var set = {}, out = [String(ans)];
    set[ans] = 1;
    var cand = shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 3, ans + 100, ans - 100]);
    for (var i = 0; i < cand.length && out.length < 4; i++) {
      if (cand[i] >= 0 && !set[cand[i]]) { set[cand[i]] = 1; out.push(String(cand[i])); }
    }
    var n = 1;
    while (out.length < 4) { var v = ans + 3 + n++; if (!set[v]) { set[v] = 1; out.push(String(v)); } }
    return shuffle(out);
  }
  function validProblem(p) {
    if (!(p && typeof p.q === 'string' && Array.isArray(p.choices) && p.choices.length >= 2 &&
          p.choices.map(String).indexOf(String(p.answer)) >= 0)) return false;
    if (p.games !== undefined) {   // 書くなら「文字列の配列」。それ以外は不正として無視する
      if (!Array.isArray(p.games) || p.games.some(function (g) { return typeof g !== 'string'; })) return false;
    }
    return true;
  }

  /* ---------- スタイル（1回だけ注入） ---------- */
  var CSS =
    '.aq-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,.82);font-family:"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN",sans-serif;' +
    'padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);' +
    'touch-action:manipulation;user-select:none;-webkit-user-select:none;animation:aq-fade .2s}' +
    '@keyframes aq-fade{from{opacity:0}to{opacity:1}}' +
    '.aq-card{position:relative;width:min(92vw,560px);max-height:94vh;overflow:auto;border-radius:20px;color:#fff;' +
    'padding:18px 18px 22px;box-sizing:border-box;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center}' +
    '.aq-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}' +
    '.aq-badge{font-size:12px;background:rgba(0,0,0,.35);border-radius:6px;padding:2px 8px;letter-spacing:.1em}' +
    '.aq-close{width:22px;height:22px;border-radius:50%;border:0;font-size:13px;line-height:22px;padding:0;' +
    'background:rgba(255,255,255,.35);color:#fff;opacity:.55;cursor:pointer}' +
    '.aq-close.aq-ready{background:#fff;color:#333;opacity:1}' +
    '.aq-timer{font-size:12px;opacity:.9}' +
    '.aq-brand{font-size:20px;font-weight:bold;margin:4px 0 0}' +
    '.aq-icon{font-size:44px;margin:2px 0}' +
    '.aq-catch{font-size:14px;margin:0 0 10px;opacity:.95}' +
    '.aq-box{background:rgba(255,255,255,.95);color:#222;border-radius:16px;padding:14px 10px 16px}' +
    '.aq-label{display:inline-block;font-size:12px;font-weight:bold;background:#222;color:#fff;border-radius:999px;padding:2px 10px}' +
    '.aq-q{font-size:30px;font-weight:bold;margin:10px 0 12px;line-height:1.3}' +
    '.aq-q.aq-small{font-size:20px}' +
    '.aq-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.aq-choice{font-family:inherit;font-size:26px;font-weight:bold;padding:14px 6px;border-radius:14px;border:3px solid #222;background:#fff;color:#222;cursor:pointer}' +
    '.aq-choice:active{transform:scale(.96)}' +
    '.aq-choice.aq-ok{background:#2ecc71;border-color:#1e8449;color:#fff}' +
    '.aq-choice.aq-ng{background:#e74c3c;border-color:#922b21;color:#fff}' +
    '.aq-choice[disabled]{pointer-events:none}' +
    '.aq-msg{min-height:34px;font-size:22px;font-weight:bold;margin-top:12px;color:#222}' +
    '.aq-cta{font-family:inherit;margin-top:10px;font-size:16px;padding:10px 18px;border:0;border-radius:999px;font-weight:bold;background:#222;color:#fff;display:none;cursor:pointer}' +
    '.aq-cta.aq-show{display:inline-block}' +
    '.aq-shake{animation:aq-shake .35s}' +
    '@keyframes aq-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}';

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('aq-style')) return;
    var s = document.createElement('style');
    s.id = 'aq-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ================= インスタンス ================= */
  function create(userOptions) {
    userOptions = userOptions || {};
    var CONFIG = {}, k;
    for (k in DEFAULTS) CONFIG[k] = DEFAULTS[k];
    for (k in userOptions) if (k !== 'text') CONFIG[k] = userOptions[k];
    var TEXT = {};
    for (k in DEFAULT_TEXT) TEXT[k] = DEFAULT_TEXT[k];
    if (userOptions.text) for (k in userOptions.text) TEXT[k] = userOptions.text[k];

    var kanji = KANJI_DEFAULT.slice();
    var ads = ADS_DEFAULT.slice();
    var custom = [];
    var counter = 0, showing = false, lastShownAt = 0, dismissCurrent = null;
    var actx = null;

    /* ----- 効果音 ----- */
    function beep(freqs, dur) {
      if (!CONFIG.sound) return;
      dur = dur || 0.12;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = actx || new AC();
        if (actx.state === 'suspended' && actx.resume) actx.resume();
        freqs.forEach(function (f, i) {
          var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * dur;
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0.15, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
          o.connect(g); g.connect(actx.destination);
          o.start(t0); o.stop(t0 + dur);
        });
      } catch (e) { /* 音が鳴らなくてもゲームは続ける */ }
    }

    /* ----- 問題生成 ----- */
    function gradeList() { return (CONFIG.grade && CONFIG.grade.length) ? CONFIG.grade : [2, 3]; }
    function minGrade() { return Math.min.apply(null, gradeList()); }
    function maxGrade() { return Math.max.apply(null, gradeList()); }

    function kanjiPool() {
      var lo = minGrade(), hi = maxGrade();
      var pool = kanji.filter(function (x) { return x.g >= lo && x.g <= hi; });
      return pool.length >= 4 ? pool : kanji.filter(function (x) { return x.g >= 2; });
    }
    function distractorPool() {
      var lo = Math.min(3, minGrade());
      return kanji.filter(function (x) { return x.g >= lo; });
    }

    function genCalc() {
      var g = Math.min(4, pick(gradeList())), q, ans, a, b, c, t;
      if (g <= 1) {
        if (Math.random() < 0.6) { a = 1 + rnd(9); b = 1 + rnd(10); q = a + ' ＋ ' + b; ans = a + b; }
        else { a = 5 + rnd(15); b = 1 + rnd(Math.min(a, 9)); q = a + ' − ' + b; ans = a - b; }
      } else if (g === 2) {
        t = rnd(5);
        if (t === 0) { a = 10 + rnd(80); b = 10 + rnd(80); q = a + ' ＋ ' + b; ans = a + b; }
        else if (t === 1) { a = 30 + rnd(70); b = 10 + rnd(a - 15); q = a + ' − ' + b; ans = a - b; }
        else if (t === 2) { a = 2 + rnd(8); b = 2 + rnd(8); q = a + ' × ' + b; ans = a * b; }
        else if (t === 3) { a = 100 + rnd(100); b = (1 + rnd(9)) * 10; q = a + ' − ' + b; ans = a - b; }
        else { a = 5 + rnd(40); b = 5 + rnd(40); q = '□ ＋ ' + b + ' ＝ ' + (a + b); ans = a; }
      } else if (g === 3) {
        t = rnd(5);
        if (t === 0) { a = 100 + rnd(800); b = 100 + rnd(800); q = a + ' ＋ ' + b; ans = a + b; }
        else if (t === 1) { a = 300 + rnd(700); b = 100 + rnd(a - 150); q = a + ' − ' + b; ans = a - b; }
        else if (t === 2) { a = 11 + rnd(89); b = 2 + rnd(8); q = a + ' × ' + b; ans = a * b; }
        else if (t === 3) { b = 2 + rnd(8); c = 2 + rnd(8); q = (b * c) + ' ÷ ' + b; ans = c; }
        else { a = 2 + rnd(8); b = 2 + rnd(8); q = '□ × ' + b + ' ＝ ' + (a * b); ans = a; }
      } else {
        t = rnd(4);
        if (t === 0) { a = 11 + rnd(20); b = 11 + rnd(20); q = a + ' × ' + b; ans = a * b; }
        else if (t === 1) { b = 2 + rnd(8); c = 12 + rnd(88); q = (b * c) + ' ÷ ' + b; ans = c; }
        else if (t === 2) { b = 101 + rnd(800); q = '1000 − ' + b; ans = 1000 - b; }
        else { a = 2 + rnd(8); b = 2 + rnd(8); c = 2 + rnd(8); q = a + ' ＋ ' + b + ' × ' + c; ans = a + b * c; }
      }
      var text = q.indexOf('□') >= 0 ? q + TEXT.blankSuffix : q + ' ＝ ？';
      return { label: TEXT.calcLabel, q: text, big: true, choices: numChoices(ans), answer: String(ans) };
    }

    function genKanjiRead() {
      var t = pick(kanjiPool()), seen = {}, wrong = [], all = shuffle(distractorPool());
      seen[t.y] = 1;
      for (var i = 0; i < all.length && wrong.length < 3; i++) {
        if (!seen[all[i].y]) { seen[all[i].y] = 1; wrong.push(all[i].y); }
      }
      return { label: TEXT.kanjiReadLabel, q: TEXT.kanjiReadQ(t.k), big: true, choices: shuffle([t.y].concat(wrong)), answer: t.y };
    }

    function genKanjiWrite() {
      var t = pick(kanjiPool());
      // 同じ読みの別漢字（日/火）は選択肢に入れない
      var wrong = shuffle(distractorPool().filter(function (x) { return x.y !== t.y && x.k !== t.k; }))
        .slice(0, 3).map(function (x) { return x.k; });
      return { label: TEXT.kanjiWriteLabel, q: TEXT.kanjiWriteQ(t.y), big: true, choices: shuffle([t.k].concat(wrong)), answer: t.k };
    }

    // games を持たない問題は全ゲーム共通。持つ問題は gameId が一致するときだけ（gameId 未設定なら出さない）
    function customPool() {
      return custom.filter(function (c) {
        if (!c.games) return true;
        return !!CONFIG.gameId && c.games.indexOf(CONFIG.gameId) >= 0;
      });
    }

    function genProblem() {
      if (typeof CONFIG.problemProvider === 'function') {
        try { var pp = CONFIG.problemProvider(); if (validProblem(pp)) return normalize(pp); } catch (e) { /* 無視して内蔵へ */ }
      }
      var cp = customPool();
      if (cp.length && Math.random() < CONFIG.customRatio) {
        var c = pick(cp);
        return { label: c.label || TEXT.customLabel, q: c.q, big: false, choices: shuffle(c.choices.map(String)), answer: String(c.answer) };
      }
      var kinds = CONFIG.kinds && CONFIG.kinds.length ? CONFIG.kinds : ['calc'];
      var kind = pick(kinds);
      return kind === 'kanjiRead' ? genKanjiRead() : kind === 'kanjiWrite' ? genKanjiWrite() : genCalc();
    }

    function normalize(p) {
      return { label: p.label || TEXT.customLabel, q: p.q, big: p.big !== false && p.q.length <= 12,
               choices: shuffle(p.choices.map(String)), answer: String(p.answer) };
    }

    /* ----- 表示 ----- */
    function show(opts) {
      opts = opts || {};
      if (showing || typeof document === 'undefined') return Promise.resolve(null);
      showing = true;
      lastShownAt = Date.now();
      injectCss();

      var ad = pick(ads);
      var p = opts.problem && validProblem(opts.problem) ? normalize(opts.problem) : genProblem();
      var startedAt = Date.now();
      var answered = false, correct = false, remaining = CONFIG.skipAfterSec, tries = 0;

      var overlay = document.createElement('div');
      overlay.className = 'aq-overlay';
      overlay.style.zIndex = String(CONFIG.zIndex);
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML =
        '<div class="aq-card">' +
          '<div class="aq-top"><span class="aq-badge"></span><span class="aq-timer"></span>' +
          '<button type="button" class="aq-close">✕</button></div>' +
          '<div class="aq-icon"></div><p class="aq-brand"></p><p class="aq-catch"></p>' +
          '<div class="aq-box"><span class="aq-label"></span><div class="aq-q"></div>' +
          '<div class="aq-choices"></div><div class="aq-msg"></div>' +
          '<button type="button" class="aq-cta"></button></div>' +
        '</div>';

      function $(sel) { return overlay.querySelector(sel); }
      var card = $('.aq-card'), timer = $('.aq-timer'), closeBtn = $('.aq-close'),
          choicesEl = $('.aq-choices'), msg = $('.aq-msg'), cta = $('.aq-cta');

      card.style.background = 'linear-gradient(135deg,' + ad.c1 + ',' + ad.c2 + ')';
      $('.aq-badge').textContent = TEXT.badge;
      closeBtn.setAttribute('aria-label', TEXT.closeLabel);
      $('.aq-icon').textContent = ad.icon || '';
      $('.aq-brand').textContent = ad.brand || '';
      $('.aq-catch').textContent = ad.catch || '';
      $('.aq-label').textContent = p.label;
      var qEl = $('.aq-q');
      qEl.textContent = p.q;
      if (!p.big) qEl.classList.add('aq-small');
      cta.textContent = ad.cta || 'OK';

      // 広告の裏のゲームにタップ・キーが届かないようにする（window/document のバブリング側リスナー対策）
      ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend',
       'click', 'keydown', 'keyup', 'wheel'].forEach(function (ev) {
        overlay.addEventListener(ev, function (e) { e.stopPropagation(); });
      });

      function canClose() { return remaining <= 0 || answered; }
      function updateTimer() {
        if (canClose()) { timer.textContent = ''; closeBtn.classList.add('aq-ready'); }
        else timer.textContent = TEXT.timer(remaining);
      }
      updateTimer();
      var iv = setInterval(function () { if (remaining > 0) remaining--; updateTimer(); }, 1000);

      var resolveFn;
      var promise = new Promise(function (res) { resolveFn = res; });
      var finished = false;

      function finish() {
        if (finished) return;
        finished = true;
        clearInterval(iv);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        showing = false;
        dismissCurrent = null;
        var result = { answered: answered, correct: correct, tries: tries, ms: Date.now() - startedAt };
        try { if (typeof opts.onClose === 'function') opts.onClose(result); } catch (e) { console.error(e); }
        try { if (typeof CONFIG.onClose === 'function') CONFIG.onClose(result); } catch (e) { console.error(e); }
        resolveFn(result);
      }
      dismissCurrent = finish;

      function shake() {
        card.classList.remove('aq-shake'); void card.offsetWidth; card.classList.add('aq-shake');
      }

      closeBtn.addEventListener('click', function () {
        if (canClose()) finish();
        else { shake(); msg.textContent = TEXT.notYet; beep([220], 0.15); }
      });
      cta.addEventListener('click', finish);

      p.choices.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'aq-choice';
        b.textContent = c;
        b.addEventListener('click', function () {
          if (answered) return;
          tries++;
          if (c === p.answer) {
            answered = true; correct = true;
            b.classList.add('aq-ok');
            msg.textContent = tries === 1 ? TEXT.correctFirst : TEXT.correct;
            beep([660, 880, 1100]);
            Array.prototype.forEach.call(choicesEl.querySelectorAll('button'), function (x) { x.disabled = true; });
            cta.classList.add('aq-show');
            updateTimer();
          } else {
            b.classList.add('aq-ng'); b.disabled = true;
            msg.textContent = TEXT.wrong;
            beep([300, 220]);
            shake();
          }
        });
        choicesEl.appendChild(b);
      });

      (CONFIG.container || document.body).appendChild(overlay);
      try { if (typeof CONFIG.onShow === 'function') CONFIG.onShow(); } catch (e) { console.error(e); }
      return promise;
    }

    /* 節目ごとに呼ぶ。everyN 回に1回、広告を出す。出したら true */
    function tick(opts) {
      counter++;
      if (counter % Math.max(1, CONFIG.everyN) !== 0) return false;
      if (CONFIG.minIntervalSec > 0 && Date.now() - lastShownAt < CONFIG.minIntervalSec * 1000) return false;
      if (showing) return false;
      show(opts);
      return true;
    }

    /* problems.json などを読み込んで手作り問題に追加。URL は1つでも配列でも可。
       失敗したURLは0件として扱い、例外は投げない。追加できた合計件数を返す */
    function loadOne(url) {
      if (typeof fetch !== 'function') return Promise.resolve(0);
      return fetch(url, { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (arr) { return addProblems(Array.isArray(arr) ? arr : []); })
        .catch(function () { return 0; });
    }
    function loadProblems(urls) {
      var list = Array.isArray(urls) ? urls : [urls];
      return Promise.all(list.map(loadOne)).then(function (ns) {
        return ns.reduce(function (a, b) { return a + b; }, 0);
      });
    }

    function problemKey(p) { return p.q + '\u0000' + String(p.answer) + '\u0000' + p.choices.map(String).join('|'); }

    function addProblems(arr) {
      var n = 0;
      (arr || []).forEach(function (p) {
        if (!validProblem(p)) return;
        var key = problemKey(p);
        if (custom.some(function (c) { return problemKey(c) === key; })) return;   // 二重読み込みで増えないように
        custom.push(p); n++;
      });
      return n; // 新しく追加できた件数
    }

    return {
      version: VERSION,
      config: CONFIG,
      configure: function (o) {
        o = o || {};
        for (var key in o) {
          if (key === 'text') for (var tk in o.text) TEXT[tk] = o.text[tk];
          else CONFIG[key] = o[key];
        }
        return CONFIG;
      },
      show: show,
      tick: tick,
      reset: function () { counter = 0; lastShownAt = 0; },
      dismiss: function () { if (dismissCurrent) dismissCurrent(); },   // ゲームオーバー時などに強制で閉じる
      isShowing: function () { return showing; },
      addProblems: addProblems,
      loadProblems: loadProblems,
      addKanji: function (arr) { (arr || []).forEach(function (x) { if (x && x.k && x.y && x.g) kanji.push(x); }); },
      addAds: function (arr) { (arr || []).forEach(function (x) { if (x && x.brand) ads.push(x); }); },
      setAds: function (arr) { if (arr && arr.length) ads = arr.slice(); },
      // テスト用: 問題だけ生成して返す
      _genProblem: genProblem
    };
  }

  return create;
});
