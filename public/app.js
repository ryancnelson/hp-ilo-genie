const $=id=>document.getElementById(id),canvas=$('console'),ctx=canvas.getContext('2d');
let ws=null,drawVersion=0,mouseButtons=0,mousePosition={x:0,y:0};const held=new Set();
function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m));}
function connect(){
  release();if(ws)ws.close();ws=new WebSocket(`ws://${location.host}/console`);ws.binaryType='blob';const socket=ws;
  ws.onmessage=async e=>{
    if(ws!==socket)return;
    if(e.data instanceof Blob){const version=++drawVersion;const bitmap=await createImageBitmap(e.data);if(ws===socket&&version===drawVersion){if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}ctx.drawImage(bitmap,0,0);$('login').hidden=true;$('status').textContent=`Connected · ${canvas.width} × ${canvas.height}`;}bitmap.close();return;}
    const m=JSON.parse(e.data);if(m.t==='target')$('target').textContent=m.name;if(m.t==='status')$('status').textContent=m.message;
    if(m.t==='ready')$('status').textContent='Connected · '+m.name;
    if(m.t==='error'){$('status').textContent=m.message;$('error').textContent=m.message;$('login').hidden=false;}
  };
  ws.onclose=()=>{if(ws!==socket)return;$('status').textContent='Disconnected. Click Reconnect.';held.clear();};
  ws.onerror=()=>{if(ws===socket)$('status').textContent='Cannot reach the local console bridge.';};
}
$('reconnect').onclick=()=>connect();$('refresh').onclick=()=>send({t:'refresh'});$('signin').onclick=()=>{$('login').hidden=!$('login').hidden;};
$('login').onsubmit=async e=>{e.preventDefault();$('error').textContent='Signing in…';const form=new FormData(e.target);try{const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});e.target.elements.password.value='';const result=await r.json();if(!r.ok)throw Error(result.error);$('login').hidden=true;if(!ws||ws.readyState!==1)connect();}catch(err){$('error').textContent=err.message;}};
const hid={Enter:40,Escape:41,Backspace:42,Tab:43,Space:44,Minus:45,Equal:46,BracketLeft:47,BracketRight:48,Backslash:49,Semicolon:51,Quote:52,Backquote:53,Comma:54,Period:55,Slash:56,CapsLock:57,PrintScreen:70,ScrollLock:71,Pause:72,Insert:73,Home:74,PageUp:75,Delete:76,End:77,PageDown:78,ArrowRight:79,ArrowLeft:80,ArrowDown:81,ArrowUp:82,NumLock:83,NumpadDivide:84,NumpadMultiply:85,NumpadSubtract:86,NumpadAdd:87,NumpadEnter:88,Numpad0:98,NumpadDecimal:99,ControlLeft:224,ShiftLeft:225,AltLeft:226,MetaLeft:227,ControlRight:228,ShiftRight:229,AltRight:230,MetaRight:231};
for(let i=0;i<26;i++)hid['Key'+String.fromCharCode(65+i)]=4+i;
for(let i=1;i<=9;i++){hid['Digit'+i]=29+i;hid['Numpad'+i]=88+i;}hid.Digit0=39;
for(let i=1;i<=12;i++)hid['F'+i]=57+i;
canvas.addEventListener('keydown',e=>{const code=hid[e.code];if(code===undefined)return;e.preventDefault();if(!e.repeat){held.add(code);send({t:'key',keys:[...held]});}});
canvas.addEventListener('keyup',e=>{const code=hid[e.code];if(code===undefined)return;e.preventDefault();held.delete(code);send({t:'key',keys:[...held]});});
function release(){held.clear();send({t:'key',keys:[]});if(mouseButtons)send({t:'mouse',...mousePosition,buttons:0});mouseButtons=0;}
canvas.addEventListener('blur',release);window.addEventListener('blur',release);
canvas.addEventListener('focus',()=>{$('hint').textContent='Keyboard and mouse are connected to the server. Click outside the screen to release.';});
canvas.addEventListener('blur',()=>{$('hint').textContent='Click the screen to send keyboard and mouse input. Click outside it to release.';});
function mouse(e){if(document.activeElement!==canvas)return;const rect=canvas.getBoundingClientRect();mousePosition={x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};send({t:'mouse',...mousePosition,buttons:mouseButtons});}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);mouseButtons|=e.button===0?1:e.button===2?2:4;mouse(e);});
canvas.addEventListener('pointerup',e=>{mouseButtons&=~(e.button===0?1:e.button===2?2:4);mouse(e);});
canvas.addEventListener('pointermove',mouse);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointercancel',release);
connect();
