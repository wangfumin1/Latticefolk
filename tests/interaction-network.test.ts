import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { computeWildlifeInteractionNetwork } from '../src/world/interactionNetwork.js';
import { computeWildlifeDiseasePressure, computeWildlifeNicheCompetition, ensureWildlifePopulations } from '../src/world/ecology.js';

const base=(id:string,cx:number):CoarseChunkState=>({
  id,cx,cz:0,biome:'plains',settlementLevel:0,population:0,food:70,wood:60,water:75,ecology:82,danger:12,prosperity:20,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
});

test('coarse ecology retains full competition and disease pair decompositions',()=>{
  const chunk=base('chunk_pairs',0);
  const populations=ensureWildlifePopulations(chunk);
  for(const pop of populations){
    pop.count=Math.max(1,pop.carryingCapacity*.5);
    pop.diseaseLoad=pop.species==='fox'?30:2;
  }
  const competition=computeWildlifeNicheCompetition(chunk,populations);
  const disease=computeWildlifeDiseasePressure(chunk,populations,'clear');

  assert.ok((competition.pairs?.length||0)>=15);
  assert.equal(disease.pairs?.length,30);
  assert.ok(disease.pairs?.some(pair=>pair.fromSpecies==='fox'&&pair.toSpecies==='rabbit'));
  assert.ok(competition.pairs?.some(pair=>
    (pair.speciesA==='rabbit'&&pair.speciesB==='deer')||(pair.speciesA==='deer'&&pair.speciesB==='rabbit')
  ));
});

test('interaction network aggregates directed and symmetric edges with legacy-safe coverage',()=>{
  const a=base('chunk_a',0);
  const b=base('chunk_b',1);

  a.wildlife=[
    {species:'rabbit',count:10,carryingCapacity:20,health:80},
    {species:'deer',count:5,carryingCapacity:10,health:80},
    {species:'fox',count:2,carryingCapacity:4,health:80},
    {species:'wolf',count:1,carryingCapacity:2,health:80}
  ];
  b.wildlife=[
    {species:'rabbit',count:6,carryingCapacity:20,health:80},
    {species:'deer',count:3,carryingCapacity:10,health:80},
    {species:'fox',count:1,carryingCapacity:4,health:80},
    {species:'wolf',count:0,carryingCapacity:2,health:80}
  ];

  a.wildlifePredatorPressure={
    speciesPressure:{rabbit:60,deer:0,boar:0,goat:0,fox:0,wolf:0},meanPressure:10,
    pairs:[
      {predatorSpecies:'fox',preySpecies:'rabbit',pressure:40},
      {predatorSpecies:'wolf',preySpecies:'rabbit',pressure:20}
    ],
    strongestPair:{predatorSpecies:'fox',preySpecies:'rabbit',pressure:40}
  };
  b.wildlifePredatorPressure={
    speciesPressure:{rabbit:30,deer:0,boar:0,goat:0,fox:0,wolf:0},meanPressure:5,
    pairs:[{predatorSpecies:'fox',preySpecies:'rabbit',pressure:20}],
    strongestPair:{predatorSpecies:'fox',preySpecies:'rabbit',pressure:20}
  };

  a.nicheCompetition={
    speciesPressure:{rabbit:30,deer:30,boar:0,goat:0,fox:0,wolf:0},meanPressure:10,
    pairs:[{speciesA:'rabbit',speciesB:'deer',nicheOverlap:.5,pressure:30}],
    strongestPair:{speciesA:'rabbit',speciesB:'deer',nicheOverlap:.5,pressure:30}
  };
  b.nicheCompetition={
    speciesPressure:{rabbit:10,deer:10,boar:0,goat:0,fox:0,wolf:0},meanPressure:4,
    pairs:[{speciesA:'rabbit',speciesB:'deer',nicheOverlap:.5,pressure:10}],
    strongestPair:{speciesA:'rabbit',speciesB:'deer',nicheOverlap:.5,pressure:10}
  };

  a.wildlifeDisease={
    environmentalPressure:0,
    speciesPressure:{rabbit:12,deer:0,boar:0,goat:0,fox:0,wolf:0},
    localContactPressure:{rabbit:0,deer:0,boar:0,goat:0,fox:0,wolf:0},
    crossSpeciesPressure:{rabbit:12,deer:0,boar:0,goat:0,fox:0,wolf:0},
    importedPressure:{rabbit:0,deer:0,boar:0,goat:0,fox:0,wolf:0},
    meanPressure:2,
    pairs:[{fromSpecies:'fox',toSpecies:'rabbit',pressure:12}],
    strongestPair:{fromSpecies:'fox',toSpecies:'rabbit',pressure:12}
  };
  // Legacy disease state: strongest pair exists but full decomposition is unknown.
  b.wildlifeDisease={
    environmentalPressure:0,
    speciesPressure:{rabbit:6,deer:0,boar:0,goat:0,fox:0,wolf:0},
    localContactPressure:{rabbit:0,deer:0,boar:0,goat:0,fox:0,wolf:0},
    crossSpeciesPressure:{rabbit:6,deer:0,boar:0,goat:0,fox:0,wolf:0},
    importedPressure:{rabbit:0,deer:0,boar:0,goat:0,fox:0,wolf:0},
    meanPressure:1,
    strongestPair:{fromSpecies:'fox',toSpecies:'rabbit',pressure:6}
  };

  const network=computeWildlifeInteractionNetwork([a,b]);
  assert.deepEqual(network.coverage,{predation:2,competition:2,disease:1});

  const foxRabbitPredation=network.edges.find(edge=>edge.kind==='predation'&&edge.fromSpecies==='fox'&&edge.toSpecies==='rabbit')!;
  assert.equal(foxRabbitPredation.directed,true);
  assert.equal(foxRabbitPredation.meanPressure,30);
  assert.equal(foxRabbitPredation.maxPressure,40);
  assert.equal(foxRabbitPredation.activeChunks,2);

  const wolfRabbitPredation=network.edges.find(edge=>edge.kind==='predation'&&edge.fromSpecies==='wolf'&&edge.toSpecies==='rabbit')!;
  assert.equal(wolfRabbitPredation.meanPressure,10,'missing pair inside a covered chunk contributes zero');
  assert.equal(wolfRabbitPredation.activeChunks,1);

  const competition=network.edges.find(edge=>edge.kind==='competition'&&
    ((edge.fromSpecies==='rabbit'&&edge.toSpecies==='deer')||(edge.fromSpecies==='deer'&&edge.toSpecies==='rabbit')))!;
  assert.equal(competition.directed,false);
  assert.equal(competition.meanPressure,20);

  const disease=network.edges.find(edge=>edge.kind==='disease'&&edge.fromSpecies==='fox'&&edge.toSpecies==='rabbit')!;
  assert.equal(disease.meanPressure,12,'legacy chunk without pairs does not enter disease coverage');

  const rabbit=network.nodes.find(node=>node.species==='rabbit')!;
  assert.equal(rabbit.population,16);
  assert.equal(rabbit.predationIncoming,40);
  assert.equal(rabbit.competitionPressure,20);
  assert.equal(rabbit.diseaseIncoming,12);

  const fox=network.nodes.find(node=>node.species==='fox')!;
  assert.equal(fox.population,3);
  assert.equal(fox.predationOutgoing,30);
  assert.equal(fox.diseaseOutgoing,12);
  assert.equal(fox.activeInteractionKinds,2);
});
