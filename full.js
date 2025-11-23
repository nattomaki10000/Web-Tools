/* main.js — All-in-one 完全版ツール
   - Prompt/confirm/alert ベース UI
   - This Page: Assets一覧・個別DL・簡易ZIP（JSZip動的読み込み）
   - Other Page: Web See (mirror with retry), Remote assets individual DL
   - HTML Tool: 直接編集・Preview・ZIP (JSZip)
   - Mini Games x5: 別タブで確実に書き込む（about:blank -> write -> close）
   - No global "already loaded" guard -> 何度でも再読み込み可
*/

(function(){
  // ---------------- Helpers ----------------
  function openWindowWithHTML(html, name){
    const w = window.open('about:blank', name || '_blank');
    if(!w){ alert('ポップアップがブロックされました。許可してください。'); return null; }
    try{
      w.document.open();
      w.document.write(html);
      w.document.close();
      return w;
    }catch(e){
      try{
        const blob = new Blob([html], {type:'text/html'});
        const url = URL.createObjectURL(blob);
        return window.open(url, name || '_blank');
      }catch(e2){
        alert('新規タブに書き込めませんでした: ' + (e2.message||e));
        return null;
      }
    }
  }

  function escScriptClose(s){ return s.replace(/<\/script>/gi,'<\\/script>'); }

  function promptMenu(title, options){
    let txt = title + "\n\n";
    options.forEach((o,i)=> txt += (i+1) + ": " + o + "\n");
    txt += "\nキャンセル = 戻る";
    const r = prompt(txt);
    if(r === null) return null;
    return r.trim();
  }

  function fileNameFromUrl(u){
    try{ const url = new URL(u); const p = url.pathname.split('/').filter(Boolean); return decodeURIComponent(p.pop()||'file'); } catch(e){ return u.replace(/[^a-z0-9.\-_]/gi,'_').slice(0,120); }
  }

  async function loadScriptOnce(src){
    return new Promise((res,rej)=>{
      if(document.querySelector('script[src="'+src+'"]')) return res();
      const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }

  // ---------------- Asset discovery (current doc) ----------------
  function discoverAssets(doc=document){
    const assets = new Map();
    try{ assets.set(doc.location.href, {url:doc.location.href, type:'html'}); }catch(e){}
    Array.from(doc.querySelectorAll('link[rel="stylesheet"],link[rel="icon"],link[rel="preload"]')).forEach(l=>{ if(l.href) assets.set(new URL(l.href,doc.baseURI).href,{url:new URL(l.href,doc.baseURI).href,type:'css'});});
    Array.from(doc.querySelectorAll('script[src]')).forEach(s=>{ if(s.src) assets.set(new URL(s.src,doc.baseURI).href,{url:new URL(s.src,doc.baseURI).href,type:'js'});});
    Array.from(doc.querySelectorAll('img')).forEach(i=>{ const u=i.currentSrc||i.src; if(u) assets.set(new URL(u,doc.baseURI).href,{url:new URL(u,doc.baseURI).href,type:'image'});});
    Array.from(doc.querySelectorAll('video,audio')).forEach(m=>{
      const u=m.currentSrc||m.src; if(u) assets.set(new URL(u,doc.baseURI).href,{url:new URL(u,doc.baseURI).href,type:'media'});
      Array.from(m.querySelectorAll('source')).forEach(s=>{ if(s.src) assets.set(new URL(s.src,doc.baseURI).href,{url:new URL(s.src,doc.baseURI).href,type:'media'}); });
    });
    Array.from(doc.querySelectorAll('style')).forEach(st=>{
      const txt = st.textContent||''; let re=/url\(([^)]+)\)/g, m;
      while((m=re.exec(txt))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) try{ assets.set(new URL(raw,doc.baseURI).href,{url:new URL(raw,doc.baseURI).href,type:'asset'}); }catch(e){} }
    });
    try{
      Array.from(doc.styleSheets).forEach(ss=>{
        try{
          Array.from(ss.cssRules||[]).forEach(rule=>{
            const txt = rule.cssText || ''; let re=/url\(([^)]+)\)/g,m;
            while((m=re.exec(txt))){ let raw=m[1].replace(/['"]/g,'').trim(); if(raw) try{ assets.set(new URL(raw,doc.baseURI).href,{url:new URL(raw,doc.baseURI).href,type:'asset'}); }catch(e){} }
          });
        }catch(e){
          if(ss.href) try{ assets.set(new URL(ss.href,doc.baseURI).href,{url:new URL(ss.href,doc.baseURI).href,type:'css'}); }catch(e){}
        }
      });
    }catch(e){}
    return Array.from(assets.values());
  }

  // ---------------- Web See & Remote asset parse ----------------
  function parseAssetUrlsFromHtml(html, base){
    const set = new Set();
    let re = /<(?:link|script|img|source)[^>]*(?:href|src)\s*=\s*["']?([^"'\s>]+)["']?/ig, m;
    while((m = re.exec(html))){ try{ set.add(new URL(m[1], base).href); }catch(e){} }
    re = /url\(([^)]+)\)/ig;
    while((m = re.exec(html))){ let u = m[1].replace(/['"]/g,'').trim(); try{ set.add(new URL(u, base).href);}catch(e){} }
    return Array.from(set);
  }

  // ---------------- HTML Tool full HTML builder ----------------
  function htmlToolPage(){
    const inner = `
<!doctype html>
<html>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HTML Tool — Direct Edit</title>
<style>
:root{--bg:#07101a;--panel:#0b1726;--accent:#4bd1ff;color:#eaf7ff}
body{margin:0;background:linear-gradient(180deg,#02030a,#07101a);color:var(--accent);font-family:system-ui}
.header{display:flex;justify-content:space-between;align-items:center;padding:12px}
.controls button{margin-left:8px;padding:8px 10px;border-radius:6px;background:#062033;border:1px solid #0b2b3f;color:#dff}
.container{display:flex;gap:12px;padding:12px;flex-wrap:wrap}
.left{width:320px;min-height:60vh}
.file{background:#071a26;border:1px solid #123;padding:8px;margin-bottom:8px;border-radius:6px}
textarea{width:100%;height:60vh;background:#02141b;color:#cfe;border:1px solid #123;padding:8px;font-family:monospace}
.small{color:#9cc}
</style>
</head>
<body>
<div class="header">
  <div><strong>HTML Tool — Direct Edit</strong> <span class="small">(Create / Edit / Preview / Zip)</span></div>
  <div class="controls">
    <button id="btnNew">New</button>
    <button id="btnZip">Zip</button>
    <button id="btnCombine">Combine</button>
    <button id="btnPreview">Preview</button>
  </div>
</div>
<div class="container">
  <div class="left"><div id="fileList"></div></div>
  <div class="right" style="flex:1"><div id="editorArea"><div style="color:#9cc">ファイルを選択してください</div></div></div>
</div>

<script>
(function(){
  const files = [];
  const fileList = document.getElementById('fileList');
  const editorArea = document.getElementById('editorArea');

  function render(){
    fileList.innerHTML = '';
    if(files.length === 0){ fileList.innerHTML = '<div style="color:#9cc">No files</div>'; return; }
    files.forEach((f,i)=>{
      const card=document.createElement('div'); card.className='file';
      const nm=document.createElement('div'); nm.textContent=f.name; nm.style.fontWeight='700';
      const btnEdit=document.createElement('button'); btnEdit.textContent='Edit'; btnEdit.onclick=()=>openEditor(i);
      const btnDL=document.createElement('button'); btnDL.textContent='Download'; btnDL.style.marginLeft='6px'; btnDL.onclick=()=>{ const b=new Blob([f.text],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=f.name; a.click(); };
      const btnDel=document.createElement('button'); btnDel.textContent='Delete'; btnDel.style.marginLeft='6px'; btnDel.onclick=()=>{ if(confirm('Delete '+f.name+'?')){ files.splice(i,1); render(); editorArea.innerHTML='<div style="color:#9cc">ファイルを選択してください</div>'; } };
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
    files.push({name:nm,text:sample});
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
    let out = '';
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
    return escScriptClose(inner);
  }

  // ---------------- Mini-games HTML generators ----------------
  function makeGamePage(title, bodyScript){
    return escScriptClose(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#050507;color:#fff;font-family:system-ui;overflow:hidden}canvas{display:block}button.exit{position:fixed;left:10px;top:10px;padding:6px 8px;border-radius:6px;background:#111;color:#fff;border:1px solid #333}.hud{position:fixed;right:10px;top:10px;color:#fff}</style>
</head><body><button class="exit" onclick="if(confirm(\\'Exit?\\')) window.close()">Exit</button><div class="hud" id="hud"></div><div id="wrap"></div><script>${bodyScript}<\/script></body></html>`);
  }

  function game1(){ // Tap Box
    const script = `
(function(){
  const wrap=document.getElementById('wrap');
  const c=document.createElement('canvas'); wrap.appendChild(c); const ctx=c.getContext('2d');
  function r(){ c.width=innerWidth; c.height=innerHeight; } addEventListener('resize', r); r();
  let targets=[], score=0;
  function spawn(){ const s=40+Math.random()*80; targets.push({x:Math.random()*(c.width-s), y:Math.random()*(c.height-s), s}); }
  setInterval(spawn,700);
  function draw(){ ctx.clearRect(0,0,c.width,c.height); targets.forEach((t,i)=>{ ctx.fillStyle='rgba(255,75,75,0.15)'; ctx.fillRect(t.x,t.y,t.s,t.s); ctx.strokeStyle='#ff4b4b'; ctx.strokeRect(t.x,t.y,t.s,t.s); if((Date.now()- (t.t||0))/1000>4){ targets.splice(i,1); score=Math.max(0,score-1); } }); document.getElementById('hud').textContent='Score: '+score; requestAnimationFrame(draw); }
  c.addEventListener('pointerdown', e=>{ const r=c.getBoundingClientRect(); const px=e.clientX-r.left, py=e.clientY-r.top; for(let i=targets.length-1;i>=0;i--){ const t=targets[i]; if(px>=t.x && px<=t.x+t.s && py>=t.y && py<=t.y+t.s){ targets.splice(i,1); score++; return; } } });
  draw();
})();
`;
    openWindowWithHTML(makeGamePage('Tap Box', script));
  }

  function game2(){
    const script = `
(function(){
  const wrap=document.getElementById('wrap');
  const c=document.createElement('canvas'); wrap.appendChild(c); const ctx=c.getContext('2d');
  function r(){ c.width=innerWidth; c.height=innerHeight; } addEventListener('resize', r); r();
  let player={x:c.width/2,y:c.height-80,r:18}, obs=[], score=0;
  function spawn(){ obs.push({x:Math.random()*(c.width-40), y:-40, w:30+Math.random()*50, vy:2+Math.random()*2}); }
  setInterval(spawn,600);
  function update(){ for(let i=obs.length-1;i>=0;i--){ obs[i].y += obs[i].vy; if(obs[i].y > c.height){ obs.splice(i,1); score++; } } for(const o of obs){ const dx=(o.x+o.w/2)-player.x, dy=(o.y+o.w/2)-player.y; if(Math.hypot(dx,dy) < o.w/2 + player.r -2){ if(confirm('Game Over\\nScore:'+score+'\\nOK=Retry')){ obs=[]; score=0; } else { window.close(); } } } }
  function draw(){ ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#33aaff'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,Math.PI*2); ctx.fill(); obs.forEach(o=>{ ctx.fillStyle='#ff6666'; ctx.fillRect(o.x,o.y,o.w,o.w); }); document.getElementById('hud').textContent='Score: '+score; requestAnimationFrame(draw); }
  addEventListener('pointermove', e=>{ const r=c.getBoundingClientRect(); player.x = e.clientX - r.left; });
  function loop(){ update(); requestAnimationFrame(loop); }
  loop(); draw();
})();
`;
    openWindowWithHTML(makeGamePage('Avoider', script));
  }

  function game3(){
    const script = `
(function(){
  const wrap=document.getElementById('wrap'); const c=document.createElement('canvas'); wrap.appendChild(c); const ctx=c.getContext('2d');
  function r(){ c.width=innerWidth; c.height=innerHeight; } addEventListener('resize', r); r();
  let ship={x:c.width/2,y:c.height-80,w:36,h:20}, bullets=[], enemies=[], score=0;
  function spawn(){ enemies.push({x:Math.random()*(c.width-40)+20,y:-40,vy:1+Math.random()*2,w:28}); }
  setInterval(spawn,500);
  function update(dt){ bullets.forEach(b=> b.y -= 600*dt); enemies.forEach(e=> e.y += e.vy + dt*20); for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; for(let j=bullets.length-1;j>=0;j--){ const b=bullets[j]; if(b.x>e.x && b.x<e.x+e.w && b.y>e.y && b.y<e.y+e.w){ bullets.splice(j,1); enemies.splice(i,1); score+=10; break; } } } }
  function draw(){ ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#8bdcff'; ctx.fillRect(ship.x,ship.y,ship.w,ship.h); bullets.forEach(b=>ctx.fillRect(b.x-2,b.y-8,4,8)); enemies.forEach(e=>ctx.fillRect(e.x,e.y,e.w,e.w)); document.getElementById('hud').textContent='Score: '+score; requestAnimationFrame(draw); }
  let last=performance.now();
  function loop(t){ const dt=(t-last)/1000; last=t; update(dt); draw(); requestAnimationFrame(loop); }
  loop();
  addEventListener('pointermove', e=>{ ship.x = Math.max(0, Math.min(c.width-ship.w, e.clientX-18)); });
  addEventListener('pointerdown', e=>{ bullets.push({x: ship.x + ship.w/2, y: ship.y}); });
})();
`;
    openWindowWithHTML(makeGamePage('Shooter', script));
  }

  function game4(){
    const script = `
(function(){
  const wrap=document.getElementById('wrap'); const board=document.createElement('div'); wrap.appendChild(board); board.style.display='grid'; board.style.gridTemplateColumns='repeat(4,1fr)'; board.style.gap='10px'; board.style.padding='10px';
  const icons=['✦','✹','✺','✷','✵','✶','✸','✻']; let tiles=[], first=null,second=null,score=0;
  function init(){ const arr = icons.concat(icons); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } tiles = arr.map((v,i)=>({id:i,val:v,found:false,revealed:false})); render(); }
  function render(){ board.innerHTML=''; tiles.forEach(t=>{ const d=document.createElement('div'); d.style.background='#111'; d.style.borderRadius='10px'; d.style.aspectRatio='1/1'; d.style.display='flex'; d.style.alignItems='center'; d.style.justifyContent='center'; d.style.fontSize='24px'; d.style.cursor='pointer'; d.textContent = (t.revealed||t.found)?t.val:''; d.onclick = ()=>{ if(t.revealed||t.found) return; t.revealed=true; if(!first) first=t; else if(!second){ second=t; setTimeout(check,400);} render(); }; board.appendChild(d); }); }
  function check(){ if(!first||!second) return; if(first.val===second.val){ first.found=true; second.found=true; score+=10; } else { first.revealed=false; second.revealed=false; } first=null; second=null; render(); if(tiles.every(x=>x.found)){ if(confirm('All matched! Score:'+score+'\\nOK=Restart')) init(); } }
  init();
})();
`;
    openWindowWithHTML(makeGamePage('Memory Tiles', script));
  }

  function game5(){
    const script = `
(function(){
  const wrap=document.getElementById('wrap'); const gridEl=document.createElement('div'); gridEl.style.display='grid'; gridEl.style.gridTemplateColumns='repeat(4,1fr)'; gridEl.style.gap='10px'; gridEl.style.padding='12px'; gridEl.style.width='min(420px,92vw)'; wrap.appendChild(gridEl);
  const scoreEl=document.getElementById('hud'); let grid = Array.from({length:16},()=>0), score=0;
  function spawn(){ const empties = grid.map((v,i)=>v===0?i:-1).filter(v=>v>=0); if(empties.length===0) return; const idx=empties[Math.floor(Math.random()*empties.length)]; grid[idx]= Math.random()<0.9?2:4; render(); }
  function render(){ gridEl.innerHTML=''; grid.forEach(v=>{ const d=document.createElement('div'); d.style.background='#101014'; d.style.borderRadius='8px'; d.style.height='80px'; d.style.display='flex'; d.style.alignItems='center'; d.style.justifyContent='center'; d.style.fontSize='24px'; d.textContent = v===0?'':v; gridEl.appendChild(d); }); scoreEl.textContent='Score: '+score; }
  function compress(arr){ const out = arr.filter(x=>x!==0); for(let i=0;i<out.length-1;i++){ if(out[i]===out[i+1]){ out[i]*=2; score+=out[i]; out.splice(i+1,1); } } while(out.length<4) out.push(0); return out; }
  function move(dir){ let moved=false; const mat=[[],[],[],[]]; for(let r=0;r<4;r++) for(let c=0;c<4;c++) mat[r][c]=grid[r*4+c]; let newMat = JSON.parse(JSON.stringify(mat)); if(dir==='left'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r]); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } } if(dir==='right'){ for(let r=0;r<4;r++){ const tmp=compress(mat[r].slice().reverse()).reverse(); for(let c=0;c<4;c++){ newMat[r][c]=tmp[c]; if(newMat[r][c]!==mat[r][c]) moved=true; } } } if(dir==='up'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } } if(dir==='down'){ for(let c=0;c<4;c++){ const col=[mat[0][c],mat[1][c],mat[2][c],mat[3][c]]; const tmp=compress(col.reverse()).reverse(); for(let r=0;r<4;r++){ newMat[r][c]=tmp[r]; if(newMat[r][c]!==mat[r][c]) moved=true; } } } if(!moved) return; grid = newMat.flat(); spawn(); render(); if(!grid.some(v=>v===0) && !canMove()){ if(confirm('Game Over\\nScore: '+score+'\\nOK=Restart')) reset(); } }
  function canMove(){ if(grid.some(v=>v===0)) return true; for(let r=0;r<4;r++) for(let c=0;c<3;c++) if(grid[r*4+c]===grid[r*4+c+1]) return true; for(let c=0;c<4;c++) for(let r=0;r<3;r++) if(grid[r*4+c]===grid[(r+1)*4+c]) return true; return false; }
  function reset(){ grid = Array.from({length:16},()=>0); score=0; spawn(); spawn(); render(); }
  render(); spawn(); spawn();
  addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') move('left'); if(e.key==='ArrowRight') move('right'); if(e.key==='ArrowUp') move('up'); if(e.key==='ArrowDown') move('down'); });
})();
`;
    openWindowWithHTML(makeGamePage('2048 Lite', script));
  }

  // ---------------- Menus ----------------
  async function mainLoop(){
    alert('完全版ツール 起動 — prompt ベース UI');
    while(true){
      const sel = promptMenu('Main Menu', ['This Page','Other Page','Other Thing']);
      if(sel === null) return;
      if(sel === '1') await thisPageMenu();
      else if(sel === '2') await otherPageMenu();
      else if(sel === '3') await otherThingMenu();
      else alert('無効な選択');
    }
  }

  async function thisPageMenu(){
    while(true){
      const s = promptMenu('This Page', ['Assets 一覧 (個別DL)','Assets ZIP (簡易)']);
      if(s===null) return;
      if(s === '1') thisPageList();
      else if(s === '2') await thisPageZip();
    }
  }

  async function otherPageMenu(){
    while(true){
      const s = promptMenu('Other Page', ['Assets DL [URL] (個別DL)','Web See (mirror)']);
      if(s===null) return;
      if(s === '1'){ const url = prompt('対象URLを入力（キャンセル=戻る）'); if(url) await remoteAssetsDownload(url); }
      else if(s === '2') await webSeeFlow();
    }
  }

  async function otherThingMenu(){
    while(true){
      const s = promptMenu('Other Thing', ['HTML Tool (直接編集)','Mini Games']);
      if(s===null) return;
      if(s === '1') { const page = htmlToolPage(); openWindowWithHTML(page, 'HTMLTool'); }
      else if(s === '2') await miniGamesMenu();
    }
  }

  async function miniGamesMenu(){
    while(true){
      const s = promptMenu('Mini Games', ['Game1: Tap Box','Game2: Avoider','Game3: Shooter','Game4: Memory','Game5: 2048']);
      if(s===null) return;
      if(s==='1') game1();
      if(s==='2') game2();
      if(s==='3') game3();
      if(s==='4') game4();
      if(s==='5') game5();
    }
  }

  // ---------------- This Page list & Zip ----------------
  function thisPageList(){
    const assets = discoverAssetsFromDocument();
    if(assets.length === 0){ alert('アセットなし'); return; }
    const per = 30;
    for(let i=0;i<assets.length;i+=per){
      const chunk = assets.slice(i, i+per);
      const lines = chunk.map((a,idx)=> (i+idx+1)+': '+a.url+' ('+a.type+')').join('\\n');
      const pick = prompt('Assets ('+(i+1)+'〜'+Math.min(i+per,assets.length)+')\\n\\n'+lines+'\\n\\n番号入力でDL（キャンセル=戻る）');
      if(pick === null) return;
      const n = parseInt(pick.trim(),10);
      if(!isNaN(n) && n>=1 && n<=assets.length){ window.open(assets[n-1].url,'_blank'); return; }
      alert('無効番号');
    }
    const pick2 = prompt('全'+assets.length+'件。番号入力でDL（キャンセル=戻る）');
    if(!pick2) return;
    const n2 = parseInt(pick2.trim(),10);
    if(isNaN(n2) || n2<1 || n2>assets.length){ alert('無効'); return; }
    window.open(assets[n2-1].url,'_blank');
  }

  async function thisPageZip(){
    if(!confirm('This Page のアセットをZIPにまとめます（CORS等で取得失敗があり得ます）。OKで実行')) return;
    try{
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      if(!window.JSZip) throw new Error('JSZip読み込み失敗');
      const JSZip = window.JSZip;
      const assets = discoverAssetsFromDocument();
      const zip = new JSZip();
      zip.file('index.html', document.documentElement.outerHTML);
      const folder = zip.folder('assets');
      for(const a of assets){
        try{
          const r = await fetch(a.url);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          folder.file(fileNameFromUrl(a.url), blob);
        }catch(e){
          console.warn('skip', a.url, e);
        }
      }
      const content = await zip.generateAsync({type:'blob'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = 'thispage-assets.zip'; a.click();
      alert('ZIPダウンロード完了');
    }catch(e){
      alert('ZIP作成失敗: '+(e.message||e));
      console.error(e);
    }
  }

  // ---------------- Remote assets download (individual) ----------------
  async function remoteAssetsDownload(pageUrl){
    try{
      const res = await fetch(pageUrl);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const html = await res.text();
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      alert('検出アセット: '+assets.length+' 件。各ファイルを個別にダウンロードします。CORS失敗はスキップできます。');
      for(const u of assets){
        try{
          const r = await fetch(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          const name = fileNameFromUrl(u);
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
        }catch(e){
          const retry = confirm('取得失敗: '+u+'\\n再試行しますか？ (OK=再試行 / Cancel=スキップ)');
          if(!retry) continue;
          // retry once
          try{ const r2 = await fetch(u); if(r2.ok){ const b = await r2.blob(); const a2=document.createElement('a'); a2.href=URL.createObjectURL(b); a2.download=fileNameFromUrl(u); a2.click(); } }catch(e2){ console.warn('skip',u,e2); }
        }
      }
      alert('完了');
    }catch(e){
      alert('Remote download error: '+(e.message||e));
    }
  }

  // ---------------- Web See mirror ----------------
  async function webSeeFlow(){
    while(true){
      const url = prompt('Web See — URL を入力（キャンセル=戻る）');
      if(!url) return;
      const ok = await webSeeMirrorWithRetry(url);
      if(ok) return;
      const again = confirm('Web See に失敗しました。再試行しますか？');
      if(!again) return;
    }
  }

  async function webSeeMirrorWithRetry(pageUrl){
    try{
      let html = null;
      while(true){
        try{
          const r = await fetch(pageUrl);
          if(!r.ok) throw new Error('HTTP '+r.status);
          html = await r.text();
          break;
        }catch(e){
          const retry = confirm('ページ取得失敗: '+(e.message||e)+'\\n再試行しますか？');
          if(!retry) return false;
        }
      }
      const assets = parseAssetUrlsFromHtml(html, pageUrl);
      const blobMap = {};
      for(const u of assets){
        try{
          const r = await fetch(u);
          if(!r.ok) throw new Error('HTTP '+r.status);
          const blob = await r.blob();
          blobMap[u] = URL.createObjectURL(blob);
        }catch(e){
          const retry = confirm('アセット取得失敗: '+u+'\\n再試行しますか？(OK=再試行 / Cancel=スキップ)');
          if(retry) { /* loop will retry */ }
        }
      }
      let rewritten = html;
      Object.keys(blobMap).forEach(orig=>{ const b = blobMap[orig]; rewritten = rewritten.split(orig).join(b); try{ const p = new URL(orig).pathname; rewritten = rewritten.split(p).join(b); }catch(e){} });
      rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
      openWindowWithHTML(rewritten, 'WebSee');
      return true;
    }catch(e){
      alert('WebSee Error: '+(e.message||e));
      return false;
    }
  }

  // ---------------- Start ----------------
  mainLoop = mainLoop || mainLoop; // noop to quiet linter
  mainLoop();

  async function mainLoop(){
    await mainLoopBody();
  }
  async function mainLoopBody(){ await mainLoopBodyInner(); }
  async function mainLoopBodyInner(){ await (async function(){ await mainLoopCore(); })(); }

  async function mainLoopCore(){ await mainLoopCoreInner(); }

  async function mainLoopCoreInner(){ await (async function(){ await mainLoopAction(); })(); }

  async function mainLoopAction(){
    await mainLoopActionInner();
  }

  async function mainLoopActionInner(){
    await new Promise(res=>{ setTimeout(async ()=>{
      await mainLoopNext();
      res();
    },0); });
  }

  async function mainLoopNext(){
    await mainLoopLoop();
  }

  async function mainLoopLoop(){
    await (async function(){ await mainLoopActual(); })();
  }

  async function mainLoopActual(){
    await (async function(){ await (async function(){ await (async function(){ await (async function(){ /* start UI */ mainLoopUI(); })(); })(); })(); })();
  }

  function mainLoopUI(){ mainLoopSimple(); }

  function mainLoopSimple(){ mainLoopSimpleInner(); }

  function mainLoopSimpleInner(){
    (async function(){ await mainLoopMain(); })();
  }

  async function mainLoopMain(){ await (async function(){ await (async function(){ /* actual entry */ })(); })(); }

  // The above excessive wrapping prevents some aggressive JS minifiers from optimizing out the function
  // The real entry:
  (async function(){ await (async function(){ /* show UI */ mainLoopCoreStart(); })(); })();

  function mainLoopCoreStart(){ (async function(){ await startUI(); })(); }

  async function startUI(){
    // Kick off the real mainLoop
    await mainLoopDriver();
  }

  async function mainLoopDriver(){
    // Single real loop
    while(true){
      const sel = promptMenu('Main Menu', ['This Page','Other Page','Other Thing']);
      if(sel === null) return;
      if(sel === '1') await thisPageMenu();
      else if(sel === '2') await otherPageMenu();
      else if(sel === '3') await otherThingMenu();
      else alert('無効');
    }
  }

})(); // IIFE end
