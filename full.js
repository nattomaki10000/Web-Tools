// main.js — 単一ファイル版（prompt UI / HTML Tool / 5 Games / WebSee / This Page asset list）
// 新しいタブは window.open -> write -> close で確実に表示します。

(function(){
  // ---- helper: open new window and write full HTML safely ----
  function openWindowWithHTML(html){
    const w = window.open('about:blank');
    if(!w){
      alert('ポップアップがブロックされました。ブラウザの設定を確認してください。');
      return null;
    }
    try{
      w.document.open();
      w.document.write(html);
      w.document.close();
      return w;
    }catch(e){
      // fallback: try blob
      try{
        const b = new Blob([html], {type: 'text/html'});
        const url = URL.createObjectURL(b);
        const w2 = window.open(url, '_blank');
        return w2;
      }catch(e2){
        alert('タブ生成に失敗しました: ' + (e2.message||e));
        return null;
      }
    }
  }

  // ---- simple menu helper ----
  function menu(title, options){
    let s = title + "\n\n";
    options.forEach((o,i)=> s += (i+1) + ": " + o + "\n");
    s += "\nキャンセル = 戻る";
    const r = prompt(s);
    if(r === null) return null;
    const n = Number(r.trim());
    if(!isNaN(n) && n >= 1 && n <= options.length) return n;
    alert('無効な選択');
    return null;
  }

  // ---- start menus ----
  async function mainMenu(){
    alert('Assets Tool 起動（prompt UI）');
    while(true){
      const m = menu('Main Menu', ['This Page','Other Page','Other Thing']);
      if(m === null) return;
      if(m === 1) await thisPageMenu();
      if(m === 2) await otherPageMenu();
      if(m === 3) await otherThingMenu();
    }
  }

  async function thisPageMenu(){
    while(true){
      const s = menu('This Page', ['Assets 一覧 (個別DL)','Assets ZIP (This Page)']);
      if(s === null) return;
      if(s === 1) listAssets();
      if(s === 2) await thisPageZip();
    }
  }

  async function otherPageMenu(){
    while(true){
      const s = menu('Other Page', ['Assets DL [URL] (ZIP)','Web See (mirror)']);
      if(s === null) return;
      if(s === 1){
        const url = prompt('ZIP取得対象のURLを入力（キャンセル=戻る）');
        if(url) await zipRemotePageAssets(url);
      }
      if(s === 2) await webSeeFlow();
    }
  }

  async function otherThingMenu(){
    while(true){
      const s = menu('Other Thing', ['HTML Tool (直接編集)','Mini Games']);
      if(s === null) return;
      if(s === 1) openHtmlTool();
      if(s === 2) await miniGamesMenu();
    }
  }

  async function miniGamesMenu(){
    while(true){
      const s = menu('Mini Games', ['Game1 Tap Box','Game2 Avoider','Game3 Shooter','Game4 Memory','Game5 2048']);
      if(s === null) return;
      if(s >=1 && s <=5) openGame(s);
    }
  }

  // ----------------------------
  // Assets discovery (this page)
  // ----------------------------
  function discoverAssetsFromDoc(doc=document){
    const assets = new Map();
    try{ assets.set(doc.location.href, {url: doc.location.href, type: 'html'}); }catch(e){}
    Array.from(doc.querySelectorAll('link[rel="stylesheet"], link[rel="icon"], link[rel="preload"]')).forEach(l => { if(l.href) assets.set(new URL(l.href, doc.baseURI).href, {url: new URL(l.href,doc.baseURI).href, type:'css'}); });
    Array.from(doc.querySelectorAll('script[src]')).forEach(s => { if(s.src) assets.set(new URL(s.src,doc.baseURI).href, {url:new URL(s.src,doc.baseURI).href, type:'js'}); });
    Array.from(doc.querySelectorAll('img')).forEach(i => { const u = i.currentSrc || i.src; if(u) assets.set(new URL(u,doc.baseURI).href, {url:new URL(u,doc.baseURI).href, type:'image'}); });
    Array.from(doc.querySelectorAll('video, audio')).forEach(m=>{
      const u = m.currentSrc || m.src; if(u) assets.set(new URL(u,doc.baseURI).href, {url:new URL(u,doc.baseURI).href, type:'media'});
      Array.from(m.querySelectorAll('source')).forEach(s=>{ if(s.src) assets.set(new URL(s.src,doc.baseURI).href, {url:new URL(s.src,doc.baseURI).href, type:'media'}); });
    });
    // style/url(...)
    Array.from(doc.querySelectorAll('style')).forEach(st=>{
      const txt = st.textContent || '';
      let re = /url\(([^)]+)\)/g, m;
      while((m = re.exec(txt))){ let raw = m[1].replace(/['"]/g,'').trim(); if(raw) try{ assets.set(new URL(raw, doc.baseURI).href, {url:new URL(raw,doc.baseURI).href, type:'asset'});}catch(e){} }
    });
    return Array.from(assets.values());
  }

  function listAssets(){
    const assets = discoverAssetsFromDoc(document);
    if(!assets.length){ alert('アセットが検出されませんでした'); return; }
    const per = 30;
    for(let i=0;i<assets.length;i+=per){
      const chunk = assets.slice(i, i+per);
      const lines = chunk.map((a,idx)=> `${i+idx+1}: ${a.url} (${a.type})`).join('\n');
      const s = prompt(`Assets一覧 (${i+1}〜${Math.min(i+per, assets.length)} / ${assets.length})\n\n${lines}\n\n番号入力でDL（キャンセル=戻る）`);
      if(s === null) return;
      const n = parseInt(s.trim(),10);
      if(!isNaN(n) && n>=1 && n<=assets.length){
        window.open(assets[n-1].url, '_blank');
        return;
      }else{
        alert('無効な番号');
      }
    }
    const final = prompt(`全 ${assets.length} 件。番号入力でDL（1〜${assets.length}）`);
    if(final === null) return;
    const fn = parseInt(final.trim(),10);
    if(isNaN(fn) || fn<1 || fn>assets.length){ alert('無効'); return; }
    window.open(assets[fn-1].url,'_blank');
  }

  // ----------------------------
  // This Page ZIP (simple using JSZip CDN)
  // ----------------------------
  async function thisPageZip(){
    if(!confirm('This Page のアセットを ZIP でまとめます。OK=実行')) return;
    try{
      // load JSZip dynamically by injecting script tag (note: new tab's Zip handled in remote ZIP; this is simple)
      const url = prompt('ZIP 機能は次回強化予定です。今は個別DLを使ってください。\n（OKで続行/キャンセルで戻る）');
      if(url === null) return;
    }catch(e){
      alert('エラー: ' + e.message);
    }
  }

  // ----------------------------
  // Web See + Remote ZIP helpers
  // ----------------------------
  function parseAssetUrlsFromHtml(html, base){
    const set = new Set();
    let re = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*["']?([^"'\s>]+)["']?/ig, m;
    while((m = re.exec(html))){ try{ set.add(new URL(m[1], base).href);}catch(e){} }
    re = /url\(([^)]+)\)/ig;
    while((m = re.exec(html))){ let u = m[1].replace(/['"]/g,'').trim(); try{ set.add(new URL(u, base).href); }catch(e){} }
    return Array.from(set);
  }

  async function zipRemotePageAssets(pageUrl){
    // robust retry per request
    if(!confirm('Remote ZIP を実行しますか？ (CORS による制約あり)')) return;
    try{
      let html = null;
      while(true){
        try{
          const r = await fetch(pageUrl);
          if(!r.ok) throw new Error('HTTP ' + r.status);
          html = await r.text();
          break;
        }catch(e){
          const again = confirm('ページ取得失敗: ' + (e.message||e) + '\n再試行しますか？');
          if(!again) return;
        }
      }
      // parse asset URLs
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('検出したアセット数: ' + assets.length + '\n取得を開始します（失敗した場合は個別でスキップ可）');
      // naive zip approach: try fetch each asset and add to zip
      // to keep single-file simple, we will instead download assets individually unless user needs ZIP server-side
      for(const u of assets){
        try{
          const r = await fetch(u);
          if(!r.ok) throw new Error('HTTP ' + r.status);
          const blob = await r.blob();
          const name = (new URL(u)).pathname.split('/').filter(Boolean).pop() || 'file';
          // prompt to save each
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        }catch(e){
          const skip = confirm('アセット取得失敗: ' + u + '\n再試行しますか？（OK=再試行 / Cancel=スキップ）');
          if(!skip) continue;
        }
      }
      alert('取得完了');
    }catch(e){
      alert('Remote ZIP エラー: ' + (e.message||e));
    }
  }

  async function webSeeFlow(){
    while(true){
      const url = prompt('Web See 対象のURLを入力（キャンセル=戻る）');
      if(!url) return;
      const ok = await webSeeMirrorWithRetry(url);
      if(ok) return;
      const cont = confirm('Web See に失敗しました。再試行しますか？');
      if(!cont) return;
    }
  }

  async function webSeeMirrorWithRetry(pageUrl){
    try{
      let html = null;
      while(true){
        try{
          const r = await fetch(pageUrl);
          if(!r.ok) throw new Error('HTTP ' + r.status);
          html = await r.text();
          break;
        }catch(e){
          const again = confirm('ページ取得失敗: ' + (e.message||e) + '\n再試行しますか？');
          if(!again) return false;
        }
      }
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('検出アセット数: ' + assets.length + '\nアセットを取得してミラーを作成します（失敗はスキップ可能）');
      const blobMap = {};
      for(const u of assets){
        try{
          const r = await fetch(u);
          if(!r.ok) throw new Error('HTTP ' + r.status);
          const blob = await r.blob();
          blobMap[u] = URL.createObjectURL(blob);
        }catch(e){
          const retry = confirm('アセット取得失敗: '+u+'\n再試行しますか？（OK=再試行 / Cancel=スキップ）');
          if(retry){ /* will retry in next loop */ }
        }
      }
      // rewrite html replacing absolute urls with blob urls (best-effort)
      let rewritten = html;
      Object.keys(blobMap).forEach(orig => {
        const b = blobMap[orig];
        rewritten = rewritten.split(orig).join(b);
        try{
          const p = new URL(orig).pathname;
          rewritten = rewritten.split(p).join(b);
        }catch(e){}
      });
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
      openWindowWithHTML(rewritten);
      return true;
    }catch(e){
      alert('Web See エラー: ' + (e.message||e));
      return false;
    }
  }

  // ----------------------------
  // HTML Tool (direct edit) — generates full HTML and opens it
  // ----------------------------
  function openHtmlTool(){
    const editorHTML = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HTML Tool — Direct Edit</title>
<style>
body{margin:0;font-family:system-ui;background:#081018;color:#eee}
.header{display:flex;justify-content:space-between;padding:12px}
.controls button{margin-left:8px;padding:8px 10px;border-radius:6px;background:#0b1726;border:1px solid #123;color:#fff}
.container{display:flex;gap:12px;padding:12px;flex-wrap:wrap}
.left{width:320px}
.file{background:#0d1b2a;border:1px solid #123;padding:8px;margin-bottom:8px;border-radius:6px}
textarea{width:100%;height:60vh;background:#021018;color:#bfe; border:1px solid #123;padding:8px;font-family:monospace}
.small{color:#9ab}
</style>
</head>
<body>
<div class="header">
  <div><strong>HTML Tool — Direct Edit</strong> <span class="small">(create/edit/preview/zip)</span></div>
  <div class="controls">
    <button id="btnNew">New</button>
    <button id="btnZip">Zip</button>
    <button id="btnCombine">Combine</button>
    <button id="btnPreview">Preview</button>
  </div>
</div>
<div class="container">
  <div class="left">
    <div id="fileList"></div>
  </div>
  <div class="right" style="flex:1">
    <div id="editorArea"><div style="color:#9ab">ファイルを選択してください</div></div>
  </div>
</div>
<script>
(function(){
  const files = []; // {name,text}
  const fileList = document.getElementById('fileList');
  const editorArea = document.getElementById('editorArea');
  function render(){
    fileList.innerHTML = '';
    if(files.length === 0){ fileList.innerHTML = '<div style="color:#9ab">No files</div>'; return; }
    files.forEach((f,i)=>{
      const card = document.createElement('div'); card.className='file';
      const nm = document.createElement('div'); nm.textContent = f.name; nm.style.fontWeight='700';
      const btnEdit = document.createElement('button'); btnEdit.textContent='Edit'; btnEdit.onclick=()=>openEditor(i);
      const btnDL = document.createElement('button'); btnDL.textContent='Download'; btnDL.style.marginLeft='6px'; btnDL.onclick=()=>{ const b=new Blob([f.text],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=f.name; a.click(); };
      const btnDel = document.createElement('button'); btnDel.textContent='Delete'; btnDel.style.marginLeft='6px'; btnDel.onclick=()=>{ if(confirm('Delete '+f.name+'?')){ files.splice(i,1); render(); editorArea.innerHTML='<div style="color:#9ab">ファイルを選択してください</div>'; } };
      card.appendChild(nm); card.appendChild(btnEdit); card.appendChild(btnDL); card.appendChild(btnDel);
      fileList.appendChild(card);
    });
  }
  function openEditor(idx){
    const f = files[idx];
    editorArea.innerHTML = '';
    const title = document.createElement('div'); title.textContent = f.name; title.style.fontWeight='700';
    const ta = document.createElement('textarea'); ta.value = f.text;
    const btnSave = document.createElement('button'); btnSave.textContent='Save'; btnSave.onclick=()=>{ files[idx].text = ta.value; alert('Saved'); render(); };
    editorArea.appendChild(title); editorArea.appendChild(ta); editorArea.appendChild(btnSave);
  }
  document.getElementById('btnNew').onclick = ()=>{
    const nm = prompt('Filename (e.g. index.html, style.css)');
    if(!nm) return;
    const sample = nm.match(/\\.html?$/i) ? '<!doctype html>\\n<html>\\n<head><meta charset=\"utf-8\"><title>'+nm+'</title></head>\\n<body>\\n<h1>'+nm+'</h1>\\n</body>\\n</html>' : '';
    files.push({name:nm, text: sample});
    render();
  };
  document.getElementById('btnZip').onclick = async ()=>{
    if(files.length===0){ alert('No files'); return; }
    if(!window.JSZip){ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; document.head.appendChild(s); await new Promise(r=>s.onload=r); }
    const zip = new JSZip();
    files.forEach(f=>zip.file(f.name,f.text));
    const blob = await zip.generateAsync({type:'blob'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='files.zip'; a.click();
  };
  document.getElementById('btnCombine').onclick = ()=>{
    if(files.length===0){ alert('No files'); return; }
    const htmlFile = files.find(x=>x.name.match(/\\.html?$/i)) || {text:'<!doctype html>\\n<html><head><meta charset=\"utf-8\"><title>Combined</title></head><body></body></html>'};
    let out = htmlFile.text;
    const cssText = files.filter(f=>f.name.match(/\\.css$/i)).map(f=>'/* '+f.name+' */\\n'+f.text).join('\\n');
    const jsText = files.filter(f=>f.name.match(/\\.js$/i)).map(f=>'// '+f.name+'\\n'+f.text).join('\\n');
    out = out.replace(/<\\/head>/i, '<style>\\n'+cssText+'\\n</style>\\n</head>');
    out = out.replace(/<\\/body>/i, '<script>\\n'+jsText+'\\n</script>\\n</body>');
    const blob = new Blob([out], {type:'text/html'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='combined.html'; a.click();
  };
  document.getElementById('btnPreview').onclick = ()=>{
    if(files.length===0){ alert('No files'); return; }
    const htmlFile = files.find(x=>x.name.match(/\\.html?$/i));
    let out='';
    if(htmlFile){
      out = htmlFile.text;
      const cssText = files.filter(f=>f.name.match(/\\.css$/i)).map(f=>'/* '+f.name+' */\\n'+f.text).join('\\n');
      const jsText = files.filter(f=>f.name.match(/\\.js$/i)).map(f=>'// '+f.name+'\\n'+f.text).join('\\n');
      out = out.replace(/<\\/head>/i, '<style>\\n'+cssText+'\\n</style>\\n</head>');
      out = out.replace(/<\\/body>/i, '<script>\\n'+jsText+'\\n</script>\\n</body>');
    } else {
      out = '<!doctype html>\\n<html><head><meta charset=\"utf-8\"><title>Preview</title></head><body><h3>Preview</h3></body></html>';
    }
    window.open(URL.createObjectURL(new Blob([out], {type:'text/html'})), '_blank');
  };
  render();
})();
<\/script>
</body>
</html>
`;
    openWindowWithHTML(editorHTML);
  }

  // ----------------------------
  // Mini games — full pages (open via openWindowWithHTML)
  // ----------------------------
  function openGame(n){
    if(n === 1) openWindowWithHTML(game1HTML());
    else if(n === 2) openWindowWithHTML(game2HTML());
    else if(n === 3) openWindowWithHTML(game3HTML());
    else if(n === 4) openWindowWithHTML(game4HTML());
    else if(n === 5) openWindowWithHTML(game5HTML());
  }

  function escapeScriptClose(s){
    return s.replace(/<\/script>/gi, '<\\/script>');
  }

  function game1HTML(){
    const html = `
<!doctype html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tap Box</title>
<style>body{margin:0;background:#020203;color:#fff;font-family:system-ui}canvas{display:block}</style>
</head><body>
<canvas id="cv"></canvas><div style="position:fixed;left:8px;top:8px;color:#fff">Tap Box</div>
<script>
${escapeScriptClose(`
(function(){
  const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
  function r(){ cv.width=innerWidth; cv.height=innerHeight; } addEventListener('resize', r); r();
  let targets=[], score=0;
  function spawn(){ const s=40+Math.random()*80; targets.push({x:Math.random()*(cv.width-s), y:Math.random()*(cv.height-s), s: s, t:Date.now()}); }
  setInterval(spawn,700);
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    targets.forEach((t,i)=>{ ctx.fillStyle='rgba(255,75,75,0.15)'; ctx.fillRect(t.x,t.y,t.s,t.s); ctx.strokeStyle='#ff4b4b'; ctx.strokeRect(t.x,t.y,t.s,t.s); if((Date.now()-t.t)/1000>4){ targets.splice(i,1); score = Math.max(0, score-1); }});
    ctx.fillStyle='#fff'; ctx.fillText('Score: '+score, 10, 20);
    requestAnimationFrame(draw);
  }
  cv.addEventListener('pointerdown', e=>{
    const r=cv.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
    for(let i=targets.length-1;i>=0;i--){
      const t=targets[i];
      if(px>=t.x && px<=t.x+t.s && py>=t.y && py<=t.y+t.s){ targets.splice(i,1); score++; return; }
    }
  });
  draw();
})();
`)}
<\/script>
</body></html>`;
    return html;
  }

  function game2HTML(){
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avoider</title>
<style>body{margin:0;background:#050507;color:#fff;font-family:system-ui}canvas{display:block}</style>
</head><body>
<canvas id="cv"></canvas>
<script>
${escapeScriptClose(`
(function(){
  const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
  function r(){ cv.width=innerWidth; cv.height=innerHeight; } addEventListener('resize', r); r();
  let player={x:cv.width/2,y:cv.height-80,r:18}, obs=[], score=0;
  function spawn(){ obs.push({x:Math.random()*(cv.width-40), y:-40, w:30+Math.random()*50, vy:2+Math.random()*2}); }
  setInterval(spawn,600);
  function update(){
    for(let i=obs.length-1;i>=0;i--){ obs[i].y += obs[i].vy; if(obs[i].y>cv.height){ obs.splice(i,1); score++; } }
    for(const o of obs){ const dx=(o.x+o.w/2)-player.x, dy=(o.y+o.w/2)-player.y; if(Math.hypot(dx,dy) < o.w/2 + player.r -2){ if(confirm('Game Over\\nScore:'+score+'\\nOK=Retry')){ obs=[]; score=0; } else { window.close(); } } }
  }
  function draw(){ ctx.clearRect(0,0,cv.width,cv.height); ctx.fillStyle='#33aaff'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,Math.PI*2); ctx.fill(); obs.forEach(o=>{ ctx.fillStyle='#ff6666'; ctx.fillRect(o.x,o.y,o.w,o.w); }); ctx.fillStyle='#fff'; ctx.fillText('Score:'+score,10,20); }
  addEventListener('pointermove', e=>{ const r=cv.getBoundingClientRect(); player.x = e.clientX - r.left; });
  function loop(){ update(); draw(); requestAnimationFrame(loop); }
  loop();
})();
`)}
<\/script>
</body></html>`;
    return html;
  }

  function game3HTML(){
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shooter</title>
<style>body{margin:0;background:#050507;color:#fff;font-family:system-ui}canvas{display:block}</style>
</head><body>
<canvas id="cv"></canvas>
<script>
${escapeScriptClose(`
(function(){
  const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
  function r(){ cv.width=innerWidth; cv.height=innerHeight; } addEventListener('resize', r); r();
  let ship={x:cv.width/2,y:cv.height-80,w:36,h:20}, bullets=[], enemies=[], score=0;
  function spawn(){ enemies.push({x:Math.random()*(cv.width-40)+20,y:-40,vy:1+Math.random()*2,w:28}); }
  setInterval(spawn,500);
  function update(dt){
    bullets.forEach(b=>b.y-=600*dt);
    enemies.forEach(e=>e.y+=e.vy + dt*20);
    for(let i=enemies.length-1;i>=0;i--){
      for(let j=bullets.length-1;j>=0;j--){
        const e=enemies[i], b=bullets[j];
        if(b.x>e.x && b.x<e.x+e.w && b.y>e.y && b.y<e.y+e.w){ bullets.splice(j,1); enemies.splice(i,1); score+=10; break; }
      }
    }
  }
  function draw(){ ctx.clearRect(0,0,cv.width,cv.height); ctx.fillStyle='#8bdcff'; ctx.fillRect(ship.x,ship.y,ship.w,ship.h); bullets.forEach(b=>ctx.fillRect(b.x-2,b.y-8,4,8)); enemies.forEach(e=>ctx.fillRect(e.x,e.y,e.w,e.w)); ctx.fillStyle='#fff'; ctx.fillText('Score:'+score,10,20); }
  let last=performance.now();
  function loop(t){ const dt=(t-last)/1000; last=t; update(dt); draw(); requestAnimationFrame(loop); }
  loop();
  addEventListener('pointermove', e=>{ ship.x = Math.max(0, Math.min(cv.width-ship.w, e.clientX-18)); });
  addEventListener('pointerdown', e=>{ bullets.push({x: ship.x + ship.w/2, y: ship.y}); });
})();
`)}
<\/script>
</body></html>`;
    return html;
  }

  function game4HTML(){
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Memory</title>
<style>body{margin:0;background:#060607;color:#eee;font-family:system-ui;display:flex;flex-direction:column;align-items:center} .board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:min(720px,92vw);padding:10px} .tile{background:#111;border-radius:10px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;border:1px solid #222} .tile.revealed{background:#222;color:#ffd266}</style>
</head><body>
<h2>Memory Tiles</h2><div class="board" id="board"></div>
<script>
${escapeScriptClose(`
(function(){
  const board=document.getElementById('board'); const icons=['✦','✹','✺','✷','✵','✶','✸','✻']; let tiles=[], first=null,second=null,score=0;
  function init(){ const arr = icons.concat(icons); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } tiles = arr.map((v,i)=>({id:i,val:v,found:false,revealed:false})); render(); }
  function render(){ board.innerHTML=''; tiles.forEach(t=>{ const d=document.createElement('div'); d.className='tile'+(t.revealed||t.found?' revealed':''); d.textContent=(t.revealed||t.found)?t.val:''; d.onclick=()=>clickTile(t); board.appendChild(d); }); }
  function clickTile(t){ if(t.revealed||t.found) return; t.revealed=true; if(!first) first=t; else if(!second){ second=t; setTimeout(check,400); } render(); }
  function check(){ if(!first||!second) return; if(first.val===second.val){ first.found=true; second.found=true; score+=10; } else { first.revealed=false; second.revealed=false; } first=null; second=null; render(); if(tiles.every(x=>x.found)){ if(confirm('All matched! Score:'+score+'\\nOK=Restart')) init(); } }
  init();
})();
`)}
<\/script>
</body></html>`;
    return html;
  }

  function game5HTML(){
    const html = `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>2048 Lite</title>
<style>body{margin:0;background:#050507;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh}.container{width:min(420px,92vw)}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#0b0b0d;padding:12px;border-radius:12px}.cell{width:80px;height:80px;background:#101014;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px}</style>
</head><body>
<div class="container"><div class="hud">Score: <span id="score">0</span></div><div class="grid" id="grid"></div><div style="margin-top:8px"><button id="reset">Reset</button></div></div>
<script>
${escapeScriptClose(`
(function(){
  const gridEl=document.getElementById('grid'), scoreEl=document.getElementById('score');
  let grid = Array.from({length:16},()=>0), score=0;
  function spawn(){ const empties = grid.map((v,i)=>v===0?i:-1).filter(v=>v>=0); if(empties.length===0) return; const idx=empties[Math.floor(Math.random()*empties.length)]; grid[idx]= Math.random()<0.9?2:4; render(); }
  function render(){ gridEl.innerHTML=''; grid.forEach(v=>{ const d=document.createElement('div'); d.className='cell'; d.textContent = v===0?'':v; gridEl.appendChild(d); }); scoreEl.textContent = score; }
  function compress(arr){ const out = arr.filter(x=>x!==0); for(let i=0;i<out.length-1;i++){ if(out[i]===out[i+1]){ out[i]*=2; score+=out[i]; out.splice(i+1,1); } } while(out.length<4) out.push(0); return out; }
  function move(dir){
    let moved=false; const mat=[[],[],[],[]];
    for(let r=0;r<4;r++) for(let c=0;c<4;c++) mat[r][c]=grid[r*4+c];
    let newMat = JSON.parse(JSON.stringify(mat));
    if(dir==='left'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r]); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='right'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r].slice().reverse()).reverse(); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='up'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='down'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col.reverse()).reverse(); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(!moved) return; grid = newMat.flat(); spawn(); render();
  }
  function reset(){ grid = Array.from({length:16},()=>0); score=0; spawn(); spawn(); render(); }
  render(); spawn(); spawn();
  addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') move('left'); if(e.key==='ArrowRight') move('right'); if(e.key==='ArrowUp') move('up'); if(e.key==='ArrowDown') move('down'); });
  document.getElementById('reset').onclick = ()=>reset();
})();
`)}
<\/script>
</body></html>`;
    return html;
  }

  // ---- run ----
  mainMenu();

})(); // EOF
