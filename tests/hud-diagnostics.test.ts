import test from 'node:test';
import assert from 'node:assert/strict';
import { appendHudLog, visibleHudLogs, type HudLogEntry } from '../src/ui/hudDiagnostics.js';

test('first-person HUD preserves player save errors and dialogue after eight developer messages',()=>{
  const errors=['世界存档加载失败','世界自动保存失败：reload required','最终存档未进入浏览器发送队列'];
  const entries:HudLogEntry[]=[...errors.map(text=>({text,audience:'player' as const})),
    {text:'莲 对玩家：你好',audience:'player'},
    ...Array.from({length:8},(_,i)=>({text:`decision ${i}`,audience:'developer' as const}))];
  const original=JSON.stringify(entries);
  assert.deepEqual(visibleHudLogs(entries,'firstPerson',false).map(entry=>entry.text),[...errors,'莲 对玩家：你好']);
  assert.equal(JSON.stringify(entries),original);
});

test('console and God view retain the original last-seven ordering and return to player filtering',()=>{
  const entries:HudLogEntry[]=Array.from({length:15},(_,i)=>({text:String(i),audience:i%3===0?'player':'developer'}));
  const all=entries.slice(-7);
  assert.deepEqual(visibleHudLogs(entries,'firstPerson',true),all);
  assert.deepEqual(visibleHudLogs(entries,'god',false),all);
  assert.deepEqual(visibleHudLogs(entries,'god',true),all);
  assert.deepEqual(visibleHudLogs(entries,'firstPerson',false),entries.filter(entry=>entry.audience==='player').slice(-7));
});

test('empty or developer-only player histories produce no empty log panel content',()=>{
  assert.deepEqual(visibleHudLogs([],'firstPerson',false),[]);
  assert.deepEqual(visibleHudLogs([{text:'decision',audience:'developer'}],'firstPerson',false),[]);
});

test('player log window stays bounded without dropping the latest player message behind telemetry',()=>{
  const entries:HudLogEntry[]=Array.from({length:12},(_,i)=>({text:`player ${i}`,audience:'player'}));
  entries.push({text:'telemetry',audience:'developer'});
  assert.deepEqual(visibleHudLogs(entries,'firstPerson',false).map(entry=>entry.text),Array.from({length:7},(_,i)=>`player ${i+5}`));
});

test('an autosave error survives more than the entire developer log capacity',()=>{
  const entries:HudLogEntry[]=[];
  appendHudLog(entries,'世界自动保存失败：reload required');
  for(let i=0;i<200;i++)appendHudLog(entries,`decision ${i}`,'developer');
  assert.equal(entries.length,80);
  assert.deepEqual(visibleHudLogs(entries,'firstPerson',false),[{text:'世界自动保存失败：reload required',audience:'player'}]);
  assert.deepEqual(visibleHudLogs(entries,'god',false).map(entry=>entry.text),Array.from({length:7},(_,i)=>`decision ${i+193}`));
});

test('bounded mixed histories preserve each audience window and the global newest seven',()=>{
  const entries:HudLogEntry[]=[],history:HudLogEntry[]=[];
  let seed=7316;
  for(let i=0;i<2000;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const audience=(seed%100)<(i%500<250?3:97)?'player':'developer';
    const text=`entry ${i}`;
    history.push({text,audience});appendHudLog(entries,text,audience);
    assert.ok(entries.length<=80);
    assert.deepEqual(visibleHudLogs(entries,'firstPerson',false),history.filter(entry=>entry.audience==='player').slice(-7));
    assert.deepEqual(visibleHudLogs(entries,'god',false),history.slice(-7));
    assert.deepEqual(visibleHudLogs(entries,'firstPerson',true),history.slice(-7));
    assert.deepEqual(entries.filter(entry=>entry.audience==='developer').slice(-7),history.filter(entry=>entry.audience==='developer').slice(-7));
  }
});
