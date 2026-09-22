import type { LocaleCode } from './types';

export const SUPPORTED_LOCALES: Array<{code:LocaleCode;label:string}> = [
  {code:'zh-CN',label:'简体中文'},
  {code:'en',label:'English'},
  {code:'ja',label:'日本語'},
  {code:'es',label:'Español'},
];

type Dict=Record<string,string>;

const zh:Dict={
  'brand':'LATTICEFOLK // 活着的小镇',
  'mode.god':'G · 上帝视角','mode.first':'第一人称','mode.observer':'观察者模式',
  'console.title':'Town Console','console.close':'Tab 关闭','console.importFormat':'批量导入格式',
  'console.import':'导入语料','console.pause':'暂停 NPC AI','console.resume':'恢复 NPC AI',
  'console.plain':'纯文本 / TSV','console.jsonl':'JSONL','console.json':'JSON 数组',
  'start.title':'Latticefolk','start.enter':'进入小镇',
  'start.desc':'自主 NPC 的行为、社交、环境交互、状态倾向与台词选择由可插拔决策引擎驱动；移动、碰撞与数值由确定性游戏规则执行。',
  'start.controls':'WASD + 鼠标 · E 交互 · G 上帝视角 · Tab 控制台',
  'controls.first':'第一人称：WASD 移动 · Shift 奔跑 · 鼠标视角 · E 交互',
  'controls.god':'上帝视角：G 切换 · 鼠标左键旋转 · 右键平移 · 滚轮缩放 · WASD 平移 · Q/E 旋转 · F 聚焦',
  'budget.title':'Jev Budget / 调用策略','budget.economy':'省流','budget.balanced':'平衡','budget.quality':'高质量','budget.apply':'应用预算',
  'interaction.inspect':'查看','interaction.rest':'休息','interaction.sit':'坐下','interaction.sleep':'睡觉',
  'interaction.draw_water':'打水','interaction.drink':'喝水','interaction.wash':'清洗','interaction.harvest':'收获',
  'interaction.forage':'采集','interaction.chop':'砍伐','interaction.mine':'采矿','interaction.craft':'制作',
  'interaction.work':'工作','interaction.buy':'购买','interaction.sell':'出售','interaction.trade':'交易',
  'interaction.store':'存入物品','interaction.take':'取出物品','interaction.load':'装载','interaction.unload':'卸货',
  'interaction.pickup':'拾取','interaction.visit':'拜访',
  'item.apple':'苹果','item.bread':'面包','item.wood':'木料','item.coin':'硬币','item.flower':'花',
  'item.grain':'谷物','item.flour':'面粉','item.water':'水','item.stone':'石料','item.plank':'木板','item.tool':'工具',
  'weather.clear':'晴','weather.cloudy':'多云','weather.rain':'雨',
  'prompt.talk':'[E] 与 {name} 交谈','prompt.object':'[E] {name} · {count} 项交互','prompt.wildlife':'[E] 观察 {name}',
  'wildlife.rabbit':'兔','wildlife.deer':'鹿','wildlife.boar':'野猪','wildlife.fox':'狐狸','wildlife.health':'健康','wildlife.hunger':'饥饿','wildlife.thirst':'口渴','wildlife.energy':'精力','wildlife.action':'行为','wildlife.age':'年龄','wildlife.disease':'疾病负荷',
  'season.spring':'春季','season.summer':'夏季','season.autumn':'秋季','season.winter':'冬季',
  'evolution.title':'进化观测','evolution.tracked':'谱系存活/历史','evolution.births':'出生','evolution.deaths':'死亡','evolution.lifespan':'平均寿命','evolution.reproduction':'繁殖成功率','evolution.lineage':'祖先谱系','evolution.noAncestors':'暂无已记录祖先','evolution.topLineages':'高繁殖谱系','evolution.empty':'尚无可统计的个体谱系','evolution.mortality':'死亡原因','evolution.predation':'捕食','evolution.disease':'疾病','evolution.starvation':'饥饿','evolution.dehydration':'脱水','evolution.senescence':'衰老','evolution.habitat':'环境','evolution.signal.insufficient':'样本不足','evolution.signal.weak':'弱选择信号','evolution.signal.persistent':'持续选择信号',
  'evolution.death.predation':'被捕食','evolution.death.starvation':'饥饿死亡','evolution.death.dehydration':'脱水死亡','evolution.death.disease':'疾病死亡','evolution.death.senescence':'衰老死亡','evolution.death.other':'其他死亡',
  'prompt.god':'点击查看 {name} · 双击/F 聚焦',
  'observer':'观察者模式 · 玩家实体未进入 NPC 世界',
  'dialogue.import.empty':'没有可导入内容','dialogue.import.done':'已导入 {count} 条；语料总数 {total}',
  'dialogue.import.failed':'导入失败：{error}',
  'budget.updated':'Jev 预算已更新','budget.failed':'预算更新失败：{error}',
  'backend.offline':'后端离线'
};

