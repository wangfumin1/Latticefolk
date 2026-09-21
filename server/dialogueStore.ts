import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DialogueEntry, FragmentSlot, ImportDialogueRequest, SocialIntent } from '../src/types.js';

const VALID_INTENTS = new Set<SocialIntent>([
  'greet','smalltalk','ask_help','offer_help','trade','joke','praise','complain','share_news','leave'
]);
const VALID_SLOTS = new Set<FragmentSlot>(['opener','body','closer']);

function uniq(values: string[]) {
  return [...new Set(values.map(v => v.trim()).filter(Boolean))];
}

function normalize(entry: Partial<DialogueEntry> & { text: string }): DialogueEntry {
  const kind = entry.kind === 'fragment' ? 'fragment' : 'line';
  const slot = kind === 'fragment' && entry.slot && VALID_SLOTS.has(entry.slot) ? entry.slot : undefined;
  const intents = (entry.intents ?? []).filter((x): x is SocialIntent => VALID_INTENTS.has(x as SocialIntent));
  return {
    id: entry.id || crypto.randomUUID(),
    locale: String(entry.locale || 'zh-CN'),
    kind,
    slot,
    text: String(entry.text ?? '').trim(),
    tags: uniq(entry.tags ?? []),
    intents,
    moods: uniq(entry.moods ?? []),
    roles: uniq(entry.roles ?? []),
    weight: typeof entry.weight === 'number' && Number.isFinite(entry.weight) ? Math.max(0.05, entry.weight) : 1,
  };
}

const SEED: DialogueEntry[] = [
  ['line','早啊。今天的风闻起来像是个适合干活的日子。',['greet','morning'],['greet'],['calm','happy'],[],1],
  ['line','你也出来走走？这条路再往东就是集市。',['greet','town'],['greet','smalltalk'],['neutral','happy'],[],1],
  ['line','刚才井边可热闹了，大家都在聊今天的收成。',['news','well'],['share_news','smalltalk'],['neutral','curious'],[],1],
  ['line','我现在有点忙，等把手头这件事做完再聊。',['busy','work'],['leave','smalltalk'],['tired','neutral'],[],1],
  ['line','能搭把手吗？我正缺个人把这些东西送过去。',['help','work'],['ask_help'],['neutral','tired'],[],1],
  ['line','需要我帮忙就说，反正我现在也不赶时间。',['help'],['offer_help'],['calm','happy'],[],1],
  ['line','这个价格已经很实在了，再便宜我可要亏本。',['trade','market'],['trade'],['neutral','annoyed'],['shopkeeper'],1],
  ['line','面包刚出炉，趁热吃最好。',['food','bread'],['trade','smalltalk'],['happy','calm'],['baker'],1],
  ['line','地里今天比昨天湿，看来昨晚那阵雨没白下。',['farm','weather'],['smalltalk','share_news'],['calm','neutral'],['farmer'],1],
  ['line','巡逻没发现什么异常，镇上今天挺安稳。',['guard','safety'],['share_news','smalltalk'],['calm','neutral'],['guard'],1],
  ['line','你做的这个东西挺有意思，比我预想得还结实。',['maker','praise'],['praise','smalltalk'],['happy','curious'],['maker'],1],
  ['line','我今天状态不太好，想一个人安静一会儿。',['tired','alone'],['leave','complain'],['sad','tired'],[],1],
  ['line','这事听着有点离谱，但我承认，确实挺好笑。',['joke'],['joke','smalltalk'],['happy'],[],1],
  ['line','你最近总来这边，已经快比本地人还熟路了。',['familiar'],['smalltalk','greet'],['happy','calm'],[],1],
  ['line','天色不早了，我准备回去歇会儿。',['evening','rest'],['leave'],['tired','calm'],[],1],
  ['line','下雨天路滑，走路别太急。',['weather','rain'],['smalltalk','offer_help'],['calm'],[],1],
  ['line','今天太阳挺好，连人的心情都跟着亮一点。',['weather','clear'],['smalltalk'],['happy'],[],1],
  ['line','我饿得脑子都转不动了，先去找点吃的。',['hungry','food'],['leave','complain'],['tired','annoyed'],[],1],
  ['line','坐一会儿吧。小镇又不会跑掉。',['bench','rest'],['smalltalk','offer_help'],['calm'],[],1],
  ['line','那边的箱子里好像还有些木料，做东西应该用得上。',['crate','wood'],['share_news','offer_help'],['neutral','curious'],[],1],
].map(([kind,text,tags,intents,moods,roles,weight]) => normalize({kind: kind as 'line', text: text as string, tags: tags as string[], intents: intents as SocialIntent[], moods: moods as string[], roles: roles as string[], weight: weight as number}));

