/* ═══════════════════════════════════════════════════════════════
   MULTIPLAYER PSYCH — Client Engine
   ARCADE LAB © 2025
═══════════════════════════════════════════════════════════════ */
(function(){ 'use strict';

/* ── WS URL auto-detect ── */
const WS_URL = (location.protocol==='https:'?'wss:':'ws:')+'//'+location.host;

/* ── State ── */
let ws=null, myId=null, myColor='#00F5FF', roomCode=null, isHost=false;
let players={}, myName='', latency=50;
let pingT=0, pingInterval=null;

/* ── Audio ── */
let AC=null;
function initAudio(){ if(AC)return; try{ AC=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
function sfx(type,vol=0.3){
  if(!AC)return;
  const o=AC.createOscillator(),g=AC.createGain();
  o.connect(g);g.connect(AC.destination);
  const P={
    click:['sine',[440,220],0.08,0.15], perfect:['sine',[880,1320],0.3,0.3],
    great:['sine',[660,880],0.22,0.25], miss:['square',[220,55],0.2,0.3],
    coop:['triangle',[440,660],0.22,0.3], defect:['sawtooth',[330,110],0.2,0.3],
    reveal:['sine',[220,880],0.25,0.5], hit:['sine',[660,1320],0.28,0.2],
    join:['sine',[330,660],0.18,0.25], start:['sawtooth',[220,880],0.28,0.5],
    ticker:['sine',[800,800],0.06,0.08],
  };
  const[tp,fr,v,dur]=P[type]||['sine',[440,440],0.1,0.2];
  o.type=tp;
  o.frequency.setValueAtTime(fr[0],AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(1,fr[1]),AC.currentTime+dur);
  g.gain.setValueAtTime(v*vol,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur+0.04);
  o.start(AC.currentTime);o.stop(AC.currentTime+dur+0.08);
}

/* ── Neural Network BG ── */
const bgC=document.getElementById('bg-canvas');
const bgX=bgC.getContext('2d');
let W=0,H=0,nodes=[],bgParts=[];

function resizeBG(){
  W=bgC.width=window.innerWidth;H=bgC.height=window.innerHeight;
  initNodes();
}
function initNodes(){
  nodes=Array.from({length:38},()=>({
    x:Math.random()*W,y:Math.random()*H,
    vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,
    r:Math.random()*3+1.5,pulse:0,pulsing:false,
    color:'#00F5FF',opacity:Math.random()*0.4+0.1,
  }));
}
function pulseNodes(color,count=5){
  const idx=[...nodes.keys()].sort(()=>Math.random()-0.5).slice(0,count);
  idx.forEach(i=>{ nodes[i].pulse=1; nodes[i].pulsing=true; nodes[i].color=color; });
}
function spawnBGParticle(x,y,color){
  for(let i=0;i<6;i++){
    const a=Math.random()*Math.PI*2,s=Math.random()*80+30;
    bgParts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.8,max:0.8,color,sz:Math.random()*3+1});
  }
}
let bgPhase=0;
function drawBG(dt){
  bgX.clearRect(0,0,W,H);
  const g=bgX.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#020208');g.addColorStop(1,'#06061C');
  bgX.fillStyle=g;bgX.fillRect(0,0,W,H);

  // Animated grid
  bgPhase+=dt*0.3;
  bgX.strokeStyle=`rgba(0,245,255,${0.018+0.006*Math.sin(bgPhase)})`;
  bgX.lineWidth=1;
  for(let gx=0;gx<W;gx+=70){bgX.beginPath();bgX.moveTo(gx,0);bgX.lineTo(gx,H);bgX.stroke();}
  for(let gy=0;gy<H;gy+=70){bgX.beginPath();bgX.moveTo(0,gy);bgX.lineTo(W,gy);bgX.stroke();}

  // Update nodes
  for(const n of nodes){
    n.x+=n.vx;n.y+=n.vy;
    if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;
    if(n.pulsing){n.pulse-=dt*3;if(n.pulse<=0){n.pulse=0;n.pulsing=false;}}
  }

  // Draw connections
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<160){
        const a=(1-d/160)*0.12;
        bgX.strokeStyle=`rgba(0,245,255,${a})`;bgX.lineWidth=0.5;
        bgX.beginPath();bgX.moveTo(nodes[i].x,nodes[i].y);bgX.lineTo(nodes[j].x,nodes[j].y);bgX.stroke();
      }
    }
  }

  // Draw nodes
  for(const n of nodes){
    const extra=n.pulse*12;
    if(n.pulse>0){
      const rg=bgX.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*4+extra);
      rg.addColorStop(0,n.color+'66');rg.addColorStop(1,'transparent');
      bgX.fillStyle=rg;bgX.beginPath();bgX.arc(n.x,n.y,n.r*4+extra,0,Math.PI*2);bgX.fill();
    }
    bgX.fillStyle=`rgba(0,245,255,${n.opacity+n.pulse*0.5})`;
    bgX.beginPath();bgX.arc(n.x,n.y,n.r+extra*0.3,0,Math.PI*2);bgX.fill();
  }

  // BG particles
  bgX.save();
  for(let i=bgParts.length-1;i>=0;i--){
    const p=bgParts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
    if(p.life<=0){bgParts.splice(i,1);continue;}
    const a=p.life/p.max;bgX.globalAlpha=a;bgX.fillStyle=p.color;
    bgX.beginPath();bgX.arc(p.x,p.y,p.sz*a,0,Math.PI*2);bgX.fill();
  }
  bgX.restore();

  // Horizon beam
  const by=((Date.now()*0.0003)%1)*H;
  const bgg=bgX.createLinearGradient(0,by-30,0,by+30);
  bgg.addColorStop(0,'transparent');bgg.addColorStop(0.5,'rgba(0,245,255,0.03)');bgg.addColorStop(1,'transparent');
  bgX.fillStyle=bgg;bgX.fillRect(0,by-30,W,60);
}