const en:Dict={
  'brand':'LATTICEFOLK // LIVING TOWN',
  'mode.god':'G · God View','mode.first':'First person','mode.observer':'Observer',
  'console.title':'Town Console','console.close':'Tab to close','console.importFormat':'Bulk import format',
  'console.import':'Import dialogue','console.pause':'Pause NPC AI','console.resume':'Resume NPC AI',
  'console.plain':'Plain text / TSV','console.jsonl':'JSONL','console.json':'JSON array',
  'start.title':'Latticefolk','start.enter':'Enter town',
  'start.desc':'Autonomous NPC behavior, social choices, object interaction, state tendencies, and authored dialogue selection are driven by pluggable decision engines while movement, collision, inventory, and numeric state changes stay deterministic.',
  'start.controls':'WASD + mouse · E interact · G God View · Tab console',
  'controls.first':'First person: WASD move · Shift run · mouse look · E interact',
  'controls.god':'God View: G toggle · left-drag orbit · right-drag pan · wheel zoom · WASD pan · Q/E rotate · F focus',
  'budget.title':'Jev Budget / Call policy','budget.economy':'Economy','budget.balanced':'Balanced','budget.quality':'Quality','budget.apply':'Apply budget',
  'interaction.inspect':'Inspect','interaction.rest':'Rest','interaction.sit':'Sit','interaction.sleep':'Sleep',
  'interaction.draw_water':'Draw water','interaction.drink':'Drink','interaction.wash':'Wash','interaction.harvest':'Harvest',
  'interaction.forage':'Forage','interaction.chop':'Chop','interaction.mine':'Mine','interaction.craft':'Craft',
  'interaction.work':'Work','interaction.buy':'Buy','interaction.sell':'Sell','interaction.trade':'Trade',
  'interaction.store':'Store item','interaction.take':'Take item','interaction.load':'Load','interaction.unload':'Unload',
  'interaction.pickup':'Pick up','interaction.visit':'Visit',
  'item.apple':'Apple','item.bread':'Bread','item.wood':'Wood','item.coin':'Coin','item.flower':'Flower',
  'item.grain':'Grain','item.flour':'Flour','item.water':'Water','item.stone':'Stone','item.plank':'Plank','item.tool':'Tool',
  'weather.clear':'Clear','weather.cloudy':'Cloudy','weather.rain':'Rain',
  'prompt.talk':'[E] Talk to {name}','prompt.object':'[E] {name} · {count} actions','prompt.wildlife':'[E] Observe {name}',
  'wildlife.rabbit':'Rabbit','wildlife.deer':'Deer','wildlife.boar':'Boar','wildlife.fox':'Fox','wildlife.health':'Health','wildlife.hunger':'Hunger','wildlife.thirst':'Thirst','wildlife.energy':'Energy','wildlife.action':'Action','wildlife.age':'Age','wildlife.disease':'Disease load',
  'season.spring':'Spring','season.summer':'Summer','season.autumn':'Autumn','season.winter':'Winter',
  'evolution.title':'Evolution observatory','evolution.tracked':'lineage living/history','evolution.births':'births','evolution.deaths':'deaths','evolution.lifespan':'mean lifespan','evolution.reproduction':'breeder rate','evolution.lineage':'ancestry','evolution.noAncestors':'no recorded ancestors','evolution.topLineages':'top reproductive lineages','evolution.empty':'no tracked individual lineages yet','evolution.mortality':'mortality','evolution.predation':'predation','evolution.disease':'disease','evolution.starvation':'starvation','evolution.dehydration':'dehydration','evolution.senescence':'senescence','evolution.habitat':'habitat','evolution.signal.insufficient':'insufficient data','evolution.signal.weak':'weak selection signal','evolution.signal.persistent':'persistent selection signal',
  'evolution.death.predation':'was predated','evolution.death.starvation':'died of starvation','evolution.death.dehydration':'died of dehydration','evolution.death.disease':'died of disease','evolution.death.senescence':'died of senescence','evolution.death.other':'died',
  'prompt.god':'Click to inspect {name} · double-click/F to focus',
  'observer':'Observer mode · the player entity is absent from the NPC world',
  'dialogue.import.empty':'Nothing to import','dialogue.import.done':'Imported {count}; corpus total {total}',
  'dialogue.import.failed':'Import failed: {error}',
  'budget.updated':'Jev budget updated','budget.failed':'Budget update failed: {error}',
  'backend.offline':'Backend offline'
};

