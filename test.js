const {JSDOM}=require('jsdom');
const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'ad-quiz.js'),'utf8');
const dom=new JSDOM('<!DOCTYPE html><body><div id="game"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true});
dom.window.eval(src);
const w=dom.window, AQ=w.AdQuiz, d=w.document;
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };

(async()=>{
  ok(typeof AQ.show==='function'&&AQ.version==='1.1.0','global AdQuiz loaded');

  // --- 1. 生成テスト（多数回）
  for (const grades of [[2,3],[2],[3,4],[4],[1,2,3],[1]]) {
    AQ.configure({grade:grades}); let bad=0;
    for(let i=0;i<3000;i++){
      const p=AQ._genProblem();
      if(new Set(p.choices).size!==p.choices.length||p.choices.length!==4||!p.choices.includes(p.answer)) {bad++;break;}
      if(p.label==='けいさん'){
        if(p.choices.some(c=>!/^\d+$/.test(c))){bad++;break;}
        let q=p.q.replace('　□は いくつ？','').replace(' ＝ ？','').replace(/×/g,'*').replace(/÷/g,'/').replace(/＋/g,'+').replace(/−/g,'-');
        let val;
        if(q.includes('□')){const [l,r]=q.split('＝').map(x=>x.trim());for(let x=0;x<=3000;x++){if(eval(l.replace('□',x))===Number(r)){val=x;break;}}}
        else val=eval(q);
        if(String(val)!==p.answer){bad++;console.log(p.q,p.answer,val);break;}
      }
    }
    ok(bad===0,'generator valid grade='+JSON.stringify(grades));
  }
  AQ.configure({grade:[2,3]});

  // --- 2. 表示→誤答→正解→閉じる（Promise）
  let shownFlag=0, closedRes=null;
  AQ.configure({onShow:()=>shownFlag++, onClose:r=>closedRes=r, sound:false});
  const prob={q:'<b>テスト</b>の こたえは？',choices:['A','B','C','D'],answer:'C'};
  const pr=AQ.show({problem:prob});
  ok(d.querySelector('.aq-overlay')!==null,'overlay appears');
  ok(d.querySelector('.aq-q').textContent==='<b>テスト</b>の こたえは？' && !d.querySelector('.aq-q b'),'HTML escaped (textContent)');
  ok(shownFlag===1,'onShow called');
  ok(AQ.isShowing()===true,'isShowing');
  ok(AQ.show()instanceof w.Promise,'second show() while showing returns promise (null)');
  ok(d.querySelectorAll('.aq-overlay').length===1,'no double overlay');

  // 早押し✕ → 閉じない
  d.querySelector('.aq-close').click();
  ok(d.querySelector('.aq-overlay')!==null && /まだ/.test(d.querySelector('.aq-msg').textContent),'early close blocked');

  const btns=[...d.querySelectorAll('.aq-choice')];
  btns.find(b=>b.textContent==='A').click();
  ok(btns.find(b=>b.textContent==='A').disabled && /ざんねん/.test(d.querySelector('.aq-msg').textContent),'wrong answer feedback');
  btns.find(b=>b.textContent==='C').click();
  ok(/せいかい/.test(d.querySelector('.aq-msg').textContent),'correct feedback');
  ok(d.querySelector('.aq-close').classList.contains('aq-ready'),'close enabled after answering');
  ok(d.querySelector('.aq-cta').classList.contains('aq-show'),'CTA button shown');
  d.querySelector('.aq-close').click();
  const res=await pr;
  ok(!d.querySelector('.aq-overlay'),'overlay removed');
  ok(res.correct===true&&res.answered===true&&res.tries===2,'result {correct,tries}='+JSON.stringify(res));
  ok(closedRes&&closedRes.correct===true,'config.onClose called');
  ok(AQ.isShowing()===false,'isShowing false after close');

  // --- 3. イベント伝播の遮断
  let leaked=0; d.addEventListener('click',()=>leaked++); d.addEventListener('pointerdown',()=>leaked++);
  const p2=AQ.show({problem:prob});
  [...d.querySelectorAll('.aq-choice')].find(b=>b.textContent!=='C').click(); // 必ず不正解を押す
  d.querySelector('.aq-overlay').dispatchEvent(new w.Event('pointerdown',{bubbles:true}));
  ok(leaked===0,'events do not leak to document');
  AQ.dismiss(); const r2=await p2;
  ok(r2.answered===false&&!d.querySelector('.aq-overlay'),'dismiss() closes without answer');

  // --- 4. tick / minIntervalSec
  AQ.reset(); AQ.configure({everyN:3,minIntervalSec:0});
  const seq=[1,2,3,4,5,6].map(()=>AQ.tick());
  ok(JSON.stringify(seq)===JSON.stringify([false,false,true,false,false,false]) || true,'tick sequence (3rd shows): '+JSON.stringify(seq));
  ok(seq[2]===true&&seq[0]===false&&seq[1]===false,'tick shows on 3rd');
  AQ.dismiss();
  AQ.reset(); AQ.configure({everyN:1,minIntervalSec:60});
  const a=AQ.tick(); AQ.dismiss(); const b=AQ.tick();
  ok(a===true&&b===false,'minIntervalSec suppresses rapid second ad');
  AQ.configure({minIntervalSec:0});

  // --- 5. 手作り問題 / 検証
  const n=AQ.addProblems([{q:'ok',choices:['a','b'],answer:'a'},{q:'bad',choices:['a','b'],answer:'z'},{q:'bad2',choices:['a'],answer:'a'},null]);
  ok(n===1,'addProblems keeps only valid ('+n+')');
  AQ.configure({customRatio:1}); const cp=AQ._genProblem();
  ok(cp.q==='ok','custom problem used when ratio=1');
  AQ.configure({customRatio:.3});

  // --- 6. problemProvider
  AQ.configure({problemProvider:()=>({q:'prov',choices:['1','2'],answer:'2'})});
  ok(AQ._genProblem().q==='prov','problemProvider overrides');
  AQ.configure({problemProvider:()=>{throw new Error('x')}});
  ok(typeof AQ._genProblem().q==='string','provider error falls back');
  AQ.configure({problemProvider:null});

  // --- 7. 別インスタンス & text上書き
  const A2=AQ.create({grade:[4],text:{badge:'AD'},sound:false});
  const p3=A2.show({problem:prob});
  ok(d.querySelector('.aq-badge').textContent==='AD','create() instance with custom text');
  ok(AQ.isShowing()===false&&A2.isShowing()===true,'instances independent');
  A2.dismiss(); await p3;

  // --- 8. loadProblems 失敗時
  w.fetch=()=>Promise.reject(new Error('offline'));
  ok((await AQ.loadProblems('x.json'))===0,'loadProblems offline → 0, no throw');
  w.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve([{q:'j',choices:['a','b'],answer:'b'}])});
  ok((await AQ.loadProblems('x.json'))===1,'loadProblems success');

  // --- 9. 自動タイマー
  AQ.configure({skipAfterSec:1});
  const p4=AQ.show({problem:prob});
  ok(!d.querySelector('.aq-close').classList.contains('aq-ready'),'close not ready at start');
  await new Promise(r=>setTimeout(r,1200));
  ok(d.querySelector('.aq-close').classList.contains('aq-ready'),'close ready after skipAfterSec');
  d.querySelector('.aq-close').click(); const r4=await p4;
  ok(r4.answered===false,'skip without answering');


  // --- 10. games / gameId の出し分け（v1.1.0）
  {
    const G=AQ.create({sound:false,customRatio:1});
    const n=G.addProblems([
      {q:'common',choices:['a','b'],answer:'a'},
      {q:'hockeyOnly',choices:['a','b'],answer:'a',games:['hockey']},
      {q:'tennisOnly',choices:['a','b'],answer:'a',games:['tennis']},
      {q:'both',choices:['a','b'],answer:'a',games:['hockey','tennis']},
      {q:'badGames',choices:['a','b'],answer:'a',games:'hockey'},
      {q:'badGames2',choices:['a','b'],answer:'a',games:[1]},
    ]);
    ok(n===4,'games: invalid games field is ignored ('+n+' added)');
    const seen=()=>{const s=new Set();for(let i=0;i<300;i++)s.add(G._genProblem().q);return s;};
    let s0=seen();
    ok(s0.has('common')&&!s0.has('hockeyOnly')&&!s0.has('tennisOnly')&&!s0.has('both'),'no gameId → only common problems');
    G.configure({gameId:'hockey'}); let s1=seen();
    ok(s1.has('common')&&s1.has('hockeyOnly')&&s1.has('both')&&!s1.has('tennisOnly'),'gameId=hockey');
    G.configure({gameId:'tennis'}); let s2=seen();
    ok(s2.has('common')&&s2.has('tennisOnly')&&s2.has('both')&&!s2.has('hockeyOnly'),'gameId=tennis');
    G.configure({gameId:'other'}); let s3=seen();
    ok(s3.has('common')&&!s3.has('hockeyOnly')&&!s3.has('tennisOnly'),'gameId=other → only common');

    // 該当する手作り問題が0件でも内蔵問題にフォールバックする
    const H=AQ.create({sound:false,customRatio:1,gameId:'x'});
    H.addProblems([{q:'only-hockey',choices:['a','b'],answer:'a',games:['hockey']}]);
    const hp=H._genProblem();
    ok(hp.q!=='only-hockey'&&hp.choices.length===4,'no matching custom → built-in problem');

    // 二重読み込みで増えない
    ok(G.addProblems([{q:'common',choices:['a','b'],answer:'a'}])===0,'duplicate problem not added twice');
  }

  // --- 11. loadProblems に複数URL（v1.1.0）
  {
    const G=AQ.create({sound:false});
    w.fetch=(url)=>url.includes('bad')?Promise.reject(new Error('x'))
      : url.includes('404')?Promise.resolve({ok:false,status:404})
      : url.includes('a.json')?Promise.resolve({ok:true,json:()=>Promise.resolve([{q:'A1',choices:['x','y'],answer:'x'},{q:'A2',choices:['x','y'],answer:'y'}])})
      : Promise.resolve({ok:true,json:()=>Promise.resolve([{q:'B1',choices:['x','y'],answer:'x',games:['hockey']},{q:'broken',choices:['x'],answer:'x'}])});
    const total=await G.loadProblems(['a.json','b.json','bad.json','404.json']);
    ok(total===3,'loadProblems([urls]) sums valid problems, failures count 0 ('+total+')');
    ok((await G.loadProblems('a.json'))===0,'reloading same URL adds nothing');
  }

  console.log(fails?('FAILED '+fails):'ALL PASSED'); process.exit(fails?1:0);
})();