/* ── Screen Management ── */
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  const el=document.getElementById(id);
  if(el)el.classList.remove('hidden');
}

/* ── Notification ── */
let notifTimer=null;
function notify(msg,color='#00F5FF'){
  const el=document.getElementById('notif');
  el.textContent=msg;el.style.color=color;
  el.style.borderColor=color+'66';
  el.classList.remove('hidden');
  if(notifTimer)clearTimeout(notifTimer);
  notifTimer=setTimeout(()=>el.classList.add('hidden'),2400);
}

/* ── WebSocket ── */
function connect(){
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>{
    pingInterval=setInterval(()=>{
      pingT=Date.now();
      send({type:'PING',t:pingT});
    },3000);
  };
  ws.onmessage=e=>{ try{ onMsg(JSON.parse(e.data)); }catch(ex){console.warn(ex);} };
  ws.onclose=()=>{ clearInterval(pingInterval); if(myId) notify('CONNECTION LOST','#FF4444'); };
  ws.onerror=()=>notify('NETWORK ERROR','#FF4444');
}
function send(obj){ if(ws&&ws.readyState===1) ws.send(JSON.stringify(obj)); }

/* ── Message Handler ── */
function onMsg(m){
  switch(m.type){
    case 'PONG': latency=Math.round((Date.now()-m.t)/2); break;
    case 'JOINED':   onJoined(m); break;
    case 'LOBBY_UPDATE': onLobbyUpdate(m.players); break;
    case 'ERR':      showErr(m.msg); break;
    case 'GAME_START': onGameStart(m); break;
    case 'MODE_INTRO': onModeIntro(m); break;
    case 'SYNC_ROUND': onSyncRound(m); break;
    case 'SYNC_CLICK_INDICATOR': onSyncClickIndicator(m); break;
    case 'SYNC_RESULT': onSyncResult(m); break;
    case 'TRUST_ROUND': onTrustRound(m); break;
    case 'TRUST_PROGRESS': onTrustProgress(m); break;
    case 'TRUST_RESULT': onTrustResult(m); break;
    case 'HIVE_START': onHiveStart(m); break;
    case 'HIVE_TICK': onHiveTick(m); break;
    case 'HIVE_HIT': onHiveHit(m); break;
    case 'HIVE_END': onHiveEnd(m); break;
    case 'MODE_END': onModeEnd(m); break;
    case 'GAME_END': onGameEnd(m); break;
    case 'HOST_LEFT': onHostLeft(); break;
  }
}

/* ── JOIN ── */
function onJoined(m){
  myId=m.pid; myColor=m.color; roomCode=m.code; isHost=m.isHost;
  players={};
  m.players.forEach(p=>{players[p.id]=p;});
  document.getElementById('room-code').textContent=m.code;
  document.getElementById('btn-start').classList.toggle('hidden',!isHost);
  onLobbyUpdate(m.players);
  show('s-lobby');
  sfx('join');
  if(isHost) notify('YOU ARE HOST — SHARE CODE: '+m.code);
}

function onLobbyUpdate(list){
  players={};
  list.forEach(p=>players[p.id]=p);
  const grid=document.getElementById('player-grid');
  grid.innerHTML='';
  list.forEach(p=>{
    const card=document.createElement('div');
    card.className='player-card'+(p.id===myId?' me':'');
    card.innerHTML=`<div class="pc-dot" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></div>
      <div><div class="pc-name">${esc(p.name)}</div>${list[0]&&list[0].id===p.id?'<div class="pc-host">HOST</div>':''}</div>`;
    grid.appendChild(card);
  });
  document.getElementById('lobby-count').textContent=list.length+' / 8 OPERATIVES';
  document.getElementById('btn-start').classList.toggle('hidden',!isHost);
  sfx('join',0.15);
  pulseNodes(myColor,3);
}

function showErr(msg){
  const el=document.getElementById('conn-err');
  el.textContent=msg;el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),3000);
}

/* ── GAME START ── */
function onGameStart(m){ sfx('start'); pulseNodes('#C7FF4D',8); }

