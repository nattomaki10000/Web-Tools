/* menu.js
   Alert-only UI (prompt/confirm/alert) + 5 Dark Metal mini-games + HTML Tool.
   Replace BASE_URL below with your GitHub Pages base (no trailing slash).
*/

(function(){
  if(window.__ASSETS_MENU_LOADED) { alert('Tool already loaded'); return; }
  window.__ASSETS_MENU_LOADED = true;

  const BASE_URL = 'YOUR_BASE_URL_HERE'; // <-- replace with your pages base URL
  const CONFIG = {
    JSZIP_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    CORS_PROXY: '' // optional
  };

  // small helpers
  function normalizeUrl(u, base){ try { return (new URL(u, base)).href; } catch(e){ return u; } }
  function fileNameFromUrl(u){ try{ const p=new URL(u).pathname; return decodeURIComponent((p.split('/').filter(Boolean).pop())||'file'); }catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_'); } }
  async function fetchWithFallback(url, opts){
    try{ const r = await fetch(url, opts); if(!r.ok) throw new Error('HTTP '+r.status); return r; }
    catch(e){
      if(CONFIG.CORS_PROXY){ const prox = CONFIG.CORS_PROXY.replace(/\/$/,'') + '/' + url; return fetch(prox, opts); }
      throw e;
    }
  }
  function downloadBlobAsFile(blob, filename){
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),30000);
  }

  // --- asset discovery (as before) ---
  function discoverAssetsFromDocument(doc){
    const assets = new Map();
    try{ assets.set(doc.location.href, {url:doc.location.href, type:'html'}); }catch(e){}
    Array.from(doc.querySelectorAll('link[rel="stylesheet"],link[rel="icon"],link[rel=preload]')).forEach(l=>{ if(l.href) assets.set(normalizeUrl(l.href, doc.baseURI), {url:normalizeUrl(l.href, doc.baseURI), type:'css'}); });
    Array.from(doc.querySelectorAll('script[src]')).forEach(s=>{ if(s.src) assets.set(normalizeUrl(s.src, doc.baseURI), {url:normalizeUrl(s.src, doc.baseURI), type:'js'}); });
    Array.from(doc.querySelectorAll('img')).forEach(i=>{ const u=i.currentSrc||i.src; if(u) assets.set(normalizeUrl(u, doc.baseURI), {url:normalizeUrl(u, doc.baseURI), type:'image'}); });
    Array.from(doc.querySelectorAll('video,audio')).forEach(m=>{ const s=m.currentSrc||m.src; if(s) assets.set(normalizeUrl(s, doc.baseURI), {url:normalizeUrl(s, doc.baseURI), type:'media'}); Array.from(m.querySelectorAll('source')).forEach(src=>{ if(src.src) assets.set(normalizeUrl(src.src, doc.baseURI), {url:normalizeUrl(src.src, doc.baseURI), type:'media'}); }); });
    Array.from(doc.querySelectorAll('style')).forEach(st=>{ const text=st.textContent||''; let re=/url\(([^)]+)\)/g, m; while((m=re.exec(text))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); } });
    try{ Array.from(doc.styleSheets).forEach(ss=>{ try{ Array.from(ss.cssRules||[]).forEach(rule=>{ const txt=rule.cssText||''; let re=/url\(([^)]+)\)/g, m; while((m=re.exec(txt))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); } }); }catch(e){ if(ss.href) assets.set(normalizeUrl(ss.href, doc.baseURI), {url:normalizeUrl(ss.href, doc.baseURI), type:'css'}); } }); }catch(e){}
    return Array.from(assets.values());
  }

  // --- This Page list & zip (same as earlier, but alert UI) ---
  async function handleThisPageList(){
    const assets = discoverAssetsFromDocument(document);
    if(assets.length === 0){ alert('アセットが検出されませんでした。'); return; }
    let s = '検出されたアセット一覧：\n';
    assets.forEach((a,i)=> s += (i+1) + '. ' + fileNameFromUrl(a.url) + ' — ' + a.type + '\n');
    s += '\nダウンロードしたい番号を入力してください（キャンセルで戻る）';
    let choice = prompt(s);
    if(choice === null) return;
    choice = choice.trim();
    if(!choice) return;
    const idx = parseInt(choice,10);
    if(isNaN(idx) || idx < 1 || idx > assets.length){ alert('無効な番号です'); return; }
    const item = assets[idx-1];
    try{
      alert('ダウンロード開始: ' + item.url);
      const r = await fetchWithFallback(item.url);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const blob = await r.blob();
      downloadBlobAsFile(blob, fileNameFromUrl(item.url));
      alert('ダウンロード完了: ' + fileNameFromUrl(item.url));
    }catch(e){ alert('ダウンロード失敗: '+(e.message||e)); console.error(e); }
  }

  async function handleThisPageZip(){
    if(!confirm('This Page のアセットを ZIP にまとめてダウンロードしますか？\nOK=実行 / Cancel=戻る')) return;
    try{
      alert('ZIP を作成します。処理が長くなる場合があります。');
      await loadScript(CONFIG.JSZIP_CDN); if(!window.JSZip) throw new Error('JSZip load failed');
      const JSZip = window.JSZip; const zip = new JSZip();
      try{ zip.file('index.html', document.documentElement.outerHTML); }catch(e){}
      const assets = discoverAssetsFromDocument(document);
      const folder = zip.folder('assets');
      const tasks = assets.map(async a=>{ try{ const r = await fetchWithFallback(a.url); if(!r.ok) throw new Error('HTTP '+r.status); const blob = await r.blob(); const fname = fileNameFromUrl(a.url); folder.file(fname, blob); }catch(e){ console.warn('skip', a.url, e); } });
      await Promise.all(tasks);
      const content = await zip.generateAsync({type:'blob'});
      downloadBlobAsFile(content, 'thispage-assets.zip');
      alert('ZIP 完了');
    }catch(e){ alert('ZIP 作成失敗: '+(e.message||e)); console.error(e); }
  }

  // --- Other Page actions (zip or Web See) ---
  function parseAssetUrlsFromHtml(html, base){
    const urls = new Set();
    const re = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*["']?([^"'\s>]+)["']?/ig;
    let m; while((m=re.exec(html))){ urls.add(normalizeUrl(m[1], base)); }
    const re2 = /url\(([^)]+)\)/ig; while((m=re2.exec(html))){ let u=m[1].replace(/["']/g,'').trim(); urls.add(normalizeUrl(u, base)); }
    return Array.from(urls);
  }

  async function zipRemotePageAssets(pageUrl){
    try{
      if(!confirm('指定ページのAssetsを取得してZIPでダウンロードします。\nOK=実行 / Cancel=戻る')) return;
      alert('ページを取得しています: ' + pageUrl);
      const html = await fetchWithFallback(pageUrl).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); });
      await loadScript(CONFIG.JSZIP_CDN); if(!window.JSZip) throw new Error('JSZip load failed');
      const JSZip = window.JSZip; const zip = new JSZip(); zip.file('index.html', html);
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      const folder = zip.folder('assets');
      alert('見つかったアセット数: ' + assets.length + '\n取得を開始します（時間がかかることがあります）');
      await Promise.all(assets.map(async u=>{ try{ const r = await fetchWithFallback(u); if(!r.ok) throw new Error('HTTP '+r.status); const blob = await r.blob(); const p = (new URL(u)).pathname.replace(/^\//,''); const name = p || fileNameFromUrl(u); folder.file(name, blob); }catch(e){ console.warn('skip', u, e); } }));
      const content = await zip.generateAsync({type:'blob'});
      downloadBlobAsFile(content, 'remote-assets.zip');
      alert('Remote ZIP 完了');
    }catch(e){ alert('Remote ZIP 失敗: '+(e.message||e)); console.error(e); }
  }

  async function webSeeMirror(pageUrl){
    try{
      if(!confirm('Web See（完全ミラー）を実行します。\nOK=実行 / Cancel=戻る')) return;
      alert('ページを取得しています: ' + pageUrl);
      const html = await fetchWithFallback(pageUrl).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); });
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('取得対象のアセット数: ' + assets.length);
      const blobMap = {};
      await Promise.all(assets.map(async u=>{ try{ const r = await fetchWithFallback(u); if(!r.ok) throw new Error('HTTP '+r.status); const blob = await r.blob(); blobMap[u] = URL.createObjectURL(blob); }catch(e){ console.warn('fail', u, e); } }));
      let rewritten = html;
      Object.keys(blobMap).forEach(orig=>{ rewritten = rewritten.split(orig).join(blobMap[orig]); try{ const p=(new URL(orig)).pathname; rewritten = rewritten.split(p).join(blobMap[orig]); }catch(e){} });
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
      const blob = new Blob([rewritten], {type:'text/html'}); const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      alert('ミラーを新タブで開きました（完全再現を保証しません）');
    }catch(e){ alert('Web See 失敗: '+(e.message||e)); console.error(e); }
  }

  // loadScript helper
  function loadScript(url){ return new Promise((res,rej)=>{ if(document.querySelector('script[src="'+url+'"]')) return res(); const s=document.createElement('script'); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

  // --- HTML Tool: open editor page in new tab (full-featured) ---
  function openHtmlTool(){
    // build HTML tool page (includes JSZip via CDN)
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>HTML Tool</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,'Noto Sans JP';margin:0;padding:12px;background:#111;color:#eee}
header{display:flex;justify-content:space-between;align-items:center}
.container{display:flex;gap:12px;margin-top:12px}
.left{flex:1;min-width:320px}
.right{flex:1;min-width:320px}
textarea{width:100%;height:320px;background:#0f0f10;color:#fff;border:1px solid #222;padding:8px;font-family:monospace}
.filecard{border:1px solid #222;padding:8px;margin-bottom:8px;background:#0b0b0c}
button{padding:8px 10px;border-radius:6px;background:#222;color:#fff;border:1px solid #444}
.list{max-height:40vh;overflow:auto}
</style>
</head><body>
<header><h2>HTML Tool</h2><div><button id="btnExportAll">まとめてZIP</button> <button id="btnCombine">一つにまとめる</button> <button id="btnPreview">プレビュー</button></div></header>
<p>ファイルをアップロードして編集・ダウンロード・まとめてZIPできます。</p>
<input id="fileIn" type="file" multiple>
<div class="container"><div class="left"><h3>Files</h3><div id="fileList" class="list"></div></div><div class="right"><h3>Editor</h3><div id="editorArea"><div style="color:#aaa">ファイルを選択してください</div></div></div></div>
<script>
const fileIn=document.getElementById('fileIn'), fileList=document.getElementById('fileList'), editorArea=document.getElementById('editorArea');
let stored=[];
fileIn.onchange=async e=>{
  stored=[];
  const arr=Array.from(e.target.files||[]);
  for(const f of arr){ const t=await f.text(); stored.push({name:f.name,text:t}); }
  renderFiles();
};
function renderFiles(){
  fileList.innerHTML='';
  if(stored.length===0){ fileList.innerHTML='<div style="color:#888">No files</div>'; editorArea.innerHTML='<div style="color:#aaa">ファイルを選択してください</div>'; return; }
  stored.forEach((f,idx)=>{
    const card=document.createElement('div'); card.className='filecard';
    const title=document.createElement('div'); title.textContent=f.name; title.style.fontWeight=700;
    const btnDown=document.createElement('button'); btnDown.textContent='Download'; btnDown.onclick=()=>{ const b=new Blob([f.text],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=f.name; a.click(); };
    const btnEdit=document.createElement('button'); btnEdit.textContent='Edit'; btnEdit.style.marginLeft='6px'; btnEdit.onclick=()=>openEditor(idx);
    const btnRemove=document.createElement('button'); btnRemove.textContent='Remove'; btnRemove.style.marginLeft='6px'; btnRemove.onclick=()=>{ stored.splice(idx,1); renderFiles(); };
    card.appendChild(title); card.appendChild(btnDown); card.appendChild(btnEdit); card.appendChild(btnRemove);
    fileList.appendChild(card);
  });
}
function openEditor(idx){
  const f=stored[idx];
  editorArea.innerHTML='';
  const title=document.createElement('div'); title.textContent=f.name; title.style.fontWeight='700';
  const ta=document.createElement('textarea'); ta.value=f.text;
  const saveBtn=document.createElement('button'); saveBtn.textContent='Save'; saveBtn.onclick=()=>{ stored[idx].text=ta.value; alert('Saved'); renderFiles(); };
  editorArea.appendChild(title); editorArea.appendChild(ta); editorArea.appendChild(saveBtn);
}
document.getElementById('btnExportAll').onclick=async ()=>{
  if(stored.length===0){ alert('No files'); return; }
  if(!window.JSZip){ const s=document.createElement('script'); s.src='${CONFIG.JSZIP_CDN}'; document.head.appendChild(s); await new Promise(r=>s.onload=r); }
  const zip=new JSZip(); stored.forEach(f=>zip.file(f.name,f.text)); const blob=await zip.generateAsync({type:'blob'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='files.zip'; a.click();
};
document.getElementById('btnCombine').onclick=()=>{
  if(stored.length===0){ alert('No files'); return; }
  const htmlFile = stored.find(x=>x.name.match(/\\.html?$/i)) || {text:'<!doctype html><html><head><meta charset="utf-8"><title>Combined</title></head><body></body></html>'};
  let out = htmlFile.text;
  const cssText = stored.filter(f=>f.name.match(/\\.css$/i)).map(f=>'/* '+f.name+' */\\n'+f.text).join('\\n');
  const jsText  = stored.filter(f=>f.name.match(/\\.js$/i)).map(f=>'// '+f.name+'\\n'+f.text).join('\\n');
  out = out.replace(/<\\/head>/i, '<style>\\n'+cssText+'\\n</style>\\n</head>');
  out = out.replace(/<\\/body>/i, '<script>\\n'+jsText+'\\n</script>\\n</body>');
  const blob=new Blob([out],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='combined.html'; a.click();
};
document.getElementById('btnPreview').onclick=()=>{
  if(stored.length===0){ alert('No files'); return; }
  const htmlFile = stored.find(x=>x.name.match(/\\.html?$/i)) || {text:'<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body>No HTML</body></html>'};
  let out = htmlFile.text;
  const cssText = stored.filter(f=>f.name.match(/\\.css$/i)).map(f=>'/* '+f.name+' */\\n'+f.text).join('\\n');
  const jsText  = stored.filter(f=>f.name.match(/\\.js$/i)).map(f=>'// '+f.name+'\\n'+f.text).join('\\n');
  out = out.replace(/<\\/head>/i, '<style>\\n'+cssText+'\\n</style>\\n</head>');
  out = out.replace(/<\\/body>/i, '<script>\\n'+jsText+'\\n</script>\\n</body>');
  const blob=new Blob([out],{type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
};
</script></body></html>`;
    const blob = new Blob([html], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
  }

  // --- Mini Games: Dark Metal themed (5 games) ---
  function openMiniGame(id){
    // map id -> HTML
    const games = {
      "game1": getGame1(), // Tap Box
      "game2": getGame2(), // Avoider
      "game3": getGame3(), // Shooter
      "game4": getGame4(), // Memory Tiles
      "game5": getGame5()  // 2048 Lite
    };
    const html = games[id] || '<!doctype html><html><body>Not found</body></html>';
    const blob = new Blob([html], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
  }

  /* ------------------------
     Game 1: Tap Box (dark metal)
     ------------------------ */
  function getGame1(){
    return `<!doctype html><html><head><meta charset="utf-8"><title>Tap Box</title>
<style>
:root{--bg:#0b0b0d;--panel:#141417;--accent:#ff5f5f;--metal:#222;}
body{margin:0;background:linear-gradient(180deg,#060608,#0b0b0d);color:#eee;font-family:system-ui}
#ui{position:fixed;left:10px;top:10px;font-size:18px}
#canvas{display:block;width:100vw;height:100vh}
.hud{position:fixed;right:10px;top:10px;text-align:right}
.btn{padding:8px 10px;border-radius:6px;background:#151519;border:1px solid #333;color:#fff}
.score{font-size:20px;font-weight:700;color:var(--accent)}
.target{position:absolute;border-radius:8px;border:2px solid rgba(255,95,95,0.9);background:linear-gradient(180deg,rgba(255,95,95,0.14),transparent)}
</style>
</head><body>
<div id="ui"><button id="btnBack" class="btn">Exit</button></div>
<div class="hud"><div>Score: <span id="score">0</span></div><div>High: <span id="high">0</span></div></div>
<canvas id="canvas"></canvas>
<script>
(()=> {
  const ctxCanvas = document.getElementById('canvas');
  const c = ctxCanvas;
  function resize(){ c.width = innerWidth; c.height = innerHeight; }
  addEventListener('resize', resize); resize();
  let score = 0; const HS_KEY='tapbox_hs';
  const high = localStorage.getItem(HS_KEY)|0; document.getElementById('high').textContent = high;
  const scoreEl = document.getElementById('score'); scoreEl.textContent = 0;
  const targets = [];
  let spawnInterval = 900; let running=true;
  // sound
  const ac = new (window.AudioContext||window.webkitAudioContext)();
  function beep(freq, dur=0.06){ const o=ac.createOscillator(); const g=ac.createGain(); o.type='sawtooth'; o.frequency.value=freq; g.gain.value=0.0001; o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.6, ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+dur); setTimeout(()=>{o.stop();}, dur*1000+50); }
  function spawn(){
    const size = 36 + Math.random()*56;
    const x = Math.random()*(c.width - size);
    const y = Math.random()*(c.height - size);
    targets.push({x,y,w:size,h:size,life:1,created:Date.now()});
  }
  function tick(){
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    // background stripes
    for(let i=0;i<6;i++){ ctx.fillStyle = i%2? 'rgba(255,95,95,0.02)' : 'rgba(255,255,255,0.01)'; ctx.fillRect(0,i*(c.height/6),c.width,c.height/6); }
    // draw targets
    for(let i=targets.length-1;i>=0;i--){
      const t=targets[i];
      const age=(Date.now()-t.created)/1000;
      const pulse = 1+Math.sin(age*6)*0.08;
      ctx.save(); ctx.translate(t.x+t.w/2,t.y+t.h/2); ctx.scale(pulse,pulse);
      ctx.fillStyle='rgba(255,95,95,0.14)'; ctx.fillRect(-t.w/2,-t.h/2,t.w,t.h);
      ctx.strokeStyle='rgba(255,95,95,0.9)'; ctx.lineWidth=3; ctx.strokeRect(-t.w/2,-t.h/2,t.w,t.h);
      ctx.restore();
      // lifetime
      if(age>3.5){ targets.splice(i,1); score = Math.max(0, score-1); scoreEl.textContent=score; }
    }
    requestAnimationFrame(tick);
  }
  c.addEventListener('pointerdown', (e)=>{
    const rect=c.getBoundingClientRect();
    const px=e.clientX-rect.left, py=e.clientY-rect.top;
    for(let i=targets.length-1;i>=0;i--){
      const t=targets[i];
      if(px>=t.x && px<=t.x+t.w && py>=t.y && py<=t.y+t.h){
        // hit
        beep(800+Math.random()*600,0.08);
        // explosion animation (simple)
        const ctx=c.getContext('2d'); const cx=t.x+t.w/2, cy=t.y+t.h/2;
        let r=0; const exp= setInterval(()=>{ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle='rgba(255,200,100,'+(0.8- r/120)+')'; ctx.lineWidth=3; ctx.stroke(); r+=8; if(r>120){ clearInterval(exp);} },16);
        targets.splice(i,1);
        score++; scoreEl.textContent=score;
        if(score> (localStorage.getItem(HS_KEY)|0)){ localStorage.setItem(HS_KEY, score); document.getElementById('high').textContent = score; }
        return;
      }
    }
  });
  // spawn loop
  setInterval(()=>{ if(running) spawn(); }, spawnInterval);
  tick();
  document.getElementById('btnBack').onclick = ()=>{ if(confirm('Exit game?')) window.close(); };
})();
</script>
</body></html>`;
  }

  /* ------------------------
     Game 2: Avoider
     ------------------------ */
  function getGame2(){
    return `<!doctype html><html><head><meta charset="utf-8"><title>Avoider</title>
<style>
body{margin:0;background:#050506;color:#fff;font-family:system-ui}
canvas{display:block}
.ui{position:fixed;left:10px;top:10px}
.btn{padding:8px 10px;background:#111;border-radius:6px;border:1px solid #333;color:#fff}
.hud{position:fixed;right:10px;top:10px;text-align:right}
</style></head><body>
<canvas id="g"></canvas>
<div class="hud"><div>Score: <span id="score">0</span></div><div>High: <span id="high">0</span></div></div>
<button id="exit" class="btn" style="position:fixed;left:12px;bottom:12px">Exit</button>
<script>
(()=> {
  const c=document.getElementById('g'); function r(){ c.width=innerWidth; c.height=innerHeight;} addEventListener('resize', r); r();
  const ctx=c.getContext('2d');
  let player={x:c.width/2,y:c.height-80,r:18};
  let obstacles=[]; let speed=2; let score=0; const HS='avoider_hs';
  document.getElementById('high').textContent = localStorage.getItem(HS)|0;
  let lastSpawn=0;
  const ac = new (window.AudioContext||window.webkitAudioContext)();
  function sfx(freq,d=0.06){ const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.value=freq; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.6,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+d); setTimeout(()=>o.stop(),d*1000+50); }
  function spawnObstacle(){ const w=30+Math.random()*60; obstacles.push({x:Math.random()*(c.width-w),y:-w,w,vy:2+Math.random()*2}); }
  function update(dt){
    // move obstacles
    obstacles.forEach(o=>{ o.y += o.vy + speed*0.02; });
    // remove & score
    for(let i=obstacles.length-1;i>=0;i--){
      if(obstacles[i].y > c.height){ obstacles.splice(i,1); score++; document.getElementById('score').textContent = score; if(score> (localStorage.getItem(HS)|0)){ localStorage.setItem(HS, score); document.getElementById('high').textContent = score; } }
    }
    // collision
    for(const o of obstacles){
      const dx = o.x + o.w/2 - player.x; const dy = o.y + o.w/2 - player.y; if(Math.hypot(dx,dy) < o.w/2 + player.r - 2){ sfx(180,0.12); if(confirm('Game Over! Score: '+score+'\\nOK to retry, Cancel to exit')){ // reset
            obstacles=[]; score=0; document.getElementById('score').textContent=0; return; } else { window.close(); return; } }
    }
  }
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    // bg
    const g=ctx.createLinearGradient(0,0,0,c.height); g.addColorStop(0,'#070708'); g.addColorStop(1,'#0b0b0d'); ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
    // player
    ctx.fillStyle='#33aaff'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,Math.PI*2); ctx.fill();
    // obstacles
    obstacles.forEach(o=>{ ctx.fillStyle='#ff6666'; ctx.fillRect(o.x,o.y,o.w,o.w); });
  }
  let last=performance.now();
  function loop(t){ const dt=(t-last)/1000; last=t; if(Math.random()<0.02) speed += 0.002; if(Math.random()<0.02 && performance.now()-lastSpawn>600) { spawnObstacle(); lastSpawn=performance.now(); } update(dt); draw(); requestAnimationFrame(loop); }
  loop();
  // pointer to move player
  c.addEventListener('pointermove', e=>{ const r=c.getBoundingClientRect(); player.x=e.clientX-r.left; });
  // touch: left-right on touch
  c.addEventListener('touchmove', e=>{ const t=e.touches[0]; const r=c.getBoundingClientRect(); player.x = t.clientX - r.left; });
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script>
</body></html>`;
  }

  /* ------------------------
     Game 3: Shooter
     ------------------------ */
  function getGame3(){
    return `<!doctype html><html><head><meta charset="utf-8"><title>Shooter</title>
<style>
body{margin:0;background:#050507;color:#fff}
canvas{display:block}
.hud{position:fixed;right:10px;top:10px;text-align:right}
button{position:fixed;left:10px;bottom:10px;padding:8px 10px;border-radius:6px;background:#111;border:1px solid #333;color:#fff}
</style></head><body>
<canvas id="c"></canvas>
<div class="hud">Score: <span id="score">0</span> High: <span id="high">0</span></div>
<button id="exit">Exit</button>
<script>
(()=> {
  const c=document.getElementById('c'); function r(){ c.width=innerWidth; c.height=innerHeight;} addEventListener('resize', r); r();
  const ctx=c.getContext('2d');
  let ship={x:c.width/2,y:c.height-80,w:36,h:24};
  let bullets=[], enemies=[]; let lastE=0; let score=0; const HS='shooter_hs'; document.getElementById('high').textContent = localStorage.getItem(HS)|0;
  const ac = new (window.AudioContext||window.webkitAudioContext)();
  function shotSfx(){ const o=ac.createOscillator(),g=ac.createGain(); o.frequency.value=1200; o.type='sawtooth'; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.5,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.12); setTimeout(()=>o.stop(),150); }
  function spawnEnemy(){ enemies.push({x:Math.random()*(c.width-40)+20,y:-40,vy:1+Math.random()*2,w:28}); }
  function update(dt){
    bullets.forEach(b=> b.y -= 600*dt);
    enemies.forEach(e=> e.y += e.vy + dt*30);
    // collisions
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      for(let j=bullets.length-1;j>=0;j--){
        const b=bullets[j];
        if(b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.w){
          // hit
          bullets.splice(j,1); enemies.splice(i,1);
          score += 10; document.getElementById('score').textContent = score;
          if(score > (localStorage.getItem(HS)|0)) localStorage.setItem(HS, score), document.getElementById('high').textContent=score;
          // explosion sfx
          const o=ac.createOscillator(),g=ac.createGain(); o.frequency.value=200+Math.random()*800; o.type='triangle'; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.6,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.2); setTimeout(()=>o.stop(),220);
          break;
        }
      }
      if(e.y > c.height+100){ enemies.splice(i,1); if(--score<0) score=0; document.getElementById('score').textContent = score; }
      // check ship collision
      if(e.x < ship.x + ship.w && e.x + e.w > ship.x && e.y < ship.y + ship.h && e.y + e.w > ship.y){
        if(confirm('Game Over\\nScore: '+score+'\\nOK to retry, Cancel to exit')){
          bullets=[]; enemies=[]; score=0; document.getElementById('score').textContent=0;
        } else { window.close(); return; }
      }
    }
  }
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    // bg
    const g=ctx.createLinearGradient(0,0,0,c.height); g.addColorStop(0,'#070708'); g.addColorStop(1,'#0b0b0d'); ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
    // ship
    ctx.fillStyle='#8bdcff'; ctx.fillRect(ship.x,ship.y,ship.w,ship.h);
    // bullets
    ctx.fillStyle='#ffd266'; bullets.forEach(b=> ctx.fillRect(b.x-2,b.y-8,4,8) );
    // enemies
    ctx.fillStyle='#ff7b7b'; enemies.forEach(e=> ctx.fillRect(e.x,e.y,e.w,e.w));
  }
  let last=performance.now();
  function loop(t){ const dt=(t-last)/1000; last=t; if(Math.random()<0.02 && performance.now()-lastE>300) { spawnEnemy(); lastE=performance.now(); } update(dt); draw(); requestAnimationFrame(loop); }
  loop();
  // controls
  addEventListener('pointermove', e=>{ ship.x = Math.max(0, Math.min(c.width-ship.w, e.clientX - 18)); });
  addEventListener('pointerdown', e=>{ bullets.push({x: ship.x + ship.w/2, y: ship.y}); shotSfx(); });
  addEventListener('keydown', e=>{ if(e.code==='Space'){ bullets.push({x: ship.x + ship.w/2, y: ship.y}); shotSfx(); } });
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script></body></html>`;
  }

  /* ------------------------
     Game 4: Memory Tiles
     ------------------------ */
  function getGame4(){
    return `<!doctype html><html><head><meta charset="utf-8"><title>Memory Tiles</title>
<style>
body{margin:0;background:#060607;color:#eee;font-family:system-ui;display:flex;flex-direction:column;align-items:center}
.header{margin:12px}
.board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:min(720px,92vw);max-width:720px}
.tile{background:#111;border-radius:10px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;border:1px solid #222}
.tile.revealed{background:linear-gradient(180deg,#2a2a2a,#111);color:#ffd266}
.hud{margin:8px}
button{padding:8px 10px;border-radius:8px;background:#111;border:1px solid #333;color:#fff}
</style></head><body>
<div class="header"><h2>Memory Tiles</h2><div class="hud">Moves: <span id="moves">0</span> Score: <span id="score">0</span> High: <span id="high">0</span></div></div>
<div class="board" id="board"></div>
<button id="exit" style="position:fixed;left:12px;bottom:12px">Exit</button>
<script>
(()=> {
  const boardEl=document.getElementById('board'), movesEl=document.getElementById('moves'), scoreEl=document.getElementById('score'), highEl=document.getElementById('high');
  const HS='memory_hs'; highEl.textContent = localStorage.getItem(HS)|0;
  const icons = ['✦','✹','✺','✷','✵','✶','✸','✻'];
  let tiles=[], first=null, second=null, moves=0, score=0;
  function init(){
    const arr = icons.concat(icons);
    // shuffle
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    tiles = arr.map((v,i)=>({id:i,val:v,found:false,revealed:false}));
    render();
  }
  function render(){
    boardEl.innerHTML='';
    tiles.forEach(t=>{
      const d=document.createElement('div'); d.className='tile'+(t.revealed||t.found?' revealed':''); d.textContent = (t.revealed||t.found)?t.val:''; d.onclick = ()=> clickTile(t); boardEl.appendChild(d);
    });
    movesEl.textContent = moves; scoreEl.textContent = score;
  }
  function clickTile(t){
    if(t.revealed||t.found) return;
    t.revealed=true; if(!first) first=t; else if(!second) { second=t; moves++; setTimeout(checkMatch,400); }
    render();
  }
  function checkMatch(){
    if(!first||!second) return;
    if(first.val === second.val){ first.found = true; second.found = true; score += 10; if(score > (localStorage.getItem(HS)|0)){ localStorage.setItem(HS, score); highEl.textContent=score; } }
    else { first.revealed=false; second.revealed=false; score = Math.max(0, score-2); }
    first = null; second = null; render();
    if(tiles.every(t=>t.found)) { if(confirm('All matched! Score: '+score+'\\nOK to play again')) init(); else return; }
  }
  init();
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script></body></html>`;
  }

  /* ------------------------
     Game 5: 2048 Lite
     ------------------------ */
  function getGame5(){
    return `<!doctype html><html><head><meta charset="utf-8"><title>2048 Lite</title>
<style>
body{margin:0;background:#050507;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh}
.container{width:min(420px,92vw)}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#0b0b0d;padding:12px;border-radius:12px}
.cell{width:80px;height:80px;background:#101014;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px}
.hud{display:flex;justify-content:space-between;margin-bottom:8px}
button{padding:8px;border-radius:8px;background:#111;border:1px solid #333;color:#fff}
</style></head><body>
<div class="container">
<div class="hud"><div>Score: <span id="score">0</span></div><div>High: <span id="high">0</span></div></div>
<div class="grid" id="grid"></div>
<div style="margin-top:8px"><button id="reset">Reset</button> <button id="exit">Exit</button></div>
</div>
<script>
(()=> {
  const gridEl=document.getElementById('grid'), scoreEl=document.getElementById('score'), highEl=document.getElementById('high');
  const HS='2048_hs'; highEl.textContent = localStorage.getItem(HS)|0;
  let grid = Array.from({length:16},()=>0), score=0;
  function spawn(){ const empties = grid.map((v,i)=>v===0?i:-1).filter(v=>v>=0); if(empties.length===0) return; const idx=empties[Math.floor(Math.random()*empties.length)]; grid[idx]= Math.random()<0.9?2:4; render(); }
  function render(){ gridEl.innerHTML=''; grid.forEach(v=>{ const d=document.createElement('div'); d.className='cell'; d.textContent = v===0?'':v; gridEl.appendChild(d); }); scoreEl.textContent=score; }
  function move(dir){
    // dir: 'left','right','up','down'
    let moved=false;
    const mat = [[],[],[],[]];
    for(let r=0;r<4;r++) for(let c=0;c<4;c++) mat[r][c]=grid[r*4+c];
    function compress(arr){
      const out = arr.filter(x=>x!==0);
      for(let i=0;i<out.length-1;i++){
        if(out[i]===out[i+1]){ out[i]*=2; score+=out[i]; out.splice(i+1,1); }
      }
      while(out.length<4) out.push(0);
      return out;
    }
    let newMat = JSON.parse(JSON.stringify(mat));
    if(dir==='left'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r]); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='right'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r].slice().reverse()).reverse(); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='up'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='down'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col.reverse()).reverse(); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(!moved) return;
    grid = newMat.flat();
    spawn();
    render();
    if(score > (localStorage.getItem(HS)|0)){ localStorage.setItem(HS, score); highEl.textContent=score; }
    // check game over
    if(!canMove()){ if(confirm('Game Over\\nScore: '+score+'\\nOK to restart')) reset(); }
  }
  function canMove(){ if(grid.some(v=>v===0)) return true; // any merges?
    for(let r=0;r<4;r++) for(let c=0;c<3;c++) if(grid[r*4+c]===grid[r*4+c+1]) return true;
    for(let c=0;c<4;c++) for(let r=0;r<3;r++) if(grid[r*4+c]===grid[(r+1)*4+c]) return true;
    return false;
  }
  function reset(){ grid = Array.from({length:16},()=>0); score=0; spawn(); spawn(); render(); }
  render(); spawn(); spawn(); document.getElementById('reset').onclick = ()=>reset(); document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
  addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') move('left'); if(e.key==='ArrowRight') move('right'); if(e.key==='ArrowUp') move('up'); if(e.key==='ArrowDown') move('down'); });
  // touch swipe
  let sx=0, sy=0; addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; });
  addEventListener('touchend', e=>{ const ex = e.changedTouches[0].clientX; const ey=e.changedTouches[0].clientY; const dx=ex-sx, dy=ey-sy; if(Math.abs(dx)>Math.abs(dy)){ if(dx>30) move('right'); else if(dx<-30) move('left'); } else { if(dy>30) move('down'); else if(dy<-30) move('up'); } });
})();
</script></body></html>`;
  }

  // --- Main menu loop (alert/prompt/confirm UI only) ---
  (async function mainLoop(){
    alert('Assets Tool 起動 (Alert UI mode)');
    while(true){
      const v = prompt('機能を選んでください（番号を入力）:\\n1 This Page\\n2 Other Page\\n3 Other Thing\\nキャンセルで終了');
      if(v === null) { alert('終了します'); break; }
      const choice = v.trim();
      if(choice === '1'){
        const sub = prompt('This Page:\\n1 Assets 一覧 (個別DL)\\n2 Assets DL [Here] (ZIP)\\nキャンセルで戻る');
        if(sub === null) continue;
        if(sub.trim() === '1'){ await handleThisPageList(); }
        else if(sub.trim() === '2'){ await handleThisPageZip(); }
        else { alert('無効な選択'); }
      } else if(choice === '2'){
        const url = prompt('対象ページのURLを入力してください（例: https://example.com/）\\nキャンセルで戻る');
        if(!url) continue;
        const op = prompt('選択:\\n1 = Assets DL [URL]（ZIPで保存）\\n2 = Web See（完全ミラー）\\nキャンセルで戻る');
        if(!op) continue;
        if(op.trim() === '1') { await zipRemotePageAssets(url); }
        else if(op.trim() === '2') { await webSeeMirror(url); }
        else { alert('無効'); }
      } else if(choice === '3'){
        const t = prompt('Other Thing:\\n1 HTML Tool\\n2 Mini Games\\nキャンセルで戻る');
        if(t === null) continue;
        if(t.trim() === '1'){ openHtmlTool(); }
        else if(t.trim() === '2'){
          const g = prompt('Mini Games:\\n1 Tap Box\\n2 Avoider\\n3 Shooter\\n4 Memory Tiles\\n5 2048 Lite\\nキャンセルで戻る');
          if(!g) continue;
          const map = {'1':'game1','2':'game2','3':'game3','4':'game4','5':'game5'};
          if(map[g.trim()]) openMiniGame(map[g.trim()]); else alert('無効な選択');
        } else { alert('無効'); }
      } else {
        alert('無効な選択です');
      }
    }
  })();

})();
