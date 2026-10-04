export function readOvenInspection() {
  const matches=document.querySelectorAll<HTMLElement>('#worldStatus');
  if(matches.length!==1)throw new Error('Oven observation requires exactly one worldStatus');
  const data=matches[0].dataset;
  if(!data||!data.playerX?.trim()||!data.playerZ?.trim())throw new Error('Oven position data is missing');
  const x=Number(data.playerX),z=Number(data.playerZ);
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Oven position data is not finite');
  return {
    assetFailures:data.assetFailures,
    persistenceConflict:data.persistenceConflict,
    ovens:JSON.parse(data.bakingOvens??'[]'),
    position:{x,z}
  };
}

export function readOvenMenu() {
  const titles=document.querySelectorAll('#interactionTitle');
  if(titles.length!==1)throw new Error('Oven menu requires exactly one interactionTitle');
  return {
    title:(titles[0].textContent??'').replace(/[\u200b\u00ad]/g,'').trim().replace(/\s+/g,' '),
    actions:document.querySelectorAll('#interactionActions button').length
  };
}