/* ── MODE INTRO ── */
function onModeIntro(m){
  show('s-intro');
  const COLORS_MAP={SYNC_PULSE:'#00F5FF',TRUST_PROTOCOL:'#FF2DA6',HIVE_MIND:'#7A5CFF'};
  const mc=COLORS_MAP[m.mode]||'#00F5FF';
  document.getElementById('intro-idx').textContent=String(m.modeIdx+1).padStart(2,'0')+' / '+String(m.total).padStart(2,'0');
  document.getElementById('intro-name').textContent=m.info.name;
  document.getElementById('intro-desc').textContent=m.info.desc;
  const bar=document.getElementById('intro-bar');bar.style.width='0%';
  document.getElementById('intro-name').style.background=`linear-gradient(135deg,${mc},var(--purple))`;
  document.getElementById('intro-name').style.webkitBackgroundClip='text';
  document.getElementById('intro-name').style.webkitTextFillColor='transparent';
  pulseNodes(mc,10);
  // Animate bar over 3.5 seconds
  let pct=0;
  const iv=setInterval(()=>{pct+=100/35;bar.style.width=Math.min(pct,100)+'%';if(pct>=100)clearInterval(iv);},100);
}

/* ════════════════════════════════════════════════
   SYNC PULSE
════════════════════════════════════════════════ */
let syncCanvas,syncCtx,syncRAF,syncState={};

function initSyncCanvas(){
  syncCanvas=document.getElementById('sync-canvas');
  syncCtx=syncCanvas.getContext('2d');
  function resizeSync(){
    const wrap=syncCanvas.parentElement;
    const sz=Math.min(wrap.clientWidth,wrap.clientHeight,520);
    syncCanvas.width=syncCanvas.height=sz;
  }
  resizeSync();window.addEventListener('resize',resizeSync);
  syncCanvas.addEventListener('click',doSyncClick);
  syncCanvas.addEventListener('touchstart',e=>{e.preventDefault();doSyncClick();},{passive:false});
}

function onSyncRound(m){
  show('s-sync');
  if(!syncCtx)initSyncCanvas();
  cancelAnimationFrame(syncRAF);
  document.getElementById('sync-round-disp').textContent=String(m.round).padStart(2,'0')+' / '+String(m.total).padStart(2,'0');
  document.getElementById('sync-msg').textContent='CLICK WHEN PULSE HITS THE RING';
  document.getElementById('sync-result-pop').classList.add('hidden');
  document.getElementById('click-rings').innerHTML='';

  const sz=syncCanvas.width;
  const cx=sz/2,cy=sz/2;
  const maxR=sz*0.46;
  const targetR=maxR*(m.targetMs/m.duration);
  const startT=performance.now();

  syncState={
    cx,cy,maxR,targetR,duration:m.duration,startT,
    pulsePct:0,clicked:false,done:false,
    color:'#00F5FF',
  };

  function frame(now){
    if(syncState.done){drawSyncIdle();return;}
    const elapsed=now-startT;
    syncState.pulsePct=Math.min(elapsed/m.duration,1);
    drawSyncFrame();
    syncRAF=requestAnimationFrame(frame);
  }
  syncRAF=requestAnimationFrame(frame);
}

function drawSyncIdle(){
  if(!syncCtx)return;
  const{cx,cy,sz}={cx:syncCanvas.width/2,cy:syncCanvas.height/2,sz:syncCanvas.width};
  syncCtx.clearRect(0,0,syncCanvas.width,syncCanvas.height);
  syncCtx.fillStyle='#04041A';syncCtx.fillRect(0,0,syncCanvas.width,syncCanvas.height);
}