const ja:Dict={
  'brand':'LATTICEFOLK // 生きている町','mode.god':'G · 神視点','mode.first':'一人称','mode.observer':'観察者',
  'console.title':'Town Console','console.close':'Tab で閉じる','console.importFormat':'一括インポート形式',
  'console.import':'台詞をインポート','console.pause':'NPC AI を停止','console.resume':'NPC AI を再開',
  'console.plain':'テキスト / TSV','console.jsonl':'JSONL','console.json':'JSON 配列',
  'start.title':'Latticefolk','start.enter':'町に入る',
  'start.desc':'NPC の行動、交流、環境操作、状態傾向、用意された台詞の選択を交換可能な意思決定エンジンが担当し、移動・衝突・所持品・数値更新は決定論的なゲーム規則が担当します。',
  'start.controls':'WASD + マウス · E 操作 · G 神視点 · Tab コンソール',
  'controls.first':'一人称：WASD 移動 · Shift 走る · マウス視点 · E 操作',
  'controls.god':'神視点：G 切替 · 左ドラッグ回転 · 右ドラッグ移動 · ホイール拡大縮小 · F フォーカス',
  'budget.title':'Jev Budget / 呼び出し方針','budget.economy':'節約','budget.balanced':'バランス','budget.quality':'高品質','budget.apply':'適用',
  'interaction.inspect':'調べる','interaction.rest':'休む','interaction.sit':'座る','interaction.sleep':'眠る',
  'interaction.draw_water':'水を汲む','interaction.drink':'飲む','interaction.wash':'洗う','interaction.harvest':'収穫',
  'interaction.forage':'採集','interaction.chop':'伐採','interaction.mine':'採掘','interaction.craft':'製作',
  'interaction.work':'働く','interaction.buy':'購入','interaction.sell':'売却','interaction.trade':'取引',
  'interaction.store':'収納','interaction.take':'取り出す','interaction.load':'積む','interaction.unload':'降ろす',
  'interaction.pickup':'拾う','interaction.visit':'訪問',
  'item.apple':'リンゴ','item.bread':'パン','item.wood':'木材','item.coin':'硬貨','item.flower':'花',
  'item.grain':'穀物','item.flour':'小麦粉','item.water':'水','item.stone':'石材','item.plank':'板材','item.tool':'道具',
  'weather.clear':'晴れ','weather.cloudy':'曇り','weather.rain':'雨',
  'prompt.talk':'[E] {name} と話す','prompt.object':'[E] {name} · {count} 操作','prompt.wildlife':'[E] {name} を観察',
  'wildlife.rabbit':'ウサギ','wildlife.deer':'シカ','wildlife.boar':'イノシシ','wildlife.fox':'キツネ','wildlife.health':'健康','wildlife.hunger':'空腹','wildlife.thirst':'渇き','wildlife.energy':'体力','wildlife.action':'行動','wildlife.age':'年齢','wildlife.disease':'疾病負荷',
  'season.spring':'春','season.summer':'夏','season.autumn':'秋','season.winter':'冬',
  'evolution.title':'進化観測','evolution.tracked':'系譜 生存/履歴','evolution.births':'出生','evolution.deaths':'死亡','evolution.lifespan':'平均寿命','evolution.reproduction':'繁殖成功率','evolution.lineage':'祖先系譜','evolution.noAncestors':'記録済み祖先なし','evolution.topLineages':'繁殖上位系譜','evolution.empty':'追跡済み系譜はまだありません','evolution.mortality':'死亡原因','evolution.predation':'捕食','evolution.disease':'疾病','evolution.starvation':'飢餓','evolution.dehydration':'脱水','evolution.senescence':'老衰','evolution.habitat':'環境','evolution.signal.insufficient':'データ不足','evolution.signal.weak':'弱い選択シグナル','evolution.signal.persistent':'持続的な選択シグナル',
  'evolution.death.predation':'捕食された','evolution.death.starvation':'餓死した','evolution.death.dehydration':'脱水で死亡した','evolution.death.disease':'病死した','evolution.death.senescence':'老衰で死亡した','evolution.death.other':'死亡した',
  'prompt.god':'クリックで {name} を確認 · ダブルクリック/F で注視',
  'observer':'観察者モード · プレイヤー実体は NPC 世界に存在しません',
  'dialogue.import.empty':'インポート内容がありません','dialogue.import.done':'{count} 件を追加；合計 {total}',
  'dialogue.import.failed':'インポート失敗：{error}','budget.updated':'Jev 予算を更新しました','budget.failed':'予算更新失敗：{error}','backend.offline':'バックエンドがオフライン'
};

