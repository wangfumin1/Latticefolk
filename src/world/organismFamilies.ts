import type { WildlifeOrganismFamily, WildlifeOrganismGenome, WildlifeOrganismLocomotion, WildlifeSpecies } from '../types.js';
import { wildlifeSpeciesProfile } from './wildlifeSpecies.js';

type Range=readonly [number,number];
type PlantAxis='grass'|'shrub'|'fruit'|'crop';
interface FamilyTemplate {
  family:WildlifeOrganismFamily;
  material:{hueShift:Range;lightnessShift:Range;accentShift:Range};
  niche:Record<PlantAxis,Range>;
  locomotion:{stride:Range;endurance:Range};
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const unit=(key:string)=>{let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;};
const value=(r:Range,key:string)=>r[0]+(r[1]-r[0])*unit(key);
const inherit=(a:number,b:number,key:string,r:Range,m:number)=>clamp((a+b)/2+(unit(key)-.5)*2*m,r[0],r[1]);

export const ORGANISM_FAMILY_TEMPLATES:Record<WildlifeOrganismFamily,FamilyTemplate>={
  lagomorph:{family:'lagomorph',material:{hueShift:[-.035,.035],lightnessShift:[-.07,.07],accentShift:[-.025,.025]},niche:{grass:[.90,1.12],shrub:[.90,1.12],fruit:[1,1],crop:[.90,1.10]},locomotion:{stride:[.90,1.12],endurance:[.90,1.10]}},
  cervid:{family:'cervid',material:{hueShift:[-.025,.025],lightnessShift:[-.06,.06],accentShift:[-.02,.02]},niche:{grass:[.90,1.10],shrub:[.90,1.12],fruit:[.90,1.12],crop:[1,1]},locomotion:{stride:[.92,1.10],endurance:[.92,1.10]}},
  suiform:{family:'suiform',material:{hueShift:[-.025,.025],lightnessShift:[-.06,.06],accentShift:[-.02,.02]},niche:{grass:[1,1],shrub:[.90,1.10],fruit:[.90,1.12],crop:[.90,1.12]},locomotion:{stride:[.90,1.08],endurance:[.94,1.12]}},
  caprine:{family:'caprine',material:{hueShift:[-.03,.03],lightnessShift:[-.08,.08],accentShift:[-.025,.025]},niche:{grass:[.90,1.12],shrub:[.90,1.12],fruit:[.92,1.08],crop:[.94,1.06]},locomotion:{stride:[.92,1.12],endurance:[.94,1.12]}},
  canid:{family:'canid',material:{hueShift:[-.04,.04],lightnessShift:[-.07,.07],accentShift:[-.03,.03]},niche:{grass:[1,1],shrub:[1,1],fruit:[1,1],crop:[1,1]},locomotion:{stride:[.92,1.12],endurance:[.92,1.12]}},
  mustelid:{family:'mustelid',material:{hueShift:[-.025,.025],lightnessShift:[-.065,.065],accentShift:[-.02,.02]},niche:{grass:[.94,1.06],shrub:[.88,1.14],fruit:[.88,1.14],crop:[.90,1.10]},locomotion:{stride:[.90,1.08],endurance:[.96,1.14]}},
  felid:{family:'felid',material:{hueShift:[-.03,.03],lightnessShift:[-.075,.075],accentShift:[-.025,.025]},niche:{grass:[1,1],shrub:[1,1],fruit:[1,1],crop:[1,1]},locomotion:{stride:[.94,1.12],endurance:[.92,1.10]}},
  bovid:{family:'bovid',material:{hueShift:[-.025,.025],lightnessShift:[-.06,.06],accentShift:[-.02,.02]},niche:{grass:[.90,1.10],shrub:[.92,1.08],fruit:[1,1],crop:[.96,1.04]},locomotion:{stride:[.90,1.06],endurance:[.98,1.14]}},
  procyonid:{family:'procyonid',material:{hueShift:[-.02,.02],lightnessShift:[-.08,.08],accentShift:[-.025,.025]},niche:{grass:[.96,1.04],shrub:[.90,1.10],fruit:[.86,1.16],crop:[.90,1.10]},locomotion:{stride:[.94,1.08],endurance:[.94,1.10]}}
};
export const wildlifeOrganismFamily=(species:WildlifeSpecies)=>wildlifeSpeciesProfile(species).organismFamily;
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

export function inheritWildlifeOrganismGenome(
  species:WildlifeSpecies,
  mother:WildlifeOrganismGenome,
  father:WildlifeOrganismGenome,
  seed:string
):WildlifeOrganismGenome {
  const t=templateFor(species);
  const a=normalizeWildlifeOrganismGenome(species,mother,seed+':mother');
  const b=normalizeWildlifeOrganismGenome(species,father,seed+':father');
  return {family:t.family,
    material:{
      hueShift:inherit(a.material.hueShift,b.material.hueShift,seed+':mh',t.material.hueShift,.008),
      lightnessShift:inherit(a.material.lightnessShift,b.material.lightnessShift,seed+':ml',t.material.lightnessShift,.012),
      accentShift:inherit(a.material.accentShift,b.material.accentShift,seed+':ma',t.material.accentShift,.006)
    },
    niche:{
      grass:inherit(a.niche.grass,b.niche.grass,seed+':ng',t.niche.grass,.025),
      shrub:inherit(a.niche.shrub,b.niche.shrub,seed+':ns',t.niche.shrub,.025),
      fruit:inherit(a.niche.fruit,b.niche.fruit,seed+':nf',t.niche.fruit,.025),
      crop:inherit(a.niche.crop,b.niche.crop,seed+':nc',t.niche.crop,.025)
    },
    locomotion:{
      stride:inherit(a.locomotion.stride,b.locomotion.stride,seed+':ls',t.locomotion.stride,.025),
      endurance:inherit(a.locomotion.endurance,b.locomotion.endurance,seed+':le',t.locomotion.endurance,.025)
    }
  };
}

export function wildlifeOrganismLocomotion(genome:WildlifeOrganismGenome):WildlifeOrganismLocomotion {
  const stride=genome.locomotion.stride-1;
  const endurance=genome.locomotion.endurance-1;
  return {
    speedMultiplier:clamp(1+stride*.28-endurance*.07,.94,1.06),
    energyMultiplier:clamp(1+Math.max(0,stride)*.12-endurance*.30,.92,1.08)
  };
}

function adjustedPlantWeights(base:Record<PlantAxis,number>,genome:WildlifeOrganismGenome):Record<PlantAxis,number> {
  const axes:PlantAxis[]=['grass','shrub','fruit','crop'];
  const raw={} as Record<PlantAxis,number>;
  let total=0;
  for(const axis of axes){raw[axis]=base[axis]>0?base[axis]*genome.niche[axis]:0;total+=raw[axis];}
  const baseTotal=axes.reduce((sum,axis)=>sum+base[axis],0);
  if(total<=0||baseTotal<=0)return {...base};
  const scale=baseTotal/total;
  for(const axis of axes)raw[axis]*=scale;
  return raw;
}
export const wildlifeGenomePlantForageWeights=(species:WildlifeSpecies,genome:WildlifeOrganismGenome)=>
  adjustedPlantWeights(wildlifeSpeciesProfile(species).plantForageWeights,genome);
export const wildlifeGenomePlantConsumptionWeights=(species:WildlifeSpecies,genome:WildlifeOrganismGenome)=>
  adjustedPlantWeights(wildlifeSpeciesProfile(species).plantConsumptionWeights,genome);

export function wildlifeResourceNicheScore(species:WildlifeSpecies,genome:WildlifeOrganismGenome,tags:readonly string[],distance:number) {
  const profile=wildlifeSpeciesProfile(species);
  if(!tags.some(tag=>profile.forageTags.includes(tag)))return 0;
  const w=wildlifeGenomePlantForageWeights(species,genome);
  let preference=1;
  if(tags.includes('grass'))preference+=w.grass;
  if(tags.includes('forage')||tags.includes('flower')||tags.includes('nature'))preference+=w.shrub*.7;
  if(tags.includes('apple')||tags.includes('fruit'))preference+=w.fruit;
  if(tags.includes('farm')||tags.includes('crop')||tags.includes('grain'))preference+=w.crop;
  return preference/(1+Math.max(0,distance)*.08);
}