function drawSyncFrame(){
  const c=syncCtx,{cx,cy,maxR,targetR,pulsePct,clicked,color}=syncState;
  const sz=syncCanvas.width;
  c.clearRect(0,0,sz,sz);

  // BG
  c.fillStyle='#04041A';c.fillRect(0,0,sz,sz);
  // Grid
  c.strokeStyle='rgba(0,245,255,0.05)';c.lineWidth=1;
  for(let x=0;x<sz;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,sz);c.stroke();}
  for(let y=0;y<sz;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(sz,y);c.stroke();}

  // Target ring
  const tPulse=0.5+0.5*Math.sin(Date.now()*0.004);
  c.strokeStyle=`rgba(255,45,166,${0.5+tPulse*0.3})`;c.lineWidth=3;
  c.shadowColor='#FF2DA6';c.shadowBlur=tPulse*20;
  c.beginPath();c.arc(cx,cy,targetR,0,Math.PI*2);c.stroke();
  c.shadowBlur=0;
  // Target zone fill
  c.strokeStyle=`rgba(255,45,166,0.08)`;c.lineWidth=20;
  c.beginPath();c.arc(cx,cy,targetR,0,Math.PI*2);c.stroke();

  // Expanding pulse ring
  const pulseR=pulsePct*maxR;
  const nearTarget=Math.abs(pulseR-targetR)<targetR*0.12;
  const pulseColor=nearTarget?'#C7FF4D':color;
  const glow=nearTarget?30:8;
  c.shadowColor=pulseColor;c.shadowBlur=glow;
  c.strokeStyle=pulseColor;c.lineWidth=nearTarget?4:2.5;
  c.globalAlpha=1-pulsePct*0.3;
  c.beginPath();c.arc(cx,cy,pulseR,0,Math.PI*2);c.stroke();
  c.globalAlpha=1;c.shadowBlur=0;

  // Trailing rings
  for(let i=1;i<=3;i++){
    const tr=pulseR-i*18;if(tr<0)continue;
    c.strokeStyle=`rgba(0,245,255,${0.08-i*0.02})`;c.lineWidth=1;
    c.beginPath();c.arc(cx,cy,tr,0,Math.PI*2);c.stroke();
  }

  // Center dot
  const cgrd=c.createRadialGradient(cx,cy,0,cx,cy,20);
  cgrd.addColorStop(0,'rgba(0,245,255,0.8)');cgrd.addColorStop(1,'transparent');
  c.fillStyle=cgrd;c.beginPath();c.arc(cx,cy,20,0,Math.PI*2);c.fill();
  c.fillStyle='#fff';c.beginPath();c.arc(cx,cy,4,0,Math.PI*2);c.fill();

  // "CLICK!" ripple when clicked
  if(clicked){
    const t=(Date.now()-syncState.clickedAt)/300;
    if(t<1){
      c.strokeStyle=`rgba(199,255,77,${1-t})`;c.lineWidth=3;
      c.beginPath();c.arc(cx,cy,20+t*80,0,Math.PI*2);c.stroke();
    }
  }
}

function doSyncClick(){
  if(syncState.clicked||syncState.done)return;
  sfx('click');
  syncState.clicked=true;syncState.clickedAt=Date.now();
  send({type:'SYNC_CLICK',latency});
  // Visual click ring
  const sz=syncCanvas.width;
  const cr=document.getElementById('click-rings');
  const div=document.createElement('div');
  const rect=syncCanvas.getBoundingClientRect();
  div.className='cr-item';
  div.style.cssText=`left:${rect.left+sz/2}px;top:${rect.top+sz/2}px;width:60px;height:60px;border:2px solid ${myColor};`;
  cr.appendChild(div);
  setTimeout(()=>div.remove(),800);
}

function onSyncClickIndicator(m){
  const p=players[m.id];if(!p)return;
  const cr=document.getElementById('click-rings');
  const div=document.createElement('div');
  const rect=syncCanvas.getBoundingClientRect();
  const sz=syncCanvas.width;
  div.className='cr-item';
  div.style.cssText=`left:${rect.left+sz/2+Math.random()*30-15}px;top:${rect.top+sz/2+Math.random()*30-15}px;width:40px;height:40px;border:2px solid ${m.color};`;
  cr.appendChild(div);
  setTimeout(()=>div.remove(),700);
  spawnBGParticle(W/2,H/2,m.color);
}

function onSyncResult(m){
  cancelAnimationFrame(syncRAF);syncState.done=true;
  const r=m.results[myId];
  if(!r){return;}
  const labels={PERFECT:'#C7FF4D',GREAT:'#00F5FF',GOOD:'#7A5CFF',LATE:'#FF8800',MISS:'#FF4444',MISSED:'#FF4444'};
  const el=document.getElementById('sync-result-pop');
  el.textContent=r.label+(r.delta!=null?' +'+r.delta+'ms':'');
  el.style.color=labels[r.label]||'#fff';
  el.style.textShadow=`0 0 20px ${labels[r.label]||'#fff'}`;
  el.classList.remove('hidden');

  if(r.label==='PERFECT')sfx('perfect');
  else if(r.label==='GREAT')sfx('great');
  else sfx('miss');

  updateSyncScores(m.players);
  pulseNodes(labels[r.label]||'#00F5FF',4);
}

function updateSyncScores(list){
  const el=document.getElementById('sync-scores');el.innerHTML='';
  [...list].sort((a,b)=>b.score-a.score).slice(0,5).forEach(p=>{
    const row=document.createElement('div');row.className='sc-row';
    row.innerHTML=`<span class="sc-dot" style="background:${p.color}"></span><span class="sc-name">${esc(p.name).slice(0,8)}</span><span class="sc-pts">${p.score}</span>`;
    el.appendChild(row);
  });
}

/* ════════════════════════════════════════════════
   TRUST PROTOCOL
════════════════════════════════════════════════ */
let trustTimer=null,trustTotalSecs=22,trustChosen=false;

