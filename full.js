(function(){

/////////////////////////////
// Safe New Tab HTML builder
/////////////////////////////
function openBlobHTML(bodyJS){
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body { margin:0; background:black; color:white; font-family:sans-serif; }
#loading { color:white; font-size:20px; padding:20px; }
</style>
</head>
<body>
<div id="loading">Loading...</div>
<script>
window.onload = function(){
    document.getElementById('loading').remove();
    ${bodyJS}
};
<\/script>
</body>
</html>
`;
    const b = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(b);
    window.open(url, "_blank");
}

/////////////////////////////
// UI
/////////////////////////////
function menu(title, options){
    let t = title + "\n\n";
    options.forEach((o,i)=>t += (i+1)+": "+o+"\n");
    t += "\nキャンセル = 戻る";
    const s = prompt(t);
    if(s===null) return null;
    const n = Number(s);
    if(n>=1 && n<=options.length) return n;
    return null;
}

/////////////////////////////
// Main Menu
/////////////////////////////
function mainMenu(){
    while(true){
        const n = menu("Main Menu",[
            "This Page",
            "Other Page",
            "Other Thing"
        ]);
        if(n===null) return;
        if(n===1) menuThis();
        if(n===2) menuOther();
        if(n===3) menuThing();
    }
}

/////////////////////////////
// This Page
/////////////////////////////
function menuThis(){
    while(true){
        const n = menu("This Page",[
            "Assets List",
            "Assets DL (準備中)"
        ]);
        if(n===null) return;
        if(n===1) listAssets();
        if(n===2) alert("次回実装");
    }
}

/////////////////////////////
// Other Page
/////////////////////////////
function menuOther(){
    while(true){
        const n = menu("Other Page",[
            "Assets DL[URL](準備中)",
            "Web See"
        ]);
        if(n===null) return;
        if(n===1) alert("次回実装");
        if(n===2) webSee();
    }
}

/////////////////////////////
// Other Thing
/////////////////////////////
function menuThing(){
    while(true){
        const n = menu("Other Thing",[
            "HTML Tool",
            "Mini Games"
        ]);
        if(n===null) return;
        if(n===1) openHTMLTool();
        if(n===2) menuGames();
    }
}

/////////////////////////////
// Assets Scanner
/////////////////////////////
function listAssets(){
    const exts=[
        ".html",".css",".js",".png",".jpg",".jpeg",".svg",
        ".mp3",".wav",".m4a",".mp4",".mov",".ttf",".otf"
    ];
    const set=new Set();

    document.querySelectorAll("*").forEach(el=>{
        ["src","href","poster"].forEach(a=>{
            const u=el[a];
            if(!u) return;
            const l=u.toLowerCase();
            exts.forEach(e=>{
                if(l.includes(e)) set.add(u);
            });
        });
    });

    if(!set.size){ alert("なし"); return; }

    const arr=[...set];
    while(true){
        let t="Assets List\n\n";
        arr.forEach((u,i)=>t+=(i+1)+": "+u+"\n");
        t+="\n番号入力でDL、キャンセル戻る";
        const s=prompt(t);
        if(s===null) return;
        const i=+s-1;
        if(arr[i]) window.open(arr[i]);
    }
}

/////////////////////////////
// Web See
/////////////////////////////
function webSee(){
    const url = prompt("URL 入力\nキャンセル→戻る");
    if(url===null) return;
    fetch(url)
    .then(r=>r.text())
    .then(html=>{
        const b=new Blob([html],{type:"text/html"});
        window.open(URL.createObjectURL(b),"_blank");
    })
    .catch(()=>{
        alert("失敗。再試行します");
        webSee();
    });
}

/////////////////////////////
// Mini Games Menu
/////////////////////////////
function menuGames(){
    while(true){
        const n = menu("Mini Games",[
            "Game 1: Tap Box",
            "Game 2: Avoider",
            "Game 3: Shooter",
            "Game 4: Memory",
            "Game 5: 2048"
        ]);
        if(n===null) return;
        openGame(n);
    }
}

/////////////////////////////
// HTML Tool
/////////////////////////////
function openHTMLTool(){
openBlobHTML(`
let wrap=document.createElement('div');
wrap.innerHTML=\`
<textarea id="ta" style="width:100%;height:80%;background:#111;color:#0f0;">
<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<title>My Page</title>
</head>
<body>
Hello!
</body>
</html>
</textarea>
<br>
<button id="runBtn">Run</button>
\`;
document.body.appendChild(wrap);

runBtn.onclick=()=>{
 let code=document.getElementById('ta').value;
 let b=new Blob([code],{type:'text/html'});
 window.open(URL.createObjectURL(b));
};
`);
}

/////////////////////////////
// Game Bodies
/////////////////////////////

function openGame(n){
    if(n===1) game1();
    if(n===2) game2();
    if(n===3) game3();
    if(n===4) game4();
    if(n===5) game5();
}

// 1: Tap Box
function game1(){
openBlobHTML(`
let box=document.createElement('div');
Object.assign(box.style,{
 position:'absolute',width:'60px',height:'60px',
 background:'red',borderRadius:'10px'
});
document.body.appendChild(box);
function move(){
 box.style.left=(Math.random()*(innerWidth-60))+'px';
 box.style.top=(Math.random()*(innerHeight-60))+'px';
}
move();
box.onclick=()=>{
 score++; move();
};
let score=0;
setInterval(()=>{
 document.title='Score:'+score;
},200);
`);
}

// 2: 避けゲー（簡易）
function game2(){
openBlobHTML(`
document.body.innerHTML='';
let player=document.createElement('div');
Object.assign(player.style,{
 position:'absolute',width:'40px',height:'40px',
 background:'cyan',left:'50%',top:'80%'
});
document.body.appendChild(player);

let speed=3,alive=true;
function spawn(){
 let e=document.createElement('div');
 Object.assign(e.style,{position:'absolute',width:'20px',height:'20px',background:'yellow'});
 e.style.left=Math.random()*(innerWidth-20)+'px';
 e.style.top='0px';
 document.body.appendChild(e);
 let int=setInterval(()=>{
  if(!alive){clearInterval(int);e.remove();return;}
  let y=parseFloat(e.style.top)+speed;
  e.style.top=y+'px';
  if(y>innerHeight-40){
   // check hit
   let px=parseFloat(player.style.left);
   let ex=parseFloat(e.style.left);
   if(Math.abs(px-ex)<40){
    alive=false;
    alert('GAME OVER');
   }
   clearInterval(int);
   e.remove();
  }
 },20);
}
setInterval(()=>spawn(),600);

document.addEventListener('mousemove',e=>{
 player.style.left=e.clientX+'px';
});
`);
}

// 3: Shooter（簡略）
function game3(){
openBlobHTML(`
document.body.innerHTML='';
let p=document.createElement('div');
Object.assign(p.style,{
 position:'absolute',width:'50px',height:'50px',
 background:'lime',bottom:'0px',left:'50%'
});
document.body.appendChild(p);

document.body.style.overflow='hidden';
let bullets=[];
document.addEventListener('click',()=>{
 let b=document.createElement('div');
 Object.assign(b.style,{position:'absolute',width:'5px',height:'20px',background:'white'});
 b.style.left=p.style.left;
 b.style.bottom='50px';
 bullets.push(b);
 document.body.appendChild(b);
});
setInterval(()=>{
 bullets.forEach((b,i)=>{
  b.style.bottom=(parseFloat(b.style.bottom)+8)+'px';
  if(parseFloat(b.style.bottom)>innerHeight){
   b.remove();bullets.splice(i,1);
  }
 });
},20);

document.addEventListener('mousemove',e=>{
 p.style.left=e.clientX+'px';
});
`);
}

// 4: Memory（簡易 4枚）
function game4(){
openBlobHTML(`
let vals=['A','A','B','B'];
vals.sort(()=>Math.random()-0.5);
let open=null,score=0;
vals.forEach((v,i)=>{
 let c=document.createElement('div');
 Object.assign(c.style,{display:'inline-block',
 width:'60px',height:'60px',margin:'10px',background:'#333',
 color:'#333',fontSize:'40px',textAlign:'center',lineHeight:'60px'});
 c.textContent=v;
 c.onclick=()=>{
  c.style.color='white';
  if(open===null){open={c,v};}
  else {
   if(open.v!==v){
    setTimeout(()=>{
      c.style.color='#333';
      open.c.style.color='#333';
      open=null;
    },600);
   } else {
    score++;
    open=null;
    if(score===2) alert('CLEAR!');
   }
  }
 };
 document.body.appendChild(c);
});
`);
}

// 5: 2048（ミニ）
function game5(){
openBlobHTML(`
document.body.innerHTML='<p style="padding:20px;">2048 Mini（次回強化）</p>';
`);
}

/////////////////////////////
// Start
/////////////////////////////
mainMenu();

})();
