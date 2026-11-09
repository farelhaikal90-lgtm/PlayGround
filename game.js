import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x69766b);
scene.fog = new THREE.Fog(0x69766b, 45, 115);
const camera = new THREE.OrthographicCamera(-27,27,15.2,-15.2,.1,180);
camera.position.set(24,30,24);
const target = new THREE.Vector3();
const clock = new THREE.Clock();
const mats = {};
const mat = (name,color,roughness=.9,opts={}) => mats[name] ||= new THREE.MeshStandardMaterial({color,roughness,...opts});
const boxGeo = new THREE.BoxGeometry(1,1,1);
const sphereGeo = new THREE.SphereGeometry(1,12,8);
const cylGeo = new THREE.CylinderGeometry(.5,.5,1,9);
const planeGeo = new THREE.PlaneGeometry(1,1);
const world = new THREE.Group(); scene.add(world);
const buildingBoxes=[]; const zombies=[]; const bullets=[]; const pickups=[]; const decorations=[];
let running=false, over=false, health=100, ammo=24, kills=0, collected=0, elapsed=0, wave=1, shootCooldown=0, spawnClock=0, toastClock=0, hitCooldown=0;
let moveX=0, moveZ=0, sprint=false, fireHeld=false, keys={};
const WORLD=49;

scene.add(new THREE.HemisphereLight(0xc9d9c6,0x29352c,2.0));
const sun=new THREE.DirectionalLight(0xffe6c6,3.2); sun.position.set(-28,45,-16); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55; sun.shadow.camera.right=55; sun.shadow.camera.top=55; sun.shadow.camera.bottom=-55; sun.shadow.bias=-.0005; scene.add(sun);
const fill=new THREE.DirectionalLight(0x97b8ae,.8); fill.position.set(32,18,30); scene.add(fill);

