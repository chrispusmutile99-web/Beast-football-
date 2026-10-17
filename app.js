import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

/*
 BEAST FOOTBALL — original browser-playable prototype.
 Current scope: offline small-sided match, simple AI, touch controls, goals,
 timer, teams, formation/settings screens and virtual-only profile shell.
 Online, secure accounts, tournaments and real-money payments are NOT connected.
*/
const $ = (id) => document.getElementById(id);
const screens = ['intro','menu','subscreen'];
const state = {
  screen:'intro', mode:'match', running:false, paused:false, finished:false,
  homeScore:0, awayScore:0, elapsed:0, duration:120, lastFrame:0, lastSecond:-1,
  homeTeam:'Beast United', awayTeam:'Thunder FC', difficulty:'Normal',
  formation:'4-3-3', selectedHome:'Beast United', selectedAway:'Thunder FC',
  sound:true, controlOpacity:0.75, controlSize:1, graphics:'Balanced',
  activePlayer:0, input:{x:0,y:0,sprint:false}, chargeStart:0, charging:false,
  matchHistory:[], toastTimer:null, messageTimer:null, lastGoalAt:-100,
};
const teamData = [
 {name:'Beast United',badge:'♌',home:'#21d66b',away:'#f4f4f4',attack:84,mid:82,defence:79,gk:81},
 {name:'Nairobi Stars',badge:'✦',home:'#2476ff',away:'#f8cf46',attack:78,mid:83,defence:76,gk:77},
 {name:'Coastal Warriors',badge:'⚓',home:'#16c9c1',away:'#172e4b',attack:81,mid:78,defence:82,gk:80},
 {name:'Thunder FC',badge:'ϟ',home:'#f0b52d',away:'#1d2732',attack:83,mid:79,defence:77,gk:78},
 {name:'Mountain Lions',badge:'♜',home:'#a66cff',away:'#f6f0ff',attack:79,mid:80,defence:84,gk:82},
 {name:'Royal Strikers',badge:'♛',home:'#e94f61',away:'#f4c9ce',attack:85,mid:77,defence:75,gk:76},
 {name:'Desert Falcons',badge:'➤',home:'#dc8144',away:'#f7e6c9',attack:80,mid:81,defence:78,gk:79},
 {name:'Ocean City FC',badge:'≈',home:'#39a9df',away:'#102a42',attack:77,mid:84,defence:80,gk:83},
];
const formations = ['4-4-2','4-3-3','4-2-3-1','3-5-2','5-3-2'];
let renderer, scene, camera, clock, stadiumGroup, pitchGroup, ball, ballShadow, players=[], homePlayers=[], awayPlayers=[], activeMesh=null;
let pitchLength=100, pitchWidth=64, ballVelocity=new THREE.Vector3(), matchReady=false;
let keys = {};
const tmpV = new THREE.Vector3();

function showToast(message, ms=2500){
  const el=$('toast'); el.textContent=message; el.classList.remove('hidden');
  clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.add('hidden'),ms);
}
function setLoading(percent,message){ $('loading-bar').style.width=percent+'%'; $('loading-message').textContent=message; }
function setScreen(name){
  state.screen=name;
  screens.forEach(id=>$(id).classList.toggle('hidden',id!==name));
  $('game-ui').classList.add('hidden');
  if(name==='menu') $('menu').scrollTop=0;
  closeDrawer();
}
function openSub(name,title){
  $('sub-title').textContent=title;
  renderSubscreen(name);
  setScreen('subscreen');
}
function closeDrawer(){ $('drawer').classList.remove('open'); $('drawer-backdrop').classList.add('hidden'); }
function toggleDrawer(){ $('drawer').classList.toggle('open'); $('drawer-backdrop').classList.toggle('hidden',!$('drawer').classList.contains('open')); }
function team(name){return teamData.find(t=>t.name===name)||teamData[0];}

