/* ============================================================
   Page Assets Tool - Structure-Preserved Downloader Version
   呼び出し: PageAssetsTool();
   ============================================================ */

function PageAssetsTool() {

  /* =====================================
      Utility
  ===================================== */
  function fetchText(url) {
    return fetch(url, {mode:"cors"}).then(r=>{
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.text();
    });
  }

  function fetchBlob(url) {
    return fetch(url, {mode:"cors"}).then(r=>{
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.blob();
    });
  }

  function downloadBlob(blob, filename){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }

  /* JSZip ロード */
  function loadJSZip(){
    return new Promise((res,rej)=>{
      if(window.JSZip) return res(window.JSZip);
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload=()=>res(window.JSZip);
      s.onerror=()=>rej("JSZip load failed");
      document.body.appendChild(s);
    });
  }

  /* =====================================
      1) ページからアセット一覧を抽出
  ===================================== */
  function findAssets(doc, baseURL){
    const out=[];
    const push=(u,t)=>{
      if(!u) return;
      try{
        const url=new URL(u,baseURL).href;
        const path = (new URL(url)).pathname.replace(/^\//,"");
        out.push({
          url,
          type:t,
          file: path || "index.html",   // ← パスをそのまま保持
        });
      }catch(e){}
    };

    // HTML
    out.push({
      url: baseURL,
      type:"html",
      file:"index.html"
    });

    // JS
    doc.querySelectorAll("script[src]").forEach(s=>push(s.src,"js"));

    // CSS
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l=>push(l.href,"css"));

    // IMG
    doc.querySelectorAll("img").forEach(i=>push(i.src,"img"));

    // VIDEO / AUDIO
    doc.querySelectorAll("video, audio, source").forEach(m=>{
      if(m.src) push(m.src,"media");
    });

    // inline CSS 背景画像
    doc.querySelectorAll("[style]").forEach(el=>{
      const bg = el.style.backgroundImage || "";
      const m = bg.match(/url\((['"]?)(.*?)\1\)/);
      if(m) push(m[2],"img");
    });

    // 重複削除
    const map={}; const fin=[];
    out.forEach(a=>{
      if(!map[a.url]){
        map[a.url]=1;
        fin.push(a);
      }
    });

    return fin;
  }

  /* =====================================
      2) フォルダ構造維持で ZIP 作成
  ===================================== */
  function zipAssetsPreserveStructure(doc, urlBase){
    alert("ページのアセットをフォルダ構造のまま ZIP 化しています…");

    return loadJSZip().then(JSZip=>{
      const zip = new JSZip();

      // index.html を入れる
      zip.file("index.html", doc.documentElement.outerHTML);

      const assets = findAssets(doc, urlBase);

      const tasks = assets.map(a=>{
        if(a.type==="html") return Promise.resolve();
        return fetchBlob(a.url)
        .then(blob=>{
          zip.file(a.file, blob);     // ← ファイルパスそのまま追加
        })
        .catch(()=>{});
      });

      return Promise.all(tasks).then(()=>{
        return zip.generateAsync({type:"blob"});
      }).then(blob=>{
        downloadBlob(blob,"assets-structure.zip");
        alert("フォルダ構造付き ZIP が完成しました！");
      });
    });
  }

  /* =====================================
      3) 外部 HTML 読み込み
  ===================================== */
  function loadExternalHTML(url){
    return fetchText(url).then(html=>{
      const p = new DOMParser();
      return p.parseFromString(html,"text/html");
    });
  }

  /* =====================================
      4) Web See（画像を Base64 埋め込み）
  ===================================== */
  function webSee(url){
    alert("Web See を開始します…");

    fetchText(url).then(html=>{
      const doc = new DOMParser().parseFromString(html,"text/html");
      const assets = findAssets(doc,url);

      const proms = assets.map(a=>{
        if(a.type==="html") return Promise.resolve();
        return fetchBlob(a.url).then(b=>{
          return new Promise(ok=>{
            const r=new FileReader();
            r.onload=()=>{
              html = html.split(a.url).join(r.result);
              ok();
            };
            r.readAsDataURL(b);
          });
        }).catch(()=>{});
      });

      Promise.all(proms).then(()=>{
        const w = window.open("about:blank","_blank");
        w.document.open();
        w.document.write(html);
        w.document.close();
      });
    }).catch(e=>{
      alert("取得失敗: " + e);
    });
  }

  /* =====================================
      Mini Games（そのまま）
  ===================================== */
  const game1HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Game1</title></head>
<body><h1>Game 1</h1></body></html>
`;
  const game2HTML = game1HTML.replace("1","2");
  const game3HTML = game1HTML.replace("1","3");
  const game4HTML = game1HTML.replace("1","4");
  const game5HTML = game1HTML.replace("1","5");

  function miniGames(){
    const sel = prompt("Mini Games\n1〜5 を入力");
    const n = parseInt(sel);
    if(!n || n<1 || n>5){
      alert("1〜5を入力してください");
      return;
    }
    const map={1:game1HTML,2:game2HTML,3:game3HTML,4:game4HTML,5:game5HTML};
    const w = window.open("about:blank","_blank");
    w.document.open();
    w.document.write(map[n]);
    w.document.close();
  }

  /* =====================================
      メニュー
  ===================================== */

  function mainMenu(){
    const sel = prompt(
`Page Assets Tool (Structure-Preserved)

1. This Page
2. Other Page
3. Other Thing

番号を入力してください：`
    );

    if(sel==="1") menuThisPage();
    else if(sel==="2") menuOtherPage();
    else if(sel==="3") menuOtherThing();
  }

  function menuThisPage(){
    const sel = prompt("This Page\n\n1. Assets List\n2. DL (Structure ZIP)");
    if(sel==="1"){
      const assets=findAssets(document,location.href);
      alert("Assets:\n\n"+assets.map(a=>a.file+" <= "+a.url).join("\n"));
    }
    else if(sel==="2"){
      zipAssetsPreserveStructure(document, location.href);
    }
  }

  function menuOtherPage(){
    const sel = prompt("Other Page\n\n1. DL (Structure ZIP)\n2. Web See");
    if(sel==="1"){
      const url = prompt("URL を入力");
      if(!url) return;
      loadExternalHTML(url).then(doc=>{
        const as = findAssets(doc,url);
        alert("Assets:\n\n"+as.map(a=>a.file+" <= "+a.url).join("\n"));
        if(confirm("ZIP で保存しますか？")) zipAssetsPreserveStructure(doc,url);
      }).catch(e=>alert("取得失敗: "+e));
    }
    else if(sel==="2"){
      const url = prompt("URL を入力");
      if(url) webSee(url);
    }
  }

  function menuOtherThing(){
    const sel = prompt("Other Thing\n\n1. Mini Games");
    if(sel==="1") miniGames();
  }

  /* 起動 */
  mainMenu();
}