function mesh(geometry,material,parent=world){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function block(x,y,z,sx,sy,sz,material,parent=world){const m=mesh(boxGeo,material,parent);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m}
function flat(x,z,sx,sz,color,y=.025){const m=mesh(planeGeo,mat('flat'+color,color));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.scale.set(sx,sz,1);return m}

// Concrete city ground, tiled streets and faded lane paint.
flat(0,0,110,110,0x687267,-.06);
for(let i=-5;i<=5;i++){
  const pos=i*14;
  flat(pos,0,7.4,105,0x37423d,-.025); flat(0,pos,105,7.4,0x37423d,-.024);
  flat(pos,0,.12,105,0x839080,-.012); flat(0,pos,105,.12,0x839080,-.011);
  for(let n=-4;n<=4;n++){
    const p=n*12+6;
    flat(pos,p,.12,2.1,0x9b9b77,-.008); flat(p,pos,2.1,.12,0x9b9b77,-.008);
  }
}
// Urban blocks; buildings sit between roads with small variation and rooftop detail.
const colors=[0x74786b,0x837b6d,0x6f7770,0x8b8172,0x68746d,0x827d70,0x73776e];
const rng=(()=>{let s=8721;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})();
for(let gx=-3;gx<=3;gx++)for(let gz=-3;gz<=3;gz++){
 if(gx===0&&gz===0)continue;
 const bx=gx*14,bz=gz*14;
 // A block is a courtyard, two to three irregular buildings.
 const count=1+(rng()>.44?1:0)+(rng()>.86?1:0);
 for(let j=0;j<count;j++){
   const sx=4.2+rng()*4.1, sz=4.2+rng()*4.2;
   const x=bx+(rng()-.5)*5.6,z=bz+(rng()-.5)*5.6;
   const h=3.4+rng()*8.5;
   const base=block(x,h/2,z,sx,h,sz,mat('building'+Math.floor(rng()*colors.length),colors[Math.floor(rng()*colors.length)]));
   base.material=mat('b'+Math.floor(rng()*colors.length),colors[Math.floor(rng()*colors.length)]);
   buildingBoxes.push({x,z,hx:sx/2+.38,hz:sz/2+.38});
   // Roof parapet and water tank / rooftop unit.
   block(x,h+.11,z,sx+.12,.22,sz+.12,mat('roofedge',0x555d54));
   const roofX=x+(rng()-.5)*sx*.45,roofZ=z+(rng()-.5)*sz*.45;
   block(roofX,h+.32,roofZ,.9,.42,.8,mat('roofunit',0x414c46));
   // A few painted facade windows on the street-facing sides.
   const winMat=mat('windows',0x9da88d,.45,{emissive:0x273329,emissiveIntensity:.22});
   for(let wx=-1;wx<=1;wx++)for(let wy=0;wy<Math.min(3,Math.floor(h/2.7));wy++){
     const yy=1.35+wy*2.15;
     if(rng()>.3){const w=block(x+wx*sx*.24,yy,z+sz/2+.012,.58,.82,.035,winMat);w.castShadow=false;}
     if(rng()>.46){const w=block(x+sx/2+.012,yy,z+wx*sz*.24,.035,.82,.58,winMat);w.castShadow=false;}
   }
   // Door.
   block(x,1,z+sz/2+.025,.85,1.8,.07,mat('door',0x3e4841));
 }
 // Curbs and occasional sidewalk clutter.
}
// Roadside wrecks, lamps, barriers, trash and scattered city props.
for(let i=0;i<34;i++){
 const x=(rng()-.5)*91,z=(rng()-.5)*91;
 if(Math.abs(x%14)<4.5||Math.abs(z%14)<4.5)continue;
 const angle=rng()*Math.PI*2;
 if(i%4===0){const car=new THREE.Group();car.position.set(x,.35,z);car.rotation.y=angle;world.add(car);
   block(0,.35,0,2.4,.48,4.2,mat('car'+i,[0x485a52,0x7d483c,0x555d64,0x88816a][i%4]),car);
   block(0,.68,-.25,1.9,.45,2.05,mat('glass',0x354c49,.3,{metalness:.1}),car);
   for(const a of [-1,1])for(const b of [-1,1]){const wheel=mesh(cylGeo,mat('tire',0x232925),car);wheel.rotation.z=Math.PI/2;wheel.scale.set(.32,.19,.32);wheel.position.set(a*1.14,.12,b*1.35)}
 }else if(i%4===1){const trunk=mesh(cylGeo,mat('treebark',0x524c3e));trunk.position.set(x,.9,z);trunk.scale.set(.25,1.8,.25);const crown=mesh(sphereGeo,mat('treeleaf',0x435746));crown.position.set(x,2.05,z);crown.scale.set(1.15,1.4,1.1);}
 else {block(x,.45,z,.9,.9,.9,mat('rubble',i%2?0x505c52:0x8c8170));}
}
// Road lamps, purposeful but sparse.
for(let k=-3;k<=3;k++)for(let axis=0;axis<2;axis++){
 const x=axis===0?k*14+4: k*14, z=axis===0?k*14: k*14+4;
 const pole=mesh(cylGeo,mat('lampPole',0x333e38));pole.position.set(x,2.25,z);pole.scale.set(.09,4.5,.09);
 block(x,4.5,z,.55,.13,.24,mat('lampHead',0xb7bd8e,.55,{emissive:0x636641,emissiveIntensity:.15}));
}
// Player survivor, simple readable low-poly silhouette.
const player=new THREE.Group();world.add(player);
const body=mesh(new THREE.CapsuleGeometry(.47,.62,3,7),mat('survivor',0x536e54),player);body.position.y=.9;
const vest=mesh(new THREE.BoxGeometry(.78,.68,.42),mat('vest',0x343e38),player);vest.position.set(0,1.05,0);
const head=mesh(sphereGeo,mat('skin',0xc18e68),player);head.position.set(0,1.75,0);head.scale.set(.34,.38,.34);
const hair=mesh(sphereGeo,mat('hair',0x29352d),player);hair.position.set(0,1.95,-.02);hair.scale.set(.34,.17,.34);
const pack=mesh(new THREE.BoxGeometry(.49,.65,.25),mat('pack',0x866d43),player);pack.position.set(0,1.08,-.42);
const arm1=mesh(cylGeo,mat('sleeve',0x586652),player);arm1.position.set(.5,1.14,.03);arm1.rotation.z=-.42;arm1.scale.set(.15,.72,.15);
const arm2=mesh(cylGeo,mat('sleeve',0x586652),player);arm2.position.set(-.5,1.14,.03);arm2.rotation.z=.42;arm2.scale.set(.15,.72,.15);
const gun=block(.45,1.25,.48,.18,.18,.9,mat('gun',0x202723),player);gun.castShadow=false;
const leg1=mesh(cylGeo,mat('pants',0x343d39),player);leg1.position.set(-.2,.34,0);leg1.scale.set(.19,.62,.19);
const leg2=mesh(cylGeo,mat('pants',0x343d39),player);leg2.position.set(.2,.34,0);leg2.scale.set(.19,.62,.19);
const shadowDisc=mesh(new THREE.CircleGeometry(.82,20),new THREE.MeshBasicMaterial({color:0x111914,transparent:true,opacity:.38,depthWrite:false}),player);shadowDisc.rotation.x=-Math.PI/2;shadowDisc.position.y=.05;shadowDisc.castShadow=false;
const playerLight=new THREE.PointLight(0xc6f36b,2.2,8);playerLight.position.set(0,2,0);player.add(playerLight);

// Supply cases and extraction beacon.
const supplyPositions=[new THREE.Vector3(-31,0,-13),new THREE.Vector3(27,0,-31),new THREE.Vector3(-27,0,31)];
const extractionPos=new THREE.Vector3(35,0,35);
function addCase(pos,index){const g=new THREE.Group();g.position.copy(pos);world.add(g);block(0,.45,0,1.35,.9,1.05,mat('case',0x9c7d42),g);block(0,.94,0,1.38,.13,1.08,mat('caseTop',0xb69a57),g);block(0,.98,0,.22,.07,1.1,mat('caseStripe',0xd6c66d),g);block(0,.53,.55,.45,.19,.06,mat('caseLock',0x29332c),g);const glow=new THREE.PointLight(0xc6f36b,1.5,7);glow.position.y=1.4;g.add(glow);const ring=mesh(new THREE.TorusGeometry(1.1,.045,5,24),new THREE.MeshBasicMaterial({color:0xc6f36b,transparent:true,opacity:.8}),g);ring.rotation.x=Math.PI/2;ring.position.y=.04;pickups.push({group:g,pos,ring,index,got:false});}
supplyPositions.forEach(addCase);
const extraction=new THREE.Group();extraction.position.copy(extractionPos);world.add(extraction);
const exRing=mesh(new THREE.TorusGeometry(2.2,.11,6,36),new THREE.MeshBasicMaterial({color:0xf15d50,transparent:true,opacity:.72}),extraction);exRing.rotation.x=Math.PI/2;exRing.position.y=.09;
const exBeam=mesh(new THREE.CylinderGeometry(.04,.62,8,16,1,true),new THREE.MeshBasicMaterial({color:0xf15d50,transparent:true,opacity:.13,depthWrite:false}),extraction);exBeam.position.y=4;
const exLight=new THREE.PointLight(0xf15d50,2,13);exLight.position.y=2;extraction.add(exLight);
block(0,.3,0,.7,.6,.7,mat('flare',0xf15d50),extraction);

function createZombie(x,z){
 const g=new THREE.Group();g.position.set(x,0,z);world.add(g);
 const tone=[0x71836a,0x827f68,0x607869,0x8d755f][Math.floor(rng()*4)];
 const skin=mat('zskin'+tone,tone); const cloth=mat('zcloth'+tone,[0x493f3b,0x3d4c43,0x4b5143,0x493a36][Math.floor(rng()*4)]);
 const torso=mesh(new THREE.CapsuleGeometry(.4,.55,2,6),cloth,g);torso.position.y=.81;torso.rotation.z=(rng()-.5)*.24;
 const zhead=mesh(sphereGeo,skin,g);zhead.position.set(0,1.52,.04);zhead.scale.set(.31,.34,.31);
 const eyeMat=mat('ze',0xe8c878,.4,{emissive:0x493918,emissiveIntensity:.6});
 for(const a of [-1,1]){const eye=mesh(sphereGeo,eyeMat,g);eye.position.set(a*.13,1.55,.31);eye.scale.set(.045,.05,.035)}
 for(const a of [-1,1]){const arm=mesh(cylGeo,cloth,g);arm.position.set(a*.5,1.03,.22);arm.rotation.x=-.8;arm.rotation.z=a*.18;arm.scale.set(.12,.79,.13);const leg=mesh(cylGeo,cloth,g);leg.position.set(a*.2,.32,0);leg.scale.set(.16,.59,.16)}
 const shadow=mesh(new THREE.CircleGeometry(.62,16),new THREE.MeshBasicMaterial({color:0x0b100d,transparent:true,opacity:.3,depthWrite:false}),g);shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;shadow.castShadow=false;
 const hp=Math.random()>.8?2:1;
 zombies.push({group:g,hp,speed:1.05+rng()*.42,attack:0,walk:rng()*6,dead:false});
}
function spawnZombie(){
 let x,z,tries=0;do{const angle=rng()*Math.PI*2,dist=20+rng()*25;x=player.position.x+Math.cos(angle)*dist;z=player.position.z+Math.sin(angle)*dist;tries++;}while((Math.abs(x)>WORLD||Math.abs(z)>WORLD||blocked(x,z))&&tries<30);
 if(Math.abs(x)<WORLD&&Math.abs(z)<WORLD)createZombie(x,z);
}
function blocked(x,z,r=.65){return buildingBoxes.some(b=>x>b.x-b.hx-r&&x<b.x+b.hx+r&&z>b.z-b.hz-r&&z<b.z+b.hz+r)}
function moveWithCollision(obj,dx,dz,r=.4){let nx=obj.position.x+dx,nz=obj.position.z+dz;if(!blocked(nx,obj.position.z,r))obj.position.x=nx;if(!blocked(obj.position.x,nz,r))obj.position.z=nz;obj.position.x=THREE.MathUtils.clamp(obj.position.x,-WORLD+1,WORLD-1);obj.position.z=THREE.MathUtils.clamp(obj.position.z,-WORLD+1,WORLD-1)}
function addBullet(zombie){const from=new THREE.Vector3(player.position.x,.9,player.position.z);const to=new THREE.Vector3(zombie.group.position.x,.8,zombie.group.position.z);const dir=to.clone().sub(from).normalize();const orb=mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffe391}),world);orb.position.copy(from);const glow=new THREE.PointLight(0xffbe61,.6,2);orb.add(glow);bullets.push({mesh:orb,dir,target:zombie,life:.27});zombie.hp--;if(zombie.hp<=0){zombie.dead=true;kills++;zombie.group.visible=false;const drop=Math.random()<.16;if(drop)addAmmoPickup(zombie.group.position.x,zombie.group.position.z);updateHud();}}
function addAmmoPickup(x,z){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);block(0,.3,0,.55,.45,.48,mat('ammoBox',0xd5be72),g);pickups.push({group:g,pos:g.position,ring:null,got:false,ammo:true});}