function onTrustRound(m){
  show('s-trust');
  trustChosen=false;trustTotalSecs=m.timeLimit/1000;
  document.getElementById('trust-round-disp').textContent=String(m.round).padStart(2,'0')+' / '+String(m.total).padStart(2,'0');
  document.getElementById('trust-status').textContent='MAKE YOUR CHOICE';
  document.getElementById('trust-chosen').textContent='0 / '+Object.keys(players).length;
  document.getElementById('trust-reveal').classList.add('hidden');
  document.getElementById('trust-choice-panel').style.display='';
  [document.getElementById('btn-coop'),document.getElementById('btn-def')].forEach(b=>{
    b.classList.remove('selected','locked');
  });

  // History
  const hw=document.getElementById('trust-history-wrap');hw.innerHTML='';
  (m.history||[]).forEach(h=>{
    const c=document.createElement('div');c.className='th-card';
    c.innerHTML=`<div class="th-r">ROUND ${h.round}</div><div class="th-nums"><span style="color:#00F5FF">🤝${h.coops}</span> <span style="color:#FF2DA6">⚔️${h.defs}</span></div>`;
    hw.appendChild(c);
  });

  // Timer ring
  startTrustTimer(m.timeLimit/1000);
  pulseNodes('#FF2DA6',5);
}

function startTrustTimer(secs){
  clearInterval(trustTimer);
  let remaining=secs;
  const arc=document.getElementById('tr-arc');
  const circumference=214;
  function tick(){
    remaining=Math.max(0,remaining-1);
    document.getElementById('trust-secs').textContent=Math.ceil(remaining);
    const pct=remaining/secs;
    arc.style.strokeDashoffset=circumference*(1-pct);
    arc.style.stroke=remaining<6?'#FF2DA6':remaining<12?'#FF8800':'#00F5FF';
    if(remaining<=0){clearInterval(trustTimer);sfx('ticker');}
    else if(remaining<=5)sfx('ticker',0.08);
  }
  tick();
  trustTimer=setInterval(tick,1000);
}

function onTrustChoice(choice){
  if(trustChosen)return;
  trustChosen=true;
  clearInterval(trustTimer);
  sfx(choice==='cooperate'?'coop':'defect');
  const sel=choice==='cooperate'?'btn-coop':'btn-def';
  const oth=choice==='cooperate'?'btn-def':'btn-coop';
  document.getElementById(sel).classList.add('selected');
  document.getElementById(oth).classList.add('locked');
  document.getElementById('trust-status').textContent='CHOICE LOCKED — WAITING FOR OTHERS';
  send({type:'TRUST_CHOICE',choice});
  pulseNodes(choice==='cooperate'?'#00F5FF':'#FF2DA6',4);
}

function onTrustProgress(m){
  document.getElementById('trust-chosen').textContent=m.chosen+' / '+m.total;
}

function onTrustResult(m){
  clearInterval(trustTimer);
  const reveal=document.getElementById('trust-reveal');
  document.getElementById('trust-choice-panel').style.display='none';
  reveal.classList.remove('hidden');

  const myR=m.results[myId];
  const outColors={COLLECTIVE_WIN:'#C7FF4D',EXPLOITER:'#FF8800',EXPLOITED:'#FF4444',MUTUAL_DEFECT:'#FF2DA6'};
  const outLabels={COLLECTIVE_WIN:'COLLECTIVE WIN',EXPLOITER:'YOU EXPLOITED OTHERS',EXPLOITED:'YOU WERE EXPLOITED',MUTUAL_DEFECT:'MUTUAL DEFECT — ALL LOST'};
  const oc=outColors[myR?.outcome]||'#00F5FF';

  let pHTML=`<div class="tr-headline" style="color:${oc};">${outLabels[myR?.outcome]||'RESULT'}</div><div class="tr-players">`;
  Object.entries(m.results).forEach(([id,r])=>{
    const p=players[id];if(!p)return;
    const cc=r.choice==='cooperate'?'#00F5FF':'#FF2DA6';
    const lbl=r.choice==='cooperate'?'🤝 COOPERATE':'⚔️ DEFECT';
    pHTML+=`<div class="tr-player"><div class="tr-p-dot" style="background:${p.color}"></div><div class="tr-p-name">${esc(p.name)}</div><div class="tr-p-choice" style="color:${cc}">${lbl}</div></div>`;
  });
  pHTML+=`</div>`;
  if(m.insight){
    pHTML+=`<div class="tr-insight"><div class="tr-i-tag" style="color:${oc}">${m.insight.tag}</div><div class="tr-i-text">${m.insight.text}</div></div>`;
  }
  reveal.innerHTML=pHTML;

  if(myR?.outcome==='COLLECTIVE_WIN')sfx('reveal');
  else if(myR?.outcome==='EXPLOITED')sfx('miss');
  else sfx('defect',0.4);
  pulseNodes(oc,6);
}

/* ════════════════════════════════════════════════
   HIVE MIND
════════════════════════════════════════════════ */
let hiveCanvas2,hiveCtx2,hiveRAF;
let hiveState={cx:0.5,cy:0.5,targets:[],trail:[],hitEffects:[],timeLeft:60};
let hiveKeys={up:false,down:false,left:false,right:false};
let hiveInputInterval=null;

