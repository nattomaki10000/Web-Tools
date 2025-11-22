/* full.js
   GitHub Pages 用メインスクリプト
   置き場所例: https://USERNAME.github.io/REPO/full.js
*/

(function(){
  if(window.__ASSETS_TOOL_ACTIVE) {
    alert("Assets Tool is already running.");
    return;
  }
  window.__ASSETS_TOOL_ACTIVE = true;

  const CONFIG = {
    CORS_PROXY: "", // クロスオリジンで失敗する場合は自分のCORSプロキシを入れてください (例: "https://your-cors-proxy.example.com/")
    JSZIP_CDN: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
  };

  // --- small helpers ---
  function $(sel, root=document) { return root.querySelector(sel); }
  function $all(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }
  function loadScript(url) {
    return new Promise((res, rej) => {
      if(document.querySelector('script[src="'+url+'"]')) return res();
      const s = document.createElement('script');
      s.src = url;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function fetchWithProxy(url, opts={}) {
    // try direct fetch first
    return fetch(url, opts).catch(e => {
      if(CONFIG.CORS_PROXY) {
        const prox = CONFIG.CORS_PROXY.replace(/\/$/,'') + '/' + url;
        return fetch(prox, opts);
      }
      throw e;
    });
  }
  function fileNameFromUrl(u) {
    try {
      const p = new URL(u, location.href).pathname;
      const name = p.split('/').filter(Boolean).pop() || 'index';
      return decodeURIComponent(name);
    } catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_'); }
  }
  function extFromUrl(u) {
    const m = (u.split('?')[0].match(/\.(\w+)(?:$|$)/) || [])[1];
    return m ? m.toLowerCase() : '';
  }

  // --- modal (alert-like) ---
  function createModal() {
    if(window.__ASSETS_TOOL_MODAL) return window.__ASSETS_TOOL_MODAL;
    const wrap = document.createElement('div');
    wrap.id = "__assets_tool_modal";
    wrap.style = `
      position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.35);z-index:2147483647;
      -webkit-overflow-scrolling:touch;
    `;
    const box = document.createElement('div');
    box.style = `
      width: min(720px, 94%); max-height: 90vh; overflow:auto;
      background: #fff; color:#111; border-radius:12px; padding:14px;
      box-shadow:0 8px 30px rgba(0,0,0,0.3); font-family:system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP";
    `;
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    window.__ASSETS_TOOL_MODAL = {wrap, box};
    return window.__ASSETS_TOOL_MODAL;
  }
  function closeModal() {
    const m = createModal();
    if(m.wrap && m.wrap.parentNode) m.wrap.parentNode.removeChild(m.wrap);
    window.__ASSETS_TOOL_MODAL = null;
  }

  function showMenu(title, options) {
    // options: [{label, onClick}]
    const m = createModal();
    m.box.innerHTML = '';
    const h = document.createElement('div'); h.style='font-weight:700;margin-bottom:8px;font-size:16px';
    h.textContent = title;
    m.box.appendChild(h);
    options.forEach(opt=>{
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.style=`
        display:block;width:100%;text-align:left;padding:10px;border-radius:8px;margin:6px 0;border:1px solid #ddd;background:#fafafa;font-size:14px;
      `;
      btn.onclick = () => { try{ opt.onClick(); } catch(e){ console.error(e); alert("Error: "+e); } };
      m.box.appendChild(btn);
    });
    const footer = document.createElement('div');
    footer.style='margin-top:8px;text-align:right';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style='padding:8px 12px;border-radius:8px';
    closeBtn.onclick = () => { closeModal(); window.__ASSETS_TOOL_ACTIVE = false; };
    footer.appendChild(closeBtn);
    m.box.appendChild(footer);
  }

  // --- asset discovery on current document ---
  function discoverAssetsFromDoc(doc) {
    const assets = [];
    // HTML document itself
    assets.push({url: doc.location.href, type:'html', source:'document'});
    // link rel=stylesheet
    $all('link[rel="stylesheet"]', doc).forEach(l => {
      if(l.href) assets.push({url:l.href, type:'css', source:'link[rel=stylesheet]'});
    });
    // style tags - may include @import or url(...)
    $all('style', doc).forEach((st, i) => {
      const text = st.textContent || '';
      const urls = Array.from(text.matchAll(/url\(([^)]+)\)/g)).map(m=>m[1].replace(/['"]/g,'').trim());
      urls.forEach(u => assets.push({url: new URL(u, doc.location.href).href, type:'asset', source:'style tag'}));
      const imps = Array.from(text.matchAll(/@import\s+['"]?([^'";]+)['"]?;/g)).map(m=>m[1]);
      imps.forEach(u => assets.push({url: new URL(u, doc.location.href).href, type:'css', source:'@import'}));
    });
    // scripts
    $all('script[src]', doc).forEach(s => { if(s.src) assets.push({url:s.src, type:'js', source:'script'}); });
    // images
    $all('img', doc).forEach(i => { if(i.src) assets.push({url:i.src, type:'image', source:'img'}); });
    // source tags (video/audio)
    $all('video source, audio source, source', doc).forEach(s => { if(s.src) assets.push({url:s.src, type:'media', source:'source'}); });
    // video/audio tags themselves
    $all('video', doc).forEach(v => { if(v.currentSrc) assets.push({url:v.currentSrc, type:'video', source:'video tag'}); if(v.src) assets.push({url:v.src, type:'video', source:'video tag attr'}); });
    $all('audio', doc).forEach(a => { if(a.currentSrc) assets.push({url:a.currentSrc, type:'audio', source:'audio tag'}); if(a.src) assets.push({url:a.src, type:'audio', source:'audio tag attr'}); });
    // fonts from stylesheets (try to parse doc.styleSheets)
    try {
      Array.from(doc.styleSheets).forEach(ss => {
        try {
          if(!ss.cssRules) return;
          Array.from(ss.cssRules).forEach(rule=>{
            const css = rule.cssText || '';
            const urls = Array.from(css.matchAll(/url\(([^)]+)\)/g)).map(m=>m[1].replace(/['"]/g,'').trim());
            urls.forEach(u => assets.push({url: new URL(u, doc.location.href).href, type:'asset', source:'stylesheet rule'}));
          });
        } catch(e){
          // cross-origin stylesheet - cannot read rules
          if(ss.href) assets.push({url:ss.href, type:'css', source:'stylesheet (cross-origin)'});
        }
      });
    } catch(e){}
    // dedupe by url
    const map = {};
    assets.forEach(a => { map[a.url] = map[a.url] || a; });
    return Object.values(map);
  }

  // --- show assets list and allow download single ---
  function showAssetsListForDoc(doc, titlePrefix='Assets 一覧') {
    const assets = discoverAssetsFromDoc(doc);
    const m = createModal();
    m.box.innerHTML = '';
    const h = document.createElement('div'); h.style='font-weight:700;margin-bottom:8px;font-size:16px';
    h.textContent = titlePrefix + ' — ' + (doc.location ? doc.location.href : 'document');
    m.box.appendChild(h);
    if(assets.length === 0) {
      const p = document.createElement('div'); p.textContent = '検出されたアセットはありません。';
      m.box.appendChild(p);
    }
    assets.forEach(a=>{
      const row = document.createElement('div');
      row.style='display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0';
      const name = document.createElement('div'); name.style='flex:1;word-break:break-all';
      name.textContent = '['+ (a.type||'?') +'] ' + (a.url);
      const dl = document.createElement('button'); dl.textContent='DL'; dl.style='white-space:nowrap';
      dl.onclick = async () => {
        try {
          await downloadUrl(a.url);
        } catch(e){ alert('Download failed: '+e); }
      };
      row.appendChild(name); row.appendChild(dl);
      m.box.appendChild(row);
    });
    const closeBtn = document.createElement('button'); closeBtn.textContent='Close'; closeBtn.style='margin-top:8px';
    closeBtn.onclick = () => { closeModal(); window.__ASSETS_TOOL_ACTIVE = false; };
    m.box.appendChild(closeBtn);
  }

  async function downloadUrl(url) {
    try {
      const r = await fetchWithProxy(url);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      const fname = fileNameFromUrl(url);
      const urlObj = URL.createObjectURL(blob);
      a.href = urlObj;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(urlObj), 30000);
    } catch(e){
      console.error("downloadUrl error:", e);
      alert("ダウンロードできませんでした。CORSの制約が原因の可能性があります。\nコンソールを確認してください。\n\n" + (e.message || e));
    }
  }

  // --- zip current doc assets (preserve simple folder structure) ---
  async function zipAssetsFromDoc(doc, filename='assets.zip') {
    await loadScript(CONFIG.JSZIP_CDN);
    const JSZip = window.JSZip;
    if(!JSZip) { alert('JSZip の読み込みに失敗しました'); return; }
    const zip = new JSZip();
    const assets = discoverAssetsFromDoc(doc);
    // include index.html (current doc HTML)
    try {
      const htmlText = doc.documentElement.outerHTML;
      zip.file('index.html', htmlText);
    } catch(e){}
    const folder = zip.folder('assets');
    const promises = assets.map(async a => {
      try {
        const r = await fetchWithProxy(a.url);
        if(!r.ok) { console.warn('skip', a.url, r.status); return; }
        const blob = await r.blob();
        const path = 'assets/' + fileNameFromUrl(a.url);
        // if name collision, add suffix
        let finalPath = path;
        let i = 1;
        while(folder.files[finalPath]) { finalPath = path.replace(/(\.[^.]+)?$/, `_${i}$1`); i++; }
        folder.file(finalPath.replace('assets/',''), blob);
      } catch(e){
        console.warn('failed to fetch', a.url, e);
      }
    });
    await Promise.all(promises);
    const content = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // --- fetch another page and work on it (as text) without navigating ---
  async function fetchPageAsDoc(url) {
    const r = await fetchWithProxy(url, {mode:'cors'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const text = await r.text();
    // create iframe blob document so that relative URLs resolve to the desired base
    const blob = new Blob([text], {type:'text/html'});
    const blobUrl = URL.createObjectURL(blob);
    // create an iframe and set srcdoc/base handling
    return new Promise((res, rej) => {
      const iframe = document.createElement('iframe');
      iframe.style = 'display:none';
      iframe.sandbox = 'allow-same-origin';
      // to preserve same-origin for our script we must load via blob+base tag trick isn't trivial,
      // but we'll create an iframe with srcdoc plus a <base href="..."> so relative links become absolute.
      const docStr = '<base href="'+url+'">' + text;
      try {
        iframe.srcdoc = docStr;
      } catch(e){
        // fallback
        iframe.src = blobUrl;
      }
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          res({iframe, doc:idoc});
        } catch(e){
          // cross-origin; cannot access
          document.body.removeChild(iframe);
          rej(new Error('Cannot access loaded iframe due to cross-origin restrictions'));
        }
      };
      iframe.onerror = (ev) => {
        document.body.removeChild(iframe);
        rej(new Error('iframe load error'));
      };
    });
  }

  // --- "Web See": fetch page and open new tab with its assets injected locally ---
  async function webSeeUrl(url) {
    try {
      const r = await fetchWithProxy(url);
      if(!r.ok) throw new Error('HTTP '+r.status);
      let text = await r.text();
      // rewrite relative asset URLs in HTML to absolute
      const base = new URL(url).origin + new URL(url).pathname.replace(/\/[^\/]*$/,'') + '/';
      // create a blob and open in new tab (simple)
      const finalHtml = text.replace(/<head([^>]*)>/i, `<head$1><base href="${url}">`);
      const blob = new Blob([finalHtml], {type:'text/html'});
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch(e){
      alert('Web See に失敗しました。コンソールを確認してください。\n' + (e.message||e));
      console.error(e);
    }
  }

  // --- HTML Tool (upload/edit/download/zip/one-file) ---
  function openHtmlTool() {
    const m = createModal();
    m.box.innerHTML = '';
    const h = document.createElement('div'); h.style='font-weight:700;margin-bottom:8px;font-size:16px';
    h.textContent = "HTML Tool — ファイルをアップロードして編集/ダウンロード/まとめてZIP";
    m.box.appendChild(h);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.html,.htm,.css,.js,text/*';
    m.box.appendChild(fileInput);

    const filesArea = document.createElement('div'); filesArea.style='margin-top:8px';
    m.box.appendChild(filesArea);

    let stored = []; // {name, text, type}

    fileInput.onchange = async (e) => {
      const list = Array.from(e.target.files);
      filesArea.innerHTML = '';
      stored = [];
      for(const f of list) {
        const text = await f.text();
        stored.push({name:f.name, text, type:f.type || ''});
      }
      renderFileList();
    };

    function renderFileList() {
      filesArea.innerHTML = '';
      stored.forEach((f,i)=>{
        const row = document.createElement('div'); row.style='border:1px solid #eee;padding:8px;border-radius:8px;margin-bottom:6px';
        const title = document.createElement('div'); title.textContent = f.name; title.style='font-weight:600';
        const ta = document.createElement('textarea'); ta.style='width:100%;height:120px;margin-top:6px;font-family:monospace;font-size:13px';
        ta.value = f.text;
        ta.oninput = () => { stored[i].text = ta.value; };
        const btns = document.createElement('div'); btns.style='margin-top:6px;display:flex;gap:6px';
        const dl = document.createElement('button'); dl.textContent = 'Download'; dl.onclick = () => {
          const blob = new Blob([stored[i].text], {type:'text/plain'});
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
        };
        const remove = document.createElement('button'); remove.textContent='Remove'; remove.onclick = ()=>{ stored.splice(i,1); renderFileList(); };
        btns.appendChild(dl); btns.appendChild(remove);
        row.appendChild(title); row.appendChild(ta); row.appendChild(btns);
        filesArea.appendChild(row);
      });
      if(stored.length === 0) {
        filesArea.innerHTML = '<div>ファイルがありません。アップロードしてください。</div>';
      }
    }

    const actions = document.createElement('div'); actions.style='margin-top:10px;display:flex;gap:8px;flex-wrap:wrap';
    const zipBtn = document.createElement('button'); zipBtn.textContent='まとめてZIPでダウンロード';
    zipBtn.onclick = async () => {
      await loadScript(CONFIG.JSZIP_CDN);
      const JSZip = window.JSZip;
      if(!JSZip) { alert('JSZip 読み込み失敗'); return; }
      const zip = new JSZip();
      stored.forEach(f => zip.file(f.name, f.text));
      const blob = await zip.generateAsync({type:'blob'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pack.zip'; a.click();
    };
    const oneHtmlBtn = document.createElement('button'); oneHtmlBtn.textContent='一つのHTMLにまとめてダウンロード';
    oneHtmlBtn.onclick = () => {
      // create single HTML containing CSS/JS embedded
      const htmlFiles = stored.filter(f=>f.name.match(/\.html?$/i));
      const cssFiles = stored.filter(f=>f.name.match(/\.css$/i));
      const jsFiles = stored.filter(f=>f.name.match(/\.js$/i));
      let mainHtml = htmlFiles.length ? htmlFiles[0].text : '<!doctype html><html><head><meta charset="utf-8"><title>Combined</title></head><body><div id="app"></div></body></html>';
      // inject CSS into head
      const cssText = cssFiles.map(c=>`/* ${c.name} */\n${c.text}`).join('\n');
      mainHtml = mainHtml.replace(/<\/head>/i, `<style>\n${cssText}\n</style>\n</head>`);
      // inject JS before body end
      const jsText = jsFiles.map(j=>`// ${j.name}\n${j.text}`).join('\n');
      mainHtml = mainHtml.replace(/<\/body>/i, `<script>\n${jsText}\n</script>\n</body>`);
      const blob = new Blob([mainHtml], {type:'text/html'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'combined.html'; a.click();
    };
    const previewBtn = document.createElement('button'); previewBtn.textContent='閲覧・実行確認 (別タブで)';
    previewBtn.onclick = () => {
      // take first html or combine
      const htmlFiles = stored.filter(f=>f.name.match(/\.html?$/i));
      let out = htmlFiles.length ? htmlFiles[0].text : '<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><div id="app">No HTML provided</div></body></html>';
      // inject css/js similarly as above
      const cssFiles = stored.filter(f=>f.name.match(/\.css$/i));
      const jsFiles = stored.filter(f=>f.name.match(/\.js$/i));
      const cssText = cssFiles.map(c=>`/* ${c.name} */\n${c.text}`).join('\n');
      const jsText = jsFiles.map(j=>`// ${j.name}\n${j.text}`).join('\n');
      out = out.replace(/<\/head>/i, `<style>\n${cssText}\n</style>\n</head>`);
      out = out.replace(/<\/body>/i, `<script>\n${jsText}\n</script>\n</body>`);
      const blob = new Blob([out], {type:'text/html'}); const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    };

    actions.appendChild(zipBtn); actions.appendChild(oneHtmlBtn); actions.appendChild(previewBtn);
    m.box.appendChild(actions);
    renderFileList();
  }

  // --- Mini Games: open small embedded HTMLs in new tabs ---
  const miniGames = [
    {name:'1game', html: `<!doctype html><html><head><meta charset="utf-8"><title>1game</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh}</style></head><body><canvas id="c"></canvas><script>const c=document.getElementById('c');c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');let x=0;function tick(){ctx.fillStyle='black';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='white';ctx.fillRect(x,50,60,60);x=(x+3)%(c.width+100);requestAnimationFrame(tick);}tick();</script></body></html>`},
    {name:'2game', html: `<!doctype html><html><head><meta charset="utf-8"><title>2game</title></head><body><h1 style="text-align:center">2game - Click to spawn</h1><div id="area" style="height:80vh"></div><script>const a=document.getElementById('area');a.onclick=(e)=>{const d=document.createElement('div');d.style='width:30px;height:30px;background:#f66;border-radius:50%;position:absolute;left:'+e.clientX+'px;top:'+e.clientY+'px;transform:translate(-50%,-50%);';a.appendChild(d);setTimeout(()=>d.remove(),1500);};</script></body></html>`},
    {name:'3game', html: `<!doctype html><html><head><meta charset="utf-8"><title>3game</title></head><body><h1 style="text-align:center">3game - simple button</h1><button id="b" style="display:block;margin:20px auto">Press</button><script>let n=0;document.getElementById('b').onclick=()=>{n++;alert('Count: '+n)}</script></body></html>`},
    {name:'4game', html: `<!doctype html><html><head><meta charset="utf-8"><title>4game</title></head><body><canvas id="g" style="width:100%;height:80vh"></canvas><script>const c=document.getElementById('g');c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');let balls=[];onpointerdown=e=>{balls.push({x:e.clientX,y:e.clientY,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,r:10+Math.random()*20})};function f(){ctx.clearRect(0,0,c.width,c.height);balls.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.vy+=0.2; ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.28);ctx.fillStyle='rgba(0,150,200,0.7)';ctx.fill();}); requestAnimationFrame(f);}f();</script></body></html>`},
    {name:'5game', html: `<!doctype html><html><head><meta charset="utf-8"><title>5game</title></head><body style="display:flex;flex-direction:column;align-items:center"><h2>5game - typing test</h2><div id="q">Type: hello world</div><input id="i" autofocus style="font-size:18px;padding:8px;margin-top:10px"><script>const target='hello world';const i=document.getElementById('i');i.oninput=()=>{if(i.value.trim()===target){alert('OK!') ; i.value='';}}</script></body></html>`}
  ];

  function openMiniGame(name) {
    const item = miniGames.find(m=>m.name===name);
    if(!item) return alert('not found');
    const blob = new Blob([item.html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // --- top-level menus ---
  function showTopMenu() {
    showMenu('Choose', [
      {label:'This Page', onClick: ()=> showMenu('This Page', [
        {label:'Assets 一覧', onClick: ()=> showAssetsListForDoc(document, 'Assets 一覧 (This Page)')},
        {label:'Assets DL [here]', onClick: async ()=> { closeModal(); await zipAssetsFromDoc(document, 'thispage-assets.zip'); window.__ASSETS_TOOL_ACTIVE = false; }}
      ])},
      {label:'Other Page', onClick: ()=> showMenu('Other Page', [
        {label:'Assets DL [URL]', onClick: ()=> {
          const u = prompt('ダウンロードするページのURLを入力してください (例: https://example.com/)');
          if(!u) return;
          (async ()=> {
            try {
              const {iframe, doc} = await fetchPageAsDoc(u);
              // zip doc assets
              await zipAssetsFromDoc(doc, 'otherpage-assets.zip');
              // cleanup
              iframe.remove();
              window.__ASSETS_TOOL_ACTIVE = false;
              closeModal();
            } catch(e){ alert('失敗: '+(e.message||e)); console.error(e); }
          })();
        }},
        {label:'Web See', onClick: ()=> {
          const u = prompt('表示するページのURLを入力してください (ページに移動せず別タブで開きます)');
          if(!u) return;
          (async ()=> {
            try {
              await webSeeUrl(u);
              window.__ASSETS_TOOL_ACTIVE = false;
              closeModal();
            } catch(e){ alert('失敗: '+(e.message||e)); console.error(e); }
          })();
        }}
      ])},
      {label:'Other Thing', onClick: ()=> showMenu('Other Thing', [
        {label:'HTML Tool', onClick: ()=> { closeModal(); openHtmlTool(); }},
        {label:'Mini Games', onClick: ()=> showMenu('Mini Games', miniGames.map(m=>({label:m.name, onClick: ()=> { openMiniGame(m.name); }})))}
      ])}
    ]);
  }

  // start
  showTopMenu();

})();
