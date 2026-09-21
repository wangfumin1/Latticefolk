import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type {
  DecisionAction, DecisionRequest, DecisionResponse, DialogueRequest, DialogueResponse,
  ItemKind, Mood, NpcRole, NpcState, SocialIntent, Vec2, WorldObjectState
} from './types';

const WORLD_SIZE = 36;
const HALF = WORLD_SIZE / 2;
const keyOf = (x:number,z:number) => `${x},${z}`;
const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,v));
const dist = (a:Vec2,b:Vec2) => Math.hypot(a.x-b.x,a.z-b.z);
const now = () => performance.now();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div id="game"></div>
<div id="crosshair">+</div>
<div id="modeBar"><button id="modeBtn">G · 上帝视角</button><span id="modeHint">第一人称</span></div>
<div id="hud">
  <div class="brand">LATTICEFOLK // LIVING TOWN</div>
  <div id="clock"></div>
  <div id="decisionStatus"></div>
  <div id="prompt"></div>
  <div id="inventory"></div>
</div>
<div id="npcPanel" class="panel compact"></div>
<div id="log" class="panel log"></div>
<div id="admin" class="panel admin hidden">
  <div class="panel-title">Town Console <span>Tab 关闭</span></div>
  <div id="adminStatus"></div>
  <label>批量导入格式
    <select id="importFormat"><option value="plain">纯文本 / TSV</option><option value="jsonl">JSONL</option><option value="json">JSON 数组</option></select>
  </label>
  <input id="importFile" type="file" accept=".txt,.json,.jsonl,.csv" />
  <textarea id="importText" placeholder="每行一条完整台词；或：\nline<TAB>greet,happy<TAB>你好。\nfragment:opener<TAB>greet<TAB>嘿，"></textarea>
  <div class="row"><button id="importBtn">导入语料</button><button id="pauseBtn">暂停 NPC AI</button></div>
  <div class="small">第一人称：WASD 移动 · Shift 奔跑 · 鼠标视角 · E 交互<br>上帝视角：G 切换 · 鼠标左键旋转 · 右键平移 · 滚轮缩放 · WASD 平移 · Q/E 旋转 · F 聚焦</div>
</div>
<div id="startOverlay">
  <div class="start-card">
    <h1>Latticefolk</h1>
    <p>自主 NPC 的行为、社交、环境交互、状态倾向与台词选择由可插拔决策引擎驱动；移动、碰撞与数值由确定性游戏规则执行。</p>
    <button id="startBtn">进入小镇</button>
    <div>WASD + 鼠标 · E 交互 · G 上帝视角 · Tab 控制台</div>
  </div>