function onHiveStart(m){
  show('s-hive');
  hiveCanvas2=document.getElementById('hive-canvas');
  hiveCtx2=hiveCanvas2.getContext('2d');
  hiveCanvas2.width=window.innerWidth;hiveCanvas2.height=window.innerHeight;
  window.addEventListener('resize',()=>{hiveCanvas2.width=window.innerWidth;hiveCanvas2.height=window.innerHeight;});

  hiveState={cx:m.cursor.x,cy:m.cursor.y,targets:[...m.targets.map(t=>({...t,hit:false,hitAnim:0}))],
    trail:[],hitEffects:[],timeLeft:m.duration/1000,inputs:{}};

  document.getElementById('hive-target-disp').textContent='0 / '+m.targets.length;
  document.getElementById('hive-clock').textContent='60';
  document.getElementById('hive-sync-fill').style.width='0%';

  cancelAnimationFrame(hiveRAF);
  function hiveFrame(){drawHive();hiveRAF=requestAnimationFrame(hiveFrame);}
  hiveRAF=requestAnimationFrame(hiveFrame);

  // Send input at 20fps
  hiveInputInterval=setInterval(()=>{
    const dx=(hiveKeys.right?1:0)-(hiveKeys.left?1:0);
    const dy=(hiveKeys.down?1:0)-(hiveKeys.up?1:0);
    send({type:'HIVE_INPUT',dx,dy});
  },50);
  pulseNodes('#7A5CFF',8);
}

function drawHive(){
  const c=hiveCtx2;
  const cw=hiveCanvas2.width,ch=hiveCanvas2.height;
  c.clearRect(0,0,cw,ch);

  // Grid bg
  c.fillStyle='#03030F';c.fillRect(0,0,cw,ch);
  c.strokeStyle='rgba(122,92,255,0.08)';c.lineWidth=1;
  for(let x=0;x<cw;x+=55){c.beginPath();c.moveTo(x,0);c.lineTo(x,ch);c.stroke();}
  for(let y=0;y<ch;y+=55){c.beginPath();c.moveTo(0,y);c.lineTo(cw,y);c.stroke();}

  const px=hiveState.cx*cw, py=hiveState.cy*ch;

  // Trail
  hiveState.trail.push({x:px,y:py,t:Date.now()});
  if(hiveState.trail.length>60)hiveState.trail.shift();
  const now=Date.now();
  for(let i=0;i<hiveState.trail.length;i++){
    const tp=hiveState.trail[i],age=(now-tp.t)/1000;if(age>1.2)continue;
    const a=(1-age/1.2)*0.4,sz=(1-age/1.2)*10;
    c.fillStyle=`rgba(122,92,255,${a})`;
    c.beginPath();c.arc(tp.x,tp.y,sz,0,Math.PI*2);c.fill();
  }

  // Hit effects
  for(let i=hiveState.hitEffects.length-1;i>=0;i--){
    const ef=hiveState.hitEffects[i];ef.age+=0.035;
    if(ef.age>=1){hiveState.hitEffects.splice(i,1);continue;}
    const a=1-ef.age,r=ef.age*80;
    c.strokeStyle=`rgba(199,255,77,${a*0.8})`;c.lineWidth=2.5;
    c.shadowColor='#C7FF4D';c.shadowBlur=a*20;
    c.beginPath();c.arc(ef.x*cw,ef.y*ch,r,0,Math.PI*2);c.stroke();
    c.shadowBlur=0;
  }

  // Targets
  for(const t of hiveState.targets){
    if(t.hit)continue;
    const tx=t.x*cw,ty=t.y*ch;
    const pulse=0.5+0.5*Math.sin(Date.now()*0.003+t.id);
    // Outer aura
    const ag=c.createRadialGradient(tx,ty,0,tx,ty,50);
    ag.addColorStop(0,`rgba(199,255,77,${0.08*pulse})`);ag.addColorStop(1,'transparent');
    c.fillStyle=ag;c.beginPath();c.arc(tx,ty,50,0,Math.PI*2);c.fill();
    // Ring
    c.strokeStyle=`rgba(199,255,77,${0.5+pulse*0.4})`;c.lineWidth=2.5;
    c.shadowColor='#C7FF4D';c.shadowBlur=pulse*16;
    c.beginPath();c.arc(tx,ty,22,0,Math.PI*2);c.stroke();
    c.shadowBlur=0;
    // Inner dot
    c.fillStyle=`rgba(199,255,77,${0.5+pulse*0.3})`;
    c.beginPath();c.arc(tx,ty,5,0,Math.PI*2);c.fill();
    // Target ID
    c.fillStyle=`rgba(255,255,255,0.3)`;c.font='10px Orbitron';
    c.textAlign='center';c.fillText(String(t.id+1).padStart(2,'0'),tx,ty-30);
  }

  // Player input arrows
  const PIDS=Object.keys(hiveState.inputs||{});
  PIDS.forEach((pid,i)=>{
    const inp=hiveState.inputs[pid];const p=players[pid];if(!p)return;
    if(inp.dx===0&&inp.dy===0)return;
    const ang=Math.atan2(inp.dy,inp.dx);
    const ax=px+Math.cos(ang)*50,ay=py+Math.sin(ang)*50;
    c.strokeStyle=p.color;c.lineWidth=2;c.globalAlpha=0.55;
    c.shadowColor=p.color;c.shadowBlur=8;
    c.beginPath();c.moveTo(px,py);c.lineTo(ax,ay);c.stroke();
    // Arrowhead
    c.beginPath();
    c.moveTo(ax,ay);
    c.lineTo(ax-Math.cos(ang-0.4)*12,ay-Math.sin(ang-0.4)*12);
    c.lineTo(ax-Math.cos(ang+0.4)*12,ay-Math.sin(ang+0.4)*12);
    c.closePath();c.fillStyle=p.color;c.fill();
    c.globalAlpha=1;c.shadowBlur=0;
  });

  // Cursor orb
  const cg=c.createRadialGradient(px,py,0,px,py,40);
  cg.addColorStop(0,'rgba(122,92,255,0.4)');cg.addColorStop(0.5,'rgba(0,245,255,0.15)');cg.addColorStop(1,'transparent');
  c.fillStyle=cg;c.beginPath();c.arc(px,py,40,0,Math.PI*2);c.fill();

  c.strokeStyle='rgba(0,245,255,0.8)';c.lineWidth=2.5;
  c.shadowColor='#00F5FF';c.shadowBlur=20;
  c.beginPath();c.arc(px,py,18,0,Math.PI*2);c.stroke();
  c.shadowBlur=0;

  const gg=c.createRadialGradient(px-5,py-5,0,px,py,18);
  gg.addColorStop(0,'rgba(255,255,255,0.9)');gg.addColorStop(0.4,'rgba(0,245,255,0.7)');gg.addColorStop(1,'rgba(122,92,255,0.3)');
  c.fillStyle=gg;c.beginPath();c.arc(px,py,18,0,Math.PI*2);c.fill();

  // HUD sync level
  const activeInputs=Object.values(hiveState.inputs||{}).filter(i=>Math.abs(i.dx)>0.1||Math.abs(i.dy)>0.1).length;
  const totalPl=Math.max(1,Object.keys(players).length);
  const syncPct=Math.round(activeInputs/totalPl*100);
  document.getElementById('hive-sync-fill').style.width=syncPct+'%';
  document.getElementById('hive-input-count').textContent=activeInputs+' PUSHING';
}

