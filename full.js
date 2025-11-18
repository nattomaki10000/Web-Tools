/* ページ資産ツール（bookmarklet 用メインコード） */
/* 実行：コンソールに貼るか、下のブックマークレット作り方参照 */
(function PageAssetsTool(){

  // ---- ユーティリティ ----
  function createElement(tag, props, parent){
    var el = document.createElement(tag);
    if(props){
      Object.keys(props).forEach(function(k){
        if(k === 'html') el.innerHTML = props[k];
        else if(k === 'text') el.textContent = props[k];
        else el.setAttribute(k, props[k]);
      });
    }
    if(parent) parent.appendChild(el);
    return el;
  }
  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function absUrl(url, base){
    try{ return (new URL(url, base || location.href)).href; }catch(e){ return null; }
  }
  function downloadBlob(blob, filename){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  function textToBlob(str, mime){ return new Blob([str], {type: mime||'text/plain;charset=utf-8'}); }

  // ---- ロード外部ライブラリ（JSZip） ----
  function loadJSZip(){
    return new Promise(function(resolve, reject){
      if(window.JSZip) return resolve(window.JSZip);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function(){ resolve(window.JSZip); };
      s.onerror = function(){ reject(new Error('Failed to load JSZip')); };
      document.head.appendChild(s);
    });
  }

  // ---- UI: モーダル ----
  var rootId = '__page_assets_tool_root__';
  if(document.getElementById(rootId)){
    // 既に開いていたら前のものを閉じる
    document.getElementById(rootId).remove();
  }

  var overlay = createElement('div', {id: rootId});
  Object.assign(overlay.style, {
    position: 'fixed', left:0, top:0, right:0, bottom:0, zIndex:2147483647,
    background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP", Arial'
  });
  var panel = createElement('div', {id:'__page_assets_panel__'}, overlay);
  Object.assign(panel.style, {
    width: '95%', maxWidth:'980px', maxHeight:'92%', overflow:'auto',
    background:'#fff', borderRadius:'10px', padding:'14px', boxSizing:'border-box'
  });
  var header = createElement('div', {html:'<strong>Page Assets Tool</strong> — Select an option'}, panel);
  Object.assign(header.style, {marginBottom:'10px', display:'flex', justifyContent:'space-between', alignItems:'center'});
  var closeBtn = createElement('button', {text:'✕'} , header);
  Object.assign(closeBtn.style, {marginLeft:'10px'});
  closeBtn.onclick = function(){ overlay.remove(); };

  // メインコンテナ
  var main = createElement('div', {}, panel);

  // メニュー描画ヘルパー
  function clearMain(){ main.innerHTML = ''; }

  function makeMenu(title, options){
    clearMain();
    var t = createElement('div', {html:'<h3>'+title+'</h3>'}, main);
    var list = createElement('div', {}, main);
    options.forEach(function(opt){
      var b = createElement('button', {text:opt.label}, list);
      Object.assign(b.style, {display:'block', width:'100%', margin:'6px 0', padding:'8px', textAlign:'left'});
      b.onclick = function(){ opt.action(); };
    });
    // small help
    var help = createElement('div', {html:'<small style="color:#666">Tip: CORS により外部サイトの取得が制限される場合があります</small>'}, main);
  }

  // ---- 資産検出ロジック（ベストエフォート） ----
  function findAssetsInDocument(doc, baseUrl){
    baseUrl = baseUrl || (doc.location && doc.location.href) || location.href;
    var results = [];
    // 1) index HTML
    try{
      if(doc.documentElement && doc.documentElement.outerHTML){
        results.push({
          url: baseUrl,
          type: 'html',
          filename: 'index.html',
          origin: 'document',
          note: 'page html'
        });
      }
    }catch(e){ /* ignore */ }

    // 2) scripts
    qsa('script[src]', doc).forEach(function(s){
      var u = absUrl(s.getAttribute('src'), baseUrl);
      if(u) results.push({url:u,type:'script',filename:(new URL(u)).pathname.replace(/^\//,''), origin:'script[src]'});
    });
    // 3) stylesheets
    qsa('link[rel="stylesheet"]', doc).forEach(function(l){
      var u = absUrl(l.getAttribute('href'), baseUrl);
      if(u) results.push({url:u,type:'css',filename:(new URL(u)).pathname.replace(/^\//,''), origin:'link[rel=stylesheet]'});
    });
    // 4) preload fonts
    qsa('link[rel="preload"][as="font"], link[rel="preload"][as="document"]', doc).forEach(function(l){
      var u = absUrl(l.getAttribute('href'), baseUrl);
      if(u) results.push({url:u,type:'font',filename:(new URL(u)).pathname.replace(/^\//,''), origin:'preload'});
    });
    // 5) images, audio, video, source[src]
    qsa('img', doc).forEach(function(i){
      var src = i.getAttribute('src') || i.getAttribute('data-src') || i.src;
      var u = absUrl(src, baseUrl);
      if(u) results.push({url:u,type:'image',filename:(new URL(u)).pathname.replace(/^\//,''), origin:'img'});
      // srcset
      var ss = i.getAttribute('srcset');
      if(ss){
        ss.split(',').map(s=>s.trim().split(/\s+/)[0]).forEach(function(part){ var uu = absUrl(part, baseUrl); if(uu) results.push({url:uu,type:'image',filename:(new URL(uu)).pathname.replace(/^\//,''), origin:'srcset'}); });
      }
    });
    qsa('video, audio, source', doc).forEach(function(el){
      var src = el.getAttribute('src') || el.src;
      if(src){
        var u = absUrl(src, baseUrl);
        if(u) results.push({url:u,type:(el.tagName.toLowerCase()==='video'?'video':'audio'),filename:(new URL(u)).pathname.replace(/^\//,''), origin:el.tagName});
      }
      // tracks or source children handled by source selector
    });

    // 6) inline style background images (best-effort)
    qsa('*[style]', doc).forEach(function(el){
      try{
        var s = (el.style && el.style.backgroundImage) || '';
        if(s && s.indexOf('url(')>=0){
          var m = s.match(/url\((['"]?)(.*?)\1\)/g);
          if(m){
            m.forEach(function(segment){
              var urlOnly = segment.replace(/url\((['"]?)/,'').replace(/(['"]?)\)$/,'');
              var u = absUrl(urlOnly, baseUrl);
              if(u) results.push({url:u,type:'image',filename:(new URL(u)).pathname.replace(/^\//,''), origin:'inline-style'});
            });
          }
        }
      }catch(e){}
    });

    // 7) scan styleSheets for url(...) and @font-face (best-effort; may throw for cross-origin)
    try{
      Array.prototype.slice.call(doc.styleSheets).forEach(function(ss){
        try{
          var rules = ss.cssRules || [];
          Array.prototype.slice.call(rules).forEach(function(rule){
            try{
              var txt = rule.cssText || '';
              // find url(...)
              var urls = txt.match(/url\((['"]?)(.*?)\1\)/g);
              if(urls){
                urls.forEach(function(seg){
                  var urlOnly = seg.replace(/url\((['"]?)/,'').replace(/(['"]?)\)$/,'');
                  var u = absUrl(urlOnly, ss.href || baseUrl);
                  if(u) results.push({url:u, type: (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u)?'font':'css-resource'), filename:(new URL(u)).pathname.replace(/^\//,''), origin:'cssrule'});
                });
              }
              // fonts
              if(rule.type === CSSRule.FONT_FACE_RULE || (/@font-face/i).test(txt)){
                var m = txt.match(/src:\s*[^;]*url\((['"]?)(.*?)\1\)/i);
                if(m && m[2]){
                  var u = absUrl(m[2], ss.href || baseUrl);
                  if(u) results.push({url:u,type:'font',filename:(new URL(u)).pathname.replace(/^\//,''),origin:'@font-face'});
                }
              }
            }catch(e){}
          });
        }catch(e){}
      });
    }catch(e){ /* cross-origin styleSheets might block */ }

    // dedupe by URL
    var seen = {};
    var uniq = [];
    results.forEach(function(r){
      if(!r.url) return;
      if(seen[r.url]) return;
      seen[r.url] = true;
      // nice filename guess
      if(!r.filename){
        try{ r.filename = (new URL(r.url)).pathname.replace(/^\//,'') || (r.type||'asset'); }catch(e){ r.filename = 'asset'; }
      }
      uniq.push(r);
    });

    return uniq;
  }

  // ---- UI: Assets 一覧表示 ----
  function showAssetsListForDoc(doc, baseUrl){
    var assets = findAssetsInDocument(doc, baseUrl);
    clearMain();
    createElement('h3', {html:'Assets 一覧'}, main);
    if(assets.length === 0){
      createElement('div', {text:'検出できる資産がありませんでした。'}, main);
      return;
    }
    var ul = createElement('div', {}, main);
    assets.forEach(function(a, idx){
      var row = createElement('div', {}, ul);
      Object.assign(row.style, {display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid #eee'});
      var info = createElement('div', {html:'<strong>['+a.type+']</strong> '+ (a.filename || '') + ' <small style="color:#666">('+a.origin+')</small>'}, row);
      Object.assign(info.style, {flex:'1 1 auto', wordBreak:'break-all'});
      var dl = createElement('button', {text:'ダウンロード'}, row);
      dl.onclick = function(){
        fetchAssetAndDownload(a.url, a.filename);
      };
      var openBtn = createElement('button', {text:'開く'}, row);
      openBtn.onclick = function(){
        window.open(a.url,'_blank');
      };
    });

    var wrapBtns = createElement('div', {}, main);
    var zipBtn = createElement('button', {text:'Assets DL [here] (ZIP)'}, wrapBtns);
    zipBtn.onclick = function(){ zipAssetsForDoc(doc, baseUrl); };
    var back = createElement('button', {text:'戻る'}, wrapBtns);
    back.onclick = function(){ showRootMenu(); };
  }

  // ---- fetch asset & download single ----
  function fetchAssetAndDownload(url, filename){
    if(!url) return alert('No URL');
    fetch(url, {mode:'cors'}).then(function(resp){
      if(!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      return resp.blob();
    }).then(function(blob){
      downloadBlob(blob, filename || (url.split('/').pop()||'file'));
    }).catch(function(err){
      alert('取得に失敗しました（CORS かネットワーク）: ' + err.message);
    });
  }

  // ---- ZIP 生成（ここで JSZip を動的ロード） ----
  function zipAssetsForDoc(doc, baseUrl){
    loadJSZip().then(function(JSZip){
      var zip = new JSZip();
      var assets = findAssetsInDocument(doc, baseUrl);
      // add index.html content
      try{
        if(doc.documentElement && doc.documentElement.outerHTML){
          zip.file('index.html', doc.documentElement.outerHTML);
        }
      }catch(e){}
      var tasks = assets.map(function(a){
        // skip if it's the page html (already added)
        if(a.type === 'html' && a.url === (baseUrl || location.href)) return Promise.resolve();
        return fetch(a.url, {mode:'cors'}).then(function(resp){
          if(!resp.ok) throw new Error('Fetch failed: ' + resp.status);
          return resp.arrayBuffer();
        }).then(function(arr){
          // determine path inside zip
          var path = a.filename || (new URL(a.url)).pathname.replace(/^\//,'');
          if(!path) path = 'assets/' + Math.random().toString(36).slice(2,8);
          zip.file(path, arr);
        }).catch(function(err){
          console.warn('skip', a.url, err);
        });
      });

      Promise.all(tasks).then(function(){
        zip.generateAsync({type:'blob'}).then(function(content){
          downloadBlob(content, (new URL((baseUrl||location.href))).hostname + '-assets.zip');
        });
      });

    }).catch(function(err){
      alert('JSZip 読み込み失敗: ' + err.message);
    });
  }

  // ---- Other Page: fetch URL から assets を zip または websee ----
  function fetchHtmlAndMakeDoc(url){
    return fetch(url, {mode:'cors'}).then(function(resp){
      if(!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      return resp.text();
    }).then(function(text){
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, 'text/html');
      return {doc:doc, html:text, url:url};
    });
  }

  function otherPageAssetsDL(){
    var url = prompt('Assets DL - URL を入力してください（https://...）');
    if(!url) return;
    showLoading('Fetching ' + url + ' ...');
    fetchHtmlAndMakeDoc(url).then(function(res){
      hideLoading();
      // show assets list for that doc, and provide zip
      showAssetsListForDoc(res.doc, res.url);
      // override zip button to zip assets from that doc
      // (we already use baseUrl parameter in zipAssetsForDoc)
    }).catch(function(err){
      hideLoading();
      alert('取得失敗（CORS など）: ' + err.message);
    });
  }

  function otherPageWebSee(){
    var url = prompt('Web See - URL を入力してください（https://...）');
    if(!url) return;
    showLoading('Fetching and inlining ' + url + ' ... (may fail due to CORS)');
    fetchHtmlAndMakeDoc(url).then(function(res){
      var assets = findAssetsInDocument(res.doc, res.url);
      // fetch assets and replace urls in HTML with data: URIs (best-effort)
      var html = res.html;
      var fetches = assets.map(function(a){
        // only fetch resources that are not the html itself
        if(a.type === 'html') return Promise.resolve();
        return fetch(a.url, {mode:'cors'}).then(function(resp){
          if(!resp.ok) throw new Error('Fetch failed: ' + resp.status);
          return resp.arrayBuffer().then(function(arr){
            var mime = resp.headers.get('Content-Type') || (a.type==='image'?'image/*':'application/octet-stream');
            // convert to base64
            var u8 = new Uint8Array(arr);
            var b64 = arrayBufferToBase64(u8);
            var dataUri = 'data:' + mime + ';base64,' + b64;
            // replace all occurrences of original URL in html with dataUri (best-effort)
            html = html.split(a.url).join(dataUri);
          });
        }).catch(function(err){
          console.warn('failed to inline', a.url, err);
        });
      });

      Promise.all(fetches).then(function(){
        hideLoading();
        // open new tab with inlined html
        var win = window.open('', '_blank');
        if(!win){ alert('ポップアップブロックで開けませんでした'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
      });
    }).catch(function(err){
      hideLoading();
      alert('取得失敗（CORS など）: ' + err.message);
    });

    function arrayBufferToBase64(u8arr){
      var CHUNK = 0x8000;
      var index = 0;
      var length = u8arr.length;
      var result = '';
      while(index < length){
        var sub = u8arr.subarray(index, Math.min(index + CHUNK, length));
        result += String.fromCharCode.apply(null, sub);
        index += CHUNK;
      }
      return btoa(result);
    }
  }

  // ---- HTML Tool ----
  function showHTMLTool(){
    clearMain();
    createElement('h3', {html:'HTML Tool'}, main);
    var upload = createElement('input', {type:'file', multiple:'multiple'}, main);
    var fileList = createElement('div', {}, main);

    var filesData = {}; // name -> {file, text}
    upload.onchange = function(ev){
      fileList.innerHTML = '';
      var files = Array.prototype.slice.call(upload.files||[]);
      if(files.length === 0) return;
      var readTasks = files.map(function(f){
        return new Promise(function(resolve){
          var reader = new FileReader();
          reader.onload = function(){ filesData[f.name] = {file:f, text: reader.result}; resolve(); };
          reader.readAsText(f);
        });
      });
      Promise.all(readTasks).then(function(){
        renderFileEditors();
      });
    };

    function renderFileEditors(){
      fileList.innerHTML = '';
      Object.keys(filesData).forEach(function(name){
        var wrap = createElement('div', {}, fileList);
        Object.assign(wrap.style, {border:'1px solid #ddd', padding:'8px', marginBottom:'8px'});
        createElement('div', {html:'<strong>'+name+'</strong>'}, wrap);
        var ta = createElement('textarea', {}, wrap);
        Object.assign(ta.style, {width:'100%', height:'160px', boxSizing:'border-box'});
        ta.value = filesData[name].text || '';
        var btns = createElement('div', {}, wrap);
        var saveBtn = createElement('button', {text:'保存'}, btns);
        var dlBtn = createElement('button', {text:'ダウンロード'}, btns);
        saveBtn.onclick = function(){ filesData[name].text = ta.value; alert(name + ' を保存しました（メモリ上）'); };
        dlBtn.onclick = function(){ downloadBlob(textToBlob(ta.value, guessMime(name)), name); };
      });

      var zipBtn = createElement('button', {text:'まとめて ZIP ダウンロード'}, fileList);
      zipBtn.onclick = function(){
        loadJSZip().then(function(JSZip){
          var zip = new JSZip();
          Object.keys(filesData).forEach(function(n){
            zip.file(n, filesData[n].text || '');
          });
          zip.generateAsync({type:'blob'}).then(function(b){ downloadBlob(b, 'htmltool-files.zip'); });
        }).catch(function(e){ alert('JSZip error: ' + e.message); });
      };

      var mergedBtn = createElement('button', {text:'1ファイルにまとめてダウンロード（HTMLに埋め込み）'}, fileList);
      mergedBtn.onclick = function(){
        // find one html as base or create
        var htmlName = Object.keys(filesData).find(n => /\.html?$/.test(n)) || 'index.html';
        var htmlText = filesData[htmlName] ? filesData[htmlName].text : '<!doctype html><html><head></head><body></body></html>';
        // inline CSS and JS from other files
        var cssStr = '';
        var jsStr = '';
        Object.keys(filesData).forEach(function(n){
          if(n === htmlName) return;
          if(/\.css$/i.test(n)) cssStr += '\n/* '+n+' */\n' + filesData[n].text;
          if(/\.js$/i.test(n)) jsStr += '\n/* '+n+' */\n' + filesData[n].text;
        });
        // naive insertion: put css into <head>, js before </body>
        var merged = htmlText.replace(/<\/head>/i, '<style>\n' + cssStr + '\n</style>\n</head>');
        merged = merged.replace(/<\/body>/i, '<script>\n' + jsStr + '\n</script>\n</body>');
        downloadBlob(textToBlob(merged,'text/html;charset=utf-8'), 'merged.html');
      };

      var previewBtn = createElement('button', {text:'閲覧・実行確認 (新タブ)'}, fileList);
      previewBtn.onclick = function(){
        var htmlName = Object.keys(filesData).find(n => /\.html?$/.test(n)) || 'index.html';
        var htmlText = filesData[htmlName] ? filesData[htmlName].text : '<!doctype html><html><head></head><body></body></html>';
        // inline other css/js like above
        var cssStr = '';
        var jsStr = '';
        Object.keys(filesData).forEach(function(n){
          if(n === htmlName) return;
          if(/\.css$/i.test(n)) cssStr += '\n/* '+n+' */\n' + filesData[n].text;
          if(/\.js$/i.test(n)) jsStr += '\n/* '+n+' */\n' + filesData[n].text;
        });
        var merged = htmlText.replace(/<\/head>/i, '<style>\n' + cssStr + '\n</style>\n</head>');
        merged = merged.replace(/<\/body>/i, '<script>\n' + jsStr + '\n</script>\n</body>');
        var win = window.open('about:blank','_blank');
        win.document.open();
        win.document.write(merged);
        win.document.close();
      };
    }

    function guessMime(name){
      if(/\.html?$/i.test(name)) return 'text/html;charset=utf-8';
      if(/\.css$/i.test(name)) return 'text/css;charset=utf-8';
      if(/\.js$/i.test(name)) return 'text/javascript;charset=utf-8';
      return 'text/plain;charset=utf-8';
    }

    var back = createElement('button', {text:'戻る'}, main);
    back.onclick = function(){ showRootMenu(); };
  }

  // ---- Mini Games ----
  function showMiniGames(){
    clearMain();
    createElement('h3', {html:'Mini Games'}, main);
    var list = ['1game','2game','3game','4game','5game'];
    list.forEach(function(name){
      var b = createElement('button', {text:name}, main);
      b.onclick = function(){
        // user said: eachゲームに自分の作ったhtmlを入れたら動くようにする
        // 現状は placeholder を出す
        var html = '<!doctype html><html><head><meta charset="utf-8"><title>'+name+'</title></head><body><h1>'+name+'</h1><p>html-is-here!-here!-here!</p></body></html>';
        var w = window.open('','_blank');
        w.document.open();
        w.document.write(html);
        w.document.close();
      };
    });
    var back = createElement('button', {text:'戻る'}, main);
    back.onclick = function(){ showRootMenu(); };
  }

  // ---- Loading UI ----
  var loadingEl = null;
  function showLoading(text){
    if(loadingEl) loadingEl.remove();
    loadingEl = createElement('div', {html: text}, panel);
    Object.assign(loadingEl.style, {position:'absolute', left:'50%', top:'10px', transform:'translateX(-50%)', background:'#222', color:'#fff', padding:'8px 12px', borderRadius:'6px'});
  }
  function hideLoading(){ if(loadingEl){ loadingEl.remove(); loadingEl = null; } }

  // ---- Root メニュー ----
  function showRootMenu(){
    makeMenu('Choose:', [
      {label:'This Page', action: function(){ showThisPageMenu(); }},
      {label:'Other Page', action: function(){ showOtherPageMenu(); }},
      {label:'Other Thing', action: function(){ showOtherThingMenu(); }}
    ]);
  }

  // This Page menu
  function showThisPageMenu(){
    makeMenu('This Page:', [
      {label:'Assets 一覧', action: function(){ showAssetsListForDoc(document, location.href); }},
      {label:'Assets DL [here] (ZIP)', action: function(){ zipAssetsForDoc(document, location.href); }}
    ]);
  }

  // Other Page menu
  function showOtherPageMenu(){
    makeMenu('Other Page:', [
      {label:'Assets DL [URL]', action: otherPageAssetsDL},
      {label:'Web See', action: otherPageWebSee}
    ]);
  }

  // Other Thing menu
  function showOtherThingMenu(){
    makeMenu('Other Thing:', [
      {label:'HTML Tool', action: showHTMLTool},
      {label:'Mini Games', action: showMiniGames}
    ]);
  }

  // init
  showRootMenu();
  document.body.appendChild(overlay);

})();
