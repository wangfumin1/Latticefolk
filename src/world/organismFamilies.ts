import type { WildlifeOrganismFamily, WildlifeOrganismGenome, WildlifeOrganismLocomotion, WildlifeSpecies } from '../types.js';
import { wildlifeSpeciesProfile } from './wildlifeSpecies.js';

type Range=readonly [number,number];
type PlantAxis='grass'|'shrub'|'fruit'|'crop';
interface FamilyTemplate {
  family:WildlifeOrganismFamily;
  species:readonly WildlifeSpecies[];
  material:{hueShift:Range;lightnessShift:Range;accentShift:Range};
  niche:Record<PlantAxis,Range>;
  locomotion:{stride:Range;endurance:Range};
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const unit=(key:string)=>{let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;};
const value=(r:Range,key:string)=>r[0]+(r[1]-r[0])*unit(key);
const inherit=(a:number,b:number,key:string,r:Range,m:number)=>clamp((a+b)/2+(unit(key)-.5)*2*m,r[0],r[1]);

export const ORGANISM_FAMILY_TEMPLATES:Record<WildlifeOrganismFamily,FamilyTemplate>={
  lagomorph:{family:'lagomorph',species:['rabbit'],material:{hueShift:[-.035,.035],lightnessShift:[-.07,.07],accentShift:[-.025,.025]},niche:{grass:[.90,1.12],shrub:[.90,1.12],fruit:[1,1],crop:[.90,1.10]},locomotion:{stride:[.90,1.12],endurance:[.90,1.10]}},
  cervid:{family:'cervid',species:['deer'],material:{hueShift:[-.025,.025],lightnessShift:[-.06,.06],accentShift:[-.02,.02]},niche:{grass:[.90,1.10],shrub:[.90,1.12],fruit:[.90,1.12],crop:[1,1]},locomotion:{stride:[.92,1.10],endurance:[.92,1.10]}},
  suiform:{family:'suiform',species:['boar'],material:{hueShift:[-.025,.025],lightnessShift:[-.06,.06],accentShift:[-.02,.02]},niche:{grass:[1,1],shrub:[.90,1.10],fruit:[.90,1.12],crop:[.90,1.12]},locomotion:{stride:[.90,1.08],endurance:[.94,1.12]}},
  caprine:{family:'caprine',species:['goat'],material:{hueShift:[-.03,.03],lightnessShift:[-.08,.08],accentShift:[-.025,.025]},niche:{grass:[.90,1.12],shrub:[.90,1.12],fruit:[.92,1.08],crop:[.94,1.06]},locomotion:{stride:[.92,1.12],endurance:[.94,1.12]}},
  canid:{family:'canid',species:['fox','wolf'],material:{hueShift:[-.04,.04],lightnessShift:[-.07,.07],accentShift:[-.03,.03]},niche:{grass:[1,1],shrub:[1,1],fruit:[1,1],crop:[1,1]},locomotion:{stride:[.92,1.12],endurance:[.92,1.12]}},
  mustelid:{family:'mustelid',species:['badger'],material:{hueShift:[-.025,.025],lightnessShift:[-.065,.065],accentShift:[-.02,.02]},niche:{grass:[.94,1.06],shrub:[.88,1.14],fruit:[.88,1.14],crop:[.90,1.10]},locomotion:{stride:[.90,1.08],endurance:[.96,1.14]}}
};
const FAMILY_BY_SPECIES:Record<WildlifeSpecies,WildlifeOrganismFamily>={rabbit:'lagomorph',deer:'cervid',boar:'suiform',goat:'caprine',fox:'canid',wolf:'canid',badger:'mustelid'};
export const wildlifeOrganismFamily=(species:WildlifeSpecies)=>FAMILY_BY_SPECIES[species];
const templateFor=(species:WildlifeSpecies)=>ORGANISM_FAMILY_TEMPLATES[wildlifeOrganismFamily(species)];

export function founderWildlifeOrganismGenome(species:WildlifeSpecies,seed:string):WildlifeOrganismGenome {
  const t=templateFor(species);
  return {family:t.family,
    material:{hueShift:value(t.material.hueShift,seed+':mh'),lightnessShift:value(t.material.lightnessShift,seed+':ml'),accentShift:value(t.material.accentShift,seed+':ma')},
    niche:{grass:value(t.niche.grass,seed+':ng'),shrub:value(t.niche.shrub,seed+':ns'),fruit:value(t.niche.fruit,seed+':nf'),crop:value(t.niche.crop,seed+':nc')},
    locomotion:{stride:value(t.locomotion.stride,seed+':ls'),endurance:value(t.locomotion.endurance,seed+':le')}
  };
}

export function normalizeWildlifeOrganismGenome(species:WildlifeSpecies,g:WildlifeOrganismGenome|undefined,seed:string):WildlifeOrganismGenome {
  const t=templateFor(species),f=founderWildlifeOrganismGenome(species,seed);
  const bounded=(x:unknown,r:Range,d:number)=>{const n=Number(x);return clamp(Number.isFinite(n)?n:d,r[0],r[1]);};
  return {family:t.family,
    material:{hueShift:bounded(g?.material?.hueShift,t.material.hueShift,f.material.hueShift),lightnessShift:bounded(g?.material?.lightnessShift,t.material.lightnessShift,f.material.lightnessShift),accentShift:bounded(g?.material?.accentShift,t.material.accentShift,f.material.accentShift)},
    niche:{grass:bounded(g?.niche?.grass,t.niche.grass,f.niche.grass),shrub:bounded(g?.niche?.shrub,t.niche.shrub,f.niche.shrub),fruit:bounded(g?.niche?.fruit,t.niche.fruit,f.niche.fruit),crop:bounded(g?.niche?.crop,t.niche.crop,f.niche.crop)},
    locomotion:{stride:bounded(g?.locomotion?.stride,t.locomotion.stride,f.locomotion.stride),endurance:bounded(g?.locomotion?.endurance,t.locomotion.endurance,f.locomotion.endurance)}
  };
}
