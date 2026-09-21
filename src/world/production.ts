import type { InventoryItem, ItemKind, NpcRole } from '../types';

export interface ProductionRecipe {
  id: string;
  name: string;
  workstationTags: string[];
  preferredRoles: NpcRole[];
  inputs: Partial<Record<ItemKind,number>>;
  outputs: Partial<Record<ItemKind,number>>;
}

export interface CraftResult {
  ok: boolean;
  recipe?: ProductionRecipe;
  missing?: ItemKind[];
}

export const RECIPES:ProductionRecipe[]=[
  {
    id:'mill_flour',name:'研磨面粉',workstationTags:['mill'],preferredRoles:['farmer','baker'],
    inputs:{grain:2},outputs:{flour:2}
  },
  {
    id:'bake_bread',name:'烘烤面包',workstationTags:['baker','oven'],preferredRoles:['baker'],
    inputs:{flour:1,water:1},outputs:{bread:2}
  },
  {
    id:'saw_planks',name:'加工木板',workstationTags:['maker','sawmill'],preferredRoles:['maker'],
    inputs:{wood:1},outputs:{plank:2}
  },
  {
    id:'forge_tool',name:'制作工具',workstationTags:['maker','workshop'],preferredRoles:['maker'],
    inputs:{plank:1,stone:1},outputs:{tool:1}
  }
];

const count=(inventory:InventoryItem[],kind:ItemKind)=>inventory.find(x=>x.kind===kind)?.count||0;
const add=(inventory:InventoryItem[],kind:ItemKind,amount:number)=>{
  const slot=inventory.find(x=>x.kind===kind);
  if(slot)slot.count+=amount;else inventory.push({kind,count:amount});
};

export function recipesForTags(tags:string[]) {
  return RECIPES.filter(recipe=>recipe.workstationTags.some(tag=>tags.includes(tag)));
}

export function missingInputs(inventory:InventoryItem[],recipe:ProductionRecipe) {
  return (Object.entries(recipe.inputs) as Array<[ItemKind,number]>)
    .filter(([kind,amount])=>count(inventory,kind)<amount)
    .map(([kind])=>kind);
}

export function canCraft(inventory:InventoryItem[],recipe:ProductionRecipe) {
  return missingInputs(inventory,recipe).length===0;
}

export function craftRecipe(inventory:InventoryItem[],recipe:ProductionRecipe):CraftResult {
  const missing=missingInputs(inventory,recipe);
  if(missing.length)return {ok:false,recipe,missing};

  for(const [kind,amount] of Object.entries(recipe.inputs) as Array<[ItemKind,number]>){
    const slot=inventory.find(x=>x.kind===kind)!;
    slot.count-=amount;
  }
  for(const [kind,amount] of Object.entries(recipe.outputs) as Array<[ItemKind,number]>){
    add(inventory,kind,amount);
  }
  return {ok:true,recipe};
}

export function craftAtWorkstation(tags:string[],inventory:InventoryItem[],role?:NpcRole):CraftResult {
  const recipes=recipesForTags(tags);
  if(!recipes.length)return {ok:false};
  const ordered=[...recipes].sort((a,b)=>{
    const ap=role&&a.preferredRoles.includes(role)?1:0;
    const bp=role&&b.preferredRoles.includes(role)?1:0;
    const ac=canCraft(inventory,a)?1:0;
    const bc=canCraft(inventory,b)?1:0;
    return (bc*10+bp)-(ac*10+ap);
  });
  const executable=ordered.find(recipe=>canCraft(inventory,recipe));
  if(executable)return craftRecipe(inventory,executable);
  const preferred=ordered[0]!;
  return {ok:false,recipe:preferred,missing:missingInputs(inventory,preferred)};
}