function onHiveTick(m){
  hiveState.cx=m.cx;hiveState.cy=m.cy;
  hiveState.inputs=m.inputs||{};
  if(m.timeLeft!==undefined){
    const secs=Math.ceil(m.timeLeft/1000);
    document.getElementById('hive-clock').textContent=String(secs).padStart(2,'0');
    if(secs<=10)document.getElementById('hive-clock').style.color='#FF2DA6';
    else document.getElementById('hive-clock').style.color='#00F5FF';
  }
}

function onHiveHit(m){
  const t=hiveState.targets.find(t=>t.id===m.targetId);
  if(t){t.hit=true;hiveState.hitEffects.push({x:t.x,y:t.y,age:0});}
  document.getElementById('hive-target-disp').textContent=m.hitCount+' / '+m.total;
  sfx('hit');pulseNodes('#C7FF4D',5);
  notify('TARGET '+m.hitCount+' REACHED!','#C7FF4D');
}

function onHiveEnd(m){
  clearInterval(hiveInputInterval);
  cancelAnimationFrame(hiveRAF);
  notify('HIVE COMPLETE — '+m.hitCount+'/'+m.total+' TARGETS','#C7FF4D');
}

/* ════════════════════════════════════════════════
   MODE END + FINAL RESULTS
════════════════════════════════════════════════ */
function onModeEnd(m){
  show('s-mode-end');
  const NAMES={SYNC_PULSE:'SYNC PULSE',TRUST_PROTOCOL:'TRUST PROTOCOL',HIVE_MIND:'HIVE MIND'};
  document.getElementById('me-title').textContent=NAMES[m.mode]||m.mode;
  const list=document.getElementById('me-scores');list.innerHTML='';
  const sorted=[...m.players].sort((a,b)=>b.score-a.score);
  sorted.forEach((p,i)=>{
    const row=document.createElement('div');row.className='me-row';
    row.innerHTML=`<div class="me-rank ${i===0?'gold':i===1?'silver':''}">${i===0?'#1':i===1?'#2':'#'+(i+1)}</div>
      <div class="me-dot" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></div>
      <div class="me-name">${esc(p.name)}</div>
      <div class="me-pts">${p.score}</div>`;
    list.appendChild(row);
  });
  pulseNodes('#00F5FF',8);
}

