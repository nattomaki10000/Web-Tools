// Main Script for GitHub Pages
(function() {
  'use strict';

  // JSZip CDN
  const jsZipScript = document.createElement('script');
  jsZipScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(jsZipScript);

  // Utility Functions
  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAssets = () => {
    const assets = [];
    
    // Images
    document.querySelectorAll('img').forEach(img => {
      if (img.src) assets.push({ type: 'image', url: img.src, element: img });
    });
    
    // CSS
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      assets.push({ type: 'css', url: link.href, element: link });
    });
    
    // JavaScript
    document.querySelectorAll('script[src]').forEach(script => {
      assets.push({ type: 'javascript', url: script.src, element: script });
    });
    
    // Videos
    document.querySelectorAll('video source, video').forEach(video => {
      const url = video.src || video.currentSrc;
      if (url) assets.push({ type: 'video', url, element: video });
    });
    
    // Audio
    document.querySelectorAll('audio source, audio').forEach(audio => {
      const url = audio.src || audio.currentSrc;
      if (url) assets.push({ type: 'audio', url, element: audio });
    });
    
    // Background images from CSS
    document.querySelectorAll('*').forEach(el => {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match) assets.push({ type: 'background', url: match[1], element: el });
      }
    });

    return assets;
  };

  const showAssetsList = () => {
    const assets = getAssets();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8); z-index: 999999999;
      overflow: auto; padding: 20px;
    `;
    
    const container = document.createElement('div');
    container.style.cssText = `
      max-width: 800px; margin: 0 auto;
      background: white; border-radius: 10px; padding: 20px;
    `;
    
    const title = document.createElement('h2');
    title.textContent = 'Assets 一覧';
    title.style.cssText = 'margin-top: 0;';
    container.appendChild(title);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.style.cssText = `
      padding: 10px 20px; margin-bottom: 20px;
      background: #f44336; color: white; border: none;
      border-radius: 5px; cursor: pointer; font-size: 16px;
    `;
    closeBtn.onclick = () => overlay.remove();
    container.appendChild(closeBtn);
    
    assets.forEach((asset, i) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 10px; margin: 10px 0;
        border: 1px solid #ddd; border-radius: 5px;
        display: flex; justify-content: space-between;
        align-items: center; flex-wrap: wrap; gap: 10px;
      `;
      
      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; min-width: 200px; word-break: break-all;';
      info.innerHTML = `<strong>${asset.type}</strong><br>${asset.url}`;
      
      const dlBtn = document.createElement('button');
      dlBtn.textContent = 'ダウンロード';
      dlBtn.style.cssText = `
        padding: 8px 16px; background: #4CAF50; color: white;
        border: none; border-radius: 5px; cursor: pointer;
      `;
      dlBtn.onclick = async () => {
        try {
          const res = await fetch(asset.url);
          const blob = await res.blob();
          const filename = asset.url.split('/').pop() || `asset_${i}`;
          downloadFile(blob, filename);
        } catch (e) {
          alert('ダウンロード失敗: ' + e.message);
        }
      };
      
      item.appendChild(info);
      item.appendChild(dlBtn);
      container.appendChild(item);
    });
    
    overlay.appendChild(container);
    document.body.appendChild(overlay);
  };

  const downloadPageAssets = async (retry = true) => {
    try {
      const assets = getAssets();
      const zip = new JSZip();
      
      const htmlContent = document.documentElement.outerHTML;
      zip.file('index.html', htmlContent);
      
      for (const asset of assets) {
        try {
          const res = await fetch(asset.url);
          const blob = await res.blob();
          const filename = asset.url.split('/').pop() || `asset_${Date.now()}`;
          zip.file(filename, blob);
        } catch (e) {
          console.warn('Failed to fetch:', asset.url);
        }
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      downloadFile(content, 'page_assets.zip');
    } catch (e) {
      if (retry && confirm('ダウンロード失敗。リトライしますか？')) {
        await downloadPageAssets(retry);
      } else {
        alert('ダウンロード失敗: ' + e.message);
      }
    }
  };

  const downloadURLAssets = async (url, retry = true) => {
    try {
      const res = await fetch(url);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const zip = new JSZip();
      zip.file('index.html', html);
      
      const base = new URL(url);
      const fetchAsset = async (selector, attr) => {
        doc.querySelectorAll(selector).forEach(async el => {
          const assetUrl = el.getAttribute(attr);
          if (assetUrl) {
            try {
              const fullUrl = new URL(assetUrl, base).href;
              const res = await fetch(fullUrl);
              const blob = await res.blob();
              zip.file(assetUrl.split('/').pop(), blob);
            } catch (e) {}
          }
        });
      };
      
      await fetchAsset('img', 'src');
      await fetchAsset('link[rel="stylesheet"]', 'href');
      await fetchAsset('script[src]', 'src');
      
      const content = await zip.generateAsync({ type: 'blob' });
      downloadFile(content, 'url_assets.zip');
    } catch (e) {
      if (retry && confirm('ダウンロード失敗。リトライしますか？')) {
        await downloadURLAssets(url, retry);
      } else {
        alert('ダウンロード失敗: ' + e.message);
      }
    }
  };

  const webSee = async (url, retry = true) => {
    try {
      const res = await fetch(url);
      const html = await res.text();
      const newWindow = window.open('', '_blank');
      newWindow.document.write(html);
      newWindow.document.close();
    } catch (e) {
      if (retry && confirm('取得失敗。リトライしますか？')) {
        await webSee(url, retry);
      } else {
        alert('取得失敗: ' + e.message);
      }
    }
  };

  const showHTMLTool = () => {
    const newWindow = window.open('', '_blank');
    const overlay = newWindow.document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.9); z-index: 999999999;
      overflow: auto; padding: 20px;
    `;
    
    const container = document.createElement('div');
    container.style.cssText = `
      max-width: 1200px; margin: 0 auto;
      background: white; border-radius: 10px; padding: 20px;
    `;
    
    container.innerHTML = `
      <h2 style="margin-top: 0;">HTML Tool</h2>
      <button id="closeToolBtn" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 20px;">閉じる</button>
      <div style="margin: 20px 0;">
        <label style="display: block; margin-bottom: 10px;">HTML: <input type="file" id="htmlFile" accept=".html"></label>
        <label style="display: block; margin-bottom: 10px;">CSS: <input type="file" id="cssFile" accept=".css"></label>
        <label style="display: block; margin-bottom: 10px;">JavaScript: <input type="file" id="jsFile" accept=".js"></label>
      </div>
      <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin: 20px 0;">
        <div>
          <label>HTML:</label>
          <textarea id="htmlEditor" style="width: 100%; height: 150px; font-family: monospace;"></textarea>
        </div>
        <div>
          <label>CSS:</label>
          <textarea id="cssEditor" style="width: 100%; height: 150px; font-family: monospace;"></textarea>
        </div>
        <div>
          <label>JavaScript:</label>
          <textarea id="jsEditor" style="width: 100%; height: 150px; font-family: monospace;"></textarea>
        </div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0;">
        <button id="previewBtn" style="padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer;">プレビュー</button>
        <button id="dlHtmlBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">HTML DL</button>
        <button id="dlCssBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">CSS DL</button>
        <button id="dlJsBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">JS DL</button>
        <button id="dlZipBtn" style="padding: 10px 20px; background: #FF9800; color: white; border: none; border-radius: 5px; cursor: pointer;">ZIP DL</button>
        <button id="dlSingleBtn" style="padding: 10px 20px; background: #9C27B0; color: white; border: none; border-radius: 5px; cursor: pointer;">単一HTML DL</button>
      </div>
    `;
    
    overlay.appendChild(container);
    newWindow.document.body.appendChild(overlay);
    newWindow.document.body.style.margin = '0';
    
    const htmlEditor = container.querySelector('#htmlEditor');
    const cssEditor = container.querySelector('#cssEditor');
    const jsEditor = container.querySelector('#jsEditor');
    
    container.querySelector('#closeToolBtn').onclick = () => overlay.remove();
    
    container.querySelector('#htmlFile').onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => htmlEditor.value = ev.target.result;
        reader.readAsText(file);
      }
    };
    
    container.querySelector('#cssFile').onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => cssEditor.value = ev.target.result;
        reader.readAsText(file);
      }
    };
    
    container.querySelector('#jsFile').onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => jsEditor.value = ev.target.result;
        reader.readAsText(file);
      }
    };
    
    container.querySelector('#previewBtn').onclick = () => {
      const html = htmlEditor.value;
      const css = cssEditor.value;
      const js = jsEditor.value;
      const combined = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>${css}</style>
        </head>
        <body>
          ${html}
          <script>${js}<\/script>
        </body>
        </html>
      `;
      const newWindow = window.open('', '_blank');
      newWindow.document.write(combined);
      newWindow.document.close();
    };
    
    container.querySelector('#dlHtmlBtn').onclick = () => {
      const blob = new Blob([htmlEditor.value], { type: 'text/html' });
      downloadFile(blob, 'index.html');
    };
    
    container.querySelector('#dlCssBtn').onclick = () => {
      const blob = new Blob([cssEditor.value], { type: 'text/css' });
      downloadFile(blob, 'style.css');
    };
    
    container.querySelector('#dlJsBtn').onclick = () => {
      const blob = new Blob([jsEditor.value], { type: 'text/javascript' });
      downloadFile(blob, 'script.js');
    };
    
    container.querySelector('#dlZipBtn').onclick = async () => {
      const zip = new JSZip();
      zip.file('index.html', htmlEditor.value);
      zip.file('style.css', cssEditor.value);
      zip.file('script.js', jsEditor.value);
      const content = await zip.generateAsync({ type: 'blob' });
      downloadFile(content, 'project.zip');
    };
    
    container.querySelector('#dlSingleBtn').onclick = () => {
      const combined = `
<!DOCTYPE html>
<html>
<head>
  <style>${cssEditor.value}</style>
</head>
<body>
  ${htmlEditor.value}
  <script>${jsEditor.value}<\/script>
</body>
</html>
      `;
      const blob = new Blob([combined], { type: 'text/html' });
      downloadFile(blob, 'combined.html');
    };
  };

  // Custom Games Storage (ユーザーが追加できる)
  const customGames = {
    // ここに自分で作ったHTMLゲームを追加できます
    // 例: custom1: `<!DOCTYPE html><html>...</html>`,
    //     custom2: `<!DOCTYPE html><html>...</html>`,
  };

  const miniGames = {
    game1: `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#222;font-family:Arial}#game{text-align:center;color:white}button{padding:15px 30px;font-size:20px;margin:10px;cursor:pointer;border:none;border-radius:5px;background:#4CAF50;color:white}</style></head><body><div id="game"><h1>数当てゲーム</h1><p>1〜100の数字を当てよう！</p><input id="guess" type="number" style="padding:10px;font-size:18px;"><br><button onclick="check()">チェック</button><p id="result"></p><p id="count">残り: 10回</p></div><script>let answer=Math.floor(Math.random()*100)+1,tries=10;function check(){const g=parseInt(document.getElementById('guess').value);if(!g)return alert('数字を入力してください');tries--;if(g===answer){document.getElementById('result').textContent='正解！';return}document.getElementById('result').textContent=g<answer?'もっと大きい':'もっと小さい';document.getElementById('count').textContent='残り: '+tries+'回';if(tries===0){alert('ゲームオーバー！答えは'+answer);location.reload()}}<\/script></body></html>`,
    
    game2: `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#333}canvas{border:2px solid white}#restart{margin-top:20px;padding:10px 20px;font-size:16px;cursor:pointer;background:#4CAF50;color:white;border:none;border-radius:5px;display:none}#score{position:fixed;top:20px;right:20px;background:rgba(255,255,255,0.9);padding:15px;border-radius:10px;font-family:Arial}#currentLen{font-size:24px;font-weight:bold;color:#4CAF50}</style></head><body><div id="score"><div id="currentLen">長さ: 1</div><div>ベスト: <span id="bestScore">0</span></div></div><canvas id="c" width="400" height="400"></canvas><button id="restart">もう一度プレイ</button><script>const beep=new AudioContext();function playSound(freq,dur){const osc=beep.createOscillator(),gain=beep.createGain();osc.frequency.value=freq;osc.connect(gain);gain.connect(beep.destination);gain.gain.setValueAtTime(0.1,beep.currentTime);gain.gain.exponentialRampToValueAtTime(0.01,beep.currentTime+dur);osc.start();osc.stop(beep.currentTime+dur)}function getCookie(n){const m=document.cookie.match('(^|;)\\s*'+n+'\\s*=\\s*([^;]+)');return m?m.pop():'0'}function setCookie(n,v){document.cookie=n+'='+v+';max-age=31536000;path=/'}const c=document.getElementById('c'),ctx=c.getContext('2d'),s=20,restartBtn=document.getElementById('restart');let snake,dir,food,gameOver,gameLoop,best=parseInt(getCookie('game2Best'));document.getElementById('bestScore').textContent=best;function init(){snake=[{x:200,y:200}];dir={x:s,y:0};food={x:0,y:0};gameOver=false;restartBtn.style.display='none';document.getElementById('currentLen').textContent='長さ: 1';food.x=Math.floor(Math.random()*20)*s;food.y=Math.floor(Math.random()*20)*s;if(gameLoop)clearInterval(gameLoop);gameLoop=setInterval(()=>{update();draw()},100)}function draw(){ctx.fillStyle='#000';ctx.fillRect(0,0,400,400);ctx.fillStyle='#0f0';snake.forEach(p=>ctx.fillRect(p.x,p.y,s,s));ctx.fillStyle='#f00';ctx.fillRect(food.x,food.y,s,s);if(gameOver){ctx.fillStyle='white';ctx.font='30px Arial';ctx.textAlign='center';ctx.fillText('Game Over!',200,180);ctx.font='20px Arial';ctx.fillText('長さ: '+snake.length,200,220)}}function update(){if(gameOver)return;const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(head.x<0||head.x>=400||head.y<0||head.y>=400||snake.some(p=>p.x===head.x&&p.y===head.y)){gameOver=true;clearInterval(gameLoop);playSound(200,0.5);restartBtn.style.display='block';if(snake.length>best){best=snake.length;setCookie('game2Best',best);document.getElementById('bestScore').textContent=best+' 🎉'}return}snake.unshift(head);if(head.x===food.x&&head.y===food.y){playSound(800,0.1);document.getElementById('currentLen').textContent='長さ: '+snake.length;food.x=Math.floor(Math.random()*20)*s;food.y=Math.floor(Math.random()*20)*s}else{snake.pop()}}document.onkeydown=e=>{if(gameOver)return;if(e.key==='ArrowUp'&&dir.y===0){dir={x:0,y:-s};playSound(400,0.05)}if(e.key==='ArrowDown'&&dir.y===0){dir={x:0,y:s};playSound(400,0.05)}if(e.key==='ArrowLeft'&&dir.x===0){dir={x:-s,y:0};playSound(400,0.05)}if(e.key==='ArrowRight'&&dir.x===0){dir={x:s,y:0};playSound(400,0.05)}};restartBtn.onclick=init;init()<\/script></body></html>`,
    
    game3: `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#555;font-family:Arial}.cell{width:80px;height:80px;border:2px solid #333;display:inline-block;font-size:40px;text-align:center;line-height:80px;cursor:pointer;background:white;margin:2px}</style></head><body><div id="game"><h1 style="color:white;text-align:center">三目並べ</h1><div id="board"></div><p id="status" style="color:white;text-align:center"></p></div><script>let board=['','','','','','','','',''],turn='X',done=false;const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];function render(){document.getElementById('board').innerHTML='';for(let i=0;i<9;i++){const cell=document.createElement('div');cell.className='cell';cell.textContent=board[i];cell.onclick=()=>play(i);document.getElementById('board').appendChild(cell);if(i%3===2)document.getElementById('board').appendChild(document.createElement('br'))}}function play(i){if(done||board[i])return;board[i]=turn;render();for(const w of wins){if(board[w[0]]&&board[w[0]]===board[w[1]]&&board[w[1]]===board[w[2]]){document.getElementById('status').textContent=turn+'の勝ち！';done=true;return}}if(!board.includes('')){document.getElementById('status').textContent='引き分け！';done=true;return}turn=turn==='X'?'O':'X'}render()<\/script></body></html>`,
    
    game4: `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#444;font-family:Arial;color:white}#game{text-align:center}.btn{width:100px;height:100px;margin:10px;font-size:60px;cursor:pointer;border:3px solid white;border-radius:10px;display:inline-block;background:#666}</style></head><body><div id="game"><h1>じゃんけんゲーム</h1><div><div class="btn" onclick="play('rock')">✊</div><div class="btn" onclick="play('paper')">✋</div><div class="btn" onclick="play('scissors')">✌️</div></div><p id="result"></p><p id="score">あなた: 0 | CPU: 0</p></div><script>let s={p:0,c:0};const m=['rock','paper','scissors'],e=['✊','✋','✌️'];function play(p){const c=m[Math.floor(Math.random()*3)],pi=m.indexOf(p),ci=m.indexOf(c);let r='引き分け';if((pi+1)%3===ci){r='あなたの勝ち！';s.p++}else if((ci+1)%3===pi){r='CPUの勝ち！';s.c++}document.getElementById('result').innerHTML='あなた: '+e[pi]+' CPU: '+e[ci]+'<br>'+r;document.getElementById('score').textContent='あなた: '+s.p+' | CPU: '+s.c}<\/script></body></html>`,
    
    game5: `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#234;font-family:Arial;color:white}#game{text-align:center}.card{width:80px;height:120px;margin:5px;display:inline-block;background:#555;border:2px solid white;border-radius:8px;cursor:pointer;font-size:40px;line-height:120px}.flip{background:#fff;color:#000}</style></head><body><div id="game"><h1>神経衰弱</h1><div id="board"></div><p id="status">マッチ数: 0</p></div><script>const icons=['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍑'];let cards=[...icons,...icons].sort(()=>Math.random()-0.5),revealed=[],matched=[],matches=0;function render(){const b=document.getElementById('board');b.innerHTML='';cards.forEach((c,i)=>{const d=document.createElement('div');d.className='card';if(revealed.includes(i)||matched.includes(i)){d.classList.add('flip');d.textContent=c}d.onclick=()=>flip(i);b.appendChild(d)})}function flip(i){if(revealed.length===2||revealed.includes(i)||matched.includes(i))return;revealed.push(i);render();if(revealed.length===2){setTimeout(()=>{if(cards[revealed[0]]===cards[revealed[1]]){matched.push(...revealed);matches++;document.getElementById('status').textContent='マッチ数: '+matches;if(matches===8)alert('おめでとう！')}revealed=[];render()},500)}}render()<\/script></body></html>`
  };

  const showMiniGame = (gameNum) => {
    let gameHTML;
    if (gameNum.startsWith('custom')) {
      gameHTML = customGames[gameNum];
    } else {
      gameHTML = miniGames[`game${gameNum}`];
    }
    
    if (!gameHTML) {
      alert('ゲームが見つかりません');
      return;
    }
    
    const newWindow = window.open('', '_blank');
    newWindow.document.write(gameHTML);
    newWindow.document.close();
  };

  // Main Navigation
  const mainMenu = () => {
    const choice = prompt('選択してください:\n1: This Page\n2: Other Page\n3: Other Thing\n\nキャンセルで終了');
    
    if (!choice) return;
    
    if (choice === '1') thisPageMenu();
    else if (choice === '2') otherPageMenu();
    else if (choice === '3') otherThingMenu();
    else {
      alert('無効な選択です');
      mainMenu();
    }
  };

  const thisPageMenu = () => {
    const choice = prompt('選択してください:\n1: Assets 一覧\n2: Assets DL [here]\n\nキャンセルで戻る');
    
    if (!choice) return mainMenu();
    
    if (choice === '1') showAssetsList();
    else if (choice === '2') downloadPageAssets();
    else {
      alert('無効な選択です');
      thisPageMenu();
    }
  };

  const otherPageMenu = () => {
    const choice = prompt('選択してください:\n1: Assets DL [URL]\n2: Web See\n\nキャンセルで戻る');
    
    if (!choice) return mainMenu();
    
    if (choice === '1') {
      const url = prompt('URLを入力してください:');
      if (url) downloadURLAssets(url);
      else otherPageMenu();
    }
    else if (choice === '2') {
      const url = prompt('URLを入力してください:');
      if (url) webSee(url);
      else otherPageMenu();
    }
    else {
      alert('無効な選択です');
      otherPageMenu();
    }
  };

  const otherThingMenu = () => {
    const choice = prompt('選択してください:\n1: HTML Tool\n2: Mini Games\n\nキャンセルで戻る');
    
    if (!choice) return mainMenu();
    
    if (choice === '1') showHTMLTool();
    else if (choice === '2') miniGamesMenu();
    else {
      alert('無効な選択です');
      otherThingMenu();
    }
  };

  const miniGamesMenu = () => {
    // カスタムゲームの数を取得
    const customCount = Object.keys(customGames).length;
    
    let menuText = 'ゲームを選択してください:\n1: 数当てゲーム\n2: スネークゲーム\n3: 三目並べ\n4: じゃんけん\n5: 神経衰弱';
    
    // カスタムゲームがあれば追加
    if (customCount > 0) {
      menuText += '\n\n--- カスタムゲーム ---';
      Object.keys(customGames).forEach((key, index) => {
        menuText += `\nc${index + 1}: カスタムゲーム${index + 1}`;
      });
    }
    
    menuText += '\n\nキャンセルで戻る';
    
    const choice = prompt(menuText);
    
    if (!choice) return otherThingMenu();
    
    if (['1','2','3','4','5'].includes(choice)) {
      showMiniGame(choice);
    } else if (choice.startsWith('c')) {
      // カスタムゲームの選択
      const customIndex = parseInt(choice.substring(1)) - 1;
      const customKeys = Object.keys(customGames);
      if (customIndex >= 0 && customIndex < customKeys.length) {
        showMiniGame(customKeys[customIndex]);
      } else {
        alert('無効な選択です');
        miniGamesMenu();
      }
    } else {
      alert('無効な選択です');
      miniGamesMenu();
    }
  };

  // Start
  mainMenu();
})();
