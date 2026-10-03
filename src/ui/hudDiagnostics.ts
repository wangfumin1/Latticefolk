export type HudLogAudience='player'|'developer';
export interface HudLogEntry {text:string;audience:HudLogAudience}

/** Keep the existing 80-entry cap while protecting each audience's visible
 * seven-row history from a burst of messages for the other audience. */
export function appendHudLog(entries:HudLogEntry[],text:string,audience:HudLogAudience='player'):void {
  entries.push({text,audience});
  if(entries.length<=80)return;
  const oldestAudience=entries[0].audience;
  const count=entries.reduce((total,entry)=>total+Number(entry.audience===oldestAudience),0);
  const index=count>7?0:entries.findIndex(entry=>entry.audience!==oldestAudience);
  entries.splice(index,1);
}

/** Player messages are the default at call sites, so new errors cannot silently
 * disappear. Filter before applying the existing seven-row presentation bound. */
export function visibleHudLogs(
  entries:readonly HudLogEntry[],
  cameraMode:'firstPerson'|'god',
  consoleOpen:boolean
):readonly HudLogEntry[] {
  const visible=cameraMode==='god'||consoleOpen
    ?entries
    :entries.filter(entry=>entry.audience!=='developer');
  return visible.slice(-7);
}