function updateHud(){document.querySelector('#health-value').textContent=Math.ceil(health);document.querySelector('#health-bar').style.width=Math.max(0,health)+'%';document.querySelector('#ammo-value').textContent=ammo;document.querySelector('#kill-value').textContent=String(kills).padStart(2,'0');document.querySelector('#wave-value').textContent=String(wave).padStart(2,'0');document.querySelector('#objective-text').textContent=collected<3?'KUMPULKAN PERBEKALAN':'MENUJU EKSTRAKSI';document.querySelector('#objective-sub').textContent=collected<3?`Kotak suplai ${collected} / 3`:'Capai titik ekstraksi';const pips=document.querySelector('#ammo-pips');pips.innerHTML='';for(let i=0;i<24;i++){const e=document.createElement('i');if(i>=ammo)e.className='empty';pips.append(e)}}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');toastClock=2.2}
function damage(amount){if(hitCooldown>0)return;health=Math.max(0,health-amount);hitCooldown=.6;document.querySelector('#hit-flash').classList.remove('active');void document.querySelector('#hit-flash').offsetWidth;document.querySelector('#hit-flash').classList.add('active');updateHud();if(health<=0)finish(false)}
function finish(win){running=false;over=true;document.querySelector('#end-screen').classList.add('visible');document.querySelector('#end-eyebrow').textContent=win?'MISI SELESAI // EKSTRAKSI':'SIARAN TERPUTUS';document.querySelector('#end-title').innerHTML=win?'KAMU<br><em>SELAMAT.</em>':'KAMU<br><em>TERTANGKAP.</em>';document.querySelector('#end-copy').textContent=win?'Kamu berhasil keluar dari Sektor 07.':'Jakarta jatuh. Coba lagi, survivor.';document.querySelector('#result-kills').textContent=kills;document.querySelector('#result-time').textContent=timeString(elapsed);}
function timeString(n){const s=Math.floor(n);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function restart(){location.reload()}

function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const aspect=w/h;const hh=aspect<1?34:27;camera.left=-hh*aspect;camera.right=hh*aspect;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);new ResizeObserver(resize).observe(document.querySelector('#viewport'));resize();