</div>
<div id="speechLayer"></div>
<div id="toast"></div>`;

const ui = {
  clock: document.querySelector<HTMLDivElement>('#clock')!,
  decision: document.querySelector<HTMLDivElement>('#decisionStatus')!,
  prompt: document.querySelector<HTMLDivElement>('#prompt')!,
  inv: document.querySelector<HTMLDivElement>('#inventory')!,
  npc: document.querySelector<HTMLDivElement>('#npcPanel')!,
  log: document.querySelector<HTMLDivElement>('#log')!,
  admin: document.querySelector<HTMLDivElement>('#admin')!,
  adminStatus: document.querySelector<HTMLDivElement>('#adminStatus')!,
  toast: document.querySelector<HTMLDivElement>('#toast')!,
  speechLayer: document.querySelector<HTMLDivElement>('#speechLayer')!,
  modeBtn: document.querySelector<HTMLButtonElement>('#modeBtn')!,
  modeHint: document.querySelector<HTMLSpanElement>('#modeHint')!,
  crosshair: document.querySelector<HTMLDivElement>('#crosshair')!,
  overlay: document.querySelector<HTMLDivElement>('#startOverlay')!,
};

interface RuntimeObject { state: WorldObjectState; mesh: THREE.Object3D; }
interface AssetTemplate { scene: THREE.Object3D; animations: THREE.AnimationClip[]; }
interface VisualTarget { group: THREE.Group; asset: string; height: number; rotationY?: number; }
interface ActionTask { action: DecisionAction; targetNpcId?: string; targetObjectId?: string; intent?: SocialIntent; startedAt:number; }
interface NpcRuntime {
  state: NpcState;
  mesh: THREE.Group;
  path: Vec2[];
  pathIndex: number;
  task?: ActionTask;
  nextDecisionAt: number;
  pendingDecision: boolean;
  speech?: { text:string; until:number };
  speechEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  lastDecision?: DecisionResponse;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  activeAnimation?: string;
}

class TownGame {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, .05, 120);
  renderer = new THREE.WebGLRenderer({antialias:true});
  controls: PointerLockControls;
  orbit: OrbitControls;
  clock = new THREE.Clock();
  sun = new THREE.DirectionalLight(0xffffff, 1.5);
  ambient = new THREE.HemisphereLight(0xbfe8ff, 0x557044, 1.25);
  blocked = new Set<string>();
  npcs = new Map<string,NpcRuntime>();
  objects = new Map<string,RuntimeObject>();
  raycaster = new THREE.Raycaster();
  keys = new Set<string>();
  playerInventory: Record<ItemKind,number> = {apple:0,bread:1,wood:0,coin:10,flower:0};
  minuteOfDay = 8*60 + 15;
  day = 1;
  weather = 'clear';
  weatherEpoch = 0;
  recentEvents: string[] = [];
  logs: string[] = [];
  aiPaused = false;
  inFlight = 0;
  maxInFlight = 2;
  hoverEntity?: {type:'npc'|'object'; id:string};
  selectedEntity?: {type:'npc'|'object'; id:string};
  cameraMode: 'firstPerson'|'god' = 'firstPerson';
  perceptionEpoch = 0;
  playerPosition: Vec2 = {x:0,z:7};
  firstPersonRotation = new THREE.Euler(0,0,0,'YXZ');
  godPointer = new THREE.Vector2(0,0);
  pointerDown?: {x:number;y:number};
  playerMarker = new THREE.Group();
  // The player is a world participant only in first-person mode. God mode is an out-of-world observer.
  selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(.72,.92,32),
    new THREE.MeshBasicMaterial({color:0xfff176,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false})
  );
  pathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({color:0xfff176,transparent:true,opacity:.8})
  );
  lastHealthPoll = 0;
  decisionProvider = 'fallback';
  decisionCalls = 0;
  gltfLoader = new GLTFLoader();
  assets = new Map<string,AssetTemplate>();
  visualTargets: VisualTarget[] = [];
  assetBase = '/assets/quaternius/cube-world';
  assetsReady = false;

  constructor() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    document.querySelector('#game')!.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x91c9ef);
    this.scene.fog = new THREE.Fog(0x91c9ef, 24, 58);
    this.camera.position.set(0,1.7,7);
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = .08;
    this.orbit.screenSpacePanning = false;
    this.orbit.minDistance = 7;
    this.orbit.maxDistance = 48;
    this.orbit.maxPolarAngle = Math.PI * .49;
    this.orbit.minPolarAngle = Math.PI * .08;
    this.orbit.target.set(0,0,0);
    this.scene.add(this.camera, this.ambient, this.sun);
    this.sun.position.set(12,22,8); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048,2048);
    this.setupWorld();
    this.setupPlayerMarker();
    this.setupNpcs();
    void this.loadVisualAssets();
    this.bindInput();
    this.refreshHealth();
    this.log('Latticefolk 已启动；未配置远程决策引擎时使用本地规则 provider。');
    this.animate();
  }

  setupWorld() {
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD_SIZE, .25, WORLD_SIZE),
      new THREE.MeshStandardMaterial({color:0x74a95d, roughness:1})
    );
    ground.position.y = -.125; ground.receiveShadow = true; this.scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({color:0xc3aa7d,roughness:1});
    const road1 = new THREE.Mesh(new THREE.BoxGeometry(3,.03,WORLD_SIZE-2),roadMat); road1.position.set(0,.02,0);
    const road2 = new THREE.Mesh(new THREE.BoxGeometry(WORLD_SIZE-2,.031,3),roadMat); road2.position.set(0,.021,0);
    this.scene.add(road1,road2);

    this.addBuilding('农舍',-12,-10,5,4,0x9d744f);
    this.addBuilding('面包房',-5,-10,5,4,0xd58c55);
    this.addBuilding('杂货店',7,-10,6,4,0x79a3a8);
    this.addBuilding('工坊',-11,9,6,5,0x7f8796);
    this.addBuilding('守卫所',10,9,5,4,0x8a7868);
    this.addBuilding('民居',4,10,5,4,0xb28c75);

    this.addObject({id:'well',kind:'well',name:'中央水井',position:{x:0,z:0},tags:['water','town','social'],usable:true,pickupable:false});
    this.addObject({id:'bench_w',kind:'bench',name:'西侧长椅',position:{x:-3,z:2.5},tags:['rest','social'],usable:true,pickupable:false});
    this.addObject({id:'bench_e',kind:'bench',name:'东侧长椅',position:{x:3,z:-2.5},tags:['rest','social'],usable:true,pickupable:false});
    this.addObject({id:'farm_plot',kind:'farm_plot',name:'菜地',position:{x:-12,z:-5},tags:['work','farm','food'],usable:true,pickupable:false});
    this.addObject({id:'oven',kind:'workstation',name:'面包炉',position:{x:-5,z:-6.5},tags:['work','baker','bread'],usable:true,pickupable:false});
    this.addObject({id:'market',kind:'food_stall',name:'集市摊位',position:{x:7,z:-3.5},tags:['food','trade','market'],usable:true,pickupable:false,item:'bread'});
    this.addObject({id:'maker_table',kind:'workstation',name:'工坊工作台',position:{x:-10,z:5.5},tags:['work','maker','wood'],usable:true,pickupable:false});
    this.addObject({id:'guard_post',kind:'workstation',name:'巡逻岗亭',position:{x:10,z:5.5},tags:['work','guard','safety'],usable:true,pickupable:false});
    this.addObject({id:'bed_n',kind:'bed',name:'公共休息铺',position:{x:4,z:6.5},tags:['rest','sleep'],usable:true,pickupable:false});
    this.addObject({id:'crate_wood',kind:'crate',name:'木料箱',position:{x:-8,z:3.5},tags:['wood','supply'],usable:false,pickupable:true,item:'wood'});
    this.addObject({id:'tree_apple_1',kind:'tree',name:'苹果树',position:{x:-7,z:-1},tags:['food','apple','nature'],usable:true,pickupable:true,item:'apple'});
    this.addObject({id:'tree_apple_2',kind:'tree',name:'苹果树',position:{x:10,z:1.5},tags:['food','apple','nature'],usable:true,pickupable:true,item:'apple'});

    for (const [x,z] of [[-15,2],[-14,5],[14,-4],[13,3],[-7,13],[14,13],[-15,-15],[14,-14]] as Array<[number,number]>) this.addTreeDecoration(x,z);
  }

  addBuilding(_name:string,x:number,z:number,w:number,d:number,color:number) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w,2.7,d), new THREE.MeshStandardMaterial({color,roughness:.9}));
    wall.position.y=1.35; wall.castShadow=true; wall.receiveShadow=true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.72,1.5,4),new THREE.MeshStandardMaterial({color:0x673f32,roughness:1}));
    roof.position.y=3.4; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(.85,1.7,.08),new THREE.MeshStandardMaterial({color:0x51372a}));
    door.position.set(0,.85,d/2+.045); g.add(door);
    g.position.set(x,0,z); this.scene.add(g);
    const minX = Math.floor(x-w/2), maxX=Math.ceil(x+w/2), minZ=Math.floor(z-d/2), maxZ=Math.ceil(z+d/2);
    for(let gx=minX;gx<=maxX;gx++) for(let gz=minZ;gz<=maxZ;gz++) this.blocked.add(keyOf(gx,gz));
  }

  addTreeDecoration(x:number,z:number) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(.65,2,.65),new THREE.MeshStandardMaterial({color:0x725033})); trunk.position.y=1;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.2,2.2,2.2),new THREE.MeshStandardMaterial({color:0x4f8e4b})); crown.position.y=2.65; crown.castShadow=true;
    g.add(trunk,crown); g.position.set(x,0,z); this.scene.add(g); this.blocked.add(keyOf(Math.round(x),Math.round(z)));
    const variant = ['tree1','tree2','tree3'][Math.abs(Math.round(x*3+z*5))%3];
    this.visualTargets.push({group:g,asset:variant,height:3.8,rotationY:(x+z)*.17});
  }

  addObject(state:WorldObjectState) {
    const g = new THREE.Group();
    let mesh: THREE.Mesh;
    switch(state.kind) {
      case 'well':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(1,1,.85,12),new THREE.MeshStandardMaterial({color:0x8b8c86})); mesh.position.y=.43; break;
      case 'bench':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(2,.25,.65),new THREE.MeshStandardMaterial({color:0x79563c})); mesh.position.y=.65; break;
      case 'bed':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(2,.35,1),new THREE.MeshStandardMaterial({color:0xddd2bd})); mesh.position.y=.35; break;
      case 'farm_plot':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(4,.12,2.7),new THREE.MeshStandardMaterial({color:0x654a2d})); mesh.position.y=.06; break;
      case 'food_stall':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(2.3,1.3,1.2),new THREE.MeshStandardMaterial({color:0xb86442})); mesh.position.y=.65; break;
      case 'workstation':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(2,1,.9),new THREE.MeshStandardMaterial({color:0x766044})); mesh.position.y=.5; break;
      case 'tree': {
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(.55,1.8,.55),new THREE.MeshStandardMaterial({color:0x765238})); trunk.position.y=.9;
        const crown = new THREE.Mesh(new THREE.BoxGeometry(1.8,1.8,1.8),new THREE.MeshStandardMaterial({color:0x4f9448})); crown.position.y=2.2;
        g.add(trunk,crown); mesh=crown; break;
      }
      default:
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.85,.85,.85),new THREE.MeshStandardMaterial({color:state.item==='wood'?0x795234:0xb48b55})); mesh.position.y=.43;
    }
    if (!g.children.length) g.add(mesh);
    for(const child of g.children) { child.castShadow=true; child.receiveShadow=true; }
    g.position.set(state.position.x,0,state.position.z);
    g.userData={entityType:'object',entityId:state.id};
    this.scene.add(g);
    this.objects.set(state.id,{state,mesh:g});
    if(state.kind==='tree') this.visualTargets.push({group:g,asset:state.id.endsWith('2')?'tree3':'tree2',height:3.5,rotationY:state.position.x*.13});
    if(state.kind==='crate') this.visualTargets.push({group:g,asset:'chest',height:1.0,rotationY:Math.PI/2});
  }


  setupPlayerMarker() {
    const body=new THREE.Mesh(new THREE.BoxGeometry(.7,1.05,.38),new THREE.MeshStandardMaterial({color:0x4d89c8,roughness:.8}));body.position.y=1.2;
    const head=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshStandardMaterial({color:0xe7b894,roughness:.9}));head.position.y=2.02;
    const leg1=new THREE.Mesh(new THREE.BoxGeometry(.25,.75,.28),new THREE.MeshStandardMaterial({color:0x2d3542,roughness:.9}));leg1.position.set(-.19,.38,0);
    const leg2=leg1.clone();leg2.position.x=.19;
    this.playerMarker.add(body,head,leg1,leg2);
    // Do not materialize a player avatar while observing from god mode.
    this.playerMarker.visible=false;
    this.playerMarker.userData={entityType:'player',entityId:'player'};
    this.scene.add(this.playerMarker);
    this.selectionRing.rotation.x=-Math.PI/2;this.selectionRing.position.y=.035;this.selectionRing.visible=false;this.scene.add(this.selectionRing);
    this.pathLine.visible=false;this.pathLine.frustumCulled=false;this.scene.add(this.pathLine);
  }

  setupNpcs() {
    const seed: Array<[string,string,NpcRole,number,number,string|undefined,Mood]> = [
      ['mina','米娜','farmer',-9,-4,'farm_plot','calm'],
      ['ren','莲','baker',-4,-4,'oven','happy'],
      ['sora','空','shopkeeper',5,-3,'market','neutral'],
      ['kai','凯','guard',8,3,'guard_post','calm'],
      ['yui','结衣','maker',-8,4,'maker_table','curious'],
      ['nao','直','resident',3,5,undefined,'neutral'],
    ];
    for (const [id,name,role,x,z,workAt,mood] of seed) {
      const state: NpcState = {
        id,name,role,position:{x,z},home:{x:x<0?x-2:x+2,z:z<0?z-5:z+5},workAt,mood,
        hunger:25+Math.random()*25,energy:65+Math.random()*25,social:45+Math.random()*30,money:8+Math.floor(Math.random()*12),
        inventory: role==='baker'?[{kind:'bread',count:2}]:role==='farmer'?[{kind:'apple',count:1}]:[],
        relationships:{},memories:[],currentAction:'idle',goal:'过好今天并照顾自己的需要',lastDecisionAt:0
      };
      const mesh=this.makeBlockPerson(role); mesh.position.set(x,0,z); mesh.userData={entityType:'npc',entityId:id}; this.scene.add(mesh);
      const characterAsset:Record<string,string>={mina:'female1',ren:'female2',sora:'male1',kai:'male2',yui:'female1',nao:'male1'};
      this.visualTargets.push({group:mesh,asset:characterAsset[id],height:2.35,rotationY:Math.PI});
      const speechEl=document.createElement('div'); speechEl.className='speech hidden'; ui.speechLayer.appendChild(speechEl);
      const nameEl=document.createElement('div'); nameEl.className='npc-name hidden'; ui.speechLayer.appendChild(nameEl);
      this.npcs.set(id,{state,mesh,path:[],pathIndex:0,nextDecisionAt:now()+1000+Math.random()*5000,pendingDecision:false,speechEl,nameEl});
    }
    for(const a of this.npcs.values()) {
      for(const b of this.npcs.values()) if(a!==b) a.state.relationships[b.state.id]={affinity:45+Math.round(Math.random()*20),trust:45+Math.round(Math.random()*20),familiarity:25+Math.round(Math.random()*35)};
      a.state.relationships.player={affinity:50,trust:50,familiarity:5};
    }
  }

  makeBlockPerson(role:NpcRole) {
    const colors:Record<NpcRole,number>={farmer:0x6d9d58,baker:0xd7a06b,shopkeeper:0x5a9ca5,guard:0x6675a4,maker:0x9b718d,resident:0xb58a65};
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({color:colors[role],roughness:.8});
    const skin=new THREE.MeshStandardMaterial({color:0xe7b894,roughness:.9});
    const dark=new THREE.MeshStandardMaterial({color:0x3b342f,roughness:.9});
    const body=new THREE.Mesh(new THREE.BoxGeometry(.75,1,.38),mat); body.position.y=1.2;
    const head=new THREE.Mesh(new THREE.BoxGeometry(.62,.62,.62),skin); head.position.y=2.02;
    const leg1=new THREE.Mesh(new THREE.BoxGeometry(.27,.75,.3),dark); leg1.position.set(-.2,.38,0);
    const leg2=leg1.clone(); leg2.position.x=.2;
    const arm1=new THREE.Mesh(new THREE.BoxGeometry(.22,.85,.28),skin); arm1.position.set(-.52,1.2,0);
    const arm2=arm1.clone(); arm2.position.x=.52;
    g.add(body,head,leg1,leg2,arm1,arm2); for(const m of g.children as THREE.Mesh[]) m.castShadow=true;
    return g;
  }

  async loadVisualAssets() {
    const defs: Record<string,string> = {
      female1:'Character_Female_1.gltf', female2:'Character_Female_2.gltf',
      male1:'Character_Male_1.gltf', male2:'Character_Male_2.gltf',
      tree1:'Tree_1.gltf', tree2:'Tree_2.gltf', tree3:'Tree_3.gltf',
      bush:'Bush.gltf', rock:'Rock2.gltf', flowers:'Flowers_1.gltf',
      chest:'Chest_Closed.gltf', cart:'Cart.gltf', axe:'Axe_Wood.gltf', shovel:'Shovel_Wood.gltf'
    };
    const loaded = await Promise.allSettled(Object.entries(defs).map(async ([key,file])=>{
      const gltf=await this.gltfLoader.loadAsync(`${this.assetBase}/${file}`);
      this.assets.set(key,{scene:gltf.scene,animations:gltf.animations});
    }));
    const failures=loaded.filter(x=>x.status==='rejected').length;
    for(const target of this.visualTargets)this.applyVisualTarget(target);
    this.spawnAssetDecoration('bush',-14,0,1.0,.2);
    this.spawnAssetDecoration('bush',13,-1,1.0,1.7);
    this.spawnAssetDecoration('bush',-4,13,1.0,.7);
    this.spawnAssetDecoration('rock',15,7,.8,.6);
    this.spawnAssetDecoration('rock',-15,-7,.65,2.2);
    this.spawnAssetDecoration('flowers',-2,-5,.85,.4);
    this.spawnAssetDecoration('flowers',4,3,.8,2.3);
    this.spawnAssetDecoration('cart',8,-4.8,1.35,Math.PI/2);
    this.spawnAssetDecoration('axe',-10.8,5.1,.9,-.4);
    this.spawnAssetDecoration('shovel',-12.8,-5.7,.9,.5);
    this.assetsReady=failures===0;
    this.log(`视觉素材：Quaternius Cube World Kit 已加载 ${Object.keys(defs).length-failures}/${Object.keys(defs).length}`);
    if(failures)this.log(`有 ${failures} 个素材加载失败，已保留程序化 fallback。`);
  }

  applyVisualTarget(target:VisualTarget) {
    const tpl=this.assets.get(target.asset);if(!tpl)return;
    const isCharacter=target.asset.startsWith('female')||target.asset.startsWith('male');
    const model=(isCharacter?cloneSkeleton(tpl.scene):tpl.scene.clone(true)) as THREE.Object3D;
    this.normalizeModel(model,target.height);
    model.rotation.y=target.rotationY||0;
    target.group.clear();
    target.group.add(model);
    if(isCharacter){
      const agent=[...this.npcs.values()].find(n=>n.mesh===target.group);
      if(agent&&tpl.animations.length){
        agent.mixer=new THREE.AnimationMixer(model);
        agent.actions=new Map(tpl.animations.map(clip=>[clip.name,agent.mixer!.clipAction(clip)]));
        this.setNpcAnimation(agent,'Idle');
      }
    }
  }

  normalizeModel(model:THREE.Object3D,targetHeight:number) {
    model.traverse(o=>{if((o as THREE.Mesh).isMesh){const m=o as THREE.Mesh;m.castShadow=true;m.receiveShadow=true;}});
    model.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(model);const size=new THREE.Vector3();box.getSize(size);
    if(size.y>0){const scale=targetHeight/size.y;model.scale.multiplyScalar(scale);}
    model.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(model);
    model.position.y-=box.min.y;
  }

  spawnAssetDecoration(asset:string,x:number,z:number,height:number,rotationY=0) {
    const tpl=this.assets.get(asset);if(!tpl)return;
    const model=tpl.scene.clone(true);this.normalizeModel(model,height);model.rotation.y=rotationY;model.position.x=x;model.position.z=z;
    model.traverse(o=>{o.userData.decorativeAsset=true;});this.scene.add(model);
  }

  setNpcAnimation(agent:NpcRuntime,name:string) {
    if(!agent.actions||agent.activeAnimation===name)return;
    const next=agent.actions.get(name)||agent.actions.get('Idle');if(!next)return;
    const previous=agent.activeAnimation?agent.actions.get(agent.activeAnimation):undefined;
    previous?.fadeOut(.18);next.reset().fadeIn(.18).play();agent.activeAnimation=name;
  }

  bindInput() {
    addEventListener('resize',()=>{ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); });
    addEventListener('keydown',(e)=>{
      const tag=(e.target as HTMLElement | null)?.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
      if (e.code==='Tab') { e.preventDefault(); ui.admin.classList.toggle('hidden'); return; }
      if (e.code==='KeyG') { e.preventDefault(); this.toggleCameraMode(); return; }
      if (e.code==='KeyF' && this.cameraMode==='god') { this.focusSelected(); return; }
      if (e.code==='Space' && this.cameraMode==='god') { e.preventDefault(); this.focusTown(); return; }
      if (e.code==='KeyE' && this.cameraMode==='firstPerson') { this.interact(); return; }
      this.keys.add(e.code);
    });
    addEventListener('keyup',(e)=>this.keys.delete(e.code));
    document.querySelector('#startBtn')!.addEventListener('click',()=>{this.cameraMode='firstPerson';this.controls.lock();});
    ui.modeBtn.addEventListener('click',()=>this.toggleCameraMode());
    this.controls.addEventListener('lock',()=>ui.overlay.classList.add('hidden'));
    this.controls.addEventListener('unlock',()=>{if(this.cameraMode==='firstPerson')ui.overlay.classList.remove('hidden');});

    this.renderer.domElement.addEventListener('pointermove',(e)=>{
      const rect=this.renderer.domElement.getBoundingClientRect();
      this.godPointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
      if(this.pointerDown&&Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y)>7)this.pointerDown=undefined;
    });
    this.renderer.domElement.addEventListener('pointerdown',(e)=>{if(this.cameraMode==='god'&&e.button===0){const rect=this.renderer.domElement.getBoundingClientRect();this.godPointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);this.pointerDown={x:e.clientX,y:e.clientY};}});
    this.renderer.domElement.addEventListener('pointerup',(e)=>{
      if(this.cameraMode!=='god'||e.button!==0||!this.pointerDown)return;
      const d=Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y);this.pointerDown=undefined;
      if(d<=7)this.selectGodEntity();
    });
    this.renderer.domElement.addEventListener('dblclick',(e)=>{if(this.cameraMode==='god'&&e.button===0){this.selectGodEntity();this.focusSelected();}});

    document.querySelector('#pauseBtn')!.addEventListener('click',()=>{
      this.aiPaused=!this.aiPaused; (document.querySelector('#pauseBtn') as HTMLButtonElement).textContent=this.aiPaused?'恢复 NPC AI':'暂停 NPC AI';
      this.toast(this.aiPaused?'NPC AI 已暂停':'NPC AI 已恢复');
    });
    const file=document.querySelector<HTMLInputElement>('#importFile')!;
    file.addEventListener('change',async()=>{ if(file.files?.[0]) (document.querySelector<HTMLTextAreaElement>('#importText')!).value=await file.files[0].text(); });
    document.querySelector('#importBtn')!.addEventListener('click',()=>this.importDialogue());
  }

  toggleCameraMode() {
    if(this.cameraMode==='firstPerson')this.enterGodMode();else this.enterFirstPerson();
  }

  enterGodMode() {
    if(this.cameraMode==='god')return;
    this.playerPosition={x:this.camera.position.x,z:this.camera.position.z};
    this.firstPersonRotation.copy(this.camera.rotation);
    this.cameraMode='god';
    this.perceptionEpoch++;
    if(this.controls.isLocked)this.controls.unlock();
    ui.overlay.classList.add('hidden');
    this.orbit.enabled=true;
    this.orbit.target.set(this.playerPosition.x,0,this.playerPosition.z);
    this.camera.position.set(this.playerPosition.x+12,18,this.playerPosition.z+12);
    this.camera.lookAt(this.orbit.target);
    this.orbit.update();
    // God mode is observer-only: no player entity is exposed to NPC perception or targeting.
    this.playerMarker.visible=false;
    this.cancelPlayerTargeting();
    ui.crosshair.classList.add('hidden');
    ui.modeBtn.textContent='G · 第一人称';ui.modeHint.textContent='上帝视角 · 观察者';
    this.toast('上帝视角：玩家已从 NPC 感知中移除 · 点击查看 · 双击/F 聚焦');
  }

  enterFirstPerson() {
    if(this.cameraMode==='firstPerson')return;
    this.cameraMode='firstPerson';
    this.perceptionEpoch++;
    this.orbit.enabled=false;
    this.playerMarker.visible=false;
    this.camera.position.set(this.playerPosition.x,1.7,this.playerPosition.z);
    this.camera.rotation.copy(this.firstPersonRotation);
    ui.crosshair.classList.remove('hidden');
    ui.modeBtn.textContent='G · 上帝视角';ui.modeHint.textContent='第一人称';
    this.controls.lock();
  }


  cancelPlayerTargeting() {
    for(const agent of this.npcs.values()) {
      if(agent.task?.targetNpcId!=='player' && agent.state.targetNpcId!=='player') continue;
      agent.task=undefined;
      agent.path=[];
      agent.pathIndex=0;
      agent.state.currentAction='idle';
      agent.state.targetNpcId=undefined;
      agent.nextDecisionAt=now()+500+Math.random()*1000;
    }
  }

  focusTown() {
    if(this.cameraMode!=='god')return;
    this.moveGodTarget(new THREE.Vector3(0,0,0),22);
  }

  focusSelected() {
    if(this.cameraMode!=='god'||!this.selectedEntity)return;
    const p=this.entityPosition(this.selectedEntity);if(!p)return;
    this.moveGodTarget(new THREE.Vector3(p.x,0,p.z),11);
  }

  moveGodTarget(target:THREE.Vector3,distance:number) {
    const dir=this.camera.position.clone().sub(this.orbit.target).normalize();
    this.orbit.target.copy(target);this.camera.position.copy(target).add(dir.multiplyScalar(distance));
    if(this.camera.position.y<5)this.camera.position.y=5;this.orbit.update();
  }

  selectGodEntity() {
    const entity=this.pickEntity(this.godPointer,Infinity);
    this.selectedEntity=entity;
    if(entity){const name=entity.type==='npc'?this.npcs.get(entity.id)?.state.name:this.objects.get(entity.id)?.state.name;this.toast(`已选择：${name||entity.id}`);}
  }

  entityPosition(entity:{type:'npc'|'object';id:string}):Vec2|undefined {
    return entity.type==='npc'?this.npcs.get(entity.id)?.state.position:this.objects.get(entity.id)?.state.position;
  }

  async importDialogue() {
    const format=(document.querySelector<HTMLSelectElement>('#importFormat')!).value;
    const text=(document.querySelector<HTMLTextAreaElement>('#importText')!).value;
    if(!text.trim()){this.toast('没有可导入内容');return;}
    try{
      const r=await fetch('/api/dialogue/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({format,text})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error||'import failed');
      this.toast(`已导入 ${j.imported} 条；语料总数 ${j.total}`); this.refreshHealth();
    }catch(e){this.toast(`导入失败：${e instanceof Error?e.message:String(e)}`);}
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const dt=Math.min(.05,this.clock.getDelta());
    if(this.cameraMode==='firstPerson')this.updatePlayer(dt);else this.updateGodCamera(dt);
    this.updateTime(dt); this.updateObjects(); this.updateNpcs(dt); this.updateRaycast(); this.updateUi(); this.updateSpeech(); this.updateSelectionVisuals();
    if(now()-this.lastHealthPoll>10000) this.refreshHealth();
    this.renderer.render(this.scene,this.camera);
  };

  updatePlayer(dt:number) {
    if(!this.controls.isLocked)return;
    let f=0,r=0;if(this.keys.has('KeyW'))f+=1;if(this.keys.has('KeyS'))f-=1;if(this.keys.has('KeyD'))r+=1;if(this.keys.has('KeyA'))r-=1;
    if(f||r){
      const speed=(this.keys.has('ShiftLeft')?7.2:4.5)*dt;
      const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);dir.y=0;dir.normalize();
      const right=new THREE.Vector3(-dir.z,0,dir.x);const move=dir.multiplyScalar(f).add(right.multiplyScalar(r)).normalize().multiplyScalar(speed);
      const old=this.camera.position.clone(),nx=old.x+move.x,nz=old.z+move.z;
      if(!this.isBlockedWorld(nx,old.z))this.camera.position.x=clamp(nx,-HALF+.6,HALF-.6);
      if(!this.isBlockedWorld(this.camera.position.x,nz))this.camera.position.z=clamp(nz,-HALF+.6,HALF-.6);
    }
    this.camera.position.y=1.7;
    this.playerPosition.x=this.camera.position.x;this.playerPosition.z=this.camera.position.z;
    this.firstPersonRotation.copy(this.camera.rotation);
  }

  updateGodCamera(dt:number) {
    this.orbit.update();
    let f=0,r=0;if(this.keys.has('KeyW'))f+=1;if(this.keys.has('KeyS'))f-=1;if(this.keys.has('KeyD'))r+=1;if(this.keys.has('KeyA'))r-=1;
    const speed=(this.keys.has('ShiftLeft')?20:11)*dt;
    if(f||r){
      const forward=this.orbit.target.clone().sub(this.camera.position);forward.y=0;if(forward.lengthSq()<.001)forward.set(0,0,-1);forward.normalize();
      const right=new THREE.Vector3(-forward.z,0,forward.x);const move=forward.multiplyScalar(f).add(right.multiplyScalar(r)).normalize().multiplyScalar(speed);
      const old=this.orbit.target.clone();this.orbit.target.add(move);
      this.orbit.target.x=clamp(this.orbit.target.x,-HALF,HALF);this.orbit.target.z=clamp(this.orbit.target.z,-HALF,HALF);
      const actual=this.orbit.target.clone().sub(old);this.camera.position.add(actual);
    }
    const spin=(this.keys.has('KeyQ')?1:0)-(this.keys.has('KeyE')?1:0);
    if(spin){const off=this.camera.position.clone().sub(this.orbit.target);off.applyAxisAngle(new THREE.Vector3(0,1,0),spin*dt*1.35);this.camera.position.copy(this.orbit.target).add(off);}
    this.orbit.update();
    // Do not materialize a player avatar while observing from god mode.
  }

  isBlockedWorld(x:number,z:number) { return this.blocked.has(keyOf(Math.round(x),Math.round(z))); }

  updateTime(dt:number) {
    this.minuteOfDay += dt*2.2;
    if(this.minuteOfDay>=1440){this.minuteOfDay-=1440;this.day++;this.weatherEpoch=-1;this.event(`第 ${this.day} 天开始了。`);}
    const block=Math.floor(this.minuteOfDay/360);
    if(block!==this.weatherEpoch){this.weatherEpoch=block;const roll=Math.random();this.weather=roll<.68?'clear':roll<.88?'cloudy':'rain';}
    const phase=(this.minuteOfDay/1440)*Math.PI*2-Math.PI/2; const daylight=clamp(Math.sin(phase)*.7+.45,.12,1);
    this.sun.intensity=.15+daylight*1.65; this.ambient.intensity=.32+daylight*1.05;
    const sky=new THREE.Color().setHSL(.56,.55,.12+daylight*.58); this.scene.background=sky; if(this.scene.fog)this.scene.fog.color.copy(sky);
  }

  updateObjects() {
    const t=Date.now();
    for(const o of this.objects.values()) if(o.state.respawnAt && t>=o.state.respawnAt){o.state.respawnAt=undefined;o.state.pickupable=true;o.mesh.visible=true;}
  }

  updateNpcs(dt:number) {
    for(const agent of this.npcs.values()) {
      const n=agent.state;
      n.hunger=clamp(n.hunger+dt*.20,0,100); n.energy=clamp(n.energy-dt*.075,0,100); n.social=clamp(n.social-dt*.04,0,100);
      const wasMoving=agent.pathIndex<agent.path.length;
      this.moveNpc(agent,dt);
      const isMoving=agent.pathIndex<agent.path.length || wasMoving;
      this.setNpcAnimation(agent,isMoving?'Walk':'Idle');
      agent.mixer?.update(dt);
      if(agent.task && agent.path.length===0) this.completeTask(agent);
      if(!this.aiPaused&&!agent.pendingDecision&&this.inFlight<this.maxInFlight&&now()>=agent.nextDecisionAt&&!agent.task) this.requestDecision(agent);
      n.position.x=agent.mesh.position.x;n.position.z=agent.mesh.position.z;
    }
  }

  moveNpc(agent:NpcRuntime,dt:number) {
    if(agent.pathIndex>=agent.path.length){agent.path=[];agent.pathIndex=0;return;}
    const p=agent.path[agent.pathIndex]; const pos=agent.mesh.position; const dx=p.x-pos.x,dz=p.z-pos.z,d=Math.hypot(dx,dz);
    if(d<.12){agent.pathIndex++;if(agent.pathIndex>=agent.path.length){agent.path=[];agent.pathIndex=0;}return;}
    const speed=1.2; pos.x+=dx/d*speed*dt;pos.z+=dz/d*speed*dt;agent.mesh.rotation.y=Math.atan2(dx,dz);
  }

  async requestDecision(agent:NpcRuntime) {
    agent.pendingDecision=true; this.inFlight++; agent.state.lastDecisionAt=Date.now();
    const decisionEpoch=this.perceptionEpoch;
    const world=this.snapshot(agent); const allowed=this.allowedActions(agent,world);
    const req:DecisionRequest={npc:agent.state,world,allowedActions:allowed};
    try{
      const r=await fetch('/api/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});
      const d=await r.json() as DecisionResponse; if(!r.ok) throw new Error('decision failed');
      // Camera-mode transitions change whether the player exists in the NPC world.
      // Never apply a result generated from an obsolete perception snapshot.
      if(decisionEpoch!==this.perceptionEpoch){agent.nextDecisionAt=now()+250+Math.random()*500;return;}
      this.applyDecision(agent,d);
      this.log(`${agent.state.name} → ${d.action}${d.socialIntent?` / ${d.socialIntent}`:''} [${d.source} ${(d.confidence*100).toFixed(0)}%]`);
    }catch{
      agent.nextDecisionAt=now()+4000;
    }finally{agent.pendingDecision=false;this.inFlight--;}
  }

  snapshot(agent:NpcRuntime):DecisionRequest['world'] {
    const nearNpcs: DecisionRequest['world']['nearbyNpcs']=[...this.npcs.values()].filter(x=>x!==agent).map(x=>({
      id:x.state.id,name:x.state.name,role:x.state.role,mood:x.state.mood,distance:dist(agent.state.position,x.state.position),
      relationship:agent.state.relationships[x.state.id]??{affinity:50,trust:50,familiarity:20},currentAction:x.state.currentAction
    })).filter(x=>x.distance<=9);
    // First-person mode materializes the player into the NPC world model. God mode does not.
    if(this.cameraMode==='firstPerson') {
      const playerPos=this.playerPosition; const playerDistance=dist(agent.state.position,playerPos);
      if(playerDistance<=9) nearNpcs.push({id:'player',name:'玩家',role:'player',mood:'neutral',isPlayer:true,distance:playerDistance,relationship:agent.state.relationships.player??{affinity:50,trust:50,familiarity:5},currentAction:'idle'});
    }
    nearNpcs.sort((a,b)=>a.distance-b.distance); nearNpcs.splice(8);
    const nearObjects=[...this.objects.values()].filter(x=>x.mesh.visible).map(x=>({
      id:x.state.id,kind:x.state.kind,name:x.state.name,tags:x.state.tags,distance:dist(agent.state.position,x.state.position),usable:x.state.usable,pickupable:x.state.pickupable,item:x.state.item
    })).filter(x=>x.distance<=10).sort((a,b)=>a.distance-b.distance).slice(0,14);
    return {gameTime:this.gameTimeText(),minuteOfDay:this.minuteOfDay,weather:this.weather,nearbyNpcs:nearNpcs,nearbyObjects:nearObjects,recentEvents:this.recentEvents.slice(-8)};
  }

  allowedActions(agent:NpcRuntime,world:DecisionRequest['world']):DecisionAction[] {
    const a:DecisionAction[]=['idle','wander','inspect'];
    if(world.nearbyNpcs.length)a.push('talk');
    if(agent.state.workAt||world.nearbyObjects.some(o=>o.tags.includes('work')))a.push('work');
    if(world.nearbyObjects.some(o=>['bench','bed'].includes(o.kind)))a.push('rest');
    if(agent.state.inventory.some(i=>['apple','bread'].includes(i.kind)&&i.count>0)||world.nearbyObjects.some(o=>o.kind==='food_stall'))a.push('eat');
    if(world.nearbyObjects.some(o=>o.pickupable))a.push('pickup');
    if(world.nearbyObjects.some(o=>o.usable))a.push('use_object');
    if(agent.state.inventory.some(i=>i.count>0))a.push('drop_item');
    return a;
  }

  applyDecision(agent:NpcRuntime,d:DecisionResponse) {
    agent.lastDecision=d;
    this.applyStateShift(agent,d.stateShift);
    agent.state.currentAction=d.action;
    const task:ActionTask={action:d.action,targetNpcId:d.targetNpcId,targetObjectId:d.targetObjectId,intent:d.socialIntent||'smalltalk',startedAt:now()};
    agent.task=task;
    const commitmentMs=7000+d.commitment*2500; agent.nextDecisionAt=now()+commitmentMs+Math.random()*3500;
    if(d.action==='idle'){agent.task=undefined;agent.nextDecisionAt=now()+2500+Math.random()*2500;return;}
    if(d.action==='wander'){const target=this.randomPassableNear(agent.state.position,8);agent.path=this.findPath(agent.state.position,target);agent.task=undefined;return;}
    if(d.action==='talk'){
      if(d.targetNpcId==='player'){
        // A decision may return after the user has switched to god mode. Never allow stale player targeting through.
        if(this.cameraMode!=='firstPerson'){
          const target=this.closestNpc(agent);
          if(!target){agent.task=undefined;agent.state.currentAction='idle';agent.nextDecisionAt=now()+1200;return;}
          task.targetNpcId=target.state.id;agent.path=this.findPath(agent.state.position,target.state.position);return;
        }
        task.targetNpcId='player';agent.path=this.findPath(agent.state.position,this.playerPosition);return;
      }
      const target=this.npcs.get(d.targetNpcId||'')||this.closestNpc(agent); if(!target){agent.task=undefined;return;} task.targetNpcId=target.state.id;agent.path=this.findPath(agent.state.position,target.state.position);return;
    }
    if(d.action==='drop_item'){this.dropNpcItem(agent);agent.task=undefined;return;}
    if(d.action==='eat' && agent.state.inventory.some(i=>['apple','bread'].includes(i.kind)&&i.count>0)){this.npcEat(agent);agent.task=undefined;return;}
    const obj=this.objectForAction(agent,d.action,d.targetObjectId); if(!obj){agent.task=undefined;agent.nextDecisionAt=now()+2500;return;} task.targetObjectId=obj.state.id;agent.path=this.findPath(agent.state.position,obj.state.position);
  }

  applyStateShift(agent:NpcRuntime,shift:DecisionResponse['stateShift']) {
    const n=agent.state;
    const moodUp:Record<Mood,Mood>={happy:'happy',calm:'happy',neutral:'calm',sad:'neutral',annoyed:'neutral',curious:'happy',tired:'calm'};
    const moodDown:Record<Mood,Mood>={happy:'calm',calm:'neutral',neutral:'annoyed',sad:'sad',annoyed:'annoyed',curious:'neutral',tired:'sad'};
    if(shift==='mood_up')n.mood=moodUp[n.mood];
    if(shift==='mood_down')n.mood=moodDown[n.mood];
    if(shift==='social_seek'){n.social=clamp(n.social-4,0,100);n.goal='找人交流，缓解社交需求';}
    if(shift==='social_withdraw'){n.social=clamp(n.social+2,0,100);n.goal='暂时独处，减少社交活动';}
    if(shift==='energy_conserve')n.goal='保存体力，优先休息';
    if(shift==='goal_intensify')n.goal=`专注于当前目标：${n.goal}`;
  }

  objectForAction(agent:NpcRuntime,action:DecisionAction,id?:string) {
    const chosen=id?this.objects.get(id):undefined;
    const valid=(o:RuntimeObject)=>o.mesh.visible&&(
      action==='work'? (o.state.id===agent.state.workAt || o.state.tags.includes(agent.state.role) || (!agent.state.workAt && o.state.tags.includes('work'))):
      action==='rest'? ['bed','bench'].includes(o.state.kind):
      action==='eat'? o.state.kind==='food_stall':
      action==='pickup'? o.state.pickupable:
      action==='use_object'? o.state.usable:
      action==='inspect'? true:false);
    if(chosen&&valid(chosen))return chosen;
    return [...this.objects.values()].filter(valid).sort((a,b)=>dist(agent.state.position,a.state.position)-dist(agent.state.position,b.state.position))[0];
  }

  completeTask(agent:NpcRuntime) {
    const task=agent.task;if(!task)return;
    if(task.action==='talk'){
      if(task.targetNpcId==='player'){
        if(this.cameraMode!=='firstPerson'){
          agent.task=undefined;agent.path=[];agent.pathIndex=0;agent.state.currentAction='idle';agent.nextDecisionAt=now()+900+Math.random()*900;return;
        }
        const pp=this.playerPosition; if(dist(agent.state.position,pp)>2.2){agent.path=this.findPath(agent.state.position,pp);return;}
        this.npcTalkPlayerAuto(agent,task.intent||'smalltalk'); agent.task=undefined; return;
      }
      const other=this.npcs.get(task.targetNpcId||''); if(other&&dist(agent.state.position,other.state.position)>2.2){agent.path=this.findPath(agent.state.position,other.state.position);return;}
      if(other)this.npcConversation(agent,other,task.intent||'smalltalk'); agent.task=undefined;return;
    }
    const obj=task.targetObjectId?this.objects.get(task.targetObjectId):undefined;
    if(obj&&dist(agent.state.position,obj.state.position)>2.3){agent.path=this.findPath(agent.state.position,obj.state.position);return;}
    switch(task.action){
      case 'work': agent.state.money+=2;agent.state.energy=clamp(agent.state.energy-5,0,100);agent.state.hunger=clamp(agent.state.hunger+4,0,100);this.event(`${agent.state.name} 完成了一轮工作。`);break;
      case 'rest': agent.state.energy=clamp(agent.state.energy+24,0,100);agent.state.mood=agent.state.mood==='tired'?'calm':agent.state.mood;this.say(agent,'休息一下，感觉好多了。');break;
      case 'eat': this.npcEat(agent);break;
      case 'pickup': if(obj)this.pickupForNpc(agent,obj);break;
      case 'use_object': if(obj)this.useObjectNpc(agent,obj);break;
      case 'inspect': if(obj)this.say(agent,`这里是${obj.state.name}。`);break;
    }
    agent.task=undefined;
  }

  npcEat(agent:NpcRuntime) {
    const food=agent.state.inventory.find(i=>['apple','bread'].includes(i.kind)&&i.count>0);
    if(food){food.count--;agent.state.hunger=clamp(agent.state.hunger-(food.kind==='bread'?38:25),0,100);this.say(agent,food.kind==='bread'?'面包还不错。':'这个苹果挺甜。');return;}
    if(agent.state.money>=2){agent.state.money-=2;agent.state.hunger=clamp(agent.state.hunger-35,0,100);this.say(agent,'总算吃上东西了。');}
  }

  pickupForNpc(agent:NpcRuntime,obj:RuntimeObject) {
    if(!obj.state.pickupable||!obj.state.item)return; this.addInventory(agent.state.inventory,obj.state.item,1);obj.state.pickupable=false;obj.state.respawnAt=Date.now()+45_000;obj.mesh.visible=false;this.event(`${agent.state.name} 拾取了 ${obj.state.name}。`);
  }

  useObjectNpc(agent:NpcRuntime,obj:RuntimeObject) {
    if(obj.state.kind==='well'){agent.state.mood=agent.state.mood==='annoyed'?'neutral':agent.state.mood;this.say(agent,'井水很凉。');}
    else if(obj.state.kind==='bench'||obj.state.kind==='bed'){agent.state.energy=clamp(agent.state.energy+12,0,100);}
    else if(obj.state.kind==='food_stall')this.npcEat(agent);
    else if(obj.state.kind==='tree'&&obj.state.item)this.pickupForNpc(agent,obj);
    else this.say(agent,`我用了${obj.state.name}。`);
  }

  dropNpcItem(agent:NpcRuntime) {
    const item=agent.state.inventory.find(i=>i.count>0);if(!item)return;item.count--;
    const id=`drop_${agent.state.id}_${Date.now()}`; const p={x:agent.state.position.x+.7,z:agent.state.position.z+.4};
    this.addObject({id,kind:'dropped_item',name:`掉落的${this.itemName(item.kind)}`,position:p,tags:['dropped',item.kind],usable:false,pickupable:true,item:item.kind});
    this.event(`${agent.state.name} 放下了 ${this.itemName(item.kind)}。`);
  }

  async npcConversation(a:NpcRuntime,b:NpcRuntime,intent:SocialIntent) {
    a.state.social=clamp(a.state.social+15,0,100);b.state.social=clamp(b.state.social+9,0,100);
    const req:DialogueRequest={speaker:this.actor(a,b),listener:this.actor(b,a),situation:`${a.state.name} 主动与 ${b.state.name} 在小镇中交谈。`,intent,world:{gameTime:this.gameTimeText(),weather:this.weather,nearbyTags:this.nearbyTags(a.state.position)},recentLines:[a.state.lastDialogue,b.state.lastDialogue].filter(Boolean) as string[]};
    try{const r=await fetch('/api/dialogue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});const d=await r.json() as DialogueResponse;this.say(a,d.text);a.state.lastDialogue=d.text;this.applyRelation(a,b,d.relationEffect);this.remember(a,`与${b.state.name}交谈：${d.text}`,2);this.log(`${a.state.name} 对 ${b.state.name}：${d.text} [${d.source}]`);}catch{this.say(a,'嗨。');}
  }

  actor(a:NpcRuntime,b?:NpcRuntime) {return {id:a.state.id,name:a.state.name,role:a.state.role,mood:a.state.mood,relationship:b?a.state.relationships[b.state.id]:undefined};}
  applyRelation(a:NpcRuntime,b:NpcRuntime,effect:DialogueResponse['relationEffect']){const r=a.state.relationships[b.state.id]??{affinity:50,trust:50,familiarity:20};const d=effect==='positive'?3:effect==='negative'?-3:0;r.affinity=clamp(r.affinity+d,0,100);r.trust=clamp(r.trust+(effect==='positive'?1:effect==='negative'?-1:0),0,100);r.familiarity=clamp(r.familiarity+2,0,100);a.state.relationships[b.state.id]=r;}
  remember(a:NpcRuntime,summary:string,importance:number){a.state.memories.push({id:crypto.randomUUID(),at:Date.now(),summary,importance});if(a.state.memories.length>24)a.state.memories.splice(0,a.state.memories.length-24);}

  closestNpc(agent:NpcRuntime){return [...this.npcs.values()].filter(x=>x!==agent).sort((a,b)=>dist(agent.state.position,a.state.position)-dist(agent.state.position,b.state.position))[0];}
  nearbyTags(p:Vec2){return [...this.objects.values()].filter(o=>o.mesh.visible&&dist(p,o.state.position)<6).flatMap(o=>o.state.tags).slice(0,12);}

  interact() {
    if(!this.hoverEntity)return;
    if(this.hoverEntity.type==='npc'){const n=this.npcs.get(this.hoverEntity.id);if(n)this.playerTalk(n);}
    else {const o=this.objects.get(this.hoverEntity.id);if(o)this.playerUse(o);}
  }

  async npcTalkPlayerAuto(n:NpcRuntime,intent:SocialIntent) {
    if(this.cameraMode!=='firstPerson')return;
    const dialogueEpoch=this.perceptionEpoch;
    const req:DialogueRequest={speaker:{id:n.state.id,name:n.state.name,role:n.state.role,mood:n.state.mood,relationship:n.state.relationships.player},listener:{id:'player',name:'玩家',role:'visitor',mood:'neutral'},situation:`${n.state.name} 主动走到玩家附近并开始交谈。`,intent,world:{gameTime:this.gameTimeText(),weather:this.weather,nearbyTags:this.nearbyTags(n.state.position)},recentLines:[n.state.lastDialogue].filter(Boolean) as string[]};
    try{const r=await fetch('/api/dialogue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});const d=await r.json() as DialogueResponse;if(dialogueEpoch!==this.perceptionEpoch||this.cameraMode!=='firstPerson')return;this.say(n,d.text);n.state.lastDialogue=d.text;n.state.social=clamp(n.state.social+12,0,100);const rel=n.state.relationships.player??{affinity:50,trust:50,familiarity:5};const delta=d.relationEffect==='positive'?3:d.relationEffect==='negative'?-3:0;rel.affinity=clamp(rel.affinity+delta,0,100);rel.familiarity=clamp(rel.familiarity+2,0,100);n.state.relationships.player=rel;this.remember(n,`我主动和玩家交谈：${d.text}`,2);this.log(`${n.state.name} 主动对玩家：${d.text} [${d.source}]`);}catch{if(dialogueEpoch===this.perceptionEpoch&&this.cameraMode==='firstPerson')this.say(n,'嗨。');}
  }

  async playerTalk(n:NpcRuntime) {
    if(this.cameraMode!=='firstPerson')return;
    const dialogueEpoch=this.perceptionEpoch;
    const req:DialogueRequest={speaker:{id:n.state.id,name:n.state.name,role:n.state.role,mood:n.state.mood},listener:{id:'player',name:'玩家',role:'visitor',mood:'neutral'},situation:'玩家主动走近 NPC 并开始交谈。',intent:'greet',world:{gameTime:this.gameTimeText(),weather:this.weather,nearbyTags:this.nearbyTags(n.state.position)},recentLines:[n.state.lastDialogue].filter(Boolean) as string[]};
    try{const r=await fetch('/api/dialogue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});const d=await r.json() as DialogueResponse;if(dialogueEpoch!==this.perceptionEpoch||this.cameraMode!=='firstPerson')return;this.say(n,d.text);n.state.lastDialogue=d.text;n.state.social=clamp(n.state.social+8,0,100);this.remember(n,`玩家来和我说话：${d.text}`,2);this.log(`${n.state.name} 对玩家：${d.text} [${d.source}]`);}catch{if(dialogueEpoch===this.perceptionEpoch&&this.cameraMode==='firstPerson')this.say(n,'你好。');}
  }

  playerUse(o:RuntimeObject) {
    if(this.cameraMode!=='firstPerson')return;
    if(o.state.pickupable&&o.state.item){this.playerInventory[o.state.item]++;o.state.pickupable=false;o.state.respawnAt=Date.now()+45_000;o.mesh.visible=false;this.toast(`获得：${this.itemName(o.state.item)}`);this.event(`玩家拾取了 ${o.state.name}。`);return;}
    if(o.state.kind==='food_stall'&&this.playerInventory.coin>=2){this.playerInventory.coin-=2;this.playerInventory.bread++;this.toast('购买：面包 -2 coin');return;}
    this.toast(`${o.state.name}：${o.state.tags.join(' / ')}`);
  }

  pickEntity(pointer:THREE.Vector2,maxDistance:number) {
    this.raycaster.setFromCamera(pointer,this.camera);
    const targets:THREE.Object3D[]=[...[...this.npcs.values()].map(n=>n.mesh), ...[...this.objects.values()].filter(o=>o.mesh.visible).map(o=>o.mesh)];
    const hits=this.raycaster.intersectObjects(targets,true).filter(h=>h.distance<=maxDistance);
    for(const h of hits){let o:THREE.Object3D|null=h.object;while(o&&!o.userData.entityType)o=o.parent;if(o?.userData.entityType==='npc'||o?.userData.entityType==='object')return {type:o.userData.entityType as 'npc'|'object',id:String(o.userData.entityId)};}
    return undefined;
  }

  updateRaycast() {
    const pointer=this.cameraMode==='god'?this.godPointer:new THREE.Vector2(0,0);
    this.hoverEntity=this.pickEntity(pointer,this.cameraMode==='god'?Infinity:3.2);
    if(this.cameraMode==='god'){
      if(!this.hoverEntity){ui.prompt.textContent='';return;}
      const name=this.hoverEntity.type==='npc'?this.npcs.get(this.hoverEntity.id)?.state.name:this.objects.get(this.hoverEntity.id)?.state.name;
      ui.prompt.textContent=`点击查看 ${name||''} · 双击/F 聚焦`;return;
    }
    if(!this.hoverEntity){ui.prompt.textContent='';return;}
    if(this.hoverEntity.type==='npc'){const n=this.npcs.get(this.hoverEntity.id)!;ui.prompt.textContent=`[E] 与 ${n.state.name} 交谈`;}
    else {const o=this.objects.get(this.hoverEntity.id)!;ui.prompt.textContent=o.state.pickupable?`[E] 拾取 ${o.state.name}`:`[E] 互动 ${o.state.name}`;}
  }

  updateUi() {
    ui.clock.textContent=`第 ${this.day} 天 · ${this.gameTimeText()} · ${this.weather==='clear'?'晴':this.weather==='cloudy'?'多云':'雨'}`;
    ui.inv.textContent=this.cameraMode==='god'?'观察者模式 · 玩家实体未进入 NPC 世界':`背包  🍎${this.playerInventory.apple}  🍞${this.playerInventory.bread}  🪵${this.playerInventory.wood}  ◉${this.playerInventory.coin}`;
    const entity=this.cameraMode==='god'?(this.selectedEntity||this.hoverEntity):this.hoverEntity;
    if(entity?.type==='npc'){
      const a=this.npcs.get(entity.id)!;const n=a.state;const d=a.lastDecision;
      const target=d?.targetNpcId?this.npcs.get(d.targetNpcId)?.state.name||d.targetNpcId:d?.targetObjectId?this.objects.get(d.targetObjectId)?.state.name||d.targetObjectId:'—';
      const inv=n.inventory.filter(x=>x.count>0).map(x=>`${this.itemName(x.kind)}×${x.count}`).join('、')||'空';
      const memories=n.memories.slice(-3).reverse().map(m=>`<div class="memory">• ${this.escape(m.summary)}</div>`).join('')||'<span>暂无显著记忆</span>';
      ui.npc.classList.remove('hidden');ui.npc.innerHTML=`<div class="npc-head"><b>${this.escape(n.name)}</b><span>${n.role}</span></div><div>心情 ${n.mood} · 饥饿 ${n.hunger.toFixed(0)} · 精力 ${n.energy.toFixed(0)} · 社交 ${n.social.toFixed(0)}</div><div>当前行为 <b>${n.currentAction}</b> · 金钱 ${n.money}</div><div>背包 ${inv}</div><div class="npc-goal">${this.escape(n.goal)}</div>${d?`<div class="decision"><b>最近决策</b> ${d.action} → ${this.escape(String(target))}<br>${d.source.toUpperCase()} · confidence ${(d.confidence*100).toFixed(0)}% · ${d.stateShift}${d.socialIntent?` · ${d.socialIntent}`:''}<br><span>${this.escape(d.reasonCode)}</span></div>`:'<div class="decision"><span>等待首次决策…</span></div>'}<div class="memories"><b>短期记忆</b>${memories}</div>`;
    } else if(entity?.type==='object'){
      const o=this.objects.get(entity.id)!.state;ui.npc.classList.remove('hidden');ui.npc.innerHTML=`<div class="npc-head"><b>${this.escape(o.name)}</b><span>${o.kind}</span></div><div>位置 ${o.position.x.toFixed(1)}, ${o.position.z.toFixed(1)}</div><div>标签 ${o.tags.map(x=>this.escape(x)).join(' / ')}</div><div>可使用 ${o.usable?'是':'否'} · 可拾取 ${o.pickupable?'是':'否'}</div>${o.item?`<div>物品 ${this.itemName(o.item)}</div>`:''}`;
    } else ui.npc.classList.add('hidden');
    ui.log.innerHTML=this.logs.slice(-7).map(x=>`<div>${this.escape(x)}</div>`).join('');
  }

  updateSpeech() {
    const v=new THREE.Vector3();
    for(const a of this.npcs.values()){
      v.set(a.mesh.position.x,2.9,a.mesh.position.z).project(this.camera);
      const visible=v.z<=1&&v.z>=-1&&Math.abs(v.x)<1.15&&Math.abs(v.y)<1.15;
      if(this.cameraMode==='god'&&visible){a.nameEl.classList.remove('hidden');a.nameEl.textContent=`${a.state.name} · ${a.state.currentAction}`;a.nameEl.style.left=`${(v.x*.5+.5)*innerWidth}px`;a.nameEl.style.top=`${(-v.y*.5+.5)*innerHeight}px`;}else a.nameEl.classList.add('hidden');
      const s=a.speech;if(!s||now()>s.until||!visible){a.speechEl.classList.add('hidden');continue;}
      a.speechEl.classList.remove('hidden');a.speechEl.textContent=s.text;a.speechEl.style.left=`${(v.x*.5+.5)*innerWidth}px`;a.speechEl.style.top=`${(-v.y*.5+.5)*innerHeight-20}px`;
    }
  }

  updateSelectionVisuals() {
    if(this.cameraMode!=='god'||!this.selectedEntity){this.selectionRing.visible=false;this.pathLine.visible=false;return;}
    const p=this.entityPosition(this.selectedEntity);if(!p){this.selectionRing.visible=false;this.pathLine.visible=false;return;}
    this.selectionRing.visible=true;this.selectionRing.position.set(p.x,.04,p.z);
    if(this.selectedEntity.type==='npc'){
      const a=this.npcs.get(this.selectedEntity.id)!;const remaining=a.path.slice(a.pathIndex);
      if(remaining.length){const pts=[new THREE.Vector3(a.mesh.position.x,.09,a.mesh.position.z),...remaining.map(x=>new THREE.Vector3(x.x,.09,x.z))];this.pathLine.geometry.dispose();this.pathLine.geometry=new THREE.BufferGeometry().setFromPoints(pts);this.pathLine.visible=true;}else this.pathLine.visible=false;
    }else this.pathLine.visible=false;
  }

  async refreshHealth(){this.lastHealthPoll=now();try{const r=await fetch('/api/health');const j=await r.json();const d=j.decision||{};const s=d.status||{};this.decisionProvider=String(d.active||'unknown');this.decisionCalls=Number(s.calls||0);const local=this.decisionProvider==='fallback';const configured=s.configured!==false;ui.decision.textContent=local?'Fallback · 本地规则':configured?`${this.decisionProvider.toUpperCase()} · calls ${this.decisionCalls} · ${s.lastLatencyMs||0}ms`:`${this.decisionProvider.toUpperCase()} 未配置 · 安全回退`;const endpoint=s.endpoint?` · endpoint ${this.escape(String(s.endpoint))}`:'';const limiter=s.limiter?`<br><b>限流</b> ${s.limiter.usedLastMinute||0}/${s.limiter.max||'∞'} calls/min`:'';ui.adminStatus.innerHTML=`<b>Decision provider</b> ${this.escape(this.decisionProvider)}${endpoint}<br><b>调用</b> ${s.calls||0} · failures ${s.failures||0}${s.inputTokens!==undefined?` · input tokens ${s.inputTokens}`:''}<br><b>语料</b> ${j.dialogue?.total||0} 条（完整 ${j.dialogue?.lines||0} / 片段 ${j.dialogue?.fragments||0}）${limiter}`;}catch{ui.decision.textContent='后端离线';}}

  gameTimeText(){const h=Math.floor(this.minuteOfDay/60)%24,m=Math.floor(this.minuteOfDay%60);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  say(a:NpcRuntime,text:string){a.speech={text,until:now()+Math.max(3500,Math.min(9000,text.length*220))};}
  event(text:string){this.recentEvents.push(`${this.gameTimeText()} ${text}`);if(this.recentEvents.length>30)this.recentEvents.shift();}
  log(text:string){this.logs.push(text);if(this.logs.length>80)this.logs.shift();}
  toast(text:string){ui.toast.textContent=text;ui.toast.classList.add('show');setTimeout(()=>ui.toast.classList.remove('show'),2200);}
  addInventory(inv:NpcState['inventory'],kind:ItemKind,count:number){const x=inv.find(i=>i.kind===kind);if(x)x.count+=count;else inv.push({kind,count});}
  itemName(k:ItemKind){return ({apple:'苹果',bread:'面包',wood:'木料',coin:'硬币',flower:'花'} as Record<ItemKind,string>)[k];}
  escape(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));}

  randomPassableNear(p:Vec2,radius:number):Vec2 {for(let i=0;i<60;i++){const x=Math.round(clamp(p.x+(Math.random()*2-1)*radius,-HALF+1,HALF-1)),z=Math.round(clamp(p.z+(Math.random()*2-1)*radius,-HALF+1,HALF-1));if(!this.blocked.has(keyOf(x,z)))return{x,z};}return{x:p.x,z:p.z};}

  findPath(start:Vec2,end:Vec2):Vec2[] {
    const s={x:Math.round(start.x),z:Math.round(start.z)},g={x:Math.round(end.x),z:Math.round(end.z)};
    const passable=(x:number,z:number)=>Math.abs(x)<HALF&&Math.abs(z)<HALF&&(!this.blocked.has(keyOf(x,z))||(x===g.x&&z===g.z));
    const open=[s],came=new Map<string,string>(),cost=new Map<string,number>([[keyOf(s.x,s.z),0]]);const goalKey=keyOf(g.x,g.z);let found=false;
    while(open.length&&cost.size<1800){open.sort((a,b)=>(cost.get(keyOf(a.x,a.z))!+Math.abs(a.x-g.x)+Math.abs(a.z-g.z))-(cost.get(keyOf(b.x,b.z))!+Math.abs(b.x-g.x)+Math.abs(b.z-g.z)));const cur=open.shift()!;const ck=keyOf(cur.x,cur.z);if(ck===goalKey){found=true;break;}for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cur.x+dx,nz=cur.z+dz,nk=keyOf(nx,nz);if(!passable(nx,nz))continue;const nc=cost.get(ck)!+1;if(nc<(cost.get(nk)??Infinity)){cost.set(nk,nc);came.set(nk,ck);open.push({x:nx,z:nz});}}}
    if(!found)return[];const rev:Vec2[]=[];let k=goalKey;while(k!==keyOf(s.x,s.z)){const [x,z]=k.split(',').map(Number);rev.push({x,z});const prev=came.get(k);if(!prev)break;k=prev;}return rev.reverse();
  }
}

new TownGame();
