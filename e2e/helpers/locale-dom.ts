/** Read-only references retained in a Playwright JSHandle, never on the game. */
export function captureLocaleDom(actionIndex=-1) {
  const status=document.querySelector<HTMLElement>('#worldStatus');
  return {
    canvas:document.querySelector('#game canvas'),
    buttons:[...document.querySelectorAll('#interactionActions button')],
    actionIndex,
    position:{x:status?.dataset.playerX,z:status?.dataset.playerZ}
  };
}

/** One coherent DOM sample per poll, avoiding a renderer round-trip per field. */
export function readLocaleDom(reference:ReturnType<typeof captureLocaleDom>) {
  const status=document.querySelector<HTMLElement>('#worldStatus');
  const menu=document.querySelector<HTMLElement>('#interactionMenu');
  const buttons=[...document.querySelectorAll('#interactionActions button')];
  return {
    lang:document.documentElement.lang,
    modeHint:document.querySelector('#modeHint')?.textContent,
    mode:status?.dataset.cameraMode,
    playerBody:status?.dataset.playerBodyPresent,
    discovered:Number(status?.dataset.discoveredChunks??'NaN'),
    materialized:Number(status?.dataset.materializedChunks??'NaN'),
    sameCanvas:reference.canvas!==null&&reference.canvas===document.querySelector('#game canvas'),
    menuOpen:menu!==null&&!/hidden/.test(menu.className),
    sameButtons:buttons.length===reference.buttons.length&&buttons.every((button,index)=>button===reference.buttons[index]),
    actionText:buttons[reference.actionIndex]?.textContent,
    samePosition:reference.position.x!==undefined&&reference.position.z!==undefined&&
      reference.position.x===status?.dataset.playerX&&reference.position.z===status?.dataset.playerZ
  };
}
