/* menu.js
   Alert-only UI menu. Replace BASE_URL below to your GitHub Pages base (no trailing slash).
   Example: BASE_URL = 'https://yourname.github.io/repo'
*/

(function(){
  if(window.__ASSETS_MENU_LOADED) { alert('Tool is already loaded'); return; }
  window.__ASSETS_MENU_LOADED = true;

  const BASE_URL = 'YOUR_BASE_URL_HERE'; // <-- ここを自分の GitHub Pages のベースに書き換えてください（例: https://yourname.github.io/repo）
  const CONFIG = {
    JSZIP_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    CORS_PROXY: '' // 必要なら "https://your-cors-proxy.example.com" を入れる（末尾は/不要）
  };

  function normalizeUrl(u, base){
    try { return (new URL(u, base)).href; } catch(e){ return u; }
  }
  function fileNameFromUrl(u){
    try{ const p=new URL(u).pathname; return decodeURIComponent((p.split('/').filter(Boolean).pop())||'file'); }catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_'); }
  }
  async function fetchWithFallback(url, opts){
    try{
      const r = await fetch(url, opts);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r;
    }catch(e){
      if(CONFIG.CORS_PROXY){
        const prox = CONFIG.CORS_PROXY.replace(/\/$/,'') + '/' + url;
        return fetch(prox, opts);
      }
      throw e;
    }
  }

  // --- asset discovery on current document ---
  function discoverAssetsFromDocument(doc){
    const assets = new Map();
    try{ assets.set(doc.location.href, {url:doc.location.href, type:'html'}); }catch(e){}
    Array.from(doc.querySelectorAll('link[rel="stylesheet"],link[rel=icon],link[rel=preload]')).forEach(l=>{ if(l.href) assets.set(normalizeUrl(l.href, doc.baseURI), {url:normalizeUrl(l.href, doc.baseURI), type:'css'}); });
    Array.from(doc.querySelectorAll('script[src]')).forEach(s=>{ if(s.src) assets.set(normalizeUrl(s.src, doc.baseURI), {url:normalizeUrl(s.src, doc.baseURI), type:'js'}); });
    Array.from(doc.querySelectorAll('img')).forEach(i=>{ const u=i.currentSrc||i.src; if(u) assets.set(normalizeUrl(u, doc.baseURI), {url:normalizeUrl(u, doc.baseURI), type:'image'}); });
    Array.from(doc.querySelectorAll('video, audio')).forEach(m=>{
      const s = m.currentSrc || m.src; if(s) assets.set(normalizeUrl(s, doc.baseURI), {url:normalizeUrl(s, doc.baseURI), type:'media'});
      Array.from(m.querySelectorAll('source')).forEach(src=>{ if(src.src) assets.set(normalizeUrl(src.src, doc.baseURI), {url:normalizeUrl(src.src, doc.baseURI), type:'media'}); });
    });
    Array.from(doc.querySelectorAll('style')).forEach(st=>{
      const text = st.textContent || '';
      let re = /url\(([^)]+)\)/g, m;
      while((m=re.exec(text))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
    });
    try{
      Array.from(doc.styleSheets).forEach(ss=>{
        try{
          Array.from(ss.cssRules||[]).forEach(rule=>{
            const txt = rule.cssText || ''; let re = /url\(([^)]+)\)/g, m;
            while((m=re.exec(txt))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) assets.set(normalizeUrl(raw, doc.baseURI), {url:normalizeUrl(raw, doc.baseURI), type:'asset'}); }
          });
        }catch(e){
          if(ss.href) assets.set(normalizeUrl(ss.href, doc.baseURI), {url:normalizeUrl(ss.href, doc.baseURI), type:'css'});
        }
      });
    }catch(e){}
    return Array.from(assets.values());
  }

  // --- download helpers ---
  async function downloadBlobAsFile(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
  }
  async function downloadUrlDirect(url){
    try{
      alert('ダウンロード開始: ' + url);
      const r = await fetchWithFallback(url);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const blob = await r.blob();
      downloadBlobAsFile(blob, fileNameFromUrl(url));
      alert('ダウンロード完了: ' + fileNameFromUrl(url));
    }catch(e){
      alert('ダウンロードに失敗しました。\n'+(e.message||e)+'\n（CORS の問題の可能性あり）');
      console.error(e);
    }
  }

  // --- This Page: list assets via alert and let user pick single item to DL ---
  async function handleThisPageList(){
    const assets = discoverAssetsFromDocument(document);
    if(assets.length === 0){ alert('アセットが検出されませんでした。'); return; }
    // build a numbered string (may be long)
    let s = '検出されたアセット一覧：\n';
    assets.forEach((a,i)=> s += (i+1) + '. ' + fileNameFromUrl(a.url) + ' — ' + a.type + '\n');
    s += '\nダウンロードしたい番号を入力してください（キャンセルで戻る）';
    let choice = prompt(s);
    if(choice === null) return; // cancelled
    choice = choice.trim();
    if(!choice) return;
    const idx = parseInt(choice,10);
    if(isNaN(idx) || idx < 1 || idx > assets.length){ alert('無効な番号です'); return; }
    const item = assets[idx-1];
    await downloadUrlDirect(item.url);
  }

  // --- This Page: ZIP assets ---
  async function handleThisPageZip(){
    if(!confirm('This Page のアセットを ZIP にまとめてダウンロードしますか？\nOK=実行 / Cancel=戻る')) return;
    try{
      alert('ZIP を作成します。準備してください。処理が長くなる場合があります。');
      await loadScript(CONFIG.JSZIP_CDN);
      if(!window.JSZip) throw new Error('JSZip の読み込みに失敗しました');
      const JSZip = window.JSZip;
      const zip = new JSZip();
      try{ zip.file('index.html', document.documentElement.outerHTML); }catch(e){}
      const assets = discoverAssetsFromDocument(document);
      const folder = zip.folder('assets');
      const tasks = assets.map(async a=>{
        try{
          const r = await fetchWithFallback(a.url);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const fname = fileNameFromUrl(a.url);
          folder.file(fname, blob);
        }catch(e){
          console.warn('skip', a.url, e);
        }
      });
      await Promise.all(tasks);
      const content = await zip.generateAsync({type:'blob'});
      await downloadBlobAsFile(content, 'thispage-assets.zip');
      alert('ZIP ダウンロード完了');
    }catch(e){
      alert('ZIP 作成またはダウンロードに失敗しました。\n'+(e.message||e));
      console.error(e);
    }
  }

  // --- Other Page: URL input -> Assets DL (zip) OR Web See (full mirror A2) ---
  async function handleOtherPage(){
    const url = prompt('対象ページのURLを入力してください（例: https://example.com/）\nキャンセルでメニューに戻ります');
    if(!url) return;
    const choice = prompt('選択してください:\n1 = Assets DL [URL]（ZIPで保存）\n2 = Web See（完全ミラー → 新タブで再現）\nキャンセルで戻る');
    if(!choice) return;
    if(choice.trim() === '1'){
      await zipRemotePageAssets(url);
    } else if(choice.trim() === '2'){
      await webSeeMirror(url);
    } else {
      alert('無効な選択です。');
    }
  }

  // parse asset URLs from HTML text
  function parseAssetUrlsFromHtml(html, base){
    const urls = new Set();
    const re = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*["']?([^"'\s>]+)["']?/ig;
    let m;
    while((m=re.exec(html))){ urls.add(normalizeUrl(m[1], base)); }
    const re2 = /url\(([^)]+)\)/ig;
    while((m=re2.exec(html))){ let u=m[1].replace(/["']/g,'').trim(); urls.add(normalizeUrl(u, base)); }
    return Array.from(urls);
  }

  // zip remote page assets
  async function zipRemotePageAssets(pageUrl){
    try{
      if(!confirm('指定ページのAssetsを取得してZIPでダウンロードします。\nOK=実行 / Cancel=戻る')) return;
      alert('ページを取得しています: ' + pageUrl);
      const html = await fetchWithFallback(pageUrl).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); });
      await loadScript(CONFIG.JSZIP_CDN);
      if(!window.JSZip) throw new Error('JSZip load failed');
      const JSZip = window.JSZip;
      const zip = new JSZip();
      zip.file('index.html', html);
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      const folder = zip.folder('assets');
      alert('見つかったアセット数: ' + assets.length + '\n取得を開始します（時間がかかることがあります）');
      const tasks = assets.map(async u=>{
        try{
          const r = await fetchWithFallback(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const p = (new URL(u)).pathname.replace(/^\//,'');
          const name = p || fileNameFromUrl(u);
          folder.file(name, blob);
        }catch(e){
          console.warn('skip', u, e);
        }
      });
      await Promise.all(tasks);
      const content = await zip.generateAsync({type:'blob'});
      await downloadBlobAsFile(content, 'remote-assets.zip');
      alert('リモートZIPダウンロード完了');
    }catch(e){
      alert('Remote ZIP 失敗: '+(e.message||e));
      console.error(e);
    }
  }

  // Web See (Full Mirror A2) - rebuild page with blob URLs and open new tab
  async function webSeeMirror(pageUrl){
    try{
      if(!confirm('Web See（完全ミラー）を実行します。\nページの内容を取得して新タブで再現します。\nOK=実行 / Cancel=戻る')) return;
      alert('ページを取得しています: ' + pageUrl);
      const html = await fetchWithFallback(pageUrl).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); });
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('取得対象のアセット数: ' + assets.length + '\nアセットを取得します（CORSで失敗する場合があります）');
      const blobMap = {};
      await Promise.all(assets.map(async u=>{
        try{
          const r = await fetchWithFallback(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobMap[u] = blobUrl;
        }catch(e){
          console.warn('asset fetch fail', u, e);
        }
      }));
      // rewrite HTML: replace absolute occurrences first, then path-only
      let rewritten = html;
      Object.keys(blobMap).forEach(orig=>{
        rewritten = rewritten.split(orig).join(blobMap[orig]);
        try{
          const p = (new URL(orig)).pathname;
          rewritten = rewritten.split(p).join(blobMap[orig]);
        }catch(e){}
      });
      // add <base> so remaining relative links point to original site
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
      const blob = new Blob([rewritten], {type:'text/html'});
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      alert('ミラーを新タブで開きました（完全再現を保証するものではありません）');
    }catch(e){
      alert('Web See に失敗しました。\n'+(e.message||e));
      console.error(e);
    }
  }

  // simple loadScript
  function loadScript(url){
    return new Promise((res, rej)=>{
      if(document.querySelector('script[src="'+url+'"]')) return res();
      const s = document.createElement('script'); s.src = url;
      s.onload = ()=>res(); s.onerror = (e)=>rej(e);
      document.head.appendChild(s);
    });
  }

  // --- HTML Tool and Mini Games shells (empty frames as requested) ---
  function openHtmlToolShell(){
    alert('HTML Tool を起動します。現在はシェル（簡易）です。\n次の実装でアップロード/編集機能を追加します。');
    // could load a full htmltool.js from BASE_URL in future:
    // let url = BASE_URL + '/htmltool.js'; loadScript(url).then(()=>{/*...*/}).catch(e=>alert('failed to load module'));
  }
  function openMiniGamesShell(){
    alert('Mini Games の枠を開きます。現在は空の枠です。');
    // open an about page or blank tab
    const txt = '<!doctype html><html><meta charset="utf-8"><title>Mini Games (empty)</title><body style="font-family:system-ui;padding:20px">Mini Games: 未実装（枠のみ）</body></html>';
    const blob = new Blob([txt], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank');
  }

  // --- main loop using prompt/confirm/alert only ---
  async function mainMenu(){
    alert('Assets Tool 起動');
    while(true){
      const v = prompt('機能を選んでください（番号を入力）:\n1 This Page\n2 Other Page\n3 Other Thing\nキャンセルで終了');
      if(v === null) { alert('終了します'); break; }
      const choice = v.trim();
      if(choice === '1'){
        // This Page submenu via prompt/confirm
        const sub = prompt('This Page:\n1 Assets 一覧 (個別DL)\n2 Assets DL [Here] (ZIP)\nキャンセルで戻る');
        if(sub === null) continue;
        if(sub.trim() === '1'){ await handleThisPageList(); }
        else if(sub.trim() === '2'){ await handleThisPageZip(); }
        else { alert('無効な選択'); }
      } else if(choice === '2'){
        await handleOtherPage();
      } else if(choice === '3'){
        const sub = prompt('Other Thing:\n1 HTML Tool\n2 Mini Games\nキャンセルで戻る');
        if(sub === null) continue;
        if(sub.trim() === '1'){ openHtmlToolShell(); }
else if(sub.trim() === '2'){
  const g = prompt('Mini Games:\n1 1game\n2 2game\n3 3game\n4 4game\n5 5game\nキャンセルで戻る');
  if(g === null) continue;
  if(['1','2','3','4','5'].includes(g.trim())) {
    openMiniGame(g.trim());
  } else {
    alert('無効な選択');
  }
}

  }

  // run
  mainMenu();

})();
