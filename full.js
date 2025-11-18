/* ============================================================
   Page Assets Tool (GitHub Pages Version)
   呼び出し: PageAssetsTool();
   ============================================================ */

function PageAssetsTool() {
  /* =====================================
        基本ユーティリティ
  ===================================== */
  function fetchText(url) {
    return fetch(url, { mode: "cors" }).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  function fetchBlob(url) {
    return fetch(url, { mode: "cors" }).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* =====================================
        JSZipロード
  ===================================== */
  function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) return resolve(window.JSZip);

      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject("JSZip load error");
      document.body.appendChild(s);
    });
  }

  /* =====================================
       ページからアセット一覧抽出
  ===================================== */
  function findAssets(doc, baseURL) {
    const out = [];

    const push = (u, type) => {
      if (!u) return;
      try {
        const url = new URL(u, baseURL).href;
        const file = (new URL(url)).pathname.replace(/^\//, "") || "index.html";
        out.push({ url, type, file });
      } catch (e) { }
    };

    out.push({
      url: baseURL,
      type: "html",
      file: "index.html"
    });

    doc.querySelectorAll("script[src]").forEach(s => push(s.src, "js"));
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => push(l.href, "css"));
    doc.querySelectorAll("img").forEach(i => push(i.src, "img"));
    doc.querySelectorAll("video,audio,source").forEach(m => {
      if (m.src) push(m.src, "media");
    });

    // inline CSS background
    doc.querySelectorAll("[style]").forEach(e => {
      const bg = e.style.backgroundImage || "";
      const m = bg.match(/url\((['"]?)(.*?)\1\)/);
      if (m) push(m[2], "img");
    });

    // 重複除去
    const map = {}, list = [];
    out.forEach(a => {
      if (!map[a.url]) {
        map[a.url] = 1;
        list.push(a);
      }
    });

    return list;
  }

  /* =====================================
       ZIP（フォルダ構造維持）
  ===================================== */
  function zipAssetsStructure(doc, baseURL) {
    alert("フォルダ構造そのままで ZIP を生成します…");

    return loadJSZip().then(JSZip => {
      const zip = new JSZip();
      zip.file("index.html", doc.documentElement.outerHTML);

      const assets = findAssets(doc, baseURL);

      const tasks = assets.map(a => {
        if (a.type === "html") return;
        return fetchBlob(a.url).then(blob => {
          zip.file(a.file, blob);
        }).catch(() => { });
      });

      return Promise.all(tasks).then(() =>
        zip.generateAsync({ type: "blob" })
      ).then(blob => {
        downloadBlob(blob, "assets-structure.zip");
        alert("ZIP をダウンロードしました！");
      });
    });
  }

  /* =====================================
        外部HTML読み込み
  ===================================== */
  function loadExternalHTML(url) {
    return fetchText(url).then(html => {
      const p = new DOMParser();
      return p.parseFromString(html, "text/html");
    });
  }

  /* =====================================
        Web See（Base64 埋め込み）
  ===================================== */
  function webSee(url) {
    alert("Web See 開始…");

    fetchText(url).then(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const assets = findAssets(doc, url);

      const ps = assets.map(a => {
        if (a.type === "html") return Promise.resolve();
        return fetchBlob(a.url).then(b => new Promise(ok => {
          const r = new FileReader();
          r.onload = () => {
            html = html.split(a.url).join(r.result);
            ok();
          };
          r.readAsDataURL(b);
        })).catch(() => { });
      });

      Promise.all(ps).then(() => {
        const w = window.open("about:blank", "_blank");
        w.document.open();
        w.document.write(html);
        w.document.close();
      });
    });
  }

  /* =====================================
        Mini Games (あなたのHTMLをそのまま入れ替え)
  ===================================== */
  const game1HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Game 1</title></head>
<body><h1>Game 1</h1></body>
</html>`;

  const game2HTML = game1HTML.replace("1", "2");
  const game3HTML = game1HTML.replace("1", "3");
  const game4HTML = game1HTML.replace("1", "4");
  const game5HTML = game1HTML.replace("1", "5");

  function miniGames() {
    const s = prompt("Mini Games\n1〜5 を入力");
    const n = parseInt(s);
    if (!n || n < 1 || n > 5) return alert("1〜5 を入力してください");

    const map = {
      1: game1HTML,
      2: game2HTML,
      3: game3HTML,
      4: game4HTML,
      5: game5HTML
    };

    const w = window.open("about:blank", "_blank");
    w.document.open();
    w.document.write(map[n]);
    w.document.close();
  }

  /* =====================================
        メニュー
  ===================================== */
  function mainMenu() {
    const s = prompt(
`Page Assets Tool

1. This Page
2. Other Page
3. Other Thing

番号を入力：`
    );

    if (s === "1") menuThisPage();
    else if (s === "2") menuOtherPage();
    else if (s === "3") menuOtherThing();
  }

  function menuThisPage() {
    const s = prompt("This Page\n1. Assets List\n2. DL (Structure ZIP)");
    if (s === "1") {
      const list = findAssets(document, location.href);
      alert("Assets:\n\n" + list.map(a => `${a.file}  <=  ${a.url}`).join("\n"));
    } else if (s === "2") {
      zipAssetsStructure(document, location.href);
    }
  }

  function menuOtherPage() {
    const s = prompt("Other Page\n1. DL (Structure ZIP)\n2. Web See");
    if (s === "1") {
      const url = prompt("URL を入力");
      if (!url) return;
      loadExternalHTML(url).then(doc => {
        const list = findAssets(doc, url);
        alert("Assets:\n\n" + list.map(a => `${a.file}  <=  ${a.url}`).join("\n"));
        if (confirm("ZIP を保存しますか？")) {
          zipAssetsStructure(doc, url);
        }
      });
    }
    else if (s === "2") {
      const url = prompt("URL を入力");
      if (url) webSee(url);
    }
  }

  function menuOtherThing() {
    const s = prompt("Other Thing\n1. Mini Games");
    if (s === "1") miniGames();
  }

  /* 起動 */
  mainMenu();
}
