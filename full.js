/* main.js
   All-in-one tool:
   - Alert/prompt/confirm UI only
   - This Page assets listing & ZIP
   - Other Page: Remote ZIP & Web See (retry loop)
   - HTML Tool: direct-create/edit files (no upload) in new tab, ZIP, combine, preview
   - Mini Games x5 (Blob-created pages, Dark Metal theme, sound, HS in localStorage)
   - Use as bookmarklet loader or place on GitHub Pages
*/

(function(){
  if(window.__ASSETS_TOOL_LOADED) { alert('Tool already loaded'); return; }
  window.__ASSETS_TOOL_LOADED = true;

  const CONFIG = {
    JSZIP_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    CORS_PROXY: '' // optional: "https://your-proxy.example.com" (no trailing slash). Leave empty to disable.
  };

  // ------------------
  // Helpers
  // ------------------
  function loadScript(url){
    return new Promise((res, rej) => {
      if(document.querySelector('script[src="'+url+'"]')) return res();
      const s = document.createElement('script'); s.src = url;
      s.onload = () => res(); s.onerror = (e) => rej(e);
      document.head.appendChild(s);
    });
  }

  function normalizeUrl(u, base){
    try { return (new URL(u, base)).href; } catch(e) { return u; }
  }
  function fileNameFromUrl(u){
    try{ const p = new URL(u).pathname; const n = p.split('/').filter(Boolean).pop() || 'file'; return decodeURIComponent(n); }
    catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_'); }
  }

  async function fetchWithFallback(url, opts){
    try {
      const r = await fetch(url, opts);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r;
    } catch(e) {
      if(CONFIG.CORS_PROXY){
        try {
          const prox = CONFIG.CORS_PROXY.replace(/\/$/,'') + '/' + url;
          const r2 = await fetch(prox, opts);
          if(!r2.ok) throw new Error('Proxy HTTP '+r2.status);
          return r2;
        } catch(e2){
          throw e2;
        }
      }
      throw e;
    }
  }

  function downloadBlobAsFile(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
  }

  // ------------------
  // Asset discovery (current document)
  // ------------------
  function discoverAssetsFromDocument(doc=document){
    const assets = new Map();
    try{ assets.set(doc.location.href, {url:doc.location.href, type:'html'}); }catch(e){}
    Array.from(doc.querySelectorAll('link[rel="stylesheet"],link[rel="icon"],link[rel="preload"]')).forEach(l=>{
      if(l.href) assets.set(normalizeUrl(l.href, doc.baseURI), {url:normalizeUrl(l.href, doc.baseURI), type:'css'});
    });
    Array.from(doc.querySelectorAll('script[src]')).forEach(s=>{ if(s.src) assets.set(normalizeUrl(s.src, doc.baseURI), {url:normalizeUrl(s.src, doc.baseURI), type:'js'}); });
    Array.from(doc.querySelectorAll('img')).forEach(i=>{ const u = i.currentSrc || i.src; if(u) assets.set(normalizeUrl(u, doc.baseURI), {url:normalizeUrl(u, doc.baseURI), type:'image'}); });
    Array.from(doc.querySelectorAll('video, audio')).forEach(m=>{
      const u = m.currentSrc || m.src; if(u) assets.set(normalizeUrl(u, doc.baseURI), {url:normalizeUrl(u, doc.baseURI), type:'media'});
      Array.from(m.querySelectorAll('source')).forEach(s=>{ if(s.src) assets.set(normalizeUrl(s.src, doc.baseURI), {url:normalizeUrl(s.src, doc.baseURI), type:'media'}); });
    });
    Array.from(doc.querySelectorAll('style')).forEach(st=>{
      const text = st.textContent || '';
      let re = /url\(([^)]+)\)/g, m;
      while((m = re.exec(text))){ let raw = m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
    });
    try {
      Array.from(doc.styleSheets).forEach(ss=>{
        try {
          Array.from(ss.cssRules||[]).forEach(rule=>{
            const txt = rule.cssText || ''; let re = /url\(([^)]+)\)/g, m;
            while((m = re.exec(txt))){ let raw = m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
          });
        } catch(e){
          if(ss.href) assets.set(normalizeUrl(ss.href, doc.baseURI), {url:normalizeUrl(ss.href, doc.baseURI), type:'css'});
        }
      });
    } catch(e){}
    return Array.from(assets.values());
  }

  // ------------------
  // UI: prompt-driven menus (multi-line prompt supported)
  // ------------------
  async function mainLoop(){
    alert('Assets Tool 起動 — Alert UI (OK/Cancel を利用)');
    while(true){
      const opt = prompt(
`Main Menu

1: This Page
2: Other Page
3: Other Thing

キャンセル = 終了`);
      if(opt === null){ alert('終了'); break; }
      if(opt.trim() === '1'){ await thisPageMenu(); }
      else if(opt.trim() === '2'){ await otherPageMenu(); }
      else if(opt.trim() === '3'){ await otherThingMenu(); }
      else { alert('無効な選択'); }
    }
  }

  async function thisPageMenu(){
    while(true){
      const opt = prompt(
`This Page

1: Assets 一覧 (個別DL)
2: Assets DL [Here] (ZIP)

キャンセル = 戻る`);
      if(opt === null) return;
      if(opt.trim() === '1'){ await handleThisPageList(); }
      else if(opt.trim() === '2'){ await handleThisPageZip(); }
      else alert('無効な選択');
    }
  }

  async function otherPageMenu(){
    while(true){
      const opt = prompt(
`Other Page

1: Assets DL [URL] (ZIP)
2: Web See (完全ミラー)

キャンセル = 戻る`);
      if(opt === null) return;
      if(opt.trim() === '1'){
        const url = prompt('Assets DL 対象 URL を入力 (キャンセル=戻る)');
        if(url) await zipRemotePageAssets(url);
      } else if(opt.trim() === '2'){
        await webSeeFlow();
      } else alert('無効');
    }
  }

  async function otherThingMenu(){
    while(true){
      const opt = prompt(
`Other Thing

1: HTML Tool (直接編集タイプ)
2: Mini Games

キャンセル = 戻る`);
      if(opt === null) return;
      if(opt.trim() === '1'){ openHtmlToolDirect(); }
      else if(opt.trim() === '2'){ await miniGamesMenu(); }
      else alert('無効');
    }
  }

  async function miniGamesMenu(){
    while(true){
      const opt = prompt(
`Mini Games (Dark Metal)

1: Tap Box
2: Avoider
3: Shooter
4: Memory Tiles
5: 2048 Lite

キャンセル = 戻る`);
      if(opt === null) return;
      if(['1','2','3','4','5'].includes(opt.trim())) { openMiniGame(opt.trim()); }
      else alert('無効');
    }
  }

  // ------------------
  // This Page: list & download item
  // ------------------
  async function handleThisPageList(){
    const assets = discoverAssetsFromDocument(document);
    if(assets.length === 0){ alert('アセットが検出されませんでした。'); return; }
    // chunk display (40 items per prompt)
    const per = 32;
    let index = null;
    for(let start=0; start<assets.length; start+=per){
      const chunk = assets.slice(start, start+per);
      const list = chunk.map((a,i)=>`${start+i+1}: ${fileNameFromUrl(a.url)} — ${a.type}`).join('\n');
      const sel = prompt(`Assets 一覧（${start+1}〜${Math.min(start+per,assets.length)} / ${assets.length}）\n\n${list}\n\nDLしたい番号を入力（キャンセルで戻る）`);
      if(sel === null) return;
      const n = parseInt(sel.trim(),10);
      if(!isNaN(n) && n>=1 && n<=assets.length){ index = n-1; break; }
      alert('無効な番号、次の一覧を表示します。');
    }
    if(index === null){
      const sel2 = prompt(`全 ${assets.length} 件から番号を入力（1〜${assets.length}）`);
      if(!sel2) return;
      const n2 = parseInt(sel2.trim(),10);
      if(isNaN(n2) || n2<1 || n2>assets.length){ alert('無効'); return; }
      index = n2-1;
    }
    const item = assets[index];
    if(!item) { alert('選択エラー'); return; }
    await downloadUrlDirect(item.url);
  }

  async function downloadUrlDirect(url){
    try{
      alert('ダウンロードを開始します:\n' + url);
      const r = await fetchWithFallback(url);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const blob = await r.blob();
      downloadBlobAsFile(blob, fileNameFromUrl(url));
      alert('ダウンロード完了: ' + fileNameFromUrl(url));
    }catch(e){
      alert('ダウンロード失敗: ' + (e.message || e));
      console.error(e);
    }
  }

  async function handleThisPageZip(){
    if(!confirm('This Page のアセットを ZIP にまとめてダウンロードします。\nOK = 実行 / Cancel = 戻る')) return;
    try{
      alert('ZIP を作成します（処理に時間がかかる場合があります）');
      await loadScript(CONFIG.JSZIP_CDN);
      if(!window.JSZip) throw new Error('JSZip 読み込み失敗');
      const JSZip = window.JSZip;
      const zip = new JSZip();
      try{ zip.file('index.html', document.documentElement.outerHTML); }catch(e){}
      const assets = discoverAssetsFromDocument(document);
      const folder = zip.folder('assets');
      for(const a of assets){
        try{
          const r = await fetchWithFallback(a.url);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const name = fileNameFromUrl(a.url);
          folder.file(name, blob);
        }catch(e){
          console.warn('skip asset', a.url, e);
        }
      }
      const content = await zip.generateAsync({type:'blob'});
      downloadBlobAsFile(content, 'thispage-assets.zip');
      alert('ZIP ダウンロード完了');
    }catch(e){
      alert('ZIP 作成失敗: ' + (e.message || e));
      console.error(e);
    }
  }

  // ------------------
  // Remote page: parse asset URLs
  // ------------------
  function parseAssetUrlsFromHtml(html, base){
    const urls = new Set();
    const re = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*["']?([^"'\s>]+)["']?/ig;
    let m;
    while((m = re.exec(html))){ urls.add(normalizeUrl(m[1], base)); }
    const re2 = /url\(([^)]+)\)/ig;
    while((m = re2.exec(html))){ let u = m[1].replace(/['"]/g,'').trim(); urls.add(normalizeUrl(u, base)); }
    return Array.from(urls);
  }

  async function zipRemotePageAssets(pageUrl){
    try{
      if(!confirm('指定ページのAssetsをZIPで取得します。\nOK=実行 / Cancel=戻る')) return;
      // fetch page with retry
      let html = null;
      while(true){
        try{
          alert('ページ取得: ' + pageUrl);
          const r = await fetchWithFallback(pageUrl, {mode:'cors'});
          if(!r.ok) throw new Error('HTTP '+r.status);
          html = await r.text();
          break;
        }catch(e){
          console.error('page fetch failed', e);
          const retry = confirm('ページ取得失敗: ' + (e.message||e) + '\n再試行しますか？（OK=再試行 / Cancel=中止）');
          if(!retry) return;
        }
      }
      await loadScript(CONFIG.JSZIP_CDN);
      if(!window.JSZip) throw new Error('JSZip 読み込み失敗');
      const JSZip = window.JSZip;
      const zip = new JSZip();
      zip.file('index.html', html);
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      const folder = zip.folder('assets');
      const failed = [];
      for(const u of assets){
        let ok = false;
        while(!ok){
          try{
            const r = await fetchWithFallback(u);
            if(!r.ok) throw new Error('HTTP '+r.status);
            const blob = await r.blob();
            const path = (new URL(u)).pathname.replace(/^\//,'') || fileNameFromUrl(u);
            folder.file(path, blob);
            ok = true;
          }catch(e){
            console.warn('asset fetch failed', u, e);
            const retry = confirm('アセット取得失敗: ' + u + '\n再試行しますか？（OK=再試行 / Cancel=スキップ）');
            if(!retry){ failed.push(u); break; }
          }
        }
      }
      const content = await zip.generateAsync({type:'blob'});
      downloadBlobAsFile(content, 'remote-assets.zip');
      alert('Remote ZIP 完了\n失敗したURL数: ' + failed.length);
    }catch(e){
      alert('Remote ZIP エラー: ' + (e.message || e));
      console.error(e);
    }
  }

  // ------------------
  // Web See (full mirror A2) with retry per resource
  // ------------------
  async function webSeeFlow(){
    while(true){
      const url = prompt('Web See — 対象URLを入力（キャンセルで戻る）');
      if(!url) return;
      const ok = await webSeeMirrorWithRetry(url);
      if(ok) return;
      const cont = confirm('Web See に失敗しました。再試行しますか？（OK=再試行 / Cancel=戻る）');
      if(!cont) return;
    }
  }

  async function webSeeMirrorWithRetry(pageUrl){
    try{
      // fetch page
      let html = null;
      while(true){
        try{
          alert('ページ取得: ' + pageUrl);
          const r = await fetchWithFallback(pageUrl, {mode:'cors'});
          if(!r.ok) throw new Error('HTTP '+r.status);
          html = await r.text();
          break;
        }catch(e){
          console.error('page fetch failed', e);
          const retry = confirm('ページ取得失敗: ' + (e.message||e) + '\n再試行しますか？（OK=再試行 / Cancel=中止）');
          if(!retry) return false;
        }
      }

      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('検出アセット数: ' + assets.length);
      // fetch assets (retry per asset)
      const blobMap = {};
      for(const u of assets){
        let ok = false;
        while(!ok){
          try{
            const r = await fetchWithFallback(u);
            if(!r.ok) throw new Error('HTTP '+r.status);
            const blob = await r.blob();
            blobMap[u] = URL.createObjectURL(blob);
            ok = true;
          }catch(e){
            console.warn('asset fetch fail', u, e);
            const retry = confirm('アセット取得失敗: ' + u + '\n再試行しますか？（OK=再試行 / Cancel=スキップ）');
            if(!retry) break;
          }
        }
      }

      // rewrite HTML (absolute then path)
      let rewritten = html;
      Object.keys(blobMap).forEach(orig=>{
        const b = blobMap[orig];
        rewritten = rewritten.split(orig).join(b);
        try{
          const p = (new URL(orig)).pathname;
          rewritten = rewritten.split(p).join(b);
        }catch(e){}
      });
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
      const blob = new Blob([rewritten], {type:'text/html'});
      const u = URL.createObjectURL(blob);
      window.open(u, '_blank');
      alert('ミラーを新タブで開きました（完全再現は保証しません）');
      return true;
    }catch(e){
      alert('Web See エラー: ' + (e.message||e));
      console.error(e);
      return false;
    }
  }

  // ------------------
  // HTML Tool: direct-create/edit (no upload) — opens a full editor page in new tab
  // ------------------
  function openHtmlToolDirect(){
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HTML Tool (Direct Edit)</title>
<style>
:root{--bg:#070709;--panel:#0f0f12;--accent:#ff4b4b;color:#eee}
body{margin:0;font-family:system-ui;background:linear-gradient(180deg,#030304,#060608);color:var(--accent)}
.header{display:flex;gap:8px;padding:12px;align-items:center;justify-content:space-between}
.container{display:flex;gap:12px;padding:12px}
.left{width:320px;min-height:300px}
.right{flex:1}
.file{background:#0b0b0d;border:1px solid #222;padding:8px;margin-bottom:8px;border-radius:8px;color:#ddd}
textarea{width:100%;height:60vh;background:#0f0f10;color:#fff;border:1px solid #222;padding:8px;font-family:monospace}
button{padding:8px 10px;border-radius:6px;background:#111;border:1px solid #333;color:#fff}
.list{max-height:60vh;overflow:auto}
.filename{font-weight:700;color:#fff}
.small{font-size:13px;color:#bbb}
</style>
</head>
<body>
<div class="header">
  <div><strong>HTML Tool — Direct Edit</strong> <span class="small">(create files, edit, zip, combine, preview)</span></div>
  <div>
    <button id="btnNew">New File</button>
    <button id="btnZip">Download ZIP</button>
    <button id="btnCombine">Combine to Single HTML</button>
    <button id="btnPreview">Preview</button>
  </div>
</div>
<div class="container">
  <div class="left">
    <div id="fileList" class="list"></div>
  </div>
  <div class="right">
    <div id="editorArea"><div class="small">ファイルを選択してください</div></div>
  </div>
</div>

<script>
(function(){
  const fileListEl = document.getElementById('fileList');
  const editorArea = document.getElementById('editorArea');
  const files = []; // {name, text}
  function renderList(){
    fileListEl.innerHTML = '';
    if(files.length===0){ fileListEl.innerHTML = '<div class="file small">No files. Click New File.</div>'; return; }
    files.forEach((f, idx) => {
      const d = document.createElement('div'); d.className='file';
      const name = document.createElement('div'); name.className='filename'; name.textContent = f.name;
      const btnEdit = document.createElement('button'); btnEdit.textContent='Edit'; btnEdit.onclick = ()=> openEditor(idx);
      const btnDL = document.createElement('button'); btnDL.textContent='Download'; btnDL.style.marginLeft='6px'; btnDL.onclick = ()=>{
        const b = new Blob([f.text], {type:'text/plain'}); const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download=f.name; a.click();
      };
      const btnDel = document.createElement('button'); btnDel.textContent='Delete'; btnDel.style.marginLeft='6px'; btnDel.onclick = ()=>{ if(confirm('Delete '+f.name+'?')){ files.splice(idx,1); renderList(); editorArea.innerHTML='<div class="small">ファイルを選択してください</div>'; } };
      d.appendChild(name); d.appendChild(btnEdit); d.appendChild(btnDL); d.appendChild(btnDel);
      fileListEl.appendChild(d);
    });
  }
  function openEditor(idx){
    const f = files[idx];
    editorArea.innerHTML = '';
    const title = document.createElement('div'); title.textContent = f.name; title.style.fontWeight='700'; title.style.marginBottom='6px';
    const ta = document.createElement('textarea'); ta.value = f.text;
    const btnSave = document.createElement('button'); btnSave.textContent='Save'; btnSave.onclick = ()=>{ files[idx].text = ta.value; alert('Saved'); renderList(); };
    const btnRename = document.createElement('button'); btnRename.textContent='Rename'; btnRename.style.marginLeft='6px'; btnRename.onclick = ()=>{ const nn = prompt('New filename', f.name); if(nn) { files[idx].name = nn; renderList(); title.textContent = nn; } };
    editorArea.appendChild(title); editorArea.appendChild(ta); editorArea.appendChild(btnSave); editorArea.appendChild(btnRename);
  }
  document.getElementById('btnNew').onclick = ()=>{
    const name = prompt('New filename (e.g. index.html, style.css)');
    if(!name) return;
    const sample = name.match(/\\.html?$/i) ? '<!doctype html>\\n<html>\\n<head><meta charset=\"utf-8\"><title>'+name+'</title></head>\\n<body>\\n<h1>'+name+'</h1>\\n</body>\\n</html>' : '';
    files.push({name:name, text: sample});
    renderList();
  };
  document.getElementById('btnZip').onclick = async ()=>{
    if(files.length===0){ alert('No files'); return; }
    if(!window.JSZip){ const s=document.createElement('script'); s.src='${CONFIG.JSZIP_CDN}'; document.head.appendChild(s); await new Promise(r=>s.onload=r); }
    const zip = new JSZip();
    files.forEach(f=>zip.file(f.name, f.text));
    const blob = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'files.zip'; a.click();
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'combined.html'; a.click();
  };
  document.getElementById('btnPreview').onclick = ()=>{
    if(files.length===0){ alert('No files'); return; }
    const htmlFile = files.find(x=>x.name.match(/\\.html?$/i)) || null;
    let out = '';
    if(htmlFile){
      out = htmlFile.text;
      const cssText = files.filter(f=>f.name.match(/\\.css$/i)).map(f=>'/* '+f.name+' */\\n'+f.text).join('\\n');
      const jsText = files.filter(f=>f.name.match(/\\.js$/i)).map(f=>'// '+f.name+'\\n'+f.text).join('\\n');
      out = out.replace(/<\\/head>/i, '<style>\\n'+cssText+'\\n</style>\\n</head>');
      out = out.replace(/<\\/body>/i, '<script>\\n'+jsText+'\\n</script>\\n</body>');
    } else {
      // no html: create simple wrapper
      const body = files.filter(f=>f.name.match(/\\.html?$/i)===false).map(f=>'<!-- '+f.name+' -->').join('\\n');
      out = '<!doctype html>\\n<html><head><meta charset=\"utf-8\"><title>Preview</title></head><body>Preview</body></html>';
    }
    const blob = new Blob([out], {type:'text/html'});
    window.open(URL.createObjectURL(blob), '_blank');
  };

  renderList();
})();
</script>
</body>
</html>`;
    const u = URL.createObjectURL(new Blob([html], {type:'text/html'}));
    window.open(u, '_blank');
  }

  // ------------------
  // MiniGames: create blob pages (Dark Metal, sound, HS)
  // ------------------
  function openMiniGame(n){
    const key = String(n);
    const html = [
      makeTapBox(),
      makeAvoider(),
      makeShooter(),
      makeMemory(),
      make2048()
    ][n-1];
    const u = URL.createObjectURL(new Blob([html], {type:'text/html'}));
    window.open(u, '_blank');
  }

  // Game 1: Tap Box
  function makeTapBox(){
    return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<head><title>Tap Box</title>
<style>
body{margin:0;background:linear-gradient(180deg,#060608,#0b0b0d);font-family:system-ui;color:#eee;overflow:hidden}
#hud{position:fixed;right:12px;top:12px;text-align:right}
#exit{position:fixed;left:12px;top:12px;padding:8px;border-radius:6px;background:#0b0b0d;color:#fff;border:1px solid #222}
canvas{display:block}
</style>
</head><body>
<button id="exit">Exit</button><div id="hud">Score: <span id="score">0</span> High: <span id="high">0</span></div><canvas id="cv"></canvas>
<script>
(() => {
  const c=document.getElementById('cv'); const ctx=c.getContext('2d');
  function resize(){ c.width = innerWidth; c.height = innerHeight; } addEventListener('resize', resize); resize();
  let targets = [], score=0; const HS='tapbox_hs';
  const ac = new (window.AudioContext||window.webkitAudioContext)();
  const high = localStorage.getItem(HS)|0; document.getElementById('high').textContent = high;
  function sfx(freq,t=0.07){ const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=freq; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.5,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+t); setTimeout(()=>o.stop(),t*1000+50); }
  function spawn(){ const size = 40+Math.random()*80; const x = Math.random()*(c.width-size); const y = Math.random()*(c.height-size); targets.push({x,y,w:size,ts:Date.now()}); }
  setInterval(spawn, 700);
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    for(let i=0;i<6;i++){ ctx.fillStyle = i%2? 'rgba(255,255,255,0.01)' : 'rgba(255,75,75,0.01)'; ctx.fillRect(0,i*(c.height/6),c.width,c.height/6); }
    for(let i=targets.length-1;i>=0;i--){
      const t = targets[i]; const age=(Date.now()-t.ts)/1000; const pulse = 1+Math.sin(age*6)*0.06;
      ctx.save(); ctx.translate(t.x+t.w/2,t.y+t.w/2); ctx.scale(pulse,pulse);
      ctx.fillStyle='rgba(255,75,75,0.14)'; ctx.fillRect(-t.w/2,-t.w/2,t.w,t.w);
      ctx.strokeStyle='#ff4b4b'; ctx.lineWidth=3; ctx.strokeRect(-t.w/2,-t.w/2,t.w,t.w);
      ctx.restore();
      if(age>3.8){ targets.splice(i,1); score = Math.max(0, score-1); document.getElementById('score').textContent = score; }
    }
    requestAnimationFrame(draw);
  }
  c.addEventListener('pointerdown', e=>{
    const r=c.getBoundingClientRect(); const px=e.clientX - r.left, py=e.clientY - r.top;
    for(let i=targets.length-1;i>=0;i--){
      const t = targets[i];
      if(px>=t.x && px<=t.x+t.w && py>=t.y && py<=t.y+t.w){
        sfx(800+Math.random()*400,0.08);
        const cx=t.x+t.w/2, cy=t.y+t.w/2; let r0=0; const id = setInterval(()=>{ ctx.beginPath(); ctx.arc(cx,cy,r0,0,Math.PI*2); ctx.strokeStyle='rgba(255,200,120,'+(0.8-r0/140)+')'; ctx.lineWidth=3; ctx.stroke(); r0+=8; if(r0>140) clearInterval(id); },16);
        targets.splice(i,1); score++; document.getElementById('score').textContent = score;
        if(score > (localStorage.getItem(HS)|0)){ localStorage.setItem(HS, score); document.getElementById('high').textContent = score; }
        return;
      }
    }
  });
  draw();
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script>
</body></html>`;
  }

  // Game 2: Avoider
  function makeAvoider(){
    return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<head><title>Avoider</title><style>body{margin:0;background:#050507;color:#fff}canvas{display:block}</style></head><body><canvas id="g"></canvas><button id="exit" style="position:fixed;left:12px;bottom:12px">Exit</button>
<script>
(() => {
  const c=document.getElementById('g'); const ctx=c.getContext('2d');
  function r(){ c.width = innerWidth; c.height = innerHeight; } addEventListener('resize', r); r();
  let player={x:c.width/2,y:c.height-80,r:18}, obs=[], score=0; const HS='avoider_hs';
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  function beep(){ const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.value=220; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.4,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.08); setTimeout(()=>o.stop(),120); }
  function spawn(){ const w=30+Math.random()*70; obs.push({x:Math.random()*(c.width-w), y:-w, w, vy:2+Math.random()*3}); }
  setInterval(spawn, 600);
  function update(){
    for(let i=obs.length-1;i>=0;i--){ obs[i].y += obs[i].vy; if(obs[i].y > c.height){ obs.splice(i,1); score++; } }
    for(const o of obs){ const dx=o.x+o.w/2 - player.x; const dy=o.y+o.w/2 - player.y; if(Math.hypot(dx,dy) < o.w/2 + player.r - 2){ beep(); if(confirm('Game Over\\nScore: '+score+'\\nOK=Retry / Cancel=Exit')){ obs=[]; score=0; } else { window.close(); return; } } }
  }
  function draw(){ ctx.clearRect(0,0,c.width,c.height); const g=ctx.createLinearGradient(0,0,0,c.height); g.addColorStop(0,'#070708'); g.addColorStop(1,'#0b0b0d'); ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height); ctx.fillStyle='#33aaff'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,Math.PI*2); ctx.fill(); obs.forEach(o=>{ ctx.fillStyle='#ff6666'; ctx.fillRect(o.x,o.y,o.w,o.w); }); ctx.fillStyle='#fff'; ctx.fillText('Score: '+score,12,24); }
  addEventListener('pointermove', e=>{ const r=c.getBoundingClientRect(); player.x = e.clientX - r.left; });
  addEventListener('touchmove', e=>{ const t=e.touches[0]; const r=c.getBoundingClientRect(); player.x = t.clientX - r.left; e.preventDefault(); });
  function loop(){ update(); draw(); requestAnimationFrame(loop); }
  loop();
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script></body></html>`;
  }

  // Game 3: Shooter
  function makeShooter(){
    return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<head><title>Shooter</title><style>body{margin:0;background:#050507;color:#fff}canvas{display:block}</style></head><body>
<canvas id="c"></canvas><button id="exit" style="position:fixed;left:12px;bottom:12px">Exit</button>
<script>
(() => {
  const c=document.getElementById('c'); const ctx=c.getContext('2d'); function r(){ c.width=innerWidth; c.height=innerHeight; } addEventListener('resize', r); r();
  let ship={x:c.width/2,y:c.height-80,w:36,h:20}, bullets=[], enemies=[], score=0; const HS='shooter_hs';
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  function shot(){ const o=ac.createOscillator(),g=ac.createGain(); o.type='sawtooth'; o.frequency.value=1100; o.connect(g); g.connect(ac.destination); g.gain.value=0.0001; o.start(); g.gain.exponentialRampToValueAtTime(0.5,ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.12); setTimeout(()=>o.stop(),150); }
  function spawn(){ enemies.push({x:Math.random()*(c.width-40)+20,y:-40,vy:1+Math.random()*2,w:28}); }
  setInterval(spawn, 500);
  function update(dt){
    bullets.forEach(b=> b.y -= 600*dt);
    enemies.forEach(e=> e.y += e.vy + dt*20);
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      for(let j=bullets.length-1;j>=0;j--){
        const b=bullets[j];
        if(b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.w){
          bullets.splice(j,1); enemies.splice(i,1); score+=10; if(score > (localStorage.getItem(HS)|0)) localStorage.setItem(HS, score); break;
        }
      }
    }
  }
  function draw(){ ctx.clearRect(0,0,c.width,c.height); const g=ctx.createLinearGradient(0,0,0,c.height); g.addColorStop(0,'#070708'); g.addColorStop(1,'#0b0b0d'); ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height); ctx.fillStyle='#8bdcff'; ctx.fillRect(ship.x,ship.y,ship.w,ship.h); ctx.fillStyle='#ffd266'; bullets.forEach(b=> ctx.fillRect(b.x-2,b.y-8,4,8)); ctx.fillStyle='#ff7b7b'; enemies.forEach(e=> ctx.fillRect(e.x,e.y,e.w,e.w)); ctx.fillStyle='#fff'; ctx.fillText('Score: '+score,12,20); }
  let last=performance.now();
  function loop(t){ const dt=(t-last)/1000; last=t; update(dt); draw(); requestAnimationFrame(loop); }
  loop();
  addEventListener('pointermove', e=>{ ship.x = Math.max(0, Math.min(c.width-ship.w, e.clientX - 18)); });
  addEventListener('pointerdown', e=>{ bullets.push({x: ship.x + ship.w/2, y: ship.y}); shot(); });
  addEventListener('keydown', e=>{ if(e.code==='Space'){ bullets.push({x: ship.x + ship.w/2, y: ship.y}); shot(); } });
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script></body></html>`;
  }

  // Game 4: Memory Tiles
  function makeMemory(){
    return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<head><title>Memory Tiles</title><style>body{margin:0;background:#060607;color:#eee;font-family:system-ui;display:flex;flex-direction:column;align-items:center} .board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:min(720px,92vw);padding:10px} .tile{background:#111;border-radius:10px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;border:1px solid #222} .tile.revealed{background:#222;color:#ffd266}</style></head><body>
<h2>Memory Tiles</h2><div class="board" id="board"></div><button id="exit" style="position:fixed;left:12px;bottom:12px">Exit</button>
<script>
(() => {
  const board=document.getElementById('board'); const icons=['✦','✹','✺','✷','✵','✶','✸','✻']; let tiles=[], first=null,second=null,moves=0,score=0;
  const HS='memory_hs'; let high=localStorage.getItem(HS)|0;
  function init(){ const arr = icons.concat(icons); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } tiles = arr.map((v,i)=>({id:i,val:v,found:false,revealed:false})); render(); }
  function render(){ board.innerHTML=''; tiles.forEach(t=>{ const d=document.createElement('div'); d.className='tile'+(t.revealed||t.found?' revealed':''); d.textContent = (t.revealed||t.found)?t.val:''; d.onclick = ()=>clickTile(t); board.appendChild(d); }); }
  function clickTile(t){ if(t.revealed||t.found) return; t.revealed=true; if(!first) first=t; else if(!second){ second=t; moves++; setTimeout(check,400); } render(); }
  function check(){ if(!first||!second) return; if(first.val===second.val){ first.found=true; second.found=true; score+=10; if(score > high){ high=score; localStorage.setItem(HS, high);} } else { first.revealed=false; second.revealed=false; score=Math.max(0,score-2); } first=null; second=null; render(); if(tiles.every(t=>t.found)){ if(confirm('All matched! Score: '+score+'\\nOK=Play Again')) init(); } }
  init(); document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
})();
</script></body></html>`;
  }

  // Game 5: 2048 Lite
  function make2048(){
    return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<head><title>2048 Lite</title><style>body{margin:0;background:#050507;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh}.container{width:min(420px,92vw)}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#0b0b0d;padding:12px;border-radius:12px}.cell{width:80px;height:80px;background:#101014;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px}</style></head><body>
<div class="container"><div class="hud">Score: <span id="score">0</span> High: <span id="high">0</span></div><div class="grid" id="grid"></div><div style="margin-top:8px"><button id="reset">Reset</button><button id="exit">Exit</button></div></div>
<script>
(() => {
  const gridEl=document.getElementById('grid'), scoreEl=document.getElementById('score'), highEl=document.getElementById('high');
  const HS='2048_hs'; highEl.textContent = localStorage.getItem(HS)|0;
  let grid = Array.from({length:16},()=>0), score=0;
  function spawn(){ const empties = grid.map((v,i)=>v===0?i:-1).filter(v=>v>=0); if(empties.length===0) return; const idx=empties[Math.floor(Math.random()*empties.length)]; grid[idx]= Math.random()<0.9?2:4; render(); }
  function render(){ gridEl.innerHTML=''; grid.forEach(v=>{ const d=document.createElement('div'); d.className='cell'; d.textContent = v===0?'':v; gridEl.appendChild(d); }); scoreEl.textContent=score; }
  function move(dir){
    let moved=false; const mat = [[],[],[],[]];
    for(let r=0;r<4;r++) for(let c=0;c<4;c++) mat[r][c]=grid[r*4+c];
    function compress(arr){ const out = arr.filter(x=>x!==0); for(let i=0;i<out.length-1;i++){ if(out[i]===out[i+1]){ out[i]*=2; score+=out[i]; out.splice(i+1,1); } } while(out.length<4) out.push(0); return out; }
    let newMat = JSON.parse(JSON.stringify(mat));
    if(dir==='left'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r]); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='right'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r].slice().reverse()).reverse(); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='up'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(dir==='down'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col.reverse()).reverse(); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } }
    if(!moved) return; grid = newMat.flat(); spawn(); render(); if(score > (localStorage.getItem(HS)|0)){ localStorage.setItem(HS, score); highEl.textContent=score; } if(!canMove()){ if(confirm('Game Over\\nScore: '+score+'\\nOK=Restart')) reset(); }
  }
  function canMove(){ if(grid.some(v=>v===0)) return true; for(let r=0;r<4;r++) for(let c=0;c<3;c++) if(grid[r*4+c]===grid[r*4+c+1]) return true; for(let c=0;c<4;c++) for(let r=0;r<3;r++) if(grid[r*4+c]===grid[(r+1)*4+c]) return true; return false; }
  function reset(){ grid = Array.from({length:16},()=>0); score=0; spawn(); spawn(); render(); }
  render(); spawn(); spawn();
  document.getElementById('reset').onclick = ()=>reset();
  document.getElementById('exit').onclick = ()=>{ if(confirm('Exit?')) window.close(); };
  addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') move('left'); if(e.key==='ArrowRight') move('right'); if(e.key==='ArrowUp') move('up'); if(e.key==='ArrowDown') move('down'); });
  let sx=0, sy=0; addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; });
  addEventListener('touchend', e=>{ const ex=e.changedTouches[0].clientX, ey=e.changedTouches[0].clientY, dx=ex-sx, dy=ey-sy; if(Math.abs(dx)>Math.abs(dy)){ if(dx>30) move('right'); else if(dx<-30) move('left'); } else { if(dy>30) move('down'); else if(dy<-30) move('up'); } });
})();
</script></body></html>`;
  }

  // ------------------
  // Start
  // ------------------
  mainLoop();

})(); 
