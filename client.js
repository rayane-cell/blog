(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const joinPanel = $('join'), hud = $('hud'), toastEl = $('toast'), puzzleEl = $('puzzle'), endEl = $('end');
  const heroesBtns = [...document.querySelectorAll('.hero')];
  let selectedHero = 'geek';
  let ws, myId = null, state = null, lastState = null;
  let particles = [], sparks = [], symbols = [], shake = 0, muted = false;
  let camera = {x:0,y:0,tx:0,ty:0};
  const keys = {up:false,down:false,left:false,right:false,sprint:false};
  let lastInputSent = 0, connected = false, audioCtx = null;

  const HERO = {
    geek:{color:'#2ee8ff', dark:'#0c6b86', label:'Geek'}, sportif:{color:'#ff375f', dark:'#8e1234', label:'Sportif'},
    timide:{color:'#5dff88', dark:'#1f7142', label:'Timide'}, debrouillard:{color:'#ffd43b', dark:'#9b6b00', label:'Débrouillard'}
  };
  const itemIcon = { key:'🗝️', badge:'🪪', battery:'🔋', chalk:'🪄', ticket:'🎟️', coffee:'☕', sandwich:'🥪' };
  const itemName = { key:'clé', badge:'badge', battery:'batterie', chalk:'craie', ticket:'ticket', coffee:'café', sandwich:'sandwich' };

  function resize(){ canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
  addEventListener('resize', resize); resize();

  heroesBtns.forEach(b => b.onclick = () => { heroesBtns.forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); selectedHero = b.dataset.hero; });
  $('play').onclick = join;
  $('restart').onclick = () => send({type:'restart'});

  function join(){
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      connected = true; beep(420, .04, 'sine');
      send({type:'join', name: $('name').value || 'Étudiant', hero:selectedHero});
      joinPanel.classList.add('hidden'); hud.classList.remove('hidden');
    };
    ws.onmessage = ev => handle(JSON.parse(ev.data));
    ws.onclose = () => { connected = false; showToast('Connexion perdue. Relance le serveur ou recharge la page.'); };
    ws.onerror = () => showToast('Impossible de se connecter. Lance d’abord le serveur Node.js.');
  }
  function send(data){ if(ws && ws.readyState === 1) ws.send(JSON.stringify(data)); }

  function handle(msg){
    if(msg.type === 'welcome'){ myId = msg.id; state = msg.state; showToast('Connecté à l’équipe. Explore l’école.'); }
    if(msg.type === 'state'){ lastState = state; state = msg; updateHud(); }
    if(msg.type === 'toast'){ showToast(msg.text); }
    if(msg.type === 'event'){ shake = 10; spawnEventFx(msg.event.type); showToast(msg.event.label); }
    if(msg.type === 'puzzle') showPuzzle(msg);
    if(msg.type === 'victory') showEnd(true);
    if(msg.type === 'defeat') showEnd(false);
    if(msg.type === 'reset'){ endEl.classList.add('hidden'); puzzleEl.classList.add('hidden'); showToast('Nouvelle partie.'); }
  }

  function showToast(text){
    toastEl.textContent = text; toastEl.classList.remove('hidden');
    clearTimeout(showToast._t); showToast._t = setTimeout(()=>toastEl.classList.add('hidden'), 2800);
  }
  function showPuzzle(msg){
    puzzleEl.classList.remove('hidden');
    $('puzzleTitle').textContent = msg.anomaly.name;
    $('puzzleQuestion').textContent = msg.q;
    const choices = $('choices'); choices.innerHTML='';
    msg.choices.forEach((c,i)=>{ const b=document.createElement('button'); b.textContent=c; b.onclick=()=>{ send({type:'answer', choice:i}); puzzleEl.classList.add('hidden'); }; choices.appendChild(b); });
    beep(240,.09,'triangle');
  }
  function showEnd(victory){
    endEl.classList.remove('hidden');
    $('endTitle').innerHTML = victory ? 'Victoire <span>404</span>' : 'Défaite';
    $('endText').textContent = victory ? 'La faille est fermée. Vous avez survécu à l’école.' : 'La réalité s’est effondrée. Relancez et coordonnez mieux.';
    beep(victory?660:120, .2, victory?'sine':'sawtooth');
  }

  function codeToInput(code, down){
    if(['KeyW','KeyZ','ArrowUp'].includes(code)) keys.up = down;
    if(['KeyS','ArrowDown'].includes(code)) keys.down = down;
    if(['KeyA','KeyQ','ArrowLeft'].includes(code)) keys.left = down;
    if(['KeyD','ArrowRight'].includes(code)) keys.right = down;
    if(['ShiftLeft','ShiftRight'].includes(code)) keys.sprint = down;
  }
  addEventListener('keydown', e => {
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if(['KeyE','Enter','Space'].includes(e.code)){ send({type:'action'}); e.preventDefault(); return; }
    if(e.code === 'KeyF'){ document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(()=>{}); }
    if(e.code === 'KeyM'){ muted = !muted; showToast(muted?'Son désactivé':'Son activé'); }
    codeToInput(e.code,true);
  });
  addEventListener('keyup', e => codeToInput(e.code,false));
  setInterval(()=>{ if(connected){ send({type:'input', input:keys}); } }, 50);

  function updateHud(){
    if(!state) return;
    $('fragments').textContent = `${state.solved}/${state.total}`;
    $('reality').textContent = `${Math.round(state.reality)}%`;
    $('realityBar').style.width = `${Math.max(0,Math.min(100,state.reality))}%`;
    $('event').textContent = state.event?.label || 'Réalité stable';
    $('playersCount').textContent = state.players.length;
    const team = $('team'); team.innerHTML = '';
    state.players.forEach(p=>{
      const d = document.createElement('div'); d.className='member'; d.style.color = HERO[p.hero]?.color || '#fff';
      d.innerHTML = `<div class="name"><span>${escapeHtml(p.name)} ${p.id===myId?'• toi':''}</span><span>${p.ko?'KO':Math.round(p.hp)+' PV'}</span></div><div class="mini"><i style="width:${Math.max(0,p.hp/p.maxHp*100)}%"></i></div>`;
      team.appendChild(d);
    });
    const me = state.players.find(p=>p.id===myId);
    const inv = $('inventory');
    if(me){
      inv.innerHTML = `<span>Inventaire</span><div class="invgrid">${me.inv.length?me.inv.map(i=>`<div class="chip">${itemIcon[i]||'◆'} ${itemName[i]||i}</div>`).join(''):'<div class="chip">vide</div>'}</div>`;
    }
    const log = $('log'); log.innerHTML = (state.log||[]).slice(0,5).map(l=>`<div class="logline">${escapeHtml(l.text)}</div>`).join('');
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function beep(freq=.1, dur=.1, type='sine'){
    if(muted) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = .045;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + dur); o.stop(audioCtx.currentTime + dur);
    }catch(_){ }
  }

  function spawnEventFx(type){
    for(let i=0;i<120;i++) particles.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:60+Math.random()*80,c:type});
    for(let i=0;i<60;i++) symbols.push({x:Math.random()*innerWidth,y:-20-Math.random()*500,vy:1+Math.random()*4,t:Math.random()*10,char:['x²','∑','404','{ }','λ','∧','RIFT'][i%7]});
  }

  function worldToScreen(x,y){ return {x:x-camera.x, y:y-camera.y}; }
  function screenToWorld(x,y){ return {x:x+camera.x,y:y+camera.y}; }

  function draw(t){
    requestAnimationFrame(draw);
    ctx.clearRect(0,0,innerWidth,innerHeight);
    if(!state){ drawMenuBg(t); return; }
    const me = state.players.find(p=>p.id===myId) || state.players[0];
    if(me){
      camera.tx = me.x - innerWidth/2; camera.ty = me.y - innerHeight/2;
      camera.tx = Math.max(0, Math.min(state.world.w-innerWidth, camera.tx));
      camera.ty = Math.max(0, Math.min(state.world.h-innerHeight, camera.ty));
      camera.x += (camera.tx-camera.x)*.12; camera.y += (camera.ty-camera.y)*.12;
    }
    const sx = (Math.random()-.5)*shake, sy=(Math.random()-.5)*shake; shake*=.9;
    ctx.save(); ctx.translate(sx, sy);
    drawWorld(t);
    drawObjects(t);
    drawAnomalies(t);
    drawDoors();
    drawEnemies(t);
    drawBoss(t);
    drawPlayers(t);
    drawLights(t);
    ctx.restore();
    drawScreenFx(t);
  }

  function drawMenuBg(t){
    const g=ctx.createLinearGradient(0,0,innerWidth,innerHeight); g.addColorStop(0,'#050713'); g.addColorStop(1,'#120526'); ctx.fillStyle=g; ctx.fillRect(0,0,innerWidth,innerHeight);
    for(let i=0;i<100;i++){ const x=(i*97+t*.025)%innerWidth, y=(i*53+t*.045)%innerHeight; ctx.fillStyle=i%3?'rgba(46,232,255,.12)':'rgba(154,255,59,.1)'; ctx.fillText(['404','RIFT','∧','x²','{}'][i%5],x,y); }
  }

  function drawWorld(t){
    const ox = -camera.x, oy = -camera.y;
    const grad = ctx.createLinearGradient(ox,oy,ox+state.world.w,oy+state.world.h);
    grad.addColorStop(0,'#070b18'); grad.addColorStop(.5,'#10142a'); grad.addColorStop(1,'#090512');
    ctx.fillStyle = grad; ctx.fillRect(ox,oy,state.world.w,state.world.h);
    ctx.strokeStyle='rgba(46,232,255,.05)'; ctx.lineWidth=1;
    for(let x=Math.floor(camera.x/64)*64; x<camera.x+innerWidth+64; x+=64){ ctx.beginPath(); ctx.moveTo(x-camera.x, -camera.y); ctx.lineTo(x-camera.x, state.world.h-camera.y); ctx.stroke(); }
    for(let y=Math.floor(camera.y/64)*64; y<camera.y+innerHeight+64; y+=64){ ctx.beginPath(); ctx.moveTo(-camera.x,y-camera.y); ctx.lineTo(state.world.w-camera.x,y-camera.y); ctx.stroke(); }

    state.rooms.forEach((r,i)=>{
      const p=worldToScreen(r.x,r.y);
      const hue = i%4===0?'rgba(46,232,255,.06)':i%4===1?'rgba(154,255,59,.045)':i%4===2?'rgba(255,59,136,.05)':'rgba(255,212,59,.045)';
      ctx.fillStyle=hue; roundRect(p.x,p.y,r.w,r.h,18,true,false);
      ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2; roundRect(p.x,p.y,r.w,r.h,18,false,true);
      ctx.fillStyle='rgba(220,240,255,.28)'; ctx.font='900 16px Inter, sans-serif'; ctx.fillText(r.name, p.x+22,p.y+34);
      // texture: posters/casiers
      for(let k=0;k<6;k++){ ctx.fillStyle = k%2?'rgba(46,232,255,.08)':'rgba(255,255,255,.05)'; ctx.fillRect(p.x+30+k*48,p.y+r.h-58,28,38); }
    });

    state.obstacles.forEach(o=>{
      const p=worldToScreen(o.x,o.y);
      let fill = '#141b2e';
      if(o.type==='desk') fill='#1d2033'; if(o.type==='shelf') fill='#182439'; if(o.type==='server') fill='#101c28'; if(o.type==='locker') fill='#1a253d';
      ctx.fillStyle=fill; roundRect(p.x,p.y,o.w,o.h,8,true,false);
      ctx.strokeStyle='rgba(99,230,255,.12)'; roundRect(p.x,p.y,o.w,o.h,8,false,true);
      if(o.type==='server'){ for(let x=p.x+18;x<p.x+o.w-10;x+=34){ ctx.fillStyle=Math.random()>.5?'#2ee8ff':'#9aff3b'; ctx.fillRect(x,p.y+10,8,8); }}
      if(o.type==='locker'){ for(let x=p.x+10;x<p.x+o.w-10;x+=32){ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(x,p.y+5,20,o.h-10);} }
    });
  }

  function drawDoors(){
    state.doors.forEach(d=>{
      const p=worldToScreen(d.x,d.y);
      ctx.save();
      ctx.globalAlpha = d.open ? .35 : 1;
      const grd=ctx.createLinearGradient(p.x,p.y,p.x+d.w,p.y+d.h); grd.addColorStop(0,d.open?'rgba(154,255,59,.25)':'rgba(255,59,136,.42)'); grd.addColorStop(1,'rgba(46,232,255,.22)');
      ctx.fillStyle=grd; roundRect(p.x,p.y,d.w,d.h,10,true,false);
      ctx.strokeStyle=d.open?'rgba(154,255,59,.8)':'rgba(255,59,136,.8)'; ctx.lineWidth=2; roundRect(p.x,p.y,d.w,d.h,10,false,true);
      ctx.fillStyle='white'; ctx.font='800 12px Inter'; ctx.fillText(d.open?'OUVERT':'VERROUILLÉ',p.x+12,p.y+d.h/2+4);
      ctx.restore();
    });
  }

  function drawObjects(t){
    (state.objects||[]).forEach(o=>{
      const p=worldToScreen(o.x,o.y), bob=Math.sin(t*.006+o.x)*6;
      glow(p.x,p.y+bob,30,'rgba(255,212,59,.22)');
      ctx.font='30px serif'; ctx.textAlign='center'; ctx.fillText(itemIcon[o.type]||'◆',p.x,p.y+bob+10); ctx.textAlign='left';
    });
  }

  function drawAnomalies(t){
    state.anomalies.forEach(a=>{
      const p=worldToScreen(a.x,a.y), r=28+Math.sin(t*.009+a.x)*5;
      glow(p.x,p.y,r*2,a.solved?'rgba(154,255,59,.16)':'rgba(255,59,136,.26)');
      ctx.strokeStyle=a.solved?'#9aff3b':'#ff3b88'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.stroke();
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(t*.001+a.x); ctx.strokeStyle=a.solved?'rgba(154,255,59,.7)':'rgba(46,232,255,.7)'; ctx.strokeRect(-16,-16,32,32); ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.font='800 12px Inter'; ctx.textAlign='center'; ctx.fillText(a.solved?'STABLE':'ANOMALIE',p.x,p.y+52); ctx.textAlign='left';
    });
  }

  function drawEnemies(t){
    (state.enemies||[]).forEach(e=>{
      const p=worldToScreen(e.x,e.y);
      if(e.type==='surveillant'){
        glow(p.x,p.y,70,'rgba(255,59,136,.18)');
        ctx.fillStyle='#20111b'; roundRect(p.x-19,p.y-26,38,52,12,true,false);
        ctx.fillStyle='#ff3b88'; ctx.beginPath(); ctx.arc(p.x,p.y-35,18,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='white'; ctx.fillRect(p.x-9,p.y-39,6,5); ctx.fillRect(p.x+3,p.y-39,6,5);
        ctx.strokeStyle='rgba(255,59,136,.45)'; ctx.beginPath(); ctx.arc(p.x,p.y,110+Math.sin(t*.005)*8,0,Math.PI*2); ctx.stroke();
      } else {
        glow(p.x,p.y,32,'rgba(46,232,255,.16)');
        ctx.fillStyle='#2ee8ff'; ctx.beginPath(); ctx.ellipse(p.x,p.y,18,11,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#050713'; ctx.fillRect(p.x-8,p.y-3,5,5); ctx.fillRect(p.x+4,p.y-3,5,5);
      }
    });
  }

  function drawBoss(t){
    const b=state.boss; if(!b || (!b.active && !b.defeated)) return;
    if(b.active){
      const p=worldToScreen(b.x,b.y); glow(p.x,p.y,180,'rgba(255,59,136,.22)'); glow(p.x,p.y,90,'rgba(46,232,255,.16)');
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.sin(t*.002)*.08);
      ctx.fillStyle='#130716'; roundRect(-44,-58,88,116,24,true,false);
      ctx.strokeStyle='#ff3b88'; ctx.lineWidth=4; roundRect(-44,-58,88,116,24,false,true);
      ctx.fillStyle='#ff3b88'; ctx.beginPath(); ctx.arc(0,-72,32,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='white'; ctx.fillRect(-15,-80,10,8); ctx.fillRect(5,-80,10,8);
      ctx.restore();
      const hpw=180; ctx.fillStyle='rgba(255,255,255,.12)'; roundRect(p.x-hpw/2,p.y-125,hpw,10,99,true,false); ctx.fillStyle='#ff3b88'; roundRect(p.x-hpw/2,p.y-125,hpw*(b.hp/100),10,99,true,false);
    }
    (b.consoles||[]).forEach(c=>{ const p=worldToScreen(c.x,c.y); glow(p.x,p.y,45,c.active?'rgba(154,255,59,.2)':'rgba(46,232,255,.16)'); ctx.fillStyle=c.active?'#9aff3b':'#102132'; roundRect(p.x-22,p.y-22,44,44,10,true,false); ctx.strokeStyle=c.active?'#9aff3b':'#2ee8ff'; ctx.strokeRect(p.x-22,p.y-22,44,44); ctx.fillStyle='#001018'; ctx.font='900 16px Inter'; ctx.textAlign='center'; ctx.fillText(c.active?'✓':'⚡',p.x,p.y+6); ctx.textAlign='left'; });
  }

  function drawPlayers(t){
    (state.players||[]).forEach(p=>{
      const sc=worldToScreen(p.x,p.y); const h=HERO[p.hero] || HERO.geek; const moving=Math.hypot(p.vx||0,p.vy||0)>5; const bob=moving?Math.sin(t*.02+p.id)*4:0;
      glow(sc.x,sc.y,58,p.id===myId?'rgba(154,255,59,.18)':'rgba(46,232,255,.10)');
      if(p.ko){ ctx.globalAlpha=.55; }
      // shadow
      ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sc.x,sc.y+27,24,8,0,0,Math.PI*2); ctx.fill();
      // legs
      ctx.strokeStyle='#0a0d18'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(sc.x-8,sc.y+18); ctx.lineTo(sc.x-12,sc.y+34+bob); ctx.moveTo(sc.x+8,sc.y+18); ctx.lineTo(sc.x+12,sc.y+34-bob); ctx.stroke();
      // body
      ctx.fillStyle=h.dark; roundRect(sc.x-19,sc.y-20+bob,38,45,14,true,false); ctx.strokeStyle=h.color; ctx.lineWidth=2; roundRect(sc.x-19,sc.y-20+bob,38,45,14,false,true);
      // head
      ctx.fillStyle='#d89468'; ctx.beginPath(); ctx.arc(sc.x,sc.y-35+bob,18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#21110d'; ctx.beginPath(); ctx.arc(sc.x-4,sc.y-47+bob,17,Math.PI,0); ctx.fill();
      ctx.fillStyle='#07131e'; ctx.fillRect(sc.x-9,sc.y-37+bob,4,4); ctx.fillRect(sc.x+6,sc.y-37+bob,4,4);
      // role accessories
      ctx.strokeStyle=h.color; ctx.fillStyle=h.color; ctx.lineWidth=2;
      if(p.hero==='geek'){
        ctx.strokeRect(sc.x-14,sc.y-43+bob,11,8); ctx.strokeRect(sc.x+3,sc.y-43+bob,11,8); ctx.beginPath(); ctx.moveTo(sc.x-3,sc.y-39+bob); ctx.lineTo(sc.x+3,sc.y-39+bob); ctx.stroke();
        ctx.fillRect(sc.x+18,sc.y-8+bob,16,22);
      } else if(p.hero==='sportif'){
        ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(sc.x-17,sc.y-49+bob); ctx.lineTo(sc.x+17,sc.y-49+bob); ctx.stroke();
        ctx.strokeStyle=h.color; ctx.beginPath(); ctx.moveTo(sc.x-24,sc.y-4+bob); ctx.lineTo(sc.x-40,sc.y+4+bob); ctx.stroke();
      } else if(p.hero==='timide'){
        ctx.strokeRect(sc.x-14,sc.y-43+bob,11,8); ctx.strokeRect(sc.x+3,sc.y-43+bob,11,8);
        glow(sc.x+34,sc.y-10+bob,80,'rgba(255,255,180,.12)'); ctx.fillStyle='#fff7a0'; ctx.beginPath(); ctx.arc(sc.x+31,sc.y-11+bob,6,0,Math.PI*2); ctx.fill();
      } else if(p.hero==='debrouillard'){
        ctx.fillStyle='#ffd43b'; ctx.beginPath(); ctx.arc(sc.x,sc.y-51+bob,20,Math.PI,0); ctx.fill();
        ctx.fillRect(sc.x+20,sc.y-8+bob,16,25); ctx.fillStyle='#9b6b00'; ctx.fillRect(sc.x+25,sc.y-2+bob,5,14);
      }
      ctx.fillStyle='rgba(238,248,255,.92)'; ctx.font='800 12px Inter'; ctx.textAlign='center'; ctx.fillText(p.name,sc.x,sc.y+55); ctx.textAlign='left';
      if(p.ko){ ctx.globalAlpha=1; ctx.fillStyle='#ff3b88'; ctx.font='900 16px Inter'; ctx.textAlign='center'; ctx.fillText('KO',sc.x,sc.y-68); ctx.textAlign='left'; }
    });
  }

  function drawLights(t){
    const blackout = state.event?.type === 'blackout' && state.event.until > Date.now();
    ctx.save();
    ctx.globalCompositeOperation='multiply';
    ctx.fillStyle = blackout ? 'rgba(0,0,0,.74)' : 'rgba(0,0,0,.28)';
    ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation='lighter';
    (state.players||[]).forEach(p=>{ const sc=worldToScreen(p.x,p.y); const r=p.hero==='timide'?170:125; const g=ctx.createRadialGradient(sc.x,sc.y,10,sc.x,sc.y,r); g.addColorStop(0,'rgba(255,255,210,.16)'); g.addColorStop(1,'rgba(255,255,210,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sc.x,sc.y,r,0,Math.PI*2); ctx.fill(); });
    ctx.restore();
  }

  function drawScreenFx(t){
    // particles
    ctx.save();
    particles = particles.filter(p=>p.life-->0);
    particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; ctx.fillStyle=p.c==='blackout'?'rgba(255,255,255,.12)':p.c==='glitch'?'rgba(255,59,136,.25)':'rgba(46,232,255,.22)'; ctx.fillRect(p.x,p.y,2+Math.random()*4,2); });
    symbols = symbols.filter(s=>s.y<innerHeight+80); symbols.forEach(s=>{s.y+=s.vy; ctx.fillStyle='rgba(46,232,255,.25)'; ctx.font='900 20px Inter'; ctx.fillText(s.char,s.x,s.y);});
    // glitch strips
    if(state.event?.type==='glitch' && state.event.until>Date.now()){
      for(let i=0;i<9;i++){ const y=Math.random()*innerHeight, h=2+Math.random()*9; ctx.fillStyle=i%2?'rgba(46,232,255,.11)':'rgba(255,59,136,.10)'; ctx.fillRect(Math.random()*40-20,y,innerWidth,h); }
    }
    // vignette
    const vg=ctx.createRadialGradient(innerWidth/2,innerHeight/2,innerWidth*.15,innerWidth/2,innerHeight/2,innerWidth*.65); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.5)'); ctx.fillStyle=vg; ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.restore();
  }

  function glow(x,y,r,color){
    ctx.save(); ctx.globalCompositeOperation='lighter'; const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  function roundRect(x,y,w,h,r,fill,stroke){
    r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); if(fill)ctx.fill(); if(stroke)ctx.stroke();
  }

  requestAnimationFrame(draw);
})();