function start(){document.querySelector('#start-screen').classList.remove('visible');document.querySelector('#pause-screen').classList.remove('visible');document.querySelector('#end-screen').classList.remove('visible');running=true;over=false;}
document.querySelector('#start-btn').addEventListener('click',start);
document.querySelector('#resume-btn').addEventListener('click',()=>{document.querySelector('#pause-screen').classList.remove('visible');running=true});
document.querySelector('#restart-btn').addEventListener('click',restart);
document.querySelector('#pause-btn').addEventListener('click',()=>{if(over)return;running=!running;document.querySelector('#pause-screen').classList.toggle('visible',!running)});

window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'&& !over){running=!running;document.querySelector('#pause-screen').classList.toggle('visible',!running)}});
window.addEventListener('keyup',e=>keys[e.code]=false);
const joy=document.querySelector('#joystick'),knob=document.querySelector('#joy-knob');let joyPointer=null;
function joyMove(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.34,d=Math.hypot(dx,dy);if(d>max){dx*=max/d;dy*=max/d}knob.style.transform=`translate(${dx}px,${dy}px)`;moveX=dx/max;moveZ=dy/max}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e)});joy.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId)joyMove(e)});const joyEnd=e=>{if(joyPointer===e.pointerId){joyPointer=null;moveX=moveZ=0;knob.style.transform=''}};joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
const fireButton=document.querySelector('#fire-touch');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();fireHeld=true;fireButton.classList.add('active');fireButton.setPointerCapture(e.pointerId)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(ev,()=>{fireHeld=false;fireButton.classList.remove('active')});
const runButton=document.querySelector('#run-touch');runButton.addEventListener('pointerdown',e=>{e.preventDefault();sprint=true;runButton.classList.add('active');runButton.setPointerCapture(e.pointerId)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])runButton.addEventListener(ev,()=>{sprint=false;runButton.classList.remove('active')});