const fragmentRows: Array<[FragmentSlot,string,string[],SocialIntent[],string[]]> = [
  ['opener','嗯，',['soft'],['smalltalk','greet'],['calm','neutral']],
  ['opener','嘿，',['casual'],['greet','joke'],['happy','neutral']],
  ['opener','说起来，',['topic'],['smalltalk','share_news'],['neutral','curious']],
  ['opener','要我说，',['opinion'],['smalltalk','complain'],['neutral','annoyed']],
  ['opener','对了，',['topic'],['smalltalk','share_news','ask_help'],['neutral','curious']],
  ['body','今天镇上比平时热闹一些',['town'],['smalltalk','share_news'],['happy','neutral']],
  ['body','我刚把手里的活做完',['work'],['smalltalk'],['calm','tired']],
  ['body','我正准备去找点吃的',['hungry','food'],['smalltalk','leave'],['tired','neutral']],
  ['body','井边刚才有人提到一个新消息',['well','news'],['share_news'],['curious','neutral']],
  ['body','这天气很适合在外面多待一会儿',['weather'],['smalltalk'],['happy','calm']],
  ['body','我觉得你刚才处理得挺不错',['praise'],['praise'],['happy']],
  ['body','这件事多少让我有点不痛快',['complain'],['complain'],['annoyed','sad']],
  ['body','如果你愿意，可以顺手帮我一下',['help'],['ask_help'],['neutral']],
  ['body','有需要的话我可以一起处理',['help'],['offer_help'],['calm','happy']],
  ['body','这个东西我可以跟你换',['trade'],['trade'],['neutral']],
  ['closer','。',['neutral'],['smalltalk','greet','share_news','praise','complain'],['neutral','calm','happy','sad','annoyed']],
  ['closer','，你觉得呢？',['question'],['smalltalk','share_news'],['curious','neutral']],
  ['closer','，回头再聊。',['leave'],['leave','smalltalk'],['neutral','tired']],
  ['closer','，别太勉强自己。',['care'],['offer_help'],['calm','happy']],
];
for (const [slot,text,tags,intents,moods] of fragmentRows) {
  SEED.push(normalize({kind:'fragment', slot, text, tags, intents, moods, roles:[], weight:1}));
}

export class DialogueStore {
  private entries: DialogueEntry[] = [];
  private byKind = new Map<string, DialogueEntry[]>();
  private byTag = new Map<string, DialogueEntry[]>();

  constructor(private readonly file: string) {
    this.load();
  }

  private load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const supplementalFile=path.join(path.dirname(this.file),'dialogue-seed.multilingual.jsonl');
    const supplemental:DialogueEntry[]=[];
    if(fs.existsSync(supplementalFile)){
      for(const row of fs.readFileSync(supplementalFile,'utf8').split(/\r?\n/).filter(Boolean)){
        try{
          const parsed=JSON.parse(row) as DialogueEntry;
          if(parsed.text?.trim())supplemental.push(normalize(parsed));
        }catch{}
      }
    }

