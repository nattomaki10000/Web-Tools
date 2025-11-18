/* ============================================================
  full.js - Complete Asset Exporter / HTML Tool / MiniGames
  Place this file as docs/full.js on your GitHub Pages repo.
  This script creates a START button; click it, then choose from menus.
  Note: External resource fetching can be blocked by CORS. Proxies are offered.
============================================================ */

(function AssetExporterFull(){

  const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const PROXY_LIST = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://r.jina.ai/http://'
  ];
  const MAX_FETCH_CONCURRENCY = 6;

  /* ------------------ Utilities ------------------ */
  function $el(tag, attrs, ...children){
    const e = document.createElement(tag);
    if(attrs) for(const k in attrs){
      if(k === 'style') Object.assign(e.style, attrs[k]);
      else if(k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for(const c of children){
      if(c == null) continue;
      if(typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
      else e.appendChild(c);
    }
    return e;
  }

  function basename(url){
    try{ return decodeURIComponent((new URL(url, location.href)).pathname.split('/').filter(Boolean).pop() || url.split('/').pop()); }
    catch(e){ return url.split('/').pop() || url; }
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function ensureJSZip(){
    if(window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSZIP_CDN;
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }

  function downloadBlob(blob, filename){
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 15000);
  }

  function downloadURL(url, filename){
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function fetchWithTimeout(resource, options = {}, timeout = 20000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(resource, {...options, signal: controller.signal});
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  async function parallelLimit(tasks, limit=MAX_FETCH_CONCURRENCY){
    const results = [];
    const executing = [];
    for(const t of tasks){
      const p = Promise.resolve().then(()=>t());
      results.push(p);
      executing.push(p);
      p.then(()=> executing.splice(executing.indexOf(p),1));
      if(executing.length >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
  }

  /* ------------------ UI: START BUTTON ------------------ */
  const START_BTN_ID = 'asset-exporter-start-btn';
  function injectStartButton(){
    const old = document.getElementById(START_BTN_ID);
    if(old) old.remove();

    const btn = $el('button', { id: START_BTN_ID }, 'START MENU');
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: 2147483647,
      top: '18px',
      right: '18px',
      padding: '10px 14px',
      fontSize: '15px',
      borderRadius: '8px',
      border: '2px solid #222',
      background: 'white',
      color: '#111',
      boxShadow: '0 6px 18px rgba(0,0,0,0.15)'
    });
    btn.onclick = () => {
      btn.remove();
      openMainMenu();
    };
    document.body.appendChild(btn);
  }

  /* ------------------ Main Menu (prompt-based) ------------------ */
  function menuPrompt(title, options){
    let msg = title + '\n';
    for(let i=0;i<options.length;i++) msg += (i+1) + '. ' + options[i] + '\n';
    const s = prompt(msg, '');
    if(!s) return null;
    const n = parseInt(s);
    if(isNaN(n) || n < 1 || n > options.length) return null;
    return n;
  }

  /* ------------------ Overlay / Panel UI for lists ------------------ */
  const PANEL_ID = 'asset-exporter-panel';
  function createPanel(){
    const old = document.getElementById(PANEL_ID);
    if(old) old.remove();

    const panel = $el('div', { id: PANEL_ID });
    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: 2147483647,
      left: '6%',
      top: '6%',
      width: '88%',
      maxHeight: '86%',
      overflow: 'auto',
      background: '#fff',
      border: '2px solid #333',
      borderRadius: '10px',
      padding: '12px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      color: '#111'
    });

    const header = $el('div', null,
      $el('strong', null, 'Asset Exporter 窶� Panel'),
      $el('span', { style: { marginLeft: '10px', fontSize: '12px', color: '#666' } }, '(CORS may block external fetch)')
    );
    const closeBtn = $el('button', { style: { float: 'right' }, onclick: ()=>panel.remove() }, 'Close');
    header.appendChild(closeBtn);

    const content = $el('div', { id: PANEL_ID + '-content', style: { marginTop: '8px' } });
    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
    return content;
  }

  /* ------------------ Asset Scanning ------------------ */
  async function scanCurrentPage(){
    const assets = [];
    // page html itself
    assets.push({ type: 'html', name: (document.location.pathname.split('/').pop() || 'index.html'), url: location.href, inline: false, content: null });

    // inline scripts/styles
    document.querySelectorAll('script').forEach((s, i) => {
      if(s.src) assets.push({type:'js', name: basename(s.src), url: s.src, inline: false});
      else assets.push({type:'js-inline', name:`inline-script-${i+1}.js`, content: s.textContent || '', inline: true});
    });

    document.querySelectorAll('link[rel~="stylesheet"]').forEach((l,i)=>{
      if(l.href) assets.push({type:'css', name: basename(l.href), url: l.href, inline: false});
    });
    document.querySelectorAll('style').forEach((st,i)=>{
      assets.push({type:'css-inline', name:`inline-style-${i+1}.css`, content: st.textContent || '', inline: true});
    });

    // images
    document.querySelectorAll('img').forEach((img,i)=>{
      const u = img.currentSrc || img.src || img.getAttribute('data-src');
      if(u) assets.push({type:'image', name: basename(u), url: u, inline: false});
    });

    // media
    document.querySelectorAll('video, audio, source').forEach((el,i)=>{
      const u = el.src || el.getAttribute('src') || el.getAttribute('data-src');
      if(u) assets.push({type:'media', name: basename(u), url: u, inline: false});
    });

    // links (useful)
    document.querySelectorAll('a').forEach(a=>{
      const href = a.href;
      if(href && href.startsWith('http')) assets.push({type:'link', name: basename(href), url: href, inline: false});
    });

    // try to extract fonts and css url() from accessible styleSheets
    try{
      for(const ss of document.styleSheets){
        let rules;
        try{ rules = ss.cssRules; } catch(e){ continue; } // cross-origin sheet
        if(!rules) continue;
        for(const r of rules){
          const txt = r.cssText || '';
          if(/url\(/.test(txt)){
            const matches = [...txt.matchAll(/url\((?:'|")?([^'")]+)(?:'|")?\)/g)].map(m=>m[1]);
            for(const m of matches){
              if(!m || m.startsWith('data:')) continue;
              const abs = new URL(m, ss.href || location.href).href;
              // guess type from extension
              assets.push({type:'css-resource', name: basename(abs), url: abs, inline: false});
            }
          }
          // font-face
          if(r.type === 5){ // CSSFontFaceRule
            const mm = [...r.cssText.matchAll(/url\((?:'|")?([^'")]+)(?:'|")?\)/g)].map(m=>m[1]);
            for(const u of mm){
              if(!u || u.startsWith('data:')) continue;
              const abs = new URL(u, ss.href || location.href).href;
              assets.push({type:'font', name: basename(abs), url: abs, inline: false});
            }
          }
        }
      }
    }catch(e){
      // ignore cross-origin errors
    }

    // dedupe by url
    const seen = new Set();
    const out = [];
    for(const a of assets){
      if(a.url){
        if(seen.has(a.url)) continue;
        seen.add(a.url);
      }
      out.push(a);
    }
    return out;
  }

  /* ------------------ Render Assets List (panel) ------------------ */
  function renderAssetsListPanel(assets, title){
    const container = createPanel();
    container.innerHTML = '';
    container.appendChild($el('div', null, $el('strong', null, title || 'Assets List')));
    const listWrap = $el('div', { style: { marginTop: '8px', maxHeight: '60vh', overflow: 'auto' } });

    assets.forEach((a, idx) => {
      const row = $el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px', borderBottom: '1px dashed #eee' } });
      const info = $el('div', { style: { flex: '1 1 70%' } },
        $el('div', { style: { fontSize: '13px', color: '#111' } }, `${idx+1}. ${a.type} 窶� ${a.name || '(no name)'} ${a.inline ? '(inline)' : ''}`),
        $el('div', { style: { fontSize: '12px', color: '#666', wordBreak: 'break-all' } }, a.url || (a.content ? 'inline content' : ''))
      );
      const controls = $el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });

      // Download button
      const dlBtn = $el('button', { onclick: ()=> {
        if(a.inline){
          const blob = new Blob([a.content || ''], { type: 'text/plain' });
          downloadBlob(blob, a.name || 'inline.txt');
        } else {
          fetchAndDownload(a.url, a.name || basename(a.url));
        }
      } }, 'Download');
      controls.appendChild(dlBtn);

      // Open in new tab (for external resources)
      if(!a.inline && a.url){
        const openBtn = $el('button', { onclick: ()=> window.open(a.url, '_blank') }, 'Open');
        controls.appendChild(openBtn);
      }

      row.appendChild(info);
      row.appendChild(controls);
      listWrap.appendChild(row);
    });

    container.appendChild(listWrap);

    // zip all button
    const zipBtn = $el('button', { style: { marginTop: '10px' }, onclick: ()=> zipAssetsAndDownload(assets) }, 'Download ALL as ZIP');
    container.appendChild(zipBtn);

    // small note
    container.appendChild($el('div', { style: { marginTop: '8px', color: '#a00', fontSize: '12px' } }, 'Note: external resources may be blocked by CORS; such files will be skipped.'));
  }

  /* ------------------ Fetch Helpers + Proxy try ------------------ */
  async function tryFetchWithProxies(url, timeout=20000){
    // try direct first
    try{
      const resp = await fetchWithTimeout(url, {}, timeout);
      if(resp.ok) return resp;
    }catch(e){
      // continue
    }
    // try proxies in PROXY_LIST
    for(const p of PROXY_LIST){
      const proxyUrl = p + encodeURIComponent(url);
      try{
        const resp = await fetchWithTimeout(proxyUrl, {}, timeout);
        if(resp.ok) return resp;
      }catch(e){
        // continue next proxy
      }
    }
    throw new Error('All fetch attempts failed (direct+proxies)');
  }

  async function fetchAndDownload(url, name){
    try{
      const resp = await fetchWithTimeout(url);
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const blob = await resp.blob();
      downloadBlob(blob, name || basename(url));
    }catch(e){
      // ask user whether to try proxies
      const useProxy = confirm('Direct fetch failed for:\n' + url + '\nTry using public CORS proxies? (May expose the request to third parties)');
      if(!useProxy) { alert('Download canceled.'); return; }
      try{
        const resp = await tryFetchWithProxies(url);
        const blob = await resp.blob();
        downloadBlob(blob, name || basename(url));
      }catch(err){
        alert('Failed even with proxies: ' + (err.message || err));
      }
    }
  }

  /* ------------------ ZIP Creation ------------------ */
  async function zipAssetsAndDownload(assets){
    const JSZip = await ensureJSZip().catch(e=>null);
    if(!JSZip){ alert('Failed to load JSZip from CDN. Check network.'); return; }
    const zip = new JSZip();
    const folder = zip.folder('assets_export');

    // Add inline content
    assets.filter(a=>a.inline).forEach(a => {
      folder.file(a.name || ('inline-' + Date.now()), a.content || '');
    });

    // For external, fetch with concurrency limit
    const tasks = assets.filter(a=>!a.inline && a.url).map(a => async () => {
      try{
        const resp = await fetchWithTimeout(a.url, {}, 20000);
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const blob = await resp.blob();
        // derive file path from url
        try{
          const u = new URL(a.url);
          const path = (u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname) || a.name || basename(a.url);
          folder.file(path, blob);
        }catch(e){
          folder.file(a.name || basename(a.url), blob);
        }
        return { ok: true, url: a.url };
      }catch(e){
        // try proxies
        for(const p of PROXY_LIST){
          try{
            const resp = await fetchWithTimeout(p + encodeURIComponent(a.url), {}, 20000);
            if(resp.ok){
              const blob = await resp.blob();
              folder.file(a.name || basename(a.url), blob);
              return { ok: true, url: a.url, via: p };
            }
          }catch(_) {}
        }
        return { ok: false, url: a.url, error: String(e) };
      }
    });

    const results = await parallelLimit(tasks, MAX_FETCH_CONCURRENCY);
    const failed = results.filter(r=>!r.ok);

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, (document.title||'page') + '-assets.zip');

    if(failed.length){
      alert('Some assets failed to download (CORS/404). See console for details.');
      console.warn('Asset fetch failures:', failed);
    }
  }

  /* ------------------ Other Page: parse HTML and list assets ------------------ */
  async function fetchPageAndExtractAssets(url, tryUseProxyIfFail=true){
    let html = null;
    try{
      const resp = await fetchWithTimeout(url, {}, 20000);
      if(!resp.ok) throw new Error('HTTP ' + resp.status);
      html = await resp.text();
    }catch(e){
      if(!tryUseProxyIfFail) throw e;
      const useProxy = confirm('Direct fetch failed for URL. Try public CORS proxies? (May expose request to third parties)');
      if(!useProxy) throw e;
      // try proxies
      for(const p of PROXY_LIST){
        try{
          const resp = await fetchWithTimeout(p + encodeURIComponent(url), {}, 20000);
          if(resp.ok){ html = await resp.text(); break; }
        }catch(_) {}
      }
      if(!html) throw new Error('Failed to fetch via proxies too.');
    }

    // parse html
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const assets = [];
    assets.push({ type: 'html', name: 'index.html', url: url, inline: true, content: html });

    doc.querySelectorAll('script').forEach((s,i) => {
      if(s.src) assets.push({ type: 'js', name: basename(s.src), url: new URL(s.src, url).href, inline: false });
      else assets.push({ type: 'js-inline', name: `inline-script-${i+1}.js`, content: s.textContent || '', inline: true });
    });
    doc.querySelectorAll('link[rel~="stylesheet"]').forEach((l,i)=>{
      if(l.href) assets.push({ type: 'css', name: basename(l.href), url: new URL(l.href, url).href, inline: false });
    });
    doc.querySelectorAll('img').forEach((img,i)=>{
      const u = img.getAttribute('src') || img.getAttribute('data-src') || img.src;
      if(u) assets.push({ type: 'image', name: basename(u), url: new URL(u, url).href, inline: false });
    });
    doc.querySelectorAll('video, audio, source').forEach((el,i)=>{
      const u = el.getAttribute('src') || el.src;
      if(u) assets.push({ type: 'media', name: basename(u), url: new URL(u, url).href, inline: false });
    });

    // try to extract css url() from inline styles and linked css (best-effort)
    doc.querySelectorAll('style').forEach(st => {
      const txt = st.textContent || '';
      const matches = [...txt.matchAll(/url\((?:'|")?([^'")]+)(?:'|")?\)/g)].map(m=>m[1]);
      for(const m of matches){
        if(!m || m.startsWith('data:')) continue;
        assets.push({ type: 'css-resource', name: basename(m), url: new URL(m, url).href, inline: false });
      }
    });

    // dedupe
    const seen = new Set();
    const out = [];
    for(const a of assets){
      if(a.url){
        if(seen.has(a.url)) continue;
        seen.add(a.url);
      }
      out.push(a);
    }
    return out;
  }

  /* Web See: fetch assets (best-effort) and open new tab with replaced blob: urls */
  async function webSee(url){
    try{
      const assets = await fetchPageAndExtractAssets(url);
      // fetch resources into blob urls
      const blobMap = {};
      const tasks = assets.filter(a=>!a.inline && a.url).map(a => async () => {
        try{
          const resp = await fetchWithTimeout(a.url, {}, 20000);
          if(!resp.ok) throw new Error('HTTP '+resp.status);
          const blob = await resp.blob();
          blobMap[a.url] = URL.createObjectURL(blob);
          return { ok: true };
        }catch(e){
          // try proxies
          for(const p of PROXY_LIST){
            try{
              const resp = await fetchWithTimeout(p + encodeURIComponent(a.url), {}, 20000);
              if(resp.ok){
                const blob = await resp.blob();
                blobMap[a.url] = URL.createObjectURL(blob);
                return { ok: true, via: p };
              }
            }catch(_) {}
          }
          return { ok: false, url: a.url, error: String(e) };
        }
      });

      await parallelLimit(tasks, MAX_FETCH_CONCURRENCY);

      // open new tab and write modified HTML
      const htmlAsset = assets.find(a=>a.type==='html');
      if(!htmlAsset) { alert('No HTML found.'); return; }
      let html = htmlAsset.content || '';
      // replace URLs in the HTML with blob urls where available
      for(const orig in blobMap){
        const b = blobMap[orig];
        html = html.split(orig).join(b);
      }
      // open new tab
      const win = window.open();
      if(!win) { alert('Popup blocked. Allow popups and try again.'); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
    }catch(e){
      alert('Web See failed: ' + (e.message || e));
    }
  }

  /* ------------------ HTML Tool ------------------ */
  function openHTMLToolPanel(){
    const content = createPanel();
    content.innerHTML = '';

    const title = $el('div', null, $el('strong', null, 'HTML Tool'));
    content.appendChild(title);

    // file input
    const fileInput = $el('input', { type: 'file', multiple: true, accept: '.html,.htm,.css,.js,text/html,text/css,application/javascript' });
    const chooseBtn = $el('button', { onclick: ()=> fileInput.click() }, 'Choose files');
    content.appendChild($el('div', null, chooseBtn));

    const editorWrap = $el('div', { style: { marginTop: '8px' } });
    content.appendChild(editorWrap);

    const fileList = []; // {name, textarea}

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      editorWrap.innerHTML = '';
      for(const f of files){
        const txt = await f.text();
        const ta = $el('textarea', { style: { width: '100%', height: '160px', fontFamily: 'monospace', fontSize: '13px' } }, txt);
        const lbl = $el('div', null, $el('strong', null, f.name));
        const downBtn = $el('button', { onclick: ()=> downloadBlob(new Blob([ta.value], { type: 'text/plain' }), f.name) }, 'Download file');
        editorWrap.appendChild(lbl);
        editorWrap.appendChild(ta);
        editorWrap.appendChild(downBtn);
        editorWrap.appendChild($el('hr'));
        fileList.push({ name: f.name, ta });
      }

      // add control buttons
      const zipBtn = $el('button', { onclick: async ()=>{
        const JSZip = await ensureJSZip().catch(()=>null);
        if(!JSZip){ alert('Failed to load JSZip'); return; }
        const zip = new JSZip();
        for(const fl of fileList) zip.file(fl.name, fl.ta.value);
        const b = await zip.generateAsync({ type: 'blob' });
        downloadBlob(b, 'htmltool-files.zip');
      } }, 'Download all as ZIP');

      const mergeBtn = $el('button', { onclick: ()=>{
        // simple merge: inline CSS, then HTML bodies, then JS
        let merged = '<!doctype html><html><head><meta charset="utf-8">';
        for(const fl of fileList) if(fl.name.endsWith('.css')) merged += '<style>' + fl.ta.value + '</style>';
        merged += '</head><body>';
        for(const fl of fileList) if(fl.name.endsWith('.html')||fl.name.endsWith('.htm')) merged += fl.ta.value;
        for(const fl of fileList) if(fl.name.endsWith('.js')) merged += '<script>' + fl.ta.value + '</script>';
        merged += '</body></html>';
        downloadBlob(new Blob([merged], { type: 'text/html' }), 'merged.html');
      } }, 'Merge to single HTML');

      const runBtn = $el('button', { onclick: ()=>{
        let merged = '<!doctype html><html><head><meta charset="utf-8">';
        for(const fl of fileList) if(fl.name.endsWith('.css')) merged += '<style>' + fl.ta.value + '</style>';
        merged += '</head><body>';
        for(const fl of fileList) if(fl.name.endsWith('.html')||fl.name.endsWith('.htm')) merged += fl.ta.value;
        for(const fl of fileList) if(fl.name.endsWith('.js')) merged += '<script>' + fl.ta.value + '</script>';
        merged += '</body></html>';
        const newW = window.open();
        if(!newW){ alert('Popup blocked.'); return; }
        newW.document.open(); newW.document.write(merged); newW.document.close();
      } }, 'Preview (open new tab)');

      editorWrap.appendChild($el('div', { style: { marginTop: '8px' } }, zipBtn, mergeBtn, runBtn));
    });

  }

  /* ------------------ Mini Games Panel ------------------ */
  function openMiniGamesPanel(){
    const content = createPanel();
    content.innerHTML = '';
    content.appendChild($el('div', null, $el('strong', null, 'Mini Games Placeholder')));

    // For each slot, let user paste HTML and run it
    for(let i=1;i<=5;i++){
      const slotWrap = $el('div', { style: { marginTop: '10px', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' } });
      slotWrap.appendChild($el('div', null, $el('strong', null, 'Game ' + i)));
      const ta = $el('textarea', { style: { width: '100%', height: '120px', fontFamily: 'monospace' } }, 'html-is-here!-here!-here!');
      const runBtn = $el('button', { onclick: ()=>{
        const html = ta.value;
        const w = window.open();
        if(!w){ alert('Popup blocked'); return; }
        w.document.open(); w.document.write(html); w.document.close();
      } }, 'Run this game (new tab)');
      const saveBtn = $el('button', { onclick: ()=> downloadBlob(new Blob([ta.value], {type:'text/html'}), 'mini-game-' + i + '.html') }, 'Download game HTML');
      slotWrap.appendChild(ta);
      slotWrap.appendChild($el('div', { style: { marginTop: '6px' } }, runBtn, saveBtn));
      content.appendChild(slotWrap);
    }
  }

  /* ------------------ Game overlay (embed HTML on current page) ------------------ */
  const DEFAULT_GAMES = {
    1: '<!doctype html><html><head><meta charset="utf-8"><title>Game1</title></head><body><h1>Game 1</h1><p>html-is-here!-here!-here!</p></body></html>',
    2: '<!doctype html><html><head><meta charset="utf-8"><title>Game2</title></head><body><h1>Game 2</h1><p>html-is-here!-here!-here!</p></body></html>',
    3: '<!doctype html><html><head><meta charset="utf-8"><title>Game3</title></head><body><h1>Game 3</h1><p>html-is-here!-here!-here!</p></body></html>',
    4: '<!doctype html><html><head><meta charset="utf-8"><title>Game4</title></head><body><h1>Game 4</h1><p>html-is-here!-here!-here!</p></body></html>',
    5: '<!doctype html><html><head><meta charset="utf-8"><title>Game5</title></head><body><h1>Game 5</h1><p>html-is-here!-here!-here!</p></body></html>'
  };

  function showGameOverlayFromHTML(html){
    const existing = document.getElementById('ae_game_overlay_full');
    if(existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'ae_game_overlay_full';
    Object.assign(ov.style, {
      position:'fixed', left:0, top:0, width:'100%', height:'100%', zIndex:2147483647,
      background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center'
    });

    const wrap = document.createElement('div');
    Object.assign(wrap.style, { width:'100%', height:'100%', maxWidth:'100%', maxHeight:'100%', position:'relative' });

    const clos = document.createElement('button');
    clos.textContent = 'CLOSE';
    Object.assign(clos.style, { position:'absolute', top:'10px', right:'10px', zIndex:2147483650, padding:'8px 12px' });
    clos.onclick = ()=> ov.remove();

    // iframe with srcdoc to sandbox the game's scripts
    const ifr = document.createElement('iframe');
    ifr.style.width = '100%';
    ifr.style.height = '100%';
    ifr.style.border = '0';
    try { ifr.srcdoc = html; } catch(e) { ifr.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }
    ifr.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-modals');

    wrap.appendChild(ifr);
    wrap.appendChild(clos);
    ov.appendChild(wrap);
    document.documentElement.appendChild(ov);
    setTimeout(()=>{ try{ ifr.contentWindow && ifr.contentWindow.focus && ifr.contentWindow.focus(); }catch(_){} }, 200);
  }

  function overlayGame(num){
    const n = parseInt(num,10);
    const html = DEFAULT_GAMES[n] || DEFAULT_GAMES[1];
    showGameOverlayFromHTML(html);
  }

  /* ------------------ Main Menu Flow ------------------ */
  async function openMainMenu(){
    const m1 = menuPrompt('Select Mode', ['This Page', 'Other Page', 'Other Thing']);
    if(!m1) return;

    // 1) This Page
    if(m1 === 1){
      const m2 = menuPrompt('This Page Menu', ['Assets List', 'Assets DL [here]']);
      if(!m2) return;

      // Assets List
      if(m2 === 1){
        const assets = await scanCurrentPage();
        renderAssetsListPanel(assets, 'This Page 窶� Assets List');
        return;
      }

      // Assets DL [here] => zip all
      if(m2 === 2){
        const assets = await scanCurrentPage();
        const proceed = confirm('About to attempt to download ' + assets.length + ' assets as ZIP. This may fail for external files due to CORS. Proceed?');
        if(!proceed) return;
        await zipAssetsAndDownload(assets);
        return;
      }
    }

    // 2) Other Page
    if(m1 === 2){
      const m2 = menuPrompt('Other Page Menu', ['Assets DL [URL]', 'Web See']);
      if(!m2) return;

      if(m2 === 1){
        const url = prompt('Enter URL to fetch and zip (include https://):', '');
        if(!url) return;
        try{
          const assets = await fetchPageAndExtractAssets(url);
          renderAssetsListPanel(assets, 'Other Page 窶� Assets List for ' + url);
        }catch(e){
          alert('Failed to fetch/parse URL: ' + (e.message || e));
        }
        return;
      }

      if(m2 === 2){
        const url = prompt('Enter URL to Web See (fetch and open offline-ish view):', '');
        if(!url) return;
        try{
          await webSee(url);
        }catch(e){
          alert('Web See failed: ' + (e.message || e));
        }
        return;
      }
    }

    // 3) Other Thing
    if(m1 === 3){
      const m2 = menuPrompt('Other Thing Menu', ['HTML Tool', 'Mini Games']);
      if(!m2) return;

      if(m2 === 1){
        openHTMLToolPanel();
        return;
      }
      if(m2 === 2){
        const g = menuPrompt('Mini Games: choose', ['1game','2game','3game','4game','5game']);
        if(!g) return;
        overlayGame(g);
        return;
      }
    }
  }

  // Initialize by injecting START button
  injectStartButton();

  // Expose for debugging (optional)
  window.__AssetExporterFull = {
    injectStartButton,
    openMainMenu
  };

})(); // end wrapper