function update(dt){
 if(!running)return;
 elapsed+=dt;shootCooldown-=dt;spawnClock-=dt;hitCooldown-=dt;toastClock-=dt;if(toastClock<=0)document.querySelector('#toast').classList.remove('show');
 const keyX=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),keyZ=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);
 let mx=moveX||keyX,mz=moveZ||keyZ;const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml}
 const isRun=sprint||keys.ShiftLeft||keys.ShiftRight;const speed=isRun?8.7:5.5;
 moveWithCollision(player,mx*speed*dt,mz*speed*dt,.45);
 if(ml>.08){player.rotation.y=Math.atan2(mx,mz);leg1.rotation.x=Math.sin(elapsed*11)*.48;leg2.rotation.x=-Math.sin(elapsed*11)*.48;}
 const desiredFire=fireHeld||keys.Space||keys.KeyF;
 // Auto-fire at the nearest visible infected, conserving ammo unless the player asks to fire.
 let nearest=null,nearestD=desiredFire?17:12;
 for(const z of zombies){if(z.dead)continue;const d=player.position.distanceTo(z.group.position);if(d<nearestD){nearest=z;nearestD=d}}
 if(nearest&&shootCooldown<=0&&(desiredFire||nearestD<10)){if(ammo>0){addBullet(nearest);ammo--;shootCooldown=desiredFire?.25:.62;updateHud();}else if(desiredFire){toast('AMUNISI HABIS — CARI KOTAK SUPLAI');shootCooldown=.8}}
 // Animated zombies follow and swipe at close range.
 for(const z of zombies){if(z.dead)continue;z.walk+=dt*7;const delta=new THREE.Vector3(player.position.x-z.group.position.x,0,player.position.z-z.group.position.z);const d=delta.length();if(d>.8){delta.normalize();const factor=d<2.1?.35:1;moveWithCollision(z.group,delta.x*z.speed*factor*dt,delta.z*z.speed*factor*dt,.36);z.group.rotation.y=Math.atan2(delta.x,delta.z);z.group.position.y=Math.sin(z.walk)*.035;}if(d<1.6){z.attack-=dt;if(z.attack<=0){damage(9);z.attack=1.15}}}
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.dir,26*dt);if(b.life<=0){world.remove(b.mesh);bullets.splice(i,1)}}
 for(const p of pickups){if(p.got)continue;if(p.ring)p.ring.rotation.z+=dt*.8;const d=player.position.distanceTo(p.pos);if(d<1.8){p.got=true;world.remove(p.group);if(p.ammo){ammo=Math.min(24,ammo+8);toast('AMUNISI +8')}else{collected++;toast(`SUPLAI DIAMANKAN ${collected} / 3`);if(collected===3){exRing.material.color.setHex(0xc6f36b);exBeam.material.color.setHex(0xc6f36b);exLight.color.setHex(0xc6f36b);toast('EKSTRAKSI TERBUKA — MENUJU TITIK HIJAU')}}updateHud()}}
 extraction.rotation.y+=dt*.4;const exitD=player.position.distanceTo(extractionPos);if(collected>=3&&exitD<2.5){finish(true);return}
 // Waves intensify steadily, with a soft cap for mobile performance.
 const nextWave=1+Math.floor(elapsed/38);if(nextWave!==wave){wave=nextWave;updateHud();toast(`WAVE ${String(wave).padStart(2,'0')} — MUSUH BERTAMBAH`)}if(spawnClock<=0&&zombies.filter(z=>!z.dead).length<Math.min(5+wave*2,15)){spawnZombie();spawnClock=Math.max(.65,2.6-wave*.23)}
 // camera tracks the survivor from an isometric bird's-eye angle.
 target.set(player.position.x,0,player.position.z);const offset=new THREE.Vector3(20,27,20);camera.position.copy(target).add(offset);camera.lookAt(target);
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);update(dt);if(!running){const t=clock.elapsedTime;extraction.rotation.y+=dt*.4;for(const p of pickups)if(p.ring)p.ring.rotation.z+=dt*.8;}
 renderer.render(scene,camera)}
updateHud();animate();