function onGameEnd(m){
  show('s-results');
  const grid=document.getElementById('results-grid');grid.innerHTML='';
  const sorted=[...m.players].sort((a,b)=>b.score-a.score);
  sorted.forEach((p,rank)=>{
    const prof=m.profiles[p.id]||{archetype:'UNKNOWN',trait:'',color:'#00F5FF'};
    const card=document.createElement('div');
    card.className='result-card';
    card.style.setProperty('--card-color',prof.color);
    card.innerHTML=`
      ${rank===0?'<div class="winner-badge">WINNER</div>':''}
      <div class="rc-rank">${['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH'][rank]||rank+1}</div>
      <div class="rc-name"><div class="rc-name-dot" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></div>${esc(p.name)}${p.id===myId?' (YOU)':''}</div>
      <div class="rc-archetype">${prof.archetype}</div>
      <div class="rc-trait">${prof.trait}</div>
      <div class="rc-score">${p.score}</div>
      <div class="rc-score-lbl">QUANTUM SCORE</div>`;
    grid.appendChild(card);
  });
  document.getElementById('btn-again').classList.toggle('hidden',!isHost);
  pulseNodes('#C7FF4D',12);sfx('reveal');
}

function onHostLeft(){
  clearInterval(hiveInputInterval);
  cancelAnimationFrame(syncRAF);cancelAnimationFrame(hiveRAF);
  clearInterval(trustTimer);
  const b=document.getElementById('host-left-banner');b.classList.remove('hidden');
  setTimeout(()=>{
    b.classList.add('hidden');
    // Rejoin lobby state
    isHost=[...Object.keys(players)][0]===myId;
    show('s-lobby');
    document.getElementById('btn-start').classList.toggle('hidden',!isHost);
  },2500);
}

/* ── Input: Hive keys ── */
function setupHiveKeys(){
  const MAP={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
  window.addEventListener('keydown',e=>{
    if(MAP[e.code]){hiveKeys[MAP[e.code]]=true;e.preventDefault();updateDpadVisual();}
  });
  window.addEventListener('keyup',e=>{
    if(MAP[e.code]){hiveKeys[MAP[e.code]]=false;updateDpadVisual();}
  });
  // D-pad buttons
  const btns=document.querySelectorAll('.dpad-btn');
  btns.forEach(btn=>{
    const dx=parseFloat(btn.dataset.dx),dy=parseFloat(btn.dataset.dy);
    const dir=dy<0?'up':dy>0?'down':dx<0?'left':'right';
    ['mousedown','touchstart'].forEach(ev=>btn.addEventListener(ev,e=>{e.preventDefault();hiveKeys[dir]=true;btn.classList.add('pressed');},{passive:false}));
    ['mouseup','touchend','mouseleave'].forEach(ev=>btn.addEventListener(ev,()=>{hiveKeys[dir]=false;btn.classList.remove('pressed');}));
  });
}
function updateDpadVisual(){
  const M={up:'hb-up',down:'hb-down',left:'hb-left',right:'hb-right'};
  Object.entries(M).forEach(([dir,id])=>{
    document.getElementById(id)?.classList.toggle('pressed',hiveKeys[dir]);
  });
}

/* ── Utility ── */
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

/* ── Main loop ── */
let lastT=0;
function loop(t){
  const dt=Math.min((t-lastT)/1000,0.05);lastT=t;
  drawBG(dt);
  requestAnimationFrame(loop);
}

/* ── BOOT ── */
window.addEventListener('DOMContentLoaded',()=>{
  resizeBG();window.addEventListener('resize',resizeBG);
  setupHiveKeys();

  // Connect screen
  document.getElementById('btn-join').addEventListener('click',()=>{
    initAudio();
    const name=document.getElementById('inp-name').value.trim();
    const code=document.getElementById('inp-code').value.trim();
    if(!name){showErr('ENTER A NAME');return;}
    if(!ws||ws.readyState>1)connect();
    const doJoin=()=>send({type:'JOIN',name,code});
    if(ws.readyState===1)doJoin();
    else ws.addEventListener('open',doJoin,{once:true});
  });
  document.getElementById('inp-name').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-join').click();});
  document.getElementById('inp-code').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-join').click();});
  document.getElementById('inp-code').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase();});

  // Lobby
  document.getElementById('btn-copy').addEventListener('click',()=>{
    navigator.clipboard?.writeText(roomCode).then(()=>notify('CODE COPIED!'));
  });
  document.getElementById('btn-start').addEventListener('click',()=>{
    initAudio();send({type:'START'});
  });

  // Trust choices
  document.getElementById('btn-coop').addEventListener('click',()=>onTrustChoice('cooperate'));
  document.getElementById('btn-def').addEventListener('click',()=>onTrustChoice('defect'));

  // Results - play again
  document.getElementById('btn-again').addEventListener('click',()=>{
    initAudio();send({type:'PLAY_AGAIN'});
    show('s-lobby');
    document.getElementById('btn-start').classList.toggle('hidden',!isHost);
    notify('RESETTING EXPERIMENT...','#C7FF4D');
  });

  requestAnimationFrame(loop);
});

})();