    if (!fs.existsSync(this.file) || fs.statSync(this.file).size === 0) {
      fs.writeFileSync(this.file, [...SEED,...supplemental].map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    }
    const rows = fs.readFileSync(this.file, 'utf8').split(/\r?\n/).filter(Boolean);
    this.entries = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row) as DialogueEntry;
        if (parsed.text?.trim()) this.entries.push(normalize(parsed));
      } catch {
        // Ignore malformed historical rows; imports validate before append.
      }
    }

    const ids=new Set(this.entries.map(x=>x.id));
    const missing=supplemental.filter(x=>!ids.has(x.id));
    if(missing.length){
      fs.appendFileSync(this.file,missing.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
      this.entries.push(...missing);
    }
    this.reindex();
  }

  private reindex() {
    this.byKind.clear(); this.byTag.clear();
    for (const e of this.entries) {
      const kindKey = e.kind === 'fragment' ? `fragment:${e.slot ?? 'body'}` : 'line';
      const arr = this.byKind.get(kindKey) ?? [];
      arr.push(e); this.byKind.set(kindKey, arr);
      for (const tag of [...e.tags, ...e.intents, ...e.moods, ...e.roles, `locale:${e.locale||'zh-CN'}`]) {
        const key = tag.toLowerCase();
        const tagged = this.byTag.get(key) ?? [];
        tagged.push(e); this.byTag.set(key, tagged);
      }
    }
  }

  stats() {
    return {
      total: this.entries.length,
      lines: this.byKind.get('line')?.length ?? 0,
      fragments: this.entries.filter(e => e.kind === 'fragment').length,
      tags: this.byTag.size,
      locales: Object.fromEntries([...new Set(this.entries.map(x=>x.locale||'zh-CN'))].sort().map(locale=>[locale,this.entries.filter(x=>(x.locale||'zh-CN')===locale).length])),
    };
  }

  retrieve(opts: { kind: 'line' | 'fragment'; slot?: FragmentSlot; tags: string[]; intent?: SocialIntent; mood?: string; role?: string; locale?: string; limit?: number; excludeText?: string[] }) {
    const key = opts.kind === 'fragment' ? `fragment:${opts.slot ?? 'body'}` : 'line';
    const all = this.byKind.get(key) ?? [];
    if (!all.length) return [];
    const requestedLocale=opts.locale||'zh-CN';
    const localized=all.filter(e=>(e.locale||'zh-CN')===requestedLocale);
    const english=all.filter(e=>(e.locale||'zh-CN')==='en');
    const base=localized.length?localized:(english.length?english:all);
    if(!base.length)return [];
    const wanted = uniq([...opts.tags, opts.intent ?? '', opts.mood ?? '', opts.role ?? '']).map(x => x.toLowerCase());
    const excluded = new Set(opts.excludeText ?? []);
    // Large-corpus path: retrieve from tag indexes first instead of scoring the whole file.
    // Untagged imports are sampled as backfill so they can still surface.
    const pool = new Set<DialogueEntry>();
    for (const tag of wanted) for (const e of this.byTag.get(tag) ?? []) if (base.includes(e) && (e.kind === opts.kind) && (opts.kind !== 'fragment' || e.slot === (opts.slot ?? 'body'))) pool.add(e);
    const desiredPool = Math.max((opts.limit ?? 32) * 8, 128);
    if (pool.size < desiredPool) {
      const stride = Math.max(1, Math.floor(base.length / Math.max(1, desiredPool - pool.size)));
      const offset = base.length ? Math.floor(Math.random() * Math.min(stride, base.length)) : 0;
      for (let i = offset; i < base.length && pool.size < desiredPool; i += stride) pool.add(base[i]);
    }
    const scored = [...pool].filter(e => !excluded.has(e.text)).map(e => {
      const labels = new Set([...e.tags, ...e.intents, ...e.moods, ...e.roles].map(x => x.toLowerCase()));
      let score = e.weight;
      for (const w of wanted) if (labels.has(w)) score += 4;
      if (opts.intent && e.intents.includes(opts.intent)) score += 7;
      if (opts.mood && e.moods.includes(opts.mood)) score += 3;
      if (opts.role && e.roles.includes(opts.role)) score += 3;
      score += Math.random() * 0.35;
      return { e, score };
    });
    scored.sort((a,b) => b.score - a.score);
    return scored.slice(0, opts.limit ?? 32).map(x => x.e);
  }

  import(payload: ImportDialogueRequest) {
    const parsed: DialogueEntry[] = [];
    if (payload.format === 'plain') {
      const lines = payload.text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      for (const line of lines) {
        // Optional compact form: fragment:opener<TAB>tag1,tag2<TAB>text
        const parts = line.split('\t');
        if (parts.length >= 3 && (parts[0] === 'line' || parts[0].startsWith('fragment:'))) {
          const [kindToken, tagToken, ...textParts] = parts;
          const text = textParts.join('\t').trim();
          if (!text) continue;
          if (kindToken.startsWith('fragment:')) {
            const slot = kindToken.split(':')[1] as FragmentSlot;
            parsed.push(normalize({ kind:'fragment', locale:payload.locale||'zh-CN', slot: VALID_SLOTS.has(slot) ? slot : 'body', text, tags: tagToken.split(','), intents:[], moods:[], roles:[], weight:1 }));
          } else {
            parsed.push(normalize({ kind:'line', locale:payload.locale||'zh-CN', text, tags: tagToken.split(','), intents:[], moods:[], roles:[], weight:1 }));
          }
        } else {
          parsed.push(normalize({ kind:'line', locale:payload.locale||'zh-CN', text: line, tags:[], intents:[], moods:[], roles:[], weight:1 }));
        }
      }
    } else if (payload.format === 'json') {
      const data = JSON.parse(payload.text) as unknown;
      if (!Array.isArray(data)) throw new Error('JSON 必须是 DialogueEntry 数组');
      for (const row of data) {
        if (row && typeof row === 'object' && typeof (row as any).text === 'string') parsed.push(normalize({...(row as any),locale:(row as any).locale||payload.locale||'zh-CN'}));
      }
    } else {
      for (const row of payload.text.split(/\r?\n/).filter(Boolean)) {
        const data = JSON.parse(row) as any;
        if (data && typeof data.text === 'string') parsed.push(normalize({...data,locale:data.locale||payload.locale||'zh-CN'}));
      }
    }

    const clean = parsed.filter(x => x.text.length > 0 && x.text.length <= 500);
    if (!clean.length) return { imported: 0, ...this.stats() };
    fs.appendFileSync(this.file, clean.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    this.entries.push(...clean);
    this.reindex();
    return { imported: clean.length, ...this.stats() };
  }
}
