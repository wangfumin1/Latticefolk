/** Translate leaf labels in place; never replace a form, input or its listeners. */
export function refreshLocaleText(root:ParentNode,translate:(key:string)=>string):void {
  for(const element of root.querySelectorAll<HTMLElement>('[data-i18n]')){
    const key=element.dataset.i18n;
    if(key)element.textContent=translate(key);
  }
}