const es:Dict={
  'brand':'LATTICEFOLK // PUEBLO VIVO','mode.god':'G · Vista divina','mode.first':'Primera persona','mode.observer':'Observador',
  'console.title':'Town Console','console.close':'Tab para cerrar','console.importFormat':'Formato de importación',
  'console.import':'Importar diálogos','console.pause':'Pausar IA NPC','console.resume':'Reanudar IA NPC',
  'console.plain':'Texto / TSV','console.jsonl':'JSONL','console.json':'Matriz JSON',
  'start.title':'Latticefolk','start.enter':'Entrar al pueblo',
  'start.desc':'El comportamiento, las relaciones, las interacciones con objetos, los cambios de estado y la selección de diálogos de los NPC dependen de motores de decisión intercambiables; el movimiento, las colisiones, el inventario y los valores numéricos siguen reglas deterministas.',
  'start.controls':'WASD + ratón · E interactuar · G vista divina · Tab consola',
  'controls.first':'Primera persona: WASD mover · Shift correr · ratón mirar · E interactuar',
  'controls.god':'Vista divina: G cambiar · arrastre izq. orbitar · der. desplazar · rueda zoom · F enfocar',
  'budget.title':'Jev Budget / Política de llamadas','budget.economy':'Ahorro','budget.balanced':'Equilibrado','budget.quality':'Calidad','budget.apply':'Aplicar',
  'interaction.inspect':'Examinar','interaction.rest':'Descansar','interaction.sit':'Sentarse','interaction.sleep':'Dormir',
  'interaction.draw_water':'Sacar agua','interaction.drink':'Beber','interaction.wash':'Lavarse','interaction.harvest':'Cosechar',
  'interaction.forage':'Recolectar','interaction.chop':'Talar','interaction.mine':'Extraer','interaction.craft':'Fabricar',
  'interaction.work':'Trabajar','interaction.buy':'Comprar','interaction.sell':'Vender','interaction.trade':'Comerciar',
  'interaction.store':'Guardar','interaction.take':'Sacar','interaction.load':'Cargar','interaction.unload':'Descargar',
  'interaction.pickup':'Recoger','interaction.visit':'Visitar',
  'item.apple':'Manzana','item.bread':'Pan','item.wood':'Madera','item.coin':'Moneda','item.flower':'Flor',
  'item.grain':'Grano','item.flour':'Harina','item.water':'Agua','item.stone':'Piedra','item.plank':'Tabla','item.tool':'Herramienta',
  'weather.clear':'Despejado','weather.cloudy':'Nublado','weather.rain':'Lluvia',
  'prompt.talk':'[E] Hablar con {name}','prompt.object':'[E] {name} · {count} acciones','prompt.wildlife':'[E] Observar {name}',
  'wildlife.rabbit':'Conejo','wildlife.deer':'Ciervo','wildlife.boar':'Jabalí','wildlife.fox':'Zorro','wildlife.health':'Salud','wildlife.hunger':'Hambre','wildlife.thirst':'Sed','wildlife.energy':'Energía','wildlife.action':'Acción','wildlife.age':'Edad','wildlife.disease':'Carga de enfermedad',
  'season.spring':'Primavera','season.summer':'Verano','season.autumn':'Otoño','season.winter':'Invierno',
  'evolution.title':'Observatorio evolutivo','evolution.tracked':'linaje vivos/históricos','evolution.births':'nacimientos','evolution.deaths':'muertes','evolution.lifespan':'vida media','evolution.reproduction':'éxito reproductivo','evolution.lineage':'ascendencia','evolution.noAncestors':'sin ancestros registrados','evolution.topLineages':'linajes más reproductivos','evolution.empty':'aún no hay linajes individuales registrados','evolution.mortality':'mortalidad','evolution.predation':'depredación','evolution.disease':'enfermedad','evolution.starvation':'hambre','evolution.dehydration':'deshidratación','evolution.senescence':'senescencia','evolution.habitat':'hábitat','evolution.signal.insufficient':'datos insuficientes','evolution.signal.weak':'señal selectiva débil','evolution.signal.persistent':'señal selectiva persistente',
  'evolution.death.predation':'murió por depredación','evolution.death.starvation':'murió de hambre','evolution.death.dehydration':'murió de deshidratación','evolution.death.disease':'murió por enfermedad','evolution.death.senescence':'murió por senescencia','evolution.death.other':'murió',
  'prompt.god':'Clic para ver {name} · doble clic/F para enfocar',
  'observer':'Modo observador · el jugador no existe dentro del mundo de los NPC',
  'dialogue.import.empty':'No hay contenido para importar','dialogue.import.done':'Importados {count}; total {total}',
  'dialogue.import.failed':'Error de importación: {error}','budget.updated':'Presupuesto Jev actualizado','budget.failed':'Error al actualizar presupuesto: {error}','backend.offline':'Backend desconectado'
};

const DICTS:Record<LocaleCode,Dict>={'zh-CN':zh,en,ja,es};

export function normalizeLocale(value?:string|null):LocaleCode {
  const raw=(value||'').toLowerCase();
  if(raw.startsWith('zh'))return 'zh-CN';
  if(raw.startsWith('ja'))return 'ja';
  if(raw.startsWith('es'))return 'es';
  return 'en';
}

export class I18n {
  locale:LocaleCode;
  constructor(locale?:string|null){this.locale=normalizeLocale(locale);}
  setLocale(locale:string){this.locale=normalizeLocale(locale);}
  t(key:string,vars:Record<string,string|number>={}){
    const template=DICTS[this.locale][key]??en[key]??key;
    return template.replace(/\{(\w+)\}/g,(_,name)=>String(vars[name]??`{${name}}`));
  }
}