function init3D(){
  const root=$('game-root');
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
    root.appendChild(renderer.domElement);
    scene=new THREE.Scene(); scene.background=new THREE.Color(0x83b7d7); scene.fog=new THREE.Fog(0x83b7d7,125,260);
    camera=new THREE.PerspectiveCamera(44,window.innerWidth/window.innerHeight,0.1,500);
    camera.position.set(0,58,78); camera.lookAt(0,0,0);
    clock=new THREE.Clock();
    scene.add(new THREE.HemisphereLight(0xcbe7ff,0x203d29,2.0));
    const sun=new THREE.DirectionalLight(0xfff1d5,2.6); sun.position.set(-35,65,28); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70; scene.add(sun);
    const fill=new THREE.DirectionalLight(0x78aaff,0.8);fill.position.set(40,30,-50);scene.add(fill);
    buildStadium();
    buildMatchActors();
    window.addEventListener('resize',resize3D);
    renderer.setAnimationLoop(animate);
    return true;
  }catch(err){
    console.error('3D initialization failed',err);
    $('loading-message').textContent='3D graphics could not start. Try reloading or a newer browser.';
    $('loading-retry').classList.remove('hidden');
    return false;
  }
}
function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function addBox(parent,w,h,d,material,x,y,z,cast=true,receive=true){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=receive;parent.add(mesh);return mesh;
}
function buildStadium(){
  stadiumGroup=new THREE.Group();scene.add(stadiumGroup);
  const ground=addBox(stadiumGroup,230,.8,190,mat(0x172a20),0,-1.0,0,false,true);
  const standsMat=mat(0x293b3e),seatA=mat(0x315148),seatB=mat(0x3a4649);
  // Four stepped stands surrounding the pitch, kept low enough for a broadcast view.
  for(let tier=0;tier<4;tier++){
    const h=2.2, y=tier*2.2+1.1, zFront=pitchWidth/2+8+tier*4, xFront=pitchLength/2+8+tier*4;
    addBox(stadiumGroup,pitchLength+44+tier*8,h,5, tier%2?seatA:standsMat,0,y,-zFront,false,true);
    addBox(stadiumGroup,pitchLength+44+tier*8,h,5, tier%2?seatB:standsMat,0,y,zFront,false,true);
    addBox(stadiumGroup,5,h,pitchWidth+42+tier*8,-xFront,y,0,tier%2?seatA:standsMat,false,true);
    addBox(stadiumGroup,5,h,pitchWidth+42+tier*8,xFront,y,0,tier%2?seatB:standsMat,false,true);
  }
  const boardMat=mat(0x071b10,.6,.1);
  for(const z of [-pitchWidth/2-1.4,pitchWidth/2+1.4]){
    addBox(stadiumGroup,pitchLength+3,1.1,.35,boardMat,0,.25,z,false,true);
    for(let i=0;i<12;i++) addBox(stadiumGroup,4.8,.08,.04,mat(i%3===0?0xf2c86b:0x36db79),-pitchLength/2+4+i*8,.48,z+(z<0?-.2:.2),false,false);
  }
  for(const x of [-pitchLength/2-1.4,pitchLength/2+1.4]) addBox(stadiumGroup,.35,1.1,pitchWidth+3,boardMat,x,.25,0,false,true);
  // Floodlight masts
  for(const x of [-60,60]) for(const z of [-42,42]){
    addBox(stadiumGroup,.65,24,.65,mat(0x697a79),x,12,z,false,false);
    const lamp=addBox(stadiumGroup,6,1.3,1.4,mat(0xf5f2d6,0.3),x,24,z,false,false);
    const light=new THREE.PointLight(0xd8eaff,35,75,2);light.position.set(x,23,z);scene.add(light);
  }
  buildPitch();
}
function buildPitch(){
  pitchGroup=new THREE.Group();scene.add(pitchGroup);
  const grass=mat(0x23743d), stripeA=mat(0x2a8044),stripeB=mat(0x24743c);
  addBox(pitchGroup,pitchLength,.25,pitchWidth,grass,0,-.05,0,false,true);
  const stripes=10, stripeLen=pitchLength/stripes;
  for(let i=0;i<stripes;i++) addBox(pitchGroup,stripeLen,.012,pitchWidth,i%2?stripeA:stripeB,-pitchLength/2+stripeLen*(i+.5),.083,0,false,true);
  const lineMat=new THREE.MeshBasicMaterial({color:0xf0f5e9});
  const line=(w,d,x,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,.025,d),lineMat);m.position.set(x,.1,z);pitchGroup.add(m);};
  line(pitchLength,.12,0,-pitchWidth/2);line(pitchLength,.12,0,pitchWidth/2);line(.12,pitchWidth,-pitchLength/2,0);line(.12,pitchWidth,pitchLength/2,0);line(.12,pitchWidth,0,0);
  const circle=new THREE.Mesh(new THREE.RingGeometry(9.08,9.2,72),lineMat);circle.rotation.x=-Math.PI/2;circle.position.y=.11;pitchGroup.add(circle);
  const centre=new THREE.Mesh(new THREE.CircleGeometry(.24,24),lineMat);centre.rotation.x=-Math.PI/2;centre.position.y=.12;pitchGroup.add(centre);
  for(const side of [-1,1]){
    const goalZ=0, gx=side*(pitchLength/2-16);
    // Penalty box outline (three sides) and goal area.
    const edgeX=side*(pitchLength/2), boxX=side*(pitchLength/2-16), smallX=side*(pitchLength/2-5.5);
    line(16,.12,side*(pitchLength/2-8),-20);line(16,.12,side*(pitchLength/2-8),20);
    line(.12,40,boxX,0);
    line(5.5,.12,side*(pitchLength/2-2.75),-9);line(5.5,.12,side*(pitchLength/2-2.75),9);line(.12,18,smallX,0);
    const spot=new THREE.Mesh(new THREE.CircleGeometry(.23,18),lineMat);spot.rotation.x=-Math.PI/2;spot.position.set(side*(pitchLength/2-10.5),.12,0);pitchGroup.add(spot);
    const arc=new THREE.Mesh(new THREE.RingGeometry(9.05,9.18,40,1,side<0?-.9:Math.PI-.9,1.8),lineMat);arc.rotation.x=-Math.PI/2;arc.position.set(side*(pitchLength/2-10.5),.11,0);pitchGroup.add(arc);
    // Goals point outward along x axis.
    const postMat=mat(0xf5f5ec,.4), netMat=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:.42});
    const goal=new THREE.Group();const x=side*(pitchLength/2+2.1), inward=side<0?1:-1;
    const post1=addBox(goal,.22,4.4,.22,postMat,0,2.2,-3.66,false,false);
    addBox(goal,.22,4.4,.22,postMat,0,2.2,3.66,false,false);addBox(goal,.22,.22,7.5,postMat,0,4.4,0,false,false);
    const net=new THREE.Mesh(new THREE.BoxGeometry(4.1,4.3,7.25,5,5,8),netMat);net.position.set(inward*2,2.15,0);goal.add(net);
    goal.position.x=x;pitchGroup.add(goal);
    // Corner flags
    for(const z of [-pitchWidth/2,pitchWidth/2]){const pole=addBox(pitchGroup,.07,1.5,.07,mat(0xf8f5e8),side*(pitchLength/2-.2),.8,z,false,false);addBox(pitchGroup,.8,.45,.06,mat(0xf3c86b),side*(pitchLength/2-.2)+(side<0?.3:-.3),1.35,z,false,false);}
  }
}
function createPlayer(teamColor,isKeeper=false){
  const g=new THREE.Group();
  const shirt=mat(teamColor), shorts=mat(0x18221c), skin=mat(0x9e6d50), socks=mat(teamColor), boots=mat(0x101511);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.43,.7,4,8),shirt);torso.position.y=2.05;torso.castShadow=true;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),skin);head.position.y=2.78;head.castShadow=true;g.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.285,10,8,0,Math.PI*2,0,Math.PI*.52),mat(0x241a13));hair.position.y=2.87;g.add(hair);
  const shortsMesh=new THREE.Mesh(new THREE.BoxGeometry(.72,.38,.45),shorts);shortsMesh.position.y=1.48;shortsMesh.castShadow=true;g.add(shortsMesh);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.58,3,6),shirt);arm.position.set(side*.53,2.02,0);arm.rotation.z=side*.16;arm.castShadow=true;g.add(arm);limbs.push({mesh:arm,side,kind:'arm'});
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.62,3,6),shorts);leg.position.set(side*.22,.91,0);leg.castShadow=true;g.add(leg);limbs.push({mesh:leg,side,kind:'leg'});
    const sock=new THREE.Mesh(new THREE.CylinderGeometry(.12,.13,.38,8),socks);sock.position.set(side*.22,.45,0);sock.castShadow=true;g.add(sock);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.22,.14,.38),boots);boot.position.set(side*.22,.2,.08);boot.castShadow=true;g.add(boot);
  }
  g.userData={limbs,homeY:0,isKeeper};return g;
}
function buildMatchActors(){
  // Remove prior actors if rebuilding.
  players.forEach(p=>scene.remove(p.mesh));players=[];homePlayers=[];awayPlayers=[];
  if(ball)scene.remove(ball);if(ballShadow)scene.remove(ballShadow);
  const home=team(state.homeTeam),away=team(state.awayTeam);
  const positionsHome=[[-28,0],[-18,-13],[-18,13],[-7,0],[0,-19],[0,19],[12,-10],[13,10],[28,0]];
  const positionsAway=[[28,0],[18,-13],[18,13],[7,0],[0,-19],[0,19],[-12,-10],[-13,10],[-28,0]];
  // Small-sided prototype: 5 outfield + goalkeeper each, simplified to 6 per side.
  const homePos=[[-36,0],[-22,-15],[-22,15],[-6,-9],[-6,9],[-17,0]];
  const awayPos=[[36,0],[22,-15],[22,15],[6,-9],[6,9],[17,0]];
  homePos.forEach((pos,i)=>{const keeper=i===0;const mesh=createPlayer(keeper?0x4fd5ff:home.home,keeper);mesh.position.set(pos[0],0,pos[1]);scene.add(mesh);const p={mesh,team:0,index:i,x:pos[0],z:pos[1],vx:0,vz:0,homeX:pos[0],homeZ:pos[1],keeper,phase:Math.random()*6};players.push(p);homePlayers.push(p);});
  awayPos.forEach((pos,i)=>{const keeper=i===0;const mesh=createPlayer(keeper?0xff7e65:away.home,keeper);mesh.position.set(pos[0],0,pos[1]);scene.add(mesh);const p={mesh,team:1,index:i,x:pos[0],z:pos[1],vx:0,vz:0,homeX:pos[0],homeZ:pos[1],keeper,phase:Math.random()*6};players.push(p);awayPlayers.push(p);});
  const ballMat=mat(0xf4f5ed,.42);
  ball=new THREE.Mesh(new THREE.SphereGeometry(.72,20,16),ballMat);ball.position.set(0,.72,0);ball.castShadow=true;scene.add(ball);
  // Dark, soft fake shadow for the ball.
  ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.8,20),new THREE.MeshBasicMaterial({color:0x001208,transparent:true,opacity:.3,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;ballShadow.position.set(0,.105,0);scene.add(ballShadow);
  activeMesh=homePlayers[1];state.activePlayer=1;matchReady=true;resetKickoff(false);
}
function resetKickoff(announce=true){
  if(!matchReady)return;
  const h=[[-36,0],[-22,-15],[-22,15],[-6,-9],[-6,9],[-17,0]], a=[[36,0],[22,-15],[22,15],[6,-9],[6,9],[17,0]];
  homePlayers.forEach((p,i)=>{p.x=h[i][0];p.z=h[i][1];p.vx=p.vz=0;p.mesh.position.set(p.x,0,p.z);});
  awayPlayers.forEach((p,i)=>{p.x=a[i][0];p.z=a[i][1];p.vx=p.vz=0;p.mesh.position.set(p.x,0,p.z);});
  ball.position.set(0,.72,0);ballVelocity.set(0,0,0);state.activePlayer=1;activeMesh=homePlayers[1];state.lastGoalAt=state.elapsed;
  updateScoreboard();if(announce)showMatchMessage('KICK OFF!');
}
function updateScoreboard(){
  $('home-label').textContent=shortName(state.homeTeam);$('away-label').textContent=shortName(state.awayTeam);
  $('home-score').textContent=state.homeScore;$('away-score').textContent=state.awayScore;
}
function shortName(n){return n.replace(' United',' Utd').replace('Coastal Warriors','Coastal').replace('Mountain Lions','Mountain').replace('Royal Strikers','Royal').replace('Desert Falcons','Desert').replace('Ocean City FC','Ocean City');}
function showMatchMessage(msg){
  const el=$('match-message');el.textContent=msg;el.classList.add('show');clearTimeout(state.messageTimer);state.messageTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function resize3D(){
  if(!renderer||!camera)return;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.setSize(window.innerWidth,window.innerHeight);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
}
function animate(){
  if(!renderer||!scene||!camera)return;
  const dt=Math.min(clock.getDelta(),.04);
  if(state.running&&!state.paused&&!state.finished)updateMatch(dt);
  animatePlayers(dt);
  updateCamera(dt);
  renderer.render(scene,camera);
}
function updateMatch(dt){
  state.elapsed+=dt;
  const elapsedSeconds=Math.floor(state.elapsed);
  if(elapsedSeconds!==state.lastSecond){state.lastSecond=elapsedSeconds;updateClock();}
  if(state.elapsed>=state.duration){finishMatch();return;}
  const user=homePlayers[state.activePlayer]||homePlayers[1];
  // Joystick direction maps screen-up to forward along the pitch's negative Z.
  const ix=state.input.x, iz=state.input.y;
  const sprint=state.input.sprint;
  const moveSpeed=sprint?15:10;
  user.vx=ix*moveSpeed;user.vz=iz*moveSpeed;
  user.x=clamp(user.x+user.vx*dt,-pitchLength/2+2,pitchLength/2-2);
  user.z=clamp(user.z+user.vz*dt,-pitchWidth/2+2,pitchWidth/2-2);
  user.mesh.position.set(user.x,0,user.z);
  if(Math.abs(ix)+Math.abs(iz)>.1)user.mesh.rotation.y=Math.atan2(ix,iz);
  // Other home players support play and spread out instead of all chasing the ball.
  homePlayers.forEach(p=>{
    if(p===user)return;
    const target=homeSupportTarget(p,ball.position);
    moveToward(p,target.x,target.z,dt,6.3);
  });
  // Opponents press the ball selectively; the keeper guards goal area.
  const closestAway=awayPlayers.filter(p=>!p.keeper).sort((a,b)=>distance2(a,ball.position)-distance2(b,ball.position))[0];
  awayPlayers.forEach(p=>{
    let tx=p.homeX,tz=p.homeZ;
    if(p.keeper){tx= pitchLength/2-5;tz=clamp(ball.position.z*.25,-10,10);}
    else if(p===closestAway){tx=clamp(ball.position.x+4,-pitchLength/2+5,pitchLength/2-5);tz=ball.position.z;}
    else if(Math.abs(ball.position.x)>15){tx=p.homeX*.65+ball.position.x*.12;tz=p.homeZ*.7+ball.position.z*.3;}
    moveToward(p,tx,tz,dt,state.difficulty==='Hard'?7.7:state.difficulty==='Easy'?4.5:6.0);
  });
  // Basic player-ball interaction and possession.
  players.forEach(p=>{
    const d=Math.hypot(p.x-ball.position.x,p.z-ball.position.z);
    if(d<1.65 && ball.position.y<2.2 && ballVelocity.length()<7){
      const dir=new THREE.Vector3(ball.position.x-p.x,0,ball.position.z-p.z);
      if(dir.length()<.01)dir.set(p.team===0?1:-1,0,0);
      dir.normalize();ballVelocity.x=dir.x*1.8;ballVelocity.z=dir.z*1.8;
      if(p===user){ball.position.x=p.x+dir.x*1.15;ball.position.z=p.z+dir.z*1.15;}
    }
  });
  ballVelocity.multiplyScalar(Math.pow(.985,dt*60));
  ball.position.x+=ballVelocity.x*dt;ball.position.z+=ballVelocity.z*dt;
  if(ball.position.y>.72){ball.position.y-=9.8*dt; if(ball.position.y<.72)ball.position.y=.72;}
  ball.position.y=.72; // no aerial kick yet; rolling ball remains grounded in this prototype
  if(Math.abs(ball.position.z)>pitchWidth/2-.7){ball.position.z=Math.sign(ball.position.z)*(pitchWidth/2-.7);ballVelocity.z*=-.45;}
  if(Math.abs(ball.position.x)>pitchLength/2-.6){
    if(Math.abs(ball.position.z)<4.0){
      if(ball.position.x>0)state.homeScore++;else state.awayScore++;
      updateScoreboard();showMatchMessage('GOAL!');resetKickoff(false);
      state.elapsed=Math.max(0,state.elapsed-0.01);
    }else{ball.position.x=Math.sign(ball.position.x)*(pitchLength/2-.6);ballVelocity.x*=-.5;}
  }
  ball.rotation.x+=ballVelocity.z*dt;ball.rotation.z-=ballVelocity.x*dt;
  ballShadow.position.set(ball.position.x,.105,ball.position.z);
  drawMiniMap();
}
function homeSupportTarget(p,b){
  if(p.keeper)return{x:-pitchLength/2+5,z:clamp(b.z*.25,-10,10)};
  const push=b.x<-10?-.2:.22;
  return{x:clamp(p.homeX+b.x*push,-pitchLength/2+5,pitchLength/2-5),z:clamp(p.homeZ+b.z*.2,-pitchWidth/2+4,pitchWidth/2-4)};
}
function moveToward(p,tx,tz,dt,speed){
  const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);
  if(d>.5){const step=Math.min(d,speed*dt);p.vx=dx/d*speed;p.vz=dz/d*speed;p.x+=dx/d*step;p.z+=dz/d*step;p.mesh.rotation.y=Math.atan2(p.vx,p.vz);}
  else{p.vx*=.8;p.vz*=.8;}
  p.x=clamp(p.x,-pitchLength/2+2,pitchLength/2-2);p.z=clamp(p.z,-pitchWidth/2+2,pitchWidth/2-2);
  p.mesh.position.set(p.x,0,p.z);
}
function animatePlayers(dt){
  const t=performance.now()/1000;
  players.forEach(p=>{
    const moving=Math.hypot(p.vx||0,p.vz||0)>.9;
    p.mesh.userData.limbs.forEach(l=>{
      const swing=moving?Math.sin(t*10+p.phase)*(l.kind==='leg'?.55:.25):Math.sin(t*1.5+p.phase)*.035;
      l.mesh.rotation.x=swing*(l.kind==='leg'?1:-1);
    });
    p.mesh.position.y=moving?Math.abs(Math.sin(t*10+p.phase))*.035:0;
  });
}
function updateCamera(dt){
  if(!camera||!ball)return;
  const targetX=clamp(ball.position.x*.35,-12,12);
  const targetZ=clamp(ball.position.z*.3,-8,8);
  const desired=new THREE.Vector3(targetX,60,targetZ+76);
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  camera.lookAt(targetX,0,targetZ);
  camera.fov=window.innerWidth<window.innerHeight?52:44;camera.updateProjectionMatrix();
}
function updateClock(){
  const left=Math.max(0,state.duration-Math.floor(state.elapsed));
  const m=Math.floor(left/60),s=left%60;$('match-clock').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function drawMiniMap(){
  const c=$('mini-canvas');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#1b6737';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d9f3df';ctx.lineWidth=1.1;ctx.strokeRect(3,3,w-6,h-6);ctx.beginPath();ctx.moveTo(w/2,3);ctx.lineTo(w/2,h-3);ctx.stroke();ctx.beginPath();ctx.ellipse(w/2,h/2,12,12,0,0,Math.PI*2);ctx.stroke();
  players.forEach(p=>{ctx.fillStyle=p.team===0?'#50dfff':'#ff7d6a';const x=3+(p.x+pitchLength/2)/pitchLength*(w-6),y=3+(p.z+pitchWidth/2)/pitchWidth*(h-6);ctx.beginPath();ctx.arc(x,y,p.keeper?3.2:2.7,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(3+(ball.position.x+pitchLength/2)/pitchLength*(w-6),3+(ball.position.z+pitchWidth/2)/pitchWidth*(h-6),2.2,0,Math.PI*2);ctx.fill();
}
function distance2(p,b){return (p.x-b.x)**2+(p.z-b.z)**2;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

function startMatch(mode='match'){
  if(!matchReady){showToast('The 3D pitch is not ready yet.');return;}
  state.mode=mode;state.homeTeam=state.selectedHome;state.awayTeam=state.selectedAway;
  state.homeScore=0;state.awayScore=0;state.elapsed=0;state.lastSecond=-1;state.paused=false;state.finished=false;state.running=true;
  // Recolour existing outfield/keeper players when team selection changes.
  rebuildPlayersForTeams();
  resetKickoff(false);updateScoreboard();updateClock();
  $('pause-overlay').classList.add('hidden');$('fulltime-overlay').classList.add('hidden');
  screens.forEach(id=>$(id).classList.add('hidden'));$('game-ui').classList.remove('hidden');
  showMatchMessage(mode==='training'?'TRAINING MODE':'KICK OFF!');
  drawMiniMap();
}
function rebuildPlayersForTeams(){
  const home=team(state.homeTeam),away=team(state.awayTeam);
  homePlayers.forEach((p,i)=>recolorPlayer(p.mesh,i===0?0x4fd5ff:home.home));
  awayPlayers.forEach((p,i)=>recolorPlayer(p.mesh,i===0?0xff7e65:away.home));
}
function recolorPlayer(g,color){
  g.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){const y=o.position.y;if(y>1.5&&y<2.7)o.material.color.setHex(color);}});
}
function finishMatch(){
  state.running=false;state.finished=true;state.paused=false;
  const result=state.homeScore>state.awayScore?'VICTORY':state.homeScore<state.awayScore?'DEFEAT':'DRAW';
  $('result-title').textContent=result;$('final-score').textContent=`${state.homeScore} — ${state.awayScore}`;
  $('result-text').textContent=`${state.homeTeam} vs ${state.awayTeam} · Offline prototype`;
  $('fulltime-overlay').classList.remove('hidden');
  state.matchHistory.unshift({home:state.homeTeam,away:state.awayTeam,score:`${state.homeScore}-${state.awayScore}`,result,date:new Date().toLocaleString()});
  state.matchHistory=state.matchHistory.slice(0,20);
  showToast('Match complete. This result is stored only in this browser session.');
}
function pauseMatch(){if(!state.running)return;state.paused=true;$('pause-overlay').classList.remove('hidden');}
function resumeMatch(){state.paused=false;$('pause-overlay').classList.add('hidden');}
function shoot(){
  if(!state.running||state.paused)return;
  const p=homePlayers[state.activePlayer]||homePlayers[1];
  const charge=state.charging?clamp((performance.now()-state.chargeStart)/900,.3,1):.65;
  let dx=pitchLength/2-ball.position.x,dz=-ball.position.z;
  const length=Math.hypot(dx,dz)||1;dx/=length;dz/=length;
  if(Math.hypot(p.x-ball.position.x,p.z-ball.position.z)<4.5){ball.position.x=p.x+dx*1.8;ball.position.z=p.z+dz*1.8;}
  ballVelocity.set(dx*(18+charge*15),0,dz*(18+charge*15));
  showToast('SHOT!',850);
}
function pass(through=false){
  if(!state.running||state.paused)return;
  const p=homePlayers[state.activePlayer]||homePlayers[1];
  const candidates=homePlayers.filter(q=>q!==p&&!q.keeper).sort((a,b)=>distance2(a,ball.position)-distance2(b,ball.position));
  let target=candidates.find(q=>q.x>p.x-1)||candidates[0];
  if(!target){shoot();return;}
  const dx=target.x-p.x+(through?7:0),dz=target.z-p.z;
  const d=Math.hypot(dx,dz)||1;
  ball.position.set(p.x+dx/d*1.2,.72,p.z+dz/d*1.2);
  ballVelocity.set(dx/d*(through?18:13),0,dz/d*(through?18:13));
  showToast(through?'THROUGH PASS':'PASS',700);
}
function tackle(){
  if(!state.running||state.paused)return;
  const p=homePlayers[state.activePlayer]||homePlayers[1];
  const opponent=awayPlayers.filter(q=>!q.keeper).sort((a,b)=>distance2(a,ball.position)-distance2(b,ball.position))[0];
  if(opponent&&Math.hypot(p.x-opponent.x,p.z-opponent.z)<5){ballVelocity.set((p.x-opponent.x)*2,0,(p.z-opponent.z)*2);showToast('TACKLE!',700);}
  else shoot();
}
function switchPlayer(){
  const nearest=homePlayers.filter(p=>!p.keeper).sort((a,b)=>distance2(a,ball.position)-distance2(b,ball.position))[0];
  if(nearest){state.activePlayer=homePlayers.indexOf(nearest);activeMesh=nearest;showToast('PLAYER SWITCHED',650);}
}
function actionA(){
  if(!state.running||state.paused)return;
  const p=homePlayers[state.activePlayer]||homePlayers[1];
  if(Math.hypot(p.x-ball.position.x,p.z-ball.position.z)<5.2)shoot();else tackle();
}
function renderSubscreen(name){
  const root=$('sub-content');
  if(name==='teams'){
    root.innerHTML=`<div class="panel"><h3>Choose your teams</h3><p>Select your home and away sides. All clubs and badges are fictional and original.</p><div class="field-row"><label>Home team</label><select id="home-team-select">${teamData.map(t=>`<option ${t.name===state.selectedHome?'selected':''}>${t.name}</option>`).join('')}</select></div><div class="field-row"><label>Away team</label><select id="away-team-select">${teamData.map(t=>`<option ${t.name===state.selectedAway?'selected':''}>${t.name}</option>`).join('')}</select></div></div><div class="team-grid">${teamData.map(t=>`<button class="team-card ${(t.name===state.selectedHome||t.name===state.selectedAway)?'selected':''}" data-team="${t.name}"><div class="team-badge">${t.badge}</div><b>${t.name}</b><small>ATT ${t.attack} · MID ${t.mid} · DEF ${t.defence}</small><div class="kit-swatches"><i style="background:${t.home}"></i><i style="background:${t.away}"></i></div></button>`).join('')}</div><div class="panel" style="margin-top:14px"><button id="save-teams" class="btn primary" style="width:100%">CONFIRM TEAMS</button></div>`;
    $('home-team-select').onchange=e=>{state.selectedHome=e.target.value;};
    $('away-team-select').onchange=e=>{state.selectedAway=e.target.value;};
    root.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{const n=b.dataset.team;if(state.selectedHome===n)state.selectedAway=teamData.find(t=>t.name!==n).name;else state.selectedHome=n;renderSubscreen('teams');});
    $('save-teams').onclick=()=>{if(state.selectedHome===state.selectedAway){showToast('Choose two different teams.');return;}showToast('Teams saved for your next match.');setScreen('menu');};
  }else if(name==='formation'){
    root.innerHTML=`<div class="panel"><h3>Home tactics</h3><p>Choose a tactical preset. The current small-sided prototype uses simplified positions; full 11-player tactical placement is not yet implemented.</p><div class="formation-grid">${formations.map(f=>`<button class="formation-choice ${f===state.formation?'selected':''}" data-formation="${f}"><b>${f}</b><div class="formation-diagram"><div class="formation-dots">${formationRows(f).map(n=>`<span>${Array.from({length:n},()=>'<i></i>').join('')}</span>`).join('')}</div></div></button>`).join('')}</div><p id="formation-note" class="muted">Selected: ${state.formation}</p></div>`;
    root.querySelectorAll('[data-formation]').forEach(b=>b.onclick=()=>{state.formation=b.dataset.formation;renderSubscreen('formation');showToast(`Formation ${state.formation} selected.`);});
  }else if(name==='training'){
    root.innerHTML=`<div class="panel"><h3>Training Ground</h3><p>Practice the basics in a short offline session. Use the joystick to move; A to shoot or tackle; B to pass or switch; C for a through pass; SPRINT to move faster.</p><div class="warning-box">This is a small-sided gameplay prototype. Advanced drills, goalkeeping drills and full team training will be added in later stages.</div><button id="start-training" class="btn primary" style="width:100%;margin-top:15px">START TRAINING</button></div><div class="panel"><h3>Control guide</h3><p>JOYSTICK — move the selected player<br>A — shoot when close to the ball, otherwise attempt a tackle<br>B — pass / switch to nearest player<br>C — through pass<br>SPRINT — hold to run faster</p></div>`;
    $('start-training').onclick=()=>startMatch('training');
  }else if(name==='settings'){
    root.innerHTML=`<div class="panel"><h3>Gameplay settings</h3>${settingRange('Control size','control-size',50,130,state.controlSize*100,'%')}${settingRange('Control transparency','control-opacity',25,100,state.controlOpacity*100,'%')}<div class="field-row"><label>Graphics quality</label><select id="graphics-select"><option ${state.graphics==='Performance'?'selected':''}>Performance</option><option ${state.graphics==='Balanced'?'selected':''}>Balanced</option><option ${state.graphics==='Quality'?'selected':''}>Quality</option></select></div><div class="field-row"><label>Difficulty</label><select id="difficulty-select"><option>Easy</option><option ${state.difficulty==='Normal'?'selected':''}>Normal</option><option ${state.difficulty==='Hard'?'selected':''}>Hard</option></select></div><div class="field-row"><label>Match duration</label><select id="duration-select"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option></select></div><button id="save-settings" class="btn primary" style="width:100%">SAVE SETTINGS</button></div><div class="warning-box">Audio and vibration support depend on browser permissions and device capabilities. Account security and online settings are not available yet.</div>`;
    $('control-size').oninput=e=>{state.controlSize=Number(e.target.value)/100;applyControlSettings();};
    $('control-opacity').oninput=e=>{state.controlOpacity=Number(e.target.value)/100;applyControlSettings();};
    $('graphics-select').onchange=e=>state.graphics=e.target.value;
    $('difficulty-select').onchange=e=>state.difficulty=e.target.value;
    $('duration-select').onchange=e=>state.duration=Number(e.target.value);
    $('save-settings').onclick=()=>{localStorage.setItem('beastFootballPrefs',JSON.stringify({controlSize:state.controlSize,controlOpacity:state.controlOpacity,graphics:state.graphics,difficulty:state.difficulty,duration:state.duration,formation:state.formation}));applyControlSettings();showToast('Settings saved on this device.');setScreen('menu');};
  }else if(name==='profile'){
    root.innerHTML=`<div class="panel"><div class="team-badge">♌</div><h3>Guest Player</h3><p>Offline guest session · no account connected</p><div class="profile-stat-grid"><div class="stat-box"><strong>${state.matchHistory.length}</strong><small>Matches this session</small></div><div class="stat-box"><strong>${state.matchHistory.filter(m=>m.result==='VICTORY').length}</strong><small>Wins this session</small></div><div class="stat-box"><strong>—</strong><small>Online rank</small></div></div></div><div class="warning-box">Real player accounts and cloud statistics require a secure backend. These session statistics are not an online profile.</div>`;
  }else if(name==='inventory'){
    root.innerHTML=`<div class="panel"><h3>Virtual Inventory</h3><p>Demo inventory only. No purchases or tradable items are available.</p><div class="stat-box"><strong>1,000</strong><small>VIRTUAL PRACTICE POINTS · NOT MONEY</small></div></div><div class="warning-box">Practice points have no cash value and cannot be transferred, deposited, withdrawn or redeemed.</div>`;
  }else if(name==='history'){
    root.innerHTML=`<div class="panel"><h3>Match History</h3><p>Only matches completed during this page session are listed.</p>${state.matchHistory.length?state.matchHistory.map(m=>`<div class="field-row"><label><b>${m.home}</b> vs <b>${m.away}</b><br><small>${m.date}</small></label><strong>${m.score}</strong></div>`).join(''):'<p>No completed matches yet. Play an offline match to see a result here.</p>'}</div>`;
  }
}
function formationRows(f){return f==='4-4-2'?[1,4,4,2]:f==='4-3-3'?[1,4,3,3]:f==='4-2-3-1'?[1,4,2,3,1]:f==='3-5-2'?[1,3,5,2]:[1,5,3,2];}
function settingRange(label,id,min,max,value,suffix){return `<div class="field-row"><label>${label} <span id="${id}-value">${Math.round(value)}${suffix}</span></label><input id="${id}" type="range" min="${min}" max="${max}" value="${Math.round(value)}"></div>`;}
function applyControlSettings(){
  const scale=state.controlSize,opacity=state.controlOpacity;
  $('joystick-base').style.transform=`scale(${scale})`; $('joystick-base').style.transformOrigin='bottom left';
  document.querySelectorAll('.action-button').forEach(b=>{b.style.opacity=opacity;b.style.transform=`scale(${scale})`;});
  $('joystick-base').style.opacity=opacity;
}
function openQuickMatch(){
  const content=`<div class="panel"><h3>Match Setup</h3><p>Choose a quick offline match. The current playable format is a small-sided prototype with six players per team, including a simplified goalkeeper.</p><div class="field-row"><label>Home team</label><select id="quick-home">${teamData.map(t=>`<option ${t.name===state.selectedHome?'selected':''}>${t.name}</option>`).join('')}</select></div><div class="field-row"><label>Away team</label><select id="quick-away">${teamData.map(t=>`<option ${t.name===state.selectedAway?'selected':''}>${t.name}</option>`).join('')}</select></div><div class="field-row"><label>Match duration</label><select id="quick-duration"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option></select></div><div class="field-row"><label>Difficulty</label><select id="quick-difficulty"><option>Easy</option><option selected>Normal</option><option>Hard</option></select></div><div class="field-row"><label>Stadium</label><select id="quick-stadium"><option>Beast Arena</option></select></div><div class="warning-box">Available now: offline small-sided prototype. Full 11v11 and online matches are not yet implemented.</div><button id="confirm-quick" class="btn primary" style="width:100%;margin-top:15px">CONFIRM & KICK OFF</button></div>`;
  openSub('quick','Quick Match');$('sub-content').innerHTML=content;
  $('confirm-quick').onclick=()=>{state.selectedHome=$('quick-home').value;state.selectedAway=$('quick-away').value;if(state.selectedHome===state.selectedAway){showToast('Choose two different teams.');return;}state.duration=Number($('quick-duration').value);state.difficulty=$('quick-difficulty').value;startMatch('match');};
}
function bindUI(){
  $('loading-retry').onclick=()=>location.reload();
  $('intro-play').onclick=()=>setScreen('menu');$('intro-guest').onclick=()=>setScreen('menu');
  $('intro-signin').onclick=()=>showToast('Sign-in is coming soon; guest play is available now.');
  $('intro-settings').onclick=()=>openSub('settings','Settings');$('menu-settings').onclick=()=>openSub('settings','Settings');
  $('sound-toggle').onclick=()=>{state.sound=!state.sound;$('sound-toggle').textContent=state.sound?'🔊':'🔇';showToast(state.sound?'Sound enabled (audio effects not yet implemented).':'Sound muted.');};
  $('drawer-open').onclick=toggleDrawer;$('drawer-close').onclick=closeDrawer;$('drawer-backdrop').onclick=closeDrawer;
  $('sub-back').onclick=()=>setScreen('menu');
  $('quick-match').onclick=openQuickMatch;$('practice-match').onclick=()=>startMatch('match');
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>openSub(b.dataset.screen,b.querySelector('b').textContent));
  document.querySelectorAll('[data-coming]').forEach(b=>b.onclick=()=>showToast(`${b.dataset.coming}: COMING SOON. This feature is not connected yet.`));
  $('drawer-items').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const d=b.dataset.dest;closeDrawer();
    if(d==='home'){setScreen('menu');return;}
    if(d==='quick'){openQuickMatch();return;}
    if(d==='practice'){startMatch('match');return;}
    if(['online','tournaments','rankings','help'].includes(d)){showToast(`${d[0].toUpperCase()+d.slice(1)} is coming soon.`);return;}
    const titles={teams:'Team Selection',formation:'Formation',training:'Training',history:'Match History',profile:'My Profile',inventory:'Inventory',settings:'Settings'};
    openSub(d,titles[d]||d);
  });
  $('pause-button').onclick=pauseMatch;$('resume-match').onclick=resumeMatch;
  $('restart-match').onclick=()=>{if(confirm('Restart this match? Current score will be reset.'))startMatch(state.mode);};
  $('pause-settings').onclick=()=>{state.paused=true;openSub('settings','Settings');showToast('Return to the menu to resume a match after settings.');};
  $('leave-match').onclick=()=>{if(confirm('Leave this match and return to the main menu?')){state.running=false;state.paused=false;$('pause-overlay').classList.add('hidden');$('game-ui').classList.add('hidden');setScreen('menu');}};
  $('rematch-button').onclick=()=>startMatch(state.mode);$('result-menu').onclick=()=>{ $('fulltime-overlay').classList.add('hidden');$('game-ui').classList.add('hidden');setScreen('menu');};
  // Virtual joystick pointer handling.
  const zone=$('joystick-zone'),base=$('joystick-base'),knob=$('joystick-knob');let pointerId=null;
  function joystickMove(e){
    if(pointerId!==e.pointerId)return;const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.31,d=Math.hypot(dx,dy);if(d>max){dx=dx/d*max;dy=dy/d*max;}
    knob.style.transform=`translate(${dx}px,${dy}px)`;state.input.x=clamp(dx/max,-1,1);state.input.y=clamp(dy/max,-1,1);
  }
  zone.addEventListener('pointerdown',e=>{pointerId=e.pointerId;zone.setPointerCapture(pointerId);joystickMove(e);e.preventDefault();});
  zone.addEventListener('pointermove',e=>{if(pointerId===e.pointerId)joystickMove(e);});
  function joystickEnd(e){if(pointerId!==e.pointerId)return;pointerId=null;state.input.x=state.input.y=0;knob.style.transform='translate(0,0)';}
  zone.addEventListener('pointerup',joystickEnd);zone.addEventListener('pointercancel',joystickEnd);zone.addEventListener('lostpointercapture',joystickEnd);
  const bindAction=(id,fn,hold=false)=>{const b=$(id);b.addEventListener('pointerdown',e=>{b.classList.add('pressed');if(hold){state.charging=true;state.chargeStart=performance.now();}else fn();e.preventDefault();});const end=()=>{b.classList.remove('pressed');if(hold&&state.charging){state.charging=false;shoot();}};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('pointerleave',()=>b.classList.remove('pressed'));};
  bindAction('button-a',actionA);bindAction('button-b',()=>{if(state.running){const p=homePlayers[state.activePlayer];const opponent=awayPlayers.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<4);if(opponent)switchPlayer();else pass(false);}});
  bindAction('button-c',()=>pass(true));
  $('sprint-button').addEventListener('pointerdown',e=>{state.input.sprint=true;$('sprint-button').classList.add('pressed');e.preventDefault();});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>$('sprint-button').addEventListener(ev,()=>{state.input.sprint=false;$('sprint-button').classList.remove('pressed');}));
  // Optional keyboard support for desktop testing.
  window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'&&state.running)state.paused?resumeMatch():pauseMatch();if(e.key===' '&&state.running)shoot();if(e.key.toLowerCase()==='x'&&state.running)pass(false);if(e.key.toLowerCase()==='c'&&state.running)pass(true);});
  window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  window.addEventListener('beforeunload',()=>{if(renderer){renderer.setAnimationLoop(null);renderer.dispose();}});
}
function loadPreferences(){
  try{const p=JSON.parse(localStorage.getItem('beastFootballPrefs')||'{}');Object.assign(state,p);applyControlSettings();}catch(e){console.warn('Preferences unavailable',e);}
}
async function boot(){
  bindUI();loadPreferences();
  setLoading(12,'Building the stadium…');
  const ok=init3D();
  if(!ok)return;
  setLoading(65,'Preparing players and ball…');
  await new Promise(r=>setTimeout(r,250));
  setLoading(100,'Ready to play');
  await new Promise(r=>setTimeout(r,450));
  $('loading').classList.add('hidden');$('intro').classList.remove('hidden');
  // Keep an attractive scene behind intro; use a distant pitch view.
  camera.position.set(0,58,78);camera.lookAt(0,0,0);
  drawMiniMap();updateScoreboard();updateClock();
}
boot();
