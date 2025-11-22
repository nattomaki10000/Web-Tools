/* main.js
   Complete Asset Tool: This Page / Other Page (DL + Web See A2) / HTML Tool / Mini Games
   UI: alert-like modal with Back & Close
   Put this on your GitHub Pages and load via bookmarklet.
*/

(function(){
  if(window.__ASSETS_TOOL_LOADED) return alert('Tool already loaded');
  window.__ASSETS_TOOL_LOADED = true;

  const CONFIG = {
    JSZIP_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    CORS_PROXY: '' // if you have a proxy, set e.g. "https://your-proxy.example.com/"
  };

  // --- helpers ---
  function loadScript(url){ return new Promise((res,rej)=>{ if(document.querySelector('script[src="'+url+'"]')) return res(); const s=document.createElement('script'); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s); });}
  function isAbsolute(u){ try{ new URL(u); return true;}catch(e){return false;} }
  function normalizeUrl(u, base){ try{ return (new URL(u, base)).href; } catch(e){ return u; } }
  function fileNameFromUrl(u){ try{ const p=new URL(u).pathname; const n=p.split('/').filter(Boolean).pop()||'file'; return decodeURIComponent(n); }catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_'); } }
  function extFromUrl(u){ const m=(u.split('?')[0].match(/\.([a-z0-9]+)$/i)||[])[1]; return m?m.toLowerCase():''; }
  async function fetchWithFallback(url, opts={}){
    try{
      const r = await fetch(url, opts);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r;
    } catch(e){
      if(CONFIG.CORS_PROXY){
        // Proxy expects full URL appended; make sure proxy available
        const prox = CONFIG.CORS_PROXY.replace(/\/$/,'') + '/' + url;
        return fetch(prox, opts);
      }
      throw e;
    }
  }

  // --- modal (alert-like) with back/close ---
  let historyStack = [];
  function removeModal(){
    const old=document.getElementById('__asset_tool_overlay');
    if(old) old.remove();
  }
  function createModal(title, buttons){
    removeModal();
    const overlay=document.createElement('div'); overlay.id='__asset_tool_overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2147483647;-webkit-overflow-scrolling:touch;';
    const box=document.createElement('div');
    box.style.cssText='width:92%;max-width:720px;max-height:88vh;overflow:auto;background:#fff;border-radius:12px;padding:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans JP";box-shadow:0 12px 40px rgba(0,0,0,0.25)';
    const h=document.createElement('div'); h.textContent=title; h.style.cssText='font-weight:700;font-size:16px;margin-bottom:10px';
    box.appendChild(h);

    // content container
    const content=document.createElement('div'); content.id='__asset_tool_content'; box.appendChild(content);

    // buttons area
    const btnWrap=document.createElement('div'); btnWrap.style.cssText='margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center';
    buttons.forEach(b=>{
      const btn=document.createElement('button');
      btn.textContent=b.label;
      btn.style.cssText='padding:10px 14px;border-radius:8px;border:1px solid #ddd;background:#fafafa;font-size:15px';
      btn.onclick=()=>{ try{ b.onClick(); }catch(e){ console.error(e); alert('Error: '+(e.message||e)); } };
      btnWrap.appendChild(btn);
    });

    // back & close
    const navRow=document.createElement('div'); navRow.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-top:12px';
    if(historyStack.length>0){
      const back=document.createElement('button'); back.textContent='← 戻る'; back.style.cssText='padding:8px;border-radius:8px'; back.onclick=goBack; navRow.appendChild(back);
    }
    const close=document.createElement('button'); close.textContent='✕ 閉じる'; close.style.cssText='padding:8px;border-radius:8px'; close.onclick=()=>{ removeModal(); historyStack=[]; window.__ASSETS_TOOL_ACTIVE=false; }; navRow.appendChild(close);

    box.appendChild(btnWrap); box.appendChild(navRow);
    overlay.appendChild(box); document.body.appendChild(overlay);
    return content;
  }
  function pushState(fn){ historyStack.push(fn); fn(); }
  function goBack(){ historyStack.pop(); const prev = historyStack[historyStack.length-1]; prev?prev():removeModal(); }

  // --- Asset discovery on current doc ---
  function discoverAssetsFromDocument(doc=document){
    const assets = new Map();
    // index
    try{ assets.set(doc.location.href, {url:doc.location.href, type:'html'}); }catch(e){}
    // links
    Array.from(doc.querySelectorAll('link[rel="stylesheet"],link[rel="preload"],link[rel="icon"],link[rel="mask-icon"]')).forEach(l=>{
      if(l.href) assets.set(normalizeUrl(l.href, doc.baseURI), {url:normalizeUrl(l.href, doc.baseURI), type:'css'});
    });
    // scripts
    Array.from(doc.querySelectorAll('script[src]')).forEach(s=>{ if(s.src) assets.set(normalizeUrl(s.src, doc.baseURI), {url:normalizeUrl(s.src, doc.baseURI), type:'js'}); });
    // images
    Array.from(doc.querySelectorAll('img')).forEach(i=>{ const u=i.currentSrc||i.src; if(u) assets.set(normalizeUrl(u, doc.baseURI), {url:normalizeUrl(u, doc.baseURI), type:'image'}); });
    // video/audio & sources
    Array.from(doc.querySelectorAll('video, audio')).forEach(media=>{
      const s = media.currentSrc || media.src;
      if(s) assets.set(normalizeUrl(s, doc.baseURI), {url:normalizeUrl(s, doc.baseURI), type:'media'});
      Array.from(media.querySelectorAll('source')).forEach(src=>{ if(src.src) assets.set(normalizeUrl(src.src, doc.baseURI), {url:normalizeUrl(src.src, doc.baseURI), type:'media'}); });
    });
    // style tags & CSS rules (extract url(...) occurrences)
    Array.from(doc.querySelectorAll('style')).forEach(st=>{
      const text = st.textContent || '';
      const re = /url\(([^)]+)\)/g; let m;
      while((m=re.exec(text))){ const raw = m[1].replace(/["']/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
    });
    // cssRules from same-origin stylesheets
    try{
      Array.from(doc.styleSheets).forEach(ss=>{
        try{
          Array.from(ss.cssRules||[]).forEach(rule=>{
            const txt = rule.cssText || '';
            const re = /url\(([^)]+)\)/g; let m;
            while((m=re.exec(txt))){ const raw = m[1].replace(/["']/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
          });
        }catch(e){
          // cross-origin stylesheet — include href so user can try to fetch via proxy
          if(ss.href) assets.set(normalizeUrl(ss.href, doc.baseURI), {url:normalizeUrl(ss.href, doc.baseURI), type:'css'});
        }
      });
    }catch(e){}
    return Array.from(assets.values());
  }

  // --- show assets list modal (This Page) with per-item DL ---
  function showThisPageAssetsList(){
    const content = createModal('Assets 一覧 — This Page', []);
    const list = discoverAssetsFromDocument(document);
    if(list.length===0){ content.innerHTML='<div>アセットが検出されませんでした。</div>'; return; }
    const ul=document.createElement('div'); ul.style.cssText='display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto';
    list.forEach(a=>{
      const row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;border:1px solid #eee';
      const icon=document.createElement('div'); icon.textContent = typeIcon(a.type); icon.style.cssText='width:36px';
      const txt=document.createElement('div'); txt.style.cssText='flex:1;word-break:break-all;font-size:13px'; txt.textContent = fileNameFromUrl(a.url)+'  —  '+shortenUrl(a.url);
      const dl=document.createElement('button'); dl.textContent='DL'; dl.style.cssText='padding:6px 10px;border-radius:6px'; dl.onclick=()=>downloadUrlDirect(a.url);
      row.appendChild(icon); row.appendChild(txt); row.appendChild(dl);
      ul.appendChild(row);
    });
    content.appendChild(ul);
  }

  function typeIcon(t){
    if(!t) return '📄';
    if(t.includes('image')) return '🖼️';
    if(t==='css') return '🎨';
    if(t==='js') return '🟦';
    if(t==='html') return '🌐';
    if(t==='media') return '🎵';
    return '📦';
  }
  function shortenUrl(u, len=48){ if(u.length<=len) return u; return u.slice(0, Math.floor(len/2)) + '…' + u.slice(-Math.floor(len/2)); }

  // per-item download using fetch -> blob (handles CORS via proxy fallback)
  async function downloadUrlDirect(url){
    try{
      const r = await fetchWithFallback(url);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const blob = await r.blob();
      const a=document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileNameFromUrl(url); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
    }catch(e){
      alert('ダウンロードに失敗しました: '+(e.message||e));
      console.error(e);
    }
  }

  // --- ZIP this page assets preserving simple path structure ---
  async function zipThisPageAssets(){
    try{
      await loadScript(CONFIG.JSZIP_CDN);
      const JSZip = window.JSZip; if(!JSZip) throw new Error('JSZip load failed');
      const zip = new JSZip();
      // include index.html
      try{ zip.file('index.html', document.documentElement.outerHTML); }catch(e){}
      const assets = discoverAssetsFromDocument(document);
      const folder = zip.folder('assets');
      const promises = assets.map(async a=>{
        try{
          const r = await fetchWithFallback(a.url);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          // preserve filename
          const name = fileNameFromUrl(a.url);
          folder.file(name, blob);
        }catch(e){
          console.warn('skip', a.url, e);
        }
      });
      await Promise.all(promises);
      const content = await zip.generateAsync({type:'blob'});
      const link=document.createElement('a'); link.href=URL.createObjectURL(content); link.download='thispage-assets.zip'; document.body.appendChild(link); link.click(); link.remove();
    }catch(e){
      alert('ZIP作成失敗: '+(e.message||e));
      console.error(e);
    }
  }

  // --- Other Page: fetch page, extract assets, zip OR web-see (full mirror A2) ---
  async function otherPageActions(){
    const content = createModal('Other Page', []);
    // input form
    const form = document.createElement('div'); form.style.cssText='display:flex;gap:8px;flex-direction:column';
    const input = document.createElement('input'); input.type='url'; input.placeholder='https://example.com/'; input.style.cssText='padding:8px;border:1px solid #ddd;border-radius:8px';
    const info = document.createElement('div'); info.style.cssText='font-size:13px;color:#666;margin-bottom:6px'; info.textContent='CORSで失敗した場合はプロキシを試行します。CONFIG.CORS_PROXY を設定してください。';
    const dlBtn = document.createElement('button'); dlBtn.textContent='Assets DL [URL]'; dlBtn.style.cssText='padding:10px;border-radius:8px';
    const wsBtn = document.createElement('button'); wsBtn.textContent='Web See (Full Mirror)'; wsBtn.style.cssText='padding:10px;border-radius:8px';
    form.appendChild(input); form.appendChild(info); form.appendChild(dlBtn); form.appendChild(wsBtn);
    content.appendChild(form);

    dlBtn.onclick = async ()=>{
      const url = input.value.trim(); if(!url) return alert('URLを入力してください');
      removeModal(); await zipRemotePageAssets(url);
    };
    wsBtn.onclick = async ()=>{
      const url = input.value.trim(); if(!url) return alert('URLを入力してください');
      removeModal(); await webSeeMirror(url); // opens new tab
    };
  }

  // fetch remote page HTML text (with fallback proxy)
  async function fetchPageText(url){
    const r = await fetchWithFallback(url, {mode:'cors'}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.text();
  }

  // parse asset URLs from HTML text (simple parse)
  function parseAssetUrlsFromHtml(html, base){
    const urls = new Set();
    // <link href=...>, <script src=...>, <img src=...>, <source src=...>, url(...) in style tags
    const reLink = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*['"]?([^'">\s]+)['"]?/ig;
    let m; while((m=reLink.exec(html))){ urls.add(normalizeUrl(m[1], base)); }
    // style/url(...)
    const reUrl = /url\(([^)]+)\)/ig;
    while((m=reUrl.exec(html))){ let u=m[1].replace(/["']/g,'').trim(); if(u) urls.add(normalizeUrl(u, base)); }
    return Array.from(urls);
  }

  // zip remote page assets (A: for downloading)
  async function zipRemotePageAssets(url){
    try{
      await loadScript(CONFIG.JSZIP_CDN); const JSZip=window.JSZip; if(!JSZip) throw new Error('JSZip load failed');
      const base = url;
      const html = await fetchPageText(url);
      const zip = new JSZip();
      zip.file('index.html', html);
      const assetUrls = parseAssetUrlsFromHtml(html, base);
      const folder = zip.folder('assets');
      // fetch all assets (with concurrency)
      const tasks = assetUrls.map(async u=>{
        try{
          const r = await fetchWithFallback(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          // build path preserving pathname
          const p = (new URL(u)).pathname.replace(/^\//,'');
          const fname = p || fileNameFromUrl(u);
          folder.file(fname, blob);
        }catch(e){
          console.warn('skip remote asset', u, e);
        }
      });
      await Promise.all(tasks);
      const content = await zip.generateAsync({type:'blob'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(content); a.download='remote-assets.zip'; a.click();
    }catch(e){
      alert('Remote zip failed: '+(e.message||e));
      console.error(e);
    }
  }

  // Web See (Full Mirror - A2): fetch page + assets, rewrite references to blob URLs preserving relative folder names, open new tab normally (no tool UI)
  async function webSeeMirror(url){
    try{
      // 1. fetch page HTML
      const html = await fetchPageText(url);
      // 2. parse asset urls
      const base = url;
      const assetUrls = parseAssetUrlsFromHtml(html, base);
      // 3. fetch assets and map to blob URLs, preserve pathname-like names in a map
      const blobMap = {}; // original URL -> {blobUrl, path}
      await Promise.all(assetUrls.map(async u=>{
        try{
          const r = await fetchWithFallback(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const path = (new URL(u)).pathname.replace(/^\//,'');
          const blobUrl = URL.createObjectURL(blob);
          blobMap[u] = {blobUrl, path};
        }catch(e){
          console.warn('failed fetch asset', u, e);
        }
      }));
      // 4. rewrite html: replace occurrences of original asset URLs with blob URLs (prefer whole URL matches and relative ones)
      let rewritten = html;
      // replace absolute and relative forms; do absolute first
      Object.keys(blobMap).forEach(orig=>{
        // escape for regex
        const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rewritten = rewritten.split(orig).join(blobMap[orig].blobUrl);
        // also replace relative occurrences (path-only)
        const pathname = (new URL(orig)).pathname;
        const pEsc = pathname.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        rewritten = rewritten.replace(new RegExp(pEsc, 'g'), blobMap[orig].blobUrl);
      });
      // 5. insert <base href="..."> so relative links in remaining references still resolve correctly to original origin if any remain
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${url}">`);
      // 6. open new tab with rewritten HTML as blob URL
      const blob = new Blob([rewritten], {type:'text/html'});
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    }catch(e){
      alert('Web See failed: '+(e.message||e)+'\n(CORS/proxy may be needed)');
      console.error(e);
    }
  }

  // --- HTML Tool (upload/edit/download/zip/one-file/preview) ---
  function openHtmlTool(){
    const content = createModal('HTML Tool — Upload / Edit / Download', []);
    const instr=document.createElement('div'); instr.style.cssText='margin-bottom:8px;font-size:13px;color:#444'; instr.textContent='HTML, CSS, JS ファイルをアップロードして編集、個別DL、まとめてZIP、1つにまとめる、別タブでプレビューできます。';
    content.appendChild(instr);
    const input=document.createElement('input'); input.type='file'; input.multiple=true; input.accept='.html,.htm,.css,.js,text/*'; input.style.cssText='margin-bottom:8px';
    content.appendChild(input);
    const fileArea=document.createElement('div'); fileArea.style.cssText='display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto';
    content.appendChild(fileArea);
    let stored=[];
    input.onchange = async (e)=>{
      stored=[];
      const files = Array.from(e.target.files||[]);
      for(const f of files){ const txt = await f.text(); stored.push({name:f.name, text:txt}); }
      renderFiles();
    };
    function renderFiles(){
      fileArea.innerHTML='';
      if(stored.length===0) fileArea.innerHTML='<div>ファイルがありません。アップロードしてください。</div>';
      stored.forEach((f,i)=>{
        const card=document.createElement('div'); card.style.cssText='border:1px solid #eee;padding:8px;border-radius:8px';
        const title=document.createElement('div'); title.textContent=f.name; title.style.cssText='font-weight:600;margin-bottom:6px';
        const ta=document.createElement('textarea'); ta.value=f.text; ta.style.cssText='width:100%;height:160px;font-family:monospace;font-size:13px';
        ta.oninput = ()=> stored[i].text = ta.value;
        const actions=document.createElement('div'); actions.style.cssText='display:flex;gap:6px;margin-top:6px';
        const dlBtn=document.createElement('button'); dlBtn.textContent='Download'; dlBtn.onclick=()=>{ const blob=new Blob([stored[i].text],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=stored[i].name; a.click(); };
        const remBtn=document.createElement('button'); remBtn.textContent='Remove'; remBtn.onclick=()=>{ stored.splice(i,1); renderFiles(); };
        actions.appendChild(dlBtn); actions.appendChild(remBtn);
        card.appendChild(title); card.appendChild(ta); card.appendChild(actions);
        fileArea.appendChild(card);
      });
    }
    // action buttons
    const zipBtn=document.createElement('button'); zipBtn.textContent='まとめてZIPでダウンロード'; zipBtn.style.cssText='margin-top:8px;padding:10px;border-radius:8px';
    zipBtn.onclick = async ()=>{
      if(stored.length===0) return alert('ファイルがありません');
      await loadScript(CONFIG.JSZIP_CDN); const JSZip=window.JSZip; if(!JSZip) return alert('JSZip load failed');
      const zip=new JSZip(); stored.forEach(f=>zip.file(f.name, f.text));
      const blob = await zip.generateAsync({type:'blob'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='files.zip'; a.click();
    };
    const oneBtn=document.createElement('button'); oneBtn.textContent='一つのHTMLにまとめてダウンロード'; oneBtn.style.cssText='margin-top:8px;padding:10px;border-radius:8px';
    oneBtn.onclick = ()=>{
      if(stored.length===0) return alert('ファイルがありません');
      // pick first HTML as base or create minimal
      const htmlFile = stored.find(x=>x.name.match(/\.html?$/i)) || {text:'<!doctype html><html><head><meta charset="utf-8"><title>Combined</title></head><body><div id="app"></div></body></html>'};
      let out = htmlFile.text;
      const cssText = stored.filter(f=>f.name.match(/\.css$/i)).map(f=>'/* '+f.name+' */\n'+f.text).join('\n');
      const jsText  = stored.filter(f=>f.name.match(/\.js$/i)).map(f=>'// '+f.name+'\n'+f.text).join('\n');
      out = out.replace(/<\/head>/i, `<style>\n${cssText}\n</style>\n</head>`);
      out = out.replace(/<\/body>/i, `<script>\n${jsText}\n</script>\n</body>`);
      const blob = new Blob([out], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='combined.html'; a.click();
    };
    const previewBtn=document.createElement('button'); previewBtn.textContent='閲覧・実行確認 (別タブ)'; previewBtn.style.cssText='margin-top:8px;padding:10px;border-radius:8px';
    previewBtn.onclick = ()=>{
      if(stored.length===0) return alert('ファイルがありません');
      const htmlFile = stored.find(x=>x.name.match(/\.html?$/i)) || {text:'<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><div>No HTML</div></body></html>'};
      let out = htmlFile.text;
      const cssText = stored.filter(f=>f.name.match(/\.css$/i)).map(f=>'/* '+f.name+' */\n'+f.text).join('\n');
      const jsText  = stored.filter(f=>f.name.match(/\.js$/i)).map(f=>'// '+f.name+'\n'+f.text).join('\n');
      out = out.replace(/<\/head>/i, `<style>\n${cssText}\n</style>\n</head>`);
      out = out.replace(/<\/body>/i, `<script>\n${jsText}\n</script>\n</body>`);
      const blob=new Blob([out], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
    };

    content.appendChild(zipBtn); content.appendChild(oneBtn); content.appendChild(previewBtn);
  }

  // --- Mini Games (open sample HTMLs in new tabs) ---
  const miniGames = [
    {name:'1game', html:`<!doctype html><html><head><meta charset="utf-8"><title>1game</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff"><canvas id="c"></canvas><script>const c=document.getElementById('c');c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');let x=0;function tick(){ctx.fillStyle='black';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='white';ctx.fillRect(x,50,60,60);x=(x+3)%(c.width+100);requestAnimationFrame(tick);}tick();</script></body></html>`},
    {name:'2game', html:`<!doctype html><html><head><meta charset="utf-8"><title>2game</title></head><body style="font-family:system-ui"><h1 style="text-align:center">2game - Click to spawn</h1><div id="area" style="height:80vh;position:relative"></div><script>const a=document.getElementById('area');a.onclick=(e)=>{const d=document.createElement('div');d.style='width:30px;height:30px;background:#f66;border-radius:50%;position:absolute;left:'+e.clientX+'px;top:'+e.clientY+'px;transform:translate(-50%,-50%);';a.appendChild(d);setTimeout(()=>d.remove(),1500);};</script></body></html>`},
    {name:'3game', html:`<!doctype html><html><head><meta charset="utf-8"><title>3game</title></head><body style="font-family:system-ui"><h1 style="text-align:center">3game - Button Counter</h1><button id="b" style="display:block;margin:20px auto;padding:10px 16px">Press</button><script>let n=0;document.getElementById('b').onclick=()=>{n++;alert('Count: '+n)}</script></body></html>`},
    {name:'4game', html:`<!doctype html><html><head><meta charset="utf-8"><title>4game</title></head><body style="margin:0"><canvas id="g" style="width:100%;height:100vh"></canvas><script>const c=document.getElementById('g');c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');let balls=[];onpointerdown=e=>{balls.push({x:e.clientX,y:e.clientY,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,r:10+Math.random()*20})};function f(){ctx.clearRect(0,0,c.width,c.height);balls.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.vy+=0.2;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.28);ctx.fillStyle='rgba(0,150,200,0.7)';ctx.fill();});requestAnimationFrame(f);}f();</script></body></html>`},
    {name:'5game', html:`<!doctype html><html><head><meta charset="utf-8"><title>5game</title></head><body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center"><h2>5game - typing test</h2><div id="q">Type: hello world</div><input id="i" autofocus style="font-size:18px;padding:8px;margin-top:10px"><script>const target='hello world';const i=document.getElementById('i');i.oninput=()=>{if(i.value.trim()===target){alert('OK!');i.value='';}}</script></body></html>`}
  ];
  function openMiniGame(name){
    const g = miniGames.find(x=>x.name===name);
    if(!g) return alert('not found');
    const blob = new Blob([g.html], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
  }

  // --- Top Menu ---
  function menuTop(){
    const content = createModal('Select', [
      {label:'This Page', onClick: ()=> pushState(menuThisPage)},
      {label:'Other Page', onClick: ()=> pushState(otherPageActions)},
      {label:'Other Thing', onClick: ()=> pushState(menuOtherThing)}
    ]);
  }
  function menuThisPage(){
    createModal('This Page', [
      {label:'Assets 一覧', onClick: ()=> showThisPageAssetsList()},
      {label:'Assets DL [Here]', onClick: ()=> { removeModal(); zipThisPageAssets(); }}
    ]);
  }
  function menuOtherThing(){
    createModal('Other Thing', [
      {label:'HTML Tool', onClick: ()=> openHtmlTool()},
      {label:'Mini Games', onClick: ()=> createModal('Mini Games', miniGames.map(m=>({label:m.name, onClick: ()=> openMiniGame(m.name)})))}
    ]);
  }

  // start
  historyStack=[]; pushState(menuTop);

})();
